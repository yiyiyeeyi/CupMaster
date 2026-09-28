#!/usr/bin/env node

import { basename, resolve } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const ACCEPTED_LABELS = new Set(["gooseneck_spout", "spout_tip", "dripper"]);
const LABEL_BY_SHAPE = new Map([
  ["rect", "gooseneck_spout"],
  ["point", "spout_tip"],
  ["circle", "dripper"],
  ["ellipse", "dripper"],
]);

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function regionsOf(record) {
  if (Array.isArray(record?.regions)) return record.regions;
  if (record?.regions && typeof record.regions === "object") return Object.values(record.regions);
  return [];
}

function inBounds(x, y, frame) {
  return finite(x) && finite(y) && x >= 0 && x <= frame.width && y >= 0 && y <= frame.height;
}

function repairedLabel(frameId, region, repairs) {
  const label = region?.region_attributes?.label;
  const shape = region?.shape_attributes?.name;
  const geometryLabel = LABEL_BY_SHAPE.get(shape);
  if (geometryLabel && geometryLabel !== label) {
    repairs.push({
      frameId,
      originalLabel: label ?? null,
      shape,
      normalizedLabel: geometryLabel,
      reason: "VIA label was blank or incompatible with the schema's unique shape role",
    });
    return geometryLabel;
  }
  return label;
}

function validDripper(shape, frame) {
  const radiusX = shape.name === "circle" ? shape.r : shape.rx;
  const radiusY = shape.name === "circle" ? shape.r : shape.ry;
  return (shape.name === "circle" || shape.name === "ellipse")
    && inBounds(shape.cx, shape.cy, frame)
    && finite(radiusX) && finite(radiusY) && radiusX > 0 && radiusY > 0
    && shape.cx + radiusX > 0 && shape.cx - radiusX < frame.width
    && shape.cy + radiusY > 0 && shape.cy - radiusY < frame.height;
}

export function normalizeResearchVia(viaDocument, packageManifest) {
  const errors = [];
  const repairs = [];
  const frames = packageManifest?.frames ?? [];
  const byName = new Map(frames.map((frame) => [basename(frame.filename), frame]));
  const records = Object.values(viaDocument ?? {});
  const seen = new Set();
  const annotations = [];
  const sessionSummary = {};

  for (const record of records) {
    const filename = basename(String(record?.filename ?? "").replaceAll("\\", "/"));
    const frame = byName.get(filename);
    if (!frame) {
      errors.push(`VIA image ${filename || "<missing filename>"} does not exactly match the package manifest`);
      continue;
    }
    if (seen.has(frame.frameId)) {
      errors.push(`duplicate VIA frame identity ${frame.frameId}`);
      continue;
    }
    seen.add(frame.frameId);
    if (!/^session-01[1-3]$/.test(frame.sessionId)) errors.push(`refusing out-of-scope session ${frame.sessionId}`);
    if (frame.researchTrainingEligible !== true || frame.productionTrainingEligible !== false) {
      errors.push(`${frame.frameId} has invalid research/production eligibility`);
    }

    const regions = regionsOf(record).map((region) => ({
      ...region,
      normalizedLabel: repairedLabel(frame.frameId, region, repairs),
    }));
    for (const region of regions) {
      if (!ACCEPTED_LABELS.has(region.normalizedLabel)) {
        errors.push(`${frame.frameId} has unsupported label ${String(region.normalizedLabel)}`);
      }
    }
    const byLabel = Object.fromEntries([...ACCEPTED_LABELS].map((label) => [
      label, regions.filter((region) => region.normalizedLabel === label),
    ]));
    for (const [label, matches] of Object.entries(byLabel)) {
      if (matches.length > 1) errors.push(`${frame.frameId} has ${matches.length} ${label} shapes`);
    }
    const boxRegion = byLabel.gooseneck_spout[0];
    const tipRegion = byLabel.spout_tip[0];
    const dripperRegion = byLabel.dripper[0];
    if (Boolean(boxRegion) !== Boolean(tipRegion)) errors.push(`${frame.frameId} is bbox-only or tip-only`);

    let bbox;
    if (boxRegion) {
      const shape = boxRegion.shape_attributes ?? {};
      if (shape.name !== "rect" || !finite(shape.x) || !finite(shape.y) || !finite(shape.width) || !finite(shape.height)
        || shape.x < 0 || shape.y < 0 || shape.width <= 0 || shape.height <= 0
        || shape.x + shape.width > frame.width || shape.y + shape.height > frame.height) {
        errors.push(`${frame.frameId} has invalid gooseneck_spout rectangle`);
      } else {
        bbox = { xMin: shape.x, yMin: shape.y, xMax: shape.x + shape.width, yMax: shape.y + shape.height };
      }
    }
    let spoutTip;
    if (tipRegion) {
      const shape = tipRegion.shape_attributes ?? {};
      if (shape.name !== "point" || !inBounds(shape.cx, shape.cy, frame)) {
        errors.push(`${frame.frameId} has invalid spout_tip point`);
      } else {
        spoutTip = { x: shape.cx, y: shape.cy, visibility: "visible" };
      }
    }
    let dripper = null;
    if (dripperRegion) {
      const shape = dripperRegion.shape_attributes ?? {};
      if (!validDripper(shape, frame)) {
        errors.push(`${frame.frameId} has invalid dripper ${String(shape.name)} geometry`);
      } else {
        const radiusX = shape.name === "circle" ? shape.r : shape.rx;
        const radiusY = shape.name === "circle" ? shape.r : shape.ry;
        dripper = {
          centerX: shape.cx, centerY: shape.cy, radiusX, radiusY,
          effectiveRadius: Math.sqrt(radiusX * radiusY),
          geometrySource: shape.name === "circle" ? "via_circle" : "via_ellipse",
        };
      }
    }

    const objects = bbox && spoutTip ? [{ class: "gooseneck_spout", bbox, spoutTip }] : [];
    const summary = sessionSummary[frame.sessionId] ?? {
      total: 0, positive: 0, negative: 0, dripper: 0, bbox: 0, tip: 0,
    };
    summary.total += 1;
    summary.positive += Number(objects.length === 1);
    summary.negative += Number(objects.length === 0);
    summary.dripper += Number(Boolean(dripper));
    summary.bbox += Number(Boolean(bbox));
    summary.tip += Number(Boolean(spoutTip));
    sessionSummary[frame.sessionId] = summary;
    annotations.push({
      frameId: frame.frameId,
      sessionId: frame.sessionId,
      timestampMs: frame.timestampMs,
      filename: frame.filename,
      width: frame.width,
      height: frame.height,
      sourceType: "external_reference",
      researchTrainingEligible: true,
      productionTrainingEligible: false,
      dripper,
      objects,
    });
  }

  for (const frame of frames) if (!seen.has(frame.frameId)) errors.push(`missing VIA record ${frame.frameId}`);
  if (records.length !== frames.length) errors.push(`VIA has ${records.length} records; manifest has ${frames.length}`);
  return {
    errors,
    repairs,
    summary: { records: records.length, matched: seen.size, sessions: sessionSummary },
    annotations: errors.length === 0 ? annotations : null,
  };
}

async function main() {
  const [viaPath, manifestPath, outputPath] = process.argv.slice(2);
  if (!viaPath || !manifestPath || !outputPath) {
    throw new Error("usage: node task9c5-3-normalize-research.mjs <via.json> <manifest.json> <output.json>");
  }
  const [via, manifest] = await Promise.all([
    readFile(resolve(viaPath), "utf8").then(JSON.parse),
    readFile(resolve(manifestPath), "utf8").then(JSON.parse),
  ]);
  const result = normalizeResearchVia(via, manifest);
  if (result.errors.length > 0) {
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 1;
    return;
  }
  const destination = resolve(outputPath);
  await mkdir(resolve(destination, ".."), { recursive: true });
  const document = {
    version: "task-9c5-3-targeted-research-v1",
    schema: {
      primaryTarget: "spout_tip",
      analysisShape: "gooseneck_spout",
      normalizationGeometry: "dripper",
      removed: "spout_neck_base",
    },
    provenance: {
      source: resolve(viaPath),
      sourceType: "external_reference",
      researchTrainingEligible: true,
      productionTrainingEligible: false,
      repairs: result.repairs,
    },
    summary: result.summary,
    annotations: result.annotations,
  };
  await writeFile(destination, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: destination, ...result.summary, repairs: result.repairs }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
