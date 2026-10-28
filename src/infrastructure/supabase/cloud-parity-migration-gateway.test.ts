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

function gateway(writeFailure = false) {
  const writes: string[] = [];
  const parity: RemoteParityRepository = {
    listBeansForMigration: vi.fn(async () => ({ ok: true as const, value: [] })),
    writeBean: vi.fn(async (entity) => { writes.push("beans"); return writeFailure ? { ok: false as const, code: "persistence_failed" as const, message: "retry" } : { ok: true as const, value: { entity, revision: 1 } }; }),
    listPreparationsForMigration: vi.fn(async () => ({ ok: true as const, value: [] })),
    writePreparation: vi.fn(async (entity) => { writes.push("brew_preparations"); return { ok: true as const, value: { entity, revision: 1 } }; }),
    readLibraryState: vi.fn(async () => ({ ok: true as const, value: null })),
    writeLibraryState: vi.fn(async (entity) => { writes.push("library_states"); return { ok: true as const, value: { entity, revision: 1 } }; }),
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
  return { service: new CloudParityMigrationGateway(parity, brewRepository, plans), parity, brewRepository, plans, writes };
}

describe("CloudParityMigrationGateway", () => {
  it("writes beans, preparations, brews, plans, then whitelisted library state", async () => {
    const gatewayFake = gateway();
    const brew = fixtures.brews.find((value) => value.id === "demo-brew-b-complete");
    const plan = fixtures.plans.find((value) => value.id === "demo-plan-completed");
    if (!brew || !plan) throw new Error("Missing migration fixtures");
    expect(await gatewayFake.service.writeGraph({ beans: [bean], preparations: [preparation], brews: [brew], suggestedPlans: [plan], libraryState: state })).toEqual({ ok: true, value: null });
    expect(gatewayFake.writes).toEqual(["beans", "brew_preparations", "brews", "suggested_plans", "library_states"]);
  });

  it("stops after the first failed request so retry resumes safely", async () => {
    const gatewayFake = gateway(true);
    expect(await gatewayFake.service.writeGraph({ beans: [bean], preparations: [preparation], brews: [], suggestedPlans: [], libraryState: state })).toMatchObject({ ok: false, code: "persistence_failed" });
    expect(gatewayFake.writes).toEqual(["beans"]);
    expect(gatewayFake.parity.writePreparation).not.toHaveBeenCalled();
  });
});
