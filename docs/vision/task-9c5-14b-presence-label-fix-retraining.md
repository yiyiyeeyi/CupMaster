# Task 9C-5.14B — Corrected Presence Labels + Controlled Retraining

## Outcome

Decision: **LABEL_FIX_NO_MEANINGFUL_EFFECT**.

The three human corrections are valid and the corrected dataset is now
semantically consistent, but the controlled retraining did not repair the
cross-session presence failure. Session 019 still has 0% presence recall for
both water-off and water-on positives. Overall unusable observations increased
from 41.8% to 47.0%, while the high-quality share remained 2.7%.

The label repair was necessary for dataset correctness. It was not sufficient
as a model repair, and it does not support proceeding to tracking replay.

## Corrected annotation normalization and QA

Authoritative inclusion list:
`.vision-work/datasets/task-9c5-11/annotation/annotation-manifest.json`

Human export:
`.vision-work/datasets/task-9c5-11/annotation/via-task-9c5-11-targeted-v1.json`

Normalized output:
`.vision-work/datasets/task-9c5-11/annotations/task-9c5-11-targeted-v1.corrected.normalized.json`

QA output:
`.vision-work/datasets/task-9c5-11/annotations/task-9c5-11-targeted-v1.corrected.qa.json`

| Check | Result |
|---|---:|
| VIA records | 142 |
| Authoritative target records | 51 / 51 |
| Unrelated VIA records ignored | 91 |
| Positive | 27 |
| Intentional negative | 24 |
| Positive water-on | 25 |
| Positive water-off | 2 |
| Dripper coverage | 48 / 51 |
| Invalid shapes | 0 |
| Duplicate shapes/records | 0 |
| Unsupported labels | 0 |
| Tip-only / bbox-only | 0 / 0 |
| Normalization gate | **PASS** |

Two unique blank ellipses retain the previously tested dripper-only fallback.
No annotation coordinates were inferred or generated. The original VIA v1
export was not modified.

### Corrected identities

| Frame | Water | Current shapes | Corrected class |
|---|---|---|---|
| `session-016-t002000` | yes | one bbox, one tip, one dripper | positive |
| `session-019-t000000` | no | one bbox, one tip, one dripper | positive |
| `session-019-t000500` | no | one bbox, one tip, one dripper | positive |

## Controlled training protocol

The Task 9C-5.13 configuration was preserved:

- frozen MobileNetV3-large ImageNet-1K V2 spatial features;
- frozen Balanced manual-dripper ROI;
- independent presence BCE at threshold 0.50;
- positive-only 28×28 tip heatmap, sigma 1.5, argmax decoder;
- independent region presence and bbox head;
- identical augmentations, optimizer settings, deterministic seeds, 80 epochs,
  and fixed-final-epoch selection;
- twelve-fold leave-one-session-out evaluation.

The only intended change was the corrected annotation semantics. The complete
pool remains 242 frames. Manual-ROI eligible observations remain 224, changing
from 146 positive / 78 negative to 149 positive / 75 negative.

Checkpoints and evaluation outputs are private under:

- `.vision-work/models/task-9c5-14b/`
- `.vision-work/eval/task-9c5-14b/`

## Presence comparison by session

Values are Task 9C-5.13 → corrected Task 9C-5.14B.

| Session | Recall | Specificity / FPR |
|---|---:|---:|
| 001 | 100.0% → 100.0% | 57.1% / 42.9% → 85.7% / 14.3% |
| 002 | 86.7% → 86.7% | 100.0% / 0.0% → 100.0% / 0.0% |
| 003 | 91.7% → 91.7% | 40.0% / 60.0% → 40.0% / 60.0% |
| 004 | 21.4% → 7.1% | 100.0% / 0.0% → 100.0% / 0.0% |
| 011 | 78.9% → 89.5% | 80.0% / 20.0% → 80.0% / 20.0% |
| 012 | 90.0% → 100.0% | 37.5% / 62.5% → 25.0% / 75.0% |
| 013 | 82.6% → 52.2% | 100.0% / 0.0% → 100.0% / 0.0% |
| 015 | 28.6% → 28.6% | 100.0% / 0.0% → 100.0% / 0.0% |
| 016 | 100.0% → 75.0% | 37.5% / 62.5% → 57.1% / 42.9% |
| 017 | 66.7% → 100.0% | 100.0% / 0.0% → 100.0% / 0.0% |
| 018 | 100.0% → 100.0% | 75.0% / 25.0% → 50.0% / 50.0% |
| 019 | 0.0% → 0.0% | 100.0% / 0.0% → 100.0% / 0.0% |

Presence changes are mixed rather than consistently improved. Sessions 001,
011, and 017 improve; 004 and 013 regress materially; 012 and 018 trade recall
for more false presence or retain high false presence.

## Session 019 special check

Session 019 is strictly held out from its fold's training. Correcting its own
two labels changes its evaluation ground truth but does not expose those frames
to the model. The only corrected positive available during that fold's training
is the water-on `session-016-t002000` example.

| Metric | Corrected result |
|---|---:|
| Positive count | 6 |
| Negative count | 3 |
| Presence recall | 0 / 6 (0.0%) |
| Specificity | 3 / 3 (100.0%) |
| Water-off recognition | 0 / 2 (0.0%) |
| Water-on recognition | 0 / 4 (0.0%) |
| Tip normalized mean | .173R |
| Tip normalized median | .132R |
| Tip normalized P90 / max | .469R / .469R |
| High / medium / low / unusable | 0 / 0 / 0 / 6 |

The raw heatmap is within .20R for five of six positives, including one
water-off frame at .144R, but all observations are unavailable because presence
probability remains below 0.50. Water-off probabilities are 0.000006 and
0.002845; water-on probabilities range from 0.00175 to 0.272. The failure is
therefore presence generalization, not complete absence of localization signal.

Corrected-frame audit:

- `session-016-t002000`: presence 0.995, accepted; tip error .223R.
- `session-019-t000000`: presence 0.000006, rejected; tip error .469R.
- `session-019-t000500`: presence 0.002845, rejected; tip error .144R.

## Spout-region and tip effects

The region head recognizes all six session-019 positives and all three
negatives correctly at the presence threshold, with mean accepted IoU .242 and
50% recall at IoU ≥ .30. This reinforces that the separate heatmap presence
head, not lack of all semantic structure, is the immediate session-019 gate.

Macro comparison:

| Sessions | Presence recall | Specificity | Region recall | Tip mean |
|---|---:|---:|---:|---:|
| 001–004 | 74.9% → 71.4% | 74.3% → 81.4% | 86.4% → 89.2% | .332R → .185R |
| 011–013 | 83.9% → 80.5% | 72.5% → 68.3% | 63.7% → 63.8% | .196R → .200R |
| 015–019 | 59.0% → 60.7% | 82.5% → 81.4% | 88.6% → 79.0% | .214R → .240R |

Although older-session localization improves substantially, session 004
presence falls to 7.1%. Session 013 recall also falls from 82.6% to 52.2%.
Those collapses prevent interpreting the aggregate localization improvement as
a safe regression-free gain.

## Hard-negative FPR

Only manual-ROI eligible negatives are evaluated. The three server-only frames
lack dripper geometry, so server FPR is not estimable in this protocol.

| Hint | 9C-5.13 | Corrected 9C-5.14B | Interpretation |
|---|---:|---:|---|
| All tagged hard negatives | 6/24 (25.0%) | 5/21 (23.8%) | Similar; denominators changed |
| Kettle body | 3/5 (60.0%) | 2/4 (50.0%) | Apparent drop is the corrected 016 frame leaving the negative set |
| Shaft/tool | 3/5 (60.0%) | 2/4 (50.0%) | Same denominator effect; remaining two false positives persist |
| Hand | 0/7 (0.0%) | 0/7 (0.0%) | Unchanged |
| Wet bed | 3/16 (18.8%) | 3/16 (18.8%) | Unchanged |
| Foam | 4/12 (33.3%) | 4/12 (33.3%) | Unchanged |
| Reflection | 4/18 (22.2%) | 4/16 (25.0%) | Slightly worse rate; same false-positive count |
| Rim | 3/14 (21.4%) | 3/14 (21.4%) | Unchanged |
| Server | unavailable | unavailable | Three server negatives have no dripper ROI |

The correction removes mislabeled positives from the negative denominator, but
does not materially suppress the remaining hard-negative confusion.

## Product quality buckets

Unavailable includes any positive rejected by presence, regardless of raw
heatmap proximity.

| Bucket | Task 9C-5.13 | Corrected 9C-5.14B |
|---|---:|---:|
| High, ≤ .02R | 4/146 (2.7%) | 4/149 (2.7%) |
| Medium, > .02R–.06R | 26/146 (17.8%) | 22/149 (14.8%) |
| Low, > .06R–.20R | 55/146 (37.7%) | 53/149 (35.6%) |
| Unusable, > .20R or unavailable | 61/146 (41.8%) | 70/149 (47.0%) |

The corrected-label retraining does not improve the product-relevant error
budget. It increases the unavailable/unusable share and does not increase the
high-quality share.

## Decision and smallest remaining gaps

Decision: **LABEL_FIX_NO_MEANINGFUL_EFFECT**.

- Regression on sessions 001–004: **yes**, because session-004 presence falls
  from 21.4% to 7.1%, despite aggregate tip-error improvement.
- Sessions 011–013 repair: **partial**, with 011 improving but 013 collapsing
  and 012 specificity worsening.
- Sessions 015–019 generalization: **weak**; 017 improves, but 019 remains at
  zero recall and region/tip aggregates do not improve.
- Proceed to tracking replay: **no**.
- More data needed: **yes**, but only targeted matched evidence.

Smallest remaining gaps:

1. First audit sessions 015–018 for existing outlet-visible water-off moments.
   If insufficient, record only two independent short setups: one dark/
   reflective and one light/reflective.
2. Select 4–6 water-off positive frames per setup, paired with 4–6 water-on and
   outlet-absent frames from the same camera, dripper, and lighting. This gives
   water-off positive evidence outside session 019 without a broad collection.
3. Ensure each setup includes 2–3 kettle-body/shaft-only negatives, because the
   remaining confusion is still 2/4 for both tags.
4. Include session-004-like dark reflective outlet geometry among those two
   setups; do not create a separate broad domain dataset.

After annotation, repeat this exact LOSO protocol. Keep session 014 sealed.

## Discipline

- Training performed: **yes**
- Session 014 accessed: **no**
- External sessions 005–010 accessed: **no**
- Thresholds or architecture changed: **no**
- Production runtime modified: **no**
- Private artifacts committed/uploaded: **no**
