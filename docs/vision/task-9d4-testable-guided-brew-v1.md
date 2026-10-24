# Task 9D-4 — Testable Guided Brew V1

## Outcome

New, not-yet-started Brew drafts now open the smallest complete guided brewing experience on `/brew/[brewId]`:

```text
camera permission and rear preview
→ place dripper in visible guide
→ explicitly confirm dripper placement
→ sustained low-motion alignment
→ READY
→ touch Start Brew or enable voice start and say「開始」
→ timed recipe runtime with visible and spoken guidance
→ automatic stage transitions
→ COMPLETED
→ Brew Complete
```

The camera and frame sampler remain active during the entire runtime. Stage timing and guidance use an independent 250 ms application timer; they do not depend on successful pour detection, spout localization, or any CV classification.

## Reused architecture

| Existing capability | Guided Brew V1 use |
| --- | --- |
| `/brew/[brewId]` and `LiveBrewDraft` | existing route, local Brew loading, Suggested Plan boundary, and fallback for already-started legacy Brews |
| `CameraCaptureService` | permission handling, rear-camera preference, media stream ownership, video attachment, and track cleanup |
| `FrameSampler` | ephemeral 10 FPS frames throughout setup and brewing |
| `FrameAnalysisService` | normalized-region motion score used only for positioning stability |
| manual dripper/calibration architecture | visible, dripper-relative ellipse and explicit user placement confirmation |
| immutable `BrewRecipeSnapshot` | source of recipe identity, stages, duration, and guidance |
| `createBrewRuntimeRecipeDefinition` | RecipeStep seconds → runtime millisecond definitions |
| `BrewRuntimeController` / Stage Engine | start, ticks, pause/resume, transition, completion, restart, and exactly-once guidance |
| `BrewGuidanceEvent` | common visible-instruction and speech input |
| `BrewSessionCoordinator` / `BrewService` | persisted Brew start, stage results, completion, and Suggested Plan synchronization |
| existing timer formatting/styles | readable total/stage elapsed time presentation |

No parallel recipe engine or camera capture implementation was introduced.

## Positioning behavior

The preview displays a centered elliptical dripper region over the live rear camera. Because the repository does not yet contain a validated dripper-presence detector, READY deliberately uses a hybrid manual/stability contract:

1. camera must be ready;
2. the user places the dripper in the guide;
3. the user taps **Dripper is inside the guide**;
4. the normalized region must remain below motion score `0.08` for at least 1,200 ms and eight sampled frames;
5. the state advances from `POSITIONING` to `ALIGNED` to `READY`.

A clearly unstable frame breaks the pre-READY evidence window. After READY, three consecutive frames at or above `0.16` are required to leave READY, preventing one-frame flicker. Once brewing starts, positioning observations cannot reset or restart the brew.

This proves stability, not semantic dripper presence. Explicit confirmation prevents an untouched empty view from automatically becoming READY. A future calibrated dripper detector can replace that confirmation/evidence source without changing the READY or start contracts.

## Start boundary

The application state records one of:

- `TOUCH`
- `VOICE`
- `SCALE_CAMERA` (reserved, not emitted in this task)

Touch and voice call the same idempotent `start(source, timestamp)` method. The first accepted signal starts persistence and the runtime; later touch, recognition, or future camera-scale signals are harmless. Touch start is always displayed when READY.

Voice start uses the browser Web Speech Recognition API when exposed as `SpeechRecognition` or `webkitSpeechRecognition`. It is opt-in through a user gesture, uses `zh-TW`, accepts a final transcript containing「開始」, stops listening before dispatching start, and falls back visibly to touch when unsupported.

## Guided display and progression

During brewing, the phone view retains:

- live camera preview and positioning ellipse;
- total elapsed time;
- active-stage elapsed time;
- current stage name;
- latest guidance message;
- proportional stage progress;
- completed/current/upcoming stage list;
- pause/resume and safe early-runtime restart controls;
- completion links.

Every 250 ms, the integration ticks the existing runtime. When active elapsed time reaches the stage's `targetPourDurationMs`, the integration stops that stage and immediately starts the next. The final timed stage transitions to `completed`. Stage completion and Brew completion are also written through the existing local services.

The Balanced V60 fixture now includes Chinese start/detail/end guidance for all four stages. Older or custom snapshots without structured guidance remain usable: their existing step instruction becomes start guidance and a simple transition message is generated at the application adapter boundary.

## System TTS

`WebGuidanceVoiceAdapter` is separate from React and the domain runtime. It:

- consumes `BrewGuidanceEvent`;
- deduplicates by stable event ID;
- creates system `SpeechSynthesisUtterance` values with `lang = zh-TW`;
- cancels an overlapping utterance before speaking the newest guidance;
- supports enable/disable;
- stores the current message for explicit replay;
- cancels speech during restart, navigation cleanup, or disposal.

Subscribing late does not replay old runtime events. Replay is an explicit user operation and therefore intentionally bypasses automatic deduplication.

## Camera continuity and cleanup

Camera frames remain memory-only and are not persisted or uploaded. Sampling continues while the independent guided runtime advances, preserving the seam for vision/trajectory consumers. Leaving the component performs idempotent cleanup of:

1. runtime and camera subscriptions;
2. frame-sampler callbacks and animation frames;
3. voice recognition;
4. speech synthesis;
5. camera tracks and the video `srcObject`.

Restart before the first persisted stage transition resets positioning, runtime state, guidance, analyzer baseline, and active speech while keeping the camera stream alive. After a stage is persisted, the UI disables same-Brew restart to avoid rewriting immutable execution history. Completion offers **Prepare another Brew** instead.

## Tests

Automated coverage includes:

- confirmed stable positioning reaches READY only after duration and sample count;
- alternating unstable positioning never reaches READY;
- post-READY hysteresis prevents one-frame flicker;
- touch and voice start each start exactly once;
- duplicate mixed start signals are ignored;
- guidance updates the display snapshot;
- each guidance event reaches the voice port once;
- timed stages advance without manual Next;
- completion state and persistence callbacks;
- restart returns to valid POSITIONING state;
- speech cancellation and session disposal;
- camera/sampler/recognition/speech cleanup scope;
- Chinese system utterance language, mute, and replay;
- voice recognition of「開始」;
- all existing runtime, camera, persistence, and application suites.

## Mobile and browser limitations

- `getUserMedia` requires a secure context. A phone must use an HTTPS deployment or trusted HTTPS development origin; another device's plain `http://<LAN-IP>` usually cannot request camera access.
- iOS Safari and some Firefox configurations do not expose Web Speech Recognition. Touch start remains fully usable.
- Browser TTS voice inventory and Chinese pronunciation vary by OS. Some mobile browsers require the first utterance to follow a user gesture; both supported start paths provide one, but device policy may still delay speech.
- Browsers may pause timers, camera sampling, or speech when backgrounded or the screen locks. Keep the page foregrounded during this V1 test.
- `facingMode: environment` is an ideal constraint. Browsers with multiple rear lenses may choose a different lens, and the task does not yet expose device selection.
- Alignment is manual confirmation plus motion stability, not visual dripper recognition or calibrated pose accuracy.
- A reload after persisted stage progress falls back to the existing manual live Brew view; resuming the full in-memory guidance event history across reload is not included.
- Scale OCR and `SCALE_CAMERA → START` remain unimplemented. The shared start-source boundary is ready for that experiment.

## Remaining blockers before a real-device brew

No code blocker remains for a first controlled phone trial, but the device must have an HTTPS origin, camera permission, audible media volume, and a newly prepared Brew. Voice start is optional because browser recognition support is not universal. Before treating positioning as automatic, a validated dripper-presence/calibration signal is still required.

## Recommended manual QA

1. Serve or deploy CupMaster over HTTPS and open it on a current phone browser.
2. Choose **Balanced V60**, complete Quick Prepare, and open the new Brew.
3. Accept camera permission; verify the rear preview appears and remains live.
4. Place the dripper inside the ellipse and tap **Dripper is inside the guide**.
5. Move the phone/dripper intermittently and verify READY does not flicker on; hold steady until `ALIGNED → READY`.
6. Enable **Speak guidance** and start once with the touch button. Verify the button cannot trigger a second start.
7. Confirm the stage name, two timers, guidance, progress bar, and stage list update while the camera remains live.
8. Verify Chinese guidance is spoken once; mute/unmute and use **Replay instruction**.
9. Pause for several seconds and verify active timer/progress do not advance; resume.
10. Let all four timed stages advance automatically and verify COMPLETED without pressing Next.
11. Continue to Brew Complete and confirm the stage results were stored.
12. Repeat with a new Brew using **Enable voice start**, say「開始」once, and confirm `VOICE` start feedback. If unsupported, record browser/OS and validate touch fallback.
13. Navigate away during a separate test and confirm the camera indicator and speech stop.

## Final readiness answers

| Question | Answer |
| --- | --- |
| Can the camera preview run during the complete brew? | Yes; capture and sampling remain active until navigation cleanup. |
| Can the user position the dripper and reach READY? | Yes, through explicit placement confirmation plus sustained motion stability. |
| Can touch start begin the recipe? | Yes, exactly once through the shared start boundary. |
| Can voice start begin the recipe? | Yes where Web Speech Recognition is supported; touch is the guaranteed fallback. |
| Can current stage/time/guidance be seen? | Yes. |
| Can guidance be heard through system TTS? | Yes where Speech Synthesis and an audible system voice are available. |
| Can the complete test recipe run without manual stage advancement? | Yes; target durations drive automatic transitions. |
| Can the flow be tested on a phone now? | Yes on an HTTPS origin with a new Brew; physical-device behavior still requires the documented manual QA pass. |
