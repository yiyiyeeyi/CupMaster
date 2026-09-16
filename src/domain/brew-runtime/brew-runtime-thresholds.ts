export interface PourDetectionThresholds {
  startEvidenceThreshold: number;
  stopEvidenceThreshold: number;
  minPositiveFramesForStart: number;
  minNegativeFramesForStop: number;
}

export const DEFAULT_POUR_DETECTION_THRESHOLDS: PourDetectionThresholds = {
  startEvidenceThreshold: 0.65,
  stopEvidenceThreshold: 0.35,
  minPositiveFramesForStart: 4,
  minNegativeFramesForStop: 6,
};
