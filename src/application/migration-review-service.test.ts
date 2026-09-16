import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Brew, SuggestedBrewPlan } from "@/domain";
import { continueMigrationReview, createMigrationReviewConsentState, setMigrationReviewConsent } from "@/domain";
import { createFullDemoFixtures } from "@/dev/demo-fixtures";
import type { LocalRepositoryBundle } from "@/infrastructure/repositories/repository-composition";
import type { StoredUserProfile } from "@/repositories/user-profile-repository";
import { MigrationReviewService } from "./migration-review-service";

const fixtures = createFullDemoFixtures();
const storedProfile: StoredUserProfile = { profile: { id: "local-user", displayName: fixtures.profile.displayName, experienceLevel: fixtures.profile.experienceLevel, currentNeeds: fixtures.profile.selectedNeeds, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" }, selectedNeeds: fixtures.profile.selectedNeeds, onboardingCompleted: true };
function bundle(options: { profile?: StoredUserProfile | null; brews?: Brew[]; plans?: SuggestedBrewPlan[]; recipes?: number } = {}) {
  const profile = options.profile === undefined ? storedProfile : options.profile, brews = options.brews ?? fixtures.brews, plans = options.plans ?? fixtures.plans, recipes = options.recipes ?? 14;
  const writes = { profile: vi.fn(), brew: vi.fn(), plan: vi.fn() };
  const value: LocalRepositoryBundle = {
    userProfileRepository: { load: vi.fn(() => profile ? { status: "found" as const, value: profile } : { status: "empty" as const }), save: writes.profile, remove: vi.fn() },
    brewRepository: { listAll: vi.fn(() => ({ ok: true as const, value: brews })), listDrafts: vi.fn(), listJournalEntries: vi.fn(), getById: vi.fn(), findBySourceSuggestedPlanId: vi.fn(), createDraft: writes.brew, upsertMany: vi.fn(), removeByIdPrefix: vi.fn(), updateDraft: vi.fn(), deleteDraft: vi.fn() },
    suggestedPlanRepository: { list: vi.fn(() => ({ ok: true as const, value: plans })), listBySourceBrewId: vi.fn(), getById: vi.fn(), findByResultingBrewId: vi.fn(), create: writes.plan, upsertMany: vi.fn(), removeByIdPrefix: vi.fn(), update: vi.fn(), markUsed: vi.fn() },
    recipeRepository: { listRecipes: vi.fn(async () => Array.from({ length: recipes }, (_, index) => fixtures.brews[0].recipeSnapshot.sourceRecipeId ? { id: `recipe-${index}` } : { id: `fallback-${index}` }) as never[]), getRecipeById: vi.fn() },
  };
  return { value, writes };
}
function validSubset() { const plan = fixtures.plans.find((item) => item.id === "demo-plan-completed")!; return { plans: [plan], brews: fixtures.brews.filter((brew) => brew.id === plan.sourceBrewId || brew.id === plan.resultingBrewId) }; }

describe("MigrationReviewService read-only review", () => {
  it("collects all summary counts through repositories", async () => { const local = bundle({ recipes: 14 }); const result = await new MigrationReviewService(local.value).collectSummary(); expect(result.summary).toEqual({ profile: 1, recipes: 14, brews: fixtures.brews.length, suggestedPlans: fixtures.plans.length }); });
  it("accepts a valid graph by reusing the Cloud 3-2 validator", async () => { const local = bundle(validSubset()); const result = await new MigrationReviewService(local.value).review(); expect(result.validation).toEqual({ valid: true, errors: [] }); });
  it("builds readable warnings for a broken graph", async () => { const subset = validSubset(), broken = [{ ...subset.plans[0], resultingBrewId: "missing-brew" }]; const result = await new MigrationReviewService(bundle({ ...subset, plans: broken }).value).review(); expect(result.validation.valid).toBe(false); expect(result.warnings.some((warning) => warning.code === "missing_resulting_brew" && warning.entityId === broken[0].id)).toBe(true); });
  it("reports duplicate IDs supplied by a repository", async () => { const subset = validSubset(), duplicate = [subset.brews[0], structuredClone(subset.brews[0])]; const result = await new MigrationReviewService(bundle({ brews: duplicate, plans: [] }).value).review(); expect(result.warnings.map((warning) => warning.code)).toContain("duplicate_brew_id"); });
  it("reports zero data without failing or fabricating Profile", async () => { const result = await new MigrationReviewService(bundle({ profile: null, brews: [], plans: [], recipes: 0 }).value).review(); expect(result.summary).toEqual({ profile: 0, recipes: 0, brews: 0, suggestedPlans: 0 }); expect(result.validation.valid).toBe(false); expect(result.warnings.map((warning) => warning.code)).toContain("profile_missing"); });
  it("counts a large local dataset deterministically", async () => { const template = fixtures.brews.find((brew) => !brew.sourceSuggestedPlanId)!; const brews = Array.from({ length: 1000 }, (_, index) => ({ ...structuredClone(template), id: `large-${String(index).padStart(4, "0")}` })); const result = await new MigrationReviewService(bundle({ brews, plans: [], recipes: 250 }).value).review(); expect(result.summary).toMatchObject({ brews: 1000, recipes: 250 }); });
  it("does not invoke any repository write method", async () => { const local = bundle(); await new MigrationReviewService(local.value).review(); expect(local.writes.profile).not.toHaveBeenCalled(); expect(local.writes.brew).not.toHaveBeenCalled(); expect(local.writes.plan).not.toHaveBeenCalled(); });
  it("does not modify Brew or Plan input arrays", async () => { const subset = validSubset(), before = structuredClone(subset); await new MigrationReviewService(bundle(subset).value).review(); expect(subset).toEqual(before); });
  it("keeps consent false initially and Continue inert", () => { const state = createMigrationReviewConsentState(); expect(state).toEqual({ consentGiven: false, phase: "review" }); expect(continueMigrationReview(state).phase).toBe("review"); });
  it("allows Continue only after explicit consent without persistence", () => { const state = setMigrationReviewConsent(createMigrationReviewConsentState(), true); expect(continueMigrationReview(state)).toEqual({ consentGiven: true, phase: "ready" }); });
  it("contains no remote repository, upload, checkpoint, or Supabase client dependency", () => { const source = readFileSync(resolve(process.cwd(), "src/application/migration-review-service.ts"), "utf8"); expect(source).not.toMatch(/Supabase|RemoteRepository|createMigrationRepositoryBundle|upload|checkpoint|saveMigration|runMigration/); });
  it("uses the fixed runtime Local bundle for Review collection", () => { const source = readFileSync(resolve(process.cwd(), "src/components/migration-review.tsx"), "utf8"); expect(source).toContain("new MigrationReviewService(getRuntimeRepositoryBundle())"); expect(source).not.toMatch(/Supabase(?:UserProfile|Brew|SuggestedPlan)Repository/); });
  it("provides accessible status, alert, checkbox label, disabled Continue, and focusable heading contracts", () => { const source = readFileSync(resolve(process.cwd(), "src/components/migration-review.tsx"), "utf8"); expect(source).toMatch(/role="status"/); expect(source).toMatch(/role="alert"/); expect(source).toMatch(/type="checkbox"/); expect(source).toMatch(/disabled={!review\.consentGiven\|\|!review\.validation\.valid}/); expect(source).toMatch(/tabIndex={-1}/); });
  it("provides the 390px responsive summary and no fixed-width contract", () => { const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8"); expect(css).toMatch(/@media\(max-width:24\.5rem\)[\s\S]*\.migration-summary\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/); expect(css).not.toMatch(/\.migration-page[^}]*width:\s*390px/); });
  it("keeps migration behind a second explicit action", () => { const source = readFileSync(resolve(process.cwd(), "src/components/migration-review.tsx"), "utf8"); expect(source).toContain("Start Migration"); expect(source).toContain('execute("start")'); expect(source).not.toMatch(/useEffect\([^)]*execute\(/); });
});
