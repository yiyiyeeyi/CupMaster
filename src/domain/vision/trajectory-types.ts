import type { Point2D } from "./hybrid-runtime-contract";

export interface SpoutTipObservation {
  timestampMs: number;
  tip: Point2D | null;
  confidence: number;
}

export interface DripperNormalizedPoint extends Point2D {
  radius: number;
  angleRadians: number;
}

export type TrajectorySampleStatus = "observed" | "uncertain" | "missing" | "outlier";

export interface TrajectoryHistorySample {
  timestampMs: number;
  confidence: number;
  status: TrajectorySampleStatus;
  observed: DripperNormalizedPoint | null;
  smoothed: DripperNormalizedPoint | null;
}

export interface TrajectoryMotionFeatures {
  radialDelta: number;
  angularDeltaRadians: number;
  radialVelocityPerSecond: number;
  angularVelocityRadiansPerSecond: number;
  movementSpeedPerSecond: number;
  continuity: number;
  meanConfidence: number;
  sampleCount: number;
}

export type RadialTrend = "INWARD" | "OUTWARD" | "STABLE_RADIUS" | "UNKNOWN";
export type AngularDirection = "CLOCKWISE" | "COUNTERCLOCKWISE" | "UNKNOWN";
export type MovementState = "STATIONARY" | "MOVING" | "UNKNOWN";
export type TrajectoryForm = "CIRCULAR" | "INWARD_SPIRAL" | "OUTWARD_SPIRAL" | "UNDETERMINED";
export type TrajectoryReliability = "RELIABLE" | "DEGRADED" | "UNRELIABLE";

export interface TrajectoryCoachingState {
  timestampMs: number;
  position: DripperNormalizedPoint | null;
  radialTrend: RadialTrend;
  angularDirection: AngularDirection;
  movementState: MovementState;
  trajectoryForm: TrajectoryForm;
  reliability: TrajectoryReliability;
  evidenceDurationMs: number;
  features: TrajectoryMotionFeatures | null;
}

export interface TrajectoryEngineConfig {
  minimumConfidence: number;
  smoothingTimeConstantMs: number;
  maximumBridgeGapMs: number;
  maximumNormalizedSpeedPerSecond: number;
  featureWindowMs: number;
  minimumEvidenceDurationMs: number;
  minimumFeatureSamples: number;
  behaviorHoldMs: number;
  radialVelocityEnterThreshold: number;
  radialVelocityExitThreshold: number;
  angularVelocityEnterThreshold: number;
  angularVelocityExitThreshold: number;
  movementSpeedEnterThreshold: number;
  movementSpeedExitThreshold: number;
}

/** Injection seam for a future CV adapter. It has no browser, model, or UI dependency. */
export interface SpoutTrajectoryObservationConsumer {
  acceptObservation(observation: SpoutTipObservation): TrajectoryCoachingState;
  reset(): void;
}
