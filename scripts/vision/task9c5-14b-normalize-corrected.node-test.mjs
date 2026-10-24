import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTargetedVia } from "./task9c5-11-normalize-targeted.mjs";

const corrected = [
  ["session-016-t002000.jpg", 100, 80, "yes"],
  ["session-019-t000000.jpg", 100, 80, "no"],
  ["session-019-t000500.jpg", 100, 80, "no"],
];

function record(filename) {
  return {
    filename,
    regions: {
      0: { shape_attributes: { name: "ellipse", cx: 50, cy: 40, rx: 30, ry: 20 }, region_attributes: { label: "dripper" } },
      1: { shape_attributes: { name: "point", cx: 40, cy: 15 }, region_attributes: { label: "spout_tip" } },
      2: { shape_attributes: { name: "rect", x: 20, y: 5, width: 40, height: 25 }, region_attributes: { label: "gooseneck_spout" } },
    },
  };
}

test("corrected water-off outlet records remain positive independently of water state", () => {
  const frames = corrected.map(([filename, width, height, waterOn]) => ({
    id: filename.replace(".jpg", ""), filename, session: filename.slice(0, 11),
    timestampMs: 0, width, height, waterOn, appearanceHints: [], distractorHints: [], matchGroup: "test",
  }));
  const via = Object.fromEntries(frames.map((frame) => [frame.id, record(frame.filename)]));
  const result = normalizeTargetedVia(via, { frames });
  assert.deepEqual(result.errors, []);
  assert.equal(result.summary.positive, 3);
  assert.equal(result.summary.waterOnPositivesFromSelectionHints, 1);
  assert.equal(result.summary.waterOffPositivesFromSelectionHints, 2);
});
