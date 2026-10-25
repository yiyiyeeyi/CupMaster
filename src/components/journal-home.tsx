"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Brew } from "@/domain";
import { formatDuration, isAnalysisOutdated } from "@/domain";
import { LocalBrewRepository } from "@/repositories/local-brew-repository";
import { LocalBrewPreparationRepository } from "@/repositories/local-brew-preparation-repository";
import { brewRecordCopy as copy } from "./brew-record-copy";

export function JournalHome() {
  const [brews, setBrews] = useState<Brew[] | null>(null), [error, setError] = useState<string | null>(null), [reload, setReload] = useState(0);
  useEffect(() => { const timer = window.setTimeout(() => {
    const migration = new LocalBrewPreparationRepository().migrate();
    if (!migration.ok) { setError(migration.message); return; }
    const result = new LocalBrewRepository().listJournalEntries();
    if (result.ok) { setBrews(result.value); setError(null); } else setError(result.message);
  }, 0); return () => window.clearTimeout(timer); }, [reload]);
  if (error) return <main className="state-page"><p role="alert">{error}</p><button type="button" onClick={() => setReload(value => value + 1)}>{copy.retry}</button></main>;
  if (!brews) return <main className="route-loading"><h1>Journal</h1></main>;
  return <main className="journal-page"><header><p className="eyebrow">Remember</p><h1>Journal</h1><p>{copy.journalDescription}</p></header>
    {brews.length === 0 ? <section className="empty-state"><h2>{copy.emptyJournal}</h2><Link className="primary-button" href="/discover">{copy.chooseRecipe}</Link></section> :
      <section className="journal-section"><div className="section-heading"><h2>{copy.completed}</h2><span>{brews.length}</span></div><div className="journal-list">
        {brews.map(brew => <Link className="journal-card" href={`/journal/${brew.id}`} key={brew.id}><div>
          <span className="status-line">{copy.completed}</span><h3>{brew.recordDetails?.bean?.name ?? brew.recipeSnapshot.bean?.name ?? "未記錄咖啡豆"} / {brew.recipeSnapshot.title}</h3>
          {brew.appliedAdjustment ? <p className="journal-adjustment">{copy.appliedSuggestion}：{brew.appliedAdjustment.adjustment.description}</p> : null}
          <p>{new Date(brew.completedAt ?? brew.updatedAt).toLocaleString()}</p>
          <p>{brew.flavorFeedback ? `${copy.feelingRecorded} · ${copy[brew.flavorFeedback.overallImpression]}` : brew.feedbackStatus === "skipped" ? "Skipped" : "Awaiting feedback"} · {isAnalysisOutdated(brew) ? "Analysis outdated" : brew.analysisStatus} · {brew.recordDetails ? "Details added" : "Details missing"}</p>
          <dl><div><dt>Time</dt><dd>{brew.actualTotalTimeSeconds === null ? "—" : formatDuration(brew.actualTotalTimeSeconds)}</dd></div><div><dt>Dose</dt><dd>{brew.recordDetails?.actualDoseGrams == null ? `${brew.recipeSnapshot.doseGrams.value}g target` : `${brew.recordDetails.actualDoseGrams}g actual`}</dd></div><div><dt>Water</dt><dd>{brew.recordDetails?.actualWaterGrams == null ? `${brew.recipeSnapshot.totalWaterGrams.value}g target` : `${brew.recordDetails.actualWaterGrams}g actual`}</dd></div></dl>
          <strong className="journal-card-action">Brew Detail</strong>
        </div><span aria-hidden="true">→</span></Link>)}
      </div></section>}
  </main>;
}
