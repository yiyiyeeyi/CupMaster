import type { BoundingBox, ImageSize, Point2D } from "./hybrid-runtime-contract";
import { effectiveDripperRadius } from "./vision-metrics";

export interface ManualDripperCalibration {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  rotationRadians?: number;
}

export interface DripperRelativePoint {
  u: number;
  v: number;
}

export interface SpoutSearchRegionPolicy {
  id: "balanced" | "wide_entry";
  leftMarginRadii: number;
  rightMarginRadii: number;
  topMarginRadii: number;
  bottomMarginRadii: number;
}

export interface SpoutSearchRegion {
  policy: SpoutSearchRegionPolicy["id"];
  bounds: BoundingBox;
  unclippedBounds: BoundingBox;
  retainedAreaRatio: number;
}

export type CameraSetupCheck = {
  code: "dripper_in_frame" | "dripper_apparent_size" | "search_region_clipping";
  status: "pass" | "guidance";
  message: string;
  measuredRatio: number;
};

export const SPOUT_SEARCH_REGION_PRESETS: Readonly<Record<SpoutSearchRegionPolicy["id"], SpoutSearchRegionPolicy>> = {
  balanced: {
    id: "balanced",
    leftMarginRadii: 1.5,
    rightMarginRadii: 1.5,
    topMarginRadii: 2,
    bottomMarginRadii: 0.75,
  },
  wide_entry: {
    id: "wide_entry",
    leftMarginRadii: 2,
    rightMarginRadii: 2,
    topMarginRadii: 2.5,
    bottomMarginRadii: 1,
  },
} as const;

export const MANUAL_DRIPPER_RUNTIME_STATES = [
  "CALIBRATION",
  "READY",
  "SPOUT_ABSENT",
  "SPOUT_ACQUIRED",
  "POUR_TRACKING",
  "SPOUT_LOST",
  "SPOUT_REACQUIRED",
] as const;

export type ManualDripperRuntimeState = (typeof MANUAL_DRIPPER_RUNTIME_STATES)[number];

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function isValidManualDripperCalibration(
  calibration: ManualDripperCalibration,
  imageSize?: ImageSize,
): boolean {
  const values = [calibration.centerX, calibration.centerY, calibration.radiusX, calibration.radiusY];
  if (!values.every(Number.isFinite) || !finitePositive(calibration.radiusX) || !finitePositive(calibration.radiusY)) {
    return false;
  }
  if (calibration.rotationRadians !== undefined && !Number.isFinite(calibration.rotationRadians)) {
    return false;
  }
  return imageSize === undefined || (
    finitePositive(imageSize.width)
    && finitePositive(imageSize.height)
    && calibration.centerX >= 0
    && calibration.centerX <= imageSize.width
    && calibration.centerY >= 0
    && calibration.centerY <= imageSize.height
  );
}

function requireRadius(calibration: ManualDripperCalibration): number {
  const radius = effectiveDripperRadius(calibration.radiusX, calibration.radiusY);
  if (radius === null || !isValidManualDripperCalibration(calibration)) {
    throw new RangeError("Manual dripper calibration must contain finite coordinates and positive radii.");
  }
  return radius;
}

export function toDripperRelativePoint(
  point: Point2D,
  calibration: ManualDripperCalibration,
): DripperRelativePoint {
  const radius = requireRadius(calibration);
  return {
    u: (point.x - calibration.centerX) / radius,
    v: (point.y - calibration.centerY) / radius,
  };
}

export function toScreenPoint(
  point: DripperRelativePoint,
  calibration: ManualDripperCalibration,
): Point2D {
  const radius = requireRadius(calibration);
  return {
    x: calibration.centerX + point.u * radius,
    y: calibration.centerY + point.v * radius,
  };
}

function clippedArea(bounds: BoundingBox, imageSize: ImageSize): number {
  const left = Math.max(0, bounds.x);
  const top = Math.max(0, bounds.y);
  const right = Math.min(imageSize.width, bounds.x + bounds.width);
  const bottom = Math.min(imageSize.height, bounds.y + bounds.height);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function clipBounds(bounds: BoundingBox, imageSize: ImageSize): BoundingBox {
  const x = Math.max(0, bounds.x);
  const y = Math.max(0, bounds.y);
  const right = Math.min(imageSize.width, bounds.x + bounds.width);
  const bottom = Math.min(imageSize.height, bounds.y + bounds.height);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

export function deriveSpoutSearchRegion(
  calibration: ManualDripperCalibration,
  imageSize: ImageSize,
  policy: SpoutSearchRegionPolicy = SPOUT_SEARCH_REGION_PRESETS.balanced,
): SpoutSearchRegion {
  const radius = requireRadius(calibration);
  if (!finitePositive(imageSize.width) || !finitePositive(imageSize.height)) {
    throw new RangeError("Image dimensions must be positive and finite.");
  }
  const margins = [policy.leftMarginRadii, policy.rightMarginRadii, policy.topMarginRadii, policy.bottomMarginRadii];
  if (!margins.every((value) => Number.isFinite(value) && value >= 0)) {
    throw new RangeError("Search-region margins must be finite and non-negative.");
  }
  const left = calibration.centerX - calibration.radiusX - policy.leftMarginRadii * radius;
  const right = calibration.centerX + calibration.radiusX + policy.rightMarginRadii * radius;
  const top = calibration.centerY - calibration.radiusY - policy.topMarginRadii * radius;
  const bottom = calibration.centerY + calibration.radiusY + policy.bottomMarginRadii * radius;
  const unclippedBounds = { x: left, y: top, width: right - left, height: bottom - top };
  const area = unclippedBounds.width * unclippedBounds.height;
  return {
    policy: policy.id,
    bounds: clipBounds(unclippedBounds, imageSize),
    unclippedBounds,
    retainedAreaRatio: area > 0 ? clippedArea(unclippedBounds, imageSize) / area : 0,
  };
}

export function assessManualCameraSetup(
  calibration: ManualDripperCalibration,
  imageSize: ImageSize,
  searchRegion: SpoutSearchRegion,
): CameraSetupCheck[] {
  if (!isValidManualDripperCalibration(calibration, imageSize)) {
    throw new RangeError("Calibration center must be inside a valid image and radii must be positive.");
  }
  const radius = requireRadius(calibration);
  const dripperBounds: BoundingBox = {
    x: calibration.centerX - calibration.radiusX,
    y: calibration.centerY - calibration.radiusY,
    width: calibration.radiusX * 2,
    height: calibration.radiusY * 2,
  };
  const dripperArea = dripperBounds.width * dripperBounds.height;
  const dripperRetained = clippedArea(dripperBounds, imageSize) / dripperArea;
  const apparentSize = radius / Math.min(imageSize.width, imageSize.height);
  return [
    {
      code: "dripper_in_frame",
      status: dripperRetained >= 0.8 ? "pass" : "guidance",
      message: dripperRetained >= 0.8 ? "Dripper guide is mostly inside the frame." : "Keep the dripper inside the guide.",
      measuredRatio: dripperRetained,
    },
    {
      code: "dripper_apparent_size",
      status: apparentSize >= 0.1 ? "pass" : "guidance",
      message: apparentSize >= 0.1 ? "Dripper apparent size is usable." : "Move the phone slightly closer.",
      measuredRatio: apparentSize,
    },
    {
      code: "search_region_clipping",
      status: searchRegion.retainedAreaRatio >= 0.8 ? "pass" : "guidance",
      message: searchRegion.retainedAreaRatio >= 0.8
        ? "The spout search area is mostly available."
        : "Make sure the kettle spout can enter the highlighted area.",
      measuredRatio: searchRegion.retainedAreaRatio,
    },
  ];
}

