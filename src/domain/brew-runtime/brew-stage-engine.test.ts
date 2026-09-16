import { describe, expect, it } from "vitest";
import type { BrewRecipeRuntimeDefinition, BrewRuntimeEvent, BrewRuntimeMode, BrewSessionRuntime } from "./index";
import { createInitialBrewRuntime, mergeDetectionMethod, reduceBrewRuntime } from "./index";

function recipe(count: number, orders = Array.from({ length: count }, (_, index) => index)): BrewRecipeRuntimeDefinition {
  return {
    recipeId: `recipe-${count}`,
    recipeName: `${count}-stage recipe`,
    completeAfterLastPourStops: true,
    stages: orders.map((order, index) => ({ id: `stage-${index}`, order, name: `Stage ${index}`, autoAdvanceEnabled: true })),
  };
}

function initial(count = 1, mode: BrewRuntimeMode = "camera_assisted") {
  return createInitialBrewRuntime({ sessionId: "session-1", recipe: recipe(count), mode });
}

function reduce(runtime: BrewSessionRuntime, events: BrewRuntimeEvent[]) {
  return events.reduce(reduceBrewRuntime, runtime);
}

const startCamera: BrewRuntimeEvent[] = [
  { type: "SESSION_STARTED", timestampMs: 100 },
  { type: "CAMERA_READY", timestampMs: 110 },
];

describe("createInitialBrewRuntime", () => {
  it("initializes a one-stage recipe", () => expect(initial()).toMatchObject({ state: "idle", pourState: "not_pouring", currentStageIndex: null, stages: [{ completed: false }], detection: { consecutivePositiveFrames: 0, consecutiveNegativeFrames: 0, confidence: 0 }, manualOverrideUsed: false, errors: [] }));
  it("initializes an arbitrary four-stage recipe", () => expect(initial(4).stages).toHaveLength(4));
  it("sorts a copied stage list deterministically by order", () => { const input = recipe(4, [3, 1, 1, 0]); const runtime = createInitialBrewRuntime({ sessionId: "session", recipe: input, mode: "manual" }); expect(runtime.stages.map((stage) => stage.order)).toEqual([0, 1, 1, 3]); expect(runtime.stages.filter((stage) => stage.order === 1).map((stage) => stage.stageId)).toEqual(["stage-1", "stage-2"]); });
  it("does not mutate recipe input", () => { const input = recipe(4, [3, 1, 1, 0]), before = structuredClone(input); createInitialBrewRuntime({ sessionId: "session", recipe: input, mode: "manual" }); expect(input).toEqual(before); });
  it("rejects an empty recipe", () => expect(() => initial(0)).toThrow(RangeError));
});

describe("session setup transitions", () => {
  it("starts a manual session waiting for the first pour", () => expect(reduceBrewRuntime(initial(1, "manual"), { type: "SESSION_STARTED", timestampMs: 100 })).toMatchObject({ state: "waiting_for_first_pour", startedAtMs: 100 }));
  it("starts a camera session by initializing camera", () => expect(reduceBrewRuntime(initial(), { type: "SESSION_STARTED", timestampMs: 100 })).toMatchObject({ state: "camera_initializing", startedAtMs: 100 }));
  it("marks camera ready without changing the session start", () => expect(reduce(initial(), startCamera)).toMatchObject({ state: "waiting_for_first_pour", startedAtMs: 100, currentStageIndex: null }));
});

describe("stage flows", () => {
  it("completes a one-stage camera flow with timestamps and duration", () => { const runtime = reduce(initial(), [...startCamera, { type: "POUR_STARTED", timestampMs: 200, source: "camera" }, { type: "POUR_STOPPED", timestampMs: 275, source: "camera" }]); expect(runtime).toMatchObject({ state: "completed", currentStageIndex: 0, lastPourStartedAtMs: 200, lastPourStoppedAtMs: 275, completedAtMs: 275, stages: [{ startedAtMs: 200, endedAtMs: 275, pourDurationMs: 75, detectionMethod: "camera", completed: true }] }); });
  it("completes three stages without auto-starting the next stage", () => { let runtime = reduce(initial(3), [...startCamera, { type: "POUR_STARTED", timestampMs: 200, source: "camera" }, { type: "POUR_STOPPED", timestampMs: 250, source: "camera" }]); expect(runtime).toMatchObject({ state: "paused_between_pours", currentStageIndex: 0 }); runtime = reduce(runtime, [{ type: "POUR_STARTED", timestampMs: 300, source: "camera" }, { type: "POUR_STOPPED", timestampMs: 360, source: "camera" }, { type: "POUR_STARTED", timestampMs: 400, source: "camera" }, { type: "POUR_STOPPED", timestampMs: 470, source: "camera" }]); expect(runtime.state).toBe("completed"); expect(runtime.currentStageIndex).toBe(2); expect(runtime.stages.map((stage) => stage.pourDurationMs)).toEqual([50, 60, 70]); expect(runtime.stages.every((stage) => stage.completed)).toBe(true); });
  it("supports four stages", () => { const events: BrewRuntimeEvent[] = [...startCamera]; for (let index = 0; index < 4; index += 1) events.push({ type: "POUR_STARTED", timestampMs: 200 + index * 100, source: "camera" }, { type: "POUR_STOPPED", timestampMs: 250 + index * 100, source: "camera" }); const runtime = reduce(initial(4), events); expect(runtime.state).toBe("completed"); expect(runtime.currentStageIndex).toBe(3); });
});

describe("invalid and duplicate events", () => {
  it("ignores duplicate POUR_STARTED while pouring", () => { const pouring = reduce(initial(), [...startCamera, { type: "POUR_STARTED", timestampMs: 200, source: "camera" }]); expect(reduceBrewRuntime(pouring, { type: "POUR_STARTED", timestampMs: 220, source: "manual" })).toBe(pouring); });
  it("ignores duplicate POUR_STOPPED after a stage stops", () => { const paused = reduce(initial(2), [...startCamera, { type: "POUR_STARTED", timestampMs: 200, source: "camera" }, { type: "POUR_STOPPED", timestampMs: 250, source: "camera" }]); expect(reduceBrewRuntime(paused, { type: "POUR_STOPPED", timestampMs: 260, source: "camera" })).toBe(paused); });
  it("ignores a stop before the first pour", () => { const waiting = reduce(initial(), startCamera); expect(reduceBrewRuntime(waiting, { type: "POUR_STOPPED", timestampMs: 150, source: "camera" })).toBe(waiting); });
  it("ignores a stop timestamp before the stage start", () => { const pouring = reduce(initial(), [...startCamera, { type: "POUR_STARTED", timestampMs: 200, source: "camera" }]); expect(reduceBrewRuntime(pouring, { type: "POUR_STOPPED", timestampMs: 199, source: "camera" })).toBe(pouring); });
});

describe("detection methods and manual override", () => {
  it.each([
    ["camera", "camera", "camera"],
    ["manual", "manual", "manual"],
    ["camera", "manual", "mixed"],
    ["manual", "camera", "mixed"],
  ] as const)("merges %s and %s into %s", (start, stop, expected) => expect(mergeDetectionMethod(start, stop)).toBe(expected));
  it("marks manual source as an override", () => expect(reduce(initial(1, "manual"), [{ type: "SESSION_STARTED", timestampMs: 100 }, { type: "POUR_STARTED", timestampMs: 200, source: "manual" }]).manualOverrideUsed).toBe(true));
  it("manually completes the current non-final stage", () => { const pouring = reduce(initial(2), [...startCamera, { type: "POUR_STARTED", timestampMs: 200, source: "camera" }]); const runtime = reduceBrewRuntime(pouring, { type: "MANUAL_ADVANCE_STAGE", timestampMs: 250 }); expect(runtime).toMatchObject({ state: "paused_between_pours", manualOverrideUsed: true }); expect(runtime.stages[0]).toMatchObject({ completed: true, detectionMethod: "mixed", pourDurationMs: 50 }); expect(runtime.stages[1].completed).toBe(false); });
});

describe("terminal and error behavior", () => {
  it("keeps completed runtime terminal for all later normal events", () => { const completed = reduce(initial(), [...startCamera, { type: "POUR_STARTED", timestampMs: 200, source: "camera" }, { type: "POUR_STOPPED", timestampMs: 250, source: "camera" }]); const events: BrewRuntimeEvent[] = [{ type: "POUR_STARTED", timestampMs: 300, source: "manual" }, { type: "POUR_STOPPED", timestampMs: 310, source: "manual" }, { type: "CAMERA_READY", timestampMs: 320 }, { type: "MANUAL_ADVANCE_STAGE", timestampMs: 330 }]; expect(events.reduce(reduceBrewRuntime, completed)).toBe(completed); });
  it("moves a non-completed runtime to safe camera error state", () => expect(reduceBrewRuntime(initial(), { type: "CAMERA_ERROR", timestampMs: 100, code: "permission_denied" })).toMatchObject({ state: "error", errors: ["permission_denied"] }));
  it("does not reopen a completed runtime for CAMERA_ERROR", () => { const completed = reduce(initial(), [...startCamera, { type: "POUR_STARTED", timestampMs: 200, source: "camera" }, { type: "POUR_STOPPED", timestampMs: 250, source: "camera" }]); expect(reduceBrewRuntime(completed, { type: "CAMERA_ERROR", timestampMs: 300, code: "late_error" })).toBe(completed); });
});

describe("reducer purity", () => {
  it("does not mutate the previous runtime", () => { const previous = reduce(initial(), startCamera); const snapshot = structuredClone(previous); const next = reduceBrewRuntime(previous, { type: "POUR_STARTED", timestampMs: 200, source: "camera" }); expect(previous).toEqual(snapshot); expect(next).not.toBe(previous); });
});
