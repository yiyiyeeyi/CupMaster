import { createReviewFingerprint, validateLocalCloudMigrationGraph, type LocalCloudMigrationGraph, type MigrationReview, type MigrationReviewSummary, type MigrationReviewWarning } from "@/domain";
import type { LocalRepositoryBundle } from "@/infrastructure/repositories/repository-composition";

type Collected = {
  graph: LocalCloudMigrationGraph;
  summary: MigrationReviewSummary;
  repositoryWarnings: MigrationReviewWarning[];
};

export class MigrationReviewService {
  constructor(private readonly repositories: LocalRepositoryBundle) {}

  async collectSummary(): Promise<Collected> {
    const profileRead = this.repositories.userProfileRepository.load();
    const brewRead = this.repositories.brewRepository.listAll();
    const planRead = this.repositories.suggestedPlanRepository.list();
    let recipes = 0;
    const repositoryWarnings: MigrationReviewWarning[] = [];
    try { recipes = (await this.repositories.recipeRepository.listRecipes()).length; }
    catch { repositoryWarnings.push({ code: "recipes_unavailable", entityId: null, title: "Recipes", message: "Local Recipe data could not be reviewed." }); }
    if (profileRead.status === "recovered") repositoryWarnings.push({ code: "profile_unavailable", entityId: null, title: "Profile", message: profileRead.message });
    if (!brewRead.ok) repositoryWarnings.push({ code: "brews_unavailable", entityId: null, title: "Brews", message: brewRead.message });
    if (!planRead.ok) repositoryWarnings.push({ code: "plans_unavailable", entityId: null, title: "Suggested Plans", message: planRead.message });
    if (brewRead.ok && brewRead.notice) repositoryWarnings.push({ code: "legacy_data", entityId: null, title: "Brews", message: brewRead.notice });
    if (planRead.ok && planRead.notice) repositoryWarnings.push({ code: "legacy_data", entityId: null, title: "Suggested Plans", message: planRead.notice });
    const profile = profileRead.status === "found" ? profileRead.value : null;
    const graph = { profile, brews: brewRead.value, suggestedPlans: planRead.value };
    return { graph, summary: { profile: profile ? 1 : 0, recipes, brews: brewRead.value.length, suggestedPlans: planRead.value.length }, repositoryWarnings };
  }

  validateGraph(graph: LocalCloudMigrationGraph) { return validateLocalCloudMigrationGraph(graph); }

  buildWarnings(collected: Collected, validation = this.validateGraph(collected.graph)): MigrationReviewWarning[] {
    const warnings = [...collected.repositoryWarnings];
    if (!collected.graph.profile) warnings.push({ code: "profile_missing", entityId: null, title: "Profile", message: "No completed local Profile was found." });
    warnings.push(...validation.errors.map((error) => ({ code: error.code, entityId: error.entityId, title: error.entityId, message: error.message })));
    return warnings;
  }

  async review(): Promise<MigrationReview> {
    const collected = await this.collectSummary();
    const graph = this.validateGraph(collected.graph);
    return { summary: collected.summary, validation: { valid: graph.valid && collected.graph.profile !== null && collected.repositoryWarnings.length === 0, errors: graph.errors }, warnings: this.buildWarnings(collected, graph), consentGiven: false, phase: "review", reviewFingerprint:createReviewFingerprint({profile:collected.graph.profile,brews:collected.graph.brews,suggestedPlans:collected.graph.suggestedPlans,recipeCount:collected.summary.recipes}) };
  }
}
