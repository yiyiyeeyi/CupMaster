import type { BrewRuntimeEvent } from "./brew-runtime-events";
import type {
  BrewGuidanceEvent,
  BrewRecipeRuntimeDefinition,
  BrewRuntimeMode,
  BrewSessionRuntime,
  BrewStageRuntimeRecord,
  DetectionMethod,
  ResumableBrewRuntimeState,
} from "./brew-runtime-types";

export interface CreateInitialBrewRuntimeInput {
  sessionId: string;
  recipe: BrewRecipeRuntimeDefinition;
  mode: BrewRuntimeMode;
  runNumber?: number;
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
  runNumber = 1,
}: CreateInitialBrewRuntimeInput): BrewSessionRuntime {
  if (recipe.stages.length === 0) throw new RangeError("A Brew runtime requires at least one recipe stage.");

  const stageIds = new Set<string>();
  for (const stage of recipe.stages) {
    if (stageIds.has(stage.id)) throw new RangeError("Brew runtime stage IDs must be unique.");
    stageIds.add(stage.id);
    const detailIds = stage.guidance?.details?.map((detail) => detail.id) ?? [];
    if (new Set(detailIds).size !== detailIds.length) {
      throw new RangeError("Guidance detail IDs must be unique within a runtime stage.");
    }
    if (stage.guidance?.details?.some((detail) => !Number.isFinite(detail.atElapsedMs) || detail.atElapsedMs < 0)) {
      throw new RangeError("Guidance detail elapsed times must be finite and non-negative.");
    }
  }

  const sortedStages = recipe.stages
    .map((stage, inputIndex) => ({
      stage: {
        ...stage,
        ...(stage.guidance && {
          guidance: {
            ...stage.guidance,
            ...(stage.guidance.details && {
              details: stage.guidance.details
                .map((detail, detailInputIndex) => ({ detail: { ...detail }, detailInputIndex }))
                .sort((left, right) => left.detail.atElapsedMs - right.detail.atElapsedMs
                  || left.detailInputIndex - right.detailInputIndex)
                .map(({ detail }) => detail),
            }),
          },
        }),
      },
      inputIndex,
    }))
    .sort((left, right) => left.stage.order - right.stage.order || left.inputIndex - right.inputIndex)
    .map(({ stage }) => stage);

  return {
    sessionId,
    mode,
    runNumber,
    state: "idle",
    recipe: { ...recipe, stages: sortedStages },
    accumulatedPauseMs: 0,
    currentStageIndex: null,
    pourState: "not_pouring",
    stages: sortedStages.map(({ id, order, name }): BrewStageRuntimeRecord => ({
      stageId: id,
      order,
      name,
      pausedDurationMs: 0,
      completed: false,
    })),
    detection: {
      consecutivePositiveFrames: 0,
      consecutiveNegativeFrames: 0,
      confidence: 0,
    },
    manualOverrideUsed: false,
    guidanceEvents: [],
    nextGuidanceSequence: 1,
    errors: [],
  };
}

function guidanceId(
  runtime: BrewSessionRuntime,
  stageId: string,
  suffix: string,
): string {
  return `${runtime.sessionId}:run-${runtime.runNumber}:${stageId}:${suffix}`;
}

function appendGuidance(
  runtime: BrewSessionRuntime,
  stageIndex: number,
  event: Omit<BrewGuidanceEvent, "id" | "sequence" | "runNumber" | "stageId" | "stageOrder" | "stageName">,
  suffix: string,
): BrewSessionRuntime {
  const stage = runtime.recipe.stages[stageIndex];
  if (stage === undefined) return runtime;
  const id = guidanceId(runtime, stage.id, suffix);
  if (runtime.guidanceEvents.some((item) => item.id === id)) return runtime;
  const guidanceEvent: BrewGuidanceEvent = {
    ...event,
    id,
    sequence: runtime.nextGuidanceSequence,
    runNumber: runtime.runNumber,
    stageId: stage.id,
    stageOrder: stage.order,
    stageName: stage.name,
  };
  return {
    ...runtime,
    guidanceEvents: [...runtime.guidanceEvents, guidanceEvent],
    nextGuidanceSequence: runtime.nextGuidanceSequence + 1,
  };
}

function emitStepStart(runtime: BrewSessionRuntime, stageIndex: number, timestampMs: number): BrewSessionRuntime {
  const message = runtime.recipe.stages[stageIndex]?.guidance?.start;
  return message === undefined ? runtime : appendGuidance(runtime, stageIndex, {
    timestampMs,
    moment: "step_start",
    message,
  }, "start");
}

function activeStageElapsedMs(runtime: BrewSessionRuntime, stageIndex: number, timestampMs: number): number | null {
  const stage = runtime.stages[stageIndex];
  if (stage?.startedAtMs === undefined || timestampMs < stage.startedAtMs) return null;
  const currentPauseMs = stage.pausedAtMs === undefined ? 0 : timestampMs - stage.pausedAtMs;
  return Math.max(0, timestampMs - stage.startedAtMs - stage.pausedDurationMs - currentPauseMs);
}

function emitDueDetails(runtime: BrewSessionRuntime, timestampMs: number): BrewSessionRuntime {
  if (runtime.currentStageIndex === null) return runtime;
  const stageIndex = runtime.currentStageIndex;
  const elapsedMs = activeStageElapsedMs(runtime, stageIndex, timestampMs);
  if (elapsedMs === null) return runtime;
  let next = runtime;
  for (const detail of runtime.recipe.stages[stageIndex]?.guidance?.details ?? []) {
    if (detail.atElapsedMs <= elapsedMs) {
      next = appendGuidance(next, stageIndex, {
        timestampMs,
        moment: "step_detail",
        message: detail.message,
        detailId: detail.id,
        scheduledElapsedMs: detail.atElapsedMs,
      }, `detail:${detail.id}`);
    }
  }
  return next;
}

function emitStepEnd(runtime: BrewSessionRuntime, stageIndex: number, timestampMs: number): BrewSessionRuntime {
  const message = runtime.recipe.stages[stageIndex]?.guidance?.end;
  return message === undefined ? runtime : appendGuidance(runtime, stageIndex, {
    timestampMs,
    moment: "step_end",
    message,
  }, "end");
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

  return emitStepStart({
    ...runtime,
    state: "pouring",
    pourState: "pouring",
    currentStageIndex: nextIndex,
    lastPourStartedAtMs: event.timestampMs,
    stages,
    manualOverrideUsed: runtime.manualOverrideUsed || event.source === "manual",
  }, nextIndex, event.timestampMs);
}

function stopPour(
  runtime: BrewSessionRuntime,
  timestampMs: number,
  source: "camera" | "manual",
): BrewSessionRuntime {
  if (runtime.state !== "pouring" || runtime.currentStageIndex === null) return runtime;
  const withDetails = emitDueDetails(runtime, timestampMs);
  const current = withDetails.stages[withDetails.currentStageIndex!];
  if (!current || current.startedAtMs === undefined || timestampMs < current.startedAtMs) return runtime;

  const currentStageIndex = withDetails.currentStageIndex!;
  const isFinalStage = currentStageIndex === withDetails.stages.length - 1;
  const stages = withDetails.stages.map((stage, index) => index === currentStageIndex
    ? {
        ...stage,
        endedAtMs: timestampMs,
        pourDurationMs: timestampMs - current.startedAtMs! - current.pausedDurationMs,
        detectionMethod: mergeDetectionMethod(current.detectionMethod, source),
        completed: true,
      }
    : stage);

  return emitStepEnd({
    ...withDetails,
    state: isFinalStage ? "completed" : "paused_between_pours",
    pourState: "not_pouring",
    lastPourStoppedAtMs: timestampMs,
    ...(isFinalStage && { completedAtMs: timestampMs }),
    stages,
    manualOverrideUsed: withDetails.manualOverrideUsed || source === "manual",
  }, currentStageIndex, timestampMs);
}

function pauseRuntime(runtime: BrewSessionRuntime, timestampMs: number): BrewSessionRuntime {
  if (runtime.state === "idle" || runtime.state === "paused" || runtime.state === "completed" || runtime.state === "error"
    || runtime.startedAtMs === undefined || timestampMs < runtime.startedAtMs) return runtime;
  const stateBeforePause: ResumableBrewRuntimeState = runtime.state;
  const withDetails = runtime.state === "pouring" ? emitDueDetails(runtime, timestampMs) : runtime;
  const stages = withDetails.state === "pouring" && withDetails.currentStageIndex !== null
    ? withDetails.stages.map((stage, index) => index === withDetails.currentStageIndex
      ? { ...stage, pausedAtMs: timestampMs }
      : stage)
    : withDetails.stages;
  return { ...withDetails, state: "paused", stateBeforePause, pausedAtMs: timestampMs, stages };
}

function resumeRuntime(runtime: BrewSessionRuntime, timestampMs: number): BrewSessionRuntime {
  if (runtime.state !== "paused" || runtime.pausedAtMs === undefined || runtime.stateBeforePause === undefined
    || timestampMs < runtime.pausedAtMs) return runtime;
  const pauseDurationMs = timestampMs - runtime.pausedAtMs;
  const stages = runtime.stateBeforePause === "pouring" && runtime.currentStageIndex !== null
    ? runtime.stages.map((stage, index) => index === runtime.currentStageIndex
      ? { ...stage, pausedDurationMs: stage.pausedDurationMs + pauseDurationMs, pausedAtMs: undefined }
      : stage)
    : runtime.stages;
  return {
    ...runtime,
    state: runtime.stateBeforePause,
    stateBeforePause: undefined,
    pausedAtMs: undefined,
    accumulatedPauseMs: runtime.accumulatedPauseMs + pauseDurationMs,
    stages,
  };
}

export function reduceBrewRuntime(
  runtime: BrewSessionRuntime,
  event: BrewRuntimeEvent,
): BrewSessionRuntime {
  if (event.type === "SESSION_RESTARTED" || event.type === "SESSION_RESET") {
    const initial = createInitialBrewRuntime({
      sessionId: runtime.sessionId,
      recipe: runtime.recipe,
      mode: runtime.mode,
      runNumber: runtime.runNumber + 1,
    });
    const restarted = {
      ...initial,
      guidanceEvents: runtime.guidanceEvents,
      nextGuidanceSequence: runtime.nextGuidanceSequence,
    };
    return event.type === "SESSION_RESET" ? restarted
      : reduceBrewRuntime(restarted, { type: "SESSION_STARTED", timestampMs: event.timestampMs });
  }
  if (runtime.state === "completed") return runtime;

  switch (event.type) {
    case "SESSION_STARTED":
      if (runtime.state !== "idle") return runtime;
      return {
        ...runtime,
        state: runtime.mode === "camera_assisted" ? "camera_initializing" : "waiting_for_first_pour",
        startedAtMs: event.timestampMs,
      };
    case "SESSION_PAUSED":
      return pauseRuntime(runtime, event.timestampMs);
    case "SESSION_RESUMED":
      return resumeRuntime(runtime, event.timestampMs);
    case "CAMERA_READY":
      return runtime.mode === "camera_assisted" && runtime.state === "camera_initializing"
        ? { ...runtime, state: "waiting_for_first_pour" }
        : runtime;
    case "RUNTIME_TICK":
      return runtime.state === "pouring" ? emitDueDetails(runtime, event.timestampMs) : runtime;
    case "POUR_STARTED":
      return startPour(runtime, event);
    case "POUR_STOPPED":
      return stopPour(runtime, event.timestampMs, event.source);
    case "MANUAL_ADVANCE_STAGE":
      return stopPour(runtime, event.timestampMs, "manual");
    case "BREW_COMPLETED":
      if (runtime.state === "idle" || runtime.startedAtMs === undefined || event.timestampMs < runtime.startedAtMs) return runtime;
      const activeStageIndex = runtime.state === "pouring"
        ? runtime.currentStageIndex
        : runtime.state === "paused" && runtime.stateBeforePause === "pouring" ? runtime.currentStageIndex : null;
      const withDetails = activeStageIndex === null ? runtime : emitDueDetails(runtime, event.timestampMs);
      const withEnd = activeStageIndex === null ? withDetails : emitStepEnd(withDetails, activeStageIndex, event.timestampMs);
      return {
        ...withEnd,
        state: "completed",
        pourState: "not_pouring",
        completedAtMs: event.timestampMs,
        manualOverrideUsed: withEnd.manualOverrideUsed || event.source === "manual",
      };
    case "CAMERA_ERROR":
      return { ...runtime, state: "error", pourState: "not_pouring", errors: [...runtime.errors, event.code] };
  }
}
