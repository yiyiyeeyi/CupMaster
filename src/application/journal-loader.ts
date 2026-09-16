import type { Brew, SuggestedBrewPlan } from "@/domain";
import type { BrewRepository } from "@/repositories/brew-repository";
import type { SuggestedPlanRepository } from "@/repositories/suggested-plan-repository";
import { getJournalBrewProjection, getSourceBrewSuggestedPlanProjection, type SourceBrewSuggestedPlanProjection } from "./suggested-plan-projection";

export interface JournalBrewCardViewModel {
  brew: Brew;
  resultContext: ReturnType<typeof getJournalBrewProjection>;
  sourceNextTry: SourceBrewSuggestedPlanProjection;
  action: { label: string; href: string };
}

export type JournalLoadResult =
  | { ok: true; cards: JournalBrewCardViewModel[]; notice?: string }
  | { ok: false; cards: []; message: string };

export class JournalLoader {
  constructor(private readonly brews: BrewRepository, private readonly plans: SuggestedPlanRepository) {}

  load(): JournalLoadResult {
    const brewRead = this.brews.listAll();
    if (!brewRead.ok) return { ok: false, cards: [], message: brewRead.message };
    const visible = brewRead.value.filter((brew) => brew.recordStatus === "draft" || (brew.executionStatus === "completed" && brew.recordStatus === "saved"));
    const planRead = this.plans.list();
    const allPlans: SuggestedBrewPlan[] = planRead.value;
    const plansBySource = new Map<string, SuggestedBrewPlan[]>();
    for (const plan of allPlans) plansBySource.set(plan.sourceBrewId, [...(plansBySource.get(plan.sourceBrewId) ?? []), plan]);
    const brewsById = new Map(brewRead.value.map((brew) => [brew.id, brew]));
    const cards = visible
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
      .map((brew) => { const resultContext = getJournalBrewProjection(brew); const sourceNextTry = getSourceBrewSuggestedPlanProjection(brew, plansBySource.get(brew.id) ?? [], brewsById, !planRead.ok); return { brew, resultContext, sourceNextTry, action: sourceNextTry.hasSuggestedPlans ? { label: "View brew and Next Try", href: `/journal/${brew.id}` } : { label: resultContext.actionLabel, href: resultContext.targetRoute } }; });
    const notices = [brewRead.notice, planRead.ok ? planRead.notice : "Some Next Try links could not be loaded."].filter(Boolean);
    return { ok: true, cards, ...(notices.length > 0 && { notice: notices.join(" ") }) };
  }

  getSuggestedPlansForSourceBrew(brewId: string) {
    const brewRead = this.brews.getById(brewId);
    if (!brewRead.value) return { ok: false as const, message: brewRead.ok ? "The source Brew could not be found." : brewRead.message };
    const planRead = this.plans.listBySourceBrewId(brewId);
    const allBrews = this.brews.listAll();
    const map = new Map(allBrews.value.map((brew) => [brew.id, brew]));
    return { ok: true as const, brew: brewRead.value, projection: getSourceBrewSuggestedPlanProjection(brewRead.value, planRead.value, map, !planRead.ok || !allBrews.ok), ...(planRead.ok ? planRead.notice && { notice: planRead.notice } : { notice: "Some Next Try links could not be loaded." }) };
  }
}
