function timestampMs(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function calculateElapsedSeconds(startedAt: string | null, accumulatedPauseSeconds = 0, nowMs = Date.now()): number {
  const start = timestampMs(startedAt);
  if (start === null || !Number.isFinite(nowMs)) return 0;
  const pause = Number.isFinite(accumulatedPauseSeconds) ? Math.max(0, accumulatedPauseSeconds) : 0;
  return Math.max(0, Math.floor((nowMs - start) / 1000) - pause);
}

export function calculateStageElapsedSeconds(currentStageStartedAt: string | null, nowMs = Date.now()): number {
  return calculateElapsedSeconds(currentStageStartedAt, 0, nowMs);
}

export function formatDuration(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, "0")}`;
}
