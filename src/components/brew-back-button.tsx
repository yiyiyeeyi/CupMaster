"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrewService } from "@/application/brew-service";
import { SuggestedPlanService } from "@/application/suggested-plan-service";
import { LocalBrewRepository } from "@/repositories/local-brew-repository";
import { LocalSuggestedPlanRepository } from "@/repositories/local-suggested-plan-repository";
import { guidedBrewCopy as copy } from "./guided-brew-copy";
import styles from "./brew-return-dialog.module.css";

export function BrewBackButton({ brewId, onLeaving }: { brewId: string; onLeaving?: () => void }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (confirming) dialog.current?.showModal();
    else dialog.current?.close();
  }, [confirming]);

  function leave(clearExecution: boolean) {
    if (lock.current) return;
    lock.current = true;
    const repository = new LocalBrewRepository();
    const read = repository.getById(brewId);
    if (!read.ok || !read.value) {
      setError(copy.returnFailed);
      lock.current = false;
      return;
    }
    const brew = read.value;
    if (brew.executionStatus === "in_progress" || brew.executionStatus === "paused") {
      if (!clearExecution) { setConfirming(true); lock.current = false; return; }
      const reset = new BrewService(repository).restartBrewSession(brewId, brew.executionRun ?? 1);
      if (!reset.ok) { setError(`${copy.returnFailed} ${reset.message}`); lock.current = false; return; }
      onLeaving?.();
      if (brew.sourceSuggestedPlanId) {
        const sync = new SuggestedPlanService(repository, new LocalSuggestedPlanRepository())
          .repairSuggestedPlanState(brew.sourceSuggestedPlanId);
        if (!sync.ok) { setError(copy.planResetSyncFailed); lock.current = false; return; }
      }
    } else if (brew.executionStatus !== "not_started") {
      setConfirming(false);
      router.push(`/brew/${brewId}/complete`);
      lock.current = false;
      return;
    }
    if (brew.executionStatus === "not_started") onLeaving?.();
    router.push(`/brew/${brewId}/prepare`);
  }

  return <>
    <button aria-label={copy.backToPrepare} className="back-link" onClick={() => { setError(null); leave(false); }} type="button">←</button>
    <dialog className={styles.dialog} ref={dialog} onCancel={() => setConfirming(false)} onClose={() => setConfirming(false)} aria-labelledby="brew-return-question">
      <p id="brew-return-question">{copy.returnQuestion}</p>
      {error && <p role="alert">{error}</p>}
      <div className={styles.actions}>
        <button className="secondary-button" onClick={() => { setConfirming(false); setError(null); }} type="button">{copy.returnNo}</button>
        <button className="primary-button" onClick={() => leave(true)} type="button">{copy.returnYes}</button>
      </div>
    </dialog>
    {!confirming && error && <span role="alert">{error}</span>}
  </>;
}
