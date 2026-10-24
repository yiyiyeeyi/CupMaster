# Task 9C-5.14A — Spout-Presence Annotation Semantics Audit

## Decision

**SMALL_LABEL_POLICY_ERROR**

Three of the 27 current negatives contain an identifiable physical spout
outlet but have neither a `gooseneck_spout` bbox nor a `spout_tip`. Two are the
exact water-off positives identified during Task 9C-5.11 selection. The third
is a visibly present dark outlet in session 016.

This is not evidence of dataset-wide semantic contamination: 24/27 negatives
are visually consistent true negatives, and no frame remained ambiguous after
inspection. However, the two intended water-off contrasts were both converted
to negatives, leaving zero positive water-off examples. Correct these three
frames and rerun Task 9C-5.13 before deciding whether more data is required.

No annotation was changed in this audit.

## Frozen semantics

Presence means that the physical gooseneck spout/outlet is visible and
sufficiently identifiable. A positive requires exactly one `gooseneck_spout`
bbox and one `spout_tip`, whether water is on or off. `waterOn=yes/no` is
independent metadata.

A negative contains no identifiable physical outlet. Water, wet bed, foam,
reflection, kettle body, hand, shaft/tool, and dripper rim are not positive
evidence by themselves.

## Trace of the original water-off candidates

Both `selection.json` and `annotation/annotation-manifest.json` agree on these
two identities and hints. The normalized annotations disagree with that
selection intent.

| Frame | Session / timestamp | Original hints | Current status | Tip | Bbox | Normalized class |
|---|---|---|---|---|---|---|
| `session-019-t000000` | 019 / 00:00:00.000 | `labelCandidate=positive`, `outletVisible=yes`, `waterOn=no`, reflective, shortVisible, reflection | zero annotation regions | absent | absent | `intentional_negative` |
| `session-019-t000500` | 019 / 00:00:00.500 | `labelCandidate=positive`, `outletVisible=yes`, `waterOn=no`, reflective, shortVisible, reflection | zero annotation regions | absent | absent | `intentional_negative` |

At both timestamps, the reflective-metal physical outlet is visible at the top
edge. At 00:00.500 it is especially clear; at 00:00.000 it is partially edge
truncated but still identifiable. Their current negative status is a direct
annotation-policy mismatch under the frozen semantics.

## Audit of all 27 current negatives

| Frame | Classification | Visual finding |
|---|---|---|
| `session-015-t123500` | TRUE_NEGATIVE | Hand, wet bed, reflection; outlet absent. |
| `session-016-t002000` | **POSSIBLE_MISLABEL** | Large circular physical outlet is clearly visible at the upper edge; bbox/tip absent. |
| `session-016-t096000` | TRUE_NEGATIVE | Foam/wet bed and reflections; outlet absent. |
| `session-016-t124000` | TRUE_NEGATIVE | Foam/wet bed and reflections; outlet absent. |
| `session-016-t150000` | TRUE_NEGATIVE | Wet bed and reflections; outlet absent. |
| `session-016-t028000` | TRUE_NEGATIVE | Rim, wet bed, foam, reflection; outlet absent. |
| `session-016-t066000` | TRUE_NEGATIVE | Rim, wet bed, foam, reflection; outlet absent. |
| `session-016-t132000` | TRUE_NEGATIVE | Rim, wet bed, foam, reflection; outlet absent. |
| `session-016-t164000` | TRUE_NEGATIVE | Hand/kettle body and wet bed; physical outlet absent. |
| `session-016-t174000` | TRUE_NEGATIVE | Hand and server; no spout outlet. |
| `session-017-t002000` | TRUE_NEGATIVE | Hand and whisk/tool above dry bed; no spout outlet. |
| `session-017-t022000` | TRUE_NEGATIVE | Foam/wet bed and reflections; no spout outlet. |
| `session-017-t000000` | TRUE_NEGATIVE | Hand and whisk/tool; no spout outlet. |
| `session-017-t012000` | TRUE_NEGATIVE | Hand, rim, wet bed, foam; no spout outlet. |
| `session-017-t016000` | TRUE_NEGATIVE | Hand, rim, wet bed, reflection; no spout outlet. |
| `session-017-t024000` | TRUE_NEGATIVE | Rim, wet bed, foam, reflection; no spout outlet. |
| `session-017-t032000` | TRUE_NEGATIVE | Hand and server; no spout outlet. |
| `session-018-t014000` | TRUE_NEGATIVE | Hand, rim, wet bed; no spout outlet. |
| `session-018-t026000` | TRUE_NEGATIVE | Rim, wet bed, foam, reflection; no spout outlet. |
| `session-018-t042000` | TRUE_NEGATIVE | Rim, wet bed, foam, reflection; no spout outlet. |
| `session-018-t068000` | TRUE_NEGATIVE | Hand, rim, wet bed, reflection; no spout outlet. |
| `session-018-t072000` | TRUE_NEGATIVE | Hand and server; no spout outlet. |
| `session-019-t000000` | **POSSIBLE_MISLABEL** | Reflective outlet identifiable at top edge, water off; bbox/tip absent. |
| `session-019-t000500` | **POSSIBLE_MISLABEL** | Reflective outlet clearly identifiable at top edge, water off; bbox/tip absent. |
| `session-019-t013000` | TRUE_NEGATIVE | Rim, wet bed, foam, reflection; no spout outlet. |
| `session-019-t025000` | TRUE_NEGATIVE | Rim, wet bed, foam, reflection; no spout outlet. |
| `session-019-t042000` | TRUE_NEGATIVE | Rim, wet bed, reflection; no spout outlet. |

Totals:

- TRUE_NEGATIVE: 24
- POSSIBLE_MISLABEL: 3
- AMBIGUOUS: 0

The `POSSIBLE_MISLABEL` category intentionally requests human confirmation. No
automatic rewrite is authorized or performed.

## Distractor coverage among true negatives

The inspected true negatives include all requested categories:

- kettle body only / without outlet: session 016 at 164 s;
- shaft/tool or hand: sessions 016–018;
- reflections: sessions 015–019;
- wet bed and foam: sessions 015–019;
- rim/server-only scenes: sessions 016–019;
- visible water-like/active-pour distractor without an identifiable outlet:
  five true negatives among the six current negatives carrying
  `waterOnHint=yes`.

## Water-state distribution and shortcut risk

Counts use current normalized labels and retained selection metadata:

| Current label / water hint | Count |
|---|---:|
| Positive, water on | 24 |
| Positive, water off | 0 |
| Negative, `waterOnHint=yes` | 6 |
| └ true water-on-like distractor negative | 5 |
| └ visible outlet possible mislabel | 1 |
| Negative, water off | 2 |
| Negative, not applicable | 19 |

Water-state shortcut learning is **plausible**. Every current positive is
water-on and both explicit water-off/outlet-visible contrasts are labelled
negative. The five water-on-like true negatives provide some counter-evidence,
so counts alone do not prove that a trained model used water as its causal cue.
They do establish that the label distribution fails to teach the intended
water-independent positive semantics.

This inconsistency is particularly relevant to Task 9C-5.13 session-019: the
targeted model's 0% presence recall occurred in a session whose only selected
water-off outlet observations were incorrectly represented as negatives.
This does not fully explain other domain failures, but it invalidates a clean
`MORE_DATA` conclusion until corrected training is rerun.

## Required human action

Review these three frames and, if confirmed, draw exactly one
`gooseneck_spout` bbox and one `spout_tip` while preserving the existing
dripper geometry and water metadata:

1. `session-016-t002000`
2. `session-019-t000000`
3. `session-019-t000500`

Do not change the other 24 negatives based on this audit.

## Private review package

- `.vision-work/eval/task-9c5-14a/possible-mislabels-contact-sheet.jpg`
- `.vision-work/eval/task-9c5-14a/review-list.json`
- `.vision-work/eval/task-9c5-14a/negative-audit.json`

The review package contains only the three possible mislabels. The audit
ledger records all 27 classifications. These files remain local and gitignored.

## Gate

- Decision: **SMALL_LABEL_POLICY_ERROR**
- Human correction required: **yes**
- Retrain before collecting more data: **yes**
- MORE_DATA still justified: **not yet**
- Session 014 accessed: **no**
- External sessions 005–010 accessed: **no**
- Training performed: **no**
- Production runtime modified: **no**
- Private artifacts committed/uploaded: **no**
