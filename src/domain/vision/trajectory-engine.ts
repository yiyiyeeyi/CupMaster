import type { ManualDripperCalibration } from "./manual-dripper-contract";
import {
  classifyAngularDirection,
  classifyMovementState,
  classifyRadialTrend,
  deriveTrajectoryForm,
  deriveTrajectoryMotionFeatures,
  type TrajectoryFeatureSample,
} from "./trajectory-behavior";
import { normalizePointToDripperEllipse } from "./trajectory-normalization";
import type {
  AngularDirection,
  DripperNormalizedPoint,
  MovementState,
  RadialTrend,
  SpoutTipObservation,
  SpoutTrajectoryObservationConsumer,
  TrajectoryCoachingState,
  TrajectoryEngineConfig,
  TrajectoryHistorySample,
  TrajectoryMotionFeatures,
  TrajectoryReliability,
} from "./trajectory-types";

export const DEFAULT_TRAJECTORY_ENGINE_CONFIG: Readonly<TrajectoryEngineConfig> = {
  minimumConfidence: 0.5,
  smoothingTimeConstantMs: 140,
  maximumBridgeGapMs: 300,
  maximumNormalizedSpeedPerSecond: 5,
  featureWindowMs: 900,
  minimumEvidenceDurationMs: 300,
  minimumFeatureSamples: 4,
  behaviorHoldMs: 200,
  radialVelocityEnterThreshold: 0.16,
  radialVelocityExitThreshold: 0.07,
  angularVelocityEnterThreshold: 0.45,
  angularVelocityExitThreshold: 0.2,
  movementSpeedEnterThreshold: 0.18,
  movementSpeedExitThreshold: 0.08,
};

interface PendingState<T> {
  value: T;
  sinceMs: number;
}

function validateConfig(config: TrajectoryEngineConfig): void {
  const probabilities = [config.minimumConfidence];
  if (probabilities.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new RangeError("Trajectory confidence thresholds must be between 0 and 1.");
  }
  const positive = [
    config.smoothingTimeConstantMs,
    config.maximumBridgeGapMs,
    config.maximumNormalizedSpeedPerSecond,
    config.featureWindowMs,
    config.minimumEvidenceDurationMs,
    config.radialVelocityEnterThreshold,
    config.radialVelocityExitThreshold,
    config.angularVelocityEnterThreshold,
    config.angularVelocityExitThreshold,
    config.movementSpeedEnterThreshold,
    config.movementSpeedExitThreshold,
  ];
  if (positive.some((value) => !Number.isFinite(value) || value <= 0)
    || !Number.isFinite(config.behaviorHoldMs) || config.behaviorHoldMs < 0
    || !Number.isInteger(config.minimumFeatureSamples) || config.minimumFeatureSamples < 2) {
    throw new RangeError("Trajectory timing, motion, and sample thresholds must be valid positive values.");
  }
  if (config.radialVelocityExitThreshold >= config.radialVelocityEnterThreshold
    || config.angularVelocityExitThreshold >= config.angularVelocityEnterThreshold
    || config.movementSpeedExitThreshold >= config.movementSpeedEnterThreshold) {
    throw new RangeError("Each exit threshold must be lower than its enter threshold.");
  }
}

function normalizedPoint(x: number, y: number): DripperNormalizedPoint {
  return { x, y, radius: Math.hypot(x, y), angleRadians: Math.atan2(y, x) };
}

export class DripperTrajectoryEngine implements SpoutTrajectoryObservationConsumer {
  private readonly config: TrajectoryEngineConfig;
  private readonly history: TrajectoryHistorySample[] = [];
  private featureSamples: TrajectoryFeatureSample[] = [];
  private lastAccepted: TrajectoryFeatureSample | null = null;
  private radialState: RadialTrend = "UNKNOWN";
  private angularState: AngularDirection = "UNKNOWN";
  private movementState: MovementState = "UNKNOWN";
  private pendingRadial: PendingState<RadialTrend> | null = null;
  private pendingAngular: PendingState<AngularDirection> | null = null;
  private pendingMovement: PendingState<MovementState> | null = null;

  constructor(
    private readonly calibration: ManualDripperCalibration,
    config: Partial<TrajectoryEngineConfig> = {},
  ) {
    this.config = { ...DEFAULT_TRAJECTORY_ENGINE_CONFIG, ...config };
    validateConfig(this.config);
    normalizePointToDripperEllipse({ x: calibration.centerX, y: calibration.centerY }, calibration);
  }

  acceptObservation(observation: SpoutTipObservation): TrajectoryCoachingState {
    this.validateObservation(observation);
    const previousTimestamp = this.history.at(-1)?.timestampMs;
    if (previousTimestamp !== undefined && observation.timestampMs <= previousTimestamp) {
      throw new RangeError("Trajectory observations must have strictly increasing timestamps.");
    }

    if (observation.tip === null || observation.confidence < this.config.minimumConfidence) {
      const status = observation.tip === null ? "missing" : "uncertain";
      this.history.push({
        timestampMs: observation.timestampMs,
        confidence: observation.confidence,
        status,
        observed: observation.tip === null ? null : normalizePointToDripperEllipse(observation.tip, this.calibration),
        smoothed: null,
      });
      return this.stateForUnavailableObservation(observation.timestampMs);
    }

    const observed = normalizePointToDripperEllipse(observation.tip, this.calibration);
    const prior = this.lastAccepted;
    const gapMs = prior === null ? 0 : observation.timestampMs - prior.timestampMs;
    if (prior !== null && gapMs <= this.config.maximumBridgeGapMs) {
      const speed = Math.hypot(observed.x - prior.point.x, observed.y - prior.point.y) / (gapMs / 1_000);
      if (speed > this.config.maximumNormalizedSpeedPerSecond) {
        this.history.push({
          timestampMs: observation.timestampMs,
          confidence: observation.confidence,
          status: "outlier",
          observed,
          smoothed: null,
        });
        return this.currentState(observation.timestampMs, null, "DEGRADED");
      }
    }

    if (prior !== null && gapMs > this.config.maximumBridgeGapMs) {
      this.clearContinuity();
    }

    const activePrior = this.lastAccepted;
    const smoothed = activePrior === null
      ? observed
      : this.smooth(activePrior.point, observed, observation.timestampMs - activePrior.timestampMs);
    const accepted = { timestampMs: observation.timestampMs, confidence: observation.confidence, point: smoothed };
    this.lastAccepted = accepted;
    this.featureSamples.push(accepted);
    this.featureSamples = this.featureSamples.filter(
      (sample) => observation.timestampMs - sample.timestampMs <= this.config.featureWindowMs,
    );
    this.history.push({
      timestampMs: observation.timestampMs,
      confidence: observation.confidence,
      status: "observed",
      observed,
      smoothed,
    });

    const features = deriveTrajectoryMotionFeatures(this.featureSamples, this.windowContinuity(observation.timestampMs));
    const evidenceDurationMs = this.evidenceDurationMs();
    if (features !== null
      && features.sampleCount >= this.config.minimumFeatureSamples
      && evidenceDurationMs >= this.config.minimumEvidenceDurationMs) {
      this.updateBehavior(features, observation.timestampMs);
    }
    const reliability: TrajectoryReliability = evidenceDurationMs >= this.config.minimumEvidenceDurationMs
      && features !== null && features.sampleCount >= this.config.minimumFeatureSamples
      ? "RELIABLE"
      : "DEGRADED";
    return this.currentState(observation.timestampMs, features, reliability);
  }

  getHistory(): readonly TrajectoryHistorySample[] {
    return this.history;
  }

  reset(): void {
    this.history.length = 0;
    this.clearContinuity();
  }

  private validateObservation(observation: SpoutTipObservation): void {
    if (!Number.isFinite(observation.timestampMs) || observation.timestampMs < 0
      || !Number.isFinite(observation.confidence) || observation.confidence < 0 || observation.confidence > 1
      || (observation.tip !== null && (!Number.isFinite(observation.tip.x) || !Number.isFinite(observation.tip.y)))) {
      throw new RangeError("Observation timestamp, confidence, and optional tip coordinates must be valid finite values.");
    }
  }

  private smooth(
    previous: DripperNormalizedPoint,
    observed: DripperNormalizedPoint,
    elapsedMs: number,
  ): DripperNormalizedPoint {
    const alpha = 1 - Math.exp(-elapsedMs / this.config.smoothingTimeConstantMs);
    return normalizedPoint(
      previous.x + alpha * (observed.x - previous.x),
      previous.y + alpha * (observed.y - previous.y),
    );
  }

  private stateForUnavailableObservation(timestampMs: number): TrajectoryCoachingState {
    const gapMs = this.lastAccepted === null ? Number.POSITIVE_INFINITY : timestampMs - this.lastAccepted.timestampMs;
    if (gapMs > this.config.maximumBridgeGapMs) {
      this.clearContinuity();
      return this.currentState(timestampMs, null, "UNRELIABLE");
    }
    return this.currentState(
      timestampMs,
      deriveTrajectoryMotionFeatures(this.featureSamples, this.windowContinuity(timestampMs)),
      "DEGRADED",
    );
  }

  private currentState(
    timestampMs: number,
    features: TrajectoryMotionFeatures | null,
    reliability: TrajectoryReliability,
  ): TrajectoryCoachingState {
    return {
      timestampMs,
      position: this.history.at(-1)?.smoothed ?? null,
      radialTrend: this.radialState,
      angularDirection: this.angularState,
      movementState: this.movementState,
      trajectoryForm: deriveTrajectoryForm(this.radialState, this.angularState, this.movementState),
      reliability,
      evidenceDurationMs: this.evidenceDurationMs(),
      features,
    };
  }

  private evidenceDurationMs(): number {
    const first = this.featureSamples[0];
    const last = this.featureSamples.at(-1);
    return first === undefined || last === undefined ? 0 : last.timestampMs - first.timestampMs;
  }

  private windowContinuity(timestampMs: number): number {
    const firstTimestamp = this.featureSamples[0]?.timestampMs;
    if (firstTimestamp === undefined) return 0;
    const relevant = this.history.filter(
      (sample) => sample.timestampMs >= firstTimestamp && sample.timestampMs <= timestampMs,
    );
    if (relevant.length === 0) return 0;
    const observedCount = relevant.filter((sample) => sample.status === "observed").length;
    return observedCount / relevant.length;
  }

  private updateBehavior(features: TrajectoryMotionFeatures, timestampMs: number): void {
    const radialProposal = classifyRadialTrend(features.radialVelocityPerSecond, this.radialState, this.config);
    const angularProposal = classifyAngularDirection(
      features.angularVelocityRadiansPerSecond,
      this.angularState,
      this.config,
    );
    const movementProposal = classifyMovementState(features.movementSpeedPerSecond, this.movementState, this.config);
    [this.radialState, this.pendingRadial] = this.latch(this.radialState, this.pendingRadial, radialProposal, timestampMs);
    [this.angularState, this.pendingAngular] = this.latch(this.angularState, this.pendingAngular, angularProposal, timestampMs);
    [this.movementState, this.pendingMovement] = this.latch(this.movementState, this.pendingMovement, movementProposal, timestampMs);
  }

  private latch<T>(current: T, pending: PendingState<T> | null, proposal: T, timestampMs: number): [T, PendingState<T> | null] {
    if (proposal === current) return [current, null];
    if (pending === null || pending.value !== proposal) return [current, { value: proposal, sinceMs: timestampMs }];
    if (timestampMs - pending.sinceMs < this.config.behaviorHoldMs) return [current, pending];
    return [proposal, null];
  }

  private clearContinuity(): void {
    this.featureSamples = [];
    this.lastAccepted = null;
    this.radialState = "UNKNOWN";
    this.angularState = "UNKNOWN";
    this.movementState = "UNKNOWN";
    this.pendingRadial = null;
    this.pendingAngular = null;
    this.pendingMovement = null;
  }
}
