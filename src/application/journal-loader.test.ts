import { describe, expect, it } from "vitest";
import type { Brew, SuggestedBrewPlan } from "@/domain";
import { recipeFixtures } from "@/data/fixtures/recipes";
import { createBrewDraft, createQuickPrepareDefaults } from "./brew-factory";
import { JournalLoader } from "./journal-loader";
import type { BrewRepository } from "@/repositories/brew-repository";
import type { SuggestedPlanRepository } from "@/repositories/suggested-plan-repository";

const source = createBrewDraft(recipeFixtures[0], createQuickPrepareDefaults(recipeFixtures[0]), { createId: () => "source" });
const plan: SuggestedBrewPlan = { id: "plan", sourceBrewId: source.id, sourceAnalysisId: "analysis", sourceRecommendationId: "recommendation", sourceFingerprint: "fingerprint", sourceAnalysisGeneratedAt: "2026-01-01T00:00:00.000Z", title: "Next Try", resultingBrewId: null, status: "draft", usedAt: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", baseRecipeSnapshot: source.recipeSnapshot, adjustments: [{ id: "adjustment", variable: "grind", scope: "overall", stageId: null, direction: "coarser", previousValue: "fine", suggestedValue: "coarse", unit: null, description: "Slightly coarser" }], rationale: "Test one variable.", confidence: "medium", evidence: [{ field: "bitterness", label: "Bitterness", value: "high" }], keepUnchanged: ["Dose"] };
function repositories(planFailure = false) {
  const counts = { listAll: 0, planList: 0 };
  const brews: BrewRepository = {
    listAll: () => { counts.listAll += 1; return { ok: true, value: [source] }; }, listDrafts: () => ({ ok: true, value: [source] }), listJournalEntries: () => ({ ok: true, value: [] }), getById: (id) => ({ ok: true, value: id === source.id ? source : null }), findBySourceSuggestedPlanId: () => ({ ok: true, value: null }), createDraft: (brew) => ({ ok: true, value: brew }), upsertMany: (values) => ({ ok: true, value: values }), removeByIdPrefix: () => ({ ok: true, removed: 0 }), updateDraft: (brew) => ({ ok: true, value: brew }), deleteDraft: () => ({ ok: true }),
  };
  const plans: SuggestedPlanRepository = {
    list: () => { counts.planList += 1; return planFailure ? { ok: false, value: [], message: "invalid_storage" } : { ok: true, value: [plan] }; }, listBySourceBrewId: () => ({ ok: true, value: [plan] }), getById: () => ({ ok: true, value: null }), findByResultingBrewId: () => ({ ok: true, value: null }), create: (value) => ({ ok: true, value }), upsertMany: (values) => ({ ok: true, value: values }), removeByIdPrefix: () => ({ ok: true, removed: 0 }), update: (value) => ({ ok: true, value }), markUsed: () => ({ ok: false, message: "unused" }),
  };
  return { brews, plans, counts };
}
describe("JournalLoader", () => {
  it("batch reads Brews and Plans once and builds source mappings", () => { const { brews, plans, counts } = repositories(); const result = new JournalLoader(brews, plans).load(); expect(result).toMatchObject({ ok: true, cards: [{ brew: { id: "source" }, sourceNextTry: { hasSuggestedPlans: true, totalPlans: 1 }, action: { href: "/journal/source" } }] }); expect(counts).toEqual({ listAll: 1, planList: 1 }); });
  it("keeps the Brew list when Plan storage fails", () => { const { brews, plans } = repositories(true); const result = new JournalLoader(brews, plans).load(); expect(result).toMatchObject({ ok: true, cards: [{ brew: { id: "source" }, sourceNextTry: { hasSuggestedPlans: false, hasPartialDataWarning: true } }], notice: "Some Next Try links could not be loaded." }); });
  it("keeps embedded resulting Brew context independent from Plan lookup", () => { const resulting: Brew = { ...source, id: "result", sourceType: "suggested_plan", sourceSuggestedPlanId: "missing", suggestedPlanHandoff: { suggestedPlanId: "missing", adjustmentId: "a", variable: "grind", originalValue: "fine", suggestedValue: "coarse", unit: null, description: "coarser", rationale: "test", confidence: "medium", evidence: [], userDecision: "accepted", confirmedAt: "2026-01-01T00:00:00.000Z" } }; const { plans } = repositories(true); const { brews } = repositories(); brews.listAll = () => ({ ok: true, value: [resulting] }); const loaded = new JournalLoader(brews, plans).load(); expect(loaded).toMatchObject({ ok: true, cards: [{ resultContext: { isSuggestedPlanBrew: true, handoffLabel: "Accepted" } }] }); });
});
