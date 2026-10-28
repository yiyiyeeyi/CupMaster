import type { BeanRecord } from "@/domain/beans";
import type { Brew, SuggestedBrewPlan } from "@/domain";
import type { LibraryStatePayload, PreparationRecord } from "./mappers/library-mappers";
import type { RemoteBrewRepository, RemoteParityRepository, RemoteSuggestedPlanRepository, RemoteResult } from "./remote-repository-contracts";

export interface CloudParityMigrationGraph {
  beans: readonly BeanRecord[];
  preparations: readonly PreparationRecord[];
  brews: readonly Brew[];
  suggestedPlans: readonly SuggestedBrewPlan[];
  libraryState: LibraryStatePayload;
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

  async writeGraph(graph: CloudParityMigrationGraph): Promise<RemoteResult<null>> {
    const existingBeans = await this.parity.listBeansForMigration();
    if (!existingBeans.ok) return existingBeans;
    const beanRevisions = new Map(existingBeans.value.map(({ entity, revision }) => [entity.id, revision]));
    for (const bean of graph.beans) {
      const written = await this.parity.writeBean(bean, beanRevisions.get(bean.id));
      if (!written.ok) return written;
    }

    const existingPreparations = await this.parity.listPreparationsForMigration();
    if (!existingPreparations.ok) return existingPreparations;
    const preparationRevisions = new Map(existingPreparations.value.map(({ entity, revision }) => [entity.id, revision]));
    for (const preparation of graph.preparations) {
      const written = await this.parity.writePreparation(preparation, preparationRevisions.get(preparation.id));
      if (!written.ok) return written;
    }

    for (const brew of graph.brews) {
      const current = await this.brews.getForMigration(brew.id);
      if (!current.ok) return current;
      const written = current.value.state === "active"
        ? await this.brews.updateIfRevision(brew, current.value.revision)
        : current.value.state === "missing"
          ? await this.brews.createDraft(brew)
          : { ok: false as const, code: "invalid_data" as const, message: "Cloud Brew cannot be safely replaced." };
      if (!written.ok) return written;
    }

    for (const plan of graph.suggestedPlans) {
      const current = await this.plans.getForMigration(plan.id);
      if (!current.ok) return current;
      const written = current.value.state === "active"
        ? await this.plans.updateIfRevision(plan, current.value.revision)
        : current.value.state === "missing"
          ? await this.plans.create(plan)
          : { ok: false as const, code: "invalid_data" as const, message: "Cloud Suggested Plan cannot be safely replaced." };
      if (!written.ok) return written;
    }

    const currentState = await this.parity.readLibraryState();
    if (!currentState.ok) return currentState;
    const state = await this.parity.writeLibraryState(graph.libraryState, currentState.value?.revision);
    return state.ok ? { ok: true, value: null } : state;
  }
}
