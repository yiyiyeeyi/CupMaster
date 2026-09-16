import type { BrewRepository } from "@/repositories/brew-repository";
import type { SuggestedPlanRepository } from "@/repositories/suggested-plan-repository";
import type { UserProfileRepository } from "@/repositories/user-profile-repository";
import { DEMO_PREFIX, MIGRATION_SMOKE_PREFIX, createAnalysisNextTryFixtures, createFullDemoFixtures, createMigrationSmokeFixtures, createMinimalFirstBrewFixtures } from "./demo-fixtures";
import { demoFixtureSchema } from "./demo-seed-schema";

export type DemoSeedMode = "full" | "minimal" | "analysis_next_try" | "migration_smoke";
export type DemoSeedResult = { ok: true; brewCount: number; planCount: number; profileSaved: boolean } | { ok: false; code: "production_blocked" | "confirmation_required" | "invalid_fixtures" | "persistence_failed"; message: string };

export class DemoSeedService {
  constructor(private profiles: UserProfileRepository, private brews: BrewRepository, private plans: SuggestedPlanRepository, private environment = process.env.NODE_ENV) {}
  private allowed() { return this.environment === "development" || this.environment === "test"; }
  counts() { const brews = this.brews.listAll(), plans = this.plans.list(), profile = this.profiles.load(); return { brews: brews.value.length, plans: plans.value.length, profile: profile.status === "found", demoBrews: brews.value.filter((item) => item.id.startsWith(DEMO_PREFIX)).length, demoPlans: plans.value.filter((item) => item.id.startsWith(DEMO_PREFIX)).length }; }
  seed(mode: DemoSeedMode, options: { overwriteProfile?: boolean } = {}): DemoSeedResult {
    if (!this.allowed()) return { ok: false, code: "production_blocked", message: "Demo seed writes are disabled outside development." };
    const candidate = mode === "full" ? createFullDemoFixtures() : mode === "minimal" ? createMinimalFirstBrewFixtures() : mode === "migration_smoke" ? createMigrationSmokeFixtures() : createAnalysisNextTryFixtures();
    const parsed = demoFixtureSchema.safeParse(candidate);
    if (!parsed.success) return { ok: false, code: "invalid_fixtures", message: parsed.error.issues[0]?.message ?? "Demo fixtures are invalid." };
    const existingProfile = this.profiles.load();
    if (existingProfile.status === "found" && existingProfile.value.profile.displayName !== "Demo Brewer" && !options.overwriteProfile) return { ok: false, code: "confirmation_required", message: "A non-demo profile exists. Confirm before replacing only the CupMaster profile; Brew and Plan records will be merged safely." };
    const prefix = mode === "migration_smoke" ? MIGRATION_SMOKE_PREFIX : DEMO_PREFIX;
    const brewWrite = this.brews.upsertMany(parsed.data.brews, prefix);
    if (!brewWrite.ok) return { ok: false, code: "persistence_failed", message: brewWrite.message };
    const planWrite = this.plans.upsertMany(parsed.data.plans, prefix);
    if (!planWrite.ok) return { ok: false, code: "persistence_failed", message: planWrite.message };
    const profileWrite = this.profiles.save({ displayName: parsed.data.profile.displayName, experienceLevel: parsed.data.profile.experienceLevel, selectedNeeds: parsed.data.profile.selectedNeeds });
    if (!profileWrite.ok) return { ok: false, code: "persistence_failed", message: profileWrite.message };
    return { ok: true, brewCount: parsed.data.brews.length, planCount: parsed.data.plans.length, profileSaved: true };
  }
  resetMigrationSmoke(): { ok: true; removedBrews: number; removedPlans: number } | { ok: false; message: string } {
    if (!this.allowed()) return { ok: false, message: "Migration smoke reset is disabled outside development." };
    const brewResult = this.brews.removeByIdPrefix(MIGRATION_SMOKE_PREFIX);
    const planResult = this.plans.removeByIdPrefix(MIGRATION_SMOKE_PREFIX);
    if (!brewResult.ok || !planResult.ok) return { ok: false, message: "Migration smoke Local data could not be reset." };
    return { ok: true, removedBrews: brewResult.removed, removedPlans: planResult.removed };
  }
  resetAll(): { ok: true; removedBrews: number; removedPlans: number } | { ok: false; message: string } {
    if (!this.allowed()) return { ok: false, message: "Demo reset is disabled outside development." };
    const brewResult = this.brews.removeByIdPrefix("");
    const planResult = this.plans.removeByIdPrefix("");
    const profileResult = this.profiles.remove();
    if (!brewResult.ok || !planResult.ok || !profileResult.ok) return { ok: false, message: "CupMaster local data could not be fully reset." };
    return { ok: true, removedBrews: brewResult.removed, removedPlans: planResult.removed };
  }
}
