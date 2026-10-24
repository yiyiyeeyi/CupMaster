import type { Brew } from "@/domain";
import { calculateActiveSeconds } from "@/domain/brew-timer";
import type { BrewRepository } from "@/repositories/brew-repository";
import { LocalLiveBrewRepository } from "@/repositories/local-live-brew-repository";
import { BrewService } from "./brew-service";

export const BREW_INTERRUPTION_TIMEOUT_MS = 30 * 60 * 1_000;
type Failure = { ok: false; message: string };
export type InterruptionResult = Failure | { ok: true; brew: Brew; state: "setup" | "active" | "overrun" | "expired" | "completed" };
const invalid = (): Failure => ({ ok: false, message: "沖煮時間資料不一致，已保留原有紀錄。" });
const iso = (ms: number) => new Date(ms).toISOString();

/** Reconciles timed guidance, never inferred weight or camera measurements. */
export function projectInterruptedProgress(brew: Brew, now: number, finish = false): Brew | null {
  const value = structuredClone(brew);
  if (value.executionStatus === "paused") {
    if (!finish) return value;
    const pause = (now - Date.parse(value.pausedAt ?? "")) / 1_000;
    if (!Number.isFinite(pause) || pause < 0) return null;
    value.accumulatedPauseSeconds += pause;
    value.currentStagePausedSeconds = (value.currentStagePausedSeconds ?? 0) + pause;
    value.pausedAt = null;
    value.executionStatus = "in_progress";
  }
  const steps = [...value.recipeSnapshot.steps].sort((a, b) => a.order - b.order);
  if (!Number.isFinite(now) || value.stageResults.length !== value.currentStageOrder
    || value.currentStageOrder > steps.length
    || value.stageResults.some((result, index) => result.stageId !== steps[index]?.id || result.stageOrder !== index)) return null;
  while (value.currentStageOrder < steps.length) {
    const index = value.currentStageOrder;
    const step = steps[index];
    const start = Date.parse(value.currentStageStartedAt ?? "");
    const pause = value.currentStagePausedSeconds ?? 0;
    if (!Number.isFinite(start) || !step.durationSeconds || step.durationSeconds <= 0
      || value.stageResults.length !== index) return null;
    const due = start + (step.durationSeconds + pause) * 1_000;
    const end = finish && index === steps.length - 1 ? now : due;
    if (end > now) return finish ? null : value;
    if (end < start + pause * 1_000) return null;
    value.stageResults.push({ stageOrder: index, stageId: step.id, actualStartedAt: iso(start), actualCompletedAt: iso(end), actualDurationSeconds: (end - start) / 1_000 - pause, actualWeight: null, weightDifference: null, wasSkipped: false });
    value.currentStageOrder += 1;
    value.currentStageStartedAt = iso(end);
    value.currentStagePausedSeconds = 0;
  }
  if (steps.length === 0) return null;
  const end = finish ? now : Date.parse(value.stageResults.at(-1)!.actualCompletedAt);
  return { ...value, executionStatus: "completed", completedAt: iso(end), currentStageStartedAt: null,
    actualTotalTimeSeconds: Math.floor(calculateActiveSeconds(value.startedAt, value.accumulatedPauseSeconds, end)), updatedAt: iso(now) };
}

export class BrewInterruptionService {
  constructor(private readonly brews: BrewRepository, private readonly live: LocalLiveBrewRepository, private readonly now: () => number = Date.now) {}
  leave(id: string) {
    const read = this.brews.getById(id);
    if (!read.ok) return read;
    const brew = read.value;
    if (!brew || !["in_progress", "paused"].includes(brew.executionStatus)) return { ok: true as const };
    return this.live.markLeft(id, brew.executionRun ?? 1, this.now());
  }
  inspect(id: string, recover = false): InterruptionResult {
    const read = this.brews.getById(id);
    if (!read.ok) return read;
    const brew = read.value;
    if (!brew) return { ok: false, message: "找不到這筆 Brew。" };
    if (brew.executionStatus === "not_started") return { ok: true, brew, state: "setup" };
    if (brew.executionStatus === "completed") return { ok: true, brew, state: "completed" };
    if (!["in_progress", "paused"].includes(brew.executionStatus)) return invalid();
    const stored = this.live.read();
    if (!stored.ok) return stored;
    const marker = stored.value.interruptions[id];
    const leftAt = marker?.run === (brew.executionRun ?? 1) ? marker.leftAt : Date.parse(brew.updatedAt);
    const now = this.now();
    if (!Number.isFinite(leftAt) || !brew.startedAt) return invalid();
    if (now - leftAt > BREW_INTERRUPTION_TIMEOUT_MS) {
      const reset = new BrewService(this.brews, { now: () => iso(now) }).restartBrewSession(id, brew.executionRun ?? 1);
      if (!reset.ok) return reset;
      this.live.clear(id);
      return { ok: true, brew: reset.value, state: "expired" };
    }
    const reference = brew.executionStatus === "paused" ? Date.parse(brew.pausedAt ?? "") : now;
    if (!Number.isFinite(reference)) return invalid();
    const elapsed = calculateActiveSeconds(brew.startedAt, brew.accumulatedPauseSeconds, reference);
    // A late manual stage completion can push the remaining timeline beyond
    // the original total. Offer Finish only once that timeline can reach its
    // final stage; otherwise it must continue normally.
    const overrun = elapsed > brew.recipeSnapshot.expectedTimeSeconds.value
      && projectInterruptedProgress(brew, now, true) !== null;
    let value = brew;
    if (recover && !overrun && brew.executionStatus === "in_progress") {
      const projected = projectInterruptedProgress(brew, now);
      if (!projected) return invalid();
      if (projected.currentStageOrder !== brew.currentStageOrder) {
        const written = this.brews.updateDraft({ ...projected, updatedAt: iso(now) });
        if (!written.ok) return written;
        value = written.value;
      }
    }
    const cleared = this.live.clear(id);
    if (!cleared.ok) return cleared;
    return { ok: true, brew: value, state: value.executionStatus === "completed" ? "completed" : overrun ? "overrun" : "active" };
  }
  finish(id: string, expectedRun?: number) {
    const read = this.brews.getById(id);
    if (!read.ok) return read;
    if (!read.value) return invalid();
    if (expectedRun !== undefined && (read.value.executionRun ?? 1) !== expectedRun) return invalid();
    if (read.value.executionStatus === "completed" && read.value.recordStatus === "saved") return { ok: true as const, value: read.value };
    if (read.value.executionStatus !== "completed") {
      if (!["in_progress", "paused"].includes(read.value.executionStatus)) return invalid();
      const now = this.now();
      const reference = read.value.executionStatus === "paused" ? Date.parse(read.value.pausedAt ?? "") : now;
      if (calculateActiveSeconds(read.value.startedAt, read.value.accumulatedPauseSeconds, reference) <= read.value.recipeSnapshot.expectedTimeSeconds.value) return invalid();
      const completed = projectInterruptedProgress(read.value, now, true);
      if (!completed) return invalid();
      const written = this.brews.updateDraft(completed);
      if (!written.ok) return written;
    }
    const saved = new BrewService(this.brews).saveCompletedBrew(id);
    if (saved.ok) this.live.clear(id);
    return saved;
  }
  discard(id: string, expectedRun?: number) {
    const read = this.brews.getById(id);
    if (!read.ok) return read;
    const brew = read.value;
    if (!brew || brew.recordStatus !== "draft") return invalid();
    if (expectedRun !== undefined && (brew.executionRun ?? 1) !== expectedRun) return invalid();
    const reset = this.brews.updateDraft({ ...brew, executionRun: (brew.executionRun ?? 1) + 1, executionStatus: "not_started", currentStageOrder: 0, currentStageStartedAt: null, currentStagePausedSeconds: 0, startedAt: null, pausedAt: null, completedAt: null, accumulatedPauseSeconds: 0, actualTotalTimeSeconds: null, stageResults: [], updatedAt: iso(this.now()) });
    if (reset.ok) this.live.clear(id);
    return reset;
  }
}
