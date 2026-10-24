import type { ManualDripperCalibration } from "./manual-dripper-contract";
import { DripperTrajectoryEngine } from "./trajectory-engine";
import type {
  AngularDirection,
  MovementState,
  RadialTrend,
  SpoutTipObservation,
  TrajectoryCoachingState,
  TrajectoryForm,
} from "./trajectory-types";

export const ROBUSTNESS_CALIBRATION: ManualDripperCalibration = {
  centerX: 500,
  centerY: 400,
  radiusX: 200,
  radiusY: 160,
};

export const REFERENCE_INTERVALS_MS = [67, 83, 101, 74, 92, 88, 111, 79] as const;

export interface BehaviorExpectation {
  angularDirection?: AngularDirection;
  radialTrend?: RadialTrend;
  movementState?: MovementState;
  trajectoryForm?: TrajectoryForm;
}

export interface ReferenceTrajectory {
  name: string;
  observations: SpoutTipObservation[];
  expected: BehaviorExpectation;
}

export type SemanticOutcome = "correct" | "unknown" | "incorrect";

export interface RobustnessMetrics {
  correctRatio: number;
  unknownRatio: number;
  incorrectRatio: number;
  degradedRatio: number;
  timeToEstablishMs: number | null;
  incorrectTransitions: number;
  finalOutcome: SemanticOutcome;
  recoveryMs: number | null;
}

function timestamps(
  durationMs = 4_000,
  intervals: readonly number[] = REFERENCE_INTERVALS_MS,
): number[] {
  const result = [0];
  let index = 0;
  while ((result.at(-1) ?? 0) < durationMs) {
    result.push((result.at(-1) ?? 0) + intervals[index % intervals.length]);
    index += 1;
  }
  return result;
}

function observation(timestampMs: number, radius: number, angle: number): SpoutTipObservation {
  return {
    timestampMs,
    confidence: 0.95,
    tip: {
      x: ROBUSTNESS_CALIBRATION.centerX + Math.cos(angle) * radius * ROBUSTNESS_CALIBRATION.radiusX,
      y: ROBUSTNESS_CALIBRATION.centerY + Math.sin(angle) * radius * ROBUSTNESS_CALIBRATION.radiusY,
    },
  };
}

function trajectory(
  name: string,
  polarAt: (seconds: number) => { radius: number; angle: number },
  expected: BehaviorExpectation,
  intervals: readonly number[] = REFERENCE_INTERVALS_MS,
): ReferenceTrajectory {
  return {
    name,
    expected,
    observations: timestamps(4_000, intervals).map((timestampMs) => {
      const polar = polarAt(timestampMs / 1_000);
      return observation(timestampMs, polar.radius, polar.angle);
    }),
  };
}

export function createReferenceTrajectories(
  intervals: readonly number[] = REFERENCE_INTERVALS_MS,
): ReferenceTrajectory[] {
  const moving = { movementState: "MOVING" as const };
  return [
    trajectory("stationary", () => ({ radius: 0.55, angle: 0.35 }), {
      radialTrend: "STABLE_RADIUS",
      movementState: "STATIONARY",
      trajectoryForm: "UNDETERMINED",
    }, intervals),
    trajectory("clockwise-circle", (seconds) => ({ radius: 0.62, angle: 1.05 * seconds }), {
      ...moving, radialTrend: "STABLE_RADIUS", angularDirection: "CLOCKWISE", trajectoryForm: "CIRCULAR",
    }, intervals),
    trajectory("counterclockwise-circle", (seconds) => ({ radius: 0.62, angle: -1.05 * seconds }), {
      ...moving, radialTrend: "STABLE_RADIUS", angularDirection: "COUNTERCLOCKWISE", trajectoryForm: "CIRCULAR",
    }, intervals),
    trajectory("clockwise-inward-spiral", (seconds) => ({ radius: 0.9 - 0.17 * seconds, angle: 1.05 * seconds }), {
      ...moving, radialTrend: "INWARD", angularDirection: "CLOCKWISE", trajectoryForm: "INWARD_SPIRAL",
    }, intervals),
    trajectory("counterclockwise-inward-spiral", (seconds) => ({ radius: 0.9 - 0.17 * seconds, angle: -1.05 * seconds }), {
      ...moving, radialTrend: "INWARD", angularDirection: "COUNTERCLOCKWISE", trajectoryForm: "INWARD_SPIRAL",
    }, intervals),
    trajectory("clockwise-outward-spiral", (seconds) => ({ radius: 0.2 + 0.17 * seconds, angle: 1.05 * seconds }), {
      ...moving, radialTrend: "OUTWARD", angularDirection: "CLOCKWISE", trajectoryForm: "OUTWARD_SPIRAL",
    }, intervals),
    trajectory("counterclockwise-outward-spiral", (seconds) => ({ radius: 0.2 + 0.17 * seconds, angle: -1.05 * seconds }), {
      ...moving, radialTrend: "OUTWARD", angularDirection: "COUNTERCLOCKWISE", trajectoryForm: "OUTWARD_SPIRAL",
    }, intervals),
    trajectory("radial-inward", (seconds) => ({ radius: 0.95 - 0.2 * seconds, angle: 0.3 }), {
      ...moving, radialTrend: "INWARD", angularDirection: "UNKNOWN", trajectoryForm: "UNDETERMINED",
    }, intervals),
    trajectory("radial-outward", (seconds) => ({ radius: 0.12 + 0.2 * seconds, angle: 0.3 }), {
      ...moving, radialTrend: "OUTWARD", angularDirection: "UNKNOWN", trajectoryForm: "UNDETERMINED",
    }, intervals),
    trajectory("direction-reversal", (seconds) => ({
      radius: 0.62,
      angle: seconds <= 2 ? 1.05 * seconds : 2.1 - 1.05 * (seconds - 2),
    }), {
      ...moving, radialTrend: "STABLE_RADIUS", angularDirection: "COUNTERCLOCKWISE", trajectoryForm: "CIRCULAR",
    }, intervals),
    trajectory("radial-trend-reversal", (seconds) => ({
      radius: seconds <= 2 ? 0.25 + 0.2 * seconds : 0.65 - 0.2 * (seconds - 2),
      angle: 0.3,
    }), {
      ...moving, radialTrend: "INWARD", angularDirection: "UNKNOWN", trajectoryForm: "UNDETERMINED",
    }, intervals),
  ];
}

function cloneObservation(source: SpoutTipObservation): SpoutTipObservation {
  return { ...source, tip: source.tip === null ? null : { ...source.tip } };
}

/** Mulberry32: a small deterministic PRNG. The seed is part of each experiment contract. */
function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function addPositionalJitter(
  observations: readonly SpoutTipObservation[],
  magnitude: number,
  seed: number,
): SpoutTipObservation[] {
  const random = seededRandom(seed);
  return observations.map((source) => {
    const result = cloneObservation(source);
    if (result.tip === null || magnitude === 0) return result;
    // Uniform zero-mean noise on each normalized axis, bounded by magnitude.
    result.tip.x += (random() * 2 - 1) * magnitude * ROBUSTNESS_CALIBRATION.radiusX;
    result.tip.y += (random() * 2 - 1) * magnitude * ROBUSTNESS_CALIBRATION.radiusY;
    return result;
  });
}

export function addSystematicOffset(
  observations: readonly SpoutTipObservation[],
  offsetX: number,
  offsetY: number,
): SpoutTipObservation[] {
  return observations.map((source) => {
    const result = cloneObservation(source);
    if (result.tip !== null) {
      result.tip.x += offsetX * ROBUSTNESS_CALIBRATION.radiusX;
      result.tip.y += offsetY * ROBUSTNESS_CALIBRATION.radiusY;
    }
    return result;
  });
}

export function addOutliers(
  observations: readonly SpoutTipObservation[],
  indexes: ReadonlySet<number>,
  magnitude: number,
): SpoutTipObservation[] {
  return observations.map((source, index) => {
    const result = cloneObservation(source);
    if (result.tip !== null && indexes.has(index)) {
      const angle = index * 2.399963229728653;
      result.tip.x += Math.cos(angle) * magnitude * ROBUSTNESS_CALIBRATION.radiusX;
      result.tip.y += Math.sin(angle) * magnitude * ROBUSTNESS_CALIBRATION.radiusY;
    }
    return result;
  });
}

export function dropIndexes(
  observations: readonly SpoutTipObservation[],
  indexes: ReadonlySet<number>,
): SpoutTipObservation[] {
  return observations.map((source, index) => indexes.has(index)
    ? { ...source, tip: null, confidence: 0 }
    : cloneObservation(source));
}

export function dropInterval(
  observations: readonly SpoutTipObservation[],
  startMs: number,
  endMs: number,
): SpoutTipObservation[] {
  return observations.map((source) => source.timestampMs >= startMs && source.timestampMs <= endMs
    ? { ...source, tip: null, confidence: 0 }
    : cloneObservation(source));
}

export function lowerConfidence(
  observations: readonly SpoutTipObservation[],
  indexes: ReadonlySet<number>,
  confidence = 0.2,
): SpoutTipObservation[] {
  return observations.map((source, index) => indexes.has(index)
    ? { ...cloneObservation(source), confidence }
    : cloneObservation(source));
}

export function runTrajectory(
  observations: readonly SpoutTipObservation[],
  config: ConstructorParameters<typeof DripperTrajectoryEngine>[1] = {},
): TrajectoryCoachingState[] {
  const engine = new DripperTrajectoryEngine(ROBUSTNESS_CALIBRATION, config);
  return observations.map((item) => engine.acceptObservation(item));
}

function fieldOutcomes(state: TrajectoryCoachingState, expected: BehaviorExpectation): SemanticOutcome[] {
  const pairs = [
    [state.angularDirection, expected.angularDirection, "UNKNOWN"],
    [state.radialTrend, expected.radialTrend, "UNKNOWN"],
    [state.movementState, expected.movementState, "UNKNOWN"],
    [state.trajectoryForm, expected.trajectoryForm, "UNDETERMINED"],
  ] as const;
  return pairs.flatMap(([actual, wanted, unknown]) => wanted === undefined
    ? []
    : actual === wanted ? ["correct" as const] : actual === unknown ? ["unknown" as const] : ["incorrect" as const]);
}

export function semanticOutcome(
  state: TrajectoryCoachingState,
  expected: BehaviorExpectation,
): SemanticOutcome {
  const outcomes = fieldOutcomes(state, expected);
  if (outcomes.includes("incorrect")) return "incorrect";
  if (outcomes.includes("unknown")) return "unknown";
  return "correct";
}

export function measureRobustness(
  states: readonly TrajectoryCoachingState[],
  expected: BehaviorExpectation,
  options: { evaluationStartMs?: number; corruptionEndMs?: number } = {},
): RobustnessMetrics {
  const evaluationStartMs = options.evaluationStartMs ?? 1_000;
  const evaluated = states.filter((state) => state.timestampMs >= evaluationStartMs);
  if (evaluated.length === 0) throw new Error("Robustness evaluation requires states after the warm-up period.");
  const outcomes = evaluated.map((state) => semanticOutcome(state, expected));
  const firstCorrect = states.find((state) => semanticOutcome(state, expected) === "correct");
  let previous = outcomes[0];
  let incorrectTransitions = 0;
  for (const outcome of outcomes.slice(1)) {
    if (outcome === "incorrect" && previous !== "incorrect") incorrectTransitions += 1;
    previous = outcome;
  }
  const corruptionEndMs = options.corruptionEndMs;
  const recoveryState = corruptionEndMs === undefined ? undefined : states.find(
    (state) => state.timestampMs > corruptionEndMs && semanticOutcome(state, expected) === "correct",
  );
  return {
    correctRatio: outcomes.filter((outcome) => outcome === "correct").length / outcomes.length,
    unknownRatio: outcomes.filter((outcome) => outcome === "unknown").length / outcomes.length,
    incorrectRatio: outcomes.filter((outcome) => outcome === "incorrect").length / outcomes.length,
    degradedRatio: evaluated.filter((state) => state.reliability !== "RELIABLE").length / evaluated.length,
    timeToEstablishMs: firstCorrect?.timestampMs ?? null,
    incorrectTransitions,
    finalOutcome: outcomes.at(-1) ?? "unknown",
    recoveryMs: corruptionEndMs === undefined || recoveryState === undefined
      ? null
      : recoveryState.timestampMs - corruptionEndMs,
  };
}
