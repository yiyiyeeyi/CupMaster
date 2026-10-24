"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Brew, RecipeStep } from "@/domain";
import { formatDuration } from "@/domain";
import { BrewRuntimeController } from "@/application/brew-runtime/brew-runtime-controller";
import { GuidedBrewResourceScope, GuidedBrewV1Session, type GuidedBrewStartSource } from "@/application/brew-runtime/guided-brew-v1-session";
import { BrewSessionCoordinator } from "@/application/brew-session-coordinator";
import { BrewService } from "@/application/brew-service";
import { SuggestedPlanService } from "@/application/suggested-plan-service";
import { createBrewRuntimeRecipeDefinition, type NormalizedRect } from "@/domain/brew-runtime";
import { CameraCaptureService, FrameAnalysisService, FrameSampler, type CameraCaptureSnapshot } from "@/infrastructure/camera";
import { isWebVoiceStartSupported, WebGuidanceVoiceAdapter, WebVoiceStartAdapter } from "@/infrastructure/voice";
import { LocalBrewRepository } from "@/repositories/local-brew-repository";
import { LocalSuggestedPlanRepository } from "@/repositories/local-suggested-plan-repository";

const DRIPPER_REGION: Readonly<NormalizedRect> = { x: 0.2, y: 0.22, width: 0.6, height: 0.5 };

function monotonicNow() {
  return performance.now();
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
    case "idle": return "Camera is off.";
    case "requesting": return "Requesting rear camera access…";
    case "ready": return "Rear camera preview is active throughout the brew.";
    case "permission_denied": return "Camera permission was denied. Allow camera access in browser settings, then retry.";
    case "unsupported": return "This browser does not expose camera capture. Use a current mobile browser over HTTPS.";
    case "unavailable": return "The rear camera is unavailable or already in use.";
    case "error": return "The camera could not start. Retry or close other camera applications.";
  }
}

export function GuidedBrewV1({ brew }: { brew: Brew }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const samplerRef = useRef<FrameSampler | null>(null);
  const samplerUnsubscribeRef = useRef<(() => void) | null>(null);
  const startLock = useRef(false);
  const voiceStartRef = useRef<WebVoiceStartAdapter | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceStartSupported] = useState(isWebVoiceStartSupported);
  const [camera] = useState(() => new CameraCaptureService());
  const [analyzer] = useState(() => new FrameAnalysisService({ roi: { ...DRIPPER_REGION } }));
  const [voice] = useState(() => new WebGuidanceVoiceAdapter({ language: "zh-TW", enabled: true }));
  const [session] = useState(() => {
    const recipe = createBrewRuntimeRecipeDefinition({
      recipeId: brew.recipeSnapshot.sourceRecipeId ?? brew.sourceRecipeId,
      recipeName: brew.recipeSnapshot.title,
      steps: withFallbackGuidance([...brew.recipeSnapshot.steps].sort((left, right) => left.order - right.order)),
    });
    const runtime = new BrewRuntimeController({ sessionId: `guided:${brew.id}`, recipe, mode: "manual" });
    return new GuidedBrewV1Session({
      runtime,
      voice,
      onStageCompleted: (stageIndex) => {
        const result = new BrewService(new LocalBrewRepository()).completeCurrentStage(brew.id, stageIndex);
        if (!result.ok) setNotice(`Stage completed in the guide, but local save failed: ${result.message}`);
      },
      onCompleted: () => {
        const result = new BrewService(new LocalBrewRepository()).completeBrewSession(brew.id);
        setNotice(result.ok ? "Brew completed and saved locally as a draft." : `Brew completed, but local save failed: ${result.message}`);
      },
    });
  });
  const [snapshot, setSnapshot] = useState(() => session.getSnapshot());
  const [cameraSnapshot, setCameraSnapshot] = useState(() => camera.getSnapshot());

  const startGuidedBrew = useCallback((source: GuidedBrewStartSource) => {
    if (startLock.current || session.getSnapshot().phase !== "READY") return;
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
    const started = session.start(source, monotonicNow());
    setVoiceListening(false);
    setNotice(started
      ? `Brew started by ${source === "VOICE" ? "voice" : "touch"}. Camera remains active.`
      : "The brew was already started; the duplicate signal was ignored.");
    startLock.current = false;
  }, [brew.id, session]);
  const startCamera = useCallback(async () => {
    if (videoRef.current === null) return;
    samplerUnsubscribeRef.current?.();
    samplerRef.current?.stop();
    samplerRef.current = null;
    analyzer.reset();
    const result = await camera.start({ preferredFacingMode: "environment", idealWidth: 1280, idealHeight: 720, idealFrameRate: 30 });
    if (result.state !== "ready" || videoRef.current === null) return;
    try {
      await camera.attachToVideo(videoRef.current);
      const sampler = new FrameSampler(videoRef.current, { targetFps: 10 });
      samplerUnsubscribeRef.current = sampler.subscribe((sample) => {
        const analysis = analyzer.analyze(sample);
        const diagnostics = analyzer.getSnapshot();
        const positioningMotion = diagnostics.suspiciousGlobalMotion || diagnostics.suspectedLightingChange
          ? 1
          : analysis.roiMotionScore;
        session.observePositioning(sample.timestampMs, positioningMotion);
      });
      samplerRef.current = sampler;
      sampler.start();
    } catch {
      setNotice("Camera permission succeeded, but the preview could not play. Tap Retry Camera.");
    }
  }, [analyzer, camera, session]);

  useEffect(() => {
    const video = videoRef.current;
    session.activate();
    const voiceStart = new WebVoiceStartAdapter(() => startGuidedBrew("VOICE"));
    voiceStartRef.current = voiceStart;
    const unsubscribeSession = session.subscribe(setSnapshot);
    const unsubscribeCamera = camera.subscribe(setCameraSnapshot);
    const startTimer = window.setTimeout(() => void startCamera(), 0);
    const resources = new GuidedBrewResourceScope();
    resources.add(() => {
      camera.stop();
      if (video !== null) video.srcObject = null;
    });
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
    return () => {
      window.clearTimeout(startTimer);
      resources.dispose();
    };
  }, [camera, session, startCamera, startGuidedBrew]);

  useEffect(() => {
    if (snapshot.phase !== "BREWING") return;
    const interval = window.setInterval(() => session.tick(monotonicNow()), 250);
    return () => window.clearInterval(interval);
  }, [session, snapshot.phase]);

  function enableVoiceStart() {
    const active = voiceStartRef.current?.start() ?? false;
    setVoiceListening(active);
    setNotice(active ? "Listening for「開始」. Touch start remains available." : "Voice start is unavailable in this browser. Use touch start.");
  }

  function restartBeforeFirstTransition() {
    voiceStartRef.current?.stop();
    setVoiceListening(false);
    analyzer.reset();
    session.restart(monotonicNow());
    setNotice("Guided runtime restarted. Reconfirm the dripper position; the camera stayed active.");
  }

  const runtime = snapshot.runtime;
  const stageIndex = runtime.currentStageIndex ?? 0;
  const currentStage = runtime.recipe.stages[stageIndex];
  const completedStages = runtime.stages.filter((stage) => stage.completed).length;
  const guidance = snapshot.currentGuidance?.message
    ?? currentStage?.guidance?.start
    ?? "Position the dripper and prepare to brew.";
  const statusCopy = snapshot.phase === "POSITIONING"
    ? snapshot.positioning.placementConfirmed ? "Hold the dripper steady inside the guide." : "Place the dripper inside the guide, then confirm."
    : snapshot.phase === "ALIGNED" ? "Alignment looks stable. Keep still briefly."
      : snapshot.phase === "READY" ? "Ready to start by touch or voice."
        : snapshot.phase === "BREWING" ? "Guided brew running"
          : "Recipe complete";
  const canRestart = snapshot.phase === "BREWING" && completedStages === 0;

  return (
    <main className="guided-brew-page">
      <div className="live-topbar">
        <Link aria-label="Back to Quick Prepare" className="back-link" href={`/recipes/${brew.sourceRecipeId}/prepare`}>←</Link>
        <h1>Guided Brew</h1>
        <span className={`guided-status guided-status-${snapshot.phase.toLowerCase()}`}>{snapshot.phase}</span>
      </div>

      <section className="guided-camera-card" aria-labelledby="guided-camera-heading">
        <div className="section-heading"><div><p className="eyebrow">Live rear camera</p><h2 id="guided-camera-heading">Position the dripper</h2></div><strong>{cameraSnapshot.state}</strong></div>
        <div className="guided-camera-preview">
          <video ref={videoRef} aria-label="Live rear camera preview" />
          <div className={`guided-dripper-region guided-dripper-region-${snapshot.phase.toLowerCase()}`} aria-hidden="true" />
          <span className="guided-camera-state">{snapshot.phase}</span>
        </div>
        <p className="guided-position-copy" role="status"><strong>{statusCopy}</strong><span>{cameraMessage(cameraSnapshot)}</span></p>
        {cameraSnapshot.state === "ready" && snapshot.phase !== "BREWING" && snapshot.phase !== "COMPLETED" && !snapshot.positioning.placementConfirmed
          ? <button className="secondary-button guided-full-button" type="button" onClick={() => session.confirmDripperPlacement()}>Dripper is inside the guide</button>
          : null}
        {cameraSnapshot.state !== "ready" && cameraSnapshot.state !== "requesting"
          ? <button className="secondary-button guided-full-button" type="button" onClick={() => void startCamera()}>Retry Camera</button>
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

      {notice !== null ? <p className="notice" role="status">{notice}</p> : null}

      <section className="guided-actions">
        {snapshot.phase === "READY" ? <>
          <button className="primary-button" type="button" onClick={() => { voiceStartRef.current?.stop(); setVoiceListening(false); startGuidedBrew("TOUCH"); }}>Start Brew</button>
          <button className="secondary-button" type="button" disabled={!voiceStartSupported || voiceListening} onClick={enableVoiceStart}>{voiceListening ? "Listening for 開始…" : "Enable voice start"}</button>
          <p>Say「開始」after enabling voice start. Touch start always remains available.</p>
        </> : null}
        {snapshot.phase === "POSITIONING" || snapshot.phase === "ALIGNED"
          ? <button className="primary-button" type="button" disabled>Start available when READY</button>
          : null}
        {snapshot.phase === "BREWING" ? <>
          {runtime.state === "paused"
            ? <button className="secondary-button" type="button" onClick={() => session.resume(monotonicNow())}>Resume</button>
            : <button className="secondary-button" type="button" onClick={() => session.pause(monotonicNow())}>Pause</button>}
          <button className="secondary-button" type="button" disabled={!canRestart} onClick={restartBeforeFirstTransition}>Restart setup</button>
        </> : null}
        {snapshot.phase === "COMPLETED" ? <>
          <Link className="primary-button" href={`/brew/${brew.id}/complete`}>Continue to Brew Complete</Link>
          <Link className="secondary-button" href={`/recipes/${brew.sourceRecipeId}/prepare`}>Prepare another Brew</Link>
        </> : null}
      </section>
    </main>
  );
}
