import assert from "node:assert/strict";
import test from "node:test";
import { normalizeResearchVia } from "./task9c5-3-normalize-research.mjs";

function frame(frameId = "session-011-t001000") {
  return {
    frameId, sessionId: frameId.slice(0, 11), timestampMs: 1000,
    filename: `${frameId}.jpg`, width: 100, height: 200,
    researchTrainingEligible: true, productionTrainingEligible: false,
  };
}

function region(label, shape) {
  return { shape_attributes: shape, region_attributes: { label } };
}

test("normalizes ellipse, rectangle, and point", () => {
  const f = frame();
  const via = { record: { filename: f.filename, regions: {
    0: region("dripper", { name: "ellipse", cx: 50, cy: 100, rx: 20, ry: 30 }),
    1: region("gooseneck_spout", { name: "rect", x: 10, y: 20, width: 30, height: 40 }),
    2: region("spout_tip", { name: "point", cx: 20, cy: 30 }),
  } } };
  const result = normalizeResearchVia(via, { frames: [f] });
  assert.deepEqual(result.errors, []);
  assert.equal(result.annotations[0].dripper.geometrySource, "via_ellipse");
  assert.equal(result.annotations[0].dripper.effectiveRadius, Math.sqrt(600));
  assert.equal(result.summary.sessions["session-011"].positive, 1);
});

test("preserves dripper-only and zero-region negatives", () => {
  const a = frame("session-011-t001000");
  const b = { ...frame("session-012-t002000"), timestampMs: 2000 };
  const via = {
    a: { filename: a.filename, regions: [region("dripper", { name: "circle", cx: 50, cy: 100, r: 20 })] },
    b: { filename: b.filename, regions: [] },
  };
  const result = normalizeResearchVia(via, { frames: [a, b] });
  assert.deepEqual(result.errors, []);
  assert.equal(result.annotations.every((item) => item.objects.length === 0), true);
});

test("rejects unsupported labels and partial positives", () => {
  const f = frame();
  const via = { record: { filename: f.filename, regions: [
    region("unknown", { name: "polygon", all_points_x: [1, 2], all_points_y: [1, 2] }),
    region("spout_tip", { name: "point", cx: 20, cy: 30 }),
  ] } };
  const result = normalizeResearchVia(via, { frames: [f] });
  assert.match(result.errors.join("\n"), /unsupported label/);
  assert.match(result.errors.join("\n"), /bbox-only or tip-only/);
  assert.equal(result.annotations, null);
});

test("audits deterministic shape-role label repairs", () => {
  const f = frame("session-013-t075000");
  const via = { record: { filename: f.filename, regions: [
    region("gooseneck_spout", { name: "point", cx: 20, cy: 30 }),
    region("gooseneck_spout", { name: "rect", x: 10, y: 20, width: 30, height: 40 }),
  ] } };
  const result = normalizeResearchVia(via, { frames: [f] });
  assert.deepEqual(result.errors, []);
  assert.equal(result.repairs.length, 1);
  assert.equal(result.repairs[0].normalizedLabel, "spout_tip");
});
