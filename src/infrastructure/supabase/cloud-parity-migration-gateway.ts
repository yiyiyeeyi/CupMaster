import type { BeanRecord } from "@/domain/beans";
import type { Brew, SuggestedBrewPlan } from "@/domain";
import { buildBrewReferencePatch, sameMigrationEntity, sameParityEntity, toMigrationBaseBrew } from "@/domain";
import type { LibraryStatePayload, PreparationRecord } from "./mappers/library-mappers";
import type { RemoteBrewRepository, RemoteParityRepository, RemoteSuggestedPlanRepository } from "./remote-repository-contracts";

export interface CloudParityMigrationGraph {
  beans: readonly BeanRecord[];
  preparations: readonly PreparationRecord[];
  brews: readonly Brew[];
  suggestedPlans: readonly SuggestedBrewPlan[];
  libraryState: LibraryStatePayload;
}

export type CloudParityMigrationResult =
  | { ok: true; value: null; warnings: string[] }
  | { ok: false; code: import("./remote-repository-contracts").RemoteRepositoryErrorCode; message: string };

export function mergeLibraryStatePayload(remote: LibraryStatePayload, local: LibraryStatePayload) {
  const warnings: string[] = [];
  const mergeRecord = <T>(kind: "redirects" | "lineage", cloud: Record<string, T>, device: Record<string, T>) => {
    const merged = { ...cloud };
    for (const [key, value] of Object.entries(device)) {
      if (key in cloud && !sameParityEntity(cloud[key], value)) {
        warnings.push(`library_state_conflict:${kind}:${key}`);
      } else if (!(key in cloud)) merged[key] = value;
    }
    return merged;
  };
  return {
    payload: {
      legacyImportReviewed: remote.legacyImportReviewed || local.legacyImportReviewed,
      redirects: mergeRecord("redirects", remote.redirects, local.redirects),
      lineage: mergeRecord("lineage", remote.lineage, local.lineage),
      deletedIds: [...new Set([...remote.deletedIds, ...local.deletedIds])].sort(),
    },
    warnings,
  };
}

/**
 * PostgREST transactions are per request, so the deferrable Brew→Bean FK cannot
 * bridge calls. Keep this order explicit and stop at the first failed write.
 */
export class CloudParityMigrationGateway {
  constructor(
    private readonly parity: RemoteParityRepository,
    private readonly brews: Pick<RemoteBrewRepository, "getForMigration" | "createDraft" | "updateIfRevision">,
    private readonly plans: Pick<RemoteSuggestedPlanRepository, "getForMigration" | "create" | "updateIfRevision">,
  ) {}

  async writeGraph(graph: CloudParityMigrationGraph): Promise<CloudParityMigrationResult> {
    const existingBeans = await this.parity.listBeansForMigration();
    if (!existingBeans.ok) return existingBeans;
    for (const bean of graph.beans) {
      const existing = existingBeans.value.find((value) => value.entity.id === bean.id);
      if (existing) {
        if (existing.entity.deletedAt && !bean.deletedAt) return { ok: false, code: "invalid_data", message: "Cloud Bean cannot be safely revived." };
        if (!sameParityEntity(bean, existing.entity)) return { ok: false, code: "invalid_data", message: "Cloud Bean has conflicting content." };
        continue;
      }
      const written = await this.parity.writeBean(bean);
      if (!written.ok) return written;
    }

    const existingPreparations = await this.parity.listPreparationsForMigration();
    if (!existingPreparations.ok) return existingPreparations;
    for (const preparation of graph.preparations) {
      const existing = existingPreparations.value.find((value) => value.entity.id === preparation.id);
      if (existing) {
        if (existing.entity.deletedAt && !preparation.deletedAt) return { ok: false, code: "invalid_data", message: "Cloud preparation cannot be safely revived." };
        if (!sameParityEntity(preparation, existing.entity)) return { ok: false, code: "invalid_data", message: "Cloud preparation has conflicting content." };
        continue;
      }
      const written = await this.parity.writePreparation(preparation);
      if (!written.ok) return written;
    }

    for (const brew of graph.brews) {
      const current = await this.brews.getForMigration(brew.id);
      if (!current.ok) return current;
      if (current.value.state === "active") {
        if (sameMigrationEntity(brew, current.value.entity) || sameMigrationEntity(toMigrationBaseBrew(brew), current.value.entity)) continue;
        return { ok: false, code: "invalid_data", message: "Cloud Brew has conflicting content." };
      }
      if (current.value.state !== "missing") return { ok: false, code: "invalid_data", message: "Cloud Brew cannot be safely replaced." };
      const written = await this.brews.createDraft(toMigrationBaseBrew(brew));
      if (!written.ok) return written;
    }

    for (const plan of graph.suggestedPlans) {
      const current = await this.plans.getForMigration(plan.id);
      if (!current.ok) return current;
      if (current.value.state === "active") {
        if (sameMigrationEntity(plan, current.value.entity)) continue;
        return { ok: false, code: "invalid_data", message: "Cloud Suggested Plan has conflicting content." };
      }
      if (current.value.state !== "missing") return { ok: false, code: "invalid_data", message: "Cloud Suggested Plan cannot be safely replaced." };
      const written = await this.plans.create(plan);
      if (!written.ok) return written;
    }

    for (const brew of graph.brews.filter((item) => item.sourceSuggestedPlanId)) {
      const current = await this.brews.getForMigration(brew.id);
      if (!current.ok) return current;
      if (current.value.state !== "active") return { ok: false, code: "invalid_data", message: "Cloud Brew is missing before source references can be patched." };
      if (sameMigrationEntity(brew, current.value.entity)) continue;
      if (!sameMigrationEntity(toMigrationBaseBrew(brew), current.value.entity)) return { ok: false, code: "invalid_data", message: "Cloud Brew changed before source references could be patched." };
      const patched = await this.brews.updateIfRevision(buildBrewReferencePatch(brew, current.value.entity), current.value.revision);
      if (!patched.ok) return patched;
    }

    const currentState = await this.parity.readLibraryState();
    if (!currentState.ok) return currentState;
    const firstMerge = currentState.value ? mergeLibraryStatePayload(currentState.value.entity, graph.libraryState) : { payload: graph.libraryState, warnings: [] };
    if (currentState.value && sameParityEntity(firstMerge.payload, currentState.value.entity)) return { ok: true, value: null, warnings: firstMerge.warnings };
    let state = await this.parity.writeLibraryState(firstMerge.payload, currentState.value?.revision);
    if (!state.ok && state.code === "revision_conflict") {
      const refreshed = await this.parity.readLibraryState();
      if (!refreshed.ok) return refreshed;
      const retryMerge = refreshed.value ? mergeLibraryStatePayload(refreshed.value.entity, graph.libraryState) : { payload: graph.libraryState, warnings: [] };
      const warnings = [...new Set([...firstMerge.warnings, ...retryMerge.warnings])];
      if (refreshed.value && sameParityEntity(retryMerge.payload, refreshed.value.entity)) return { ok: true, value: null, warnings };
      state = await this.parity.writeLibraryState(retryMerge.payload, refreshed.value?.revision);
      return state.ok ? { ok: true, value: null, warnings } : state;
    }
    return state.ok ? { ok: true, value: null, warnings: firstMerge.warnings } : state;
  }
}
