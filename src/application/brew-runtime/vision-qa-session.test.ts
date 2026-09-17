import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { CameraCaptureSnapshot, FrameAnalysisSnapshot, FrameSamplerSnapshot, VideoFrameSample } from "@/infrastructure/camera";
import type { NormalizedRect } from "@/domain/brew-runtime";
import {
  VISION_QA_EVENT_LIMIT,
  VISION_QA_HISTORY_LIMIT,
  VisionQaSession,
  createVisionQaController,
} from "./vision-qa-session";

class FakeCamera {
  snapshot: CameraCaptureSnapshot = { state: "idle", hasStream: false };
  listener: ((snapshot: CameraCaptureSnapshot) => void) | null = null;
  readonly unsubscribe = vi.fn();
  readonly start = vi.fn(async () => {
    this.snapshot = { state: "ready", hasStream: true, width: 1280, height: 720 };
    this.listener?.(this.snapshot);
    return this.snapshot;
  });
  readonly attachToVideo = vi.fn(async () => undefined);
  readonly stop = vi.fn(() => {
    this.snapshot = { state: "idle", hasStream: false };
    this.listener?.(this.snapshot);
    return this.snapshot;
  });
  getSnapshot() { return { ...this.snapshot }; }
  subscribe(listener: (snapshot: CameraCaptureSnapshot) => void) {
    this.listener = listener;
    listener(this.getSnapshot());
    return this.unsubscribe;
  }
}

class FakeSampler {
  snapshot: FrameSamplerSnapshot = { state: "idle", targetFps: 10, sampledFrameCount: 0, droppedFrameCount: 0 };
  listener: ((sample: Readonly<VideoFrameSample>) => void) | null = null;
  readonly unsubscribe = vi.fn();
  readonly start = vi.fn(() => { this.snapshot = { ...this.snapshot, state: "running" }; });
  readonly stop = vi.fn(() => { this.snapshot = { ...this.snapshot, state: "stopped" }; });
  subscribe(listener: (sample: Readonly<VideoFrameSample>) => void) { this.listener = listener; return this.unsubscribe; }
  getSnapshot() { return { ...this.snapshot }; }
  emit(timestampMs: number) {
    this.snapshot = { ...this.snapshot, sampledFrameCount: this.snapshot.sampledFrameCount + 1, lastSampleTimestampMs: timestampMs };
    this.listener?.(frame(timestampMs));
  }
}

class FakeAnalyzer {
  evidence = 0;
  globalMotion = false;
  lighting = false;
  count = 0;
  roi: NormalizedRect = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };
  readonly analyze = vi.fn((sample: Readonly<VideoFrameSample>) => {
    this.count += 1;
    return { timestampMs: sample.timestampMs, roiMotionScore: this.evidence, pourEvidence: this.evidence, analysisConfidence: 0.9 };
  });
  readonly setRoi = vi.fn((roi: NormalizedRect) => { this.roi = { ...roi }; });
  readonly reset = vi.fn(() => { this.count = 0; });
  getSnapshot(): FrameAnalysisSnapshot {
    return {
      analyzedFrameCount: this.count,
      lastMotionScore: this.count ? this.evidence : undefined,
      lastPourEvidence: this.count ? this.evidence : undefined,
      lastConfidence: this.count ? 0.9 : undefined,
      suspiciousGlobalMotion: this.globalMotion,
      suspectedLightingChange: this.lighting,
      analysisWidth: 160,
      analysisHeight: 120,
    };
  }
}

function frame(timestampMs: number): VideoFrameSample {
  const imageData = Object.create(null) as ImageData;
  Object.defineProperty(imageData, "data", { value: new Uint8ClampedArray(4) });
  return { timestampMs, width: 1, height: 1, imageData };
}

function fakeVideo() {
  const video = Object.create(null) as HTMLVideoElement;
  video.srcObject = null;
  return video;
}

function setup() {
  const camera = new FakeCamera();
  const sampler = new FakeSampler();
  const analyzer = new FakeAnalyzer();
  let now = 100;
  const controllerUnsubscribe = vi.fn();
  const createController = vi.fn(() => {
    const controller = createVisionQaController();
    const subscribe = controller.subscribe.bind(controller);
    vi.spyOn(controller, "subscribe").mockImplementation((listener) => {
      const unsubscribe = subscribe(listener);
      return () => {
        const removed = unsubscribe();
        controllerUnsubscribe();
        return removed;
      };
    });
    return controller;
  });
  const createSampler = vi.fn(() => sampler);
  const session = new VisionQaSession({ camera, analyzer, createSampler, createController, now: () => now++ });
  return { session, camera, sampler, analyzer, createController, createSampler, controllerUnsubscribe, video: fakeVideo() };
}

async function readySession() {
  const fixture = setup();
  await fixture.session.startCamera(fixture.video);
  fixture.session.startBrew();
  return fixture;
}

function emitEvidence(sampler: FakeSampler, analyzer: FakeAnalyzer, evidence: number, count: number, start = 1_000) {
  analyzer.evidence = evidence;
  for (let index = 0; index < count; index += 1) sampler.emit(start + index);
}

describe("VisionQaSession wiring", () => {
  it("starts the camera service", async () => { const { session, camera, video } = setup(); await session.startCamera(video); expect(camera.start).toHaveBeenCalledOnce(); });
  it("attaches the ready camera to the supplied video", async () => { const { session, camera, video } = setup(); await session.startCamera(video); expect(camera.attachToVideo).toHaveBeenCalledWith(video); });
  it("creates and starts a sampler after camera readiness", async () => { const { session, sampler, createSampler, video } = setup(); await session.startCamera(video); expect(createSampler).toHaveBeenCalledWith(video); expect(sampler.start).toHaveBeenCalledOnce(); });
  it("passes sampled frames into the analyzer", async () => { const { sampler, analyzer } = await readySession(); sampler.emit(500); expect(analyzer.analyze).toHaveBeenCalledOnce(); });
  it("passes analyzer output into runtime detection", async () => { const { session, sampler, analyzer } = await readySession(); emitEvidence(sampler, analyzer, 0.8, 4); expect(session.getSnapshot().runtime.pourState).toBe("pouring"); });
});

describe("VisionQaSession runtime", () => {
  it("starts stage one from a synthetic live sequence", async () => { const { session, sampler, analyzer } = await readySession(); emitEvidence(sampler, analyzer, 0.8, 4); expect(session.getSnapshot().runtime.currentStageIndex).toBe(0); });
  it("stop evidence completes the current stage", async () => { const { session, sampler, analyzer } = await readySession(); emitEvidence(sampler, analyzer, 0.8, 4); emitEvidence(sampler, analyzer, 0.2, 6, 2_000); expect(session.getSnapshot().runtime.stages[0].completed).toBe(true); });
  it("completes the fixed three-stage recipe", async () => { const { session, sampler, analyzer } = await readySession(); for (let stage = 0; stage < 3; stage += 1) { emitEvidence(sampler, analyzer, 0.8, 4, stage * 100 + 1_000); emitEvidence(sampler, analyzer, 0.2, 6, stage * 100 + 1_010); } expect(session.getSnapshot().runtime.state).toBe("completed"); });
  it("logs automatic pour and stage transitions", async () => { const { session, sampler, analyzer } = await readySession(); emitEvidence(sampler, analyzer, 0.8, 4); emitEvidence(sampler, analyzer, 0.2, 6); expect(session.getSnapshot().events.map((event) => event.label)).toEqual(expect.arrayContaining(["POUR_STARTED", "STAGE 1 POURING", "POUR_STOPPED", "STAGE 1 COMPLETED"])); });
});

describe("VisionQaSession controls", () => {
  it("updates normalized ROI through the analyzer", () => { const { session, analyzer } = setup(); const roi = { x: 0.1, y: 0.2, width: 0.7, height: 0.5 }; session.setRoi(roi); expect(analyzer.setRoi).toHaveBeenCalledWith(roi); expect(session.getSnapshot().roi).toEqual(roi); });
  it("records that ROI changes reset the analyzer baseline", () => { const { session } = setup(); session.setRoi({ x: 0, y: 0, width: 1, height: 1 }); expect(session.getSnapshot().events.at(-1)?.label).toContain("BASELINE RESET"); });
  it("supports manual pour start", async () => { const { session } = await readySession(); session.manualPourStart(); expect(session.getSnapshot().runtime).toMatchObject({ pourState: "pouring", manualOverrideUsed: true }); });
  it("supports manual pour stop", async () => { const { session } = await readySession(); session.manualPourStart(); session.manualPourStop(); expect(session.getSnapshot().runtime.stages[0]).toMatchObject({ completed: true, detectionMethod: "manual" }); });
  it("resets detection counters", async () => { const { session, sampler, analyzer } = await readySession(); emitEvidence(sampler, analyzer, 0.8, 2); session.resetDetection(); expect(session.getSnapshot().runtime.detection).toMatchObject({ consecutivePositiveFrames: 0, consecutiveNegativeFrames: 0 }); });
  it("resets the session without touching persistence", async () => { const { session, createController } = await readySession(); session.manualPourStart(); session.resetSession(); expect(createController).toHaveBeenCalledTimes(2); expect(session.getSnapshot()).toMatchObject({ brewStarted: false, runtime: { state: "idle" }, history: [], events: [] }); });
  it("stops camera, sampler, analyzer, and preview", async () => { const { session, camera, sampler, analyzer, video } = await readySession(); video.srcObject = Object.create(null) as MediaStream; session.stopCamera(); expect(sampler.stop).toHaveBeenCalled(); expect(camera.stop).toHaveBeenCalled(); expect(analyzer.reset).toHaveBeenCalled(); expect(video.srcObject).toBeNull(); });
});

describe("VisionQaSession diagnostics and bounded memory", () => {
  it("exposes latest numeric evidence", async () => { const { session, sampler, analyzer } = await readySession(); emitEvidence(sampler, analyzer, 0.72, 1); expect(session.getSnapshot().analysis.lastPourEvidence).toBe(0.72); });
  it("exposes confirmed state and detector counters", async () => { const { session, sampler, analyzer } = await readySession(); emitEvidence(sampler, analyzer, 0.8, 2); expect(session.getSnapshot().runtime).toMatchObject({ pourState: "not_pouring", detection: { consecutivePositiveFrames: 2 } }); });
  it("exposes current stage diagnostics", async () => { const { session } = await readySession(); session.manualPourStart(); expect(session.getSnapshot().runtime.stages[0].name).toBe("Bloom"); });
  it("caps numeric history", async () => { const { session, sampler } = await readySession(); for (let index = 0; index < VISION_QA_HISTORY_LIMIT + 5; index += 1) sampler.emit(index); expect(session.getSnapshot().history).toHaveLength(VISION_QA_HISTORY_LIMIT); });
  it("stores no ImageData in numeric history", async () => { const { session, sampler } = await readySession(); sampler.emit(1); expect(session.getSnapshot().history[0]).not.toHaveProperty("imageData"); });
  it("caps the in-memory event log", () => { const { session } = setup(); for (let index = 0; index < VISION_QA_EVENT_LIMIT + 5; index += 1) session.setRoi({ x: index / 100, y: 0, width: 0.5, height: 0.5 }); expect(session.getSnapshot().events).toHaveLength(VISION_QA_EVENT_LIMIT); });
  it("exports a device-free numeric summary", async () => { const { session, sampler, analyzer } = await readySession(); analyzer.globalMotion = true; analyzer.lighting = true; emitEvidence(sampler, analyzer, 0.7, 1, 10); emitEvidence(sampler, analyzer, 0.2, 1, 20); const summary = session.getSummary(); expect(summary).toMatchObject({ minEvidence: 0.2, maxEvidence: 0.7, durationMs: 10, globalMotionEvents: 2, lightingEvents: 2 }); expect(JSON.stringify(summary)).not.toMatch(/device|imageData|user|sessionId/i); });
});

describe("VisionQaSession production and cleanup contracts", () => {
  it("guards the route in non-development builds", () => { const source = readFileSync(join(process.cwd(), "src/app/dev/brew-vision/page.tsx"), "utf8"); expect(source).toContain('process.env.NODE_ENV !== "development"'); expect(source).toContain("Vision QA unavailable in production."); });
  it("uses a narrow mobile layout without fixed pixel width", () => { const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8"); expect(css).toContain("@media(max-width:24.5rem)"); expect(css).toContain(".vision-qa-page{display:grid"); expect(css).toContain("overflow-x:hidden"); });
  it("dispose stops sampler and camera", async () => { const { session, sampler, camera } = await readySession(); session.dispose(); expect(sampler.stop).toHaveBeenCalled(); expect(camera.stop).toHaveBeenCalled(); });
  it("dispose unsubscribes sampler, camera, and controller listeners", async () => { const { session, sampler, camera, controllerUnsubscribe } = await readySession(); session.dispose(); expect(sampler.unsubscribe).toHaveBeenCalled(); expect(camera.unsubscribe).toHaveBeenCalled(); expect(controllerUnsubscribe).toHaveBeenCalled(); });
  it("session subscribers can unsubscribe", () => { const { session } = setup(); const listener = vi.fn(); const unsubscribe = session.subscribe(listener); unsubscribe(); session.setRoi({ x: 0, y: 0, width: 1, height: 1 }); expect(listener).toHaveBeenCalledOnce(); });
});
