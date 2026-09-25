import { basename } from "node:path";

const ACCEPTED_LABELS = new Set(["gooseneck_spout", "spout_tip", "dripper"]);

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function regionsOf(record) {
  if (Array.isArray(record?.regions)) return record.regions;
  if (record?.regions && typeof record.regions === "object") return Object.values(record.regions);
  return [];
}

function one(regions, label, context, errors) {
  const matches = regions.filter((region) => region?.region_attributes?.label === label);
  if (matches.length > 1) errors.push(`${context} has ${matches.length} ${label} regions; expected at most one`);
  return matches[0];
}

function validPoint(x, y, frame) {
  return finite(x) && finite(y) && x >= 0 && x <= frame.width && y >= 0 && y <= frame.height;
}

export function normalizeViaAnnotations(viaDocument, frozenManifest) {
  const errors = [];
  const warnings = [];
  const expectedFrames = frozenManifest.frames.filter((frame) => frame.annotationStatus === "required");
  const expectedByName = new Map(expectedFrames.map((frame) => [basename(frame.path), frame]));
  const records = Object.values(viaDocument ?? {});
  const seen = new Set();
  const annotations = [];
  const summary = {
    records: records.length,
    matchedFrames: 0,
    positive: 0,
    negative: 0,
    dripperOnlyNegatives: 0,
    zeroRegionNegatives: 0,
    boxes: 0,
    tips: 0,
    dripperCircles: 0,
    invalidShapes: 0,
    duplicateShapes: 0,
  };

  for (const record of records) {
    const name = basename(String(record?.filename ?? "").replaceAll("\\", "/"));
    const frame = expectedByName.get(name);
    if (!frame) {
      errors.push(`VIA image ${name || "<missing filename>"} does not exactly match a required first-party frame`);
      continue;
    }
    if (seen.has(frame.frameId)) {
      errors.push(`VIA contains duplicate frame identity ${frame.frameId}`);
      continue;
    }
    seen.add(frame.frameId);
    summary.matchedFrames += 1;
    const regions = regionsOf(record);
    for (const region of regions) {
      const label = region?.region_attributes?.label;
      if (!ACCEPTED_LABELS.has(label)) errors.push(`${frame.frameId} has unsupported label ${String(label)}`);
    }
    const context = `VIA/${frame.frameId}`;
    const boxRegion = one(regions, "gooseneck_spout", context, errors);
    const tipRegion = one(regions, "spout_tip", context, errors);
    const dripperRegion = one(regions, "dripper", context, errors);
    const labelCounts = ["gooseneck_spout", "spout_tip", "dripper"].map((label) => regions.filter((region) => region?.region_attributes?.label === label).length);
    summary.duplicateShapes += labelCounts.filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0);

    if (Boolean(boxRegion) !== Boolean(tipRegion)) errors.push(`${context} is bbox-only or tip-only`);
    let bbox;
    let spoutTip;
    if (boxRegion) {
      const shape = boxRegion.shape_attributes ?? {};
      if (shape.name !== "rect" || !finite(shape.x) || !finite(shape.y) || !finite(shape.width) || !finite(shape.height)
        || shape.width <= 0 || shape.height <= 0 || shape.x < 0 || shape.y < 0
        || shape.x + shape.width > frame.width || shape.y + shape.height > frame.height) {
        errors.push(`${context}/gooseneck_spout has invalid rectangle coordinates`);
        summary.invalidShapes += 1;
      } else {
        bbox = { xMin: shape.x, yMin: shape.y, xMax: shape.x + shape.width, yMax: shape.y + shape.height };
        summary.boxes += 1;
      }
    }
    if (tipRegion) {
      const shape = tipRegion.shape_attributes ?? {};
      if (shape.name !== "point" || !validPoint(shape.cx, shape.cy, frame)) {
        errors.push(`${context}/spout_tip has invalid point coordinates`);
        summary.invalidShapes += 1;
      } else {
        spoutTip = { x: shape.cx, y: shape.cy, visibility: "visible" };
        summary.tips += 1;
      }
    }
    let dripper = null;
    if (dripperRegion) {
      const shape = dripperRegion.shape_attributes ?? {};
      if (shape.name !== "circle" || !finite(shape.cx) || !finite(shape.cy) || !finite(shape.r) || shape.r <= 0
        || shape.cx - shape.r < 0 || shape.cx + shape.r > frame.width || shape.cy - shape.r < 0 || shape.cy + shape.r > frame.height) {
        errors.push(`${context}/dripper has invalid circle coordinates`);
        summary.invalidShapes += 1;
      } else {
        dripper = {
          centerX: shape.cx,
          centerY: shape.cy,
          radiusX: shape.r,
          radiusY: shape.r,
          radius: shape.r,
          effectiveRadius: shape.r,
          geometrySource: "via_circle",
        };
        summary.dripperCircles += 1;
      }
    }

    const positive = Boolean(boxRegion && tipRegion);
    if (positive) summary.positive += 1;
    else {
      summary.negative += 1;
      if (dripperRegion) summary.dripperOnlyNegatives += 1;
      if (regions.length === 0) summary.zeroRegionNegatives += 1;
    }
    const objects = bbox && spoutTip ? [{ class: "gooseneck_spout", bbox, spoutTip }] : [];
    annotations.push({ frameId: frame.frameId, dripper, objects });
  }

  for (const frame of expectedFrames) if (!seen.has(frame.frameId)) errors.push(`VIA is missing required frame ${frame.frameId}`);
  if (records.length !== expectedFrames.length) errors.push(`VIA has ${records.length} records; expected ${expectedFrames.length}`);
  return { errors, warnings, summary, annotations: errors.length === 0 ? annotations : null };
}

export function validateFinalAnnotations(finalDocument, frozenManifest) {
  const errors = [];
  const annotations = finalDocument?.passes?.[0]?.annotations ?? [];
  const frameById = new Map(frozenManifest.frames.map((frame) => [frame.frameId, frame]));
  const seen = new Set();
  const splitCounts = { train: { positive: 0, negative: 0 }, validation: { positive: 0, negative: 0 }, test: { positive: 0, negative: 0 } };
  let positive = 0;
  let negative = 0;
  let dripperCoverage = 0;
  let viaCircleDrippers = 0;
  let pilotEllipseDrippers = 0;
  for (const annotation of annotations) {
    const frame = frameById.get(annotation.frameId);
    if (!frame) { errors.push(`annotation/frame mismatch ${annotation.frameId}`); continue; }
    if (seen.has(annotation.frameId)) errors.push(`duplicate annotation ${annotation.frameId}`);
    seen.add(annotation.frameId);
    if (/^session-0(0[5-9]|10)-/.test(annotation.frameId)) errors.push(`external benchmark contamination ${annotation.frameId}`);
    const objects = annotation.objects ?? [];
    if (objects.length === 1) {
      positive += 1;
      splitCounts[frame.split].positive += 1;
      const object = objects[0];
      if (object.class !== "gooseneck_spout") errors.push(`${annotation.frameId} has invalid object class`);
      const { bbox, spoutTip } = object;
      if (!bbox || ![bbox.xMin, bbox.yMin, bbox.xMax, bbox.yMax].every(finite)
        || bbox.xMin < 0 || bbox.yMin < 0 || bbox.xMin >= bbox.xMax || bbox.yMin >= bbox.yMax
        || bbox.xMax > frame.width || bbox.yMax > frame.height) errors.push(`${annotation.frameId} has invalid bbox`);
      if (!spoutTip || !validPoint(spoutTip.x, spoutTip.y, frame)) errors.push(`${annotation.frameId} has invalid tip`);
    } else if (objects.length === 0) {
      negative += 1;
      splitCounts[frame.split].negative += 1;
    } else errors.push(`${annotation.frameId} has ${objects.length} objects; expected zero or one`);
    if (annotation.dripper) {
      dripperCoverage += 1;
      const d = annotation.dripper;
      if (![d.centerX, d.centerY, d.radiusX, d.radiusY].every(finite) || d.radiusX <= 0 || d.radiusY <= 0
        || d.centerX - d.radiusX < 0 || d.centerX + d.radiusX > frame.width
        || d.centerY - d.radiusY < 0 || d.centerY + d.radiusY > frame.height) errors.push(`${annotation.frameId} has invalid dripper geometry`);
      if (d.geometrySource === "via_circle") viaCircleDrippers += 1;
      else if (d.geometrySource === "pilot_cvat_ellipse") pilotEllipseDrippers += 1;
      else errors.push(`${annotation.frameId} has unknown dripper geometry source`);
    }
  }
  for (const frame of frozenManifest.frames) if (!seen.has(frame.frameId)) errors.push(`missing annotation ${frame.frameId}`);
  if (annotations.length !== 88) errors.push(`final annotations contain ${annotations.length} frames; expected 88`);
  if (JSON.stringify(finalDocument).includes("spoutNeckBase") || JSON.stringify(finalDocument).includes("spout_neck_base")) errors.push("spout_neck_base is present");
  return {
    errors,
    summary: { total: annotations.length, positive, negative, splitCounts, dripperCoverage, viaCircleDrippers, pilotEllipseDrippers },
  };
}
