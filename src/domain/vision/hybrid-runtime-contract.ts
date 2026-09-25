export interface ImageSize {
  width: number;
  height: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface BoundingBox extends Point2D {
  width: number;
  height: number;
}

export interface VisionFrame<TPayload = unknown> {
  frameId: string;
  timestampMs: number;
  size: ImageSize;
  payload: TPayload;
}

export type DetectionResult =
  | { kind: "detected"; bbox: BoundingBox; confidence: number }
  | { kind: "not_detected"; confidence: number };

export type KeypointResult =
  | { kind: "located"; point: Point2D; confidence: number; visibility: "visible" | "occluded" }
  | { kind: "not_located"; confidence: number };

export type TrackingResult<TState> =
  | { kind: "tracked"; point: Point2D; quality: number; state: TState }
  | { kind: "lost"; quality: number; state: TState };

export interface SpoutDetector<TPayload = unknown> {
  detect(frame: VisionFrame<TPayload>): Promise<DetectionResult>;
}

export interface SpoutTipLocalizer<TPayload = unknown> {
  locate(frame: VisionFrame<TPayload>, roi: BoundingBox | null): Promise<KeypointResult>;
}

export interface SpoutTipTracker<TPayload = unknown, TState = unknown> {
  initialize(frame: VisionFrame<TPayload>, point: Point2D): Promise<TState>;
  update(frame: VisionFrame<TPayload>, previousState: TState): Promise<TrackingResult<TState>>;
  reset(): void;
}

export type HybridRuntimeMode =
  | "keypoint_only"
  | "detection_keypoint"
  | "detection_keypoint_tracking";

export type HybridVisionDependencies<TPayload = unknown, TState = unknown> =
  | {
    mode: "keypoint_only";
    keypoint: SpoutTipLocalizer<TPayload>;
  }
  | {
    mode: "detection_keypoint";
    detector: SpoutDetector<TPayload>;
    keypoint: SpoutTipLocalizer<TPayload>;
  }
  | {
    mode: "detection_keypoint_tracking";
    detector: SpoutDetector<TPayload>;
    keypoint: SpoutTipLocalizer<TPayload>;
    tracker: SpoutTipTracker<TPayload, TState>;
  };

export interface HybridRuntimeConfig {
  mode: HybridRuntimeMode;
  detectorPollingHz: number;
  trackerTargetHz: number;
  keypointRefreshHz: number;
  detectorConfidenceThreshold: number;
  keypointConfidenceThreshold: number;
  trackerQualityThreshold: number;
  initialConfirmationFrames: number;
  reacquisitionConfirmationFrames: number;
  trackerFailureTimeoutMs: number;
  maxLocalRelocalizationAttempts: number;
  antiDriftMaxCorrectionBboxDiagonalRatio: number;
}

const BASE_EXPERIMENT_CONFIG = {
  detectorPollingHz: 2,
  trackerTargetHz: 30,
  keypointRefreshHz: 5,
  detectorConfidenceThreshold: 0.45,
  keypointConfidenceThreshold: 0.55,
  trackerQualityThreshold: 0.5,
  initialConfirmationFrames: 3,
  reacquisitionConfirmationFrames: 2,
  trackerFailureTimeoutMs: 400,
  maxLocalRelocalizationAttempts: 2,
  antiDriftMaxCorrectionBboxDiagonalRatio: 0.2,
} as const;

export function createExperimentalRuntimeConfig(
  mode: HybridRuntimeMode,
  overrides: Partial<Omit<HybridRuntimeConfig, "mode">> = {},
): HybridRuntimeConfig {
  const config: HybridRuntimeConfig = { ...BASE_EXPERIMENT_CONFIG, ...overrides, mode };
  validateRuntimeConfig(config);
  return config;
}

export function validateRuntimeConfig(config: HybridRuntimeConfig): void {
  const positiveValues = [
    config.detectorPollingHz,
    config.trackerTargetHz,
    config.keypointRefreshHz,
    config.trackerFailureTimeoutMs,
    config.antiDriftMaxCorrectionBboxDiagonalRatio,
  ];
  if (positiveValues.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new RangeError("Runtime frequencies, timeouts, and correction limits must be positive and finite.");
  }

  const probabilities = [
    config.detectorConfidenceThreshold,
    config.keypointConfidenceThreshold,
    config.trackerQualityThreshold,
  ];
  if (probabilities.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new RangeError("Runtime confidence and quality thresholds must be finite values from 0 to 1.");
  }

  const counts = [
    config.initialConfirmationFrames,
    config.reacquisitionConfirmationFrames,
    config.maxLocalRelocalizationAttempts,
  ];
  if (counts.some((value) => !Number.isInteger(value) || value < 1)) {
    throw new RangeError("Runtime confirmation and attempt limits must be positive integers.");
  }
}

export const HYBRID_RUNTIME_STATES = [
  "ABSENT",
  "SEARCHING",
  "ACQUIRING",
  "TRACKING",
  "UNCERTAIN",
  "LOST",
  "REACQUIRED",
] as const;

export type HybridRuntimeState = (typeof HYBRID_RUNTIME_STATES)[number];

export type HybridRuntimeEvent =
  | "BEGIN_SEARCH"
  | "SEARCH_MISS"
  | "CANDIDATE_FOUND"
  | "CANDIDATE_REJECTED"
  | "ACQUISITION_CONFIRMED"
  | "REACQUISITION_CONFIRMED"
  | "CONFIDENCE_DEGRADED"
  | "LOCAL_RECOVERED"
  | "LOCAL_RECOVERY_EXHAUSTED"
  | "REACQUISITION_STABILIZED"
  | "STOP";

type TransitionKey = `${HybridRuntimeState}:${HybridRuntimeEvent}`;

const TRANSITIONS: Readonly<Partial<Record<TransitionKey, HybridRuntimeState>>> = {
  "ABSENT:BEGIN_SEARCH": "SEARCHING",
  "SEARCHING:SEARCH_MISS": "SEARCHING",
  "SEARCHING:CANDIDATE_FOUND": "ACQUIRING",
  "ACQUIRING:CANDIDATE_REJECTED": "SEARCHING",
  "ACQUIRING:ACQUISITION_CONFIRMED": "TRACKING",
  "ACQUIRING:REACQUISITION_CONFIRMED": "REACQUIRED",
  "TRACKING:CONFIDENCE_DEGRADED": "UNCERTAIN",
  "UNCERTAIN:LOCAL_RECOVERED": "TRACKING",
  "UNCERTAIN:LOCAL_RECOVERY_EXHAUSTED": "LOST",
  "LOST:SEARCH_MISS": "LOST",
  "LOST:CANDIDATE_FOUND": "ACQUIRING",
  "REACQUIRED:REACQUISITION_STABILIZED": "TRACKING",
  "REACQUIRED:CONFIDENCE_DEGRADED": "UNCERTAIN",
};

export function nextHybridRuntimeState(
  state: HybridRuntimeState,
  event: HybridRuntimeEvent,
): HybridRuntimeState {
  if (event === "STOP") {
    return "ABSENT";
  }
  const next = TRANSITIONS[`${state}:${event}`];
  if (next === undefined) {
    throw new Error(`Invalid hybrid runtime transition: ${state} + ${event}`);
  }
  return next;
}
