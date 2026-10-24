import { describe, expect, it } from "vitest";
import { createBrewDraft, createQuickPrepareDefaults } from "../brew-factory";
import { BrewService } from "../brew-service";
import { recipeFixtures } from "@/data/fixtures/recipes";
import { LocalBrewRepository } from "@/repositories/local-brew-repository";
import { createBrewRuntimeRecipeDefinition } from "@/domain/brew-runtime";
import { calculateElapsedSeconds, calculateStageElapsedSeconds } from "@/domain";
import { BrewRuntimeController } from "./brew-runtime-controller";
import { GuidedBrewV1Session } from "./guided-brew-v1-session";
import { GuidedBrewPersistenceService, type GuidedBrewClockAnchor } from "./guided-brew-persistence";
import { inspectGuidedBrewForeground } from "./guided-brew-foreground";
import { BrewInterruptionService } from "../brew-interruption-service";
import { LocalLiveBrewRepository } from "@/repositories/local-live-brew-repository";

class TestStorage {
  data = new Map<string, string>();
  fail = false;
  failLiveRead = false;
  getItem(key: string) {
    if (this.failLiveRead && key === "cupmaster:live-brew") throw new Error("read blocked");
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) { if (this.fail) throw new Error("write blocked"); this.data.set(key, value); }
}

const wallStart = Date.parse("2026-10-24T00:00:00.000Z");
function setup(autoPersist = true) {
  const storage = new TestStorage();
  const repository = new LocalBrewRepository(storage);
  const recipe = structuredClone(recipeFixtures[0]);
  recipe.currentVersion.steps.forEach((step) => { step.durationSeconds = 5; });
  const draft = createBrewDraft(recipe, createQuickPrepareDefaults(recipe), {
    now: () => new Date(wallStart).toISOString(), createId: () => "timing-brew",
  });
  expect(repository.createDraft(draft).ok).toBe(true);
  let wallNow = wallStart;
  let anchor: GuidedBrewClockAnchor = { wallTimeMs: wallStart, runtimeTimeMs: 1_000 };
  const service = new BrewService(repository, { now: () => new Date(wallNow).toISOString() });
  expect(service.startBrewSession(draft.id).ok).toBe(true);
  const persistence = new GuidedBrewPersistenceService(repository);
  const session = new GuidedBrewV1Session({
    runtime: new BrewRuntimeController({ sessionId: draft.id, mode: "manual", recipe: createBrewRuntimeRecipeDefinition({
      recipeId: recipe.id, recipeName: recipe.currentVersion.title, steps: recipe.currentVersion.steps,
    }) }),
    voice: { speak() {}, replay: () => false, cancel() {}, dispose() {}, setEnabled() {}, getSnapshot: () => ({ supported: false, enabled: false, speaking: false, lastMessage: null }) },
    onExecutionChanged: (snapshot) => { if (autoPersist) expect(persistence.persist(draft.id, snapshot, anchor).ok).toBe(true); },
  });
  session.selectMode("timer_voice");
  const read = () => {
    const result = repository.getById(draft.id);
    if (!result.ok || !result.value) throw new Error("Missing test Brew");
    return result.value;
  };
  return { storage, repository, draft, service, persistence, session, read,
    setWall: (ms: number) => { wallNow = ms; }, setAnchor: (value: GuidedBrewClockAnchor) => { anchor = value; } };
}

describe("Guided Brew execution persistence", () => {
  it("atomically saves completion and can retry a blocked final write using the same measured snapshot", () => {
    const { session, persistence, read, draft, storage, repository } = setup(false);
    session.start("TOUCH", 1_000); session.tick(6_000); session.tick(11_000);
    const anchor = { wallTimeMs: wallStart, runtimeTimeMs: 1_000 };
    storage.fail = true;
    expect(persistence.persist(draft.id, session.getSnapshot(), anchor)).toMatchObject({ ok: false, code: "persistence_failed" });
    expect(read().executionStatus).toBe("in_progress");
    storage.fail = false;
    expect(persistence.persist(draft.id, session.getSnapshot(), anchor)).toMatchObject({ ok: true, value: { recordStatus: "saved", actualTotalTimeSeconds: 10 } });
    const completed = read();
    expect(persistence.persist(draft.id, session.getSnapshot(), anchor)).toMatchObject({ ok: true });
    expect(read()).toEqual(completed);
    expect(repository.listJournalEntries().value).toHaveLength(1);
    session.dispose();
  });
  it("catches up and keeps running when foreground inspection fails, then retries persisted inspection", () => {
    const { session, read, storage, repository, draft } = setup();
    const interruption = new BrewInterruptionService(repository, new LocalLiveBrewRepository(storage), () => wallStart + 8_000);
    session.start("TOUCH", 1_000);
    storage.failLiveRead = true;
    expect(inspectGuidedBrewForeground(interruption, draft.id, session, 8_500).ok).toBe(false);
    expect(session.getSnapshot()).toMatchObject({ phase: "BREWING", elapsedMs: 7_500, stageElapsedMs: 2_500 });
    expect(read()).toMatchObject({ currentStageOrder: 1, stageResults: [{ actualDurationSeconds: 5 }] });
    session.tick(9_000);
    expect(session.getSnapshot().elapsedMs).toBe(8_000);
    storage.failLiveRead = false;
    expect(inspectGuidedBrewForeground(interruption, draft.id, session, 9_000)).toMatchObject({ ok: true, state: "active" });
    expect(read().stageResults).toHaveLength(1);
    session.dispose();
  });
  it("catches up timed stage boundaries after foreground return", () => {
    const { session, read } = setup();
    session.start("TOUCH", 1_000);
    session.catchUp(8_500);
    expect(session.getSnapshot()).toMatchObject({ phase: "BREWING", elapsedMs: 7_500, stageElapsedMs: 2_500 });
    expect(read()).toMatchObject({ currentStageOrder: 1, stageResults: [{ actualDurationSeconds: 5, wasSkipped: false }] });
  });
  it("keeps an explicit pause out of foreground catch-up", () => {
    const { session, read } = setup();
    session.start("TOUCH", 1_000); session.pause(2_000); session.catchUp(8_000);
    expect(session.getSnapshot().elapsedMs).toBe(1_000);
    session.resume(10_000); session.catchUp(15_000);
    expect(session.getSnapshot()).toMatchObject({ elapsedMs: 6_000, stageElapsedMs: 1_000 });
    expect(read()).toMatchObject({ accumulatedPauseSeconds: 8, currentStageOrder: 1 });
  });
  it("preserves fractional pause time and records measured stage durations", () => {
    const { session, read, service } = setup();
    session.start("TOUCH", 1_000);
    session.pause(3_500);
    session.tick(9_000);
    expect(session.getSnapshot().elapsedMs).toBe(2_500);
    expect(read()).toMatchObject({ executionStatus: "paused", pausedAt: new Date(wallStart + 2_500).toISOString() });
    session.resume(10_500);
    expect(read()).toMatchObject({ accumulatedPauseSeconds: 7, currentStagePausedSeconds: 7, pausedAt: null });
    session.tick(13_250);
    expect(read().stageResults[0]).toMatchObject({ actualDurationSeconds: 5.25, wasSkipped: false });
    session.tick(18_250);
    expect(session.getSnapshot()).toMatchObject({ phase: "COMPLETED", elapsedMs: 10_250, stageElapsedMs: 5_000 });
    expect(read()).toMatchObject({ executionStatus: "completed", actualTotalTimeSeconds: 10, accumulatedPauseSeconds: 7 });
    expect(read().stageResults.map((stage) => stage.actualDurationSeconds)).toEqual([5.25, 5]);
    expect(service.saveCompletedBrew(read().id).ok).toBe(true);
  });

  it("does not count later ticks or save latency after completion", () => {
    const { session, persistence, read, draft } = setup(false);
    session.start("TOUCH", 1_000);
    session.tick(6_000);
    session.tick(11_000);
    const completed = session.getSnapshot();
    session.tick(90_000);
    expect(session.getSnapshot().elapsedMs).toBe(completed.elapsedMs);
    expect(session.getSnapshot().stageElapsedMs).toBe(5_000);
    expect(persistence.persist(draft.id, session.getSnapshot(), { wallTimeMs: wallStart, runtimeTimeMs: 1_000 }).ok).toBe(true);
    expect(read()).toMatchObject({ actualTotalTimeSeconds: 10, completedAt: new Date(wallStart + 10_000).toISOString() });
  });

  it("restarts the same Brew and Snapshot after completed stages, excluding setup and old execution time", () => {
    const { session, service, read, draft, repository, setWall, setAnchor } = setup();
    session.start("TOUCH", 1_000);
    session.tick(6_000);
    const oldExecution = session.getSnapshot();
    expect(read().stageResults).toHaveLength(1);
    expect(service.restartBrewSession(draft.id, 1).ok).toBe(true);
    session.restart(8_000);
    session.observePositioning(15_000, 0);
    expect(session.getSnapshot()).toMatchObject({ phase: "READY", elapsedMs: 0, stageElapsedMs: 0 });
    expect(session.getSnapshot().runtime.startedAtMs).toBeUndefined();
    expect(read()).toMatchObject({ id: draft.id, executionRun: 2, executionStatus: "not_started", startedAt: null, stageResults: [], accumulatedPauseSeconds: 0 });
    expect(read().recipeSnapshot).toEqual(draft.recipeSnapshot);
    expect(read().brewPlan).toEqual(draft.brewPlan);
    expect(repository.listAll().value).toHaveLength(1);
    const stale = new GuidedBrewPersistenceService(repository).persist(draft.id, oldExecution, { wallTimeMs: wallStart, runtimeTimeMs: 1_000 });
    expect(stale.ok).toBe(false);
    setWall(wallStart + 30_000);
    expect(service.startBrewSession(draft.id).ok).toBe(true);
    setAnchor({ wallTimeMs: wallStart + 30_000, runtimeTimeMs: 16_000 });
    session.start("TOUCH", 16_000);
    session.tick(21_000);
    session.tick(26_000);
    expect(read()).toMatchObject({ actualTotalTimeSeconds: 10, startedAt: new Date(wallStart + 30_000).toISOString(), executionRun: 2 });
    expect(read().stageResults.map((stage) => stage.actualDurationSeconds)).toEqual([5, 5]);
    expect(read().recipeSnapshot).toEqual(draft.recipeSnapshot);
  });

  it("can resume a persisted pause after reload and complete via the existing manual continuation", () => {
    const { session, service, setWall, read } = setup();
    session.start("TOUCH", 1_000);
    session.pause(3_000);
    const paused = read();
    expect(calculateElapsedSeconds(paused.startedAt, paused.accumulatedPauseSeconds, Date.parse(paused.pausedAt!))).toBe(2);
    setWall(wallStart + 7_000);
    expect(service.resumeBrewSession(paused.id).ok).toBe(true);
    expect(service.resumeBrewSession(paused.id).ok).toBe(true);
    expect(read().accumulatedPauseSeconds).toBe(5);
    setWall(wallStart + 10_000);
    expect(calculateStageElapsedSeconds(read().currentStageStartedAt, wallStart + 10_000, read().currentStagePausedSeconds)).toBe(5);
    expect(service.completeCurrentStage(paused.id, 0).ok).toBe(true);
    setWall(wallStart + 15_000);
    expect(service.completeCurrentStage(paused.id, 1).ok).toBe(true);
    expect(service.completeBrewSession(paused.id).ok).toBe(true);
    expect(read().actualTotalTimeSeconds).toBe(10);
    expect(read().stageResults.map((stage) => stage.actualDurationSeconds)).toEqual([5, 5]);
  });

  it("keeps the persisted execution intact if reset cannot be written", () => {
    const { session, service, storage, read } = setup();
    session.start("TOUCH", 1_000);
    session.tick(6_000);
    const before = read();
    storage.fail = true;
    expect(service.restartBrewSession(before.id, 1)).toMatchObject({ ok: false, code: "persistence_failed" });
    expect(read()).toEqual(before);
    expect(session.getSnapshot().runtime.runNumber).toBe(1);
  });

  it("clears accumulated pause on reset and rejects reset of a saved cup", () => {
    const { session, service, read, repository } = setup();
    session.start("TOUCH", 1_000);
    session.pause(2_000);
    session.resume(4_000);
    expect(service.restartBrewSession(read().id, 1).ok).toBe(true);
    expect(read()).toMatchObject({ accumulatedPauseSeconds: 0, currentStagePausedSeconds: 0, pausedAt: null });
    expect(repository.updateDraft({ ...read(), recordStatus: "saved" }).ok).toBe(true);
    expect(service.restartBrewSession(read().id, 2).ok).toBe(false);
  });
});
