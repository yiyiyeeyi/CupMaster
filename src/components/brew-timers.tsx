"use client";
import { useEffect, useState } from "react";
import { calculateElapsedSeconds, calculateStageElapsedSeconds, formatDuration } from "@/domain";

export function BrewTimers({ startedAt, currentStageStartedAt, accumulatedPauseSeconds, running = true, completedSeconds = null }: { startedAt: string | null; currentStageStartedAt: string | null; accumulatedPauseSeconds: number; running?: boolean; completedSeconds?: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!running) return; const interval = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(interval); }, [running]);
  const total = running ? calculateElapsedSeconds(startedAt, accumulatedPauseSeconds, now) : Math.max(0, completedSeconds ?? 0);
  const stage = running ? calculateStageElapsedSeconds(currentStageStartedAt, now) : 0;
  return <div className="running-timers"><div><span>{running ? "Total elapsed" : "Actual total time"}</span><time aria-label={`Total elapsed time ${formatDuration(total)}`} dateTime={`PT${total}S`}>{formatDuration(total)}</time></div>{running ? <div><span>Stage elapsed</span><time aria-label={`Current stage elapsed time ${formatDuration(stage)}`} dateTime={`PT${stage}S`}>{formatDuration(stage)}</time></div> : <div><span>Timer status</span><strong>Stopped</strong></div>}</div>;
}
