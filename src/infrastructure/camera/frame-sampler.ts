export interface VideoFrameSample {
  timestampMs: number;
  width: number;
  height: number;
  imageData: ImageData;
}

export type FrameSamplerState = "idle" | "running" | "stopped" | "error";

export type FrameSamplerErrorCode =
  | "video_not_ready"
  | "canvas_unavailable"
  | "frame_read_failed";

export interface FrameSamplerSnapshot {
  state: FrameSamplerState;
  targetFps: number;
  sampledFrameCount: number;
  lastSampleTimestampMs?: number;
  lastFrameWidth?: number;
  lastFrameHeight?: number;
  droppedFrameCount: number;
  errorCode?: FrameSamplerErrorCode;
}

export interface FrameSamplerOptions {
  targetFps?: number;
}

/** Ephemeral frame data; listeners must treat the ImageData as read-only. */
export type FrameSampleListener = (sample: Readonly<VideoFrameSample>) => void;

const DEFAULT_FPS = 10;
const MIN_FPS = 1;
const MAX_FPS = 30;

function safeFps(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_FPS;
  return Math.min(MAX_FPS, Math.max(MIN_FPS, value));
}

export class FrameSampler {
  private readonly video: HTMLVideoElement;
  private readonly intervalMs: number;
  private readonly listeners = new Set<FrameSampleListener>();
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private nextSampleTimestampMs: number | null = null;
  private snapshot: FrameSamplerSnapshot;

  constructor(video: HTMLVideoElement, options: FrameSamplerOptions = {}) {
    this.video = video;
    const targetFps = safeFps(options.targetFps);
    this.intervalMs = 1000 / targetFps;
    this.snapshot = {
      state: "idle",
      targetFps,
      sampledFrameCount: 0,
      droppedFrameCount: 0,
    };
  }

  start() {
    if (this.snapshot.state === "running") return;
    if (typeof document === "undefined" || typeof requestAnimationFrame !== "function") {
      this.snapshot = { ...this.snapshot, state: "error", errorCode: "canvas_unavailable" };
      return;
    }

    this.snapshot = { ...this.snapshot, state: "running", errorCode: undefined };
    this.nextSampleTimestampMs = null;
    this.schedule();
  }

  stop() {
    if (this.animationFrameId !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.animationFrameId = null;
    this.nextSampleTimestampMs = null;
    this.snapshot = { ...this.snapshot, state: "stopped", errorCode: undefined };
  }

  subscribe(listener: FrameSampleListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot() {
    return { ...this.snapshot };
  }

  private schedule() {
    this.animationFrameId = requestAnimationFrame((timestampMs) => this.onAnimationFrame(timestampMs));
  }

  private onAnimationFrame(timestampMs: number) {
    this.animationFrameId = null;
    if (this.snapshot.state !== "running") return;

    if (this.nextSampleTimestampMs === null) {
      this.nextSampleTimestampMs = timestampMs + this.intervalMs;
    } else if (timestampMs >= this.nextSampleTimestampMs) {
      this.nextSampleTimestampMs = timestampMs + this.intervalMs;
      this.sample(timestampMs);
    }

    if (this.snapshot.state === "running") this.schedule();
  }

  private sample(timestampMs: number) {
    const width = this.video.videoWidth;
    const height = this.video.videoHeight;
    if (width <= 0 || height <= 0) {
      this.snapshot = {
        ...this.snapshot,
        droppedFrameCount: this.snapshot.droppedFrameCount + 1,
        errorCode: "video_not_ready",
      };
      return;
    }

    if (!this.ensureCanvas(width, height)) return;

    try {
      this.context!.drawImage(this.video, 0, 0, width, height);
      const imageData = this.context!.getImageData(0, 0, width, height);
      const sample: Readonly<VideoFrameSample> = { timestampMs, width, height, imageData };
      this.snapshot = {
        ...this.snapshot,
        sampledFrameCount: this.snapshot.sampledFrameCount + 1,
        lastSampleTimestampMs: timestampMs,
        lastFrameWidth: width,
        lastFrameHeight: height,
        errorCode: undefined,
      };
      for (const listener of this.listeners) listener(sample);
    } catch {
      this.fail("frame_read_failed");
    }
  }

  private ensureCanvas(width: number, height: number) {
    if (!this.canvas) {
      try {
        this.canvas = document.createElement("canvas");
        this.context = this.canvas.getContext("2d", { willReadFrequently: true })
          ?? this.canvas.getContext("2d");
      } catch {
        this.context = null;
      }
      if (!this.canvas || !this.context) {
        this.fail("canvas_unavailable");
        return false;
      }
    }
    const canvas = this.canvas;
    if (!canvas) {
      this.fail("canvas_unavailable");
      return false;
    }
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    return true;
  }

  private fail(errorCode: FrameSamplerErrorCode) {
    this.snapshot = {
      ...this.snapshot,
      state: "error",
      droppedFrameCount: this.snapshot.droppedFrameCount + 1,
      errorCode,
    };
  }
}
