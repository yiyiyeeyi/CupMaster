# Task 9C-5.15 — Presence Learnability vs Cross-Session Generalization

## Outcome

Decision: **MIXED**.

The frozen presence head can learn every corrected development observation it
sees: the intentional train-fit diagnostic reaches **100.0% recall and 100.0%
specificity**, including session 019, both water-off positives, and all tagged
hard negatives. This rules out an inability to fit the corrected labels.

Generalization is not solved. The deterministic group-aware in-domain holdout
reaches **71.4% recall / 83.3% specificity**, while the existing corrected LOSO
reference is **72.5% / 76.0%**. Session 019 presence specifically recovers from
0% LOSO recall to 100% train-fit and 100% in-domain water-off recall. However,
sessions 017/018 miss held-out positives, session 015 accepts its held-out hard
negative, and in-domain tip localization is only usable on 3/7 positives.

The evidence therefore supports both targeted domain diversity and a better
presence/localization representation. It does not support broad collection,
threshold tuning, or opening session 014.

## Frozen protocol

All experiments use the corrected annotations:

`.vision-work/datasets/task-9c5-11/annotations/task-9c5-11-targeted-v1.corrected.normalized.json`

The Task 9C-5.14B model recipe is unchanged:

- frozen MobileNetV3-large ImageNet-1K V2 spatial features;
- frozen Balanced manual-dripper search region;
- independent binary presence BCE at threshold 0.50;
- positive-only 28×28 Gaussian tip heatmap, sigma 1.5, argmax decoder;
- four fixed augmentations, AdamW at 2e-3 with 1e-4 weight decay;
- batch size 16, 80 epochs, deterministic seed 20260929, fixed final epoch.

The train-fit run deliberately evaluates the 224 identity frames that also
contributed identity/augmented training examples. It is a capacity/optimization
sanity check, not a generalization score. The in-domain model is trained only
on sessions 015–019; it does not use sessions 001–013 as extra support.

Private artifacts:

- `.vision-work/models/task-9c5-15/`
- `.vision-work/eval/task-9c5-15/results.json`
- `.vision-work/eval/task-9c5-15/predictions.json`
- `.vision-work/eval/task-9c5-15/split.json`

## Experiment 1 — train-fit sanity check

Pool: 224 manual-ROI-eligible observations, 149 positive and 75 negative.

| Session | Positive / negative | Recall | Specificity | Tip mean, all positives |
|---|---:|---:|---:|---:|
| 001 | 19 / 7 | 100.0% | 100.0% | .050R |
| 002 | 15 / 5 | 100.0% | 100.0% | .054R |
| 003 | 12 / 5 | 100.0% | 100.0% | .048R |
| 004 | 14 / 6 | 100.0% | 100.0% | .055R |
| 011 | 19 / 15 | 100.0% | 100.0% | .057R |
| 012 | 20 / 8 | 100.0% | 100.0% | .060R |
| 013 | 23 / 8 | 100.0% | 100.0% | .045R |
| 015 | 7 / 1 | 100.0% | 100.0% | .071R |
| 016 | 4 / 7 | 100.0% | 100.0% | .091R |
| 017 | 3 / 6 | 100.0% | 100.0% | .087R |
| 018 | 7 / 4 | 100.0% | 100.0% | .070R |
| 019 | 6 / 3 | 100.0% | 100.0% | .050R |
| **Overall** | **149 / 75** | **100.0%** | **100.0%** | **.056R** |

Additional checks:

- water-on positive recall: 25/25 (100.0%);
- water-off positive recall: 2/2 (100.0%);
- tagged hard-negative FPR: 0/21 (0.0%);
- positive probability mean/median: .99995/.99998;
- negative probability mean/max: .000038/.000495;
- tip error median/P90/max: .054R/.090R/.137R;
- tip usable at ≤.20R: 149/149 (100.0%).

This is strong evidence that the head, frozen features, and optimizer can
memorize every seen domain and corrected presence label. It is not evidence of
deployment generalization.

## Experiment 2 — deterministic in-domain holdout

The 48 eligible targeted frames were split into 35 train and 13 test frames.
Every manifest-flagged near-duplicate pair remains on one side. Session 019's
two water-off frames have identical dHash values, so both are held out. This
makes 019's train fraction 66.7%, slightly below the requested range, rather
than leaking an exact visual pair across the boundary.

| Session | Train | Test P/N | Recall | Specificity | Water-on | Water-off | Tip mean | ≤.20R usable |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 015 | 6 | 1 / 1 | 100.0% | 0.0% | 100.0% | N/A | .230R | 0.0% |
| 016 | 8 | 1 / 2 | 100.0% | 100.0% | 100.0% | N/A | .133R | 100.0% |
| 017 | 7 | 1 / 1 | 0.0% | 100.0% | 0.0% | N/A | .114R | 0.0% |
| 018 | 8 | 2 / 1 | 50.0% | 100.0% | 50.0% | N/A | .170R | 50.0% |
| 019 | 6 | 2 / 1 | 100.0% | 100.0% | N/A | 100.0% | 1.328R | 50.0% |
| **Aggregate** | **35** | **7 / 6** | **71.4%** | **83.3%** | **60.0%** | **100.0%** | **.496R** | **42.9%** |

Session 019 water-on is N/A in its holdout because the exact-duplicate-safe
split uses the two water-off positives plus one negative. Water-on is tested in
the other targeted sessions and in the train-fit/LOSO comparisons.

Observed errors are not just borderline threshold effects:

- session 015's held-out negative scores .927 and is falsely present;
- session 017's positive scores .490 and is narrowly absent;
- one session 018 positive scores .343 and is absent;
- both session 019 water-off positives are present (.623 and .948), but their
  tip errors differ sharply (.071R and 2.586R). The top-edge outlet at t=0 is
  the localization failure; the t=.5 s outlet is localized correctly.

Tagged hard-negative FPR is 1/6 (16.7%). The single false present contains hand,
wet-bed, and reflection cues. Because the holdout is only 13 frames, each error
moves a session metric substantially; the direction is useful, but confidence
intervals would be wide.

## Experiment 3 — corrected LOSO reference

The Task 9C-5.14B predictions are reused without retraining.

| Session | Recall | Specificity | Tip mean, all positives | ≤.20R usable |
|---|---:|---:|---:|---:|
| 001 | 100.0% | 85.7% | .101R | 78.9% |
| 002 | 86.7% | 100.0% | .086R | 80.0% |
| 003 | 91.7% | 40.0% | .088R | 75.0% |
| 004 | 7.1% | 100.0% | .450R | 0.0% |
| 011 | 89.5% | 80.0% | .142R | 63.2% |
| 012 | 100.0% | 25.0% | .284R | 50.0% |
| 013 | 52.2% | 100.0% | .178R | 30.4% |
| 015 | 28.6% | 100.0% | .332R | 14.3% |
| 016 | 75.0% | 57.1% | .172R | 50.0% |
| 017 | 100.0% | 100.0% | .358R | 33.3% |
| 018 | 100.0% | 50.0% | .159R | 71.4% |
| 019 | 0.0% | 100.0% | .173R | 0.0% |
| **Micro aggregate** | **72.5%** | **76.0%** | **.198R** | **53.0%** |

LOSO hard-negative FPR remains 5/21 (23.8%). The weak 004, 013, 015, and 019
folds show that the perfect train-fit result does not transfer reliably when an
entire visual domain is withheld.

## Key-session comparison

| Session | Train-fit R/S | In-domain R/S | LOSO R/S | Interpretation |
|---|---:|---:|---:|---|
| 004 | 100% / 100% | N/A | 7.1% / 100% | Learnable seen domain; catastrophic cross-session recall |
| 013 | 100% / 100% | N/A | 52.2% / 100% | Learnable seen domain; partial cross-session collapse |
| 015 | 100% / 100% | 100% / 0% | 28.6% / 100% | Positive pattern transfers in-domain, hard-negative boundary does not |
| 019 | 100% / 100% | 100% / 100% | 0% / 100% | Presence is learnable in-domain; unseen-domain recall collapses |

### Session 019 answer

| Mode | Recall | Specificity | Water-off | Water-on |
|---|---:|---:|---:|---:|
| Train-fit | 6/6 (100.0%) | 3/3 (100.0%) | 2/2 (100.0%) | 4/4 (100.0%) |
| In-domain holdout | 2/2 (100.0%) | 1/1 (100.0%) | 2/2 (100.0%) | N/A in leakage-safe holdout |
| LOSO | 0/6 (0.0%) | 3/3 (100.0%) | 0/2 (0.0%) | 0/4 (0.0%) |

Can the existing presence head learn session 019 when shown representative 019
examples? **Yes for presence.** This does not extend to reliable tip
localization: the in-domain top-edge frame remains a 2.586R heatmap error.

## Diagnostic decision

**MIXED**, matching Case C:

1. Capacity/optimization is adequate to fit all seen labels.
2. Session-level LOSO remains weak, proving a major cross-session domain gap.
3. The small in-domain holdout is materially better for session 019, but is
   mixed overall and exposes a false-positive hard negative plus missed 017/018
   positives.
4. Tip heatmap generalization remains unstable even where presence succeeds.
5. No label/split artifact invalidates the experiment. The only notable split
   constraint—the identical 019 water-off pair—was kept wholly in test.

More data is justified, but only as a small multi-setup matched expansion:
water-off/water-on/outlet-absent triplets across at least two independent dark
reflective and two light/edge setups, with hand/shaft/reflection negatives in
the same scenes. Architecture reformulation is also justified because a frozen
feature + shallow head boundary memorizes training data yet remains unstable on
nearby held-out frames and fails to localize the 019 top-edge outlet.

Recommended next A-line step: a controlled representation experiment using the
same group-aware split and LOSO protocol, comparing the current frozen-feature
head against one modest end-to-end/fine-tuned semantic representation with
presence and tip objectives still separated. Do not tune the 0.50 threshold.
Only if that comparison fails to improve in-domain stability should the small
matched multi-setup collection be expanded further.

## Discipline

- Training performed: **yes**
- Annotation or data changes: **no**
- Session 014 accessed: **no**
- External sessions 005–010 accessed: **no**
- Production runtime modified: **no**
- Private artifacts committed/uploaded: **no**
- ONNX exported: **no**

