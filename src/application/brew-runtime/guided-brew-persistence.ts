import type { Brew, BrewStageResult } from "@/domain";
import type { BrewRepository } from "@/repositories/brew-repository";
import type { BrewOperationResult } from "../brew-service";
import type { GuidedBrewV1Snapshot } from "./guided-brew-v1-session";

export interface GuidedBrewClockAnchor {
  wallTimeMs: number;
  runtimeTimeMs: number;
}

const invalidTiming = "沖煮時間資料不一致，已保留原有紀錄。";

/** Projects execution observations, never recipe targets, into the existing Brew. */
export class GuidedBrewPersistenceService {
  constructor(private readonly repository: BrewRepository) {}

  persist(brewId: string, snapshot: GuidedBrewV1Snapshot, anchor: GuidedBrewClockAnchor): BrewOperationResult {
    const read = this.repository.getById(brewId);
    if (!read.ok) return { ok: false, code: "persistence_failed", message: read.message };
    const brew = read.value;
    if (!brew) return { ok: false, code: "brew_not_found", message: invalidTiming };
    const invalid = (): BrewOperationResult => ({ ok: false, code: "invalid_execution_status", message: invalidTiming, latest: brew });
    const runtime = snapshot.runtime;
    if (brew.recordStatus !== "draft" || !["in_progress", "paused"].includes(brew.executionStatus)
      || (brew.executionRun ?? 1) !== runtime.runNumber
      || runtime.startedAtMs === undefined
      || !Number.isFinite(anchor.wallTimeMs) || !Number.isFinite(anchor.runtimeTimeMs)
      || !Number.isFinite(snapshot.elapsedMs) || snapshot.elapsedMs < 0
      || Date.parse(brew.startedAt ?? "") !== anchor.wallTimeMs
      || runtime.startedAtMs !== anchor.runtimeTimeMs) return invalid();

    const steps = [...brew.recipeSnapshot.steps].sort((left, right) => left.order - right.order);
    if (steps.length !== runtime.stages.length || runtime.stages.some((stage, index) => stage.stageId !== steps[index]?.id)) return invalid();
    const iso = (timestampMs: number): string => new Date(anchor.wallTimeMs + timestampMs - anchor.runtimeTimeMs).toISOString();
    const results: BrewStageResult[] = [];
    for (const [index, stage] of runtime.stages.entries()) {
      if (!stage.completed) continue;
      if (index !== results.length || stage.startedAtMs === undefined || stage.endedAtMs === undefined
        || stage.pourDurationMs === undefined || !Number.isFinite(stage.pourDurationMs) || stage.pourDurationMs < 0
        || !Number.isFinite(stage.startedAtMs) || !Number.isFinite(stage.endedAtMs)
        || stage.endedAtMs < stage.startedAtMs) return invalid();
      results.push({
        stageOrder: index, stageId: stage.stageId,
        actualStartedAt: iso(stage.startedAtMs), actualCompletedAt: iso(stage.endedAtMs),
        actualDurationSeconds: stage.pourDurationMs / 1_000,
        actualWeight: null, weightDifference: null, wasSkipped: false,
      });
    }
    if (results.length < brew.stageResults.length) return invalid();
    const completed = runtime.state === "completed";
    if (completed && (results.length !== steps.length || runtime.completedAtMs === undefined)) return invalid();
    const activeStage = runtime.currentStageIndex === null ? undefined : runtime.stages[runtime.currentStageIndex];
    const updated: Brew = {
      ...brew,
      executionRun: runtime.runNumber,
      executionStatus: completed ? "completed" : runtime.state === "paused" ? "paused" : "in_progress",
      currentStageOrder: completed ? steps.length : runtime.currentStageIndex ?? 0,
      currentStageStartedAt: completed || activeStage?.startedAtMs === undefined ? null : iso(activeStage.startedAtMs),
      currentStagePausedSeconds: completed ? 0 : (activeStage?.pausedDurationMs ?? 0) / 1_000,
      accumulatedPauseSeconds: runtime.accumulatedPauseMs / 1_000,
      pausedAt: runtime.pausedAtMs === undefined ? null : iso(runtime.pausedAtMs),
      completedAt: runtime.completedAtMs === undefined ? null : iso(runtime.completedAtMs),
      actualTotalTimeSeconds: completed ? Math.floor(snapshot.elapsedMs / 1_000) : null,
      stageResults: results,
      updatedAt: new Date().toISOString(),
    };
    const saved = this.repository.updateDraft(updated);
    return saved.ok ? { ok: true, value: saved.value }
      : { ok: false, code: "persistence_failed", message: saved.message, latest: brew };
  }
}
