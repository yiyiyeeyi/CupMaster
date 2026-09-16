"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDuration, isAnalysisOutdated } from "@/domain";
import { JournalLoader, type JournalBrewCardViewModel } from "@/application/journal-loader";
import { LocalBrewRepository } from "@/repositories/local-brew-repository";
import { LocalSuggestedPlanRepository } from "@/repositories/local-suggested-plan-repository";

type State = { status: "loading" } | { status: "ready"; cards: JournalBrewCardViewModel[]; notice?: string } | { status: "error"; message: string };

export function JournalHome() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [reload, setReload] = useState(0);
  useEffect(() => { const timer = window.setTimeout(() => { const result = new JournalLoader(new LocalBrewRepository(), new LocalSuggestedPlanRepository()).load(); setState(result.ok ? { status: "ready", cards: result.cards, ...(result.notice && { notice: result.notice }) } : { status: "error", message: result.message }); }, 0); return () => window.clearTimeout(timer); }, [reload]);
  if (state.status === "loading") return <main className="route-loading"><p className="eyebrow">Journal</p><h1>Loading your cups…</h1></main>;
  if (state.status === "error") return <main className="state-page"><h1>Your Journal could not be loaded.</h1><p>{state.message}</p><button className="primary-button" onClick={() => { setState({ status: "loading" }); setReload((value) => value + 1); }} type="button">Retry</button></main>;
  const active = state.cards.filter(({ brew }) => brew.executionStatus !== "completed");
  const completedDrafts = state.cards.filter(({ brew }) => brew.executionStatus === "completed" && brew.recordStatus === "draft");
  const saved = state.cards.filter(({ brew }) => brew.executionStatus === "completed" && brew.recordStatus === "saved");
  return <main className="journal-page"><header><p className="eyebrow">Remember</p><h1>Journal</h1><p>Your active Next Try and completed cups stay connected to their brewing context.</p></header>{state.notice && <p className="notice">{state.notice}</p>}{state.cards.length === 0 ? <section className="empty-state"><h2>No cups yet.</h2><Link className="primary-button" href="/discover">Choose a recipe</Link></section> : <>{active.length > 0 && <Section title="Continue brewing" cards={active} />}{completedDrafts.length > 0 && <Section title="Completed, not saved" cards={completedDrafts} />}{saved.length > 0 && <Section title="Saved Brews" cards={saved} />}</>}</main>;
}

function Section({ title, cards }: { title: string; cards: JournalBrewCardViewModel[] }) {
  return <section className="journal-section"><div className="section-heading"><h2>{title}</h2><span>{cards.length}</span></div><div className="journal-list">{cards.map((card) => <JournalCard card={card} key={card.brew.id} />)}</div></section>;
}

function JournalCard({ card }: { card: JournalBrewCardViewModel }) {
  const { brew, resultContext, sourceNextTry } = card;
  const href = sourceNextTry.hasSuggestedPlans ? `/journal/${brew.id}` : resultContext.targetRoute;
  const feedback = brew.flavorFeedback ? `Feedback added · ${brew.flavorFeedback.overallImpression}` : brew.feedbackStatus === "skipped" ? "Skipped" : "Awaiting feedback";
  const analysis = isAnalysisOutdated(brew) ? "Analysis outdated" : brew.analysisStatus === "completed" ? "Analysis ready" : brew.analysisStatus === "pending" ? "Analysis pending" : brew.analysisStatus === "failed" ? "Analysis failed" : "Analysis not requested";
  return <Link aria-label={`View brew: ${brew.recipeSnapshot.title}`} className="journal-card" href={href}><div>
    <span className="status-line">{resultContext.sourceLabel ? `${resultContext.sourceLabel} · ` : ""}{resultContext.statusLabel}{resultContext.handoffLabel ? ` · ${resultContext.handoffLabel}` : ""}</span>
    <h3>{brew.recordDetails?.bean?.name ?? brew.recipeSnapshot.bean?.name ?? "No bean recorded"} / {brew.recipeSnapshot.title}</h3>
    {resultContext.adjustmentSummary && <p className="journal-adjustment">{resultContext.adjustmentSummary}</p>}
    {sourceNextTry.hasSuggestedPlans && <div className="source-next-try-summary"><strong>Next Try available{sourceNextTry.totalPlans > 1 ? ` · ${sourceNextTry.totalPlans} plans` : ""}</strong><span>{sourceNextTry.latestAdjustmentSummary}</span><span>{sourceNextTry.latestExecutionProjection?.label ?? "Status unavailable"}</span></div>}
    <p>{new Date(brew.completedAt ?? brew.updatedAt).toLocaleString()}</p>
    {brew.executionStatus === "completed" && <><p>{brew.recordStatus === "saved" ? "Saved" : "Awaiting save"} · {feedback} · {analysis} · {brew.recordDetails ? "Details added" : "Details missing"}</p><dl><div><dt>Time</dt><dd>{brew.actualTotalTimeSeconds == null ? "—" : formatDuration(brew.actualTotalTimeSeconds)}</dd></div><div><dt>Dose</dt><dd>{brew.recordDetails?.actualDoseGrams == null ? `${brew.recipeSnapshot.doseGrams.value}g target` : `${brew.recordDetails.actualDoseGrams}g actual`}</dd></div><div><dt>Water</dt><dd>{brew.recordDetails?.actualWaterGrams == null ? `${brew.recipeSnapshot.totalWaterGrams.value}g target` : `${brew.recordDetails.actualWaterGrams}g actual`}</dd></div></dl></>}
    <strong className="journal-card-action">{sourceNextTry.hasSuggestedPlans ? "View brew and Next Try" : resultContext.actionLabel}</strong>
  </div><span aria-hidden="true">→</span></Link>;
}
