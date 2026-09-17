import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { resolve, sep } from "node:path";

const SPLITS = new Set(["train", "validation", "test"]);
const VISIBILITIES = new Set(["visible", "partially_occluded", "not_visible"]);
const MATERIALS = new Set([
  "black_matte",
  "stainless_steel",
  "reflective_metal",
  "painted_metal",
  "transparent",
  "semi_transparent",
  "other",
]);
const FILTERS = new Set(["white", "beige", "brown", "none", "other"]);
const COFFEE_BEDS = new Set(["dry", "wet", "none"]);
const LIGHTING = new Set(["normal", "dim", "bright", "indoor", "other"]);
const BACKGROUNDS = new Set(["light", "dark", "mixed", "other"]);
const SELECTION_TAGS = new Set([
  "static",
  "moving",
  "pour_on",
  "pour_off",
  "center",
  "inner_ring",
  "middle_ring",
  "outer_ring",
  "partial_occlusion",
  "reentry",
  "hard_negative",
]);
const MANIFEST_KEYS = new Set(["schemaVersion", "datasetVersion", "sessions", "videos", "frames"]);
const SESSION_KEYS = new Set([
  "sessionId",
  "source",
  "consent",
  "license",
  "attribution",
  "kettleId",
  "kettleMaterial",
  "kettleColor",
  "cameraAngle",
  "scene",
  "filter",
  "coffeeBed",
  "lighting",
  "background",
  "containsPouring",
  "notes",
]);
const VIDEO_KEYS = new Set(["videoId", "sessionId", "path", "sourceSha256", "split", "durationMs"]);
const FRAME_KEYS = new Set(["frameId", "videoId", "path", "timestampMs", "width", "height", "kind", "selectionTags"]);

export function parseTimeToSeconds(value, label) {
  if (value === undefined) return undefined;
  if (/^\d+(\.\d+)?$/.test(value)) return Number(value);
  const parts = value.split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d+(\.\d+)?$/.test(part))) {
    throw new Error(`${label} must be seconds or HH:MM:SS[.sss]`);
  }
  const numbers = parts.map(Number);
  const [hours, minutes, seconds] = numbers.length === 3 ? numbers : [0, numbers[0], numbers[1]];
  if (minutes >= 60 || seconds >= 60) throw new Error(`${label} has an invalid minute or second value`);
  return hours * 3600 + minutes * 60 + seconds;
}

export function buildExtractionPlan({ input, output, fps, start, end, prefix = "frame", overwrite = false }) {
  if (!input || !output) throw new Error("--input and --output are required");
  if (!Number.isFinite(fps) || fps < 0.1 || fps > 10) throw new Error("--fps must be between 0.1 and 10");
  const startSeconds = parseTimeToSeconds(start, "--start");
  const endSeconds = parseTimeToSeconds(end, "--end");
  if (endSeconds !== undefined && endSeconds <= (startSeconds ?? 0)) {
    throw new Error("--end must be greater than --start");
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(prefix)) throw new Error("--prefix may contain only letters, numbers, _ and -");

  const args = [overwrite ? "-y" : "-n"];
  if (startSeconds !== undefined) args.push("-ss", String(startSeconds));
  args.push("-i", resolve(input));
  if (endSeconds !== undefined) args.push("-t", String(endSeconds - (startSeconds ?? 0)));
  args.push("-vf", `fps=${fps}`, "-q:v", "2", resolve(output, `${prefix}-%06d.jpg`));
  return { args, startSeconds: startSeconds ?? 0, endSeconds };
}

export async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value, path, errors) {
  if (typeof value !== "string" || value.trim() === "") errors.push(`${path} must be a non-empty string`);
}

function rejectUnknownKeys(value, allowedKeys, path, errors) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) errors.push(`${path}.${key} is not allowed`);
  }
}

function duplicateIds(items, key, path, errors) {
  const seen = new Set();
  for (const item of items) {
    const id = item?.[key];
    if (typeof id === "string" && seen.has(id)) errors.push(`${path} contains duplicate ${key} ${id}`);
    seen.add(id);
  }
}

function normalizedPath(value) {
  return value.replaceAll("\\", "/").toLowerCase();
}

export function validateManifest(manifest) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(manifest)) return { errors: ["manifest must be an object"], warnings, summary: null };
  rejectUnknownKeys(manifest, MANIFEST_KEYS, "manifest", errors);
  if (manifest.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (typeof manifest.datasetVersion !== "string" || !/^cupmaster-spout-(pilot-)?v\d+$/.test(manifest.datasetVersion)) {
    errors.push("datasetVersion must match cupmaster-spout-pilot-vN or cupmaster-spout-vN");
  }
  const sessions = Array.isArray(manifest.sessions) ? manifest.sessions : [];
  const videos = Array.isArray(manifest.videos) ? manifest.videos : [];
  const frames = Array.isArray(manifest.frames) ? manifest.frames : [];
  if (!Array.isArray(manifest.sessions)) errors.push("sessions must be an array");
  if (!Array.isArray(manifest.videos)) errors.push("videos must be an array");
  if (!Array.isArray(manifest.frames)) errors.push("frames must be an array");
  duplicateIds(sessions, "sessionId", "sessions", errors);
  duplicateIds(videos, "videoId", "videos", errors);
  duplicateIds(frames, "frameId", "frames", errors);

  const sessionById = new Map();
  for (const [index, session] of sessions.entries()) {
    const path = `sessions[${index}]`;
    if (!isPlainObject(session)) {
      errors.push(`${path} must be an object`);
      continue;
    }
    rejectUnknownKeys(session, SESSION_KEYS, path, errors);
    requiredString(session.sessionId, `${path}.sessionId`, errors);
    requiredString(session.kettleId, `${path}.kettleId`, errors);
    requiredString(session.kettleColor, `${path}.kettleColor`, errors);
    if (!new Set(["first_party", "licensed_external"]).has(session.source)) errors.push(`${path}.source is invalid`);
    if (session.consent !== true) errors.push(`${path}.consent must be true`);
    if (!MATERIALS.has(session.kettleMaterial)) errors.push(`${path}.kettleMaterial is invalid`);
    if (!FILTERS.has(session.filter)) errors.push(`${path}.filter is invalid`);
    if (!COFFEE_BEDS.has(session.coffeeBed)) errors.push(`${path}.coffeeBed is invalid`);
    if (!LIGHTING.has(session.lighting)) errors.push(`${path}.lighting is invalid`);
    if (!BACKGROUNDS.has(session.background)) errors.push(`${path}.background is invalid`);
    if (typeof session.containsPouring !== "boolean") errors.push(`${path}.containsPouring must be boolean`);
    if (!Number.isFinite(session.cameraAngle) || session.cameraAngle < 75 || session.cameraAngle > 90) {
      errors.push(`${path}.cameraAngle must be within the v1 range 75–90`);
    }
    if (session.scene !== "top_down") errors.push(`${path}.scene must be top_down`);
    if (session.source === "licensed_external" && typeof session.license !== "string") {
      errors.push(`${path}.license is required for licensed_external data`);
    }
    sessionById.set(session.sessionId, session);
  }

  const videoById = new Map();
  const videoGroups = new Map();
  const sessionSplits = new Map();
  for (const [index, video] of videos.entries()) {
    const path = `videos[${index}]`;
    if (!isPlainObject(video)) {
      errors.push(`${path} must be an object`);
      continue;
    }
    rejectUnknownKeys(video, VIDEO_KEYS, path, errors);
    requiredString(video.videoId, `${path}.videoId`, errors);
    requiredString(video.path, `${path}.path`, errors);
    if (!sessionById.has(video.sessionId)) errors.push(`${path}.sessionId references an unknown session`);
    if (!SPLITS.has(video.split)) errors.push(`${path}.split is invalid`);
    if (typeof video.sourceSha256 !== "string" || !/^[a-f0-9]{64}$/.test(video.sourceSha256)) {
      errors.push(`${path}.sourceSha256 must be a lowercase SHA-256`);
    }
    videoById.set(video.videoId, video);
    const groupKeys = [normalizedPath(video.path ?? ""), video.sourceSha256].filter(Boolean);
    for (const groupKey of groupKeys) {
      const prior = videoGroups.get(groupKey);
      if (prior && prior.split !== video.split) {
        errors.push(`split leakage: videos ${prior.videoId} and ${video.videoId} share source ${groupKey} across splits`);
      } else {
        videoGroups.set(groupKey, video);
      }
    }
    const priorSplit = sessionSplits.get(video.sessionId);
    if (priorSplit && priorSplit !== video.split) {
      errors.push(`split leakage: session ${video.sessionId} appears in ${priorSplit} and ${video.split}`);
    } else {
      sessionSplits.set(video.sessionId, video.split);
    }
  }

  const counts = { positive: 0, negative: 0, train: 0, validation: 0, test: 0 };
  for (const [index, frame] of frames.entries()) {
    const path = `frames[${index}]`;
    if (!isPlainObject(frame)) {
      errors.push(`${path} must be an object`);
      continue;
    }
    rejectUnknownKeys(frame, FRAME_KEYS, path, errors);
    requiredString(frame.frameId, `${path}.frameId`, errors);
    requiredString(frame.path, `${path}.path`, errors);
    const video = videoById.get(frame.videoId);
    if (!video) errors.push(`${path}.videoId references an unknown video`);
    if (!Number.isFinite(frame.timestampMs) || frame.timestampMs < 0) errors.push(`${path}.timestampMs must be non-negative`);
    if (video?.durationMs !== undefined && frame.timestampMs > video.durationMs) errors.push(`${path}.timestampMs exceeds source video duration`);
    if (!Number.isInteger(frame.width) || frame.width <= 0) errors.push(`${path}.width must be a positive integer`);
    if (!Number.isInteger(frame.height) || frame.height <= 0) errors.push(`${path}.height must be a positive integer`);
    if (frame.kind !== "positive" && frame.kind !== "negative") errors.push(`${path}.kind is invalid`);
    if (frame.selectionTags !== undefined) {
      if (!Array.isArray(frame.selectionTags) || frame.selectionTags.some((tag) => !SELECTION_TAGS.has(tag))) {
        errors.push(`${path}.selectionTags contains an invalid value`);
      } else if (new Set(frame.selectionTags).size !== frame.selectionTags.length) {
        errors.push(`${path}.selectionTags must be unique`);
      }
    }
    if (frame.kind === "positive") counts.positive += 1;
    if (frame.kind === "negative") counts.negative += 1;
    if (video && SPLITS.has(video.split)) counts[video.split] += 1;
  }
  if (new Set(sessionById.values()).size < 2) warnings.push("pilot has fewer than two capture sessions; validation/test isolation is not yet possible");
  if (frames.length > 0) {
    const positiveRatio = counts.positive / frames.length;
    if (positiveRatio < 0.6 || positiveRatio > 0.85) warnings.push("positive ratio is outside the pilot guidance range 60–85%");
  }
  return {
    errors,
    warnings,
    summary: { sessions: sessions.length, videos: videos.length, frames: frames.length, ...counts },
  };
}

function pointDistance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function bboxIou(left, right) {
  const width = Math.max(0, Math.min(left.xMax, right.xMax) - Math.max(left.xMin, right.xMin));
  const height = Math.max(0, Math.min(left.yMax, right.yMax) - Math.max(left.yMin, right.yMin));
  const intersection = width * height;
  const leftArea = (left.xMax - left.xMin) * (left.yMax - left.yMin);
  const rightArea = (right.xMax - right.xMin) * (right.yMax - right.yMin);
  const union = leftArea + rightArea - intersection;
  return union > 0 ? intersection / union : 0;
}

function validatePoint(point, path, frame, errors) {
  if (!isPlainObject(point) || !VISIBILITIES.has(point.visibility)) {
    errors.push(`${path} must contain a valid visibility`);
    return;
  }
  if (point.visibility === "not_visible") return;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) errors.push(`${path} visible coordinates must be finite`);
  if (point.x < 0 || point.x > frame.width || point.y < 0 || point.y > frame.height) errors.push(`${path} is outside the frame`);
}

export function validateAnnotations(manifest, annotationDocument) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(annotationDocument) || !Array.isArray(annotationDocument.passes)) {
    return { errors: ["annotations must contain a passes array"], warnings, metrics: null };
  }
  if (annotationDocument.schemaVersion !== 1) errors.push("annotation schemaVersion must be 1");
  if (annotationDocument.datasetVersion !== manifest.datasetVersion) errors.push("annotation datasetVersion must match manifest");
  const frameById = new Map(manifest.frames.map((frame) => [frame.frameId, frame]));
  const observationsByFrame = new Map();

  for (const [passIndex, pass] of annotationDocument.passes.entries()) {
    const passPath = `passes[${passIndex}]`;
    requiredString(pass?.passId, `${passPath}.passId`, errors);
    if (!Array.isArray(pass?.annotations)) {
      errors.push(`${passPath}.annotations must be an array`);
      continue;
    }
    const seenFrames = new Set();
    for (const [annotationIndex, annotation] of pass.annotations.entries()) {
      const path = `${passPath}.annotations[${annotationIndex}]`;
      const frame = frameById.get(annotation?.frameId);
      if (!frame) {
        errors.push(`${path}.frameId references an unknown frame`);
        continue;
      }
      if (seenFrames.has(annotation.frameId)) errors.push(`${passPath} annotates frame ${annotation.frameId} more than once`);
      seenFrames.add(annotation.frameId);
      if (!isPlainObject(annotation.dripper) || !Number.isFinite(annotation.dripper.radius) || annotation.dripper.radius <= 0) {
        errors.push(`${path}.dripper must include a positive radius`);
      }
      if (!Array.isArray(annotation.objects)) {
        errors.push(`${path}.objects must be an array`);
        continue;
      }
      if (frame.kind === "negative" && annotation.objects.length > 0) errors.push(`${path} is a negative frame and must not contain objects`);
      if (frame.kind === "positive" && annotation.objects.length === 0) warnings.push(`${path} is positive but has no visible-spout object`);
      for (const [objectIndex, object] of annotation.objects.entries()) {
        const objectPath = `${path}.objects[${objectIndex}]`;
        if (object?.class !== "gooseneck_spout") errors.push(`${objectPath}.class must be gooseneck_spout`);
        const bbox = object?.bbox;
        if (!isPlainObject(bbox) || ![bbox.xMin, bbox.yMin, bbox.xMax, bbox.yMax].every(Number.isFinite)) {
          errors.push(`${objectPath}.bbox must contain finite coordinates`);
          continue;
        }
        if (bbox.xMin < 0 || bbox.yMin < 0 || bbox.xMax > frame.width || bbox.yMax > frame.height || bbox.xMin >= bbox.xMax || bbox.yMin >= bbox.yMax) {
          errors.push(`${objectPath}.bbox is invalid or outside the frame`);
        }
        validatePoint(object.spoutTip, `${objectPath}.spoutTip`, frame, errors);
        if (object.spoutNeckBase !== undefined) validatePoint(object.spoutNeckBase, `${objectPath}.spoutNeckBase`, frame, errors);
        if (object.spoutTip?.visibility !== "not_visible") {
          const tip = object.spoutTip;
          if (tip.x < bbox.xMin || tip.x > bbox.xMax || tip.y < bbox.yMin || tip.y > bbox.yMax) {
            errors.push(`${objectPath}.spoutTip must be inside the bbox`);
          }
        }
      }
      const observations = observationsByFrame.get(annotation.frameId) ?? [];
      observations.push({ passId: pass.passId, annotation });
      observationsByFrame.set(annotation.frameId, observations);
    }
  }

  const tipDistances = [];
  const normalizedTipDistances = [];
  const bboxIous = [];
  const neckDistances = [];
  const normalizedNeckDistances = [];
  const dripperCenterDistances = [];
  const dripperRadiusDifferences = [];
  const relativeDripperRadiusDifferences = [];
  let doubleAnnotatedFrames = 0;
  let positiveObservations = 0;
  let missingTipObservations = 0;
  let missingNeckBaseObservations = 0;
  let negativeFalseAnnotationCount = 0;
  const tipVisibility = { visible: 0, partiallyOccluded: 0, notVisible: 0, missing: 0 };
  for (const [frameId, observations] of observationsByFrame) {
    const frame = frameById.get(frameId);
    for (const observation of observations) {
      if (frame?.kind === "negative" && observation.annotation.objects.length > 0) negativeFalseAnnotationCount += 1;
      if (frame?.kind !== "positive") continue;
      positiveObservations += 1;
      const tip = observation.annotation.objects[0]?.spoutTip;
      if (!tip) {
        missingTipObservations += 1;
        tipVisibility.missing += 1;
      } else if (tip.visibility === "not_visible") {
        missingTipObservations += 1;
        tipVisibility.notVisible += 1;
      } else if (tip.visibility === "partially_occluded") tipVisibility.partiallyOccluded += 1;
      else tipVisibility.visible += 1;
      const neck = observation.annotation.objects[0]?.spoutNeckBase;
      if (!neck || neck.visibility === "not_visible") missingNeckBaseObservations += 1;
    }
    if (observations.length < 2) continue;
    doubleAnnotatedFrames += 1;
    const left = observations[0].annotation;
    const right = observations[1].annotation;
    const leftObject = left.objects[0];
    const rightObject = right.objects[0];
    const meanDripperRadius = (left.dripper.radius + right.dripper.radius) / 2;
    dripperCenterDistances.push(Math.hypot(left.dripper.centerX - right.dripper.centerX, left.dripper.centerY - right.dripper.centerY));
    const dripperRadiusDifference = Math.abs(left.dripper.radius - right.dripper.radius);
    dripperRadiusDifferences.push(dripperRadiusDifference);
    relativeDripperRadiusDifferences.push(dripperRadiusDifference / meanDripperRadius);
    if (!leftObject || !rightObject) continue;
    if (leftObject.spoutTip?.visibility !== "not_visible" && rightObject.spoutTip?.visibility !== "not_visible") {
      const distance = pointDistance(leftObject.spoutTip, rightObject.spoutTip);
      tipDistances.push(distance);
      normalizedTipDistances.push(distance / meanDripperRadius);
    }
    bboxIous.push(bboxIou(leftObject.bbox, rightObject.bbox));
    if (
      leftObject.spoutNeckBase
      && rightObject.spoutNeckBase
      && leftObject.spoutNeckBase.visibility !== "not_visible"
      && rightObject.spoutNeckBase.visibility !== "not_visible"
    ) {
      const distance = pointDistance(leftObject.spoutNeckBase, rightObject.spoutNeckBase);
      neckDistances.push(distance);
      normalizedNeckDistances.push(distance / meanDripperRadius);
    }
  }
  const mean = (values) => (values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length);
  const median = (values) => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((left, right) => left - right);
    const midpoint = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[midpoint - 1] + sorted[midpoint]) / 2 : sorted[midpoint];
  };
  const maximum = (values) => (values.length === 0 ? null : Math.max(...values));
  const minimum = (values) => (values.length === 0 ? null : Math.min(...values));
  const metrics = {
    annotatedFrames: observationsByFrame.size,
    doubleAnnotatedFrames,
    comparableTipPairs: tipDistances.length,
    meanTipDisagreementPx: mean(tipDistances),
    medianTipDisagreementPx: median(tipDistances),
    maxTipDisagreementPx: maximum(tipDistances),
    meanNormalizedTipDisagreement: mean(normalizedTipDistances),
    medianNormalizedTipDisagreement: median(normalizedTipDistances),
    maxNormalizedTipDisagreement: maximum(normalizedTipDistances),
    meanBboxIou: mean(bboxIous),
    medianBboxIou: median(bboxIous),
    minBboxIou: minimum(bboxIous),
    positiveObservations,
    missingTipObservations,
    missingTipRate: positiveObservations === 0 ? null : missingTipObservations / positiveObservations,
    tipVisibility,
    neckBaseComparablePairs: neckDistances.length,
    meanNeckBaseDisagreementPx: mean(neckDistances),
    medianNeckBaseDisagreementPx: median(neckDistances),
    maxNeckBaseDisagreementPx: maximum(neckDistances),
    meanNormalizedNeckBaseDisagreement: mean(normalizedNeckDistances),
    medianNormalizedNeckBaseDisagreement: median(normalizedNeckDistances),
    maxNormalizedNeckBaseDisagreement: maximum(normalizedNeckDistances),
    missingNeckBaseObservations,
    missingNeckBaseRate: positiveObservations === 0 ? null : missingNeckBaseObservations / positiveObservations,
    negativeFalseAnnotationCount,
    dripperComparablePairs: dripperCenterDistances.length,
    meanDripperCenterDisagreementPx: mean(dripperCenterDistances),
    medianDripperCenterDisagreementPx: median(dripperCenterDistances),
    maxDripperCenterDisagreementPx: maximum(dripperCenterDistances),
    meanDripperRadiusDisagreementPx: mean(dripperRadiusDifferences),
    medianDripperRadiusDisagreementPx: median(dripperRadiusDifferences),
    maxDripperRadiusDisagreementPx: maximum(dripperRadiusDifferences),
    meanRelativeDripperRadiusDisagreement: mean(relativeDripperRadiusDifferences),
    medianRelativeDripperRadiusDisagreement: median(relativeDripperRadiusDifferences),
    maxRelativeDripperRadiusDisagreement: maximum(relativeDripperRadiusDifferences),
  };
  if (doubleAnnotatedFrames < Math.min(10, manifest.frames.length)) warnings.push("fewer than the required 10 pilot frames are double-annotated");
  return { errors, warnings, metrics };
}

export function assertPathWithin(parent, child) {
  const root = `${resolve(parent)}${sep}`.toLowerCase();
  const target = `${resolve(child)}${sep}`.toLowerCase();
  if (!target.startsWith(root)) throw new Error(`output must stay within ${resolve(parent)}`);
}
