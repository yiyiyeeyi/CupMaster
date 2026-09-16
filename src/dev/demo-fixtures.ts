import type { Brew, BrewAnalysis, BrewAnalysisAttempt, BrewRecipeSnapshot, SuggestedBrewPlan } from "@/domain";
import { brewAnalysisSchema, brewAnalysisAttemptSchema, suggestedBrewPlanSchema } from "@/domain";
import { brewPersistenceSchema } from "@/data/local-brew-schema";
import { recipeFixtures } from "@/data/fixtures/recipes";
import { createBrewDraft, createQuickPrepareDefaults } from "@/application/brew-factory";
import { demoFixtureSchema } from "./demo-seed-schema";

export const DEMO_PREFIX = "demo-";
export const MIGRATION_SMOKE_PREFIX = "migration-smoke-";
export const DEMO_BASE_TIME = "2026-08-01T08:00:00.000Z";
const iso = (minutes: number) => new Date(Date.parse(DEMO_BASE_TIME) + minutes * 60_000).toISOString();
const recipe = recipeFixtures[0];

function base(id: string, minute: number) { return createBrewDraft(recipe, createQuickPrepareDefaults(recipe), { createId: () => id, now: () => iso(minute) }); }
function results(brew: Brew, count = brew.recipeSnapshot.steps.length) { return brew.recipeSnapshot.steps.slice(0, count).map((step, index) => ({ stageOrder: index, stageId: step.id, actualStartedAt: iso(10 + index), actualCompletedAt: iso(11 + index), actualDurationSeconds: step.durationSeconds ?? 60, actualWeight: null, weightDifference: null, wasSkipped: false as const })); }
function completed(id: string, minute: number, saved = true) { const brew = base(id, minute); return { ...brew, executionStatus: "completed" as const, recordStatus: saved ? "saved" as const : "draft" as const, feedbackStatus: "awaiting_feedback" as const, startedAt: iso(minute), completedAt: iso(minute + 4), currentStageOrder: brew.recipeSnapshot.steps.length, currentStageStartedAt: null, stageResults: results(brew), actualTotalTimeSeconds: 244, updatedAt: iso(minute + 4) }; }

function analysis(brew: Brew, fingerprint = `demo-fingerprint:${brew.id}`): BrewAnalysis {
  return brewAnalysisSchema.parse({ id: `${brew.id}:analysis`, brewId: brew.id, schemaVersion: 1, status: "completed", generatedAt: iso(60), provider: "local", model: "demo-rules-v1", sourceFingerprint: fingerprint, inputSummary: { dataQuality: { level: "good", missingFields: [], notes: ["Demo fixture includes feedback and measured details."] }, missingData: [] }, result: { summary: "The cup was balanced with a slightly bitter finish.", strengths: [{ id: "strength-1", title: "Stable brew", description: "Stage timing stayed consistent.", confidence: "high", evidence: [{ field: "stageResults", label: "Completed stages", value: "All stages completed" }] }], observations: [{ id: "observation-1", title: "Bitterness present", description: "The finish was reported as bitter.", confidence: "medium", evidence: [{ field: "bitterness", label: "Bitterness", value: "4/5" }] }], possibleIssues: [], recommendations: [{ id: "demo-recommendation-grind", title: "Go slightly coarser", description: "Test one controlled grind change.", confidence: "medium", evidence: [{ field: "bitterness", label: "Bitterness", value: "4/5" }], priority: "high", rationale: "A coarser grind may reduce extraction at the finish.", suggestedAdjustment: "Move one small step coarser.", action: { type: "adjust_grind", direction: "coarser", magnitude: "slight" } }], dataQuality: { level: "good", missingFields: [], notes: ["Demo fixture includes feedback and measured details."] }, disclaimer: "Local deterministic demo analysis; not professional advice." } });
}

const brewA = completed("demo-brew-a-awaiting", 100);
const brewBBase = completed("demo-brew-b-complete", 200);
const brewB: Brew = { ...brewBBase, feedbackStatus: "completed", flavorFeedback: { id: "demo:feedback:b", brewId: brewBBase.id, overallImpression: "liked", acidity: 3, sweetness: 4, bitterness: 4, body: 3, clarity: 4, aftertaste: 3, balance: 4, flavorNotes: ["citrus", "caramel", "clean"], freeformNotes: "Bright sweetness with a slightly bitter finish.", createdAt: iso(205), updatedAt: iso(205) }, recordDetails: { bean: { name: "Demo Ethiopia Guji", roaster: "CupMaster Demo Roaster", origin: "Guji, Ethiopia", variety: "Heirloom", process: "Washed", roastLevel: "Light", roastDate: "2026-07-25" }, equipment: { dripper: "V60 02", grinder: "Demo Hand Grinder", grinderSetting: "24 clicks", kettle: "Gooseneck Kettle", filter: "White paper" }, actualDoseGrams: 15.1, actualWaterGrams: 241, actualTemperatureCelsius: 92, notes: "A deliberately long demo note that verifies wrapping without changing the immutable Recipe Snapshot or hiding historical information.", createdAt: iso(205), updatedAt: iso(205) }, analysisStatus: "completed", analysis: null, updatedAt: iso(205) };
brewB.analysis = analysis(brewB);
const brewCBase = completed("demo-brew-c-completed-draft", 300, false);
const brewC: Brew = { ...brewCBase, analysisStatus: "completed", analysis: analysis(brewCBase, "outdated-demo-fingerprint"), updatedAt: iso(305) };
const brewDBase = base("demo-brew-d-in-progress", 400);
const brewD: Brew = { ...brewDBase, executionStatus: "in_progress", startedAt: iso(400), currentStageStartedAt: iso(401), currentStageOrder: 1, stageResults: results(brewDBase, 1), updatedAt: iso(401) };
const brewE = base("demo-brew-e-recipe-draft", 500);

function plan(id: string, resultingBrewId: string | null, status: "draft" | "used", minute: number, usedAt: string | null = null): SuggestedBrewPlan {
  const fixtureLabel = id.replace("demo-plan-", "");
  return suggestedBrewPlanSchema.parse({ id, sourceBrewId: brewB.id, sourceAnalysisId: brewB.analysis!.id, sourceRecommendationId: "demo-recommendation-grind", sourceFingerprint: brewB.analysis!.sourceFingerprint, sourceAnalysisGeneratedAt: brewB.analysis!.generatedAt, title: `Gentle Start · ${fixtureLabel} Next Try`, status, baseRecipeSnapshot: brewB.recipeSnapshot, adjustments: [{ id: `${id}:adjustment`, variable: "grind", scope: "overall", stageId: null, direction: "coarser", previousValue: brewB.recipeSnapshot.grindDescription?.value ?? null, suggestedValue: "slightly coarser than current", unit: null, description: "Move one small step coarser." }], rationale: "Test one controlled grind change while keeping every other variable stable.", confidence: "medium", evidence: [{ field: "bitterness", label: "Bitterness", value: "4/5" }], keepUnchanged: ["Dose", "Water total", "Temperature", "Pour sequence"], createdAt: iso(minute), updatedAt: iso(minute), usedAt, resultingBrewId });
}
function suggested(id: string, planId: string, decision: "pending" | "accepted" | "overridden", minute: number, execution: "not_started" | "in_progress" | "completed" = "not_started"): Brew {
  const draft = base(id, minute), confirmedAt = decision === "pending" ? null : iso(minute + 1), startedAt = execution === "not_started" ? null : iso(minute + 2);
  const grind = { ...draft.recipeSnapshot.grindDescription!, suggestedPlanValue: "slightly coarser than current", value: decision === "overridden" ? "medium-fine final setting" : "slightly coarser than current", source: (decision === "overridden" ? "user_override" : "suggested_plan") as "user_override" | "suggested_plan" };
  const snapshot: BrewRecipeSnapshot = { ...draft.recipeSnapshot, recipeType: "suggested_plan", title: `${draft.recipeSnapshot.title} · Next Try`, grindDescription: grind, userOverrides: decision === "overridden" ? { ...draft.recipeSnapshot.userOverrides, grindDescription: grind.value } : { ...draft.recipeSnapshot.userOverrides } };
  return brewPersistenceSchema.parse({ ...draft, sourceType: "suggested_plan", sourceSuggestedPlanId: planId, sourceBrewId: brewB.id, sourceAnalysisId: brewB.analysis!.id, sourceRecommendationId: "demo-recommendation-grind", sourceFingerprint: brewB.analysis!.sourceFingerprint, suggestedPlanHandoff: { suggestedPlanId: planId, adjustmentId: `${planId}:adjustment`, variable: "grind", originalValue: brewB.recipeSnapshot.grindDescription?.value ?? null, suggestedValue: "slightly coarser than current", unit: null, description: "Move one small step coarser.", rationale: "Test one controlled grind change.", confidence: "medium", evidence: [{ field: "bitterness", label: "Bitterness", value: "4/5" }], userDecision: decision, confirmedAt }, brewPlan: { ...draft.brewPlan, recipeTitle: snapshot.title, grindSetting: grind }, recipeSnapshot: snapshot, executionStatus: execution, recordStatus: execution === "completed" ? "saved" : "draft", feedbackStatus: execution === "completed" ? "awaiting_feedback" : "not_requested", startedAt, completedAt: execution === "completed" ? iso(minute + 6) : null, currentStageOrder: execution === "not_started" ? 0 : execution === "in_progress" ? 1 : snapshot.steps.length, currentStageStartedAt: execution === "in_progress" ? iso(minute + 3) : null, stageResults: execution === "not_started" ? [] : results(draft, execution === "in_progress" ? 1 : snapshot.steps.length), actualTotalTimeSeconds: execution === "completed" ? 250 : null, updatedAt: iso(minute + 6) });
}

const plans = {
  ready: plan("demo-plan-ready", null, "draft", 600),
  pending: plan("demo-plan-pending", "demo-brew-f-pending", "draft", 610),
  accepted: plan("demo-plan-accepted", "demo-brew-g-accepted", "draft", 620),
  overridden: plan("demo-plan-overridden", "demo-brew-h-overridden", "draft", 630),
  progress: plan("demo-plan-progress", "demo-brew-i-progress", "used", 640, iso(642)),
  completed: plan("demo-plan-completed", "demo-brew-j-result", "used", 650, iso(652)),
  repair: plan("demo-plan-repair", "demo-brew-missing-result", "draft", 660),
};
const brewF = suggested("demo-brew-f-pending", plans.pending.id, "pending", 610);
const brewG = suggested("demo-brew-g-accepted", plans.accepted.id, "accepted", 620);
const brewH = suggested("demo-brew-h-overridden", plans.overridden.id, "overridden", 630);
const brewI = suggested("demo-brew-i-progress", plans.progress.id, "accepted", 640, "in_progress");
const brewJ = suggested("demo-brew-j-result", plans.completed.id, "accepted", 650, "completed");
const failedAttempt: BrewAnalysisAttempt = brewAnalysisAttemptSchema.parse({ id: "demo:attempt:failed", requestedAt: iso(700), completedAt: iso(701), status: "failed", provider: "local", model: "demo-rules-v1", errorCode: "demo_failure", errorMessage: "A deterministic previous-attempt failure for retry UI." });
const brewK: Brew = { ...completed("demo-brew-k-failed-analysis", 700), analysisStatus: "failed", analysis: analysis(completed("demo-brew-k-failed-analysis", 700)), analysisAttempt: failedAttempt };

export interface DemoFixtures { profile: { displayName: string; experienceLevel: "developing"; selectedNeeds: Array<"improve_consistency" | "track_and_compare"> }; brews: Brew[]; plans: SuggestedBrewPlan[]; }
export function createFullDemoFixtures(): DemoFixtures {
  const brews = [brewA, brewB, brewC, brewD, brewE, brewF, brewG, brewH, brewI, brewJ, brewK].map((brew) => brewPersistenceSchema.parse(structuredClone(brew)));
  const suggestedPlans = Object.values(plans).map((item) => suggestedBrewPlanSchema.parse(structuredClone(item)));
  return { profile: { displayName: "Demo Brewer", experienceLevel: "developing", selectedNeeds: ["improve_consistency", "track_and_compare"] }, brews, plans: suggestedPlans };
}

export function createMinimalFirstBrewFixtures() { return { profile: createFullDemoFixtures().profile, brews: [brewPersistenceSchema.parse(structuredClone(brewE))], plans: [] as SuggestedBrewPlan[] }; }
export function createAnalysisNextTryFixtures() { const full = createFullDemoFixtures(); const ids = new Set([brewB.id, brewF.id, brewG.id, brewH.id, brewI.id, brewJ.id]); return { profile: full.profile, brews: full.brews.filter((brew) => ids.has(brew.id)), plans: full.plans }; }

export function createMigrationSmokeFixtures(): DemoFixtures {
  const sourceBase = completed(`${MIGRATION_SMOKE_PREFIX}source-brew`, 800);
  const source: Brew = brewPersistenceSchema.parse({ ...sourceBase, feedbackStatus: "completed", flavorFeedback: { id: `${MIGRATION_SMOKE_PREFIX}feedback`, brewId: sourceBase.id, overallImpression: "liked", acidity: 3, sweetness: 4, bitterness: 2, body: 3, clarity: 4, aftertaste: 4, balance: 4, flavorNotes: ["citrus", "caramel"], freeformNotes: "Deterministic smoke fixture.", createdAt: iso(805), updatedAt: iso(805) }, recordDetails: { bean: { name: "Smoke Test Coffee", roaster: null, origin: null, variety: null, process: null, roastLevel: null, roastDate: null }, equipment: { dripper: "V60 02", grinder: null, grinderSetting: null, kettle: null, filter: null }, actualDoseGrams: 15, actualWaterGrams: 240, actualTemperatureCelsius: 92, notes: "Demo-safe migration round-trip record.", createdAt: iso(805), updatedAt: iso(805) }, analysisStatus: "completed", analysis: analysis(sourceBase, `${MIGRATION_SMOKE_PREFIX}fingerprint`), updatedAt: iso(805) });
  const planId = `${MIGRATION_SMOKE_PREFIX}plan`;
  const resultId = `${MIGRATION_SMOKE_PREFIX}resulting-brew`;
  const planFixture = plan(planId, resultId, "draft", 810);
  const smokePlan: SuggestedBrewPlan = suggestedBrewPlanSchema.parse({ ...planFixture, sourceBrewId: source.id, sourceAnalysisId: source.analysis!.id, sourceFingerprint: source.analysis!.sourceFingerprint, resultingBrewId: resultId, title: "Migration Smoke Next Try", adjustments: planFixture.adjustments.map((item) => ({ ...item, id: `${MIGRATION_SMOKE_PREFIX}adjustment` })) });
  const resultFixture = suggested(resultId, planId, "accepted", 810);
  const result: Brew = brewPersistenceSchema.parse({ ...resultFixture, sourceBrewId: source.id, sourceAnalysisId: source.analysis!.id, sourceFingerprint: source.analysis!.sourceFingerprint, suggestedPlanHandoff: { ...resultFixture.suggestedPlanHandoff!, adjustmentId: `${MIGRATION_SMOKE_PREFIX}adjustment` }, executionStatus: "not_started", startedAt: null, completedAt: null, currentStageOrder: 0, currentStageStartedAt: null, stageResults: [], actualTotalTimeSeconds: null });
  const parsed = demoFixtureSchema.parse({ profile: { displayName: "Migration Smoke Brewer", experienceLevel: "developing", selectedNeeds: ["track_and_compare"] }, brews: [source, result], plans: [smokePlan] });
  return { profile: { displayName: parsed.profile.displayName, experienceLevel: "developing", selectedNeeds: ["track_and_compare"] }, brews: parsed.brews, plans: parsed.plans };
}
