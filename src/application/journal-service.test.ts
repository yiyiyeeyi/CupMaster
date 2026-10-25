import { describe, expect, it } from "vitest";
import { createFullDemoFixtures } from "@/dev/demo-fixtures";
import { groupJournal, journalDateKey, journalFilter } from "@/domain/journal";
import type { BrewPreparation } from "@/domain/brew-preparation";
import { LocalBrewRepository, LOCAL_BREW_KEY } from "@/repositories/local-brew-repository";
import { LocalBrewPreparationRepository, BREW_PREPARATIONS_KEY } from "@/repositories/local-brew-preparation-repository";
import { BrewPreparationService } from "./brew-preparation-service";
import { BrewService } from "./brew-service";
import { JournalService } from "./journal-service";
import { consumeCompletedPreparation, writeBrewWithPreparationCleanup } from "./preparation-completion";

class Memory {
  data = new Map<string, string>(); failKey: string | null = null;
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { if (key === this.failKey) throw new Error("quota"); this.data.set(key, value); }
}
function setup() {
  const fixtures = createFullDemoFixtures(), storage = new Memory(), source = structuredClone(fixtures.brews[0]);
  storage.setItem(LOCAL_BREW_KEY, JSON.stringify({ version: 1, data: { brews: [source] } }));
  const brews = new LocalBrewRepository(storage), preparations = new LocalBrewPreparationRepository(storage);
  const seed: BrewPreparation = { snapshot: structuredClone(source.recipeSnapshot), plan: structuredClone(source.brewPlan), sourceBrewId: source.id, appliedAdjustment: null };
  preparations.save(seed, "prepared", "2026-10-25T00:00:00.000Z");
  let id = 0;
  const service = new BrewPreparationService(brews, preparations, () => `cup-${++id}`);
  return { fixtures, storage, source, brews, preparations, seed, service, journal: new JournalService(brews, preparations) };
}
describe("Journal", () => {
  it("pins preparations above newer completed cups, filters and groups local calendar dates", () => {
    const s = setup(), read = s.preparations.read(); if (!read.ok) throw Error(read.message);
    const completed = { ...s.source, executionStatus: "completed" as const, recordStatus: "saved" as const, completedAt: "2026-10-25T00:00:00.000Z" };
    const entry = { ...read.value.entries[0], updatedAt: "2025-12-31T16:30:00.000Z" };
    expect(journalDateKey(entry.updatedAt, "Asia/Taipei")).toBe("2026-01-01");
    expect(journalDateKey(entry.updatedAt, "America/Los_Angeles")).toBe("2025-12-31");
    expect(groupJournal([completed], [entry], "all", "Asia/Taipei").map(g => g.kind)).toEqual(["preparations", "completed"]);
    expect(groupJournal([completed], [entry], "completed")).toHaveLength(1);
    expect(groupJournal([completed], [entry], "preparations")[0].items[0].id).toBe("prepared");
    expect(groupJournal([], [], "all")).toEqual([]);
    expect(journalFilter("invalid")).toBe("all");
  });
  it("uses completion fallback, stable tie sorting and excludes inactive and legacy cups", () => {
    const { source } = setup();
    const base = { ...source, executionStatus: "completed" as const, completedAt: null, updatedAt: "2026-10-24T23:00:00.000Z" };
    const groups = groupJournal([{ ...base, id: "b" }, { ...base, id: "a" }, { ...base, id: "hidden", legacyPreparationId: "old" }, { ...base, executionStatus: "paused" }], [], "all", "Asia/Taipei");
    expect(groups).toHaveLength(1); expect(groups[0].date).toBe("2026-10-25");
    expect(groups[0].items.map(item => item.id)).toEqual(["a", "b"]);
  });
  it("keeps preparation until a cup is completed AND saved, then consumes only once for concurrent cups", () => {
    const s = setup(), first = s.service.create(s.seed, "prepared"), second = s.service.create(s.seed, "prepared");
    if (!first.ok || !second.ok) throw Error("create failed");
    expect(first.value.id).not.toBe(second.value.id);
    expect(s.brews.getById(first.value.id).value?.sourcePreparationId).toBe("prepared");
    for (const status of ["not_started", "in_progress", "paused", "abandoned"] as const) {
      consumeCompletedPreparation({ ...first.value, executionStatus: status, recordStatus: "saved" }, s.preparations);
      expect(s.journal.load().preparations).toHaveLength(1);
    }
    consumeCompletedPreparation({ ...first.value, executionStatus: "completed", recordStatus: "draft" }, s.preparations);
    expect(s.journal.load().preparations).toHaveLength(1);
    const finished = { ...first.value, executionStatus: "completed" as const, recordStatus: "saved" as const, completedAt: new Date().toISOString() };
    expect(writeBrewWithPreparationCleanup(s.brews, finished, s.preparations).ok).toBe(true);
    expect(s.journal.load().preparations).toHaveLength(0);
    expect(writeBrewWithPreparationCleanup(s.brews, { ...finished, id: second.value.id }, s.preparations).ok).toBe(true);
    expect(s.journal.load().preparations).toHaveLength(0);
    expect(s.source.recipeSnapshot).toEqual(s.seed.snapshot);
  });
  it("does not consume after Brew write failure, and retries failed cleanup on next Journal load", () => {
    const s = setup(), created = s.service.create(s.seed, "prepared"); if (!created.ok) throw Error("create failed");
    const finished = { ...created.value, executionStatus: "completed" as const, recordStatus: "saved" as const, completedAt: new Date().toISOString() };
    s.storage.failKey = LOCAL_BREW_KEY;
    expect(writeBrewWithPreparationCleanup(s.brews, finished, s.preparations).ok).toBe(false);
    expect(s.preparations.read().ok && s.journal.load().preparations).toHaveLength(1);
    s.storage.failKey = BREW_PREPARATIONS_KEY;
    expect(writeBrewWithPreparationCleanup(s.brews, finished, s.preparations).ok).toBe(true);
    expect(s.brews.getById(created.value.id).value?.recordStatus).toBe("saved");
    const failed = s.journal.load(); expect(failed.preparations).toHaveLength(1); expect(failed.preparationError).not.toBeNull();
    s.storage.failKey = null;
    expect(s.journal.load().preparations).toHaveLength(0);
    expect(s.journal.load().preparations).toHaveLength(0);
  });
  it("manual last-stage auto-save consumes only after persistence, while reset keeps the source", () => {
    const s = setup(), created = s.service.create(s.seed, "prepared"); if (!created.ok) throw Error("create failed");
    let now = Date.parse("2026-10-25T00:00:00.000Z");
    const service = new BrewService(s.brews, { now: () => new Date(now).toISOString(), preparations: s.preparations });
    expect(service.startBrewSession(created.value.id).ok).toBe(true);
    now += 1000;
    expect(service.restartBrewSession(created.value.id, 1).ok).toBe(true);
    expect(s.journal.load().preparations).toHaveLength(1);
    expect(service.startBrewSession(created.value.id).ok).toBe(true);
    for (let order = 0; order < created.value.recipeSnapshot.steps.length; order++) {
      now += 1000;
      expect(service.completeCurrentStage(created.value.id, order, true).ok).toBe(true);
    }
    expect(s.brews.getById(created.value.id).value?.recordStatus).toBe("saved");
    const read = s.preparations.read(); if (!read.ok) throw Error(read.message);
    expect(read.value.entries).toHaveLength(0);
  });
  it("edits a stable ID without losing creation/legacy metadata and never resurrects deleted conversions", () => {
    const s = setup();
    s.storage.setItem("cupmaster:suggested-plans", JSON.stringify({ version: 2, data: { plans: s.fixtures.plans } }));
    s.storage.setItem(LOCAL_BREW_KEY, JSON.stringify({ version: 1, data: { brews: s.fixtures.brews } }));
    const migrated = s.preparations.migrate(); if (!migrated.ok) throw Error(migrated.message);
    const entry = migrated.value.entries.find(item => item.legacyPlanId)!;
    expect(entry).toBeDefined();
    expect(s.preparations.save({ ...entry, snapshot: { ...entry.snapshot, temperatureCelsius: { ...entry.snapshot.temperatureCelsius, value: 91 } } }, entry.id, "2026-10-26T00:00:00.000Z").ok).toBe(true);
    const edited = s.preparations.read(); if (!edited.ok) throw Error(edited.message);
    expect(edited.value.entries.find(item => item.id === entry.id)?.createdAt).toBe(entry.createdAt);
    expect(edited.value.entries.find(item => item.id === entry.id)?.legacyPlanId).toBe(entry.legacyPlanId);
    expect(s.journal.remove(entry.id).ok).toBe(true); expect(s.journal.remove(entry.id).ok).toBe(true);
    s.storage.setItem("cupmaster:suggested-plans", JSON.stringify({ version: 2, data: { plans: s.fixtures.plans } }, null, 2));
    const again = s.preparations.migrate(); if (!again.ok) throw Error(again.message);
    expect(again.value.entries.some(item => item.id === entry.id)).toBe(false);
    expect(again.value.backups.length).toBeGreaterThan(0);
    expect(again.value.redirects).toEqual(migrated.value.redirects);
    expect(s.preparations.save(entry, entry.id, new Date().toISOString()).ok).toBe(false);
    expect(s.service.create(entry, entry.id).ok).toBe(false);
  });
  it("preserves valid preparations if Brew storage is corrupt, with an explicit error", () => {
    const s = setup(); s.storage.setItem(LOCAL_BREW_KEY, "broken");
    const data = s.journal.load(); expect(data.preparations).toHaveLength(1); expect(data.brewError).not.toBeNull();
    expect(s.storage.getItem(LOCAL_BREW_KEY)).toBe("broken");
  });
});
