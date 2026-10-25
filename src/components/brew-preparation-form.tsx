"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BrewPreparation } from "@/domain/brew-preparation";
import { cancelBrewAdjustment } from "@/domain/brew-preparation";
import { BrewPreparationService } from "@/application/brew-preparation-service";
import { LocalBrewRepository } from "@/repositories/local-brew-repository";
import { LocalBrewPreparationRepository } from "@/repositories/local-brew-preparation-repository";
import { preparationCopy as copy } from "./brew-preparation-copy";
import type { Recipe } from "@/domain";
import { createBrewPlan, createQuickPrepareDefaults } from "@/application/brew-factory";

export function BrewPreparationForm({ sourceBrewId, recommendationId, preparationId, recipe }: { sourceBrewId?: string; recommendationId?: string; preparationId?: string; recipe?: Recipe }) {
  const router = useRouter(), lock = useRef(false);
  const [seed, setSeed] = useState<BrewPreparation | null>(null), [error, setError] = useState<string | null>(null), [outdated, setOutdated] = useState(false);
  const [service] = useState(() => new BrewPreparationService(new LocalBrewRepository(), new LocalBrewPreparationRepository()));
  const savedId = useRef<string | null>(preparationId ?? null);
  useEffect(() => { const timer = window.setTimeout(() => {
    if (recipe) { const baseline = createBrewPlan(recipe, createQuickPrepareDefaults(recipe)); setSeed({ ...baseline, sourceBrewId: null, appliedAdjustment: null }); return; }
    const result = service.load({ sourceBrewId, recommendationId, preparationId });
    if (result.ok) { setSeed(result.value); setOutdated(result.outdated); } else setError(result.message);
  }, 0); return () => window.clearTimeout(timer); }, [sourceBrewId, recommendationId, preparationId, service, recipe]);
  function start(saveOnly = false) {
    if (!seed || lock.current) return; lock.current = true;
    if (saveOnly) {
      const id = savedId.current ?? crypto.randomUUID(); savedId.current = id;
      const result = new LocalBrewPreparationRepository().save(seed, id, new Date().toISOString());
      if (result.ok) { router.push("/journal"); return; } else setError(result.message);
    } else { const result = service.create(seed); if (result.ok) { router.push(`/brew/${result.value.id}`); return; } else setError(result.message); }
    lock.current = false;
  }
  if (!seed) return <main className="state-page"><h1>Quick Prepare</h1><p role="status">{error ?? copy.loading}</p><Link href="/journal">Journal</Link></main>;
  function changeNumber(field: "doseGrams" | "totalWaterGrams" | "temperatureCelsius", number: number) {
    setSeed(current => { if (!current) return current; const next = structuredClone(current); next.snapshot[field].value = number;
      next.snapshot.ratio = next.snapshot.totalWaterGrams.value / next.snapshot.doseGrams.value; return next; });
  }
  return <main className="prepare-page"><div className="prepare-topbar"><Link href={recipe ? `/recipes/${recipe.id}` : sourceBrewId ? `/journal/${sourceBrewId}${recommendationId ? "/analysis" : ""}` : "/journal"}>←</Link><h1>Quick Prepare</h1><span /></div>
    <section className="prepare-recipe"><h2>{seed.snapshot.title}</h2></section>
    {outdated ? <p className="notice">{copy.outdated}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    <form onSubmit={event => { event.preventDefault(); start(); }}>
      <section className="prepare-parameters">
        {(["doseGrams", "totalWaterGrams", "temperatureCelsius"] as const).map(field => <label className="prepare-field" key={field}>{copy[field]}<input required min={1} max={field === "temperatureCelsius" ? 110 : undefined} type="number" step="any" value={seed.snapshot[field].value} onChange={event => changeNumber(field, Number(event.target.value))} /></label>)}
        <label className="prepare-field">{copy.dripper}<input required value={seed.snapshot.dripper.value} onChange={event => setSeed({ ...seed, snapshot: { ...seed.snapshot, dripper: { ...seed.snapshot.dripper, value: event.target.value } } })} /></label>
        <label className="prepare-field">{copy.grind}<input value={seed.snapshot.grindDescription?.value ?? ""} onChange={event => setSeed({ ...seed, snapshot: { ...seed.snapshot, grindDescription: { value: event.target.value, recipeDefault: seed.snapshot.grindDescription?.recipeDefault ?? "", source: "user_override" } } })} /></label>
        <div className="prepare-field"><span>{copy.totalTime}</span><strong>{seed.snapshot.expectedTimeSeconds.value}</strong></div>
      </section>
      <section className="prepare-optional">
        <label className="prepare-field">{copy.bean}<input value={seed.snapshot.bean?.name ?? ""} onChange={event => { const next = structuredClone(seed); if (event.target.value.trim()) next.snapshot.bean = { id: `local-bean:${event.target.value}`, name: event.target.value }; else delete next.snapshot.bean; setSeed(next); }} /></label>
        <label className="prepare-field">{copy.equipment}<textarea value={seed.snapshot.equipment?.notes ?? ""} onChange={event => setSeed({ ...seed, snapshot: { ...seed.snapshot, equipment: { ...seed.snapshot.equipment, dripper: seed.snapshot.dripper.value, notes: event.target.value } } })} /></label>
        <label className="prepare-field">{copy.goal}<textarea maxLength={120} value={seed.snapshot.userGoal ?? ""} onChange={event => setSeed({ ...seed, snapshot: { ...seed.snapshot, userGoal: event.target.value } })} /></label>
      </section>
      {seed.appliedAdjustment ? <aside className="prepare-note"><strong>{copy.applied}</strong><p>{seed.appliedAdjustment.adjustment.description}</p><button className="secondary-button" type="button" onClick={() => setSeed(cancelBrewAdjustment(seed))}>{copy.cancel}</button></aside> : null}
      <div className="prepare-submit"><button className="primary-button" type="submit">{copy.start}</button><button className="secondary-button" type="button" onClick={() => start(true)}>{copy.saveLater}</button></div>
    </form>
  </main>;
}
