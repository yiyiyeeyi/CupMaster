"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Brew, RecipeStep } from "@/domain";
import { formatDuration } from "@/domain";
import { BrewRuntimeController } from "@/application/brew-runtime/brew-runtime-controller";
import { GuidedBrewPersistenceService, type GuidedBrewClockAnchor } from "@/application/brew-runtime/guided-brew-persistence";
import { inspectGuidedBrewForeground } from "@/application/brew-runtime/guided-brew-foreground";
import { GuidedBrewResourceScope, GuidedBrewV1Session, type GuidedBrewStartSource } from "@/application/brew-runtime/guided-brew-v1-session";
import { BrewSessionCoordinator } from "@/application/brew-session-coordinator";
import { BrewService } from "@/application/brew-service";
import { BrewInterruptionService } from "@/application/brew-interruption-service";
import { SuggestedPlanService } from "@/application/suggested-plan-service";
import { createBrewRuntimeRecipeDefinition, type NormalizedRect } from "@/domain/brew-runtime";
import { CameraCaptureService, FrameAnalysisService, FrameSampler, type CameraCaptureSnapshot } from "@/infrastructure/camera";
import { isWebVoiceStartSupported, WebGuidanceVoiceAdapter, WebVoiceStartAdapter } from "@/infrastructure/voice";
import { LocalBrewRepository } from "@/repositories/local-brew-repository";
import { LocalLiveBrewRepository } from "@/repositories/local-live-brew-repository";
import { LocalSuggestedPlanRepository } from "@/repositories/local-suggested-plan-repository";
import { BrewBackButton } from "./brew-back-button";
import { LiveBrewWakeLock } from "./live-brew-wake-lock";
import { guidedBrewCopy as copy } from "./guided-brew-copy";

const DRIPPER_REGION: Readonly<NormalizedRect> = { x: 0.2, y: 0.22, width: 0.6, height: 0.5 };

function executionNow() {
  // Wall time includes device sleep; camera coordinates keep their own contract.
  return Date.now();
}

function withFallbackGuidance(steps: readonly RecipeStep[]): RecipeStep[] {
  return steps.map((step, index) => {
    if (step.guidance !== undefined) return step;
    const next = steps[index + 1];
    return {
      ...step,
      guidance: {
        start: step.instruction,
        end: next === undefined ? "This is the final pour." : `${step.title} complete. Prepare for ${next.title}.`,
      },
    };
  });
}

function cameraMessage(camera: CameraCaptureSnapshot) {
  switch (camera.state) {
    case "idle": return copy.cameraIdle;
    case "requesting": return copy.cameraRequesting;
    case "ready": return copy.cameraReady;
    case "permission_denied": return copy.cameraDenied;
    case "unsupported": return copy.cameraUnsupported;
    case "unavailable": return copy.cameraUnavailable;
    case "error": return copy.cameraError;
  }
}

export function GuidedBrewV1({ brew }: { brew: Brew }) {
  const router = useRouter();
  const [interruption] = useState(() => new BrewInterruptionService(new LocalBrewRepository(), new LocalLiveBrewRepository()));
  const awayRef = useRef(false);
  const redirectingRef = useRef(false);
  const overrunRef = useRef(false);
  const [overrun, setOverrun] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const samplerRef = useRef<FrameSampler | null>(null);
  const samplerUnsubscribeRef = useRef<(() => void) | null>(null);
  const cameraRequestRef = useRef(0);
  const executionAnchorRef = useRef<GuidedBrewClockAnchor | null>(null);
  const executionSaveErrorRef = useRef<string | null>(null);
  const startLock = useRef(false);
  const voiceStartRef = useRef<WebVoiceStartAdapter | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [interruptionFailed, setInterruptionFailed] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceStartSupported] = useState(isWebVoiceStartSupported);
  const [camera] = useState(() => new CameraCaptureService());
  const [analyzer] = useState(() => new FrameAnalysisService({ roi: { ...DRIPPER_REGION } }));
  const [voice] = useState(() => new WebGuidanceVoiceAdapter({ language: "zh-TW", enabled: true }));
  const [executionPersistence] = useState(() => new GuidedBrewPersistenceService(new LocalBrewRepository()));
  const [session] = useState(() => {
    const recipe = createBrewRuntimeRecipeDefinition({
      recipeId: brew.recipeSnapshot.sourceRecipeId ?? brew.sourceRecipeId,
      recipeName: brew.recipeSnapshot.title,
      steps: withFallbackGuidance([...brew.recipeSnapshot.steps].sort((left, right) => left.order - right.order)),
    });
    const runtime = new BrewRuntimeController({ sessionId: `guided:${brew.id}`, recipe, mode: "manual", runNumber: brew.executionRun ?? 1 });
    return new GuidedBrewV1Session({
      runtime,
      voice,
    });
  });
  const [snapshot, setSnapshot] = useState(() => session.getSnapshot());
  const [cameraSnapshot, setCameraSnapshot] = useState(() => camera.getSnapshot());

  const startGuidedBrew = useCallback((source: GuidedBrewStartSource) => {
    const current = session.getSnapshot();
    if (startLock.current || current.phase !== "READY"
      || (current.mode === "camera" && camera.getSnapshot().state !== "ready")) return;
    startLock.current = true;
    const brews = new LocalBrewRepository();
    const result = new BrewSessionCoordinator(
      new BrewService(brews),
      new SuggestedPlanService(brews, new LocalSuggestedPlanRepository()),
    ).startBrewSessionWithSuggestedPlanSync(brew.id);
    if (!result.ok) {
      setNotice(result.message);
      startLock.current = false;
      return;
    }
    if (result.resumed) {
      setNotice(copy.alreadyRunning);
      startLock.current = false;
      return;
    }
    const timestampMs = executionNow();
    executionAnchorRef.current = { wallTimeMs: Date.parse(result.brew.startedAt ?? ""), runtimeTimeMs: timestampMs };
    const started = session.start(source, timestampMs);
    setVoiceListening(false);
    setNotice(executionSaveErrorRef.current ?? (started
      ? current.mode === "timer_voice" ? copy.startTimerVoice : copy.startCamera
      : copy.duplicateStart));
    startLock.current = false;
  }, [brew.id, camera, session]);
  const stopCamera = useCallback(() => {
    cameraRequestRef.current += 1;
    samplerUnsubscribeRef.current?.();
    samplerUnsubscribeRef.current = null;
    samplerRef.current?.stop();
    samplerRef.current = null;
    camera.stop();
    if (videoRef.current !== null) videoRef.current.srcObject = null;
    analyzer.reset();
  }, [analyzer, camera]);

  function chooseTimerVoice() {
    stopCamera();
    session.selectMode("timer_voice");
    setNotice(copy.timerVoiceDescription);
  }

  const startCamera = useCallback(async () => {
    if (videoRef.current === null) return;
    stopCamera();
    const request = cameraRequestRef.current;
    const result = await camera.start({ preferredFacingMode: "environment", idealWidth: 1280, idealHeight: 720, idealFrameRate: 30 });
    if (request !== cameraRequestRef.current || videoRef.current === null) return;
    if (result.state !== "ready") {
      session.selectMode("timer_voice");
      setNotice(cameraMessage(result));
      return;
    }
    try {
      await camera.attachToVideo(videoRef.current);
      if (request !== cameraRequestRef.current || videoRef.current === null) return;
      session.selectMode("camera");
      setNotice(null);
      const sampler = new FrameSampler(videoRef.current, { targetFps: 10 });
      samplerUnsubscribeRef.current = sampler.subscribe((sample) => {
        const analysis = analyzer.analyze(sample);
        const diagnostics = analyzer.getSnapshot();
        const positioningMotion = diagnostics.suspiciousGlobalMotion || diagnostics.suspectedLightingChange
          ? 1
          : analysis.roiMotionScore;
        session.observePositioning(executionNow(), positioningMotion);
      });
      samplerRef.current = sampler;
      sampler.start();
    } catch {
      if (request !== cameraRequestRef.current) return;
      stopCamera();
      session.selectMode("timer_voice");
      setNotice(copy.previewFailed);
    }
  }, [analyzer, camera, session, stopCamera]);

  useEffect(() => {
    session.activate();
    const voiceStart = new WebVoiceStartAdapter(() => startGuidedBrew("VOICE"));
    voiceStartRef.current = voiceStart;
    const unsubscribeSession = session.subscribe(setSnapshot);
    const unsubscribeCamera = camera.subscribe(setCameraSnapshot);
    const unsubscribeExecution = session.subscribeExecution((execution) => {
      const anchor = executionAnchorRef.current;
      if (anchor === null) return;
      const result = executionPersistence.persist(brew.id, execution, anchor);
      executionSaveErrorRef.current = result.ok ? null : `${copy.timingSaveFailed} ${result.message}`;
      if (!result.ok) setNotice(`${copy.timingSaveFailed} ${result.message}`);
      else if (execution.phase === "COMPLETED") setNotice(copy.completedLocally);
    });
    const startTimer = window.setTimeout(() => {
      if (session.getSnapshot().mode === "camera") void startCamera();
    }, 0);
    const resources = new GuidedBrewResourceScope();
    resources.add(stopCamera);
    resources.add(() => session.dispose());
    resources.add(() => {
      voiceStart.dispose();
      voiceStartRef.current = null;
    });
    resources.add(() => {
      samplerUnsubscribeRef.current?.();
      samplerRef.current?.stop();
    });
    resources.add(unsubscribeCamera);
    resources.add(unsubscribeSession);
    resources.add(unsubscribeExecution);
    return () => {
      window.clearTimeout(startTimer);
      resources.dispose();
    };
  }, [brew.id, camera, executionPersistence, session, startCamera, startGuidedBrew, stopCamera]);

  useEffect(() => {
    if (snapshot.phase !== "BREWING") return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible" || awayRef.current) return;
      if (overrunRef.current) session.observeTime(executionNow());
      else session.tick(executionNow());
    }, 250);
    return () => window.clearInterval(interval);
  }, [session, snapshot.phase]);

  const foreground = useCallback(() => {
      if (redirectingRef.current) return;
      if (document.visibilityState !== "visible") return;
      const result = inspectGuidedBrewForeground(interruption, brew.id, session, executionNow());
      if (!result.ok) {
        overrunRef.current = false;
        setOverrun(false);
        awayRef.current = false;
        setInterruptionFailed(true);
        setNotice(`${copy.interruptionFailed} ${result.message}`);
        return;
      }
      setInterruptionFailed(false);
      setNotice(null);
      if (result.state === "expired" || (result.state === "setup" && session.getSnapshot().phase === "BREWING")) {
        redirectingRef.current = true;
        executionAnchorRef.current = null;
        session.dispose(); stopCamera();
        window.location.replace(`/brew/${brew.id}/prepare`);
        return;
      }
      overrunRef.current = result.state === "overrun";
      setOverrun(overrunRef.current);
      if (overrunRef.current) setNotice(copy.overrun);
      awayRef.current = false;
    }, [brew.id, interruption, session, stopCamera]);

  useEffect(() => {
    const leave = () => {
      awayRef.current = true;
      const result = interruption.leave(brew.id);
      if (!result.ok) setNotice(result.message);
    };
    const visibility = () => {
      if (document.visibilityState === "visible") foreground();
      else leave();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", leave);
    window.addEventListener("popstate", leave);
    window.addEventListener("pageshow", foreground);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("popstate", leave);
      window.removeEventListener("pageshow", foreground);
      interruption.leave(brew.id);
    };
  }, [brew.id, interruption, foreground]);

  function decideOverrun(finish: boolean) {
    if (startLock.current) return;
    startLock.current = true;
    const run = session.getSnapshot().runtime.runNumber;
    const result = finish ? interruption.finish(brew.id, run) : interruption.discard(brew.id, run);
    if (!result.ok) { setNotice(result.message); startLock.current = false; return; }
    executionAnchorRef.current = null;
    session.dispose(); stopCamera();
    router.replace(finish ? `/journal/${brew.id}` : `/brew/${brew.id}/prepare`);
  }

  function enableVoiceStart() {
    const active = voiceStartRef.current?.start() ?? false;
    setVoiceListening(active);
    setNotice(active ? "Listening for「開始」. Touch start remains available." : "Voice start is unavailable in this browser. Use touch start.");
  }

  const runtime = snapshot.runtime;
  const stageIndex = runtime.currentStageIndex ?? 0;
  const currentStage = runtime.recipe.stages[stageIndex];
  const guidance = snapshot.currentGuidance?.message
    ?? currentStage?.guidance?.start
    ?? "Position the dripper and prepare to brew.";
  const statusCopy = snapshot.phase === "POSITIONING"
    ? snapshot.positioning.placementConfirmed ? "Hold the dripper steady inside the guide." : "Place the dripper inside the guide, then confirm."
    : snapshot.phase === "ALIGNED" ? "Alignment looks stable. Keep still briefly."
      : snapshot.phase === "READY" ? "Ready to start by touch or voice."
        : snapshot.phase === "BREWING" ? "Guided brew running"
          : "Recipe complete";
  const withoutCamera = snapshot.mode === "timer_voice";
  const isSetup = snapshot.phase !== "BREWING" && snapshot.phase !== "COMPLETED";

  return (
    <main className="guided-brew-page">
      <div className="live-topbar">
        <BrewBackButton brewId={brew.id} onLeaving={() => { executionAnchorRef.current = null; session.dispose(); voiceStartRef.current?.stop(); stopCamera(); }} />
        <h1>Guided Brew</h1>
        <span className={`guided-status guided-status-${snapshot.phase.toLowerCase()}`}>{snapshot.phase}</span>
      </div>

      <section className="guided-camera-card" aria-labelledby="guided-camera-heading">
        <div className="section-heading"><div><p className="eyebrow">{withoutCamera ? copy.timerVoiceLabel : copy.cameraLabel}</p><h2 id="guided-camera-heading">{withoutCamera ? copy.timerVoiceHeading : copy.cameraHeading}</h2></div><strong>{cameraSnapshot.state}</strong></div>
        <div className="guided-camera-preview">
          <video ref={videoRef} aria-label="Live rear camera preview" />
          {!withoutCamera ? <div className={`guided-dripper-region guided-dripper-region-${snapshot.phase.toLowerCase()}`} aria-hidden="true" /> : null}
          <span className="guided-camera-state">{withoutCamera ? copy.timerVoiceLabel : snapshot.phase}</span>
        </div>
        <p className="guided-position-copy" role="status"><strong>{withoutCamera ? copy.timerVoiceDescription : statusCopy}</strong><span>{cameraMessage(cameraSnapshot)}</span></p>
        {!withoutCamera && cameraSnapshot.state === "ready" && isSetup && !snapshot.positioning.placementConfirmed
          ? <button className="secondary-button guided-full-button" type="button" onClick={() => session.confirmDripperPlacement()}>Dripper is inside the guide</button>
          : null}
        {cameraSnapshot.state !== "ready" && cameraSnapshot.state !== "requesting"
          ? <button className="secondary-button guided-full-button" type="button" onClick={() => void startCamera()}>{copy.retryCamera}</button>
          : null}
      </section>

      {snapshot.phase === "BREWING" || snapshot.phase === "COMPLETED" ? (
        <>
          <div className="running-timers">
            <div><span>Total elapsed</span><time dateTime={`PT${Math.floor(snapshot.elapsedMs / 1_000)}S`}>{formatDuration(Math.floor(snapshot.elapsedMs / 1_000))}</time></div>
            <div><span>Stage elapsed</span><time dateTime={`PT${Math.floor(snapshot.stageElapsedMs / 1_000)}S`}>{formatDuration(Math.floor(snapshot.stageElapsedMs / 1_000))}</time></div>
          </div>
          <section className="guided-instruction" aria-live="polite">
            <p className="eyebrow">Current guidance</p>
            <h2>{snapshot.phase === "COMPLETED" ? "Brew complete" : currentStage?.name}</h2>
            <p>{guidance}</p>
            <div className="guided-progress" aria-label={`Stage progress ${Math.round(snapshot.stageProgress * 100)} percent`}><span style={{ width: `${snapshot.stageProgress * 100}%` }} /></div>
            <span>{Math.min(stageIndex + 1, runtime.stages.length)} / {runtime.stages.length} stages</span>
          </section>
          <ol className="guided-stage-list" aria-label="Recipe stage progress">
            {runtime.stages.map((stage, index) => <li className={stage.completed ? "is-complete" : index === runtime.currentStageIndex ? "is-current" : ""} key={stage.stageId}><span>{stage.completed ? "✓" : index + 1}</span><strong>{stage.name}</strong></li>)}
          </ol>
        </>
      ) : null}

      <section className="guided-voice-controls" aria-label="Voice guidance controls">
        <label><input type="checkbox" checked={speechEnabled} onChange={(event) => { setSpeechEnabled(event.target.checked); session.setSpeechEnabled(event.target.checked); }} /> Speak guidance</label>
        <button className="secondary-button" type="button" disabled={!speechEnabled || snapshot.currentGuidance === null} onClick={() => session.replayGuidance()}>Replay instruction</button>
      </section>

      <LiveBrewWakeLock preparing={isSetup} active={snapshot.phase !== "COMPLETED"} />
      {notice !== null ? <p className="notice" role="status">{notice}</p> : null}
      {interruptionFailed ? <button className="secondary-button" type="button" onClick={foreground}>{copy.retryProgress}</button> : null}

      <section className="guided-actions">
        {isSetup && !withoutCamera ? <button className="secondary-button" type="button" onClick={chooseTimerVoice}>{copy.chooseTimerVoice}</button> : null}
        {snapshot.phase === "READY" ? <>
          <button className="primary-button" type="button" onClick={() => { voiceStartRef.current?.stop(); setVoiceListening(false); startGuidedBrew("TOUCH"); }}>Start Brew</button>
          <button className="secondary-button" type="button" disabled={!voiceStartSupported || voiceListening} onClick={enableVoiceStart}>{voiceListening ? "Listening for 開始…" : "Enable voice start"}</button>
          <p>Say「開始」after enabling voice start. Touch start always remains available.</p>
        </> : null}
        {snapshot.phase === "POSITIONING" || snapshot.phase === "ALIGNED"
          ? <button className="primary-button" type="button" disabled>Start available when READY</button>
          : null}
        {overrun ? <>
          <p role="status">{copy.overrun}</p>
          <button className="primary-button" type="button" onClick={() => decideOverrun(true)}>{copy.finishAndSave}</button>
          <button className="secondary-button" type="button" onClick={() => decideOverrun(false)}>{copy.discard}</button>
        </> : snapshot.phase === "BREWING" ? <>
          {runtime.state === "paused"
            ? <button className="secondary-button" type="button" onClick={() => session.resume(executionNow())}>Resume</button>
            : <button className="secondary-button" type="button" onClick={() => session.pause(executionNow())}>Pause</button>}
        </> : null}
        {snapshot.phase === "COMPLETED" ? <>
          <Link className="primary-button" href={`/brew/${brew.id}/complete`}>Continue to Brew Complete</Link>
          <Link className="secondary-button" href={`/recipes/${brew.sourceRecipeId}/prepare`}>Prepare another Brew</Link>
        </> : null}
      </section>
    </main>
  );
}
