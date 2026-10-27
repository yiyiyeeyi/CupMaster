import type { BrewGuidanceEvent, BrewSessionRuntime } from "@/domain/brew-runtime";
import { BrewRuntimeController } from "./brew-runtime-controller";
import {
  DripperPositioningTracker,
  type DripperPositioningSnapshot,
} from "./dripper-positioning";
import type { GuidanceVoicePort } from "@/infrastructure/voice";

export type GuidedBrewStartSource = "TOUCH" | "VOICE" | "SCALE_CAMERA";
export type GuidedBrewMode = "camera" | "timer_voice";
export type GuidedBrewPhase = DripperPositioningSnapshot["state"] | "BREWING" | "COMPLETED";

export interface GuidedBrewV1Snapshot {
  mode: GuidedBrewMode;
  phase: GuidedBrewPhase;
  startSource: GuidedBrewStartSource | null;
  runtime: BrewSessionRuntime;
  positioning: DripperPositioningSnapshot;
  currentGuidance: BrewGuidanceEvent | null;
  elapsedMs: number;
  stageElapsedMs: number;
  stageProgress: number;
}

export interface GuidedBrewV1SessionOptions {
  runtime: BrewRuntimeController;
  positioning?: DripperPositioningTracker;
  voice: GuidanceVoicePort;
  onStageCompleted?: (stageIndex: number) => void;
  onCompleted?: () => void;
  onExecutionChanged?: (snapshot: GuidedBrewV1Snapshot) => void;
}

type GuidedBrewListener = (snapshot: GuidedBrewV1Snapshot) => void;

export class GuidedBrewV1Session {
  private readonly runtime: BrewRuntimeController;
  private readonly positioning: DripperPositioningTracker;
  private readonly voice: GuidanceVoicePort;
  private readonly onStageCompleted: ((stageIndex: number) => void) | undefined;
  private readonly onCompleted: (() => void) | undefined;
  private readonly onExecutionChanged: ((snapshot: GuidedBrewV1Snapshot) => void) | undefined;
  private readonly listeners = new Set<GuidedBrewListener>();
  private readonly executionListeners = new Set<GuidedBrewListener>();
  private readonly notifiedStageIndexes = new Set<number>();
  private unsubscribeGuidance: (() => void) | undefined;
  private started = false;
  private mode: GuidedBrewMode = "camera";
  private completionNotified = false;
  private startSource: GuidedBrewStartSource | null = null;
  private currentGuidance: BrewGuidanceEvent | null = null;
  private lastTimestampMs = 0;
  private catchingUp = false;

  constructor(options: GuidedBrewV1SessionOptions) {
    this.runtime = options.runtime;
    this.positioning = options.positioning ?? new DripperPositioningTracker();
    this.voice = options.voice;
    this.onStageCompleted = options.onStageCompleted;
    this.onCompleted = options.onCompleted;
    this.onExecutionChanged = options.onExecutionChanged;
    this.activate();
  }

  activate(): void {
    if (this.unsubscribeGuidance !== undefined) return;
    this.unsubscribeGuidance = this.runtime.subscribeGuidance((event) => {
      this.currentGuidance = { ...event };
      if (!this.catchingUp) {
        this.voice.speak(event);
        this.publish();
      }
    });
  }

  confirmDripperPlacement(): GuidedBrewV1Snapshot {
    if (!this.started) this.positioning.confirmPlacement();
    return this.publish();
  }

  selectMode(mode: GuidedBrewMode): GuidedBrewV1Snapshot {
    if (mode !== this.mode && !this.started) this.positioning.reset();
    this.mode = mode;
    return this.publish();
  }

  observePositioning(timestampMs: number, motionScore: number): GuidedBrewV1Snapshot {
    this.lastTimestampMs = Math.max(this.lastTimestampMs, timestampMs);
    if (!this.started) this.positioning.observe(timestampMs, motionScore);
    return this.publish();
  }

  start(source: GuidedBrewStartSource, timestampMs: number): boolean {
    if (this.started || (this.mode === "camera" && this.positioning.getSnapshot().state !== "READY")) return false;
    this.started = true;
    this.startSource = source;
    this.lastTimestampMs = timestampMs;
    this.runtime.start(timestampMs);
    this.runtime.manualPourStart(timestampMs);
    this.publishExecution();
    this.publish();
    return true;
  }

  tick(timestampMs: number): GuidedBrewV1Snapshot {
    this.lastTimestampMs = Math.max(this.lastTimestampMs, timestampMs);
    if (!this.started) return this.publish();

    this.runtime.tick(timestampMs);
    const before = this.runtime.getSnapshot();
    if (before.state === "pouring" && before.currentStageIndex !== null) {
      const stageDefinition = before.recipe.stages[before.currentStageIndex];
      const stageRecord = before.stages[before.currentStageIndex];
      const targetMs = stageDefinition?.targetPourDurationMs;
      const activeElapsedMs = stageRecord?.startedAtMs === undefined
        ? 0
        : Math.max(0, timestampMs - stageRecord.startedAtMs - stageRecord.pausedDurationMs);
      if (targetMs !== undefined && activeElapsedMs >= targetMs) {
        this.runtime.manualPourStop(timestampMs);
        const stopped = this.runtime.getSnapshot();
        if (stopped.state === "paused_between_pours") this.runtime.manualPourStart(timestampMs);
      }
    }

    this.notifyTransitions(this.runtime.getSnapshot());
    return this.publish();
  }

  advanceStage(timestampMs: number): GuidedBrewV1Snapshot {
    if (!this.started || this.runtime.getSnapshot().state === "paused") return this.getSnapshot();
    this.lastTimestampMs = Math.max(timestampMs, this.lastTimestampMs);
    this.runtime.manualPourStop(this.lastTimestampMs);
    if (this.runtime.getSnapshot().state === "paused_between_pours") this.runtime.manualPourStart(this.lastTimestampMs);
    this.notifyTransitions(this.runtime.getSnapshot());
    return this.publish();
  }

  pause(timestampMs: number): GuidedBrewV1Snapshot {
    timestampMs = Math.max(timestampMs, this.lastTimestampMs);
    const previous = this.runtime.getSnapshot().state;
    if (this.started) this.runtime.pause(timestampMs);
    this.lastTimestampMs = Math.max(this.lastTimestampMs, timestampMs);
    if (this.runtime.getSnapshot().state !== previous) this.publishExecution();
    return this.publish();
  }

  observeTime(timestampMs: number): GuidedBrewV1Snapshot {
    this.lastTimestampMs = Math.max(this.lastTimestampMs, timestampMs);
    return this.publish();
  }

  /** Advance elapsed timed guidance on foreground return without replaying past speech. */
  catchUp(timestampMs: number): GuidedBrewV1Snapshot {
    if (!this.started) return this.getSnapshot();
    const previousGuidance = this.currentGuidance;
    this.lastTimestampMs = Math.max(this.lastTimestampMs, timestampMs);
    this.catchingUp = true;
    try {
      for (;;) {
        const runtime = this.runtime.getSnapshot();
        if (runtime.state !== "pouring" || runtime.currentStageIndex === null) break;
        const stage = runtime.stages[runtime.currentStageIndex];
        const target = runtime.recipe.stages[runtime.currentStageIndex]?.targetPourDurationMs;
        if (stage.startedAtMs === undefined || target === undefined || target <= 0) break;
        const due = stage.startedAtMs + stage.pausedDurationMs + target;
        if (due > timestampMs) break;
        this.runtime.manualPourStop(due);
        if (this.runtime.getSnapshot().state === "paused_between_pours") this.runtime.manualPourStart(due);
      }
      this.runtime.tick(timestampMs);
    } finally { this.catchingUp = false; }
    this.notifyTransitions(this.runtime.getSnapshot());
    if (this.currentGuidance && this.currentGuidance !== previousGuidance && this.runtime.getSnapshot().state === "pouring") this.voice.speak(this.currentGuidance);
    return this.publish();
  }

  resume(timestampMs: number): GuidedBrewV1Snapshot {
    timestampMs = Math.max(timestampMs, this.lastTimestampMs);
    const previous = this.runtime.getSnapshot().state;
    if (this.started) this.runtime.resume(timestampMs);
    this.lastTimestampMs = Math.max(this.lastTimestampMs, timestampMs);
    if (this.runtime.getSnapshot().state !== previous) this.publishExecution();
    return this.publish();
  }

  restart(timestampMs: number): GuidedBrewV1Snapshot {
    this.voice.cancel();
    this.runtime.reset(timestampMs);
    this.positioning.reset();
    this.notifiedStageIndexes.clear();
    this.started = false;
    this.completionNotified = false;
    this.startSource = null;
    this.currentGuidance = null;
    this.lastTimestampMs = timestampMs;
    return this.publish();
  }

  replayGuidance(): boolean {
    return this.voice.replay();
  }

  setSpeechEnabled(enabled: boolean): GuidedBrewV1Snapshot {
    this.voice.setEnabled(enabled);
    return this.publish();
  }

  getSnapshot(): GuidedBrewV1Snapshot {
    const runtime = this.runtime.getSnapshot();
    const positioning = this.positioning.getSnapshot();
    const currentStage = runtime.currentStageIndex === null ? undefined : runtime.stages[runtime.currentStageIndex];
    const targetMs = runtime.currentStageIndex === null
      ? undefined
      : runtime.recipe.stages[runtime.currentStageIndex]?.targetPourDurationMs;
    const endTimestampMs = runtime.completedAtMs ?? this.lastTimestampMs;
    const stageTimestampMs = currentStage?.endedAtMs ?? endTimestampMs;
    const currentSessionPauseMs = runtime.pausedAtMs === undefined ? 0 : endTimestampMs - runtime.pausedAtMs;
    const elapsedMs = runtime.startedAtMs === undefined
      ? 0
      : Math.max(0, endTimestampMs - runtime.startedAtMs - runtime.accumulatedPauseMs - currentSessionPauseMs);
    const ongoingPauseMs = currentStage?.pausedAtMs === undefined ? 0 : stageTimestampMs - currentStage.pausedAtMs;
    const stageElapsedMs = currentStage?.startedAtMs === undefined
      ? 0
      : Math.max(0, stageTimestampMs - currentStage.startedAtMs - currentStage.pausedDurationMs - ongoingPauseMs);
    return {
      mode: this.mode,
      phase: runtime.state === "completed" ? "COMPLETED" : this.started ? "BREWING"
        : this.mode === "timer_voice" ? "READY" : positioning.state,
      startSource: this.startSource,
      runtime,
      positioning,
      currentGuidance: this.currentGuidance === null ? null : { ...this.currentGuidance },
      elapsedMs,
      stageElapsedMs,
      stageProgress: targetMs === undefined || targetMs <= 0 ? 0 : Math.min(1, stageElapsedMs / targetMs),
    };
  }

  subscribe(listener: GuidedBrewListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  subscribeExecution(listener: GuidedBrewListener): () => void {
    this.executionListeners.add(listener);
    return () => this.executionListeners.delete(listener);
  }

  dispose(): void {
    this.unsubscribeGuidance?.();
    this.unsubscribeGuidance = undefined;
    this.voice.dispose();
    this.listeners.clear();
    this.executionListeners.clear();
  }

  private notifyTransitions(runtime: BrewSessionRuntime): void {
    let changed = false;
    for (let index = 0; index < runtime.stages.length; index += 1) {
      if (runtime.stages[index]?.completed && !this.notifiedStageIndexes.has(index)) {
        this.notifiedStageIndexes.add(index);
        changed = true;
        this.onStageCompleted?.(index);
      }
    }
    if (runtime.state === "completed" && !this.completionNotified) {
      this.completionNotified = true;
      changed = true;
      this.onCompleted?.();
    }
    if (changed) this.publishExecution();
  }

  private publishExecution(): void {
    const snapshot = this.getSnapshot();
    this.onExecutionChanged?.(snapshot);
    for (const listener of this.executionListeners) listener(snapshot);
  }

  private publish(): GuidedBrewV1Snapshot {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
    return snapshot;
  }
}

export class GuidedBrewResourceScope {
  private cleanups: Array<() => void> = [];
  private disposed = false;

  add(cleanup: () => void): void {
    if (this.disposed) cleanup();
    else this.cleanups.push(cleanup);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const cleanup of this.cleanups.reverse()) cleanup();
    this.cleanups = [];
  }
}
