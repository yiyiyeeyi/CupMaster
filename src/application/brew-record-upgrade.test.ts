import { describe, expect, it } from "vitest";
import { createBrewDraft, createQuickPrepareDefaults } from "./brew-factory";
import { recipeFixtures } from "@/data/fixtures/recipes";
import { BrewService } from "./brew-service";
import { LocalBrewRepository, LOCAL_BREW_KEY } from "@/repositories/local-brew-repository";

class StoragePort {
  raw: string | null = null;
  fail = false;
  getItem(key: string) { return key === LOCAL_BREW_KEY ? this.raw : null; }
  setItem(_key: string, value: string) { if (this.fail) throw new Error("quota"); this.raw = value; }
}
function setup() {
  const recipe = recipeFixtures[0];
  const brew = createBrewDraft(recipe, createQuickPrepareDefaults(recipe), { now: () => "2026-10-24T00:00:00.000Z", createId: () => "legacy-cup" });
  brew.executionStatus = "completed";
  brew.completedAt = brew.updatedAt;
  brew.quickRating = "liked";
  const storage = new StoragePort();
  storage.setItem(LOCAL_BREW_KEY, JSON.stringify({ version: 1, data: { brews: [brew] } }));
  return { brew, storage, repository: new LocalBrewRepository(storage) };
}
describe("V1 completed record compatibility", () => {
  it("durably upgrades a completed draft and merges quick rating without rewriting its Snapshot", () => {
    const { brew, repository, storage } = setup();
    const read = repository.getById(brew.id);
    expect(read).toMatchObject({ ok: true, value: { id: brew.id, recordStatus: "saved", feedbackStatus: "awaiting_feedback", flavorFeedback: { overallImpression: "liked", flavorNotes: [] } } });
    expect(read.value?.recipeSnapshot).toEqual(brew.recipeSnapshot);
    expect(read.value?.quickRating).toBeUndefined();
    expect(storage.raw).not.toContain('"quickRating"');
    const once = storage.raw;
    expect(new LocalBrewRepository(storage).getById(brew.id).value).toEqual(read.value);
    expect(storage.raw).toBe(once);
  });
  it("preserves existing detailed impression and optional fields over a conflicting legacy rating", () => {
    const s = setup();
    s.brew.flavorFeedback = { id: "feedback", brewId: s.brew.id, overallImpression: "disliked", sweetness: 3, flavorNotes: ["floral"], createdAt: s.brew.updatedAt, updatedAt: s.brew.updatedAt };
    s.storage.raw = JSON.stringify({ version: 1, data: { brews: [s.brew, { id: "damaged" }] } });
    expect(s.repository.getById(s.brew.id).value?.flavorFeedback).toEqual(s.brew.flavorFeedback);
    expect(s.storage.raw).toContain('"damaged"');
  });
  it("keeps skipped distinct from neutral and never invents an impression", () => {
    const s = setup(); s.brew.quickRating = "skipped";
    s.storage.raw = JSON.stringify({ version: 1, data: { brews: [s.brew] } });
    expect(s.repository.getById(s.brew.id).value).toMatchObject({ feedbackStatus: "skipped", flavorFeedback: null });
  });
  it("reports an upgrade write failure and preserves the original storage for retry", () => {
    const s = setup(); const before = s.storage.raw; s.storage.fail = true;
    expect(s.repository.getById(s.brew.id).ok).toBe(false);
    expect(new BrewService(s.repository).saveCompletedBrew(s.brew.id)).toMatchObject({ ok: false, code: "persistence_failed" });
    expect(s.storage.raw).toBe(before);
    s.storage.fail = false;
    expect(s.repository.getById(s.brew.id)).toMatchObject({ ok: true, value: { recordStatus: "saved" } });
  });
  it("uses one impression for quick feeling and detailed feedback, and preserves it when deferring details", () => {
    const s = setup(), service = new BrewService(s.repository);
    expect(service.setOverallImpression(s.brew.id, "neutral")).toMatchObject({ ok: true, value: { flavorFeedback: { overallImpression: "neutral" } } });
    expect(service.upsertFlavorFeedback(s.brew.id, { overallImpression: "neutral", flavorNotes: ["juicy"], sweetness: 4 }).ok).toBe(true);
    expect(service.setOverallImpression(s.brew.id, "liked")).toMatchObject({ ok: true, value: { feedbackStatus: "completed", flavorFeedback: { overallImpression: "liked", flavorNotes: ["juicy"], sweetness: 4 } } });
    expect(service.skipFlavorFeedback(s.brew.id)).toMatchObject({ ok: true, value: { flavorFeedback: { overallImpression: "liked", flavorNotes: ["juicy"] } } });
  });
});
