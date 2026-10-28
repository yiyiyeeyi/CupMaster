import { describe, expect, it, vi } from "vitest";
import { createFullDemoFixtures } from "@/dev/demo-fixtures";
import { beanRecordSchema } from "@/domain/beans";
import type { LibraryStatePayload, PreparationRecord } from "./mappers/library-mappers";
import type { RemoteParityRepository } from "./remote-repository-contracts";
import { CloudParityMigrationGateway } from "./cloud-parity-migration-gateway";

const fixtures = createFullDemoFixtures();
const bean = beanRecordSchema.parse({ id: "bean-1", name: "Ethiopia", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", deletedAt: "2026-10-02T00:00:00.000Z" });
const preparation: PreparationRecord = { id: "prep-1", entry: null, deletedAt: "2026-10-03T00:00:00.000Z" };
const state: LibraryStatePayload = { legacyImportReviewed: true, redirects: {}, lineage: {}, deletedIds: [] };

function gateway(writeFailure = false, initialLibraryState: { entity: LibraryStatePayload; revision: number } | null = null, conflictOnce = false) {
  const writes: string[] = [];
  let storedLibraryState = initialLibraryState;
  let revisionConflict = conflictOnce;
  const parity: RemoteParityRepository = {
    listBeansForMigration: vi.fn(async () => ({ ok: true as const, value: [] })),
    writeBean: vi.fn(async (entity) => { writes.push("beans"); return writeFailure ? { ok: false as const, code: "persistence_failed" as const, message: "retry" } : { ok: true as const, value: { entity, revision: 1 } }; }),
    listPreparationsForMigration: vi.fn(async () => ({ ok: true as const, value: [] })),
    writePreparation: vi.fn(async (entity) => { writes.push("brew_preparations"); return { ok: true as const, value: { entity, revision: 1 } }; }),
    readLibraryState: vi.fn(async () => ({ ok: true as const, value: storedLibraryState })),
    writeLibraryState: vi.fn(async (entity, expectedRevision) => {
      writes.push("library_states");
      if (revisionConflict) {
        revisionConflict = false;
        storedLibraryState = { entity: { ...state, redirects: { concurrent: "device-race" } }, revision: 8 };
        return { ok: false as const, code: "revision_conflict" as const, message: "retry" };
      }
      if (expectedRevision !== undefined && expectedRevision !== storedLibraryState?.revision) return { ok: false as const, code: "revision_conflict" as const, message: "stale" };
      storedLibraryState = { entity, revision: (storedLibraryState?.revision ?? 0) + 1 };
      return { ok: true as const, value: storedLibraryState };
    }),
  };
  const brewRepository = {
    getForMigration: vi.fn(async () => ({ ok: true as const, value: { state: "missing" as const } })),
    createDraft: vi.fn(async (entity: typeof fixtures.brews[number]) => { writes.push("brews"); return { ok: true as const, value: entity }; }),
    updateIfRevision: vi.fn(),
  };
  const plans = {
    getForMigration: vi.fn(async () => ({ ok: true as const, value: { state: "missing" as const } })),
    create: vi.fn(async (entity: typeof fixtures.plans[number]) => { writes.push("suggested_plans"); return { ok: true as const, value: entity }; }),
    updateIfRevision: vi.fn(),
  };
  return { service: new CloudParityMigrationGateway(parity, brewRepository, plans), parity, brewRepository, plans, writes, getLibraryState: () => storedLibraryState };
}

describe("CloudParityMigrationGateway", () => {
  it("writes beans, preparations, brews, plans, then whitelisted library state", async () => {
    const gatewayFake = gateway();
    const brew = fixtures.brews.find((value) => value.id === "demo-brew-b-complete");
    const plan = fixtures.plans.find((value) => value.id === "demo-plan-completed");
    if (!brew || !plan) throw new Error("Missing migration fixtures");
    expect(await gatewayFake.service.writeGraph({ beans: [bean], preparations: [preparation], brews: [brew], suggestedPlans: [plan], libraryState: state })).toEqual({ ok: true, value: null, warnings: [] });
    expect(gatewayFake.writes).toEqual(["beans", "brew_preparations", "brews", "suggested_plans", "library_states"]);
  });

  it("stops after the first failed request so retry resumes safely", async () => {
    const gatewayFake = gateway(true);
    expect(await gatewayFake.service.writeGraph({ beans: [bean], preparations: [preparation], brews: [], suggestedPlans: [], libraryState: state })).toMatchObject({ ok: false, code: "persistence_failed" });
    expect(gatewayFake.writes).toEqual(["beans"]);
    expect(gatewayFake.parity.writePreparation).not.toHaveBeenCalled();
  });

  it("merges metadata from two devices, keeps cloud values for conflicting keys, and returns warnings", async () => {
    const cloudState: LibraryStatePayload = { legacyImportReviewed: false, redirects: { shared: "cloud-target", phone: "phone-target" }, lineage: { cloud: { sourceBrewId: null, appliedAdjustment: null } }, deletedIds: ["deleted-cloud"] };
    const deviceState: LibraryStatePayload = { legacyImportReviewed: true, redirects: { shared: "laptop-target", laptop: "laptop-target" }, lineage: { laptop: { sourceBrewId: "brew-laptop", appliedAdjustment: null } }, deletedIds: ["deleted-laptop", "deleted-cloud"] };
    const gatewayFake = gateway(false, { entity: cloudState, revision: 3 });
    const result = await gatewayFake.service.writeGraph({ beans: [], preparations: [], brews: [], suggestedPlans: [], libraryState: deviceState });
    expect(result).toEqual({ ok: true, value: null, warnings: ["library_state_conflict:redirects:shared"] });
    expect(gatewayFake.getLibraryState()?.entity).toEqual({
      legacyImportReviewed: true,
      redirects: { shared: "cloud-target", phone: "phone-target", laptop: "laptop-target" },
      lineage: { cloud: { sourceBrewId: null, appliedAdjustment: null }, laptop: { sourceBrewId: "brew-laptop", appliedAdjustment: null } },
      deletedIds: ["deleted-cloud", "deleted-laptop"],
    });
  });

  it("re-reads and merges once after a library state revision conflict", async () => {
    const gatewayFake = gateway(false, { entity: state, revision: 2 }, true);
    const deviceState: LibraryStatePayload = { ...state, redirects: { local: "local-target" } };
    const result = await gatewayFake.service.writeGraph({ beans: [], preparations: [], brews: [], suggestedPlans: [], libraryState: deviceState });
    expect(result).toEqual({ ok: true, value: null, warnings: [] });
    expect(gatewayFake.parity.readLibraryState).toHaveBeenCalledTimes(2);
    expect(gatewayFake.parity.writeLibraryState).toHaveBeenCalledTimes(2);
    expect(gatewayFake.getLibraryState()?.entity.redirects).toEqual({ concurrent: "device-race", local: "local-target" });
  });

  it("never revives a Bean or preparation tombstone when a device still has the active row", async () => {
    const gatewayFake = gateway();
    const activeBean = { ...bean, deletedAt: undefined };
    const brew = fixtures.brews[0];
    const activePreparation: PreparationRecord = { id: preparation.id, entry: { id: preparation.id, snapshot: brew.recipeSnapshot, plan: brew.brewPlan, sourceBrewId: null, appliedAdjustment: null, createdAt: brew.createdAt, updatedAt: brew.updatedAt }, deletedAt: null };
    vi.mocked(gatewayFake.parity.listBeansForMigration).mockResolvedValue({ ok: true, value: [{ entity: bean, revision: 4 }] });
    expect(await gatewayFake.service.writeGraph({ beans: [activeBean], preparations: [], brews: [], suggestedPlans: [], libraryState: state })).toMatchObject({ ok: false, code: "invalid_data" });
    vi.mocked(gatewayFake.parity.listBeansForMigration).mockResolvedValue({ ok: true, value: [] });
    vi.mocked(gatewayFake.parity.listPreparationsForMigration).mockResolvedValue({ ok: true, value: [{ entity: preparation, revision: 5 }] });
    expect(await gatewayFake.service.writeGraph({ beans: [], preparations: [activePreparation], brews: [], suggestedPlans: [], libraryState: state })).toMatchObject({ ok: false, code: "invalid_data" });
    expect(gatewayFake.parity.writeBean).not.toHaveBeenCalled();
    expect(gatewayFake.parity.writePreparation).not.toHaveBeenCalled();
  });
});
