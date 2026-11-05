import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { recipeFixtures } from "@/data/fixtures/recipes";
import { createPourPathPlaybackProps, pourPathSchema, recipeSchema } from "@/domain";

describe("pour path", () => {
  it("keeps shape-only coordinates and requires nonnegative segment time", () => {
    const path = { version: 1, points: [{ t: 0, x: -1.4, y: 1.2 }, { t: 0.1, x: 0, y: 0 }] };
    expect(pourPathSchema.parse(path)).toEqual(path);
    expect(pourPathSchema.safeParse({ ...path, points: [{ t: -0.1, x: 0, y: 0 }] }).success).toBe(false);
    expect(pourPathSchema.safeParse({ ...path, points: [{ t: 0, x: Number.NaN, y: 0 }] }).success).toBe(false);
  });

  it("keeps old recipes valid and accepts optional pour paths", () => {
    const recipe = structuredClone(recipeFixtures[0]);
    expect(recipeSchema.safeParse(recipe).success).toBe(true);
    recipe.currentVersion.steps[0].pourPath = { version: 1, points: [{ t: 0, x: 0, y: 0 }] };
    expect(recipeSchema.safeParse(recipe).success).toBe(true);
  });

  it("exposes the five traced paths through the selectable 4:6 teaching recipe", () => {
    const recipe = recipeFixtures.find(({ id }) => id === "four-six-method");
    expect(recipe?.currentVersion.steps.map(({ targetWaterGrams }) => targetWaterGrams)).toEqual([50, 120, 180, 240, 300]);
    expect(recipe?.currentVersion.steps.every(({ pourPath }) => Boolean(pourPath?.points.length))).toBe(true);
    expect(recipe?.currentVersion.steps.map(({ pourPath }) => pourPath?.points.length)).toEqual([81, 41, 41, 41, 41]);
  });

  it("uses the path when present and falls back to legacy method with clamped elapsed time", () => {
    const path = { version: 1 as const, points: [{ t: 0, x: 0, y: 0 }] };
    expect(createPourPathPlaybackProps({ pourMethod: "outward", pourPath: path }, 3.5)).toEqual({ method: "outward", pourPath: path, elapsedSeconds: 3.5 });
    expect(createPourPathPlaybackProps({ pattern: "spiral" }, -1)).toEqual({ method: "circle", elapsedSeconds: 0 });
    expect(createPourPathPlaybackProps(undefined, Number.NaN)).toEqual({ elapsedSeconds: 0 });
  });

  it("keeps the educational 4:6 trace sample within the RecipeStep path contract", () => {
    const sample = z.object({ steps: z.array(z.object({ pourPath: pourPathSchema })).length(5) }).parse(
      JSON.parse(readFileSync(new URL("../../tools/pour-trace/samples/4-6-method.json", import.meta.url), "utf8")),
    );
    expect(sample.steps.map(({ pourPath }) => pourPath.points.length)).toEqual([81, 41, 41, 41, 41]);
    for (const { pourPath } of sample.steps) {
      expect(pourPath.points[0].t).toBe(0);
      expect(pourPath.points.at(-1)?.t).toBeGreaterThan(0);
      expect(pourPath.points.every((point, index, points) => index === 0 || Number((point.t - points[index - 1].t).toFixed(1)) === 0.1)).toBe(true);
    }
  });
});
