export interface ScreenLock {
  readonly released: boolean;
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
}
export interface ScreenWakeLockPort { request(): Promise<ScreenLock>; }
export type ScreenWakeLockState = "idle" | "requesting" | "held" | "unsupported" | "denied" | "released";

export class ScreenWakeLockService {
  private generation = 0;
  private sentinel: ScreenLock | null = null;
  private state: ScreenWakeLockState = "idle";
  private listeners = new Set<(state: ScreenWakeLockState) => void>();
  constructor(private readonly port?: ScreenWakeLockPort | null) {}
  subscribe(listener: (state: ScreenWakeLockState) => void) {
    this.listeners.add(listener); listener(this.state);
    return () => { this.listeners.delete(listener); };
  }
  private publish(state: ScreenWakeLockState) { this.state = state; for (const listener of this.listeners) listener(state); }
  async request(): Promise<void> {
    if (this.state === "requesting" || (this.sentinel && !this.sentinel.released)) return;
    const generation = ++this.generation;
    try {
      const port = this.port === undefined
        ? typeof navigator !== "undefined" && navigator.wakeLock ? { request: () => navigator.wakeLock.request("screen") } : null
        : this.port;
      if (!port) { this.publish("unsupported"); return; }
      this.publish("requesting");
      const sentinel = await port.request();
      if (generation !== this.generation) { await sentinel.release(); return; }
      this.sentinel = sentinel;
      sentinel.addEventListener("release", () => {
        if (generation !== this.generation) return;
        this.sentinel = null; this.publish("released");
      });
      this.publish(sentinel.released ? "released" : "held");
    } catch { if (generation === this.generation) this.publish("denied"); }
  }
  stop() {
    this.generation += 1;
    const sentinel = this.sentinel; this.sentinel = null;
    if (sentinel && !sentinel.released) void sentinel.release().catch(() => {});
    this.publish("idle");
  }
}
