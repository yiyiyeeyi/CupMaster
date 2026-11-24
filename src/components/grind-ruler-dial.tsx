"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GrinderDefinition, GrindSetting } from "@/domain/grinders";
import { grindRuler } from "@/domain/grind-ruler";

const STEP_PX = { dots: 24, lines: 14, dense: 8 };
/** Horizontal scroll-snap dial. Fixed centre needle, faded edges, no arrow buttons. */
export function GrindRulerDial({ definition, value, onChange, onPreview }: { definition: GrinderDefinition; value?: GrindSetting; onChange(value: GrindSetting): void; onPreview?(value: GrindSetting): void }) {
  const ruler = useMemo(() => grindRuler(definition, value), [definition, value]);
  const scroller = useRef<HTMLDivElement>(null), settle = useRef<ReturnType<typeof setTimeout> | null>(null), programmatic = useRef(true);
  const target = ruler ? ruler.indexOf(value) : 0;
  const [active, setActive] = useState(target);
  const step = !ruler ? 0 : ruler.dots ? STEP_PX.dots : ruler.count > 120 ? STEP_PX.dense : STEP_PX.lines;
  useEffect(() => {
    const el = scroller.current; if (!el || !ruler) return;
    if (Math.round(el.scrollLeft / step) !== target) { programmatic.current = true; el.scrollLeft = target * step; }
    const frame = requestAnimationFrame(() => { programmatic.current = false; setActive(target); });
    return () => cancelAnimationFrame(frame);
  }, [target, step, ruler]);
  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); }, []);
  if (!ruler) return null;
  const commit = (index: number) => { if (index !== ruler.indexOf(value)) onChange(ruler.settingAt(index)); };
  return <div className="grind-ruler">
    <div ref={scroller} className="grind-ruler-scroll" role="slider" tabIndex={0} aria-label={`${definition.name} 刻度`} aria-valuemin={0} aria-valuemax={ruler.count - 1} aria-valuenow={active}
      onScroll={event => {
        if (programmatic.current) return;
        const index = Math.max(0, Math.min(ruler.count - 1, Math.round(event.currentTarget.scrollLeft / step)));
        if (index !== active) { setActive(index); onPreview?.(ruler.settingAt(index)); }
        if (settle.current) clearTimeout(settle.current);
        settle.current = setTimeout(() => commit(index), 160);
      }}
      onKeyDown={event => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const index = Math.max(0, Math.min(ruler.count - 1, active + (event.key === "ArrowLeft" ? -1 : 1)));
        setActive(index); scroller.current?.scrollTo({ left: index * step }); commit(index);
      }}>
      <div className={`grind-ruler-track${ruler.dots ? " dots" : ""}`} style={{ paddingInline: `calc(50% - ${step / 2}px)` }}>
        {Array.from({ length: ruler.count }, (_, index) => { const tick = ruler.tick(index); return <span key={index} className={`grind-ruler-tick${tick.major ? " major" : ""}${index === active ? " active" : ""}`} style={{ width: step }}>{tick.label && <b>{tick.label}</b>}<i /></span>; })}
      </div>
    </div>
    <span className="grind-ruler-needle" aria-hidden="true" />
  </div>;
}
