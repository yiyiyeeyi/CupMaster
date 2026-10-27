"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Brew } from "@/domain";
import { calculateStageElapsedSeconds, formatDuration } from "@/domain";
import { BrewService, type BrewDomainErrorCode } from "@/application/brew-service";
import { BrewInterruptionService } from "@/application/brew-interruption-service";
import { LocalBrewRepository } from "@/repositories/local-brew-repository";
import { LocalLiveBrewRepository } from "@/repositories/local-live-brew-repository";
import { BrewBackButton } from "./brew-back-button";
import { LiveBrewWakeLock } from "./live-brew-wake-lock";
import { BrewTimers } from "./brew-timers";
import { GuidedBrewV1 } from "./guided-brew-v1";
import { LiveBrewHud } from "./live-brew-hud";
import { brewSheetCopy as sheetCopy } from "./brew-sheet-copy";
import { guidedBrewCopy } from "./guided-brew-copy";

type ViewState = { status: "loading" } | { status: "found"; brew: Brew; overrun?: boolean; notice?: string; errorCode?: BrewDomainErrorCode } | { status: "missing"; message?: string } | { status: "error"; message: string };
const errorCopy: Partial<Record<BrewDomainErrorCode, string>> = {
  brew_not_found: "找不到這筆 Brew。它可能已被刪除或只存在於另一個瀏覽器。",
  invalid_execution_status: "這筆 Brew 目前不是可開始或推進的狀態。資料不會被重置。",
  no_stages: "這筆 Brew 沒有可用的 Snapshot 階段，無法開始引導。",
  invalid_stage_order: "目前階段資料不一致，已保留最新 Brew 狀態。",
  duplicate_stage_completion: "這個階段已經被推進，已重新載入最新資料。",
  stages_incomplete: "仍有必要沖煮階段尚未完成。",
  already_completed: "這杯已完成，可繼續查看 Brew Complete。",
  already_saved: "這杯已保存到 Journal。",
  invalid_quick_rating: "快速感受選項無效。",
  persistence_failed: "無法保存 Brew。請檢查瀏覽器儲存空間後重試。",
};


export function LiveBrewDraft({ brewId }: { brewId: string }) {
  const [state, setState] = useState<ViewState>({ status: "loading" });const actionLock = useRef(false); const [acting, setActing] = useState(false); const router = useRouter();
  const [interruption] = useState(() => new BrewInterruptionService(new LocalBrewRepository(), new LocalLiveBrewRepository()));
  const redirecting = useRef(false);
  const [clock, setClock] = useState(()=>Date.now());
  useEffect(()=>{const timer=window.setInterval(()=>setClock(Date.now()),1000);return()=>window.clearInterval(timer);},[]);
  const reload = useCallback(() => {
    if (redirecting.current) return;
    const result = interruption.inspect(brewId, true);
    if (!result.ok) { setState({ status: "error", message: result.message }); return; }
    if (result.state === "expired") {
      redirecting.current = true;
      // A hard replace also works while the browser is restoring a bfcache page.
      window.location.replace(`/brew/${brewId}/prepare`);
      return;
    }
    if (result.state === "completed") { router.replace(`/journal/${brewId}`); return; }
    setState({ status: "found", brew: result.brew, overrun: result.state === "overrun" });

  }, [brewId, interruption, router]);
  useEffect(() => { const timer = window.setTimeout(reload, 0); return () => window.clearTimeout(timer); }, [reload]);
  const manualActive = state.status === "found" && (state.brew.executionStatus === "in_progress" || state.brew.executionStatus === "paused");
  useEffect(() => {
    if (!manualActive) return;
    const leave = () => { interruption.leave(brewId); };
    const foreground = () => { if (document.visibilityState === "visible") reload(); else leave(); };
    document.addEventListener("visibilitychange", foreground);
    window.addEventListener("pagehide", leave); window.addEventListener("popstate", leave); window.addEventListener("pageshow", foreground);
    return () => { document.removeEventListener("visibilitychange", foreground); window.removeEventListener("pagehide", leave); window.removeEventListener("popstate", leave); window.removeEventListener("pageshow", foreground); leave(); };
  }, [brewId, interruption, manualActive, reload]);
  function applyAction(action: (service: BrewService) => ReturnType<BrewService["startBrewSession"]>) { if (actionLock.current) return; actionLock.current = true; setActing(true); const result = action(new BrewService(new LocalBrewRepository())); if (result.ok) setState({ status: "found", brew: result.value, ...(result.resumed && { notice: "Brew 已在進行中；已依原始時間恢復，沒有重設 startedAt。" }) }); else if (result.code === "brew_not_found") setState({ status: "missing", message: errorCopy[result.code] }); else setState({ status: "found", brew: result.latest ?? (state.status === "found" ? state.brew : result.latest!), notice: errorCopy[result.code], errorCode: result.code }); actionLock.current = false; setActing(false); }
  if (state.status === "loading") return <main className="live-loading" aria-live="polite"><p className="eyebrow">Live Brew</p><h1>Loading your Brew draft…</h1></main>;
  if (state.status === "error") return <main className="state-page"><p role="alert">{state.message}</p><button className="primary-button" onClick={reload} type="button">{guidedBrewCopy.retryProgress}</button></main>;
  if (state.status === "missing") return <main className="state-page"><p className="eyebrow">Brew not found</p><h1>This draft is not available.</h1><p>{state.message ?? "It may have been removed, or this link belongs to another browser."}</p><div className="form-actions"><Link className="primary-button" href="/discover">Back to Discover</Link><Link className="secondary-button" href="/journal">Back to Journal</Link></div></main>;
  const { brew } = state; const snapshot = brew.recipeSnapshot; const steps = [...snapshot.steps].sort((a, b) => a.order - b.order); const current = steps[brew.currentStageOrder]; const allStagesDone = brew.currentStageOrder >= steps.length && steps.length > 0;;
  const completeStage = () => applyAction((service) => {
    const result = service.completeCurrentStage(brew.id, brew.currentStageOrder, true);
    if (result.ok && result.value.executionStatus === "completed") router.replace(`/journal/${brew.id}?justCompleted=1`);
    return result;
  });
  const completeBrew = () => { if (actionLock.current) return; actionLock.current = true; setActing(true); const result = new BrewService(new LocalBrewRepository()).completeBrewSession(brew.id); if (result.ok) router.replace(`/journal/${brew.id}?justCompleted=1`); else { setState({ status: "found", brew: result.latest ?? brew, notice: errorCopy[result.code], errorCode: result.code }); actionLock.current = false; setActing(false); } };
  const decideOverrun = (finish: boolean) => {
    if (actionLock.current) return;
    actionLock.current = true;
    const result = finish ? interruption.finish(brew.id, brew.executionRun ?? 1) : interruption.discard(brew.id, brew.executionRun ?? 1);
    if (result.ok) router.replace(finish ? `/journal/${brew.id}?justCompleted=1` : `/brew/${brew.id}/prepare`);
    else { setState({ ...state, notice: result.message }); actionLock.current = false; }
  };
  if (steps.length === 0) return <main className="state-page"><p className="eyebrow">Brew data issue</p><h1>This Brew has no stages.</h1><p>Start is unavailable because the immutable Recipe Snapshot has no guidance steps.</p><div className="form-actions"><Link className="primary-button" href={`/recipes/${brew.sourceRecipeId}`}>Recipe Detail</Link><Link className="secondary-button" href="/discover">Discover</Link></div></main>;
  if (brew.executionStatus === "not_started") return <GuidedBrewV1 brew={brew} />;
  return <main className="live-page is-live">{state.notice && <p className="notice" role={state.errorCode ? "alert" : "status"}>{state.notice}</p>}<LiveBrewHud title={snapshot.title} stage={current?.title ?? sheetCopy.complete} target={current?.targetWaterGrams} drain={current?.pourMethod === "drain"} instruction={current?.instruction ?? sheetCopy.complete} elapsed={<BrewTimers accumulatedPauseSeconds={brew.accumulatedPauseSeconds} currentStagePausedSeconds={brew.currentStagePausedSeconds} pausedAt={brew.pausedAt} completedSeconds={brew.actualTotalTimeSeconds} currentStageStartedAt={brew.currentStageStartedAt} running={brew.executionStatus !== "completed"} startedAt={brew.startedAt} />} expected={formatDuration(snapshot.expectedTimeSeconds.value)} progress={steps.map((step,index)=>({id:step.id,name:step.title,current:index===brew.currentStageOrder,completed:brew.stageResults.some(result=>result.stageId===step.id),duration:step.pourMethod === "drain" ? undefined : step.durationSeconds,fraction:index===brew.currentStageOrder && step.durationSeconds && step.pourMethod !== "drain" ? Math.min(1,calculateStageElapsedSeconds(brew.currentStageStartedAt,brew.pausedAt ? Date.parse(brew.pausedAt) : clock,brew.currentStagePausedSeconds)/step.durationSeconds) : 0}))} next={steps[brew.currentStageOrder+1]?.title} back={<BrewBackButton brewId={brew.id}/>} actions={state.overrun ? <><button className="primary-button" onClick={()=>decideOverrun(true)} type="button">{guidedBrewCopy.finishAndSave}</button><button onClick={()=>decideOverrun(false)} type="button">{guidedBrewCopy.discard}</button></> : <><button disabled={acting} type="button" onClick={()=>applyAction(service=>brew.executionStatus === "paused" ? service.resumeBrewSession(brew.id) : service.pauseBrewSession(brew.id))}>{brew.executionStatus === "paused" ? sheetCopy.resume : sheetCopy.pause}</button><button className="primary-button" disabled={acting || brew.executionStatus === "paused"} type="button" onClick={allStagesDone ? completeBrew : completeStage}>{allStagesDone ? guidedBrewCopy.retryCompletion : current?.pourMethod === "drain" ? sheetCopy.drainAction : sheetCopy.nextStage}</button></>} /><LiveBrewWakeLock preparing={false} active={manualActive} /></main>;
}
