import type { Brew, SuggestedBrewPlan } from "@/domain";
import type { StoredUserProfile } from "@/repositories/user-profile-repository";
import type { CloudMigrationGateway, GatewayResult } from "./cloud-migration-remote-gateway";

export const migrationFaultPoints = ["before_profile_write","after_profile_write","before_brew_batch","after_first_brew_batch","before_plan_batch","after_first_plan_batch","before_reference_patch","before_verification"] as const;
export type MigrationFaultPoint = typeof migrationFaultPoints[number];
const injected = <T>(): GatewayResult<T> => ({ ok: false, code: "persistence_failed", message: "Injected migration network failure." });

export class FaultInjectingCloudMigrationRemoteGateway implements CloudMigrationGateway {
  private brewWrites = 0; private planWrites = 0;
  constructor(private readonly delegate: CloudMigrationGateway, private readonly point: MigrationFaultPoint | null, environment = process.env.NODE_ENV) { if (environment === "production" && point) throw new Error("Migration fault injection is disabled in production."); }
  private is(point: MigrationFaultPoint) { return this.point === point; }
  readProfile() { return this.delegate.readProfile(); }
  async createProfile(profile: StoredUserProfile) { if (this.is("before_profile_write")) return injected<StoredUserProfile>(); const result = await this.delegate.createProfile(profile); return this.is("after_profile_write") ? injected<StoredUserProfile>() : result; }
  async updateProfile(profile: StoredUserProfile, revision: number) { if (this.is("before_profile_write")) return injected<StoredUserProfile>(); const result = await this.delegate.updateProfile(profile, revision); return this.is("after_profile_write") ? injected<StoredUserProfile>() : result; }
  readBrew(id: string) { return this.delegate.readBrew(id); }
  async createBrew(brew: Brew) { if (this.brewWrites === 0 && this.is("before_brew_batch")) return injected<Brew>(); const result = await this.delegate.createBrew(brew); this.brewWrites++; return this.brewWrites === 1 && this.is("after_first_brew_batch") ? injected<Brew>() : result; }
  async patchBrew(brew: Brew, revision: number) { if (this.is("before_reference_patch")) return injected<Brew>(); return this.delegate.patchBrew(brew, revision); }
  readPlan(id: string) { return this.delegate.readPlan(id); }
  async createPlan(plan: SuggestedBrewPlan) { if (this.planWrites === 0 && this.is("before_plan_batch")) return injected<SuggestedBrewPlan>(); const result = await this.delegate.createPlan(plan); this.planWrites++; return this.planWrites === 1 && this.is("after_first_plan_batch") ? injected<SuggestedBrewPlan>() : result; }
  patchPlan(plan: SuggestedBrewPlan, revision: number) { return this.delegate.patchPlan(plan, revision); }
  listBrews() { return this.is("before_verification") ? Promise.resolve(injected<Brew[]>()) : this.delegate.listBrews(); }
  listPlans() { return this.delegate.listPlans(); }
}
