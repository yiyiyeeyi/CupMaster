import {
  BrewRuntimeController,
  type BrewRuntimeControllerOptions,
} from "./brew-runtime-controller";
import type {
  BrewSessionRuntime,
  NormalizedRect,
  PourState,
} from "@/domain/brew-runtime";
import type {
  CameraCaptureService,
  CameraCaptureSnapshot,
  FrameAnalysisService,
  FrameAnalysisSnapshot,
  FrameSampler,
  FrameSamplerSnapshot,
  VideoFrameSample,
} from "@/infrastructure/camera";

export const DEFAULT_VISION_QA_ROI: Readonly<NormalizedRect> = {
  x: 0.2,
  y: 0.2,
  width: 0.6,
  height: 0.6,
};

export const VISION_QA_HISTORY_LIMIT = 200;
export const VISION_QA_EVENT_LIMIT = 50;

export interface VisionQaNumericSample {
  timestampMs: number;
  motion: number;
  evidence: number;
  confidence: number;
  detectedState: PourState;
  suspiciousGlobalMotion: boolean;
  suspectedLightingChange: boolean;
}

export interface VisionQaEvent {
  timestampMs: number;
  label: string;
}

export interface VisionQaSummary {
  roi: NormalizedRect;
  durationMs: number;
  minEvidence: number;
  maxEvidence: number;
  startTransitions: number;
  stopTransitions: number;
  globalMotionEvents: number;
  lightingEvents: number;
}

export interface VisionQaSnapshot {
  camera: CameraCaptureSnapshot;
  sampler: FrameSamplerSnapshot | null;
  analysis: FrameAnalysisSnapshot;
  runtime: BrewSessionRuntime;
  roi: NormalizedRect;
  history: VisionQaNumericSample[];
  events: VisionQaEvent[];
  brewStarted: boolean;
}

interface CameraPort {
  start(): Promise<CameraCaptureSnapshot>;
  attachToVideo(video: HTMLVideoElement): Promise<void>;
  stop(): CameraCaptureSnapshot;
  getSnapshot(): CameraCaptureSnapshot;
  subscribe(listener: (snapshot: CameraCaptureSnapshot) => void): () => void;
}

interface SamplerPort {
  start(): void;
  stop(): void;
  subscribe(listener: (sample: Readonly<VideoFrameSample>) => void): () => void;
  getSnapshot(): FrameSamplerSnapshot;
}

interface AnalyzerPort {
  analyze(sample: Readonly<VideoFrameSample>): {
    timestampMs: number;
    roiMotionScore: number;
    pourEvidence: number;
    analysisConfidence: number;
  };
  setRoi(roi: NormalizedRect): void;
  reset(): void;
  getSnapshot(): FrameAnalysisSnapshot;
}

interface ControllerPort {
  start(timestampMs: number): BrewSessionRuntime;
  cameraReady(timestampMs: number): BrewSessionRuntime;
  handleVisionFrame(frame: ReturnType<AnalyzerPort["analyze"]>): BrewSessionRuntime;
  manualPourStart(timestampMs: number): BrewSessionRuntime;
  manualPourStop(timestampMs: number): BrewSessionRuntime;
  manualAdvanceStage(timestampMs: number): BrewSessionRuntime;
  resetDetection(): void;
  getSnapshot(): BrewSessionRuntime;
  subscribe(listener: (snapshot: BrewSessionRuntime) => void): () => void;
}

export interface VisionQaSessionOptions {
  camera: CameraPort | CameraCaptureService;
  analyzer: AnalyzerPort | FrameAnalysisService;
  createSampler: (video: HTMLVideoElement) => SamplerPort | FrameSampler;
  createController: () => ControllerPort | BrewRuntimeController;
  now: () => number;
}

type VisionQaListener = (snapshot: VisionQaSnapshot) => void;

interface VisionQaSummaryAccumulator {
  firstTimestampMs?: number;
  lastTimestampMs?: number;
  minEvidence: number;
  maxEvidence: number;
  startTransitions: number;
  stopTransitions: number;
  globalMotionEvents: number;
  lightingEvents: number;
}

function emptySummaryAccumulator(): VisionQaSummaryAccumulator {
  return {
    minEvidence: 1,
    maxEvidence: 0,
    startTransitions: 0,
    stopTransitions: 0,
    globalMotionEvents: 0,
    lightingEvents: 0,
  };
}

export function createVisionQaController() {
  const options: BrewRuntimeControllerOptions = {
    sessionId: "vision-qa-session",
    mode: "camera_assisted",
    recipe: {
      recipeId: "vision-qa-recipe",
      recipeName: "Vision QA Three-stage Brew",
      completeAfterLastPourStops: true,
      stages: ["Bloom", "Pour 2", "Pour 3"].map((name, order) => ({
        id: `vision-stage-${order + 1}`,
        order,
        name,
        autoAdvanceEnabled: true,
      })),
    },
  };
  return new BrewRuntimeController(options);
}

export class VisionQaSession {
  private readonly camera: CameraPort;
  private readonly analyzer: AnalyzerPort;
  private readonly createSampler: VisionQaSessionOptions["createSampler"];
  private readonly createController: VisionQaSessionOptions["createController"];
  private readonly now: () => number;
  private controller: ControllerPort;
  private sampler: SamplerPort | null = null;
  private video: HTMLVideoElement | null = null;
  private roi: NormalizedRect = { ...DEFAULT_VISION_QA_ROI };
  private history: VisionQaNumericSample[] = [];
  private events: VisionQaEvent[] = [];
  private summary = emptySummaryAccumulator();
  private brewStarted = false;
  private readonly listeners = new Set<VisionQaListener>();
  private cameraUnsubscribe: (() => void) | null = null;
  private samplerUnsubscribe: (() => void) | null = null;
  private controllerUnsubscribe: (() => void) | null = null;

  constructor(options: VisionQaSessionOptions) {
    this.camera = options.camera;
    this.analyzer = options.analyzer;
    this.createSampler = options.createSampler;
    this.createController = options.createController;
    this.now = options.now;
    this.controller = this.createController();
    this.cameraUnsubscribe = this.camera.subscribe(() => this.publish());
    this.subscribeToController();
  }

  async startCamera(video: HTMLVideoElement) {
    const camera = await this.camera.start();
    if (camera.state !== "ready") {
      this.publish();
      return camera;
    }
    await this.camera.attachToVideo(video);
    this.replaceSampler(video);
    this.sampler!.start();
    this.publish();
    return camera;
  }

  stopCamera() {
    this.sampler?.stop();
    this.camera.stop();
    this.analyzer.reset();
    if (this.video) this.video.srcObject = null;
    this.publish();
  }

  startBrew() {
    const timestampMs = this.now();
    this.controller.resetDetection();
    this.controller.start(timestampMs);
    this.controller.cameraReady(timestampMs);
    this.brewStarted = true;
    this.addEvent(timestampMs, "TEST BREW STARTED");
    this.publish();
  }

  setRoi(roi: NormalizedRect) {
    this.roi = { ...roi };
    this.analyzer.setRoi(this.roi);
    this.addEvent(this.now(), "ROI UPDATED / BASELINE RESET");
    this.publish();
  }

  manualPourStart() {
    const timestampMs = this.now();
    const before = this.controller.getSnapshot();
    const after = this.controller.manualPourStart(timestampMs);
    this.captureTransitions(before, after, timestampMs);
    this.publish();
  }

  manualPourStop() {
    const timestampMs = this.now();
    const before = this.controller.getSnapshot();
    const after = this.controller.manualPourStop(timestampMs);
    this.captureTransitions(before, after, timestampMs);
    this.publish();
  }

  manualAdvanceStage() {
    const timestampMs = this.now();
    const before = this.controller.getSnapshot();
    const after = this.controller.manualAdvanceStage(timestampMs);
    this.captureTransitions(before, after, timestampMs);
    this.publish();
  }

  resetDetection() {
    this.controller.resetDetection();
    this.addEvent(this.now(), "DETECTION RESET");
    this.publish();
  }

  resetSession() {
    this.controllerUnsubscribe?.();
    this.controller = this.createController();
    this.subscribeToController();
    this.analyzer.reset();
    this.history = [];
    this.events = [];
    this.summary = emptySummaryAccumulator();
    this.brewStarted = false;
    this.publish();
  }

  getSummary(): VisionQaSummary {
    const first = this.summary.firstTimestampMs;
    const last = this.summary.lastTimestampMs;
    return {
      roi: { ...this.roi },
      durationMs: first === undefined || last === undefined ? 0 : Math.max(0, last - first),
      minEvidence: first === undefined ? 0 : this.summary.minEvidence,
      maxEvidence: first === undefined ? 0 : this.summary.maxEvidence,
      startTransitions: this.summary.startTransitions,
      stopTransitions: this.summary.stopTransitions,
      globalMotionEvents: this.summary.globalMotionEvents,
      lightingEvents: this.summary.lightingEvents,
    };
  }

  getSnapshot(): VisionQaSnapshot {
    return {
      camera: this.camera.getSnapshot(),
      sampler: this.sampler?.getSnapshot() ?? null,
      analysis: this.analyzer.getSnapshot(),
      runtime: this.controller.getSnapshot(),
      roi: { ...this.roi },
      history: this.history.map((sample) => ({ ...sample })),
      events: this.events.map((event) => ({ ...event })),
      brewStarted: this.brewStarted,
    };
  }

  subscribe(listener: VisionQaListener) {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  dispose() {
    this.sampler?.stop();
    this.camera.stop();
    if (this.video) this.video.srcObject = null;
    this.samplerUnsubscribe?.();
    this.cameraUnsubscribe?.();
    this.controllerUnsubscribe?.();
    this.listeners.clear();
  }

  private replaceSampler(video: HTMLVideoElement) {
    this.sampler?.stop();
    this.samplerUnsubscribe?.();
    this.video = video;
    this.sampler = this.createSampler(video);
    this.samplerUnsubscribe = this.sampler.subscribe((sample) => this.handleSample(sample));
  }

  private handleSample(sample: Readonly<VideoFrameSample>) {
    const analysis = this.analyzer.analyze(sample);
    const diagnostics = this.analyzer.getSnapshot();
    const before = this.controller.getSnapshot();
    const runtime = this.brewStarted
      ? this.controller.handleVisionFrame(analysis)
      : before;
    const detectedState = runtime.detection.observedState ?? runtime.pourState;
    this.history = [...this.history, {
      timestampMs: analysis.timestampMs,
      motion: analysis.roiMotionScore,
      evidence: analysis.pourEvidence,
      confidence: analysis.analysisConfidence,
      detectedState,
      suspiciousGlobalMotion: diagnostics.suspiciousGlobalMotion,
      suspectedLightingChange: diagnostics.suspectedLightingChange,
    }].slice(-VISION_QA_HISTORY_LIMIT);
    this.summary = {
      ...this.summary,
      firstTimestampMs: this.summary.firstTimestampMs ?? analysis.timestampMs,
      lastTimestampMs: analysis.timestampMs,
      minEvidence: Math.min(this.summary.minEvidence, analysis.pourEvidence),
      maxEvidence: Math.max(this.summary.maxEvidence, analysis.pourEvidence),
      globalMotionEvents: this.summary.globalMotionEvents + Number(diagnostics.suspiciousGlobalMotion),
      lightingEvents: this.summary.lightingEvents + Number(diagnostics.suspectedLightingChange),
    };
    this.captureTransitions(before, runtime, analysis.timestampMs);
    this.publish();
  }

  private captureTransitions(before: BrewSessionRuntime, after: BrewSessionRuntime, timestampMs: number) {
    if (before.pourState !== after.pourState) {
      const started = after.pourState === "pouring";
      this.addEvent(timestampMs, started ? "POUR_STARTED" : "POUR_STOPPED");
      this.summary = {
        ...this.summary,
        startTransitions: this.summary.startTransitions + Number(started),
        stopTransitions: this.summary.stopTransitions + Number(!started),
      };
    }
    if (before.currentStageIndex !== after.currentStageIndex && after.currentStageIndex !== null) {
      this.addEvent(timestampMs, `STAGE ${after.currentStageIndex + 1} POURING`);
    }
    const completedIndex = after.stages.findIndex((stage, index) => stage.completed && !before.stages[index]?.completed);
    if (completedIndex >= 0) this.addEvent(timestampMs, `STAGE ${completedIndex + 1} COMPLETED`);
  }

  private addEvent(timestampMs: number, label: string) {
    this.events = [...this.events, { timestampMs, label }].slice(-VISION_QA_EVENT_LIMIT);
  }

  private subscribeToController() {
    this.controllerUnsubscribe = this.controller.subscribe(() => this.publish());
  }

  private publish() {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
