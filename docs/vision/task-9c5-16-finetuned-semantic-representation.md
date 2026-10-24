# Task 9C-5.16 — Frozen vs Fine-Tuned Semantic Representation Study

## Outcome

Decision: **FINETUNE_NOT_HELPFUL**.

Partial final-stage fine-tuning improves the 13-frame in-domain holdout and
reduces LOSO false positives, but it does not improve cross-session recall and
substantially worsens tip localization. LOSO presence changes from 72.5%
recall / 76.0% specificity to 71.1% / 80.0%. Raw tip mean error worsens from
.198R to .315R, P90 from .405R to .533R, and ≤.20R coverage from 71.1% to
51.0%. Session 019 remains at 0% LOSO recall.

The frozen representation remains the recommended presence configuration.
Do not proceed to tracking replay or open session 014.

## Protocol

Development sessions are restricted to 001–004, 011–013, and 015–019. The
corrected Task 9C-5.14B annotations, frozen Balanced manual-dripper ROI,
group-aware Task 9C-5.15 split, augmentation set, independent presence/tip
objectives, and 0.50 presence threshold are unchanged.

Configurations:

1. **FROZEN_BASELINE** — exact Task 9C-5.15/14B results: ImageNet-1K V2
   MobileNetV3-large features frozen, existing presence+heatmap head.
2. **PARTIAL_FINETUNE** — paired continuation from each exact frozen
   checkpoint. MobileNet feature blocks 13–16 and the existing head are
   trainable for ten fixed-final epochs. Backbone LR is 1e-5, head LR 2e-4,
   weight decay 1e-4, batch size 16. No per-fold epoch selection occurs.
3. **FULL_FINETUNE_DIAGNOSTIC** — omitted after a measured CPU training-step
   benchmark projected approximately 4.7 hours for the same train-fit,
   in-domain, and 12-fold LOSO protocol. Running only a subset would not be a
   comparable configuration.

The frozen prefix through block 12 is evaluated once per crop. This is an exact
optimization for partial fine-tuning because gradients cannot update it.

Private outputs:

- `.vision-work/models/task-9c5-16/`
- `.vision-work/eval/task-9c5-16/results.json`
- `.vision-work/eval/task-9c5-16/predictions.json`
- `.vision-work/eval/task-9c5-16/projection.json`

## Parameters and runtime

| Configuration | Total parameters | Trainable parameters |
|---|---:|---:|
| Frozen | 3,074,674 | 102,722 |
| Partial | 3,074,674 | 2,282,186 |
| Full diagnostic | 3,074,674 | 3,074,674 |

Measured partial training time across 14 runs was 1,552.7 seconds
(25m 52.7s). Individual LOSO folds took approximately 106–127 seconds. Frozen
training time was not instrumented in the earlier task and is not reconstructed
from file timestamps. A full-backbone batch-4 forward/backward step took .615s;
conservative scaling to 6,850 batch-16-equivalent protocol steps gives about
4.7 hours on this CPU, so full fine-tuning was not run.

## Aggregate presence results

| Evaluation | Configuration | Recall | Specificity | Balanced accuracy | FPR |
|---|---|---:|---:|---:|---:|
| Train-fit | Frozen | 100.0% | 100.0% | 100.0% | 0.0% |
| Train-fit | Partial | 100.0% | 100.0% | 100.0% | 0.0% |
| In-domain | Frozen | 71.4% | 83.3% | 77.4% | 16.7% |
| In-domain | Partial | 100.0% | 83.3% | 91.7% | 16.7% |
| LOSO | Frozen | 72.5% | 76.0% | 74.2% | 24.0% |
| LOSO | Partial | 71.1% | 80.0% | 75.6% | 20.0% |

The in-domain result is encouraging but based on seven positives and six
negatives. LOSO is the governing cross-session result. Its 4-point specificity
gain comes with a 1.3-point recall loss and severe localization regression.

## Per-session LOSO

Values are frozen → partial.

| Session | Recall | Specificity | Interpretation |
|---|---:|---:|---|
| 001 | 100.0% → 94.7% | 85.7% → 57.1% | Both presence dimensions regress |
| 002 | 86.7% → 93.3% | 100.0% → 100.0% | Recall improves |
| 003 | 91.7% → 91.7% | 40.0% → 40.0% | No change |
| 004 | 7.1% → 50.0% | 100.0% → 100.0% | Large recall recovery, tip tail worsens |
| 011 | 89.5% → 73.7% | 80.0% → 80.0% | Recall regression |
| 012 | 100.0% → 100.0% | 25.0% → 50.0% | Negative rejection improves |
| 013 | 52.2% → 39.1% | 100.0% → 100.0% | Critical recall regression |
| 015 | 28.6% → 14.3% | 100.0% → 100.0% | Critical recall regression |
| 016 | 75.0% → 75.0% | 57.1% → 100.0% | Negative rejection improves |
| 017 | 100.0% → 100.0% | 100.0% → 100.0% | Stable |
| 018 | 100.0% → 85.7% | 50.0% → 50.0% | Recall regression |
| 019 | 0.0% → 0.0% | 100.0% → 100.0% | No recovery |

Fine-tuning trades gains in 004/012/016 against regressions in
001/011/013/015/018. It does not repair the decisive 019 cross-session failure.

## Hard-negative LOSO audit

Overlapping hints mean rows are not additive.

| Hint | Count | Frozen FPR | Partial FPR |
|---|---:|---:|---:|
| All tagged hard negatives | 21 | 23.8% | 9.5% |
| Kettle body | 4 | 50.0% | 0.0% |
| Shaft | 4 | 50.0% | 0.0% |
| Tool | 0 | N/A | N/A |
| Hand | 7 | 0.0% | 0.0% |
| Wet bed | 16 | 18.8% | 12.5% |
| Foam | 12 | 33.3% | 16.7% |
| Reflection | 16 | 25.0% | 12.5% |
| Rim | 14 | 21.4% | 14.3% |

The specificity improvement is real and useful, not a threshold change.
However, it accompanies worse positive recall in several critical sessions.

## Water-state and difficult-domain checks

| Positive subset | Count | Frozen recall | Partial recall |
|---|---:|---:|---:|
| Water-on | 25 | 60.0% | 52.0% |
| Water-off | 2 | 0.0% | 0.0% |
| Dark/reflective | 17 | 29.4% | 23.5% |
| White/highlight | 10 | 100.0% | 90.0% |
| Low contrast | 16 | 56.3% | 43.8% |
| Short visible | 21 | 61.9% | 57.1% |

Partial fine-tuning does not learn a more robust physical-spout invariant. It
fails both water-off observations and loses recall in every difficult-domain
group. There is no evidence that it fixes reliance on water/pour-correlated
visual evidence.

## Tip localization

Errors below are raw heatmap argmax errors over every positive, independent of
presence acceptance, so presence changes cannot hide localization regression.

| Evaluation | Config | Mean | Median | P90 | Max | ≤.02R | ≤.06R | ≤.20R |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Train-fit | Frozen | .056R | .054R | .090R | .137R | 8.7% | 58.4% | 100.0% |
| Train-fit | Partial | .059R | .057R | .100R | .138R | 8.7% | 57.0% | 100.0% |
| In-domain | Frozen | .496R | .133R | 2.586R | 2.586R | 0.0% | 0.0% | 57.1% |
| In-domain | Partial | .136R | .133R | .260R | .260R | 0.0% | 14.3% | 71.4% |
| LOSO | Frozen | .198R | .122R | .405R | 1.805R | 2.7% | 17.4% | 71.1% |
| LOSO | Partial | .315R | .193R | .533R | 3.166R | 1.3% | 6.0% | 51.0% |

Partial adaptation fixes the tiny in-domain sample's session-019 top-edge tail,
but does not transfer. LOSO mean increases 59%, P90 increases 31%, and ≤.20R
coverage drops 20.1 percentage points.

### Critical sessions

| Session | Config | Presence R/S | Tip mean | Tip P90/max | ≤.20R |
|---|---|---:|---:|---:|---:|
| 004 | Frozen | 7.1% / 100% | .450R | 1.385R / 1.514R | 28.6% |
| 004 | Partial | 50.0% / 100% | .644R | 2.034R / 2.077R | 42.9% |
| 013 | Frozen | 52.2% / 100% | .178R | .389R / .493R | 69.6% |
| 013 | Partial | 39.1% / 100% | .280R | .479R / .718R | 34.8% |
| 015 | Frozen | 28.6% / 100% | .332R | .820R / .820R | 57.1% |
| 015 | Partial | 14.3% / 100% | .367R | .770R / .770R | 14.3% |
| 019 | Frozen | 0.0% / 100% | .173R | .469R / .469R | 83.3% |
| 019 | Partial | 0.0% / 100% | .143R | .318R / .318R | 66.7% |

Session 004 presence improves but its localization tail worsens. Sessions 013
and 015 regress in both recall and localization. Session 019 remains completely
blocked by presence.

## Representation diagnostic

The lightweight embedding diagnostic uses identity-frame spatial features from
the all-session train-fit model; it is descriptive, not a validation score.

| Metric | Frozen | Partial |
|---|---:|---:|
| Cross-session nearest-neighbor rate | 4.91% | 3.57% |
| Same-label cross-session nearest-neighbor rate | 4.02% | 3.13% |
| Cross-session within-class cosine distance | .512 | .723 |
| Cross-session between-class cosine distance | .530 | .755 |
| Class-separation margin | .0177 | .0314 |

Class separation increases, but session mixing becomes worse and same-class
cross-session distance increases substantially. Therefore the representation
is **not less session-specific**. The PCA coordinates are retained only for
offline inspection and are not used to select the result.

## Decision and minimum next data

Decision: **FINETUNE_NOT_HELPFUL**.

Recommended presence configuration: retain the frozen MobileNetV3-large
representation and separate presence head. Do not adopt partial fine-tuning;
do not spend the CPU cost on full fine-tuning under the same small dataset.

More data is still needed, but only a targeted matched expansion:

- four independent setups total;
- two dark/reflective/top-edge setups resembling 004/015;
- two low-contrast short-visible setups spanning light and reflective outlets,
  resembling 013/019;
- 10–12 selected frames per setup, approximately 40–48 frames total;
- per setup: three water-on outlet positives, three water-off outlet positives,
  and four to six outlet-absent matched negatives;
- negatives must include kettle-body/shaft, reflection/rim/foam, and hand where
  naturally present;
- no adjacent-frame volume padding and no single setup carrying an entire
  domain family.

After annotation, repeat frozen LOSO first. Separately investigate an
observation-gate/representation formulation that does not force the same
spatial feature map to serve both presence and precise heatmap localization.

## Discipline

- Proceed to tracking replay: **no**
- Session 014 accessed: **no**
- External sessions 005–010 accessed: **no**
- New data or annotation changes: **no**
- Presence threshold changed: **no**
- Production runtime modified: **no**
- ONNX exported: **no**
- Private artifacts committed/uploaded: **no**
