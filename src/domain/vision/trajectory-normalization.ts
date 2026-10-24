import type { ManualDripperCalibration } from "./manual-dripper-contract";
import { isValidManualDripperCalibration } from "./manual-dripper-contract";
import type { Point2D } from "./hybrid-runtime-contract";
import type { DripperNormalizedPoint } from "./trajectory-types";

/**
 * Maps an image point into the calibrated ellipse's local coordinate system.
 * The calibration rotation is removed first, then each axis is scaled by its
 * own radius. Consequently, every point on the ellipse has radius 1.
 */
export function normalizePointToDripperEllipse(
  point: Point2D,
  calibration: ManualDripperCalibration,
): DripperNormalizedPoint {
  if (!isValidManualDripperCalibration(calibration) || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError("Point and manual dripper calibration must contain finite, valid geometry.");
  }

  const rotation = calibration.rotationRadians ?? 0;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const dx = point.x - calibration.centerX;
  const dy = point.y - calibration.centerY;
  const x = (cos * dx + sin * dy) / calibration.radiusX;
  const y = (-sin * dx + cos * dy) / calibration.radiusY;

  return {
    x,
    y,
    radius: Math.hypot(x, y),
    angleRadians: Math.atan2(y, x),
  };
}

/** Smallest signed angular displacement in [-PI, PI]. */
export function wrappedAngularDelta(fromRadians: number, toRadians: number): number {
  if (!Number.isFinite(fromRadians) || !Number.isFinite(toRadians)) {
    throw new RangeError("Angles must be finite.");
  }
  return Math.atan2(Math.sin(toRadians - fromRadians), Math.cos(toRadians - fromRadians));
}
