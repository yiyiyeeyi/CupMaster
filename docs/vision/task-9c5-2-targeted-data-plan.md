# Task 9C-5.2 — Targeted First-Party Data Plan

Status: **PROPOSED — collection not started**

## Objective

Close the specific cross-session gaps that remain after the Global→Local experiment, while preserving a genuinely unseen first-party final test. This is not a request for random bulk frames or dense adjacent sampling.

## Minimum session structure

Record at least **four new first-party sessions** with capture setup reset between sessions:

| Session role | Minimum sessions | Approximate unique annotated frames | Use |
| --- | ---: | ---: | --- |
| Development | 3 | 35–45 each; 105–135 total | Training and cross-session validation |
| Final first-party test | 1 | 30–40 sparse frames plus full continuous video | Remain sealed until architecture, thresholds, and temporal policy are frozen |

The three development sessions should use different capture occasions and vary kettle/brewer placement, lighting, background, and camera distance. Do not split one continuous recording into nominal sessions.

The final-test session must never be used for checkpoint selection, threshold selection, ROI-size selection, architecture selection, or debugging model behavior. A purely technical media-decoding fix may be verified without inspecting predictions, and must be documented.

## Development-frame composition

Target approximately **75% positive / 25% intentional negative** within each development session: about 26–34 positives and 9–11 negatives per session. Diversity takes priority over exact ratios.

Each requirement below should appear in at least two development sessions. Counts overlap deliberately; one frame may satisfy several conditions.

| Missing coverage | Minimum useful development coverage |
| --- | --- |
| Dripper radius / image width around 0.25 | 18 positives total, spread across ≥2 sessions |
| Intermediate scale 0.25–0.30 | 18 positives total across all 3 sessions |
| Existing-scale control around 0.29–0.33 | 12 positives total |
| Tip x from 0.55 to approximately 0.70 | 18 positives, including ≥6 near 0.65–0.70 |
| Center/left control positions | 12 positives |
| Top-edge spout truncation | 18 positives with mild and moderate truncation |
| Reflective spout plus visible water | 18 positives |
| Reflective spout, water off | 12 positives |
| Dark brewer/background | 18 positives plus 8 paired negatives |
| High saturation/highlight | 15 positives plus 6 paired negatives |
| Low local spout contrast | 18 positives |
| Partial hand interference | 12 positives plus 6 hard negatives |
| Water-on / water-off positives | At least 15 of each |

Avoid satisfying a row with near-adjacent frames from one pour cycle. For each condition, sample distinct positions or events separated enough to change geometry or visual state.

## Paired positive/negative design

Every development setup should include both target-present and target-absent frames without changing the background, brewer, exposure, or camera placement. Minimum per development session:

- 6 clean empty-setup negatives
- 2–3 hand/dripper/server hard negatives
- 1–2 reflective-water or metal-structure hard negatives
- matching positives from the same scene

This pairing is specifically intended to prevent another presence mechanism from learning session, brewer, or background identity instead of target evidence.

## Continuous-video requirements

Each new session should include at least two complete entry → active pour → exit cycles and one re-entry. Include:

- one slow/stable cycle suitable for localization inspection;
- one normal-speed cycle with mild hand interference;
- clear absence intervals of at least 2 seconds;
- at least one right-side/top-edge entry;
- no hard cut within an evaluated cycle.

Continuous video is retained for later temporal evaluation. Task 9C-5.2 does not reconnect tracking.

## Split and evaluation policy

1. Add the three new development sessions to session-level leave-one-session-out analysis; never mix frames from one session across train and validation in a fold.
2. Use development sessions to select global architecture, local crop policy, confidence evidence, and thresholds.
3. Freeze code, checkpoints, thresholds, and temporal policy before opening the new final-test session.
4. Run the new final-test session once and report failure without tuning on it.
5. Keep sessions 005–010 external benchmark completely separate until first-party generalization passes.

## Exit criteria before tracking resumes

On every development fold—not only pooled averages:

- global coarse positive locate rate ≥95%;
- keypoint-derived negative false-positive rate ≤5%;
- selected local ROI containment ≥95%;
- refined normalized median ≤0.15 radii;
- refined P90 ≤0.35 radii;
- no session with normalized mean >0.30 radii;
- presence evidence has no session-level collapse comparable to Gate B.

These are proposed development gates and must be frozen before opening the new final-test session. They are not retroactively tuned success criteria for Task 9C-5.2.

## Current status

- Collection started: no
- Annotation started: no
- Final-test session selected: no
- External benchmark accessed: no
