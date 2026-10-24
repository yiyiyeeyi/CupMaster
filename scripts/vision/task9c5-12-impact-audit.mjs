#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const PATHS = {
  annotations: resolve(ROOT, ".vision-work/datasets/task-9c5-11/annotations/task-9c5-11-targeted-v0.normalized.json"),
  audit: resolve(ROOT, ".vision-work/datasets/task-9c5-12/manual-audit-v0.json"),
  output: resolve(ROOT, ".vision-work/eval/task-9c5-12/pour-impact-feasibility-v0.json"),
};

function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function normalizedDistance(left, right, dripper) {
  return Math.hypot(
    (left.x - right.x) / dripper.radiusX,
    (left.y - right.y) / dripper.radiusY,
  );
}

function normalizedPoint(point, dripper) {
  const x = (point.x - dripper.centerX) / dripper.radiusX;
  const y = (point.y - dripper.centerY) / dripper.radiusY;
  return { x, y, radius: Math.hypot(x, y), angle: Math.atan2(y, x) };
}

function wrappedDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function percentile(values, quantile) {
  const sorted = values.toSorted((left, right) => left - right);
  if (sorted.length === 0) return null;
  const index = Math.ceil(quantile * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function distribution(values) {
  return {
    count: values.length,
    median: percentile(values, 0.5),
    p90: percentile(values, 0.9),
    max: values.length === 0 ? null : Math.max(...values),
  };
}

function countValues(records, key) {
  return records.reduce((counts, record) => {
    counts[record[key]] = (counts[record[key]] ?? 0) + 1;
    return counts;
  }, {});
}

function summarizePath(points) {
  if (points.length < 2) return { samples: points.length, angularTravel: 0, radialDelta: 0, direction: "UNKNOWN", radialTrend: "UNKNOWN", shape: "UNKNOWN" };
  let angularTravel = 0;
  for (let index = 1; index < points.length; index += 1) angularTravel += wrappedDelta(points[index - 1].angle, points[index].angle);
  const radialDelta = points.at(-1).radius - points[0].radius;
  const direction = Math.abs(angularTravel) < 0.15 ? "UNKNOWN" : angularTravel > 0 ? "CLOCKWISE" : "COUNTERCLOCKWISE";
  const radialTrend = Math.abs(radialDelta) < 0.1 ? "STABLE_RADIUS" : radialDelta > 0 ? "OUTWARD" : "INWARD";
  const shape = direction === "UNKNOWN" ? "NON_CIRCULAR_OR_INSUFFICIENT"
    : radialTrend === "STABLE_RADIUS" ? "APPROX_CIRCULAR"
      : radialTrend === "INWARD" ? "INWARD_SPIRAL_TENDENCY" : "OUTWARD_SPIRAL_TENDENCY";
  return { samples: points.length, angularTravel, radialDelta, direction, radialTrend, shape };
}

export function analyzeImpactAudit(annotationDocument, audit) {
  const byId = new Map(annotationDocument.annotations.map((annotation) => [annotation.frameId, annotation]));
  const errors = [];
  for (const record of [...audit.waterOn, ...audit.waterOffControls]) {
    if (!byId.has(record.frameId)) errors.push(`Unknown audit frame ${record.frameId}`);
  }
  if (audit.waterOn.length < 18 || audit.waterOn.length > 24) errors.push("Water-on audit must contain 18-24 frames");
  if (audit.waterOffControls.length < 3 || audit.waterOffControls.length > 5) errors.push("Water-off controls must contain 3-5 frames");

  const repeatability = { tipPixels: [], tipNormalized: [], impactPixels: [], impactNormalized: [] };
  for (const record of audit.repeatability) {
    const annotation = byId.get(record.frameId);
    const tipPass1 = annotation?.objects?.[0]?.spoutTip;
    if (!annotation?.dripper || !tipPass1) {
      errors.push(`Repeatability frame lacks tip/dripper ${record.frameId}`);
      continue;
    }
    repeatability.tipPixels.push(distance(tipPass1, record.tipPass2));
    repeatability.tipNormalized.push(normalizedDistance(tipPass1, record.tipPass2, annotation.dripper));
    repeatability.impactPixels.push(distance(record.impactPass1, record.impactPass2));
    repeatability.impactNormalized.push(normalizedDistance(record.impactPass1, record.impactPass2, annotation.dripper));
  }

  const displacements = [];
  const pathBySession = new Map();
  for (const record of audit.waterOn) {
    if (record.impact === null) continue;
    const annotation = byId.get(record.frameId);
    const tip = annotation?.objects?.[0]?.spoutTip;
    if (!annotation?.dripper || !tip) continue;
    const tipNormalized = normalizedPoint(tip, annotation.dripper);
    const impactNormalized = normalizedPoint(record.impact, annotation.dripper);
    const dx = impactNormalized.x - tipNormalized.x;
    const dy = impactNormalized.y - tipNormalized.y;
    displacements.push({
      frameId: record.frameId,
      pixels: distance(tip, record.impact),
      normalized: Math.hypot(dx, dy),
      directionRadians: Math.atan2(dy, dx),
      tipRadius: tipNormalized.radius,
      impactRadius: impactNormalized.radius,
      tipAngle: tipNormalized.angle,
      impactAngle: impactNormalized.angle,
    });
    const session = annotation.sessionId;
    const rows = pathBySession.get(session) ?? [];
    rows.push({ timestampMs: annotation.timestampMs, tip: tipNormalized, impact: impactNormalized });
    pathBySession.set(session, rows);
  }

  const trajectoryComparison = {};
  for (const [session, rows] of pathBySession) {
    rows.sort((left, right) => left.timestampMs - right.timestampMs);
    const tip = summarizePath(rows.map((row) => row.tip));
    const impact = summarizePath(rows.map((row) => row.impact));
    trajectoryComparison[session] = {
      tip,
      impact,
      directionAgreement: tip.direction === impact.direction,
      radialTrendAgreement: tip.radialTrend === impact.radialTrend,
      shapeAgreement: tip.shape === impact.shape,
      caution: "Sparse selected stills are not a continuous trajectory benchmark.",
    };
  }

  return {
    errors,
    sample: { waterOn: audit.waterOn.length, waterOffControls: audit.waterOffControls.length },
    identifiability: {
      spoutTip: countValues(audit.waterOn, "spoutTip"),
      waterStream: countValues(audit.waterOn, "waterStream"),
      impactPoint: countValues(audit.waterOn, "impactPoint"),
    },
    ambiguityReasons: audit.waterOn.flatMap((record) => record.ambiguityReasons).reduce((counts, reason) => {
      counts[reason] = (counts[reason] ?? 0) + 1;
      return counts;
    }, {}),
    repeatability: {
      frames: audit.repeatability.length,
      spoutTip: { pixels: distribution(repeatability.tipPixels), normalized: distribution(repeatability.tipNormalized) },
      impactPoint: { pixels: distribution(repeatability.impactPixels), normalized: distribution(repeatability.impactNormalized) },
    },
    tipToImpact: {
      frames: displacements.length,
      pixels: distribution(displacements.map((row) => row.pixels)),
      normalized: distribution(displacements.map((row) => row.normalized)),
      rows: displacements,
    },
    trajectoryComparison,
  };
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const annotations = JSON.parse(readFileSync(PATHS.annotations, "utf8"));
  const audit = JSON.parse(readFileSync(PATHS.audit, "utf8"));
  const result = analyzeImpactAudit(annotations, audit);
  mkdirSync(resolve(PATHS.output, ".."), { recursive: true });
  writeFileSync(PATHS.output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length > 0) process.exitCode = 1;
}
