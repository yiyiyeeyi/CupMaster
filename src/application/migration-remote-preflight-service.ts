import { classifyProfileMigrationState, sameMigrationEntity, toMigrationBaseBrew, type Brew, type SuggestedBrewPlan } from "@/domain";
import type { StoredUserProfile } from "@/repositories/user-profile-repository";
import type { LocalRepositoryBundle } from "@/infrastructure/repositories/repository-composition";
import type { CloudMigrationGateway, GatewayResult } from "@/infrastructure/supabase/cloud-migration-remote-gateway";
import type { RemoteMigrationRecord } from "@/infrastructure/supabase/remote-repository-contracts";

export type PreflightCounts = { missing: number; matching: number; conflict: number; deleted: number; invalid: number };
export type MigrationRemotePreflight = { profile: "missing" | "matching" | "bootstrap" | "conflict" | "deleted" | "invalid"; brews: PreflightCounts; suggestedPlans: PreflightCounts; canStart: boolean };
export type MigrationRemotePreflightResult = { ok: true; value: MigrationRemotePreflight } | { ok: false; code: "unauthenticated" | "network_error"; message: string };
const empty = (): PreflightCounts => ({ missing: 0, matching: 0, conflict: 0, deleted: 0, invalid: 0 });

export class MigrationRemotePreflightService {
  constructor(private readonly local: LocalRepositoryBundle, private readonly remote: CloudMigrationGateway) {}
  private failure<T>(result: GatewayResult<T>): MigrationRemotePreflightResult | null { return result.ok ? null : { ok: false, code: result.code === "unauthenticated" ? "unauthenticated" : "network_error", message: "Remote preflight is unavailable. Local Mode remains active." }; }
  private classify<T>(record: RemoteMigrationRecord<T>, local: T, counts: PreflightCounts, base?: T) { if (record.state === "missing") counts.missing++; else if (record.state === "deleted") counts.deleted++; else if (record.state === "invalid") counts.invalid++; else if (sameMigrationEntity(local, record.entity) || (base && sameMigrationEntity(base, record.entity))) counts.matching++; else counts.conflict++; }
  async collect(): Promise<MigrationRemotePreflightResult> {
    const profileRead = this.local.userProfileRepository.load(), brewRead = this.local.brewRepository.listAll(), planRead = this.local.suggestedPlanRepository.list();
    if (profileRead.status !== "found" || !brewRead.ok || !planRead.ok) return { ok: false, code: "network_error", message: "Local migration data could not be reviewed." };
    const profile = profileRead.value as StoredUserProfile, remoteProfile = await this.remote.readProfile(), profileFailure = this.failure(remoteProfile); if (profileFailure) return profileFailure;
    if (!remoteProfile.ok) return profileFailure!;
    let profileState: MigrationRemotePreflight["profile"];
    if (remoteProfile.value.state === "missing") profileState = "missing"; else if (remoteProfile.value.state === "deleted") profileState = "deleted"; else if (remoteProfile.value.state === "invalid") profileState = "invalid"; else { const state = classifyProfileMigrationState(profile, remoteProfile.value.entity); profileState = state === "missing_remote" ? "missing" : state === "profile_conflict" ? "conflict" : state; }
    const brews = empty(), suggestedPlans = empty();
    for (const brew of brewRead.value) { const result = await this.remote.readBrew(brew.id), failure = this.failure(result); if (failure) return failure; if (result.ok) this.classify<Brew>(result.value, brew, brews, toMigrationBaseBrew(brew)); }
    for (const plan of planRead.value) { const result = await this.remote.readPlan(plan.id), failure = this.failure(result); if (failure) return failure; if (result.ok) this.classify<SuggestedBrewPlan>(result.value, plan, suggestedPlans); }
    const conflicts = profileState === "conflict" || profileState === "deleted" || profileState === "invalid" || brews.conflict + brews.deleted + brews.invalid + suggestedPlans.conflict + suggestedPlans.deleted + suggestedPlans.invalid > 0;
    return { ok: true, value: { profile: profileState, brews, suggestedPlans, canStart: !conflicts } };
  }
}
