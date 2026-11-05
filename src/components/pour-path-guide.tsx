"use client";
import { useEffect, useRef, useState } from "react";
import type { PourPathPlaybackProps } from "@/domain";
import { brewSheetCopy } from "./brew-sheet-copy";
import { methodGuide, pourRuns, sampleMethod, sampleTrace, type PathPoint } from "./pour-path-geometry";
import "./pour-path-guide.css";

export type PourPathGuideProps = PourPathPlaybackProps & {
  /** While paused the dot holds exactly at elapsedSeconds instead of gliding between timer ticks. */
  paused?: boolean;
};

/** The timer ticks every 250 ms; glide at most this far past the last tick so a missed tick never runs ahead. */
const MAX_GLIDE_SECONDS = 0.3;
const TRAIL_SECONDS = 1;
const WARM = "232,199,162";
const TEXT = "246,242,234";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function draw(canvas: HTMLCanvasElement, { method, pourPath }: PourPathPlaybackProps, t: number, reduced: boolean) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const size = canvas.width, c = size / 2, r = size * 0.44, line = size / 300, full = Math.PI * 2;
  const at = (p: PathPoint) => [c + p.x * r, c + p.y * r] as const;
  const dot = (p: PathPoint, radius: number, color: string) => { const [x, y] = at(p); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, radius, 0, full); ctx.fill(); };
  const route = (points: readonly PathPoint[]) => { ctx.beginPath(); points.forEach((p, i) => { const [x, y] = at(p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); };
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = `rgba(${WARM},.06)`; ctx.beginPath(); ctx.arc(c, c, r, 0, full); ctx.fill();
  ctx.strokeStyle = `rgba(${TEXT},.28)`; ctx.lineWidth = line; ctx.beginPath(); ctx.arc(c, c, r, 0, full); ctx.stroke();

  const traced = pourPath && pourPath.points.length > 0 ? pourPath.points : undefined;
  if (!traced && method === "drain") {
    const u = reduced ? 0.5 : (t % 5) / 5, level = r * (0.8 - 0.7 * u);
    ctx.fillStyle = `rgba(${WARM},.10)`; ctx.beginPath(); ctx.arc(c, c, level, 0, full); ctx.fill();
    ctx.strokeStyle = `rgba(${WARM},.45)`; ctx.lineWidth = line * 1.2; ctx.beginPath(); ctx.arc(c, c, level, 0, full); ctx.stroke();
    return;
  }

  ctx.setLineDash([line * 4, line * 5]); ctx.strokeStyle = `rgba(${TEXT},.2)`; ctx.lineWidth = line;
  if (traced) pourRuns(traced).forEach(route); else if (method) route(methodGuide(method));
  ctx.setLineDash([]);

  const sample = (time: number) => traced ? sampleTrace(traced, time) : method ? sampleMethod(method, time) : null;
  const head = sample(t);
  if (!head) return;
  const pointPour = !traced && (method === "center" || method === "excavate");
  if (pointPour && !reduced) {
    const period = method === "excavate" ? 0.7 : 1.4, u = (t % period) / period;
    ctx.strokeStyle = `rgba(${WARM},${0.5 * (1 - u)})`; ctx.lineWidth = line * 1.2;
    ctx.beginPath(); ctx.arc(c, c, r * (method === "excavate" ? 0.05 + 0.18 * u : 0.06 + 0.32 * u), 0, full); ctx.stroke();
    const on = method !== "excavate" || u < 0.45;
    dot(head, size * (on ? 0.034 : 0.022), `rgba(${WARM},${on ? 1 : 0.25})`);
    return;
  }
  if (!reduced && !pointPour) {
    const steps = 28;
    for (let i = steps; i > 0; i -= 1) {
      const p = sample(t - (i / steps) * TRAIL_SECONDS);
      if (!p) continue;
      const a = 1 - i / steps;
      dot(p, size * (0.012 + 0.016 * a), `rgba(${WARM},${0.55 * a * a})`);
    }
  }
  dot(head, size * 0.032, `rgb(${WARM})`);
}

/** Top view of the filter with the route to pour along. Draws a real traced pourPath when present, otherwise the illustrative route for pourMethod. */
export function PourPathGuide({ method, pourPath, elapsedSeconds, paused = false }: PourPathGuideProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();
  const tick = useRef({ seconds: elapsedSeconds, at: 0 });

  useEffect(() => { tick.current = { seconds: elapsedSeconds, at: performance.now() }; }, [elapsedSeconds]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const box = canvas.getBoundingClientRect();
    const pixels = Math.max(1, Math.round((box.width || 220) * (window.devicePixelRatio || 1)));
    if (canvas.width !== pixels) { canvas.width = pixels; canvas.height = pixels; }
    const playback = { method, pourPath, elapsedSeconds };
    const now = () => {
      const { seconds, at } = tick.current;
      return paused || reduced ? seconds : seconds + Math.min(MAX_GLIDE_SECONDS, Math.max(0, (performance.now() - at) / 1000));
    };
    if (reduced) { draw(canvas, playback, now(), true); return; }
    let frame = 0;
    const loop = () => { draw(canvas, playback, now(), false); frame = requestAnimationFrame(loop); };
    loop();
    return () => cancelAnimationFrame(frame);
  }, [method, pourPath, elapsedSeconds, paused, reduced]);

  if (!method && !pourPath?.points.length) return null;
  const name = method ? brewSheetCopy.pourMethods[method] : undefined;
  return (
    <div className="pour-path-guide" role="img" aria-label={`${brewSheetCopy.pourPathLabel}${name ? `：${name}` : ""}`}>
      <canvas ref={canvasRef} width={440} height={440} aria-hidden="true" />
    </div>
  );
}
