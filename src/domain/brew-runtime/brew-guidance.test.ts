import { describe, expect, it, vi } from "vitest";
import { BrewRuntimeController } from "@/application/brew-runtime/brew-runtime-controller";
import type { RecipeStep } from "../types";
import {
  createBrewRuntimeRecipeDefinition,
  createInitialBrewRuntime,
  reduceBrewRuntime,
  type BrewRuntimeEvent,
  type BrewSessionRuntime,
} from "./index";

const completePourOverSteps: RecipeStep[] = [
  {
    id: "bloom",
    order: 1,
    title: "Bloom",
    targetWaterGrams: 45,
    durationSeconds: 40,
    pattern: "spiral",
    instruction: "Wet all grounds evenly.",
    guidance: {
      start: "Start the bloom and wet all grounds.",
      details: [
        { id: "check-dry-spots", atSeconds: 10, message: "Check for dry spots around the edge." },
        { id: "gentle-swirl", atSeconds: 20, message: "Give the brewer one gentle swirl." },
      ],
      end: "Bloom complete. Prepare for the first pour.",
    },
  },
  {
    id: "first-pour",
    order: 2,
    title: "First pour",
    targetWaterGrams: 120,
    durationSeconds: 35,
    pattern: "spiral",
    instruction: "Pour in small outward circles.",
    guidance: {
      start: "Begin the first pour in small circles.",
      details: [{ id: "steady-stream", atSeconds: 12, message: "Keep the stream thin and steady." }],
      end: "First pour complete. Let the slurry settle slightly.",
    },
  },
  {
    id: "second-pour",
    order: 3,
    title: "Second pour",
    targetWaterGrams: 185,
    durationSeconds: 35,
    pattern: "spiral",
    instruction: "Keep the slurry height steady.",
    guidance: {
      start: "Begin the second controlled pour.",
      details: [{ id: "hold-height", atSeconds: 12, message: "Hold a consistent kettle height." }],
      end: "Second pour complete.",
    },
  },
  {
    id: "final-pour",
    order: 4,
    title: "Final pour",
    targetWaterGrams: 250,
    durationSeconds: 35,
    pattern: "center",
    instruction: "Finish gently near the center.",
    guidance: {
      start: "Start the final pour near the center.",
      details: [{ id: "finish-gently", atSeconds: 10, message: "Ease the flow as you approach the target." }],
      end: "Pouring complete. Allow the coffee to draw down.",
    },
  },
];

const completeRecipe = createBrewRuntimeRecipeDefinition({
  recipeId: "balanced-v60",
  recipeName: "Balanced V60",
  steps: completePourOverSteps,
});

function apply(runtime: BrewSessionRuntime, ...events: BrewRuntimeEvent[]): BrewSessionRuntime {
  return events.reduce(reduceBrewRuntime, runtime);
}

function manualRuntime(): BrewSessionRuntime {
  return apply(
    createInitialBrewRuntime({ sessionId: "guided-session", recipe: completeRecipe, mode: "manual" }),
    { type: "SESSION_STARTED", timestampMs: 0 },
  );
}

describe("recipe to runtime guidance adapter", () => {
  it("maps complete recipe steps and second-based details into runtime milliseconds", () => {
    expect(completeRecipe.stages).toHaveLength(4);
    expect(completeRecipe.stages[0]).toMatchObject({
      id: "bloom",
      name: "Bloom",
      targetPourDurationMs: 40_000,
      guidance: {
        start: "Start the bloom and wet all grounds.",
        details: [
          { id: "check-dry-spots", atElapsedMs: 10_000 },
          { id: "gentle-swirl", atElapsedMs: 20_000 },
        ],
      },
    });
  });

  it("sorts runtime stages and detailed cues deterministically without mutating recipe input", () => {
    const steps = structuredClone(completePourOverSteps).reverse();
    steps[3].guidance!.details!.reverse();
    const before = structuredClone(steps);
    const runtime = createInitialBrewRuntime({
      sessionId: "sorted",
      recipe: createBrewRuntimeRecipeDefinition({ recipeId: "sorted", recipeName: "Sorted", steps }),
      mode: "manual",
    });
    expect(runtime.recipe.stages.map((stage) => stage.order)).toEqual([1, 2, 3, 4]);
    expect(runtime.recipe.stages[0].guidance?.details?.map((detail) => detail.atElapsedMs)).toEqual([10_000, 20_000]);
    expect(steps).toEqual(before);
  });
});

describe("deterministic guidance lifecycle", () => {
  it("runs a complete pour-over recipe and emits each start, detail, and end once", () => {
    let runtime = manualRuntime();
    runtime = apply(runtime, { type: "POUR_STARTED", timestampMs: 1_000, source: "manual" });
    expect(runtime.guidanceEvents.map((event) => event.moment)).toEqual(["step_start"]);

    runtime = apply(runtime,
      { type: "RUNTIME_TICK", timestampMs: 11_000 },
      { type: "RUNTIME_TICK", timestampMs: 11_000 },
      { type: "SESSION_PAUSED", timestampMs: 12_000 },
      { type: "RUNTIME_TICK", timestampMs: 30_000 },
    );
    expect(runtime.state).toBe("paused");
    expect(runtime.guidanceEvents.map((event) => event.detailId).filter(Boolean)).toEqual(["check-dry-spots"]);

    runtime = apply(runtime,
      { type: "SESSION_RESUMED", timestampMs: 30_000 },
      { type: "RUNTIME_TICK", timestampMs: 38_000 },
      { type: "RUNTIME_TICK", timestampMs: 38_000 },
      { type: "POUR_STOPPED", timestampMs: 46_000, source: "manual" },
    );
    expect(runtime.stages[0]).toMatchObject({ completed: true, pausedDurationMs: 18_000, pourDurationMs: 27_000 });
    expect(runtime.guidanceEvents.filter((event) => event.stageId === "bloom").map((event) => event.moment)).toEqual([
      "step_start", "step_detail", "step_detail", "step_end",
    ]);

    const stageWindows = [
      [50_000, 62_000, 85_000],
      [90_000, 102_000, 125_000],
      [130_000, 140_000, 165_000],
    ] as const;
    for (const [startMs, detailMs, stopMs] of stageWindows) {
      runtime = apply(runtime,
        { type: "POUR_STARTED", timestampMs: startMs, source: "manual" },
        { type: "RUNTIME_TICK", timestampMs: detailMs },
        { type: "RUNTIME_TICK", timestampMs: detailMs + 1 },
        { type: "POUR_STOPPED", timestampMs: stopMs, source: "manual" },
      );
    }

    expect(runtime.state).toBe("completed");
    expect(runtime.stages.every((stage) => stage.completed)).toBe(true);
    expect(runtime.guidanceEvents).toHaveLength(13);
    expect(new Set(runtime.guidanceEvents.map((event) => event.id)).size).toBe(13);
    expect(runtime.guidanceEvents.map((event) => event.sequence)).toEqual(
      Array.from({ length: 13 }, (_, index) => index + 1),
    );
    expect(runtime.guidanceEvents.at(-1)).toMatchObject({
      moment: "step_end",
      stageId: "final-pour",
      message: "Pouring complete. Allow the coffee to draw down.",
    });
  });

  it("emits a due detail before the end transition when no intermediate tick arrived", () => {
    const runtime = apply(manualRuntime(),
      { type: "POUR_STARTED", timestampMs: 1_000, source: "manual" },
      { type: "POUR_STOPPED", timestampMs: 26_000, source: "manual" },
    );
    expect(runtime.guidanceEvents.map((event) => event.moment)).toEqual([
      "step_start", "step_detail", "step_detail", "step_end",
    ]);
    expect(runtime.guidanceEvents.slice(1, 3).every((event) => event.timestampMs === 26_000)).toBe(true);
  });

  it("supports pause and resume between stages without replaying guidance", () => {
    let runtime = apply(manualRuntime(),
      { type: "POUR_STARTED", timestampMs: 1_000, source: "manual" },
      { type: "POUR_STOPPED", timestampMs: 26_000, source: "manual" },
      { type: "SESSION_PAUSED", timestampMs: 27_000 },
    );
    const eventCount = runtime.guidanceEvents.length;
    runtime = apply(runtime,
      { type: "RUNTIME_TICK", timestampMs: 40_000 },
      { type: "SESSION_RESUMED", timestampMs: 50_000 },
    );
    expect(runtime).toMatchObject({ state: "paused_between_pours", accumulatedPauseMs: 23_000 });
    expect(runtime.guidanceEvents).toHaveLength(eventCount);
  });

  it("restarts as a new run, retains event history, and makes step cues eligible once again", () => {
    let runtime = apply(manualRuntime(),
      { type: "POUR_STARTED", timestampMs: 1_000, source: "manual" },
      { type: "POUR_STOPPED", timestampMs: 26_000, source: "manual" },
    );
    const firstRunCount = runtime.guidanceEvents.length;
    runtime = apply(runtime,
      { type: "SESSION_RESTARTED", timestampMs: 50_000 },
      { type: "POUR_STARTED", timestampMs: 50_100, source: "manual" },
      { type: "POUR_STARTED", timestampMs: 50_200, source: "manual" },
    );
    expect(runtime).toMatchObject({ runNumber: 2, state: "pouring", currentStageIndex: 0 });
    expect(runtime.guidanceEvents).toHaveLength(firstRunCount + 1);
    expect(runtime.guidanceEvents.at(-1)).toMatchObject({ runNumber: 2, sequence: firstRunCount + 1, moment: "step_start" });
    expect(runtime.guidanceEvents[0].id).not.toBe(runtime.guidanceEvents.at(-1)?.id);
  });
});

describe("presentation-independent controller guidance stream", () => {
  it("publishes new guidance independently from runtime snapshots and never replays on subscribe", () => {
    const controller = new BrewRuntimeController({ sessionId: "controller-guidance", recipe: completeRecipe, mode: "manual" });
    const listener = vi.fn();
    const snapshots = vi.fn();
    controller.subscribe(snapshots);
    controller.subscribeGuidance(listener);
    controller.start(0);
    controller.manualPourStart(1_000);
    controller.tick(11_000);
    controller.tick(11_000);
    controller.pause(12_000);
    controller.tick(30_000);
    controller.resume(30_000);
    controller.tick(38_000);
    controller.manualPourStop(46_000);

    expect(listener.mock.calls.map(([event]) => event.moment)).toEqual([
      "step_start", "step_detail", "step_detail", "step_end",
    ]);
    expect(snapshots.mock.calls.length).toBeGreaterThan(listener.mock.calls.length);
    expect(controller.getGuidanceEvents()).toHaveLength(4);
    expect(controller.getGuidanceEvents(2).map((event) => event.sequence)).toEqual([3, 4]);

    const lateListener = vi.fn();
    controller.subscribeGuidance(lateListener);
    expect(lateListener).not.toHaveBeenCalled();
  });

  it("supports explicit completion and restart operations", () => {
    const controller = new BrewRuntimeController({ sessionId: "operations", recipe: completeRecipe, mode: "manual" });
    controller.start(0);
    controller.manualPourStart(1_000);
    expect(controller.completeManually(2_000).state).toBe("completed");
    expect(controller.getGuidanceEvents().map((event) => event.moment)).toEqual(["step_start", "step_end"]);
    controller.completeManually(2_100);
    expect(controller.getGuidanceEvents()).toHaveLength(2);
    expect(controller.restart(3_000)).toMatchObject({ state: "waiting_for_first_pour", runNumber: 2 });
  });
});
