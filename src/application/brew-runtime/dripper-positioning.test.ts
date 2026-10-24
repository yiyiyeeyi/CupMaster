import { describe, expect, it } from "vitest";
import { DripperPositioningTracker } from "./dripper-positioning";

function tracker() {
  return new DripperPositioningTracker({
    stableDurationMs: 300,
    minimumStableSamples: 3,
    unstableSamplesToReset: 3,
  });
}

describe("DripperPositioningTracker", () => {
  it("requires confirmation plus a stable multi-frame period before READY", () => {
    const positioning = tracker();
    positioning.observe(0, 0);
    expect(positioning.getSnapshot().state).toBe("POSITIONING");
    positioning.confirmPlacement();
    expect(positioning.observe(0, 0.03).state).toBe("ALIGNED");
    expect(positioning.observe(150, 0.04).state).toBe("ALIGNED");
    expect(positioning.observe(300, 0.02)).toMatchObject({ state: "READY", stableSamples: 3 });
  });

  it("does not flicker into READY during unstable positioning", () => {
    const positioning = tracker();
    positioning.confirmPlacement();
    const samples = [
      [0, 0.03], [120, 0.2], [240, 0.04], [360, 0.22], [480, 0.03], [600, 0.19],
    ] as const;
    expect(samples.map(([timestampMs, motion]) => positioning.observe(timestampMs, motion).state)).not.toContain("READY");
  });

  it("uses hysteresis so one unstable frame does not remove READY", () => {
    const positioning = tracker();
    positioning.confirmPlacement();
    positioning.observe(0, 0.02);
    positioning.observe(150, 0.02);
    positioning.observe(300, 0.02);
    expect(positioning.observe(400, 0.2).state).toBe("READY");
    expect(positioning.observe(500, 0.2).state).toBe("READY");
    expect(positioning.observe(600, 0.2).state).toBe("POSITIONING");
  });
});
