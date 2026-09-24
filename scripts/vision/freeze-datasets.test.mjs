import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateFrozenDatasets } from "./freeze-datasets.mjs";

function jpeg(path) {
  mkdirSync(join(path, "frames"), { recursive: true });
  writeFileSync(join(path, "frames/frame.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
}

describe("validateFrozenDatasets", () => {
  it("accepts isolated first-party and non-training external frames", () => {
    const root = mkdtempSync(join(tmpdir(), "cupmaster-freeze-"));
    jpeg(root);
    const firstParty = {
      datasetVersion: "cupmaster-spout-first-party-v1",
      annotationSchema: { removed: ["spout_neck_base"] },
      frames: [{ frameId: "session-001-t000001", sessionId: "session-001", timestampMs: 1, path: "frames/frame.jpg", kind: "positive", split: "train", sourceType: "first_party", productionTrainingEligible: true, annotationStatus: "reused_pilot", provenance: { pixelSource: "frames/frame.jpg", pixelSha256: "32461d5bd1773012acef0ba15636752949bd7c2ce50f9172159d9f56cf0dd9af" } }],
    };
    const external = {
      datasetVersion: "cupmaster-spout-external-benchmark-v1",
      frames: [{ frameId: "session-005-t000001", sessionId: "session-005", timestampMs: 1, path: "frames/frame.jpg", kind: "positive", sourceType: "external_reference", productionTrainingEligible: false, rightsStatus: "not_cleared_for_production_training" }],
    };
    const reusedAnnotations = { passes: [{ annotations: [{ frameId: "session-001-t000001", objects: [] }] }] };
    expect(validateFrozenDatasets({ firstParty, external, reusedAnnotations, visionRoot: root }).errors).toEqual([]);
  });

  it("rejects an external training split and stale neck-base annotation", () => {
    const root = mkdtempSync(join(tmpdir(), "cupmaster-freeze-"));
    jpeg(root);
    const firstParty = { datasetVersion: "cupmaster-spout-first-party-v1", annotationSchema: { removed: ["spout_neck_base"] }, frames: [] };
    const external = {
      datasetVersion: "cupmaster-spout-external-benchmark-v1",
      frames: [{ frameId: "session-005-t000001", sessionId: "session-005", timestampMs: 1, path: "frames/frame.jpg", kind: "positive", split: "test", sourceType: "external_reference", productionTrainingEligible: false, rightsStatus: "not_cleared_for_production_training" }],
    };
    const reusedAnnotations = { passes: [{ annotations: [{ frameId: "missing", spoutNeckBase: { x: 1, y: 1 } }] }] };
    const result = validateFrozenDatasets({ firstParty, external, reusedAnnotations, visionRoot: root });
    expect(result.errors).toContain("external frame has training split session-005-t000001");
    expect(result.errors).toContain("stale spout_neck_base entered reused annotations");
  });
});
