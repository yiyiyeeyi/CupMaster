import type { BrewRuntimeEvent } from "./brew-runtime-events";
import type {
  BrewRecipeRuntimeDefinition,
  BrewRuntimeMode,
  BrewSessionRuntime,
  BrewStageRuntimeRecord,
  DetectionMethod,
} from "./brew-runtime-types";

export interface CreateInitialBrewRuntimeInput {
  sessionId: string;
  recipe: BrewRecipeRuntimeDefinition;
  mode: BrewRuntimeMode;
}

export function mergeDetectionMethod(
  current: DetectionMethod | undefined,
  incoming: Exclude<DetectionMethod, "mixed">,
): DetectionMethod {
  if (!current) return incoming;
  return current === incoming ? current : "mixed";
}

export function createInitialBrewRuntime({
  sessionId,
  recipe,
  mode,
}: CreateInitialBrewRuntimeInput): BrewSessionRuntime {
  if (recipe.stages.length === 0) throw new RangeError("A Brew runtime requires at least one recipe stage.");

  const sortedStages = recipe.stages
    .map((stage, inputIndex) => ({ stage: { ...stage }, inputIndex }))
    .sort((left, right) => left.stage.order - right.stage.order || left.inputIndex - right.inputIndex)
    .map(({ stage }) => stage);

  return {
    sessionId,
    mode,
    state: "idle",
    recipe: { ...recipe, stages: sortedStages },
    currentStageIndex: null,
    pourState: "not_pouring",
    stages: sortedStages.map(({ id, order, name }): BrewStageRuntimeRecord => ({
      stageId: id,
      order,
      name,
      completed: false,
    })),
    detection: {
      consecutivePositiveFrames: 0,
      consecutiveNegativeFrames: 0,
      confidence: 0,
    },
    manualOverrideUsed: false,
    errors: [],
  };
}

function startPour(
  runtime: BrewSessionRuntime,
  event: Extract<BrewRuntimeEvent, { type: "POUR_STARTED" }>,
): BrewSessionRuntime {
  if (runtime.state !== "waiting_for_first_pour" && runtime.state !== "paused_between_pours") return runtime;

  const nextIndex = runtime.state === "waiting_for_first_pour" ? 0 : (runtime.currentStageIndex ?? -1) + 1;
  const stage = runtime.stages[nextIndex];
  if (!stage || stage.completed) return runtime;

  const stages = runtime.stages.map((item, index) => index === nextIndex
    ? { ...item, startedAtMs: event.timestampMs, detectionMethod: event.source }
    : item);

  if (runtime.state === "paused_between_pours" && runtime.currentStageIndex !== null) {
    const previous = stages[runtime.currentStageIndex];
    if (previous?.endedAtMs !== undefined && event.timestampMs >= previous.endedAtMs) {
      stages[runtime.currentStageIndex] = { ...previous, pauseAfterMs: event.timestampMs - previous.endedAtMs };
    }
  }

  return {
    ...runtime,
    state: "pouring",
    pourState: "pouring",
    currentStageIndex: nextIndex,
    lastPourStartedAtMs: event.timestampMs,
    stages,
    manualOverrideUsed: runtime.manualOverrideUsed || event.source === "manual",
  };
}

function stopPour(
  runtime: BrewSessionRuntime,
  timestampMs: number,
  source: "camera" | "manual",
): BrewSessionRuntime {
  if (runtime.state !== "pouring" || runtime.currentStageIndex === null) return runtime;
  const current = runtime.stages[runtime.currentStageIndex];
  if (!current || current.startedAtMs === undefined || timestampMs < current.startedAtMs) return runtime;

  const isFinalStage = runtime.currentStageIndex === runtime.stages.length - 1;
  const stages = runtime.stages.map((stage, index) => index === runtime.currentStageIndex
    ? {
        ...stage,
        endedAtMs: timestampMs,
        pourDurationMs: timestampMs - current.startedAtMs!,
        detectionMethod: mergeDetectionMethod(current.detectionMethod, source),
        completed: true,
      }
    : stage);

  return {
    ...runtime,
    state: isFinalStage ? "completed" : "paused_between_pours",
    pourState: "not_pouring",
    lastPourStoppedAtMs: timestampMs,
    ...(isFinalStage && { completedAtMs: timestampMs }),
    stages,
    manualOverrideUsed: runtime.manualOverrideUsed || source === "manual",
  };
}

export function reduceBrewRuntime(
  runtime: BrewSessionRuntime,
  event: BrewRuntimeEvent,
): BrewSessionRuntime {
  if (runtime.state === "completed") return runtime;

  switch (event.type) {
    case "SESSION_STARTED":
      if (runtime.state !== "idle") return runtime;
      return {
        ...runtime,
        state: runtime.mode === "camera_assisted" ? "camera_initializing" : "waiting_for_first_pour",
        startedAtMs: event.timestampMs,
      };
    case "CAMERA_READY":
      return runtime.mode === "camera_assisted" && runtime.state === "camera_initializing"
        ? { ...runtime, state: "waiting_for_first_pour" }
        : runtime;
    case "POUR_STARTED":
      return startPour(runtime, event);
    case "POUR_STOPPED":
      return stopPour(runtime, event.timestampMs, event.source);
    case "MANUAL_ADVANCE_STAGE":
      return stopPour(runtime, event.timestampMs, "manual");
    case "BREW_COMPLETED":
      if (runtime.state === "idle" || runtime.startedAtMs === undefined || event.timestampMs < runtime.startedAtMs) return runtime;
      return {
        ...runtime,
        state: "completed",
        pourState: "not_pouring",
        completedAtMs: event.timestampMs,
        manualOverrideUsed: runtime.manualOverrideUsed || event.source === "manual",
      };
    case "CAMERA_ERROR":
      return { ...runtime, state: "error", pourState: "not_pouring", errors: [...runtime.errors, event.code] };
  }
}
