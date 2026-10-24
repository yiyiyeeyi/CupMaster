import {
  CameraCaptureError,
  type CameraCaptureErrorCode,
  type CameraCaptureSnapshot,
  type CameraCaptureState,
  type StartCameraOptions,
} from "./camera-capture-types";

type CameraCaptureListener = (snapshot: CameraCaptureSnapshot) => void;

const INITIAL_SNAPSHOT: CameraCaptureSnapshot = { state: "idle", hasStream: false };

const DEFAULT_OPTIONS: Required<StartCameraOptions> = {
  preferredFacingMode: "environment",
  idealWidth: 1280,
  idealHeight: 720,
  idealFrameRate: 30,
};

function safeError(error: unknown): { state: CameraCaptureState; errorCode: CameraCaptureErrorCode } {
  const name = typeof error === "object" && error !== null && "name" in error && typeof error.name === "string"
    ? error.name
    : "";

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return { state: "permission_denied", errorCode: "camera_permission_denied" };
    case "NotFoundError":
    case "DevicesNotFoundError":
      return { state: "unavailable", errorCode: "camera_not_found" };
    case "NotReadableError":
    case "TrackStartError":
      return { state: "unavailable", errorCode: "camera_in_use" };
    case "OverconstrainedError":
      return { state: "unavailable", errorCode: "camera_constraints_failed" };
    default:
      return { state: "error", errorCode: "camera_start_failed" };
  }
}

export class CameraCaptureService {
  private requestGeneration = 0;
  private stream: MediaStream | null = null;
  private snapshot: CameraCaptureSnapshot = { ...INITIAL_SNAPSHOT };
  private readonly listeners = new Set<CameraCaptureListener>();

  async start(options: StartCameraOptions = {}) {
    this.stop();
    const generation = this.requestGeneration;
    this.update({ state: "requesting", hasStream: false });

    if (typeof navigator === "undefined"
      || !navigator.mediaDevices
      || typeof navigator.mediaDevices.getUserMedia !== "function") {
      return this.update({ state: "unsupported", hasStream: false, errorCode: "camera_not_supported" });
    }

    const resolved = { ...DEFAULT_OPTIONS, ...options };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: resolved.preferredFacingMode },
          width: { ideal: resolved.idealWidth },
          height: { ideal: resolved.idealHeight },
          frameRate: { ideal: resolved.idealFrameRate },
        },
      });
      if (generation !== this.requestGeneration) {
        for (const track of stream.getTracks()) track.stop();
        return this.getSnapshot();
      }
      this.stream = stream;
      const settings = stream.getVideoTracks()[0]?.getSettings();
      return this.update({
        state: "ready",
        hasStream: true,
        ...(settings?.width !== undefined && { width: settings.width }),
        ...(settings?.height !== undefined && { height: settings.height }),
        ...(settings?.deviceId && { deviceId: settings.deviceId }),
      });
    } catch (error) {
      if (generation !== this.requestGeneration) return this.getSnapshot();
      this.stream = null;
      return this.update({ ...safeError(error), hasStream: false });
    }
  }

  async attachToVideo(video: HTMLVideoElement) {
    if (!this.stream) throw new CameraCaptureError("camera_start_failed");
    video.srcObject = this.stream;
    video.playsInline = true;
    video.muted = true;
    try {
      await video.play();
    } catch {
      throw new CameraCaptureError("camera_start_failed");
    }
  }

  stop() {
    this.requestGeneration += 1;
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    return this.update({ ...INITIAL_SNAPSHOT });
  }

  getStream() {
    return this.stream;
  }

  getSnapshot() {
    return { ...this.snapshot };
  }

  subscribe(listener: CameraCaptureListener) {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  private update(snapshot: CameraCaptureSnapshot) {
    this.snapshot = { ...snapshot };
    const published = this.getSnapshot();
    for (const listener of this.listeners) listener({ ...published });
    return published;
  }
}
