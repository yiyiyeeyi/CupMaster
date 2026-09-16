import type { PourDetectionSnapshot, VisionFrameAnalysis } from "./brew-runtime-types";
import {
  DEFAULT_POUR_DETECTION_THRESHOLDS,
  type PourDetectionThresholds,
} from "./brew-runtime-thresholds";

export type PourDetectionTransition = "POUR_STARTED" | "POUR_STOPPED" | null;

export interface PourDetectionResult {
  snapshot: PourDetectionSnapshot;
  transition: PourDetectionTransition;
}

type ConfirmedPourState = "not_pouring" | "pouring";
type EvidenceSignal = "positive" | "negative" | "uncertain";

function validateThresholds(thresholds: PourDetectionThresholds) {
  const values = [thresholds.startEvidenceThreshold, thresholds.stopEvidenceThreshold];
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new RangeError("Pour evidence thresholds must be finite values from 0 to 1.");
  }
  if (thresholds.stopEvidenceThreshold >= thresholds.startEvidenceThreshold) {
    throw new RangeError("Stop evidence threshold must be lower than start evidence threshold.");
  }
  if (!Number.isInteger(thresholds.minPositiveFramesForStart) || thresholds.minPositiveFramesForStart < 1
    || !Number.isInteger(thresholds.minNegativeFramesForStop) || thresholds.minNegativeFramesForStop < 1) {
    throw new RangeError("Pour frame thresholds must be positive integers.");
  }
}

export class PourDetectionService {
  private readonly thresholds: PourDetectionThresholds;
  private confirmedState: ConfirmedPourState = "not_pouring";
  private positiveFrames = 0;
  private negativeFrames = 0;

  constructor(thresholds: PourDetectionThresholds = DEFAULT_POUR_DETECTION_THRESHOLDS) {
    validateThresholds(thresholds);
    this.thresholds = { ...thresholds };
  }

  process(frame: VisionFrameAnalysis): PourDetectionResult {
    const finiteEvidence = Number.isFinite(frame.pourEvidence);
    const evidence = finiteEvidence
      ? Math.min(1, Math.max(0, frame.pourEvidence))
      : (this.thresholds.startEvidenceThreshold + this.thresholds.stopEvidenceThreshold) / 2;
    const signal: EvidenceSignal = !finiteEvidence
      ? "uncertain"
      : evidence >= this.thresholds.startEvidenceThreshold
        ? "positive"
        : evidence <= this.thresholds.stopEvidenceThreshold
          ? "negative"
          : "uncertain";

    let transition: PourDetectionTransition = null;
    if (signal === "positive") {
      this.positiveFrames += 1;
      this.negativeFrames = 0;
      if (this.confirmedState === "not_pouring" && this.positiveFrames >= this.thresholds.minPositiveFramesForStart) {
        this.confirmedState = "pouring";
        this.positiveFrames = 0;
        this.negativeFrames = 0;
        transition = "POUR_STARTED";
      }
    } else if (signal === "negative") {
      this.negativeFrames += 1;
      this.positiveFrames = 0;
      if (this.confirmedState === "pouring" && this.negativeFrames >= this.thresholds.minNegativeFramesForStop) {
        this.confirmedState = "not_pouring";
        this.positiveFrames = 0;
        this.negativeFrames = 0;
        transition = "POUR_STOPPED";
      }
    } else {
      this.positiveFrames = 0;
      this.negativeFrames = 0;
    }

    return {
      snapshot: {
        timestampMs: frame.timestampMs,
        state: signal === "uncertain" ? "uncertain" : this.confirmedState,
        rawEvidence: evidence,
        consecutivePositiveFrames: this.positiveFrames,
        consecutiveNegativeFrames: this.negativeFrames,
        confidence: frame.analysisConfidence,
      },
      transition,
    };
  }

  reset() {
    this.confirmedState = "not_pouring";
    this.positiveFrames = 0;
    this.negativeFrames = 0;
  }
}
