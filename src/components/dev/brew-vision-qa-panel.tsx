"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrewRuntimeController } from "@/application/brew-runtime/brew-runtime-controller";
import {
  DEFAULT_VISION_QA_ROI,
  VisionQaSession,
  createVisionQaController,
  type VisionQaSnapshot,
} from "@/application/brew-runtime/vision-qa-session";
import {
  CameraCaptureService,
  FrameAnalysisService,
  FrameSampler,
} from "@/infrastructure/camera";
import { DEFAULT_POUR_DETECTION_THRESHOLDS, type NormalizedRect } from "@/domain/brew-runtime";

function monotonicNow() {
  return performance.now();
}

function displayNumber(value: number | undefined, digits = 3) {
  return value === undefined ? "—" : value.toFixed(digits);
}

function EvidenceGraph({ history }: Pick<VisionQaSnapshot, "history">) {
  const points = history.map((sample, index) => {
    const x = history.length <= 1 ? 0 : index / (history.length - 1) * 300;
    return `${x},${100 - sample.evidence * 100}`;
  }).join(" ");
  return (
    <svg className="vision-graph" viewBox="0 0 300 100" role="img" aria-label="Recent pour evidence from zero to one">
      <line x1="0" x2="300" y1="35" y2="35" className="vision-threshold vision-threshold-start" />
      <line x1="0" x2="300" y1="65" y2="65" className="vision-threshold vision-threshold-stop" />
      {points && <polyline points={points} className="vision-evidence-line" />}
    </svg>
  );
}

export function BrewVisionQaPanel() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const session = useMemo(() => new VisionQaSession({
    camera: new CameraCaptureService(),
    analyzer: new FrameAnalysisService({ roi: { ...DEFAULT_VISION_QA_ROI } }),
    createSampler: (video) => new FrameSampler(video),
    createController: (): BrewRuntimeController => createVisionQaController(),
    now: monotonicNow,
  }), []);
  const [snapshot, setSnapshot] = useState(() => session.getSnapshot());
  const [message, setMessage] = useState("Camera is off. No frames are stored or uploaded.");

  useEffect(() => {
    const unsubscribe = session.subscribe(setSnapshot);
    return () => {
      unsubscribe();
      session.dispose();
    };
  }, [session]);

  async function startCamera() {
    if (!videoRef.current) return;
    try {
      const result = await session.startCamera(videoRef.current);
      setMessage(result.state === "ready" ? "Camera ready. Start the test brew when framing is stable." : `Camera unavailable: ${result.errorCode ?? result.state}`);
    } catch {
      setMessage("Camera preview could not start. The stream can be stopped safely below.");
    }
  }

  function updateRoi(key: keyof NormalizedRect, value: string) {
    session.setRoi({ ...snapshot.roi, [key]: Number(value) });
  }

  async function copySummary() {
    const text = JSON.stringify(session.getSummary(), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setMessage("QA summary copied. It contains numeric diagnostics only.");
    } catch {
      setMessage("Clipboard unavailable. Copy the visible summary manually.");
    }
  }

  const runtime = snapshot.runtime;
  const currentStage = runtime.currentStageIndex === null ? null : runtime.stages[runtime.currentStageIndex];
  const overlayWidth = Math.min(snapshot.roi.width, 1 - snapshot.roi.x);
  const overlayHeight = Math.min(snapshot.roi.height, 1 - snapshot.roi.y);
  const summary = JSON.stringify(session.getSummary(), null, 2);

  return (
    <main className="vision-qa-page">
      <header>
        <p className="eyebrow">Development only · memory only</p>
        <h1>Live Brew Vision QA</h1>
        <p className="lead">Calibrate motion evidence and brew transitions without recording or uploading camera frames.</p>
      </header>

      <section className="vision-preview-section" aria-labelledby="camera-heading">
        <div className="section-heading"><div><p className="eyebrow">Camera</p><h2 id="camera-heading">Live preview</h2></div><strong>{snapshot.camera.state}</strong></div>
        <div className="vision-preview">
          <video ref={videoRef} aria-label="Camera preview" />
          <div className="vision-roi" aria-hidden="true" style={{
            left: `${snapshot.roi.x * 100}%`,
            top: `${snapshot.roi.y * 100}%`,
            width: `${Math.max(0, overlayWidth) * 100}%`,
            height: `${Math.max(0, overlayHeight) * 100}%`,
          }} />
        </div>
        <p className="vision-message" role="status">{message}</p>
        <div className="vision-actions">
          <button className="primary-button" type="button" onClick={startCamera} disabled={snapshot.camera.state === "requesting"}>Start Camera</button>
          <button className="secondary-button" type="button" onClick={() => { session.stopCamera(); setMessage("Camera and sampler stopped."); }}>Stop Camera</button>
          <button className="primary-button" type="button" onClick={() => session.startBrew()} disabled={snapshot.camera.state !== "ready" || snapshot.brewStarted}>Start Test Brew</button>
        </div>
      </section>

      <section className="vision-panel" aria-labelledby="roi-heading">
        <p className="eyebrow">Normalized ROI</p><h2 id="roi-heading">Analysis region</h2>
        <div className="vision-roi-controls">
          {(Object.keys(DEFAULT_VISION_QA_ROI) as Array<keyof NormalizedRect>).map((key) => (
            <label key={key}>{key} <output>{snapshot.roi[key].toFixed(2)}</output>
              <input type="range" min="0" max="1" step="0.01" value={snapshot.roi[key]} onChange={(event) => updateRoi(key, event.target.value)} />
            </label>
          ))}
        </div>
      </section>

      <section className="vision-panel" aria-labelledby="evidence-heading">
        <div className="section-heading"><div><p className="eyebrow">Recent numeric history</p><h2 id="evidence-heading">Pour evidence</h2></div><strong>{displayNumber(snapshot.analysis.lastPourEvidence)}</strong></div>
        <EvidenceGraph history={snapshot.history} />
        <div className="vision-legend"><span>Evidence</span><span>Start {DEFAULT_POUR_DETECTION_THRESHOLDS.startEvidenceThreshold}</span><span>Stop {DEFAULT_POUR_DETECTION_THRESHOLDS.stopEvidenceThreshold}</span></div>
      </section>

      <section className="vision-diagnostics" aria-label="Vision diagnostics">
        <article><h2>Camera & sampling</h2><dl>
          <div><dt>Resolution</dt><dd>{snapshot.camera.width ?? "—"} × {snapshot.camera.height ?? "—"}</dd></div>
          <div><dt>Target FPS</dt><dd>{snapshot.sampler?.targetFps ?? "—"}</dd></div>
          <div><dt>Sampled / dropped</dt><dd>{snapshot.sampler?.sampledFrameCount ?? 0} / {snapshot.sampler?.droppedFrameCount ?? 0}</dd></div>
          <div><dt>Last timestamp</dt><dd>{displayNumber(snapshot.sampler?.lastSampleTimestampMs, 1)}</dd></div>
        </dl></article>
        <article><h2>Vision</h2><dl>
          <div><dt>Motion</dt><dd>{displayNumber(snapshot.analysis.lastMotionScore)}</dd></div>
          <div><dt>Evidence / confidence</dt><dd>{displayNumber(snapshot.analysis.lastPourEvidence)} / {displayNumber(snapshot.analysis.lastConfidence)}</dd></div>
          <div><dt>Global motion</dt><dd>{snapshot.analysis.suspiciousGlobalMotion ? "Yes" : "No"}</dd></div>
          <div><dt>Lighting change</dt><dd>{snapshot.analysis.suspectedLightingChange ? "Yes" : "No"}</dd></div>
        </dl></article>
        <article><h2>Detection</h2><dl>
          <div><dt>Observed</dt><dd>{runtime.detection.observedState ?? "—"}</dd></div>
          <div><dt>Confirmed</dt><dd>{runtime.pourState}</dd></div>
          <div><dt>Positive frames</dt><dd>{runtime.detection.consecutivePositiveFrames}</dd></div>
          <div><dt>Negative frames</dt><dd>{runtime.detection.consecutiveNegativeFrames}</dd></div>
        </dl></article>
        <article><h2>Brew runtime</h2><dl>
          <div><dt>State</dt><dd>{runtime.state}</dd></div>
          <div><dt>Stage</dt><dd>{currentStage?.name ?? "Not started"}</dd></div>
          <div><dt>Stage index</dt><dd>{runtime.currentStageIndex ?? "—"}</dd></div>
          <div><dt>Manual override</dt><dd>{runtime.manualOverrideUsed ? "Yes" : "No"}</dd></div>
        </dl></article>
      </section>

      <section className="vision-panel" aria-labelledby="manual-heading">
        <p className="eyebrow">Fallback checks</p><h2 id="manual-heading">Manual controls</h2>
        <div className="vision-actions">
          <button className="secondary-button" type="button" onClick={() => session.manualPourStart()}>Manual Pour Start</button>
          <button className="secondary-button" type="button" onClick={() => session.manualPourStop()}>Manual Pour Stop</button>
          <button className="secondary-button" type="button" onClick={() => session.manualAdvanceStage()}>Manual Advance</button>
          <button className="secondary-button" type="button" onClick={() => session.resetDetection()}>Reset Detection</button>
          <button className="secondary-button" type="button" onClick={() => session.resetSession()}>Reset Session</button>
        </div>
      </section>

      <section className="vision-panel" aria-labelledby="events-heading">
        <p className="eyebrow">Latest 50</p><h2 id="events-heading">Transition events</h2>
        {snapshot.events.length === 0 ? <p className="lead">No runtime transitions yet.</p> : <ol className="vision-events">
          {[...snapshot.events].reverse().map((event, index) => <li key={`${event.timestampMs}-${event.label}-${index}`}><time>{(event.timestampMs / 1000).toFixed(2)}</time><span>{event.label}</span></li>)}
        </ol>}
      </section>

      <section className="vision-panel" aria-labelledby="summary-heading">
        <p className="eyebrow">No frames or identity</p><h2 id="summary-heading">QA summary</h2>
        <pre className="vision-summary">{summary}</pre>
        <button className="primary-button" type="button" onClick={copySummary}>Copy QA Summary</button>
      </section>
    </main>
  );
}
