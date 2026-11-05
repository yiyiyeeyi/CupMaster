import { describe, expect, it } from "vitest";
import { methodGuide, pourRuns, sampleMethod, sampleTrace } from "./pour-path-geometry";

const trace = [{ t: 0, x: 0, y: 0 }, { t: 0.2, x: 0.5, y: -0.5 }, { t: 0.4, x: 0.5, y: 0.5 }, { t: 1, x: -0.4, y: 0 }, { t: 1.1, x: -0.5, y: 0 }];

describe("pour path geometry", () => {
  it("interpolates between traced points", () => {
    expect(sampleTrace(trace, 0.1)).toEqual({ x: 0.25, y: -0.25 });
    expect(sampleTrace(trace, 0.4)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("shows no pour point before the trace, across a lifted-kettle gap, or after it ends", () => {
    expect(sampleTrace(trace, -0.1)).toBeNull();
    expect(sampleTrace(trace, 0.7)).toBeNull();
    expect(sampleTrace(trace, 1.12)).toEqual({ x: -0.5, y: 0 });
    expect(sampleTrace(trace, 2)).toBeNull();
    expect(sampleTrace([], 1)).toBeNull();
  });

  it("splits the guide at gaps and clamps points far outside the filter", () => {
    expect(pourRuns(trace).map((run) => run.length)).toEqual([3, 2]);
    expect(sampleTrace([{ t: 0, x: 3, y: -3 }], 0)).toEqual({ x: 1.05, y: -1.05 });
  });

  it("keeps illustrative paths inside the pouring area", () => {
    for (const method of ["circle", "coin", "outward", "inward"] as const) {
      for (const point of methodGuide(method)) expect(Math.hypot(point.x, point.y)).toBeLessThanOrEqual(0.76);
    }
    expect(sampleMethod("drain", 3)).toBeNull();
    expect(methodGuide("center")).toEqual([]);
  });
});
