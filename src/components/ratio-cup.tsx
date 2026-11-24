import { cupLevels } from "@/domain/grind-ruler";

const TIP = 100, HEIGHT = 90;
/** Dripper illustration: grounds at the bottom, water above. Proportional, not a real water level. */
export function RatioCup({ dose, water }: { dose: number; water: number }) {
  const { bed, water: level } = cupLevels(dose, water);
  return <svg className="ratio-cup" viewBox="0 0 120 116" role="img" aria-label={`濾杯示意：粉 ${dose} g、水 ${water} g`}>
    <defs>
      <clipPath id="ratio-cup-cone"><path d="M14 10 L106 10 L64 100 L56 100 Z" /></clipPath>
      <pattern id="ratio-cup-grain" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" className="ratio-cup-bed" /><circle cx="1.5" cy="1.5" r=".8" className="ratio-cup-grain" /><circle cx="4.5" cy="4.2" r=".7" className="ratio-cup-grain" /></pattern>
    </defs>
    <g clipPath="url(#ratio-cup-cone)">
      <rect className="ratio-cup-water" x="0" y={TIP - HEIGHT} width="120" height={HEIGHT} style={{ transform: `scaleY(${level})` }} />
      <line className="ratio-cup-surface" x1="0" x2="120" y1={TIP} y2={TIP} style={{ transform: `translateY(${-level * HEIGHT}px)` }} />
      <rect x="0" y={TIP - HEIGHT} width="120" height={HEIGHT} fill="url(#ratio-cup-grain)" className="ratio-cup-fill" style={{ transform: `scaleY(${bed})` }} />
    </g>
    <path className="ratio-cup-line" d="M10 8 L110 8 L66 102 L54 102 Z" />
    <path className="ratio-cup-line" d="M4 8 L116 8 M38 110 L82 110 M54 102 L51 110 M66 102 L69 110" />
  </svg>;
}
