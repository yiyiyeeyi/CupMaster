import { describe, expect, it } from "vitest";
import { calculateElapsedSeconds, calculateStageElapsedSeconds, formatDuration } from "./brew-timer";

describe("timestamp Brew timers", () => {
  it("calculates total elapsed seconds", () => expect(calculateElapsedSeconds("2026-07-18T00:00:00.000Z", 0, Date.parse("2026-07-18T00:01:24.000Z"))).toBe(84));
  it("calculates current stage elapsed seconds", () => expect(calculateStageElapsedSeconds("2026-07-18T00:01:00.000Z", Date.parse("2026-07-18T00:01:24.000Z"))).toBe(24));
  it("subtracts accumulated pause seconds", () => expect(calculateElapsedSeconds("2026-07-18T00:00:00.000Z", 10, Date.parse("2026-07-18T00:01:00.000Z"))).toBe(50));
  it("falls back safely for invalid timestamps", () => expect(calculateElapsedSeconds("invalid", 0, Date.now())).toBe(0));
  it("never returns negative time", () => expect(calculateStageElapsedSeconds("2026-07-18T00:02:00.000Z", Date.parse("2026-07-18T00:01:00.000Z"))).toBe(0));
  it("formats zero, normal, and over 59 minute durations", () => { expect(formatDuration(0)).toBe("0:00"); expect(formatDuration(84)).toBe("1:24"); expect(formatDuration(3661)).toBe("61:01"); });
});
