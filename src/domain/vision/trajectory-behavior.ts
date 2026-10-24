import { wrappedAngularDelta } from "./trajectory-normalization";
import type {
  AngularDirection,
  DripperNormalizedPoint,
  MovementState,
  RadialTrend,
  TrajectoryEngineConfig,
  TrajectoryForm,
  TrajectoryMotionFeatures,
} from "./trajectory-types";

export interface TrajectoryFeatureSample {
  timestampMs: number;
  confidence: number;
  point: DripperNormalizedPoint;
}

export function deriveTrajectoryMotionFeatures(
  samples: readonly TrajectoryFeatureSample[],
  continuity = 1,
): TrajectoryMotionFeatures | null {
  if (samples.length < 2) return null;
  const first = samples[0];
  const last = samples.at(-1);
  if (last === undefined) return null;
  const durationMs = last.timestampMs - first.timestampMs;
  if (durationMs <= 0) return null;

  let angularDeltaRadians = 0;
  let pathDistance = 0;
  let coveredDurationMs = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    angularDeltaRadians += wrappedAngularDelta(previous.point.angleRadians, current.point.angleRadians);
    pathDistance += Math.hypot(current.point.x - previous.point.x, current.point.y - previous.point.y);
    coveredDurationMs += current.timestampMs - previous.timestampMs;
  }

  const durationSeconds = durationMs / 1_000;
  return {
    radialDelta: last.point.radius - first.point.radius,
    angularDeltaRadians,
    radialVelocityPerSecond: (last.point.radius - first.point.radius) / durationSeconds,
    angularVelocityRadiansPerSecond: angularDeltaRadians / durationSeconds,
    movementSpeedPerSecond: pathDistance / durationSeconds,
    continuity: Math.min(1, coveredDurationMs / durationMs) * continuity,
    meanConfidence: samples.reduce((sum, sample) => sum + sample.confidence, 0) / samples.length,
    sampleCount: samples.length,
  };
}

export function classifyRadialTrend(
  velocity: number,
  current: RadialTrend,
  config: TrajectoryEngineConfig,
): RadialTrend {
  if (velocity <= -config.radialVelocityEnterThreshold) return "INWARD";
  if (velocity >= config.radialVelocityEnterThreshold) return "OUTWARD";
  if (Math.abs(velocity) <= config.radialVelocityExitThreshold) return "STABLE_RADIUS";
  return current;
}

export function classifyAngularDirection(
  velocity: number,
  current: AngularDirection,
  config: TrajectoryEngineConfig,
): AngularDirection {
  // Image y grows downward, so increasing atan2 angle is visually clockwise.
  if (velocity >= config.angularVelocityEnterThreshold) return "CLOCKWISE";
  if (velocity <= -config.angularVelocityEnterThreshold) return "COUNTERCLOCKWISE";
  if (Math.abs(velocity) <= config.angularVelocityExitThreshold) return "UNKNOWN";
  return current;
}

export function classifyMovementState(
  speed: number,
  current: MovementState,
  config: TrajectoryEngineConfig,
): MovementState {
  if (speed >= config.movementSpeedEnterThreshold) return "MOVING";
  if (speed <= config.movementSpeedExitThreshold) return "STATIONARY";
  return current;
}

export function deriveTrajectoryForm(
  radialTrend: RadialTrend,
  angularDirection: AngularDirection,
  movementState: MovementState,
): TrajectoryForm {
  if (movementState !== "MOVING" || angularDirection === "UNKNOWN") return "UNDETERMINED";
  if (radialTrend === "INWARD") return "INWARD_SPIRAL";
  if (radialTrend === "OUTWARD") return "OUTWARD_SPIRAL";
  return radialTrend === "STABLE_RADIUS" ? "CIRCULAR" : "UNDETERMINED";
}
