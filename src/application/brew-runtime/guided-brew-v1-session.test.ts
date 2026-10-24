import { describe, expect, it, vi } from "vitest";
import type { RecipeStep } from "@/domain";
import { createBrewRuntimeRecipeDefinition } from "@/domain/brew-runtime";
import type { BrewGuidanceEvent } from "@/domain/brew-runtime";
import type { GuidanceVoicePort, GuidanceVoiceSnapshot } from "@/infrastructure/voice";
import { BrewRuntimeController } from "./brew-runtime-controller";
import { DripperPositioningTracker } from "./dripper-positioning";
import { GuidedBrewResourceScope, GuidedBrewV1Session } from "./guided-brew-v1-session";

class VoiceSpy implements GuidanceVoicePort {
  readonly events: BrewGuidanceEvent[] = [];
  enabled = true;
  disposed = false;
  cancelCount = 0;

  speak(event: Readonly<BrewGuidanceEvent>): void { this.events.push({ ...event }); }
  replay(): boolean { return this.enabled && this.events.length > 0; }
  setEnabled(enabled: boolean): void { this.enabled = enabled; }
  getSnapshot(): GuidanceVoiceSnapshot { return { supported: true, enabled: this.enabled, speaking: false, lastMessage: this.events.at(-1)?.message ?? null }; }
  cancel(): void { this.cancelCount += 1; }
  dispose(): void { this.disposed = true; }
}

const steps: RecipeStep[] = [
  {
    id: "bloom", order: 1, title: "Bloom", targetWaterGrams: 45, durationSeconds: 1,
    instruction: "Bloom evenly.", guidance: {
      start: "開始悶蒸。",
      details: [{ id: "detail", atSeconds: 0.5, message: "確認咖啡粉都已浸濕。" }],
      end: "悶蒸完成。",
    },
  },
  {
    id: "pour", order: 2, title: "Main pour", targetWaterGrams: 200, durationSeconds: 1,
    instruction: "Pour steadily.", guidance: { start: "開始主注水。", end: "沖煮完成。" },
  },
];

function setup() {
  const voice = new VoiceSpy();
  const runtime = new BrewRuntimeController({
    sessionId: "guided-test",
    mode: "manual",
    recipe: createBrewRuntimeRecipeDefinition({ recipeId: "v60", recipeName: "Test V60", steps }),
  });
  const completedStages: number[] = [];
  const onCompleted = vi.fn();
  const session = new GuidedBrewV1Session({
    runtime,
    voice,
    positioning: new DripperPositioningTracker({ stableDurationMs: 300, minimumStableSamples: 3 }),
    onStageCompleted: (index) => completedStages.push(index),
    onCompleted,
  });
  return { session, voice, completedStages, onCompleted };
}

function makeReady(session: GuidedBrewV1Session) {
  session.confirmDripperPlacement();
  session.observePositioning(0, 0.02);
  session.observePositioning(150, 0.03);
  session.observePositioning(300, 0.02);
  expect(session.getSnapshot().phase).toBe("READY");
}

describe("GuidedBrewV1Session", () => {
  it("restores guidance after effect cleanup and setup without duplicate subscriptions", () => {
    const { session, voice } = setup();
    const firstListener = vi.fn();
    const unsubscribeFirst = session.subscribe(firstListener);
    unsubscribeFirst();
    session.dispose();
    session.dispose();

    session.activate();
    session.activate();
    const activeListener = vi.fn();
    const unsubscribeActive = session.subscribe(activeListener);
    makeReady(session);
    const firstListenerCalls = firstListener.mock.calls.length;
    session.start("TOUCH", 400);
    session.tick(900);
    session.tick(1_400);
    session.tick(2_400);

    expect(session.getSnapshot().phase).toBe("COMPLETED");
    expect(voice.events.map((event) => event.message)).toEqual([
      "開始悶蒸。", "確認咖啡粉都已浸濕。", "悶蒸完成。", "開始主注水。", "沖煮完成。",
    ]);
    expect(new Set(voice.events.map((event) => event.id)).size).toBe(5);
    expect(firstListener).toHaveBeenCalledTimes(firstListenerCalls);
    expect(activeListener).toHaveBeenCalled();
    unsubscribeActive();
    session.dispose();
  });

  it("accepts touch start exactly once and ignores duplicate start signals", () => {
    const { session } = setup();
    makeReady(session);
    expect(session.start("TOUCH", 400)).toBe(true);
    expect(session.start("TOUCH", 401)).toBe(false);
    expect(session.start("VOICE", 402)).toBe(false);
    expect(session.getSnapshot()).toMatchObject({ phase: "BREWING", startSource: "TOUCH" });
    expect(session.getSnapshot().runtime.guidanceEvents.filter((event) => event.moment === "step_start")).toHaveLength(1);
  });

  it("accepts voice start through the same idempotent trigger boundary", () => {
    const { session } = setup();
    makeReady(session);
    expect(session.start("VOICE", 400)).toBe(true);
    expect(session.start("VOICE", 401)).toBe(false);
    expect(session.getSnapshot().startSource).toBe("VOICE");
  });

  it("updates visible guidance, speaks each event once, progresses stages, and completes", () => {
    const { session, voice, completedStages, onCompleted } = setup();
    makeReady(session);
    session.start("TOUCH", 400);
    expect(session.getSnapshot().currentGuidance?.message).toBe("開始悶蒸。");
    expect(voice.events.map((event) => event.message)).toEqual(["開始悶蒸。"]);

    session.tick(900);
    session.tick(900);
    expect(session.getSnapshot().currentGuidance?.message).toBe("確認咖啡粉都已浸濕。");
    expect(voice.events.filter((event) => event.detailId === "detail")).toHaveLength(1);

    const secondStage = session.tick(1_400);
    expect(secondStage.runtime.currentStageIndex).toBe(1);
    expect(secondStage.currentGuidance?.message).toBe("開始主注水。");
    expect(completedStages).toEqual([0]);

    const completed = session.tick(2_400);
    expect(completed.phase).toBe("COMPLETED");
    expect(completed.runtime.stages.every((stage) => stage.completed)).toBe(true);
    expect(completedStages).toEqual([0, 1]);
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(new Set(voice.events.map((event) => event.id)).size).toBe(voice.events.length);
  });

  it("restart returns to valid positioning state and cleans current speech", () => {
    const { session, voice } = setup();
    makeReady(session);
    session.start("TOUCH", 400);
    const restarted = session.restart(500);
    expect(restarted).toMatchObject({ phase: "POSITIONING", startSource: null, currentGuidance: null });
    expect(restarted.runtime.runNumber).toBe(2);
    expect(voice.cancelCount).toBe(1);
  });

  it("disposes its speech subscription and voice resource", () => {
    const { session, voice } = setup();
    session.dispose();
    expect(voice.disposed).toBe(true);
  });
});

describe("GuidedBrewResourceScope", () => {
  it("cleans camera, sampler, recognition, and speech resources once when leaving", () => {
    const cleanupOrder: string[] = [];
    const scope = new GuidedBrewResourceScope();
    scope.add(() => cleanupOrder.push("camera"));
    scope.add(() => cleanupOrder.push("sampler"));
    scope.add(() => cleanupOrder.push("recognition"));
    scope.add(() => cleanupOrder.push("speech"));
    scope.dispose();
    scope.dispose();
    expect(cleanupOrder).toEqual(["speech", "recognition", "sampler", "camera"]);
  });
});
