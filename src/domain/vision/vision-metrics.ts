import type { BoundingBox, Point2D } from "./hybrid-runtime-contract";

export interface DistributionSummary {
  count: number;
  mean: number | null;
  median: number | null;
  p90: number | null;
  max: number | null;
}

export function pointDistance(left: Point2D, right: Point2D): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

export function effectiveDripperRadius(radiusX: number, radiusY: number): number | null {
  if (!Number.isFinite(radiusX) || !Number.isFinite(radiusY) || radiusX <= 0 || radiusY <= 0) {
    return null;
  }
  return Math.sqrt(radiusX * radiusY);
}

export function normalizedPointError(
  predicted: Point2D,
  expected: Point2D,
  radiusX: number,
  radiusY: number,
): number | null {
  const radius = effectiveDripperRadius(radiusX, radiusY);
  return radius === null ? null : pointDistance(predicted, expected) / radius;
}

export function bboxIoU(left: BoundingBox, right: BoundingBox): number {
  if (![left.x, left.y, left.width, left.height, right.x, right.y, right.width, right.height]
    .every(Number.isFinite) || left.width <= 0 || left.height <= 0 || right.width <= 0 || right.height <= 0) {
    return 0;
  }

  const intersectionWidth = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const intersectionHeight = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  const intersection = intersectionWidth * intersectionHeight;
  const union = left.width * left.height + right.width * right.height - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function summarizeDistribution(values: readonly number[]): DistributionSummary {
  const sorted = values.filter(Number.isFinite).toSorted((left, right) => left - right);
  if (sorted.length === 0) {
    return { count: 0, mean: null, median: null, p90: null, max: null };
  }

  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  const p90Index = Math.ceil(0.9 * sorted.length) - 1;

  return {
    count: sorted.length,
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    median,
    p90: sorted[p90Index],
    max: sorted.at(-1) ?? null,
  };
}
