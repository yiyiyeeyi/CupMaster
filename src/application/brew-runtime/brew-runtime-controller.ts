import {
  createInitialBrewRuntime,
  PourDetectionService,
  reduceBrewRuntime,
  type BrewRecipeRuntimeDefinition,
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

function cloneRuntime(runtime: BrewSessionRuntime): BrewSessionRuntime {
  return {
    ...runtime,
    recipe: {
      ...runtime.recipe,
      stages: runtime.recipe.stages.map((stage) => ({ ...stage })),
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
    detection: { ...runtime.detection },
    errors: [...runtime.errors],
  };
}

export class BrewRuntimeController {
  private runtime: BrewSessionRuntime;
  private readonly detector: PourDetectionService;
  private readonly listeners = new Set<RuntimeListener>();

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

  handleVisionFrame(frame: VisionFrameAnalysis) {
    if (this.runtime.state === "completed") return this.getSnapshot();

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
      this.runtime = reduceBrewRuntime(this.runtime, {
        type: result.transition,
        timestampMs: frame.timestampMs,
        source: "camera",
        confidence: frame.analysisConfidence,
      });
    }

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
    this.runtime = reduceBrewRuntime(this.runtime, event);
    return publish ? this.publish() : this.getSnapshot();
  }

  private publish(snapshot = this.getSnapshot()) {
    for (const listener of this.listeners) listener(cloneRuntime(snapshot));
    return snapshot;
  }
}
