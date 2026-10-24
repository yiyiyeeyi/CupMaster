# Task 9C-5.11 — Critical-Case Targeted Data Repair Plan

## Decision

Collect **four short first-party development sessions**, tentatively numbered `session-015` through `session-018`, with three controlled clips per session and 16 selected frames per session. The resulting target is **64 frames: 40 positives and 24 intentional negatives**.

This is the smallest design that gives both unresolved appearance families two genuinely independent setups while also collecting same-scene water and negative contrasts. It does not use session-014 or external benchmark sessions 005–010.

## Why four sessions is the minimum

Task 9C-5.10 showed two distinct critical appearance failures:

1. dark/reflective/top-edge, dominated by session-004;
2. white/highlight/short/right-edge, unstable in session-012 and fragile in session-013.

Each family must appear in at least two independent sessions. Two dark sessions plus two white sessions is therefore the minimum arrangement that avoids making any critical family synonymous with one recording session. Water and hard-negative states can be embedded in all four without adding sessions.

A session means a separately staged capture, not a restart of an otherwise identical recording. Within each pair, change at least two material domain factors, preferably kettle/spout plus lighting or camera position. Repositioning the same video by a few pixels is not independence.

## Session matrix

| Proposed session | Primary setup | Required differences | Required positive states | Required matched negatives |
|---|---|---|---|---|
| session-015 | Dark reflective A | dark kettle/spout, top entry, one dripper/background/light setup | top-edge water-off and water-on; full and partial truncation | outlet absent with kettle body/shaft; hand only; rim/server reflection |
| session-016 | Dark reflective B | different kettle if available; otherwise different dripper, lighting and camera angle from 015 | same semantic states as 015, with a distinct reflection pattern | same-scene absent/hand/reflection/empty variants |
| session-017 | White/highlight A | light spout, bright lighting, right entry, one dripper/background | short right-edge water-off and water-on; mildly less truncated reference | outlet absent with highlight/shaft; hand only; rim/wet-bed reflection |
| session-018 | White/highlight B | different light kettle if available; otherwise different lighting, dripper and camera position from 017 | same semantic states as 017, with a distinct highlight/background | same-scene absent/hand/reflection/empty variants |

All four sessions include water-on, water-off and same-scene negatives. Dark/reflective/top-edge exists in 015 and 016; white/highlight/right-edge/short-visible exists in 017 and 018. No required family depends on only one session.

## Capture protocol

### Per-session clips

Record three clips per session, each approximately **15–25 seconds**:

1. **Visible outlet, water off**
   - enter the required edge region slowly;
   - hold several identifiable full/partial views;
   - include short-visible and less-truncated reference states;
   - no pour stream.

2. **Visible outlet, water on**
   - repeat approximately the same path, scale and edge interaction;
   - include stable water overlap and mild motion;
   - keep the physical outlet identifiable in positive frames.

3. **Matched absence and distractors**
   - preserve camera, dripper, lighting and background;
   - move the outlet completely out of the search region;
   - show kettle body or shaft-like structures without the outlet;
   - show hand/tool only;
   - include rim highlight, wet bed/foam, server reflection and empty-dripper states where available.

Do not reposition the camera, dripper or main light between these three clips. That invariance is what makes the positive/negative contrast useful for presence learning. Reset the setup only when starting the next independent session.

### Capture constraints

- The outlet must be genuinely localizable in every positive selected for annotation.
- Edge cases should be difficult but not unusable: retain enough physical tube/outlet evidence for a human to label confidently.
- For top/right truncation, vary the visible length rather than recording a dense stationary sequence.
- Capture water-on and water-off at comparable position, scale and orientation.
- Do not manufacture negatives by selecting a blurred positive or a frame where label status is ambiguous.
- Avoid hard cuts, severe motion blur, exposure clipping that erases the physical boundary, and dense adjacent frames.
- Record at least one dry-bed and one wet-bed state per appearance pair where practical.

## Frame selection budget

Select **16 representative frames per session**:

| State | Frames/session | Label role |
|---|---:|---|
| Outlet visible, water off | 5 | positive |
| Outlet visible, water on | 5 | positive |
| Outlet absent, kettle body/shaft or hand/tool present | 2 | negative |
| Reflection/rim/wet bed/foam/server distractor, outlet absent | 2 | negative |
| Empty or neutral matched setup | 2 | negative |
| **Total** | **16** | **10 positive / 6 negative** |

Overall target:

- Sessions: 4
- Clips: 12 total, 3 per session
- Raw duration: approximately 45–75 seconds per session
- Selected frames: 64
- Positives: 40
- Negatives: 24
- Positive/negative balance: 62.5% / 37.5%

The higher negative share than the original feasibility set is intentional. Task 9C-5.10 showed a session-012 recall/specificity tradeoff; matched negatives are part of the repair target, not incidental background coverage.

If one session cannot provide six unambiguous matched negatives, do not replace them with arbitrary negatives from another scene. Re-record the missing states in the same setup.

## Required domain coverage

Minimum counts are selection targets, not quotas that justify near-duplicates. One frame may satisfy multiple rows.

| Domain condition | Sessions required | Minimum selected frames | Positive / negative intent |
|---|---:|---:|---|
| Dark reflective spout | 015, 016 | 20 | 20 positive, split water-on/off |
| Top-edge interaction | 015, 016 | at least 12 | positive; mix partial and milder truncation |
| White/highlight spout | 017, 018 | 20 | 20 positive, split water-on/off |
| Right-edge interaction | 017, 018 | at least 12 | positive; mix short and reference length |
| Short visible segment | all four if practical; mandatory 017/018 | at least 16 | positive, not ambiguous |
| Water on | all four | 20 | 5 positive/session |
| Water off with outlet visible | all four | 20 | 5 positive/session |
| Kettle/shaft/hand matched negatives | all four | at least 8 | negative |
| Reflection/rim/wet-bed/server matched negatives | all four | at least 8 | negative |
| Empty/neutral matched setup | all four | 8 | negative |

### Coverage matrix

| Family | 015 | 016 | 017 | 018 |
|---|:---:|:---:|:---:|:---:|
| DARK_REFLECTIVE_TOP_EDGE | primary | primary | — | — |
| WHITE_HIGHLIGHT_RIGHT_EDGE | — | — | primary | primary |
| WATER_MATCHED_PAIRS | required | required | required | required |
| HARD_NEGATIVE_MATCHED_SCENES | required | required | required | required |

## Matched scene units

Within every session, build at least two matched units. A unit shares camera, dripper, lighting, background, crop and approximate kettle path:

- A: outlet visible, water off;
- B: outlet visible, water on;
- C: outlet absent while kettle body/shaft remains plausible;
- D: hand/tool only;
- E: reflection, rim, wet-bed or water-like distractor without the outlet;
- F: empty or neutral dripper setup.

The selected frames should retain a `matchedUnitId`, such as `session-015-unit-a`, plus a `state` field. This permits pair-aware QA and prevents random frame splitting from destroying the contrast structure.

## Annotation schema

### Required on all 40 positives

- `spout_tip`: one point at the physical liquid outlet center, with visibility state.
- `gooseneck_spout`: one axis-aligned rectangle around the visible main spout assembly, including the outlet and excluding kettle body, hand and water stream.
- `dripper`: visible outer brewing-opening rim geometry for calibration/QA.

### Required on all 24 negatives

- no `spout_tip`;
- no `gooseneck_spout`;
- `dripper` geometry where the brewing opening is visible;
- explicit intentional-negative state and distractor category in metadata.

Do not reintroduce `spout_neck_base`.

### Centerline subset

Annotate `gooseneck_spout_centerline` on **24 of the 40 positives**, six per session:

- 2 difficult water-off edge/truncation frames;
- 2 corresponding water-on frames with comparable geometry;
- 1 short-visible frame;
- 1 less-truncated reference frame from the same setup.

For sessions 015/016, prioritize reflective and top-edge geometry. For 017/018, prioritize white/highlight, right-edge and short-visible geometry. Where possible, make the water-on/off centerline frames members of the same matched unit.

Centerline is unnecessary on:

- negatives, because they contain no valid physical spout structure;
- the 16 easier positive frames retained mainly for presence and tip/bbox coverage;
- redundant frames with nearly identical visible geometry.

Twenty-four centerlines are enough to test whether the 9C-5.10 gains survive targeted domain repair without paying the cost of full positive-set structural annotation.

## Manifest and split requirements

Every selected frame should record:

- exact session and timestamp;
- positive/negative authority;
- `matchedUnitId` and matched state;
- water state;
- edge type: top, right or none;
- truncation severity;
- appearance: dark-reflective or white-highlight;
- visible-length bucket;
- distractor category for negatives;
- `researchTrainingEligible = true`;
- `productionTrainingEligible = true` only if provenance and consent satisfy the existing first-party policy.

Sessions 015–018 are development data. Preserve session-aware validation: no frame from one new session may appear on both sides of a train/validation fold. For the next experiment, rotate held-out targeted sessions or otherwise report each new session separately; do not hide failure with pooled averages.

Session-014 remains `externalHoldout = true` and `holdoutLocked = true`. It is not opened after this collection; it remains the final unseen test after the next model family and policy are frozen.

## Acceptance gate before annotation

Before materializing an annotation package, audit the raw clips and proposed timestamps for:

- two independent setups per appearance family;
- complete water-on/off/absent contrast;
- at least six valid negatives per session;
- confident outlet visibility in every proposed positive;
- no severe blur or unusable exposure;
- no dense adjacent or cross-clip near-duplicates;
- no leakage across session-aware folds;
- all required metadata and matched-unit links.

If a family lacks a second independent setup, record only the missing setup. Do not broaden the collection.

## Why this is sufficient

- It directly targets every proven Task 9C-5.10 failure rather than adding generic pour frames.
- Dark/top and white/right domains each have two independent sessions, so success cannot come from memorizing one setup.
- Forty matched positives cover water state, edge severity and visible length.
- Twenty-four same-scene negatives directly address the observed presence/specificity tradeoff.
- Twenty-four targeted centerlines are concentrated where multi-scale supervision showed value or still failed.
- Four session identities support honest cross-session diagnostics.

## Why a larger collection is unnecessary now

Task 9C-5.10 already showed that the model can learn ordinary and some low-contrast structures. The unresolved uncertainty is narrow: whether matched targeted coverage can repair reflective/top-edge recognition and presence calibration without sacrificing session-013. A larger generic dataset would add annotation cost while weakening this causal test.

The next collection should stop at 64 selected frames. Expansion is justified only after a frozen targeted experiment shows that the new sessions improve 004-like and 012-like domains without reintroducing false presence or losing 013-like behavior.

## Current state

- Training performed: **no**
- Frame extraction performed: **no**
- New sessions captured: **no**
- Session-014 accessed: **no**
- External benchmark sessions 005–010 accessed: **no**
- Production runtime/UI modified: **no**

## Quality gates

- Python vision tests: PASS — 71/71 across 15 files.
- Repository tests: PASS — 734/734 across 45 files.
- Lint: PASS.
- Typecheck: PASS.
- Build: PASS.
- `git diff --check`: PASS.
