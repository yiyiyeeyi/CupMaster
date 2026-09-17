import { afterEach, describe, expect, it, vi } from "vitest";
import { FrameSampler } from "./frame-sampler";

class ManualAnimationFrames {
  private nextId = 1;
  private readonly callbacks = new Map<number, FrameRequestCallback>();
  readonly request = vi.fn((callback: FrameRequestCallback) => {
    const id = this.nextId;
    this.nextId += 1;
    this.callbacks.set(id, callback);
    return id;
  });
  readonly cancel = vi.fn((id: number) => this.callbacks.delete(id));

  fire(timestampMs: number) {
    const next = this.callbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
    if (!next) return;
    this.callbacks.delete(next[0]);
    next[1](timestampMs);
  }

  get pendingCount() {
    return this.callbacks.size;
  }
}

function imageData(width = 640, height = 480) {
  const value = Object.create(null) as ImageData;
  Object.defineProperties(value, {
    width: { value: width, configurable: true },
    height: { value: height, configurable: true },
  });
  return value;
}

function video(width = 640, height = 480) {
  const element = Object.create(null) as HTMLVideoElement;
  setVideoSize(element, width, height);
  return element;
}

function setVideoSize(element: HTMLVideoElement, width: number, height: number) {
  Object.defineProperties(element, {
    videoWidth: { value: width, configurable: true },
    videoHeight: { value: height, configurable: true },
  });
}

function canvasFixture(data = imageData()) {
  const context = Object.create(null) as CanvasRenderingContext2D;
  context.drawImage = vi.fn();
  context.getImageData = vi.fn(() => data);
  const canvas = Object.create(null) as HTMLCanvasElement;
  canvas.width = 0;
  canvas.height = 0;
  Object.defineProperty(canvas, "getContext", { value: vi.fn(() => context), writable: true });
  return { canvas, context, data };
}

function installBrowser(fixture = canvasFixture()) {
  const scheduler = new ManualAnimationFrames();
  const createElement = vi.fn(() => fixture.canvas);
  vi.stubGlobal("requestAnimationFrame", scheduler.request);
  vi.stubGlobal("cancelAnimationFrame", scheduler.cancel);
  vi.stubGlobal("document", { createElement });
  return { scheduler, createElement, ...fixture };
}

function reachFirstSample(scheduler: ManualAnimationFrames, firstTimestamp = 0, sampleTimestamp = 100) {
  scheduler.fire(firstTimestamp);
  scheduler.fire(sampleTimestamp);
}

afterEach(() => vi.unstubAllGlobals());

describe("FrameSampler initialization", () => {
  it("defaults to 10 FPS", () => expect(new FrameSampler(video()).getSnapshot().targetFps).toBe(10));
  it("accepts a custom FPS", () => expect(new FrameSampler(video(), { targetFps: 15 }).getSnapshot().targetFps).toBe(15));
  it("clamps low FPS to 1", () => expect(new FrameSampler(video(), { targetFps: 0 }).getSnapshot().targetFps).toBe(1));
  it("clamps high FPS to 30", () => expect(new FrameSampler(video(), { targetFps: 60 }).getSnapshot().targetFps).toBe(30));
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])("uses 10 FPS for non-finite %s", (targetFps) => {
    expect(new FrameSampler(video(), { targetFps }).getSnapshot().targetFps).toBe(10);
  });

  it("returns an isolated snapshot", () => {
    const sampler = new FrameSampler(video());
    const snapshot = sampler.getSnapshot();
    snapshot.state = "error";
    expect(sampler.getSnapshot().state).toBe("idle");
  });
});

describe("FrameSampler lifecycle", () => {
  it("enters running state and schedules a RAF", () => {
    const { scheduler } = installBrowser();
    const sampler = new FrameSampler(video());
    sampler.start();
    expect(sampler.getSnapshot().state).toBe("running");
    expect(scheduler.pendingCount).toBe(1);
  });

  it("treats repeated start as a no-op", () => {
    const { scheduler } = installBrowser();
    const sampler = new FrameSampler(video());
    sampler.start();
    sampler.start();
    expect(scheduler.request).toHaveBeenCalledOnce();
  });

  it("cancels RAF when stopped", () => {
    const { scheduler } = installBrowser();
    const sampler = new FrameSampler(video());
    sampler.start();
    sampler.stop();
    expect(scheduler.cancel).toHaveBeenCalledOnce();
    expect(sampler.getSnapshot().state).toBe("stopped");
  });

  it("does not emit after stop", () => {
    const { scheduler } = installBrowser();
    const listener = vi.fn();
    const sampler = new FrameSampler(video());
    sampler.subscribe(listener);
    sampler.start();
    sampler.stop();
    scheduler.fire(1_000);
    expect(listener).not.toHaveBeenCalled();
  });

  it("resumes sampling after restart without removing subscribers", () => {
    const { scheduler } = installBrowser();
    const listener = vi.fn();
    const sampler = new FrameSampler(video());
    sampler.subscribe(listener);
    sampler.start();
    reachFirstSample(scheduler);
    sampler.stop();
    sampler.start();
    reachFirstSample(scheduler, 200, 300);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("FrameSampler timing and readiness", () => {
  it("does not sample before its interval", () => {
    const { scheduler, context } = installBrowser();
    const sampler = new FrameSampler(video());
    sampler.start();
    scheduler.fire(0);
    scheduler.fire(99);
    expect(context.drawImage).not.toHaveBeenCalled();
  });

  it("samples at the configured interval", () => {
    const { scheduler, context } = installBrowser();
    const sampler = new FrameSampler(video());
    sampler.start();
    reachFirstSample(scheduler);
    expect(context.drawImage).toHaveBeenCalledOnce();
  });

  it("does not read pixels on every RAF callback", () => {
    const { scheduler, context } = installBrowser();
    const sampler = new FrameSampler(video());
    sampler.start();
    [0, 16, 32, 48, 64, 80, 96, 100].forEach((timestamp) => scheduler.fire(timestamp));
    expect(context.drawImage).toHaveBeenCalledOnce();
  });

  it.each([[0, 480], [640, 0]])("drops a not-ready %ix%i frame without failing", (width, height) => {
    const { scheduler, context } = installBrowser();
    const sampler = new FrameSampler(video(width, height));
    sampler.start();
    reachFirstSample(scheduler);
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(sampler.getSnapshot()).toMatchObject({ state: "running", droppedFrameCount: 1, errorCode: "video_not_ready" });
  });

  it("begins sampling when the video later becomes ready", () => {
    const { scheduler, context } = installBrowser();
    const element = video(0, 0);
    const sampler = new FrameSampler(element);
    sampler.start();
    reachFirstSample(scheduler);
    setVideoSize(element, 320, 240);
    scheduler.fire(200);
    expect(context.drawImage).toHaveBeenCalledOnce();
    expect(sampler.getSnapshot().state).toBe("running");
  });
});

describe("FrameSampler canvas and output", () => {
  it("creates its canvas lazily", () => {
    const { scheduler, createElement } = installBrowser();
    const sampler = new FrameSampler(video());
    expect(createElement).not.toHaveBeenCalled();
    sampler.start();
    scheduler.fire(0);
    expect(createElement).not.toHaveBeenCalled();
    scheduler.fire(100);
    expect(createElement).toHaveBeenCalledWith("canvas");
  });

  it("falls back when context options are unsupported", () => {
    const fixture = canvasFixture();
    const getContext = vi.fn().mockReturnValueOnce(null).mockReturnValue(fixture.context);
    Object.defineProperty(fixture.canvas, "getContext", { value: getContext, writable: true });
    const { scheduler } = installBrowser(fixture);
    const listener = vi.fn();
    const sampler = new FrameSampler(video());
    sampler.subscribe(listener);
    sampler.start();
    reachFirstSample(scheduler);
    expect(getContext).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("sizes canvas and reads the full video frame", () => {
    const { scheduler, canvas, context } = installBrowser();
    const element = video(640, 480);
    new FrameSampler(element).start();
    reachFirstSample(scheduler);
    expect(canvas).toMatchObject({ width: 640, height: 480 });
    expect(context.drawImage).toHaveBeenCalledWith(element, 0, 0, 640, 480);
    expect(context.getImageData).toHaveBeenCalledWith(0, 0, 640, 480);
  });

  it("emits RAF timestamp, dimensions, and ImageData", () => {
    const fixture = canvasFixture(imageData(800, 600));
    const { scheduler } = installBrowser(fixture);
    const listener = vi.fn();
    const sampler = new FrameSampler(video(800, 600));
    sampler.subscribe(listener);
    sampler.start();
    reachFirstSample(scheduler, 500, 600);
    expect(listener).toHaveBeenCalledWith({ timestampMs: 600, width: 800, height: 600, imageData: fixture.data });
    expect(sampler.getSnapshot()).toMatchObject({ sampledFrameCount: 1, lastSampleTimestampMs: 600, lastFrameWidth: 800, lastFrameHeight: 600 });
  });

  it("resizes its existing canvas after a resolution change", () => {
    const { scheduler, canvas, createElement } = installBrowser();
    const element = video(640, 480);
    const sampler = new FrameSampler(element);
    sampler.start();
    reachFirstSample(scheduler);
    setVideoSize(element, 1280, 720);
    scheduler.fire(200);
    expect(canvas).toMatchObject({ width: 1280, height: 720 });
    expect(createElement).toHaveBeenCalledOnce();
  });
});

describe("FrameSampler subscribers and memory boundary", () => {
  it("delivers the same ephemeral frame to multiple subscribers", () => {
    const { scheduler } = installBrowser();
    const first = vi.fn();
    const second = vi.fn();
    const sampler = new FrameSampler(video());
    sampler.subscribe(first);
    sampler.subscribe(second);
    sampler.start();
    reachFirstSample(scheduler);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledWith(first.mock.calls[0][0]);
  });

  it("stops delivery after unsubscribe", () => {
    const { scheduler } = installBrowser();
    const listener = vi.fn();
    const sampler = new FrameSampler(video());
    const unsubscribe = sampler.subscribe(listener);
    unsubscribe();
    sampler.start();
    reachFirstSample(scheduler);
    expect(listener).not.toHaveBeenCalled();
  });

  it("retains metadata but no ImageData history in its snapshot", () => {
    const { scheduler } = installBrowser();
    const sampler = new FrameSampler(video());
    sampler.start();
    reachFirstSample(scheduler);
    expect(sampler.getSnapshot()).not.toHaveProperty("imageData");
    expect(sampler.getSnapshot().sampledFrameCount).toBe(1);
  });
});

describe("FrameSampler failures and SSR safety", () => {
  it("maps a missing canvas context to a safe terminal error", () => {
    const fixture = canvasFixture();
    fixture.canvas.getContext = vi.fn(() => null);
    const { scheduler } = installBrowser(fixture);
    const sampler = new FrameSampler(video());
    sampler.start();
    reachFirstSample(scheduler);
    expect(sampler.getSnapshot()).toMatchObject({ state: "error", errorCode: "canvas_unavailable", droppedFrameCount: 1 });
  });

  it.each(["draw", "read"])("maps a canvas %s exception without exposing it", (failure) => {
    const fixture = canvasFixture();
    if (failure === "draw") fixture.context.drawImage = vi.fn(() => { throw new Error("raw draw detail"); });
    else fixture.context.getImageData = vi.fn(() => { throw new Error("raw read detail"); });
    const { scheduler } = installBrowser(fixture);
    const sampler = new FrameSampler(video());
    sampler.start();
    reachFirstSample(scheduler);
    expect(sampler.getSnapshot()).toEqual(expect.objectContaining({ state: "error", errorCode: "frame_read_failed" }));
    expect(JSON.stringify(sampler.getSnapshot())).not.toContain("raw");
  });

  it("is safe to import and construct without browser globals", () => {
    expect(() => new FrameSampler(video())).not.toThrow();
  });

  it("fails safely when started without a browser environment", () => {
    const sampler = new FrameSampler(video());
    sampler.start();
    expect(sampler.getSnapshot()).toMatchObject({ state: "error", errorCode: "canvas_unavailable" });
  });
});
