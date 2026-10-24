export type BrewRuntimeMode = "manual" | "camera_assisted";

export type BrewRuntimeState =
  | "idle"
  | "camera_initializing"
  | "waiting_for_first_pour"
  | "pouring"
  | "paused_between_pours"
  | "paused"
  | "completed"
  | "error";

export type ResumableBrewRuntimeState = Exclude<BrewRuntimeState, "idle" | "paused" | "completed" | "error">;

export type PourState = "not_pouring" | "uncertain" | "pouring";
export type DetectionMethod = "camera" | "manual" | "mixed";

/** Camera-space point normalized to the inclusive 0–1 range. */
export interface Point2D {
  x: number;
  y: number;
}

/** Camera-space rectangle normalized to the inclusive 0–1 range. */
export interface NormalizedRect extends Point2D {
  width: number;
  height: number;
}

export interface BrewCameraCalibration {
  roi: NormalizedRect;
  dripperCenter?: Point2D;
  frameWidth: number;
  frameHeight: number;
  calibratedAt: string;
}

export interface BrewRecipeStageDefinition {
  id: string;
  order: number;
  name: string;
  targetPourDurationMs?: number;
  targetPauseAfterMs?: number;
  autoAdvanceEnabled: boolean;
  guidance?: BrewStageGuidance;
}

export interface BrewStageGuidanceDetail {
  id: string;
  atElapsedMs: number;
  message: string;
}

export interface BrewStageGuidance {
  start?: string;
  end?: string;
  details?: BrewStageGuidanceDetail[];
}

export type BrewGuidanceMoment = "step_start" | "step_detail" | "step_end";

export interface BrewGuidanceEvent {
  id: string;
  sequence: number;
  runNumber: number;
  timestampMs: number;
  moment: BrewGuidanceMoment;
  stageId: string;
  stageOrder: number;
  stageName: string;
  message: string;
  detailId?: string;
  scheduledElapsedMs?: number;
}

export interface BrewRecipeRuntimeDefinition {
  recipeId: string;
  recipeName: string;
  stages: BrewRecipeStageDefinition[];
  completeAfterLastPourStops: boolean;
}

/** Domain analysis output only. It intentionally contains no raw frame or browser media object. */
export interface VisionFrameAnalysis {
  timestampMs: number;
  roiMotionScore: number;
  spoutDetected?: boolean;
  spoutPosition?: Point2D;
  waterStreamDetected?: boolean;
  waterStreamConfidence?: number;
  pourEvidence: number;
  analysisConfidence: number;
}

export interface PourDetectionSnapshot {
  timestampMs: number;
  state: PourState;
  rawEvidence: number;
  consecutivePositiveFrames: number;
  consecutiveNegativeFrames: number;
  confidence: number;
}

export interface BrewStageRuntimeRecord {
  stageId: string;
  order: number;
  name: string;
  startedAtMs?: number;
  endedAtMs?: number;
  pourDurationMs?: number;
  pauseAfterMs?: number;
  detectionMethod?: DetectionMethod;
  pausedDurationMs: number;
  pausedAtMs?: number;
  completed: boolean;
}

export interface BrewSessionRuntime {
  sessionId: string;
  mode: BrewRuntimeMode;
  runNumber: number;
  state: BrewRuntimeState;
  stateBeforePause?: ResumableBrewRuntimeState;
  recipe: BrewRecipeRuntimeDefinition;
  calibration?: BrewCameraCalibration;
  startedAtMs?: number;
  completedAtMs?: number;
  pausedAtMs?: number;
  accumulatedPauseMs: number;
  currentStageIndex: number | null;
  pourState: PourState;
  lastPourStartedAtMs?: number;
  lastPourStoppedAtMs?: number;
  stages: BrewStageRuntimeRecord[];
  detection: {
    lastFrameTimestampMs?: number;
    observedState?: PourState;
    consecutivePositiveFrames: number;
    consecutiveNegativeFrames: number;
    confidence: number;
  };
  manualOverrideUsed: boolean;
  guidanceEvents: BrewGuidanceEvent[];
  nextGuidanceSequence: number;
  errors: string[];
}

/** Reserved for a future path-analysis task. */
export interface PourPathPoint extends Point2D {
  timestampMs: number;
  confidence: number;
}
