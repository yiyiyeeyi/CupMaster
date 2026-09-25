#!/usr/bin/env node
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCvatImagesXml, readZipEntry } from "./cvat-normalizer.mjs";
import { normalizeViaAnnotations, validateFinalAnnotations } from "./via-normalizer.mjs";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const VISION = resolve(ROOT, "data/vision");
const PATHS = {
  via: resolve(VISION, "exports/feasibility-v1/via-first-party-new-v1.json"),
  reused: resolve(VISION, "annotations/feasibility-v1/pilot-reused.json"),
  manifest: resolve(VISION, "frames/feasibility-v1/manifests/cupmaster-spout-first-party-v1.json"),
  output: resolve(VISION, "annotations/feasibility-v1/first-party-v1.training-ready.json"),
  qa: resolve(VISION, "annotations/feasibility-v1/first-party-v1.annotation-qa.json"),
  trainingManifest: resolve(VISION, "frames/feasibility-v1/manifests/cupmaster-spout-first-party-v1.training-ready.json"),
};

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function jpegExists(path) {
  if (!existsSync(path) || statSync(path).size < 4) return false;
  const bytes = readFileSync(path);
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
}

function pilotAnnotationsWithEllipseGeometry(reused, visionRoot) {
  const errors = [];
  const provenance = reused.provenance ?? {};
  const cvatPath = resolve(visionRoot, provenance.sourceCvatExport ?? "");
  if (!existsSync(cvatPath)) return { errors: [`Pilot CVAT source is missing: ${cvatPath}`], annotations: null, ellipseCount: 0 };
  const xml = readZipEntry(readFileSync(cvatPath), "annotations.xml").toString("utf8");
  const cvat = parseCvatImagesXml(xml);
  const cvatByFrameId = new Map(cvat.images.map((image) => [basename(image.name, ".jpg"), image]));
  const sourceAnnotations = reused.passes?.[0]?.annotations ?? [];
  const annotations = [];
  let ellipseCount = 0;
  for (const annotation of sourceAnnotations) {
    const image = cvatByFrameId.get(annotation.frameId);
    if (!image) { errors.push(`Pilot CVAT is missing ${annotation.frameId}`); continue; }
    const ellipses = image.shapes.filter((shape) => shape.label === "dripper" && shape.type === "ellipse");
    if (ellipses.length > 1) errors.push(`Pilot CVAT has duplicate dripper ellipse for ${annotation.frameId}`);
    let dripper = null;
    if (ellipses.length === 1) {
      const ellipse = ellipses[0];
      if (![ellipse.centerX, ellipse.centerY, ellipse.radiusX, ellipse.radiusY].every(Number.isFinite)
        || ellipse.radiusX <= 0 || ellipse.radiusY <= 0) errors.push(`Pilot CVAT has invalid dripper ellipse for ${annotation.frameId}`);
      else {
        const effectiveRadius = Math.sqrt(ellipse.radiusX * ellipse.radiusY);
        if (annotation.objects.length > 0 && Math.abs(effectiveRadius - annotation.dripper.radius) > 1e-6) {
          errors.push(`Pilot normalized dripper does not match CVAT ellipse for ${annotation.frameId}`);
        }
        dripper = {
          centerX: ellipse.centerX,
          centerY: ellipse.centerY,
          radiusX: ellipse.radiusX,
          radiusY: ellipse.radiusY,
          radius: effectiveRadius,
          effectiveRadius,
          geometrySource: "pilot_cvat_ellipse",
        };
        ellipseCount += 1;
      }
    }
    annotations.push({ frameId: annotation.frameId, dripper, objects: annotation.objects });
  }
  return { errors, annotations: errors.length === 0 ? annotations : null, ellipseCount };
}

function buildTrainingManifest(frozen, annotations) {
  const byId = new Map(annotations.map((annotation) => [annotation.frameId, annotation]));
  return {
    ...frozen,
    datasetStatus: "training_ready_annotations_complete",
    groundTruthPolicy: "Pilot validated annotations for reused frames; VIA regions authoritative for newly annotated frames",
    frames: frozen.frames.map((frame) => {
      const derivedKind = (byId.get(frame.frameId)?.objects.length ?? 0) === 1 ? "positive" : "negative";
      return {
        ...frame,
        selectionEstimateKind: frame.kind,
        kind: derivedKind,
        annotationStatus: "complete",
        groundTruthSource: frame.provenance?.annotationSource ? "validated_pilot" : "via_first_party_new_v1",
      };
    }),
  };
}

function integrityChecks(frozen, finalDocument) {
  const errors = [];
  const frameIds = new Set();
  const sourceKeys = new Set();
  const sessionSplits = new Map();
  for (const frame of frozen.frames) {
    if (frameIds.has(frame.frameId)) errors.push(`duplicate frameId ${frame.frameId}`);
    frameIds.add(frame.frameId);
    const sourceKey = `${frame.sessionId}:${frame.timestampMs}`;
    if (sourceKeys.has(sourceKey)) errors.push(`duplicate source identity ${sourceKey}`);
    sourceKeys.add(sourceKey);
    const prior = sessionSplits.get(frame.sessionId);
    if (prior && prior !== frame.split) errors.push(`split leakage ${frame.sessionId}`);
    sessionSplits.set(frame.sessionId, frame.split);
    if (!jpegExists(resolve(VISION, frame.path))) errors.push(`missing or corrupt JPEG ${frame.path}`);
    if (!/^session-00[1-4]$/.test(frame.sessionId)) errors.push(`external session contamination ${frame.sessionId}`);
  }
  if (finalDocument.annotationSchema?.qaOnly?.dripper?.trainingTarget !== false) errors.push("dripper is not explicitly QA-only");
  return { errors, sessionSplits: Object.fromEntries(sessionSplits) };
}

export function finalizeFirstParty(paths = PATHS) {
  const via = readJson(paths.via);
  const reused = readJson(paths.reused);
  const frozen = readJson(paths.manifest);
  const viaResult = normalizeViaAnnotations(via, frozen);
  const pilotResult = pilotAnnotationsWithEllipseGeometry(reused, VISION);
  const errors = [...viaResult.errors, ...pilotResult.errors];
  if (errors.length > 0) throw new Error(errors.join("\n"));

  const mergedById = new Map([...pilotResult.annotations, ...viaResult.annotations].map((annotation) => [annotation.frameId, annotation]));
  const annotations = frozen.frames.map((frame) => mergedById.get(frame.frameId)).filter(Boolean);
  const finalDocument = {
    schemaVersion: 1,
    datasetVersion: "cupmaster-spout-first-party-v1",
    status: "training_ready",
    annotationSchema: {
      trainingTargets: ["gooseneck_spout", "spout_tip"],
      qaOnly: { dripper: { trainingTarget: false, geometry: "ellipse", effectiveRadius: "sqrt(radiusX * radiusY)" } },
      removed: ["spout neck base"],
    },
    provenance: {
      pilot: paths.reused.replace(`${VISION}\\`, "").replaceAll("\\", "/"),
      via: paths.via.replace(`${VISION}\\`, "").replaceAll("\\", "/"),
      groundTruthPolicy: "VIA regions are authoritative for the 46 new frames; candidate labels are selection estimates only",
    },
    passes: [{ passId: "final-first-party-v1", annotations }],
  };
  const annotationValidation = validateFinalAnnotations(finalDocument, frozen);
  const integrity = integrityChecks(frozen, finalDocument);
  const changedFromSelection = frozen.frames.filter((frame) => {
    const annotation = mergedById.get(frame.frameId);
    const actual = annotation?.objects.length === 1 ? "positive" : "negative";
    return frame.kind !== actual;
  }).map((frame) => ({ frameId: frame.frameId, selectionEstimate: frame.kind, authoritativeKind: mergedById.get(frame.frameId)?.objects.length === 1 ? "positive" : "negative" }));
  const qa = {
    schemaVersion: 1,
    datasetVersion: finalDocument.datasetVersion,
    errors: [...annotationValidation.errors, ...integrity.errors],
    via: viaResult.summary,
    merged: annotationValidation.summary,
    integrity: { ...integrity, errors: integrity.errors },
    changedFromSelection,
    invalidShapes: viaResult.summary.invalidShapes,
    duplicateShapes: viaResult.summary.duplicateShapes,
    bboxOnly: 0,
    tipOnly: 0,
    negativeFalsePositiveCount: 0,
    dripperIsQaOnly: true,
    spoutNeckBaseAbsent: !JSON.stringify(finalDocument).includes("spoutNeckBase") && !JSON.stringify(finalDocument).includes("spout_neck_base"),
  };
  if (qa.errors.length > 0) throw new Error(qa.errors.join("\n"));
  writeJson(paths.output, finalDocument);
  writeJson(paths.trainingManifest, buildTrainingManifest(frozen, annotations));
  writeJson(paths.qa, qa);
  return { finalDocument, qa };
}

function validateOnly(paths = PATHS) {
  const finalDocument = readJson(paths.output);
  const frozen = readJson(paths.manifest);
  const annotationValidation = validateFinalAnnotations(finalDocument, frozen);
  const integrity = integrityChecks(frozen, finalDocument);
  const result = { errors: [...annotationValidation.errors, ...integrity.errors], annotations: annotationValidation.summary, integrity };
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length > 0) process.exitCode = 1;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes("--validate-only")) validateOnly();
    else {
      const result = finalizeFirstParty();
      console.log(JSON.stringify(result.qa, null, 2));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
