import { describe, expect, it } from "vitest";
import { buildExtractionPlan, validateAnnotations, validateManifest } from "./dataset-tools.mjs";

function session(overrides = {}) {
  return {
    sessionId: "capture-001",
    source: "first_party",
    consent: true,
    license: "CupMaster first-party capture",
    kettleId: "kettle-01",
    kettleMaterial: "black_matte",
    kettleColor: "black",
    cameraAngle: 90,
    scene: "top_down",
    filter: "white",
    coffeeBed: "dry",
    lighting: "normal",
    background: "light",
    containsPouring: true,
    ...overrides,
  };
}

function manifest() {
  return {
    schemaVersion: 1,
    datasetVersion: "cupmaster-spout-pilot-v0",
    sessions: [session(), session({ sessionId: "capture-002" })],
    videos: [
      { videoId: "video-a", sessionId: "capture-001", path: "raw/a.mp4", sourceSha256: "a".repeat(64), split: "train" },
      { videoId: "video-b", sessionId: "capture-002", path: "raw/b.mp4", sourceSha256: "b".repeat(64), split: "validation" },
    ],
    frames: [
      { frameId: "frame-a", videoId: "video-a", path: "frames/a.jpg", timestampMs: 1000, width: 1920, height: 1080, kind: "positive" },
      { frameId: "frame-b", videoId: "video-b", path: "frames/b.jpg", timestampMs: 1000, width: 1920, height: 1080, kind: "negative" },
    ],
  };
}

describe("vision frame extraction plan", () => {
  it("builds a bounded ffmpeg sample instead of extracting every frame", () => {
    const plan = buildExtractionPlan({ input: "input.mp4", output: "frames", fps: 3, start: "00:05", end: "00:12", prefix: "sample" });
    expect(plan.startSeconds).toBe(5);
    expect(plan.endSeconds).toBe(12);
    expect(plan.args).toContain("fps=3");
    expect(plan.args).toContain("7");
    expect(plan.args.at(-1)).toMatch(/sample-%06d\.jpg$/);
    expect(plan.args[0]).toBe("-n");
  });

  it("rejects invalid rates and time windows", () => {
    expect(() => buildExtractionPlan({ input: "in", output: "out", fps: 30 })).toThrow("--fps");
    expect(() => buildExtractionPlan({ input: "in", output: "out", fps: 3, start: "10", end: "5" })).toThrow("--end");
  });
});

describe("vision dataset manifest validation", () => {
  it("accepts session-isolated splits", () => {
    expect(validateManifest(manifest())).toMatchObject({ errors: [], summary: { sessions: 2, videos: 2, frames: 2 } });
  });

  it("rejects a source video hash crossing splits", () => {
    const candidate = manifest();
    candidate.videos[1].sourceSha256 = candidate.videos[0].sourceSha256;
    expect(validateManifest(candidate).errors.some((error) => error.includes("split leakage"))).toBe(true);
  });

  it("rejects a capture session crossing splits", () => {
    const candidate = manifest();
    candidate.videos[1].sessionId = "capture-001";
    expect(validateManifest(candidate).errors.some((error) => error.includes("session capture-001"))).toBe(true);
  });

  it("rejects privacy and device fields outside the manifest schema", () => {
    const candidate = manifest();
    candidate.sessions[0].email = "not-allowed@example.test";
    candidate.sessions[0].deviceIdentifier = "not-allowed";
    const errors = validateManifest(candidate).errors;
    expect(errors.some((error) => error.includes(".email is not allowed"))).toBe(true);
    expect(errors.some((error) => error.includes(".deviceIdentifier is not allowed"))).toBe(true);
  });
});

describe("vision annotation QA", () => {
  it("computes pixel, normalized, bbox, missing, and neck-base metrics", () => {
    const candidate = manifest();
    candidate.frames = [candidate.frames[0]];
    candidate.videos = [candidate.videos[0]];
    candidate.sessions = [candidate.sessions[0]];
    const makeAnnotation = (tipX, bboxX, neckX) => ({
      frameId: "frame-a",
      dripper: { centerX: 900, centerY: 500, radius: 100 },
      objects: [{
        class: "gooseneck_spout",
        bbox: { xMin: bboxX, yMin: 100, xMax: 400, yMax: 300 },
        spoutTip: { x: tipX, y: 200, visibility: "visible" },
        spoutNeckBase: { x: neckX, y: 150, visibility: "visible" },
      }],
    });
    const result = validateAnnotations(candidate, {
      schemaVersion: 1,
      datasetVersion: candidate.datasetVersion,
      passes: [
        { passId: "pass-1", annotations: [makeAnnotation(300, 100, 150)] },
        { passId: "pass-2", annotations: [makeAnnotation(310, 110, 155)] },
      ],
    });
    expect(result.errors).toEqual([]);
    expect(result.metrics).toMatchObject({
      doubleAnnotatedFrames: 1,
      meanTipDisagreementPx: 10,
      meanNormalizedTipDisagreement: 0.1,
      missingTipRate: 0,
      meanNeckBaseDisagreementPx: 5,
    });
    expect(result.metrics.meanBboxIou).toBeGreaterThan(0.9);
  });

  it("rejects objects on negative frames", () => {
    const candidate = manifest();
    const result = validateAnnotations(candidate, {
      schemaVersion: 1,
      datasetVersion: candidate.datasetVersion,
      passes: [{
        passId: "pass-1",
        annotations: [{
          frameId: "frame-b",
          dripper: { centerX: 900, centerY: 500, radius: 100 },
          objects: [{
            class: "gooseneck_spout",
            bbox: { xMin: 100, yMin: 100, xMax: 400, yMax: 300 },
            spoutTip: { x: 300, y: 200, visibility: "visible" },
          }],
        }],
      }],
    });
    expect(result.errors.some((error) => error.includes("negative frame"))).toBe(true);
  });
});
