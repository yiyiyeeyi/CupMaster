import { describe, expect, it } from "vitest";
import { normalizeViaAnnotations, validateFinalAnnotations } from "./via-normalizer.mjs";

const manifest = {
  frames: [
    { frameId: "session-001-t000001", path: "frames/session-001-t000001.jpg", width: 100, height: 120, split: "train", annotationStatus: "required" },
    { frameId: "session-001-t000002", path: "frames/session-001-t000002.jpg", width: 100, height: 120, split: "train", annotationStatus: "required" },
  ],
};

describe("VIA annotation normalization", () => {
  it("derives positives and intentional negatives from regions", () => {
    const via = {
      a: { filename: "session-001-t000001.jpg", regions: {
        0: { shape_attributes: { name: "circle", cx: 50, cy: 60, r: 30 }, region_attributes: { label: "dripper" } },
        1: { shape_attributes: { name: "point", cx: 40, cy: 30 }, region_attributes: { label: "spout_tip" } },
        2: { shape_attributes: { name: "rect", x: 10, y: 10, width: 40, height: 30 }, region_attributes: { label: "gooseneck_spout" } },
      } },
      b: { filename: "session-001-t000002.jpg", regions: {} },
    };
    const result = normalizeViaAnnotations(via, manifest);
    expect(result.errors).toEqual([]);
    expect(result.summary).toMatchObject({ positive: 1, negative: 1, zeroRegionNegatives: 1, dripperCircles: 1 });
    expect(result.annotations[0].dripper).toMatchObject({ radiusX: 30, radiusY: 30, geometrySource: "via_circle" });
  });

  it("rejects bbox-only annotations", () => {
    const via = {
      a: { filename: "session-001-t000001.jpg", regions: [{ shape_attributes: { name: "rect", x: 1, y: 1, width: 10, height: 10 }, region_attributes: { label: "gooseneck_spout" } }] },
      b: { filename: "session-001-t000002.jpg", regions: {} },
    };
    expect(normalizeViaAnnotations(via, manifest).errors).toContain("VIA/session-001-t000001 is bbox-only or tip-only");
  });

  it("validates a complete final document without using candidate kinds", () => {
    const finalDocument = { passes: [{ annotations: [
      { frameId: "session-001-t000001", dripper: { centerX: 50, centerY: 60, radiusX: 30, radiusY: 30, geometrySource: "via_circle" }, objects: [{ class: "gooseneck_spout", bbox: { xMin: 1, yMin: 1, xMax: 20, yMax: 20 }, spoutTip: { x: 10, y: 10, visibility: "visible" } }] },
      { frameId: "session-001-t000002", dripper: null, objects: [] },
    ] }] };
    const result = validateFinalAnnotations(finalDocument, manifest);
    expect(result.errors.filter((error) => !error.includes("expected 88"))).toEqual([]);
    expect(result.summary).toMatchObject({ positive: 1, negative: 1 });
  });
});
