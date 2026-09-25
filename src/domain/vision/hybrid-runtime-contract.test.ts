import { describe, expect, it } from "vitest";
import {
  bboxIoU,
  createExperimentalRuntimeConfig,
  effectiveDripperRadius,
  nextHybridRuntimeState,
  normalizedPointError,
  summarizeDistribution,
  validateRuntimeConfig,
} from "./index";

describe("hybrid runtime configuration", () => {
  it("creates explicit experimental defaults for every mode", () => {
    expect(createExperimentalRuntimeConfig("keypoint_only")).toMatchObject({
      mode: "keypoint_only",
      detectorPollingHz: 2,
      initialConfirmationFrames: 3,
    });
    expect(createExperimentalRuntimeConfig("detection_keypoint_tracking")).toMatchObject({
      mode: "detection_keypoint_tracking",
      trackerTargetHz: 30,
      keypointRefreshHz: 5,
    });
  });

  it("accepts validated overrides", () => {
    expect(createExperimentalRuntimeConfig("detection_keypoint", { detectorPollingHz: 4 }).detectorPollingHz).toBe(4);
  });

  it("rejects invalid probabilities and counts", () => {
    const config = createExperimentalRuntimeConfig("keypoint_only");
    expect(() => validateRuntimeConfig({ ...config, keypointConfidenceThreshold: 1.1 })).toThrow(RangeError);
    expect(() => validateRuntimeConfig({ ...config, reacquisitionConfirmationFrames: 0 })).toThrow(RangeError);
  });
});

describe("hybrid runtime state machine", () => {
  it("supports initial acquisition", () => {
    expect(nextHybridRuntimeState("ABSENT", "BEGIN_SEARCH")).toBe("SEARCHING");
    expect(nextHybridRuntimeState("SEARCHING", "CANDIDATE_FOUND")).toBe("ACQUIRING");
    expect(nextHybridRuntimeState("ACQUIRING", "ACQUISITION_CONFIRMED")).toBe("TRACKING");
  });

  it("supports loss and explicit reacquisition", () => {
    expect(nextHybridRuntimeState("TRACKING", "CONFIDENCE_DEGRADED")).toBe("UNCERTAIN");
    expect(nextHybridRuntimeState("UNCERTAIN", "LOCAL_RECOVERY_EXHAUSTED")).toBe("LOST");
    expect(nextHybridRuntimeState("LOST", "CANDIDATE_FOUND")).toBe("ACQUIRING");
    expect(nextHybridRuntimeState("ACQUIRING", "REACQUISITION_CONFIRMED")).toBe("REACQUIRED");
    expect(nextHybridRuntimeState("REACQUIRED", "REACQUISITION_STABILIZED")).toBe("TRACKING");
  });

  it("stops from every state and rejects undefined transitions", () => {
    expect(nextHybridRuntimeState("UNCERTAIN", "STOP")).toBe("ABSENT");
    expect(() => nextHybridRuntimeState("ABSENT", "LOCAL_RECOVERED")).toThrow(/Invalid hybrid runtime transition/);
  });
});

describe("vision metrics", () => {
  it("uses geometric mean radius for ellipse normalization", () => {
    expect(effectiveDripperRadius(16, 9)).toBe(12);
    expect(normalizedPointError({ x: 3, y: 4 }, { x: 0, y: 0 }, 16, 9)).toBeCloseTo(5 / 12);
    expect(effectiveDripperRadius(0, 9)).toBeNull();
  });

  it("computes intersection over union", () => {
    expect(bboxIoU({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })).toBeCloseTo(25 / 175);
    expect(bboxIoU({ x: 0, y: 0, width: 0, height: 10 }, { x: 0, y: 0, width: 10, height: 10 })).toBe(0);
  });

  it("freezes median and nearest-rank P90 semantics", () => {
    expect(summarizeDistribution([10, 1, 3, 2, 4])).toEqual({ count: 5, mean: 4, median: 3, p90: 10, max: 10 });
    expect(summarizeDistribution([])).toEqual({ count: 0, mean: null, median: null, p90: null, max: null });
  });
});
