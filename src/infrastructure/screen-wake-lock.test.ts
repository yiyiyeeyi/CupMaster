import { describe, expect, it, vi } from "vitest";
import { ScreenWakeLockService, type ScreenLock, type ScreenWakeLockState } from "./screen-wake-lock";
function lock() {
  let releaseListener = () => {};
  const value: ScreenLock = { released: false, release: vi.fn(async () => { releaseListener(); }), addEventListener: (_type, listener) => { releaseListener = listener; } };
  return value;
}
describe("Screen Wake Lock lifecycle", () => {
  it("holds silently and releases on leave; can reacquire after foreground return", async () => {
    const first = lock(), second = lock(), request = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const service = new ScreenWakeLockService({ request }); const states: ScreenWakeLockState[] = [];
    service.subscribe(s => states.push(s));
    await service.request(); await service.request();
    expect(request).toHaveBeenCalledTimes(1); expect(states.at(-1)).toBe("held");
    service.stop(); expect(first.release).toHaveBeenCalledTimes(1);
    await service.request(); expect(states.at(-1)).toBe("held"); expect(request).toHaveBeenCalledTimes(2);
    service.stop();
  });
  it("reports unsupported and denied without throwing", async () => {
    const unsupported: ScreenWakeLockState[] = [], denied: ScreenWakeLockState[] = [];
    const a = new ScreenWakeLockService(null), b = new ScreenWakeLockService({ request: async () => { throw new Error("denied"); } });
    a.subscribe(s => unsupported.push(s)); b.subscribe(s => denied.push(s));
    await a.request(); await b.request();
    expect(unsupported.at(-1)).toBe("unsupported"); expect(denied.at(-1)).toBe("denied");
  });
  it("releases a late request after cleanup, including Strict Mode reactivation", async () => {
    const late = lock(); let resolve: ((value: ScreenLock) => void) | undefined;
    const service = new ScreenWakeLockService({ request: () => new Promise(r => { resolve = r; }) });
    const request = service.request(); service.stop(); resolve?.(late); await request;
    expect(late.release).toHaveBeenCalledTimes(1);
  });
});
