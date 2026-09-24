#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const VISION_ROOT = resolve(ROOT, "data/vision");
const DEFAULTS = {
  candidate: resolve(VISION_ROOT, "frames/_review/feasibility-candidate-v1.manifest.json"),
  benchmarkCandidate: resolve(VISION_ROOT, "frames/_review/external-benchmark-candidate-v1.manifest.json"),
  pilotManifest: resolve(VISION_ROOT, "manifest.json"),
  pilotAnnotations: resolve(VISION_ROOT, "annotations/pilot-v0.json"),
  pilotCvatExport: resolve(VISION_ROOT, "exports/pilot-v0/cvat-pilot-v0-pass1.zip"),
  output: resolve(VISION_ROOT, "frames/feasibility-v1"),
  reusedAnnotations: resolve(VISION_ROOT, "annotations/feasibility-v1/pilot-reused.json"),
};

const SPLITS = new Map([
  ["session-001", "train"],
  ["session-002", "train"],
  ["session-003", "validation"],
  ["session-004", "test"],
]);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--validate-only") {
      result.validateOnly = true;
      continue;
    }
    if (!token.startsWith("--") || argv[index + 1] === undefined) throw new Error(`invalid argument ${token}`);
    result[token.slice(2)] = argv[index + 1];
    index += 1;
  }
  return result;
}

function frameId(sessionId, timestampMs) {
  return `${sessionId}-t${String(timestampMs).padStart(6, "0")}`;
}

function relativeToVision(path) {
  return path.slice(`${VISION_ROOT}\\`.length).replaceAll("\\", "/");
}

function jpegLooksValid(path) {
  if (!existsSync(path) || statSync(path).size < 4) return false;
  const bytes = readFileSync(path);
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function extractFrame(ffmpeg, videoPath, timestampMs, outputPath) {
  mkdirSync(dirname(outputPath), { recursive: true });
  execFileSync(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-ss", (timestampMs / 1000).toFixed(3),
    "-i", videoPath, "-frames:v", "1", "-q:v", "2", "-y", outputPath,
  ], { stdio: "inherit" });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function schema() {
  return {
    trainingTargets: {
      gooseneck_spout: "axis-aligned rectangle around visible main spout assembly; include outlet; exclude kettle body, hand, and water stream",
      spout_tip: "one point at physical liquid outlet center when spout is visible; retain visibility state",
    },
    qaOnly: {
      dripper: "ellipse around visible outer brewing-opening rim; exclude handle and external protrusions",
    },
    removed: ["spout_neck_base"],
  };
}

export function validateFrozenDatasets({ firstParty, external, reusedAnnotations, visionRoot = VISION_ROOT }) {
  const errors = [];
  const warnings = [];
  const validateUnique = (frames, label) => {
    const ids = new Set();
    const sources = new Set();
    for (const frame of frames) {
      const sourceKey = `${frame.sessionId}:${frame.timestampMs}`;
      if (ids.has(frame.frameId)) errors.push(`${label} duplicate frameId ${frame.frameId}`);
      if (sources.has(sourceKey)) errors.push(`${label} duplicate source ${sourceKey}`);
      ids.add(frame.frameId);
      sources.add(sourceKey);
      const absolute = resolve(visionRoot, frame.path);
      if (!jpegLooksValid(absolute)) errors.push(`${label} missing or corrupt JPEG ${frame.path}`);
    }
    return sources;
  };

  assert(firstParty.datasetVersion === "cupmaster-spout-first-party-v1", "unexpected first-party datasetVersion");
  assert(external.datasetVersion === "cupmaster-spout-external-benchmark-v1", "unexpected external datasetVersion");
  const firstSources = validateUnique(firstParty.frames, "first-party");
  const externalSources = validateUnique(external.frames, "external");
  for (const source of externalSources) if (firstSources.has(source)) errors.push(`cross-dataset overlap ${source}`);

  const sessionSplits = new Map();
  for (const frame of firstParty.frames) {
    const expected = SPLITS.get(frame.sessionId);
    if (!expected || frame.split !== expected) errors.push(`invalid split for ${frame.frameId}`);
    const prior = sessionSplits.get(frame.sessionId);
    if (prior && prior !== frame.split) errors.push(`session split leakage ${frame.sessionId}`);
    sessionSplits.set(frame.sessionId, frame.split);
    if (frame.sourceType !== "first_party" || frame.productionTrainingEligible !== true) {
      errors.push(`invalid first-party eligibility ${frame.frameId}`);
    }
    if (frame.annotationStatus === "reused_pilot") {
      const sourcePath = resolve(visionRoot, frame.provenance?.pixelSource ?? "");
      const frozenPath = resolve(visionRoot, frame.path);
      if (!jpegLooksValid(sourcePath)) errors.push(`reused Pilot source is missing or corrupt ${frame.frameId}`);
      else {
        const sourceHash = sha256(sourcePath);
        if (frame.provenance?.pixelSha256 !== sourceHash || sha256(frozenPath) !== sourceHash) {
          errors.push(`reused Pilot pixel hash mismatch ${frame.frameId}`);
        }
      }
    }
  }
  for (const frame of external.frames) {
    if ("split" in frame) errors.push(`external frame has training split ${frame.frameId}`);
    if (frame.sourceType !== "external_reference" || frame.productionTrainingEligible !== false) {
      errors.push(`invalid external eligibility ${frame.frameId}`);
    }
    if (frame.rightsStatus !== "not_cleared_for_production_training") errors.push(`invalid rights status ${frame.frameId}`);
  }

  const firstById = new Map(firstParty.frames.map((frame) => [frame.frameId, frame]));
  const reused = reusedAnnotations.passes?.[0]?.annotations ?? [];
  const reusedIds = new Set();
  for (const annotation of reused) {
    if (reusedIds.has(annotation.frameId)) errors.push(`duplicate reused annotation ${annotation.frameId}`);
    reusedIds.add(annotation.frameId);
    const frame = firstById.get(annotation.frameId);
    if (!frame || frame.annotationStatus !== "reused_pilot") errors.push(`reused annotation has no exact frozen frame ${annotation.frameId}`);
  }
  const expectedReused = firstParty.frames.filter((frame) => frame.annotationStatus === "reused_pilot");
  if (reused.length !== expectedReused.length) errors.push("reused annotation count does not match frozen manifest");
  if (JSON.stringify(reusedAnnotations).includes("spoutNeckBase") || JSON.stringify(reusedAnnotations).includes("spout_neck_base")) {
    errors.push("stale spout_neck_base entered reused annotations");
  }
  if (JSON.stringify(firstParty.annotationSchema).includes("spout_neck_base") === false) {
    warnings.push("frozen schema should explicitly record spout_neck_base as removed");
  }

  const summarize = (frames) => ({
    total: frames.length,
    positive: frames.filter((frame) => frame.kind === "positive").length,
    negative: frames.filter((frame) => frame.kind === "negative").length,
  });
  return {
    errors,
    warnings,
    summary: {
      firstParty: summarize(firstParty.frames),
      external: summarize(external.frames),
      reusedPilotAnnotations: reused.length,
      firstPartyNewAnnotations: firstParty.frames.filter((frame) => frame.annotationStatus === "required").length,
      sessionSplits: Object.fromEntries(sessionSplits),
    },
  };
}

export function buildFrozenDatasets({ ffmpeg, ...overrides }) {
  assert(ffmpeg && existsSync(ffmpeg), "--ffmpeg must point to ffmpeg.exe");
  const paths = { ...DEFAULTS, ...overrides };
  const candidate = readJson(paths.candidate);
  const benchmarkCandidate = readJson(paths.benchmarkCandidate);
  const pilotManifest = readJson(paths.pilotManifest);
  const pilotAnnotations = readJson(paths.pilotAnnotations);
  const pilotPass = pilotAnnotations.passes.find((pass) => pass.passId === "pilot-pass-1");
  assert(pilotPass, "pilot-pass-1 is missing from normalized Pilot annotations");

  const pilotFrames = new Map(pilotManifest.frames.map((frame) => [frame.frameId, frame]));
  const pilotAnnotationIds = new Set(pilotPass.annotations.map((annotation) => annotation.frameId));
  assert(pilotAnnotationIds.size === 42, `expected 42 authoritative Pilot annotations, got ${pilotAnnotationIds.size}`);
  const sessions = candidate.sessions.filter((session) => SPLITS.has(session.sessionId));
  const firstFrames = [];
  for (const session of sessions) {
    const split = SPLITS.get(session.sessionId);
    for (const [kind, timestamps] of [["positive", session.positiveTimestampsMs], ["negative", session.negativeTimestampsMs]]) {
      for (const timestampMs of timestamps) {
        const id = frameId(session.sessionId, timestampMs);
        const outputPath = resolve(paths.output, "first-party", split, session.sessionId, `${id}.jpg`);
        const pilotFrame = pilotFrames.get(id);
        const reused = pilotAnnotationIds.has(id);
        const pilotPath = pilotFrame ? resolve(VISION_ROOT, pilotFrame.path) : undefined;
        if (reused) {
          assert(pilotFrame, `Pilot annotation ${id} is absent from active Pilot manifest`);
          assert(jpegLooksValid(pilotPath), `Pilot JPEG is missing or corrupt: ${pilotFrame.path}`);
          mkdirSync(dirname(outputPath), { recursive: true });
          copyFileSync(pilotPath, outputPath);
        } else {
          extractFrame(ffmpeg, resolve(VISION_ROOT, session.video.path), timestampMs, outputPath);
        }
        firstFrames.push({
          frameId: id,
          sessionId: session.sessionId,
          timestampMs,
          kind,
          split,
          width: session.video.width,
          height: session.video.height,
          path: relativeToVision(outputPath),
          sourceVideoPath: session.video.path,
          sourceVideoSha256: session.video.sha256,
          sourceType: "first_party",
          productionTrainingEligible: true,
          annotationStatus: reused ? "reused_pilot" : "required",
          provenance: reused
            ? {
                selectionManifest: relativeToVision(paths.candidate),
                pixelSource: pilotFrame.path,
                pixelSha256: sha256(pilotPath),
                annotationSource: relativeToVision(paths.pilotAnnotations),
                cvatSource: relativeToVision(paths.pilotCvatExport),
              }
            : { selectionManifest: relativeToVision(paths.candidate), pixelSource: session.video.path },
        });
      }
    }
  }
  firstFrames.sort((left, right) => left.sessionId.localeCompare(right.sessionId) || left.timestampMs - right.timestampMs);
  assert(firstFrames.length === 88, `expected 88 first-party frames, got ${firstFrames.length}`);

  const externalFrames = [];
  const externalSessionById = new Map(candidate.sessions.map((session) => [session.sessionId, session]));
  for (const selected of benchmarkCandidate.frames) {
    const session = externalSessionById.get(selected.session);
    assert(session?.sourceType === "external_reference", `missing external source session ${selected.session}`);
    const id = frameId(selected.session, selected.timestampMs);
    const outputPath = resolve(paths.output, "external-benchmark", selected.session, `${id}.jpg`);
    extractFrame(ffmpeg, resolve(VISION_ROOT, session.video.path), selected.timestampMs, outputPath);
    externalFrames.push({
      frameId: id,
      sessionId: selected.session,
      timestampMs: selected.timestampMs,
      kind: selected.class,
      width: session.video.width,
      height: session.video.height,
      path: relativeToVision(outputPath),
      sourceVideoPath: session.video.path,
      sourceVideoSha256: session.video.sha256,
      sourceType: "external_reference",
      productionTrainingEligible: false,
      rightsStatus: "not_cleared_for_production_training",
      diversityReason: selected.reason,
      domainTags: selected.domainTags,
      provenance: { selectionManifest: relativeToVision(paths.benchmarkCandidate), pixelSource: session.video.path },
    });
  }
  externalFrames.sort((left, right) => left.sessionId.localeCompare(right.sessionId) || left.timestampMs - right.timestampMs);
  assert(externalFrames.length === 48, `expected 48 external benchmark frames, got ${externalFrames.length}`);

  const firstPartyManifest = {
    schemaVersion: 1,
    datasetVersion: "cupmaster-spout-first-party-v1",
    datasetRole: "training_evaluation",
    annotationSchema: schema(),
    splitPolicy: { unit: "capture_session", train: ["session-001", "session-002"], validation: ["session-003"], test: ["session-004"] },
    frames: firstFrames,
  };
  const externalManifest = {
    schemaVersion: 1,
    datasetVersion: "cupmaster-spout-external-benchmark-v1",
    datasetRole: "unseen_external_generalization_benchmark",
    sourceType: "external_reference",
    productionTrainingEligible: false,
    rightsStatus: "not_cleared_for_production_training",
    annotationSchema: schema(),
    frames: externalFrames,
  };
  const manifestsPath = resolve(paths.output, "manifests");
  writeJson(resolve(manifestsPath, "cupmaster-spout-first-party-v1.json"), firstPartyManifest);
  writeJson(resolve(manifestsPath, "cupmaster-spout-external-benchmark-v1.json"), externalManifest);

  const reusedDocument = {
    schemaVersion: 1,
    datasetVersion: "cupmaster-spout-first-party-v1",
    provenance: {
      sourceDatasetVersion: pilotAnnotations.datasetVersion,
      sourcePassId: pilotPass.passId,
      sourceNormalizedAnnotations: relativeToVision(paths.pilotAnnotations),
      sourceCvatExport: relativeToVision(paths.pilotCvatExport),
      transferRule: "exact frameId plus SHA-256-identical validated Pilot JPEG",
    },
    passes: [{ passId: "pilot-reused", annotations: pilotPass.annotations }],
  };
  writeJson(paths.reusedAnnotations, reusedDocument);

  const firstUpload = resolve(paths.output, "cvat-upload/first-party-new");
  const externalUpload = resolve(paths.output, "cvat-upload/external-benchmark");
  for (const uploadPath of [firstUpload, externalUpload]) {
    if (existsSync(uploadPath)) rmSync(uploadPath, { recursive: true, force: true });
  }
  mkdirSync(firstUpload, { recursive: true });
  mkdirSync(externalUpload, { recursive: true });
  for (const frame of firstFrames.filter((item) => item.annotationStatus === "required")) {
    copyFileSync(resolve(VISION_ROOT, frame.path), resolve(firstUpload, `${frame.frameId}.jpg`));
  }
  for (const frame of externalFrames) copyFileSync(resolve(VISION_ROOT, frame.path), resolve(externalUpload, `${frame.frameId}.jpg`));

  const counts = (frames) => ({ positive: frames.filter((frame) => frame.kind === "positive").length, negative: frames.filter((frame) => frame.kind === "negative").length });
  const perSession = (frames) => [...new Set(frames.map((frame) => frame.sessionId))].map((sessionId) => {
    const selected = frames.filter((frame) => frame.sessionId === sessionId);
    return { sessionId, ...counts(selected), total: selected.length };
  });
  const checklist = {
    schemaVersion: 1,
    firstParty: {
      total: firstFrames.length,
      ...counts(firstFrames),
      alreadyAnnotated: firstFrames.filter((frame) => frame.annotationStatus === "reused_pilot").length,
      newAnnotation: firstFrames.filter((frame) => frame.annotationStatus === "required").length,
      splits: Object.fromEntries(["train", "validation", "test"].map((split) => [split, firstFrames.filter((frame) => frame.split === split).length])),
      sessions: perSession(firstFrames),
      filenamesRequiringAnnotation: firstFrames.filter((frame) => frame.annotationStatus === "required").map((frame) => `${frame.frameId}.jpg`),
    },
    externalBenchmark: { total: externalFrames.length, ...counts(externalFrames), sessions: perSession(externalFrames), evaluationOnly: true },
  };
  writeJson(resolve(paths.output, "annotation-checklist.json"), checklist);
  writeFileSync(resolve(paths.output, "first-party-new-annotation-files.txt"), `${checklist.firstParty.filenamesRequiringAnnotation.join("\n")}\n`);
  writeFileSync(resolve(paths.output, "ANNOTATION-INSTRUCTIONS.md"), `# Feasibility v1 annotation instructions

Keep the two CVAT tasks separate. The first-party package contains only the 46 frames that do not already have validated Pilot annotations. The external package contains all 48 evaluation-only benchmark frames and must never be used for model fitting or tuning.

## Labels

- \`gooseneck_spout\`: rectangle around the visible main spout assembly. Include the physical outlet. Exclude kettle body, hand, and water stream.
- \`spout_tip\`: exactly one point at the physical liquid outlet center for every positive frame. Retain the CVAT visibility/occlusion state.
- \`dripper\`: ellipse around the visible outer brewing-opening rim. Exclude handles and external protrusions. QA/normalization only.
- Do not create \`spout_neck_base\`.

For negative frames, do not add \`gooseneck_spout\` or \`spout_tip\`. Add a \`dripper\` ellipse only when the brewing-opening rim is visible enough to define it.

## Packages

- First-party new annotation: 46 images (36 positive, 10 negative).
- External unseen benchmark: 48 images (39 positive, 9 negative), evaluation-only.
`);

  const validation = validateFrozenDatasets({ firstParty: firstPartyManifest, external: externalManifest, reusedAnnotations: reusedDocument });
  writeJson(resolve(paths.output, "frozen-validation-report.json"), validation);
  if (validation.errors.length > 0) throw new Error(`frozen validation failed:\n${validation.errors.join("\n")}`);
  return { paths, firstPartyManifest, externalManifest, checklist, validation };
}

function validateOnly(output = DEFAULTS.output, reusedAnnotationsPath = DEFAULTS.reusedAnnotations) {
  const firstParty = readJson(resolve(output, "manifests/cupmaster-spout-first-party-v1.json"));
  const external = readJson(resolve(output, "manifests/cupmaster-spout-external-benchmark-v1.json"));
  const reusedAnnotations = readJson(reusedAnnotationsPath);
  const result = validateFrozenDatasets({ firstParty, external, reusedAnnotations });
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length > 0) process.exitCode = 1;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const output = resolve(options.output ?? DEFAULTS.output);
    const reusedAnnotations = resolve(options["reused-annotations"] ?? DEFAULTS.reusedAnnotations);
    if (options.validateOnly) validateOnly(output, reusedAnnotations);
    else {
      const result = buildFrozenDatasets({ ffmpeg: resolve(options.ffmpeg ?? ""), output, reusedAnnotations });
      console.log(JSON.stringify({ validation: result.validation, checklist: result.checklist }, null, 2));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
