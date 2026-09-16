import { describe, expect, it } from "vitest";
import {
  DEFAULT_POUR_DETECTION_THRESHOLDS,
  type BrewRecipeRuntimeDefinition,
  type BrewSessionRuntime,
  type NormalizedRect,
  type Point2D,
} from "./index";

function recipeWithStages(count: number): BrewRecipeRuntimeDefinition {
  return {
    recipeId: `recipe-${count}`,
    recipeName: `${count}-stage recipe`,
    completeAfterLastPourStops: true,
    stages: Array.from({ length: count }, (_, order) => ({
      id: `stage-${order}`,
      order,
      name: `Stage ${order + 1}`,
      autoAdvanceEnabled: order < count - 1,
    })),
  };
}

describe("Brew Runtime domain model", () => {
  it("keeps distinct default start and stop thresholds for hysteresis", () => {
    expect(DEFAULT_POUR_DETECTION_THRESHOLDS).toEqual({
      startEvidenceThreshold: 0.65,
      stopEvidenceThreshold: 0.35,
      minPositiveFramesForStart: 4,
      minNegativeFramesForStop: 6,
    });
    expect(DEFAULT_POUR_DETECTION_THRESHOLDS.startEvidenceThreshold).toBeGreaterThan(DEFAULT_POUR_DETECTION_THRESHOLDS.stopEvidenceThreshold);
  });

  it("creates a runtime fixture without browser objects", () => {
    const recipe = recipeWithStages(2);
    const runtime: BrewSessionRuntime = {
      sessionId: "session-1",
      mode: "camera_assisted",
      state: "idle",
      recipe,
      currentStageIndex: null,
      pourState: "not_pouring",
      stages: recipe.stages.map(({ id, order, name }) => ({ stageId: id, order, name, completed: false })),
      detection: { consecutivePositiveFrames: 0, consecutiveNegativeFrames: 0, confidence: 0 },
      manualOverrideUsed: false,
      errors: [],
    };
    expect(runtime).toMatchObject({ state: "idle", mode: "camera_assisted", currentStageIndex: null });
  });

  it.each([1, 2, 3, 4])("supports a %i-stage recipe definition", (count) => {
    expect(recipeWithStages(count).stages).toHaveLength(count);
  });

  it("represents normalized geometry fixtures", () => {
    const point: Point2D = { x: 0.5, y: 0.45 };
    const roi: NormalizedRect = { x: 0.1, y: 0.2, width: 0.8, height: 0.7 };
    expect([point.x, point.y, roi.x, roi.y, roi.width, roi.height].every((value) => value >= 0 && value <= 1)).toBe(true);
    expect(roi.x + roi.width).toBeLessThanOrEqual(1);
    expect(roi.y + roi.height).toBeLessThanOrEqual(1);
  });

  it("imports and evaluates under the Node test runtime", () => {
    expect(DEFAULT_POUR_DETECTION_THRESHOLDS.minPositiveFramesForStart).toBe(4);
    expect(typeof window).toBe("undefined");
  });
});
