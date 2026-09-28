import { describe, expect, it } from "vitest";
import {
  assessManualCameraSetup,
  deriveSpoutSearchRegion,
  isValidManualDripperCalibration,
  SPOUT_SEARCH_REGION_PRESETS,
  toDripperRelativePoint,
  toScreenPoint,
  type ManualDripperCalibration,
} from "./manual-dripper-contract";

const calibration: ManualDripperCalibration = {
  centerX: 500,
  centerY: 700,
  radiusX: 200,
  radiusY: 128,
};

describe("manual dripper calibration", () => {
  it("uses effective radius for reversible trajectory coordinates", () => {
    const relative = toDripperRelativePoint({ x: 660, y: 620 }, calibration);
    expect(relative).toEqual({ u: 1, v: -0.5 });
    expect(toScreenPoint(relative, calibration)).toEqual({ x: 660, y: 620 });
  });

  it("rejects invalid radii and out-of-frame centers", () => {
    expect(isValidManualDripperCalibration(calibration, { width: 1080, height: 1920 })).toBe(true);
    expect(isValidManualDripperCalibration({ ...calibration, radiusX: 0 })).toBe(false);
    expect(isValidManualDripperCalibration({ ...calibration, centerX: -1 }, { width: 1080, height: 1920 })).toBe(false);
  });
});

describe("manual dripper search region", () => {
  it("expands asymmetrically for top and side entry then clips to the image", () => {
    const region = deriveSpoutSearchRegion(calibration, { width: 1080, height: 1920 });
    expect(region.policy).toBe("balanced");
    expect(region.unclippedBounds).toEqual({ x: 60, y: 252, width: 880, height: 696 });
    expect(region.bounds).toEqual(region.unclippedBounds);
    expect(region.retainedAreaRatio).toBe(1);
  });

  it("offers a wider experiment preset without changing the default", () => {
    const balanced = deriveSpoutSearchRegion(calibration, { width: 1080, height: 1920 });
    const wide = deriveSpoutSearchRegion(calibration, { width: 1080, height: 1920 }, SPOUT_SEARCH_REGION_PRESETS.wide_entry);
    expect(wide.unclippedBounds.width).toBeGreaterThan(balanced.unclippedBounds.width);
    expect(wide.unclippedBounds.y).toBeLessThan(balanced.unclippedBounds.y);
  });

  it("returns non-blocking geometry guidance", () => {
    const smallEdgeCalibration = { centerX: 20, centerY: 30, radiusX: 30, radiusY: 20 };
    const imageSize = { width: 1080, height: 1920 };
    const region = deriveSpoutSearchRegion(smallEdgeCalibration, imageSize);
    const checks = assessManualCameraSetup(smallEdgeCalibration, imageSize, region);
    expect(checks.find((check) => check.code === "dripper_apparent_size")?.status).toBe("guidance");
    expect(checks.find((check) => check.code === "search_region_clipping")?.status).toBe("guidance");
  });
});
