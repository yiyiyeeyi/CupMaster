import {
  createInitialBrewRuntime,
  PourDetectionService,
  reduceBrewRuntime,
  type BrewRecipeRuntimeDefinition,
  type BrewGuidanceEvent,
  type BrewRuntimeEvent,
  type BrewRuntimeMode,
  type BrewSessionRuntime,
  type PourDetectionThresholds,
  type VisionFrameAnalysis,
} from "@/domain/brew-runtime";

export interface BrewRuntimeControllerOptions {
  sessionId: string;
  recipe: BrewRecipeRuntimeDefinition;
  mode?: BrewRuntimeMode;
  thresholds?: PourDetectionThresholds;
}

type RuntimeListener = (snapshot: BrewSessionRuntime) => void;
type GuidanceListener = (event: Readonly<BrewGuidanceEvent>) => void;

function cloneGuidanceEvent(event: BrewGuidanceEvent): BrewGuidanceEvent {
  return { ...event };
}

function cloneRuntime(runtime: BrewSessionRuntime): BrewSessionRuntime {
  return {
    ...runtime,
    recipe: {
      ...runtime.recipe,
      stages: runtime.recipe.stages.map((stage) => ({
        ...stage,
        ...(stage.guidance && {
          guidance: {
            ...stage.guidance,
            ...(stage.guidance.details && { details: stage.guidance.details.map((detail) => ({ ...detail })) }),
          },
        }),
      })),
    },
    ...(runtime.calibration && {
      calibration: {
        ...runtime.calibration,
        roi: { ...runtime.calibration.roi },
        ...(runtime.calibration.dripperCenter && {
          dripperCenter: { ...runtime.calibration.dripperCenter },
        }),
      },
    }),
    stages: runtime.stages.map((stage) => ({ ...stage })),
    guidanceEvents: runtime.guidanceEvents.map(cloneGuidanceEvent),
    detection: { ...runtime.detection },
    errors: [...runtime.errors],
  };
}

export class BrewRuntimeController {
  private runtime: BrewSessionRuntime;
  private readonly detector: PourDetectionService;
  private readonly listeners = new Set<RuntimeListener>();
  private readonly guidanceListeners = new Set<GuidanceListener>();

  constructor(options: BrewRuntimeControllerOptions) {
    this.runtime = createInitialBrewRuntime({
      sessionId: options.sessionId,
      recipe: options.recipe,
      mode: options.mode ?? "camera_assisted",
    });
    this.detector = new PourDetectionService(options.thresholds);
  }

  start(timestampMs: number) {
    return this.dispatch({ type: "SESSION_STARTED", timestampMs });
  }

  cameraReady(timestampMs: number) {
    return this.dispatch({ type: "CAMERA_READY", timestampMs });
  }

  tick(timestampMs: number) {
    return this.dispatch({ type: "RUNTIME_TICK", timestampMs });
  }

  pause(timestampMs: number) {
    return this.dispatch({ type: "SESSION_PAUSED", timestampMs });
  }

  resume(timestampMs: number) {
    return this.dispatch({ type: "SESSION_RESUMED", timestampMs });
  }

  restart(timestampMs: number) {
    this.detector.reset();
    return this.dispatch({ type: "SESSION_RESTARTED", timestampMs });
  }

  handleVisionFrame(frame: VisionFrameAnalysis) {
    if (this.runtime.state === "completed" || this.runtime.state === "paused") return this.getSnapshot();

    const result = this.detector.process(frame);
    this.runtime = {
      ...this.runtime,
      detection: {
        lastFrameTimestampMs: result.snapshot.timestampMs,
        observedState: result.snapshot.state,
        consecutivePositiveFrames: result.snapshot.consecutivePositiveFrames,
        consecutiveNegativeFrames: result.snapshot.consecutiveNegativeFrames,
        confidence: result.snapshot.confidence,
      },
    };

    if (result.transition) {
      this.reduceEvent({
        type: result.transition,
        timestampMs: frame.timestampMs,
        source: "camera",
        confidence: frame.analysisConfidence,
      });
    }

    this.reduceEvent({ type: "RUNTIME_TICK", timestampMs: frame.timestampMs });

    return this.publish();
  }

  manualPourStart(timestampMs: number) {
    const previous = this.runtime;
    const snapshot = this.dispatch({ type: "POUR_STARTED", timestampMs, source: "manual" }, false);
    if (this.runtime !== previous && this.runtime.pourState === "pouring") {
      this.detector.syncConfirmedState("pouring");
    }
    return this.publish(snapshot);
  }

  manualPourStop(timestampMs: number) {
    const previous = this.runtime;
    const snapshot = this.dispatch({ type: "POUR_STOPPED", timestampMs, source: "manual" }, false);
    if (this.runtime !== previous && this.runtime.pourState === "not_pouring") {
      this.detector.syncConfirmedState("not_pouring");
    }
    return this.publish(snapshot);
  }

  manualAdvanceStage(timestampMs: number) {
    const previous = this.runtime;
    const snapshot = this.dispatch({ type: "MANUAL_ADVANCE_STAGE", timestampMs }, false);
    if (this.runtime !== previous && this.runtime.pourState === "not_pouring") {
      this.detector.syncConfirmedState("not_pouring");
    }
    return this.publish(snapshot);
  }

  completeManually(timestampMs: number) {
    return this.dispatch({ type: "BREW_COMPLETED", timestampMs, source: "manual" });
  }

  cameraError(timestampMs: number, code: string) {
    return this.dispatch({ type: "CAMERA_ERROR", timestampMs, code });
  }

  getSnapshot() {
    return cloneRuntime(this.runtime);
  }

  subscribe(listener: RuntimeListener) {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  subscribeGuidance(listener: GuidanceListener) {
    this.guidanceListeners.add(listener);
    return () => this.guidanceListeners.delete(listener);
  }

  getGuidanceEvents(afterSequence = 0): BrewGuidanceEvent[] {
    return this.runtime.guidanceEvents
      .filter((event) => event.sequence > afterSequence)
      .map(cloneGuidanceEvent);
  }

  resetDetection() {
    this.detector.reset();
    this.runtime = {
      ...this.runtime,
      detection: {
        consecutivePositiveFrames: 0,
        consecutiveNegativeFrames: 0,
        confidence: 0,
      },
    };
    this.publish();
  }

  private dispatch(event: BrewRuntimeEvent, publish = true) {
    this.reduceEvent(event);
    return publish ? this.publish() : this.getSnapshot();
  }

  private reduceEvent(event: BrewRuntimeEvent) {
    const previousSequence = this.runtime.nextGuidanceSequence - 1;
    this.runtime = reduceBrewRuntime(this.runtime, event);
    const emitted = this.runtime.guidanceEvents.filter((item) => item.sequence > previousSequence);
    for (const guidance of emitted) {
      for (const listener of this.guidanceListeners) listener(cloneGuidanceEvent(guidance));
    }
  }

  private publish(snapshot = this.getSnapshot()) {
    for (const listener of this.listeners) listener(cloneRuntime(snapshot));
    return snapshot;
  }
}
