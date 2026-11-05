import type { PourMethod, RecipePourPathPoint } from "@/domain";

/** Point in filter radii: centre 0, filter edge 1, x right and y down. */
export type PathPoint = { x: number; y: number };

/** A gap longer than this between traced points means the pourer lifted the kettle. */
export const POUR_GAP_SECONDS = 0.35;
/** Real traces end with the last poured point; keep the dot briefly so it does not blink out early. */
const END_HOLD_SECONDS = 0.15;
const LAP_SECONDS = 2;
const MAX_RADIUS = 0.75;

const clamp = (value: number) => Math.max(-1.05, Math.min(1.05, value));

/** Splits a trace into continuous pours so the guide line never bridges a lifted kettle. */
export function pourRuns(points: readonly RecipePourPathPoint[]): RecipePourPathPoint[][] {
  const runs: RecipePourPathPoint[][] = [];
  for (const point of points) {
    const run = runs[runs.length - 1];
    const last = run?.[run.length - 1];
    if (!run || !last || point.t - last.t > POUR_GAP_SECONDS) runs.push([point]);
    else run.push(point);
  }
  return runs;
}

/** Where the water lands at stage time t, or null when nothing is being poured. Points must be ordered by t. */
export function sampleTrace(points: readonly RecipePourPathPoint[], t: number): PathPoint | null {
  const first = points[0], last = points[points.length - 1];
  if (!first || !last || t < first.t || t > last.t + END_HOLD_SECONDS) return null;
  if (t >= last.t) return { x: clamp(last.x), y: clamp(last.y) };
  let low = 0, high = points.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (points[mid].t <= t) low = mid; else high = mid;
  }
  const a = points[low], b = points[high];
  if (t === a.t) return { x: clamp(a.x), y: clamp(a.y) };
  if (b.t - a.t > POUR_GAP_SECONDS) return null;
  const u = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return { x: clamp(a.x + (b.x - a.x) * u), y: clamp(a.y + (b.y - a.y) * u) };
}

/** Illustrative position for steps without a real trace. Loops; drain has no pour point. */
export function sampleMethod(method: PourMethod, t: number): PathPoint | null {
  const angle = (seconds: number, lap = LAP_SECONDS) => (seconds / lap) * Math.PI * 2;
  const ring = (radius: number, a: number) => ({ x: radius * Math.cos(a), y: radius * Math.sin(a) });
  switch (method) {
    case "circle": return ring(0.42, angle(t));
    case "coin": return ring(0.12, angle(t, 1.1));
    case "center":
    case "excavate": return { x: 0, y: 0 };
    case "outward":
    case "inward": {
      const period = 8, u = (t % period) / period;
      const radius = method === "outward" ? 0.05 + u * (MAX_RADIUS - 0.05) : MAX_RADIUS - u * (MAX_RADIUS - 0.05);
      return ring(radius, angle(u * period));
    }
    case "drain": return null;
  }
}

/** Full illustrative route for the dashed guide; empty for point pours and drain. */
export function methodGuide(method: PourMethod): PathPoint[] {
  const steps = method === "outward" || method === "inward" ? 400 : 120;
  if (method === "circle" || method === "coin") {
    const lap = method === "coin" ? 1.1 : LAP_SECONDS;
    return Array.from({ length: steps + 1 }, (_, i) => sampleMethod(method, (i / steps) * lap) as PathPoint);
  }
  if (method === "outward" || method === "inward") return Array.from({ length: steps + 1 }, (_, i) => sampleMethod(method, (i / steps) * 7.999) as PathPoint);
  return [];
}
