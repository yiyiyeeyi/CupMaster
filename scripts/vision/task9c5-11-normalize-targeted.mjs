#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DATASET_ROOT = resolve(ROOT, ".vision-work/datasets/task-9c5-11");
const DEFAULT_PATHS = {
  via: resolve(DATASET_ROOT, "annotation/via-task-9c5-11-targeted-v0.json"),
  manifest: resolve(DATASET_ROOT, "annotation/annotation-manifest.json"),
  images: resolve(DATASET_ROOT, "annotation/images"),
  output: resolve(DATASET_ROOT, "annotations/task-9c5-11-targeted-v0.normalized.json"),
  qa: resolve(DATASET_ROOT, "annotations/task-9c5-11-targeted-v0.qa.json"),
};

const ACCEPTED_LABELS = new Set(["spout_tip", "gooseneck_spout", "dripper"]);

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function regionsOf(record) {
  if (Array.isArray(record?.regions)) return record.regions;
  if (record?.regions && typeof record.regions === "object") return Object.values(record.regions);
  return [];
}

function imageIdentity(record) {
  return basename(String(record?.filename ?? "").replaceAll("\\", "/"));
}

function normalizeDripper(shape, frame) {
  if (shape.name === "circle") {
    if (![shape.cx, shape.cy, shape.r].every(finite) || shape.r <= 0) return null;
    if (shape.cx - shape.r < 0 || shape.cy - shape.r < 0
      || shape.cx + shape.r > frame.width || shape.cy + shape.r > frame.height) return null;
    return {
      centerX: shape.cx,
      centerY: shape.cy,
      radiusX: shape.r,
      radiusY: shape.r,
      effectiveRadius: shape.r,
      geometrySource: "via_circle",
    };
  }
  if (shape.name === "ellipse") {
    if (![shape.cx, shape.cy, shape.rx, shape.ry].every(finite) || shape.rx <= 0 || shape.ry <= 0) return null;
    if (shape.cx - shape.rx < 0 || shape.cy - shape.ry < 0
      || shape.cx + shape.rx > frame.width || shape.cy + shape.ry > frame.height) return null;
    return {
      centerX: shape.cx,
      centerY: shape.cy,
      radiusX: shape.rx,
      radiusY: shape.ry,
      effectiveRadius: Math.sqrt(shape.rx * shape.ry),
      geometrySource: "via_ellipse",
    };
  }
  return null;
}

function duplicateGeometry(regions) {
  const serialized = regions.map((region) => JSON.stringify({
    shape: region?.shape_attributes ?? {},
    label: region?.region_attributes?.label ?? null,
  }));
  return serialized.length - new Set(serialized).size;
}

export function normalizeTargetedVia(viaDocument, manifest) {
  const errors = [];
  const warnings = [];
  const frames = Array.isArray(manifest?.frames) ? manifest.frames : [];
  const expectedByName = new Map(frames.map((frame) => [frame.filename, frame]));
  const allRecords = Object.values(viaDocument ?? {});
  const targetRecords = allRecords.filter((record) => expectedByName.has(imageIdentity(record)));
  const unrelatedRecords = allRecords.filter((record) => !expectedByName.has(imageIdentity(record)));
  const recordsByName = new Map();
  for (const record of targetRecords) {
    const name = imageIdentity(record);
    const existing = recordsByName.get(name) ?? [];
    existing.push(record);
    recordsByName.set(name, existing);
  }

  const annotations = [];
  let invalidShapes = 0;
  let duplicateShapes = 0;
  let unsupportedLabels = 0;
  let blankEllipseFallbacks = 0;
  let bboxOnly = 0;
  let tipOnly = 0;
  for (const frame of frames) {
    const matches = recordsByName.get(frame.filename) ?? [];
    if (matches.length === 0) {
      errors.push(`Missing target VIA record: ${frame.filename}`);
      continue;
    }
    if (matches.length > 1) {
      errors.push(`Duplicate target VIA records: ${frame.filename} (${matches.length})`);
      continue;
    }
    const regions = regionsOf(matches[0]);
    duplicateShapes += duplicateGeometry(regions);
    if (duplicateGeometry(regions) > 0) errors.push(`${frame.id} contains duplicate geometry`);

    const labeled = [];
    for (const region of regions) {
      let label = region?.region_attributes?.label;
      const shape = region?.shape_attributes ?? {};
      if ((label === undefined || label === "") && shape.name === "ellipse") {
        label = "dripper";
        blankEllipseFallbacks += 1;
        warnings.push(`${frame.id}: blank ellipse label normalized to dripper`);
      }
      if (!ACCEPTED_LABELS.has(label)) {
        unsupportedLabels += 1;
        errors.push(`${frame.id} has unsupported or blank label ${String(label)}`);
        continue;
      }
      labeled.push({ label, shape });
    }

    const tips = labeled.filter((region) => region.label === "spout_tip");
    const boxes = labeled.filter((region) => region.label === "gooseneck_spout");
    const drippers = labeled.filter((region) => region.label === "dripper");
    if (tips.length > 1) errors.push(`${frame.id} has ${tips.length} spout_tip points`);
    if (boxes.length > 1) errors.push(`${frame.id} has ${boxes.length} gooseneck_spout boxes`);
    if (drippers.length > 1) errors.push(`${frame.id} has ${drippers.length} dripper shapes`);
    if (tips.length > 0 && boxes.length === 0) {
      tipOnly += 1;
      errors.push(`${frame.id} is tip-only`);
    }
    if (boxes.length > 0 && tips.length === 0) {
      bboxOnly += 1;
      errors.push(`${frame.id} is bbox-only`);
    }

    let spoutTip = null;
    if (tips.length === 1) {
      const shape = tips[0].shape;
      if (shape.name !== "point" || !finite(shape.cx) || !finite(shape.cy)
        || shape.cx < 0 || shape.cy < 0 || shape.cx > frame.width || shape.cy > frame.height) {
        invalidShapes += 1;
        errors.push(`${frame.id} has invalid spout_tip geometry`);
      } else spoutTip = { x: shape.cx, y: shape.cy, visibility: "visible" };
    }

    let bbox = null;
    if (boxes.length === 1) {
      const shape = boxes[0].shape;
      if (shape.name !== "rect" || ![shape.x, shape.y, shape.width, shape.height].every(finite)
        || shape.width <= 0 || shape.height <= 0 || shape.x < 0 || shape.y < 0
        || shape.x + shape.width > frame.width || shape.y + shape.height > frame.height) {
        invalidShapes += 1;
        errors.push(`${frame.id} has invalid gooseneck_spout geometry`);
      } else bbox = { xMin: shape.x, yMin: shape.y, xMax: shape.x + shape.width, yMax: shape.y + shape.height };
    }

    let dripper = null;
    if (drippers.length === 1) {
      dripper = normalizeDripper(drippers[0].shape, frame);
      if (dripper === null) {
        invalidShapes += 1;
        errors.push(`${frame.id} has invalid dripper geometry`);
      }
    }

    const positive = tips.length === 1 && boxes.length === 1;
    annotations.push({
      frameId: frame.id,
      filename: frame.filename,
      sessionId: frame.session,
      timestampMs: frame.timestampMs,
      kind: positive ? "positive" : "intentional_negative",
      dripper,
      objects: bbox !== null && spoutTip !== null ? [{ class: "gooseneck_spout", bbox, spoutTip }] : [],
      selectionMetadata: {
        waterOnHint: frame.waterOn,
        appearanceHints: frame.appearanceHints ?? [],
        distractorHints: frame.distractorHints ?? [],
        matchGroup: frame.matchGroup ?? null,
      },
    });
  }

  const perSession = {};
  for (const annotation of annotations) {
    const session = perSession[annotation.sessionId] ?? {
      total: 0, positive: 0, negative: 0, tips: 0, boxes: 0, drippers: 0,
    };
    session.total += 1;
    if (annotation.kind === "positive") {
      session.positive += 1;
      session.tips += annotation.objects[0]?.spoutTip ? 1 : 0;
      session.boxes += annotation.objects[0]?.bbox ? 1 : 0;
    } else session.negative += 1;
    if (annotation.dripper !== null) session.drippers += 1;
    perSession[annotation.sessionId] = session;
  }

  const positives = annotations.filter((annotation) => annotation.kind === "positive");
  const negatives = annotations.filter((annotation) => annotation.kind === "intentional_negative");
  const matchGroups = new Map();
  for (const annotation of annotations) {
    const group = annotation.selectionMetadata.matchGroup;
    if (group === null) continue;
    const counts = matchGroups.get(group) ?? { positive: 0, negative: 0 };
    counts[annotation.kind === "positive" ? "positive" : "negative"] += 1;
    matchGroups.set(group, counts);
  }
  const hardNegativeTags = {};
  for (const annotation of negatives) {
    for (const tag of annotation.selectionMetadata.distractorHints) {
      hardNegativeTags[tag] = (hardNegativeTags[tag] ?? 0) + 1;
    }
  }

  const summary = {
    viaRecords: allRecords.length,
    targetRecords: targetRecords.length,
    unrelatedRecordsIgnored: unrelatedRecords.length,
    normalizedAnnotations: annotations.length,
    positive: positives.length,
    negative: negatives.length,
    zeroRegionNegatives: annotations.filter((annotation) => {
      const record = recordsByName.get(annotation.filename)?.[0];
      return annotation.kind === "intentional_negative" && regionsOf(record).length === 0;
    }).length,
    invalidShapes,
    duplicateShapes,
    unsupportedLabels,
    tipOnly,
    bboxOnly,
    dripperCoverage: annotations.filter((annotation) => annotation.dripper !== null).length,
    blankEllipseFallbacks,
    waterOnPositivesFromSelectionHints: positives.filter((annotation) => annotation.selectionMetadata.waterOnHint === "yes").length,
    waterOffPositivesFromSelectionHints: positives.filter((annotation) => annotation.selectionMetadata.waterOnHint === "no").length,
    matchedPresenceGroups: Object.fromEntries([...matchGroups].filter(([, counts]) => counts.positive > 0 && counts.negative > 0)),
    hardNegativeTags,
    perSession,
  };
  return { errors, warnings, summary, annotations };
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function runNormalization(paths = DEFAULT_PATHS, options = {}) {
  const via = JSON.parse(readFileSync(paths.via, "utf8"));
  const manifest = JSON.parse(readFileSync(paths.manifest, "utf8"));
  const result = normalizeTargetedVia(via, manifest);
  for (const frame of manifest.frames ?? []) {
    const path = resolve(paths.images, frame.filename);
    if (!existsSync(path) || statSync(path).size === 0) result.errors.push(`Missing target image: ${frame.filename}`);
    else if (sha256(path) !== frame.sha256) result.errors.push(`Image hash mismatch: ${frame.filename}`);
  }
  if (result.summary.targetRecords !== 51) result.errors.push(`Expected 51 target records, found ${result.summary.targetRecords}`);
  if (result.summary.normalizedAnnotations !== 51) result.errors.push(`Expected 51 annotations, found ${result.summary.normalizedAnnotations}`);

  const normalized = {
    schemaVersion: 1,
    datasetVersion: options.datasetVersion ?? "task-9c5-11-targeted-v0",
    status: result.errors.length === 0 ? "training_ready" : "qa_failed",
    private: true,
    annotationSchema: {
      targets: ["gooseneck_spout", "spout_tip"],
      qaGeometry: ["dripper"],
      dripperEffectiveRadius: "sqrt(radiusX * radiusY)",
      removed: ["spout_neck_base"],
    },
    provenance: {
      inclusionAuthority: basename(paths.manifest),
      sourceVia: basename(paths.via),
      unrelatedViaRecordsImported: false,
      selectionHintsAreGroundTruth: false,
    },
    annotations: result.annotations,
  };
  const qa = { ...result, annotations: undefined, status: normalized.status };
  mkdirSync(resolve(paths.output, ".."), { recursive: true });
  writeFileSync(paths.output, `${JSON.stringify(normalized, null, 2)}\n`);
  writeFileSync(paths.qa, `${JSON.stringify(qa, null, 2)}\n`);
  return { normalized, qa };
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    const result = runNormalization();
    console.log(JSON.stringify(result.qa, null, 2));
    if (result.qa.errors.length > 0) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
