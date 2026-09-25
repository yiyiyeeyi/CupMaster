# Task 9C-4 Step 0 — session-003 temporal coverage audit

Status: **PASS — sufficient temporal coverage for the first hybrid video prototype**

## Scope and method

Only `data/vision/raw/session-003.mov` was inspected. The audit used a 1 fps whole-video contact sheet followed by 4 fps review around candidate entry/exit transitions. It did not create dense annotations, train a model, alter a split, or access session 004 or sessions 005–010.

- Container duration: `84.358 s`; video stream duration: `84.283 s`.
- Video: HEVC, `1080×1920`, 60 fps, 5,057 frames.
- The camera/background remain materially stationary. No hard cut was found visually or by an FFmpeg scene-change scan at threshold `0.30`.
- Timestamps below are observational boundaries rounded to the nearest `0.25 s`; they are suitable prototype windows, not frame-level ground truth.

## Event timeline

| Start | End | Event | Target visibility | Acquisition | Tracking | Lost detection | Reacquisition | Edge robustness |
| ---: | ---: | --- | --- | :---: | :---: | :---: | :---: | :---: |
| 00:00.00 | 00:05.25 | Initial empty scene | Not visible | baseline | no | yes | no | no |
| 00:05.25 | 00:08.25 | Intermittent approach, hand present | Brief partial top-edge glimpses; outlet not consistently usable | stress only | no | yes | no | yes |
| 00:08.25 | 00:09.75 | First stable entry/acquisition | Partial at first, then outlet and main spout become usable | **yes** | warm-up | no | no | **yes** |
| 00:09.75 | 00:22.25 | First continuous active pour | Outlet remains visible; spout moves continuously around the bed | no | **yes** | no | no | top shaft only |
| 00:22.25 | 00:22.75 | First lift and exit | Rapidly becomes partial, then leaves; a short water column outlasts the outlet | no | transition | **yes** | no | **yes** |
| 00:22.75 | 00:31.25 | Empty/lost interval | Not visible | no | no | **yes** | precondition | no |
| 00:31.25 | 00:31.75 | First clear re-entry | Enters from the top-left boundary and becomes fully localizable | no | warm-up | no | **yes** | **yes** |
| 00:31.75 | 00:45.75 | Second continuous active pour | Continuously visible, smooth spatial movement, stable camera | no | **yes** | no | no | top shaft only |
| 00:45.75 | 00:46.25 | Second exit | Outlet lifts through the upper boundary and disappears | no | transition | **yes** | no | **yes** |
| 00:46.25 | 01:02.25 | Empty/lost interval | Not visible | no | no | **yes** | precondition | no |
| 01:02.25 | 01:02.75 | Second re-entry | Partial edge entry followed by usable outlet | no | warm-up | no | **yes** | **yes** |
| 01:02.75 | 01:08.00 | Third continuous active pour | Visible and moving continuously | no | **yes** | no | no | top shaft only |
| 01:08.00 | 01:08.50 | Third exit | Outlet leaves; residual stream is briefly visible | no | transition | **yes** | no | **yes** |
| 01:08.50 | 01:24.28 | Final empty scene | Not visible | no | no | **yes** | no | no |

## Required coverage

### Acquisition

**PASS.** The cleanest initial acquisition transition is `00:08.25–00:09.75`. The earlier `00:05.25–00:08.25` intermittent edge/hand interval is useful as a harder false-start stress case but should not be the sole acquisition gate.

### Sustained tracking

**PASS.** Three continuous active-pour segments are present:

- `00:09.75–00:22.25`, approximately 12.5 s; clean LK subwindow `00:10.00–00:21.75`.
- `00:31.75–00:45.75`, approximately 14.0 s; preferred LK subwindow `00:32.00–00:45.50`.
- `01:02.75–01:08.00`, approximately 5.25 s; secondary LK subwindow `01:03.00–01:07.75`.

At 60 fps, the stationary camera, textured/reflective outlet, and moderate frame-to-frame displacement make the first two segments suitable for multi-frame LK feasibility testing. Water/reflection changes near the outlet remain a realistic robustness challenge.

### Exit and lost detection

**PASS.** The clearest first exit occurs during `00:22.25–00:22.75`, followed by an unambiguous empty interval until `00:31.25`. Two additional exits occur near `00:45.75–00:46.25` and `01:08.00–01:08.50`.

### Re-entry and reacquisition

**PASS.** The best reacquisition event is `00:31.25–00:31.75`, after approximately 8.5 s of confirmed absence. A second independent reacquisition occurs at `01:02.25–01:02.75` after a much longer lost interval.

## Edge and interference audit

- **Image-edge interaction:** present at all entries/exits. The outlet is partially visible near the upper boundary during `00:05.25–00:09.75`, `00:22.25–00:22.75`, `00:31.25–00:31.75`, `00:45.75–00:46.25`, `01:02.25–01:02.75`, and `01:08.00–01:08.50`. During normal pouring, the upstream spout shaft remains clipped by the top boundary while the physical outlet stays visible.
- **Hand interference:** a hand is visible around the intermittent first approach and early acquisition, approximately `00:05.75–00:10.75`. It is adjacent to the spout and contributes clutter/partial visibility, but does not create a long full-outlet occlusion.
- **Reflections:** the metal outlet is reflective throughout all active segments. Reflection and water appearance vary during motion.
- **Fast movement:** short lift/entry bursts occur around each transition, especially `00:22.25–00:22.75`, `00:45.75–00:46.25`, and `01:08.00–01:08.50`.
- **Temporary partial visibility:** present during every boundary transition and intermittently during the early hand-assisted approach.
- **Camera motion:** no material camera motion observed; the dripper and background remain stable.
- **Scene transition:** none observed or detected.

## Recommended Task 9C-4 windows

Use `00:07.75–00:47.50` as the primary continuous end-to-end prototype window. It contains initial acquisition, sustained tracking, first exit/lost state, an approximately 8.5 s no-target interval, clear reacquisition, a second sustained tracking segment, and a second exit.

Focused diagnostic windows:

| Window | Purpose |
| --- | --- |
| `00:05.00–00:10.75` | Edge/hand interference and acquisition false-start robustness |
| `00:10.00–00:21.75` | First clean sustained LK segment |
| `00:21.75–00:23.50` | Exit, residual water stream, and lost transition |
| `00:30.50–00:32.50` | Re-entry and reacquisition |
| `00:32.00–00:45.50` | Preferred sustained LK segment |
| `00:45.50–00:47.00` | Second exit/lost transition |
| `01:01.50–01:09.50` | Independent re-entry, shorter pour, and exit repeat |

## Decision

| Required gate | Result |
| --- | --- |
| Acquisition | **PASS** |
| Sustained tracking | **PASS** |
| Exit/lost | **PASS** |
| Re-entry/reacquisition | **PASS** |

Overall temporal coverage: **PASS**.

Proceed directly to the Task 9C-4 hybrid video prototype using the windows above. No supplemental recording is required for the first prototype evaluation. This audit does not claim broad temporal generalization; it only establishes that session-003 contains all required event types for the initial validation-only run.

Session-004 accessed: **no**  
External benchmark accessed: **no**  
Training started: **no**  
Production runtime modified: **no**
