# AI Analysis Contract

Suggested Plan repair is lifecycle reconciliation, not AI regeneration. It cannot change recommendation text, rationale, confidence, evidence, adjustment values, analysis fingerprint, or the immutable Brew Recipe Snapshot. Journal reads the embedded handoff snapshot and does not call or simulate AI.

UI projection and retry sync never re-run Analysis or reinterpret its recommendation. The Brew handoff snapshot supplies display data after creation; Plan/Brew status repair may only reconcile IDs, status, and timestamps, never adjustment, evidence, fingerprint, or historical Snapshot.

Copying one recommendation into a Plan never mutates Analysis. The resulting Brew mapping and later `used` transition are application-owned facts: Draft creation preserves the recommendation, and only a real Brew start can mark it used. Migration or retry repair cannot rewrite evidence, adjustment, source Brew, or source fingerprint.

Recommendations may include a validated machine-readable action, but only allowlisted actions can become a Suggested Plan. `collect_more_data`, `keep_current_plan`, missing actions, unsafe values, and unknown stage references remain explanatory and cannot create a plan. Conversion preserves confidence, evidence, rationale, source fingerprint, and generated time; outdated analysis is warned about rather than silently recomputed. One Suggested Plan contains exactly one primary adjustment and is created only after explicit user confirmation.

AI is optional and never gates saving. Zod runtime validation and inferred TypeScript live in `src/domain/ai-analysis.ts`.

The structured result contains observations, possible impacts, what worked, one primary next-plan change, overall confidence, evidence, unchanged variables, disclaimer, and missing information. Hypotheses require confidence and evidence. Missing values must remain in `missingInformation`; the model must not invent them. Deterministic comparisons and deltas are computed in application code, not delegated to AI. Prefer one primary variable change per next plan.

The Brew-specific preview uses a provider-independent `BrewAnalysisProvider` receiving a validated pure input and returning a validated structured result. The current `RuleBasedBrewAnalysisProvider` is deterministic, runs locally, identifies itself as `local_mock / rule-based-v1`, and makes no network call. A source fingerprint detects later Feedback or Record Detail changes. Real-provider consent, disclosure, server proxy, key strategy, retention, and privacy policy must be designed before any cloud provider is introduced.
