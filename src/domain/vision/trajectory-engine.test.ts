import { describe, expect, it } from "vitest";
import type { ManualDripperCalibration } from "./manual-dripper-contract";
import { DripperTrajectoryEngine } from "./trajectory-engine";
import { normalizePointToDripperEllipse, wrappedAngularDelta } from "./trajectory-normalization";
import type { SpoutTipObservation, TrajectoryCoachingState } from "./trajectory-types";

const calibration: ManualDripperCalibration = {
  centerX: 320,
  centerY: 240,
  radiusX: 100,
  radiusY: 80,
};

function imagePoint(radius: number, angle: number): { x: number; y: number } {
  return {
    x: calibration.centerX + Math.cos(angle) * radius * calibration.radiusX,
    y: calibration.centerY + Math.sin(angle) * radius * calibration.radiusY,
  };
}

function feed(
  engine: DripperTrajectoryEngine,
  points: readonly { timestampMs: number; radius: number; angle: number; confidence?: number }[],
): TrajectoryCoachingState {
  let state: TrajectoryCoachingState | null = null;
  for (const point of points) {
    state = engine.acceptObservation({
      timestampMs: point.timestampMs,
      tip: imagePoint(point.radius, point.angle),
      confidence: point.confidence ?? 0.95,
    });
  }
  if (state === null) throw new Error("Test sequence must not be empty.");
  return state;
}

function sequence(
  count: number,
  radiusAt: (index: number) => number,
  angleAt: (index: number) => number,
  intervalMs = 100,
  startMs = 0,
) {
  return Array.from({ length: count }, (_, index) => ({
    timestampMs: startMs + index * intervalMs,
    radius: radiusAt(index),
    angle: angleAt(index),
  }));
}

describe("dripper ellipse normalization", () => {
  it("maps both ellipse axes to unit radius without assuming a circle", () => {
    expect(normalizePointToDripperEllipse({ x: 420, y: 240 }, calibration)).toMatchObject({ x: 1, y: 0, radius: 1 });
    expect(normalizePointToDripperEllipse({ x: 320, y: 320 }, calibration)).toMatchObject({ x: 0, y: 1, radius: 1 });
  });

  it("removes calibration rotation before scaling", () => {
    const rotated = { ...calibration, radiusX: 100, radiusY: 50, rotationRadians: Math.PI / 2 };
    const result = normalizePointToDripperEllipse({ x: 320, y: 340 }, rotated);
    expect(result.x).toBeCloseTo(1);
    expect(result.y).toBeCloseTo(0);
    expect(result.radius).toBeCloseTo(1);
  });

  it("uses the shortest signed delta across angular wraparound", () => {
    expect(wrappedAngularDelta(Math.PI - 0.05, -Math.PI + 0.05)).toBeCloseTo(0.1);
    expect(wrappedAngularDelta(-Math.PI + 0.05, Math.PI - 0.05)).toBeCloseTo(-0.1);
  });
});

describe("trajectory behavior inference", () => {
  it("classifies a stationary tip", () => {
    const state = feed(new DripperTrajectoryEngine(calibration), sequence(12, () => 0.6, () => 0.4));
    expect(state.movementState).toBe("STATIONARY");
    expect(state.radialTrend).toBe("STABLE_RADIUS");
    expect(state.angularDirection).toBe("UNKNOWN");
  });

  it("classifies clockwise circular movement in image coordinates", () => {
    const state = feed(new DripperTrajectoryEngine(calibration), sequence(16, () => 0.65, (index) => index * 0.1));
    expect(state.angularDirection).toBe("CLOCKWISE");
    expect(state.trajectoryForm).toBe("CIRCULAR");
  });

  it("classifies counterclockwise circular movement", () => {
    const state = feed(new DripperTrajectoryEngine(calibration), sequence(16, () => 0.65, (index) => -index * 0.1));
    expect(state.angularDirection).toBe("COUNTERCLOCKWISE");
    expect(state.trajectoryForm).toBe("CIRCULAR");
  });

  it("classifies an inward spiral", () => {
    const state = feed(new DripperTrajectoryEngine(calibration), sequence(16, (index) => 0.9 - index * 0.025, (index) => index * 0.1));
    expect(state.radialTrend).toBe("INWARD");
    expect(state.trajectoryForm).toBe("INWARD_SPIRAL");
  });

  it("classifies an outward spiral", () => {
    const state = feed(new DripperTrajectoryEngine(calibration), sequence(16, (index) => 0.3 + index * 0.025, (index) => index * 0.1));
    expect(state.radialTrend).toBe("OUTWARD");
    expect(state.trajectoryForm).toBe("OUTWARD_SPIRAL");
  });

  it("keeps stable-radius circular motion distinct from a spiral", () => {
    const state = feed(new DripperTrajectoryEngine(calibration), sequence(16, () => 0.72, (index) => index * 0.12));
    expect(state.radialTrend).toBe("STABLE_RADIUS");
    expect(state.trajectoryForm).toBe("CIRCULAR");
  });

  it("suppresses small deterministic jitter", () => {
    const offsets = [0, 0.002, -0.001, 0.001, -0.002];
    const state = feed(new DripperTrajectoryEngine(calibration), sequence(
      15,
      (index) => 0.6 + offsets[index % offsets.length],
      (index) => 0.5 + offsets[(index + 2) % offsets.length],
    ));
    expect(state.movementState).toBe("STATIONARY");
    expect(state.reliability).toBe("RELIABLE");
  });

  it("rejects an isolated high-speed outlier and recovers", () => {
    const engine = new DripperTrajectoryEngine(calibration);
    feed(engine, sequence(7, () => 0.5, () => 0));
    engine.acceptObservation({ timestampMs: 700, tip: imagePoint(1.5, Math.PI), confidence: 0.99 });
    const state = engine.acceptObservation({ timestampMs: 800, tip: imagePoint(0.5, 0), confidence: 0.99 });
    expect(engine.getHistory().at(-2)?.status).toBe("outlier");
    expect(engine.getHistory().at(-1)?.status).toBe("observed");
    expect(state.position?.radius).toBeCloseTo(0.5, 2);
  });

  it("preserves behavior across a short missing observation without inventing a point", () => {
    const engine = new DripperTrajectoryEngine(calibration);
    const moving = feed(engine, sequence(12, () => 0.6, (index) => index * 0.1));
    const missing = engine.acceptObservation({ timestampMs: 1_150, tip: null, confidence: 0 });
    expect(moving.angularDirection).toBe("CLOCKWISE");
    expect(missing.position).toBeNull();
    expect(missing.angularDirection).toBe("CLOCKWISE");
    expect(missing.reliability).toBe("DEGRADED");
  });

  it("does not bridge or retain behavior across a long gap", () => {
    const engine = new DripperTrajectoryEngine(calibration);
    feed(engine, sequence(12, () => 0.6, (index) => index * 0.1));
    const lost = engine.acceptObservation({ timestampMs: 1_500, tip: null, confidence: 0 });
    const resumed = engine.acceptObservation({ timestampMs: 1_600, tip: imagePoint(0.6, 1.2), confidence: 0.9 });
    expect(lost.reliability).toBe("UNRELIABLE");
    expect(lost.angularDirection).toBe("UNKNOWN");
    expect(resumed.evidenceDurationMs).toBe(0);
  });

  it("marks a low-confidence point uncertain and excludes it from smoothing", () => {
    const engine = new DripperTrajectoryEngine(calibration);
    engine.acceptObservation({ timestampMs: 0, tip: imagePoint(0.5, 0), confidence: 0.9 });
    const state = engine.acceptObservation({ timestampMs: 100, tip: imagePoint(1.2, 2), confidence: 0.2 });
    expect(engine.getHistory().at(-1)?.status).toBe("uncertain");
    expect(engine.getHistory().at(-1)?.smoothed).toBeNull();
    expect(state.reliability).toBe("DEGRADED");
  });

  it("uses elapsed time for irregularly spaced observations", () => {
    const engine = new DripperTrajectoryEngine(calibration, { behaviorHoldMs: 0 });
    const times = [0, 70, 190, 310, 470, 650, 820, 1_050];
    const state = feed(engine, times.map((timestampMs) => ({
      timestampMs,
      radius: 0.5,
      angle: timestampMs / 1_000,
    })));
    expect(state.features?.angularVelocityRadiansPerSecond).toBeGreaterThan(0.7);
    expect(state.angularDirection).toBe("CLOCKWISE");
  });

  it("tracks clockwise motion through the -PI/PI boundary", () => {
    const state = feed(new DripperTrajectoryEngine(calibration), sequence(
      14,
      () => 0.7,
      (index) => Math.PI - 0.35 + index * 0.08,
    ));
    expect(state.angularDirection).toBe("CLOCKWISE");
    expect(state.features?.angularDeltaRadians).toBeGreaterThan(0);
  });

  it("changes angular direction only after sustained reversal", () => {
    const engine = new DripperTrajectoryEngine(calibration);
    feed(engine, sequence(15, () => 0.65, (index) => index * 0.1));
    const start = 1_500;
    const reversed = feed(engine, sequence(18, () => 0.65, (index) => 1.4 - index * 0.12, 100, start));
    expect(reversed.angularDirection).toBe("COUNTERCLOCKWISE");
  });

  it("changes radial direction only after sustained reversal", () => {
    const engine = new DripperTrajectoryEngine(calibration);
    feed(engine, sequence(15, (index) => 0.3 + index * 0.025, () => 0));
    const reversed = feed(engine, sequence(18, (index) => 0.65 - index * 0.025, () => 0, 100, 1_500));
    expect(reversed.radialTrend).toBe("INWARD");
  });

  it("hysteresis prevents rapid behavior oscillation", () => {
    const engine = new DripperTrajectoryEngine(calibration, { featureWindowMs: 400, behaviorHoldMs: 250 });
    feed(engine, sequence(12, (index) => 0.3 + index * 0.03, () => 0));
    const before = engine.acceptObservation({ timestampMs: 1_200, tip: imagePoint(0.58, 0), confidence: 0.95 });
    const briefReverse = engine.acceptObservation({ timestampMs: 1_300, tip: imagePoint(0.55, 0), confidence: 0.95 });
    expect(before.radialTrend).toBe("OUTWARD");
    expect(briefReverse.radialTrend).toBe("OUTWARD");
  });

  it("rejects non-monotonic timestamps", () => {
    const engine = new DripperTrajectoryEngine(calibration);
    const observation: SpoutTipObservation = { timestampMs: 100, tip: imagePoint(0.5, 0), confidence: 0.9 };
    engine.acceptObservation(observation);
    expect(() => engine.acceptObservation(observation)).toThrow(/strictly increasing/);
  });
});
