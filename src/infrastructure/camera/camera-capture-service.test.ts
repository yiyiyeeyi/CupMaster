import { afterEach, describe, expect, it, vi } from "vitest";
import { CameraCaptureError, CameraCaptureService } from "./index";

interface FakeTrackOptions {
  settings?: MediaTrackSettings;
}

function fakeTrack(options: FakeTrackOptions = {}) {
  const track = Object.create(null) as MediaStreamTrack;
  track.stop = vi.fn();
  track.getSettings = vi.fn(() => options.settings ?? {});
  return track;
}

function fakeStream(tracks = [fakeTrack()]) {
  const stream = Object.create(null) as MediaStream;
  stream.getTracks = vi.fn(() => tracks);
  stream.getVideoTracks = vi.fn(() => tracks);
  return stream;
}

function installMediaDevices(getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>) {
  const mock = vi.fn(getUserMedia);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: mock } });
  return mock;
}

function fakeVideo(play = vi.fn().mockResolvedValue(undefined)) {
  const video = Object.create(null) as HTMLVideoElement;
  video.srcObject = null;
  video.playsInline = false;
  video.muted = false;
  video.play = play;
  return video;
}

function namedError(name: string) {
  const error = new Error("private browser detail");
  error.name = name;
  return error;
}

afterEach(() => vi.unstubAllGlobals());

describe("CameraCaptureService capability and start", () => {
  it("starts with no stream", () => {
    const service = new CameraCaptureService();
    expect(service.getStream()).toBeNull();
    expect(service.getSnapshot()).toEqual({ state: "idle", hasStream: false });
  });

  it("is safe to construct and reports unsupported without navigator", async () => {
    vi.stubGlobal("navigator", undefined);
    const service = new CameraCaptureService();
    await expect(service.start()).resolves.toEqual({ state: "unsupported", hasStream: false, errorCode: "camera_not_supported" });
  });

  it("reports unsupported when mediaDevices is missing", async () => {
    vi.stubGlobal("navigator", {});
    await expect(new CameraCaptureService().start()).resolves.toMatchObject({ state: "unsupported" });
  });

  it("reports unsupported when getUserMedia is missing", async () => {
    vi.stubGlobal("navigator", { mediaDevices: {} });
    await expect(new CameraCaptureService().start()).resolves.toMatchObject({ state: "unsupported" });
  });

  it("publishes requesting before ready", async () => {
    installMediaDevices(async () => fakeStream());
    const service = new CameraCaptureService();
    const states: string[] = [];
    service.subscribe((snapshot) => states.push(snapshot.state));
    await service.start();
    expect(states).toEqual(["idle", "idle", "requesting", "ready"]);
  });

  it("uses safe rear-camera defaults with audio disabled", async () => {
    const getUserMedia = installMediaDevices(async () => fakeStream());
    await new CameraCaptureService().start();
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      },
    });
    expect(JSON.stringify(getUserMedia.mock.calls[0])).not.toContain("exact");
  });

  it("honors custom ideal constraints", async () => {
    const getUserMedia = installMediaDevices(async () => fakeStream());
    await new CameraCaptureService().start({ preferredFacingMode: "user", idealWidth: 640, idealHeight: 480, idealFrameRate: 24 });
    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({
      video: expect.objectContaining({ facingMode: { ideal: "user" }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } }),
    }));
  });

  it("reads safe video-track settings into the snapshot", async () => {
    const stream = fakeStream([fakeTrack({ settings: { width: 1920, height: 1080, deviceId: "device-1" } })]);
    installMediaDevices(async () => stream);
    const service = new CameraCaptureService();
    await expect(service.start()).resolves.toEqual({ state: "ready", hasStream: true, width: 1920, height: 1080, deviceId: "device-1" });
    expect(service.getStream()).toBe(stream);
  });

  it("remains ready when a stream has no video-track settings", async () => {
    installMediaDevices(async () => fakeStream([]));
    await expect(new CameraCaptureService().start()).resolves.toEqual({ state: "ready", hasStream: true });
  });

  it("reports hasStream only after acquisition succeeds", async () => {
    installMediaDevices(async () => fakeStream());
    const service = new CameraCaptureService();
    expect(service.getSnapshot().hasStream).toBe(false);
    expect((await service.start()).hasStream).toBe(true);
  });
});

describe("CameraCaptureService stream lifecycle", () => {
  it("stops a late permission result after switching away from camera", async () => {
    let grant!: (stream: MediaStream) => void;
    installMediaDevices(() => new Promise<MediaStream>((resolve) => { grant = resolve; }));
    const service = new CameraCaptureService();
    const pending = service.start();
    service.stop();
    const track = fakeTrack();
    grant(fakeStream([track]));
    await expect(pending).resolves.toEqual({ state: "idle", hasStream: false });
    expect(track.stop).toHaveBeenCalledOnce();
    expect(service.getStream()).toBeNull();
  });

  it("does not replace a newer stream with an older permission result", async () => {
    let grantFirst!: (stream: MediaStream) => void;
    const currentStream = fakeStream();
    let calls = 0;
    installMediaDevices(() => ++calls === 1
      ? new Promise<MediaStream>((resolve) => { grantFirst = resolve; })
      : Promise.resolve(currentStream));
    const service = new CameraCaptureService();
    const older = service.start();
    await service.start();
    const oldTrack = fakeTrack();
    grantFirst(fakeStream([oldTrack]));
    await older;
    expect(oldTrack.stop).toHaveBeenCalledOnce();
    expect(service.getStream()).toBe(currentStream);
    expect(service.getSnapshot().state).toBe("ready");
  });

  it("ignores a late rejection after a newer camera request succeeds", async () => {
    let rejectFirst!: (error: Error) => void;
    let calls = 0;
    const currentStream = fakeStream();
    installMediaDevices(() => ++calls === 1
      ? new Promise<MediaStream>((_, reject) => { rejectFirst = reject; })
      : Promise.resolve(currentStream));
    const service = new CameraCaptureService();
    const older = service.start();
    await service.start();
    rejectFirst(namedError("NotAllowedError"));
    await older;
    expect(service.getStream()).toBe(currentStream);
    expect(service.getSnapshot().state).toBe("ready");
  });

  it("stops every track and returns to idle", async () => {
    const tracks = [fakeTrack(), fakeTrack()];
    installMediaDevices(async () => fakeStream(tracks));
    const service = new CameraCaptureService();
    await service.start();
    expect(service.stop()).toEqual({ state: "idle", hasStream: false });
    expect(tracks.every((track) => vi.mocked(track.stop).mock.calls.length === 1)).toBe(true);
    expect(service.getStream()).toBeNull();
  });

  it("stops the previous stream before replacing it", async () => {
    const oldTrack = fakeTrack();
    const oldStream = fakeStream([oldTrack]);
    const newStream = fakeStream();
    const getUserMedia = installMediaDevices(vi.fn().mockResolvedValueOnce(oldStream).mockResolvedValueOnce(newStream));
    const service = new CameraCaptureService();
    await service.start();
    await service.start();
    expect(oldTrack.stop).toHaveBeenCalledOnce();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(service.getStream()).toBe(newStream);
  });

  it("allows duplicate stop calls", () => {
    const service = new CameraCaptureService();
    expect(service.stop()).toEqual({ state: "idle", hasStream: false });
    expect(service.stop()).toEqual({ state: "idle", hasStream: false });
  });

  it("clears acquired device metadata on stop", async () => {
    installMediaDevices(async () => fakeStream([fakeTrack({ settings: { width: 640, height: 480, deviceId: "temporary" } })]));
    const service = new CameraCaptureService();
    await service.start();
    expect(service.stop()).toEqual({ state: "idle", hasStream: false });
  });

  it("publishes the idle snapshot when stopped", async () => {
    installMediaDevices(async () => fakeStream());
    const service = new CameraCaptureService();
    const listener = vi.fn();
    service.subscribe(listener);
    await service.start();
    service.stop();
    expect(listener).toHaveBeenLastCalledWith({ state: "idle", hasStream: false });
  });
});

describe("CameraCaptureService safe error mapping", () => {
  it.each([
    ["NotAllowedError", "permission_denied", "camera_permission_denied"],
    ["SecurityError", "permission_denied", "camera_permission_denied"],
    ["NotFoundError", "unavailable", "camera_not_found"],
    ["DevicesNotFoundError", "unavailable", "camera_not_found"],
    ["NotReadableError", "unavailable", "camera_in_use"],
    ["TrackStartError", "unavailable", "camera_in_use"],
    ["OverconstrainedError", "unavailable", "camera_constraints_failed"],
  ])("maps %s without exposing its message", async (name, state, errorCode) => {
    installMediaDevices(async () => { throw namedError(name); });
    const snapshot = await new CameraCaptureService().start();
    expect(snapshot).toEqual({ state, hasStream: false, errorCode });
    expect(JSON.stringify(snapshot)).not.toContain("private browser detail");
  });

  it("maps unknown failures to a generic safe error", async () => {
    installMediaDevices(async () => { throw new Error("secret raw failure"); });
    await expect(new CameraCaptureService().start()).resolves.toEqual({ state: "error", hasStream: false, errorCode: "camera_start_failed" });
  });
});

describe("CameraCaptureService video attachment", () => {
  it("attaches and configures a video element", async () => {
    const stream = fakeStream();
    installMediaDevices(async () => stream);
    const service = new CameraCaptureService();
    await service.start();
    const video = fakeVideo();
    await service.attachToVideo(video);
    expect(video).toMatchObject({ srcObject: stream, playsInline: true, muted: true });
    expect(video.play).toHaveBeenCalledOnce();
  });

  it("rejects safely when no stream exists", async () => {
    await expect(new CameraCaptureService().attachToVideo({} as HTMLVideoElement)).rejects.toMatchObject({
      name: "CameraCaptureError",
      code: "camera_start_failed",
    });
  });

  it("keeps a ready stream when video playback is blocked", async () => {
    installMediaDevices(async () => fakeStream());
    const service = new CameraCaptureService();
    await service.start();
    const video = fakeVideo(vi.fn().mockRejectedValue(new Error("autoplay")));
    await expect(service.attachToVideo(video)).rejects.toBeInstanceOf(CameraCaptureError);
    expect(service.getSnapshot()).toMatchObject({ state: "ready", hasStream: true });
    expect(service.getStream()).not.toBeNull();
  });
});

describe("CameraCaptureService subscriptions", () => {
  it("returns an isolated snapshot from getSnapshot", () => {
    const service = new CameraCaptureService();
    const snapshot = service.getSnapshot();
    snapshot.state = "error";
    expect(service.getSnapshot().state).toBe("idle");
  });

  it("immediately emits an isolated snapshot", () => {
    const service = new CameraCaptureService();
    let received = {};
    const listener = vi.fn((snapshot) => {
      received = { ...snapshot };
      snapshot.state = "error";
    });
    service.subscribe(listener);
    expect(received).toEqual({ state: "idle", hasStream: false });
    expect(service.getSnapshot()).toEqual({ state: "idle", hasStream: false });
  });

  it("supports multiple subscribers", async () => {
    vi.stubGlobal("navigator", undefined);
    const service = new CameraCaptureService();
    const first = vi.fn();
    const second = vi.fn();
    service.subscribe(first);
    service.subscribe(second);
    await service.start();
    expect(first).toHaveBeenCalledTimes(4);
    expect(second).toHaveBeenCalledTimes(4);
  });

  it("stops notifying after unsubscribe", async () => {
    vi.stubGlobal("navigator", undefined);
    const service = new CameraCaptureService();
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);
    unsubscribe();
    await service.start();
    expect(listener).toHaveBeenCalledOnce();
  });
});
