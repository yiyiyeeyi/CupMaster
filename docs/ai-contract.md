# AI Analysis Contract

AI is optional and never gates saving. Zod runtime validation and inferred TypeScript live in `src/domain/ai-analysis.ts`.

The structured result contains observations, possible impacts, what worked, one primary next-plan change, overall confidence, evidence, unchanged variables, disclaimer, and missing information. Hypotheses require confidence and evidence. Missing values must remain in `missingInformation`; the model must not invent them. Deterministic comparisons and deltas are computed in application code, not delegated to AI. Prefer one primary variable change per next plan.

No AI provider or API is integrated in this round.
