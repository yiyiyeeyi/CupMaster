import { describe, expect, it, vi } from "vitest";
import type {
  BrewRecipeRuntimeDefinition,
  BrewSessionRuntime,
  VisionFrameAnalysis,
} from "@/domain/brew-runtime";
import { BrewRuntimeController } from "./brew-runtime-controller";

function recipe(stageCount = 3): BrewRecipeRuntimeDefinition {
  return {
    recipeId: `recipe-${stageCount}`,
    recipeName: `${stageCount} stage recipe`,
    completeAfterLastPourStops: true,
    stages: Array.from({ length: stageCount }, (_, index) => ({
      id: `stage-${index + 1}`,
      order: index,
      name: `Stage ${index + 1}`,
      autoAdvanceEnabled: true,
    })),
  };
}

function frame(timestampMs: number, pourEvidence: number, analysisConfidence = 0.9): VisionFrameAnalysis {
  return { timestampMs, pourEvidence, analysisConfidence, roiMotionScore: pourEvidence };
}

function controller(stageCount = 3, mode: "manual" | "camera_assisted" = "camera_assisted") {
  return new BrewRuntimeController({ sessionId: "session-1", recipe: recipe(stageCount), mode });
}

function sendFrames(runtime: BrewRuntimeController, count: number, evidence: number, startAt: number) {
  let snapshot: BrewSessionRuntime = runtime.getSnapshot();
  for (let index = 0; index < count; index += 1) {
    snapshot = runtime.handleVisionFrame(frame(startAt + index, evidence));
  }
  return snapshot;
}

function startCamera(runtime: BrewRuntimeController) {
  runtime.start(100);
  runtime.cameraReady(110);
}

function completeCameraStage(runtime: BrewRuntimeController, startAt: number) {
  sendFrames(runtime, 4, 0.8, startAt);
  return sendFrames(runtime, 6, 0.2, startAt + 10);
}

describe("BrewRuntimeController", () => {
  it("creates an immutable initial snapshot", () => {
    const runtime = controller();
    const snapshot = runtime.getSnapshot();
    expect(snapshot).toMatchObject({ state: "idle", currentStageIndex: null, pourState: "not_pouring" });
    snapshot.state = "error";
    snapshot.stages[0].completed = true;
    expect(runtime.getSnapshot().state).toBe("idle");
    expect(runtime.getSnapshot().stages[0].completed).toBe(false);
  });

  it("starts manual mode with the caller timestamp", () => {
    expect(controller(1, "manual").start(42)).toMatchObject({ state: "waiting_for_first_pour", startedAtMs: 42 });
  });

  it("starts camera mode and accepts CAMERA_READY", () => {
    const runtime = controller(1);
    expect(runtime.start(42).state).toBe("camera_initializing");
    expect(runtime.cameraReady(43)).toMatchObject({ state: "waiting_for_first_pour", startedAtMs: 42 });
  });

  it("updates detection metadata without changing confirmed runtime state", () => {
    const runtime = controller(1);
    startCamera(runtime);
    const snapshot = runtime.handleVisionFrame(frame(200, 0.5, 0.72));
    expect(snapshot).toMatchObject({
      state: "waiting_for_first_pour",
      pourState: "not_pouring",
      detection: { lastFrameTimestampMs: 200, observedState: "uncertain", confidence: 0.72 },
    });
  });

  it("dispatches detector start and stop transitions", () => {
    const runtime = controller(2);
    startCamera(runtime);
    expect(sendFrames(runtime, 4, 0.8, 200)).toMatchObject({ state: "pouring", currentStageIndex: 0 });
    const snapshot = sendFrames(runtime, 6, 0.2, 210);
    expect(snapshot.state).toBe("paused_between_pours");
    expect(snapshot.stages[0]).toMatchObject({ completed: true, detectionMethod: "camera" });
  });

  it("completes a one-stage camera flow", () => {
    const runtime = controller(1);
    startCamera(runtime);
    const snapshot = completeCameraStage(runtime, 200);
    expect(snapshot).toMatchObject({
      state: "completed",
      currentStageIndex: 0,
      completedAtMs: 215,
      manualOverrideUsed: false,
      stages: [{ startedAtMs: 203, endedAtMs: 215, pourDurationMs: 12, detectionMethod: "camera" }],
    });
  });

  it.each([3, 4])("completes an arbitrary %i-stage camera flow", (stageCount) => {
    const runtime = controller(stageCount);
    startCamera(runtime);
    for (let index = 0; index < stageCount; index += 1) completeCameraStage(runtime, 200 + index * 100);
    const snapshot = runtime.getSnapshot();
    expect(snapshot.state).toBe("completed");
    expect(snapshot.currentStageIndex).toBe(stageCount - 1);
    expect(snapshot.stages.every((stage) => stage.completed && stage.detectionMethod === "camera")).toBe(true);
    expect(snapshot.manualOverrideUsed).toBe(false);
  });

  it("does not advance through noisy non-consecutive evidence", () => {
    const runtime = controller(1);
    startCamera(runtime);
    sendFrames(runtime, 2, 0.8, 200);
    runtime.handleVisionFrame(frame(202, 0.5));
    const snapshot = sendFrames(runtime, 3, 0.8, 203);
    expect(snapshot).toMatchObject({ state: "waiting_for_first_pour", currentStageIndex: null });
  });

  it("supports manual pour start and stop", () => {
    const runtime = controller(2, "manual");
    runtime.start(10);
    expect(runtime.manualPourStart(20)).toMatchObject({ state: "pouring", manualOverrideUsed: true });
    const snapshot = runtime.manualPourStop(30);
    expect(snapshot.state).toBe("paused_between_pours");
    expect(snapshot.stages[0]).toMatchObject({ completed: true, detectionMethod: "manual", pourDurationMs: 10 });
  });

  it("merges camera start and manual stop as mixed", () => {
    const runtime = controller(2);
    startCamera(runtime);
    sendFrames(runtime, 4, 0.8, 200);
    const snapshot = runtime.manualPourStop(220);
    expect(snapshot.manualOverrideUsed).toBe(true);
    expect(snapshot.stages[0].detectionMethod).toBe("mixed");
  });

  it("manual advance uses the reducer stage semantics", () => {
    const runtime = controller(2, "manual");
    runtime.start(10);
    runtime.manualPourStart(20);
    expect(runtime.manualAdvanceStage(30)).toMatchObject({ state: "paused_between_pours", manualOverrideUsed: true });
  });

  it("completes manually through the reducer", () => {
    const runtime = controller(2, "manual");
    runtime.start(10);
    expect(runtime.completeManually(30)).toMatchObject({ state: "completed", completedAtMs: 30, manualOverrideUsed: true });
  });

  it("records a safe camera error", () => {
    const runtime = controller();
    runtime.start(10);
    expect(runtime.cameraError(11, "permission_denied")).toMatchObject({ state: "error", errors: ["permission_denied"] });
  });

  it("ignores frames after completion", () => {
    const runtime = controller(1);
    startCamera(runtime);
    const completed = completeCameraStage(runtime, 200);
    runtime.handleVisionFrame(frame(500, 0.8));
    runtime.handleVisionFrame(frame(501, 0.2));
    expect(runtime.getSnapshot()).toEqual(completed);
  });

  it("resetDetection clears only detection metadata and counters", () => {
    const runtime = controller(1);
    startCamera(runtime);
    sendFrames(runtime, 2, 0.8, 200);
    runtime.resetDetection();
    expect(runtime.getSnapshot()).toMatchObject({
      state: "waiting_for_first_pour",
      detection: { consecutivePositiveFrames: 0, consecutiveNegativeFrames: 0, confidence: 0 },
    });
    expect(sendFrames(runtime, 3, 0.8, 300).state).toBe("waiting_for_first_pour");
  });

  it("supports custom detector thresholds", () => {
    const runtime = new BrewRuntimeController({
      sessionId: "custom",
      recipe: recipe(1),
      thresholds: { startEvidenceThreshold: 0.8, stopEvidenceThreshold: 0.2, minPositiveFramesForStart: 2, minNegativeFramesForStop: 2 },
    });
    startCamera(runtime);
    expect(sendFrames(runtime, 2, 0.9, 200).state).toBe("pouring");
    expect(sendFrames(runtime, 2, 0.1, 210).state).toBe("completed");
  });

  it("immediately sends isolated snapshots to subscribers", () => {
    const runtime = controller();
    const received: BrewSessionRuntime[] = [];
    runtime.subscribe((snapshot) => {
      received.push(snapshot);
      snapshot.errors.push("external");
    });
    runtime.start(10);
    expect(received).toHaveLength(2);
    expect(runtime.getSnapshot().errors).toEqual([]);
  });

  it("stops notifications after unsubscribe", () => {
    const runtime = controller();
    const listener = vi.fn();
    const unsubscribe = runtime.subscribe(listener);
    unsubscribe();
    runtime.start(10);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("supports multiple subscribers", () => {
    const runtime = controller();
    const first = vi.fn();
    const second = vi.fn();
    runtime.subscribe(first);
    runtime.subscribe(second);
    runtime.start(10);
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it("resynchronizes detector after a manual stop", () => {
    const runtime = controller(2);
    startCamera(runtime);
    sendFrames(runtime, 4, 0.8, 200);
    runtime.manualPourStop(220);
    const snapshot = sendFrames(runtime, 4, 0.8, 230);
    expect(snapshot).toMatchObject({ state: "pouring", currentStageIndex: 1 });
  });

  it("resynchronizes detector after a manual start", () => {
    const runtime = controller(2);
    startCamera(runtime);
    runtime.manualPourStart(200);
    const snapshot = sendFrames(runtime, 6, 0.2, 210);
    expect(snapshot.state).toBe("paused_between_pours");
    expect(snapshot.stages[0]).toMatchObject({ detectionMethod: "mixed", endedAtMs: 215 });
  });

  it("uses frame timestamps rather than a clock", () => {
    const runtime = controller(1);
    startCamera(runtime);
    sendFrames(runtime, 4, 0.8, 9_000);
    const snapshot = sendFrames(runtime, 6, 0.2, 12_000);
    expect(snapshot.stages[0]).toMatchObject({ startedAtMs: 9_003, endedAtMs: 12_005, pourDurationMs: 3_002 });
  });
});
