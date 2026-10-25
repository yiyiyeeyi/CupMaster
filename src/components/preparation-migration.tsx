"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LocalBrewPreparationRepository } from "@/repositories/local-brew-preparation-repository";
import { LocalBrewRepository } from "@/repositories/local-brew-repository";
import { preparationCopy as copy } from "./brew-preparation-copy";

export function PreparationMigration() {
  const [message, setMessage] = useState<string | null>(null);
  function migrate() { const result = new LocalBrewPreparationRepository().migrate(); setMessage(result.ok ? (result.value.warnings.length ? `${copy.legacyMissing} ${result.value.warnings.length}` : null) : result.message); }
  useEffect(() => { const timer = window.setTimeout(migrate, 0); return () => window.clearTimeout(timer); }, []);
  return message ? <aside className="notice" role="status">{message}<button type="button" onClick={migrate}>{copy.retry}</button></aside> : null;
}
export function LegacyPreparationGate({ brewId, planId, children }: { brewId?: string; planId?: string; children?: React.ReactNode }) {
  const router = useRouter(), [ready, setReady] = useState(false), [error, setError] = useState<string | null>(null);
  useEffect(() => { const timer = window.setTimeout(() => {
    const result = new LocalBrewPreparationRepository().migrate();
    if (!result.ok) { setError(result.message); return; }
    const entryId = brewId ? result.value.redirects[brewId] : result.value.entries.find(entry => entry.legacyPlanId === planId)?.id;
    if (entryId) { router.replace(`/brew/prepare?preparationId=${encodeURIComponent(entryId)}`); return; }
    if (planId) {
      const resultId = new LocalBrewPreparationRepository().legacyResult(planId);
      if (resultId) { router.replace(`/journal/${encodeURIComponent(resultId)}`); return; }
      setError(copy.legacyMissing); return;
    }
    const brew = brewId ? new LocalBrewRepository().getById(brewId) : null;
    if (brew?.value?.sourceSuggestedPlanId && brew.value.executionStatus === "not_started") { setError(copy.legacyMissing); return; }
    setReady(true);
  }, 0); return () => window.clearTimeout(timer); }, [brewId, planId, router]);
  if (!ready) return <main className="state-page"><p role="status">{error ?? copy.loading}</p><Link href="/journal">Journal</Link></main>;
  return children;
}
