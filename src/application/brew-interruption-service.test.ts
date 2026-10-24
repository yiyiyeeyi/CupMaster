import { describe, expect, it } from "vitest";
import { recipeFixtures } from "@/data/fixtures/recipes";
import { createBrewDraft, createQuickPrepareDefaults } from "./brew-factory";
import { BrewService } from "./brew-service";
import { LocalBrewRepository } from "@/repositories/local-brew-repository";
import { LocalLiveBrewRepository } from "@/repositories/local-live-brew-repository";
import { BREW_INTERRUPTION_TIMEOUT_MS, BrewInterruptionService } from "./brew-interruption-service";

class MemoryStorage {
  values = new Map<string, string>();
  fail = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.fail) throw new Error("blocked"); this.values.set(key, value); }
}
const start = Date.parse("2026-10-24T00:00:00.000Z");
function setup(stageCount = 2) {
  const storage = new MemoryStorage(), brews = new LocalBrewRepository(storage), live = new LocalLiveBrewRepository(storage);
  const recipe = structuredClone(recipeFixtures[0]);
  if (stageCount === 3) recipe.currentVersion.steps.push({ ...recipe.currentVersion.steps[1], id: "third-stage", order: 2 });
  recipe.currentVersion.steps.forEach(s => { s.durationSeconds = 5; });
  recipe.currentVersion.expectedTimeSeconds = stageCount * 5;
  const draft = createBrewDraft(recipe, createQuickPrepareDefaults(recipe), { now: () => new Date(start).toISOString() });
  brews.createDraft(draft);
  new BrewService(brews, { now: () => new Date(start).toISOString() }).startBrewSession(draft.id);
  let now = start;
  const service = new BrewInterruptionService(brews, live, () => now);
  return { storage, brews, live, draft, service, setTime: (seconds: number) => { now = start + seconds * 1_000; } };
}
describe("V1 interruption policy", () => {
  it("continues a late manual stage timeline past the original total until its final stage is reachable", () => {
    const s = setup(3);
    const service = new BrewService(s.brews, { now: () => new Date(start + 20_000).toISOString() });
    expect(service.completeCurrentStage(s.draft.id).ok).toBe(true);
    s.setTime(20); s.service.leave(s.draft.id); s.setTime(21);
    expect(s.service.inspect(s.draft.id, true)).toMatchObject({ ok: true, state: "active", brew: {
      currentStageOrder: 1, executionStatus: "in_progress", stageResults: [{ actualDurationSeconds: 20 }],
    } });
    s.setTime(26);
    expect(s.service.inspect(s.draft.id, true)).toMatchObject({ ok: true, state: "overrun" });
    expect(s.service.finish(s.draft.id)).toMatchObject({ ok: true, value: {
      recordStatus: "saved", actualTotalTimeSeconds: 26,
      stageResults: [{ actualDurationSeconds: 20 }, { actualDurationSeconds: 5 }, { actualDurationSeconds: 1 }],
    } });
  });
  it("counts away time and catches up timed stages while preserving history and Snapshot", () => {
    const s = setup(); s.setTime(2); s.service.leave(s.draft.id); s.setTime(7);
    const result = s.service.inspect(s.draft.id, true);
    expect(result).toMatchObject({ ok: true, state: "active", brew: { currentStageOrder: 1, accumulatedPauseSeconds: 0, stageResults: [{ actualDurationSeconds: 5, wasSkipped: false }] } });
    if (!result.ok) throw new Error(result.message);
    expect(result.brew.currentStageStartedAt).toBe(new Date(start + 5_000).toISOString());
    expect(result.brew.recipeSnapshot).toEqual(s.draft.recipeSnapshot);
  });
  it("excludes an explicit pause even while away", () => {
    const s = setup();
    const brew = s.brews.getById(s.draft.id).value!;
    s.brews.updateDraft({ ...brew, executionStatus: "paused", pausedAt: new Date(start + 2_000).toISOString() });
    s.setTime(3); s.service.leave(brew.id); s.setTime(20);
    expect(s.service.inspect(brew.id, true)).toMatchObject({ ok: true, state: "active", brew: { executionStatus: "paused", stageResults: [], accumulatedPauseSeconds: 0 } });
  });
  it("keeps duplicate leave signals from extending the deadline; expires strictly after 30 minutes", () => {
    const s = setup(); s.setTime(2); s.service.leave(s.draft.id); s.setTime(3); s.service.leave(s.draft.id);
    expect(s.live.read()).toMatchObject({ ok: true, value: { interruptions: { [s.draft.id]: { leftAt: start + 2_000 } } } });
    s.setTime(2 + BREW_INTERRUPTION_TIMEOUT_MS / 1_000);
    expect(s.service.inspect(s.draft.id)).toMatchObject({ ok: true, state: "overrun" });
    // Re-entering clears the marker, so start a new interruption for expiry.
    s.service.leave(s.draft.id); s.setTime(2 + 2 * BREW_INTERRUPTION_TIMEOUT_MS / 1_000 + 0.001);
    const result = s.service.inspect(s.draft.id);
    expect(result).toMatchObject({ ok: true, state: "expired", brew: { id: s.draft.id, executionStatus: "not_started", stageResults: [], startedAt: null } });
    if (!result.ok) throw new Error(result.message);
    expect(result.brew.recipeSnapshot).toEqual(s.draft.recipeSnapshot);
    expect(result.brew.brewPlan).toEqual(s.draft.brewPlan);
  });
  it("requires an explicit overrun decision, then saves actual integer elapsed time exactly once", () => {
    const s = setup(); s.setTime(2); s.service.leave(s.draft.id); s.setTime(12.345);
    expect(s.service.inspect(s.draft.id, true)).toMatchObject({ ok: true, state: "overrun", brew: { executionStatus: "in_progress", stageResults: [] } });
    expect(s.service.finish(s.draft.id)).toMatchObject({ ok: true, value: { recordStatus: "saved", actualTotalTimeSeconds: 12, stageResults: [{ actualDurationSeconds: 5 }, { actualDurationSeconds: 7.345 }] } });
    expect(s.service.finish(s.draft.id).ok).toBe(true);
    expect(s.brews.listAll().value).toHaveLength(1);
  });
  it("preserves execution when expiry/reset cannot be persisted", () => {
    const s = setup(); s.service.leave(s.draft.id); const before = s.brews.getById(s.draft.id).value;
    s.storage.fail = true; s.setTime(1_801);
    expect(s.service.inspect(s.draft.id).ok).toBe(false);
    expect(s.brews.getById(s.draft.id).value).toEqual(before);
  });
  it("discards only execution, preserves parameters, and cannot discard a saved cup", () => {
    const s = setup();
    expect(s.service.discard(s.draft.id)).toMatchObject({ ok: true, value: { executionStatus: "not_started", id: s.draft.id, executionRun: 2 } });
    expect(s.brews.getById(s.draft.id).value?.recipeSnapshot).toEqual(s.draft.recipeSnapshot);
    const brew = s.brews.getById(s.draft.id).value!;
    s.brews.updateDraft({ ...brew, recordStatus: "saved" });
    expect(s.service.discard(brew.id).ok).toBe(false);
  });
  it("persists the local opt-out without changing interruption metadata", () => {
    const s = setup(); s.service.leave(s.draft.id); s.live.dismissWakeLockHelp();
    expect(new LocalLiveBrewRepository(s.storage).read()).toMatchObject({ ok: true, value: { hideWakeLockHelp: true, interruptions: { [s.draft.id]: { run: 1 } } } });
  });
  it("rejects stale overrun actions after a new execution starts", () => {
    const s = setup(); s.service.discard(s.draft.id, 1);
    const before = s.brews.getById(s.draft.id).value;
    expect(s.service.discard(s.draft.id, 1).ok).toBe(false);
    expect(s.service.finish(s.draft.id, 1).ok).toBe(false);
    expect(s.brews.getById(s.draft.id).value).toEqual(before);
  });
});
