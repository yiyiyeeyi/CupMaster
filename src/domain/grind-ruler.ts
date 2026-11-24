import type { GrinderDefinition, GrindSetting } from "./grinders";

/** Linear ruler model for a grinder's dial. UI-only: it never converts between grinders. */
export interface RulerTick { major: boolean; label: string; }
export interface GrindRuler { count: number; dots: boolean; indexOf(setting: GrindSetting | undefined): number; settingAt(index: number): GrindSetting; tick(index: number): RulerTick; }

const DEFAULT_SINGLE_SPAN = 40, DEFAULT_ROTATIONS = 3, HEADROOM = 10;
const dotGrinders = new Set(["timemore-c3"]);

export function grindRuler(definition: GrinderDefinition, current?: GrindSetting): GrindRuler | null {
  if (definition.format === "number") return null;
  const parts = definition.parts;
  if (definition.format === "single") {
    const part = parts[0], min = part.min;
    const value = current?.format === "single" ? current.value : min;
    const max = part.max ?? Math.max(min + DEFAULT_SINGLE_SPAN, value + HEADROOM);
    const dots = dotGrinders.has(definition.id);
    return {
      count: max - min + 1, dots,
      indexOf: setting => setting?.format === "single" ? clamp(setting.value - min, 0, max - min) : 0,
      settingAt: index => ({ grinderId: definition.id, format: "single", value: min + index }),
      tick: index => { const v = min + index, major = v % 5 === 0; return { major, label: dots || major ? String(v) : "" }; },
    };
  }
  // compound: first part may be unbounded; later parts must be bounded.
  const radices = parts.map(part => part.max === undefined ? Infinity : part.max - part.min + 1);
  const inner = radices.slice(1).reduce((product, radix) => product * radix, 1);
  const last = radices[radices.length - 1];
  const toParts = (index: number) => { const out: number[] = []; let rest = index; for (let i = parts.length - 1; i > 0; i--) { out.unshift(parts[i].min + (rest % radices[i])); rest = Math.floor(rest / radices[i]); } out.unshift(parts[0].min + rest); return out; };
  const toIndex = (values: number[]) => values.reduce((index, value, i) => i === 0 ? value - parts[0].min : index * radices[i] + (value - parts[i].min), 0);
  const currentIndex = current?.format === "compound" && current.parts.length === parts.length ? toIndex(current.parts) : 0;
  let count = radices[0] === Infinity ? Math.max(DEFAULT_ROTATIONS * inner, currentIndex + inner) : radices[0] * inner;
  // A final major position with non-zero lower parts is invalid for Ode (11 is the last step).
  if (definition.id === "fellow-ode-gen-2") count = (radices[0] - 1) * inner + 1;
  return {
    count, dots: parts.length === 2,
    indexOf: setting => setting?.format === "compound" && setting.parts.length === parts.length ? clamp(toIndex(setting.parts), 0, count - 1) : 0,
    settingAt: index => ({ grinderId: definition.id, format: "compound", parts: toParts(clamp(index, 0, count - 1)) }),
    tick: index => {
      const values = toParts(index);
      if (index % last !== 0) return { major: false, label: "" };
      if (parts.length === 2) return { major: true, label: String(values[0]) };
      const lowerAtMin = values.slice(1).every((value, i) => value === parts[i + 1].min);
      return { major: true, label: lowerAtMin ? `${values[0]}${parts[0].label}` : String(values[parts.length - 2]) };
    },
  };
}
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }

/** Cone-volume heights for the ratio illustration (0..1 of cup height). */
export const CUP_CAPACITY_ML = 740, GROUNDS_ML_PER_GRAM = 2.5;
export function cupLevels(doseGrams: number, waterGrams: number) {
  const level = (volume: number) => Math.cbrt(Math.min(Math.max(volume, 0), CUP_CAPACITY_ML) / CUP_CAPACITY_ML);
  const grounds = doseGrams * GROUNDS_ML_PER_GRAM;
  return { bed: level(grounds), water: level(grounds + waterGrams) };
}
