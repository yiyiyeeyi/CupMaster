import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTargetedVia } from "./task9c5-11-normalize-targeted.mjs";

const frame = {
  id: "session-015-t001000",
  filename: "session-015-t001000.jpg",
  session: "session-015",
  timestampMs: 1000,
  width: 100,
  height: 80,
  waterOn: "yes",
  appearanceHints: ["reflective"],
  distractorHints: [],
  matchGroup: "a",
};

function region(name, shape, label) {
  return { shape_attributes: { name, ...shape }, region_attributes: label === null ? {} : { label } };
}

test("uses the manifest as inclusion authority and ignores unrelated VIA records", () => {
  const via = {
    old: { filename: "session-001-t000000.jpg", regions: {} },
    target: {
      filename: frame.filename,
      regions: {
        0: region("point", { cx: 20, cy: 15 }, "spout_tip"),
        1: region("rect", { x: 5, y: 5, width: 30, height: 20 }, "gooseneck_spout"),
        2: region("ellipse", { cx: 50, cy: 40, rx: 30, ry: 20 }, "dripper"),
      },
    },
  };
  const result = normalizeTargetedVia(via, { frames: [frame] });
  assert.deepEqual(result.errors, []);
  assert.equal(result.summary.targetRecords, 1);
  assert.equal(result.summary.unrelatedRecordsIgnored, 1);
  assert.equal(result.summary.positive, 1);
});

test("normalizes one unambiguous blank ellipse as dripper on a negative", () => {
  const via = {
    target: {
      filename: frame.filename,
      regions: { 0: region("ellipse", { cx: 50, cy: 40, rx: 30, ry: 20 }, null) },
    },
  };
  const result = normalizeTargetedVia(via, { frames: [frame] });
  assert.deepEqual(result.errors, []);
  assert.equal(result.summary.blankEllipseFallbacks, 1);
  assert.equal(result.summary.negative, 1);
  assert.equal(result.annotations[0].dripper.geometrySource, "via_ellipse");
});

test("rejects bbox-only annotations and invalid coordinates", () => {
  const via = {
    target: {
      filename: frame.filename,
      regions: { 0: region("rect", { x: 90, y: 5, width: 30, height: 20 }, "gooseneck_spout") },
    },
  };
  const result = normalizeTargetedVia(via, { frames: [frame] });
  assert.equal(result.summary.bboxOnly, 1);
  assert.equal(result.summary.invalidShapes, 1);
  assert.match(result.errors.join("\n"), /bbox-only/);
});
