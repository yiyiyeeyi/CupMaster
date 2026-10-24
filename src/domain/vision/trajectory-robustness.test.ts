import { describe, expect, it } from "vitest";
import {
  addOutliers,
  addPositionalJitter,
  addSystematicOffset,
  createReferenceTrajectories,
  dropIndexes,
  dropInterval,
  lowerConfidence,
  measureRobustness,
  runTrajectory,
  semanticOutcome,
} from "./trajectory-robustness.test-utils";

const references = createReferenceTrajectories();
const stableReferences = references.filter((reference) => !reference.name.includes("reversal"));
const patternReferences = stableReferences.filter((reference) =>
  reference.name.includes("circle") || reference.name.includes("spiral"));

function everyNthIndexes(length: number, every: number, offset = every - 1): Set<number> {
  return new Set(Array.from({ length }, (_, index) => index).filter((index) => index % every === offset));
}

describe("Task 9D-2 clean reference trajectories", () => {
  it.each(references)("classifies $name with current defaults", (reference) => {
    const states = runTrajectory(reference.observations);
    expect(semanticOutcome(states.at(-1)!, reference.expected)).toBe("correct");
  });
});

describe("Task 9D-2 deterministic corruption utilities", () => {
  it("repeats seeded positional jitter exactly", () => {
    const source = references[1].observations;
    expect(addPositionalJitter(source, 0.08, 9_002)).toEqual(addPositionalJitter(source, 0.08, 9_002));
    expect(addPositionalJitter(source, 0.08, 9_002)).not.toEqual(addPositionalJitter(source, 0.08, 9_003));
  });

  it("keeps all generated timestamp sequences strictly increasing", () => {
    for (const reference of references) {
      for (let index = 1; index < reference.observations.length; index += 1) {
        expect(reference.observations[index].timestampMs).toBeGreaterThan(reference.observations[index - 1].timestampMs);
      }
    }
  });
});

describe("Task 9D-2 default robustness guardrails", () => {
  it.each([0, 0.01, 0.02, 0.04, 0.06])("retains useful pattern outcomes through jitter %f", (magnitude) => {
    for (const reference of patternReferences) {
      const metrics = measureRobustness(
        runTrajectory(addPositionalJitter(reference.observations, magnitude, 9_002)),
        reference.expected,
      );
      expect(metrics.incorrectRatio, reference.name).toBeLessThanOrEqual(0.25);
      expect(metrics.finalOutcome, reference.name).not.toBe("incorrect");
    }
  });

  it("characterizes the full jitter progression without concealing failure boundaries", () => {
    const levels = [0, 0.01, 0.02, 0.04, 0.06, 0.08, 0.1, 0.15, 0.2];
    for (const magnitude of levels) {
      for (const reference of stableReferences) {
        const metrics = measureRobustness(
          runTrajectory(addPositionalJitter(reference.observations, magnitude, 9_002)),
          reference.expected,
        );
        expect(metrics.correctRatio + metrics.unknownRatio + metrics.incorrectRatio).toBeCloseTo(1);
      }
    }

    const directionReferences = stableReferences.filter((reference) =>
      reference.expected.angularDirection !== undefined && reference.expected.angularDirection !== "UNKNOWN");
    expect(directionReferences.every((reference) => measureRobustness(
      runTrajectory(addPositionalJitter(reference.observations, 0.2, 9_002)),
      { angularDirection: reference.expected.angularDirection },
    ).incorrectRatio === 0)).toBe(true);

    const radialReferences = stableReferences.filter((reference) => reference.expected.radialTrend !== undefined);
    expect(radialReferences.every((reference) => measureRobustness(
      runTrajectory(addPositionalJitter(reference.observations, 0.1, 9_002)),
      { radialTrend: reference.expected.radialTrend },
    ).incorrectRatio === 0)).toBe(true);
    expect(radialReferences.some((reference) => measureRobustness(
      runTrajectory(addPositionalJitter(reference.observations, 0.15, 9_002)),
      { radialTrend: reference.expected.radialTrend },
    ).incorrectRatio > 0)).toBe(true);

    const stationary = stableReferences.find((reference) => reference.name === "stationary")!;
    expect(runTrajectory(addPositionalJitter(stationary.observations, 0.01, 9_002)).at(-1)?.movementState).toBe("STATIONARY");
    expect(runTrajectory(addPositionalJitter(stationary.observations, 0.04, 9_002)).at(-1)?.movementState).toBe("MOVING");
  });

  it.each([[0.08, 0], [-0.08, 0], [0, 0.08], [0, -0.08], [0.057, -0.057]])(
    "keeps direction and movement useful with offset (%f, %f)",
    (offsetX, offsetY) => {
      for (const reference of patternReferences) {
        const states = runTrajectory(addSystematicOffset(reference.observations, offsetX, offsetY));
        const final = states.at(-1)!;
        expect(final.angularDirection, reference.name).toBe(reference.expected.angularDirection);
        expect(final.movementState, reference.name).toBe("MOVING");
      }
    },
  );

  it("finds radial offset sensitivity before angular-direction sensitivity", () => {
    const levels = [0.04, 0.08, 0.12, 0.16, 0.2];
    const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [Math.SQRT1_2, -Math.SQRT1_2]] as const;
    for (const level of levels) {
      for (const [unitX, unitY] of directions) {
        for (const reference of patternReferences) {
          const final = runTrajectory(addSystematicOffset(
            reference.observations,
            unitX * level,
            unitY * level,
          )).at(-1)!;
          expect(final.angularDirection, `${reference.name} at ${level}`).toBe(reference.expected.angularDirection);
        }
      }
    }
    const biased = stableReferences.map((reference) => measureRobustness(
      runTrajectory(addSystematicOffset(reference.observations, 0, -0.12)),
      { radialTrend: reference.expected.radialTrend },
    ));
    expect(biased.some((metrics) => metrics.finalOutcome === "incorrect")).toBe(true);
  });

  it("rejects isolated large outliers and recovers the expected pattern", () => {
    for (const reference of patternReferences) {
      const corrupted = addOutliers(reference.observations, new Set([12, 29, 41]), 0.8);
      const metrics = measureRobustness(runTrajectory(corrupted), reference.expected, { corruptionEndMs: 3_300 });
      expect(metrics.finalOutcome, reference.name).toBe("correct");
      expect(metrics.recoveryMs, reference.name).not.toBeNull();
    }
  });

  it("characterizes outlier magnitude and frequency", () => {
    const indexSets = [new Set([22]), new Set([12, 29, 41]), new Set([8, 16, 24, 32, 40])];
    for (const magnitude of [0.2, 0.4, 0.8, 1.2]) {
      for (const indexes of indexSets) {
        for (const reference of patternReferences) {
          const metrics = measureRobustness(
            runTrajectory(addOutliers(reference.observations, indexes, magnitude)),
            reference.expected,
          );
          expect(metrics.finalOutcome, `${reference.name}, ${magnitude}, ${indexes.size}`).not.toBe("incorrect");
        }
      }
    }
  });

  it("keeps semantics stable with variable intervals and occasional delayed observations", () => {
    const delayed = createReferenceTrajectories([67, 83, 101, 74, 240, 52, 111, 79]);
    for (const reference of delayed) {
      expect(semanticOutcome(runTrajectory(reference.observations).at(-1)!, reference.expected), reference.name).toBe("correct");
    }
  });

  it("tolerates sparse missing observations more safely than a long interruption", () => {
    for (const reference of patternReferences) {
      const sparse = dropIndexes(reference.observations, everyNthIndexes(reference.observations.length, 7));
      const sparseMetrics = measureRobustness(runTrajectory(sparse), reference.expected);
      expect(sparseMetrics.finalOutcome, reference.name).toBe("correct");

      const longDropout = dropInterval(reference.observations, 1_800, 2_450);
      const dropoutStates = runTrajectory(longDropout);
      expect(dropoutStates.some((state) => state.timestampMs >= 2_100 && state.reliability === "UNRELIABLE")).toBe(true);
      expect(measureRobustness(dropoutStates, reference.expected, { corruptionEndMs: 2_450 }).finalOutcome).toBe("correct");
    }
  });

  it("treats low-confidence intervals like unavailable observations and recovers", () => {
    for (const reference of patternReferences) {
      for (const endMs of [2_150, 2_450]) {
        const indexes = new Set(reference.observations.flatMap((item, index) =>
          item.timestampMs >= 1_800 && item.timestampMs <= endMs ? [index] : []));
        const states = runTrajectory(lowerConfidence(reference.observations, indexes));
        const metrics = measureRobustness(states, reference.expected, { corruptionEndMs: endMs });
        expect(metrics.finalOutcome, `${reference.name}, ${endMs}`).toBe("correct");
        expect(metrics.recoveryMs, `${reference.name}, ${endMs}`).not.toBeNull();
        expect(states.some((state) => state.reliability === "UNRELIABLE")).toBe(true);
      }
    }
  });

  it.each([
    ["moderate jitter + sparse missing", (reference: typeof patternReferences[number]) => {
      const jittered = addPositionalJitter(reference.observations, 0.04, 9_002);
      return dropIndexes(jittered, everyNthIndexes(jittered.length, 9));
    }],
    ["jitter + short dropout", (reference: typeof patternReferences[number]) =>
      dropInterval(addPositionalJitter(reference.observations, 0.04, 9_002), 1_800, 2_000)],
    ["jitter + isolated outlier", (reference: typeof patternReferences[number]) =>
      addOutliers(addPositionalJitter(reference.observations, 0.04, 9_002), new Set([27]), 0.8)],
    ["jitter + low-confidence interval", (reference: typeof patternReferences[number]) => {
      const jittered = addPositionalJitter(reference.observations, 0.04, 9_002);
      const indexes = new Set(jittered.flatMap((item, index) =>
        item.timestampMs >= 1_800 && item.timestampMs <= 2_000 ? [index] : []));
      return lowerConfidence(jittered, indexes);
    }],
  ] as const)("handles %s without a confidently wrong final pattern", (_label, corrupt) => {
    for (const reference of patternReferences) {
      const metrics = measureRobustness(runTrajectory(corrupt(reference)), reference.expected);
      expect(metrics.finalOutcome, reference.name).not.toBe("incorrect");
      expect(metrics.incorrectRatio, reference.name).toBeLessThanOrEqual(0.25);
    }
  });
});
