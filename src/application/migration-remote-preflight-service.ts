import { validateLocalCloudMigrationGraph } from "@/domain/cloud-migration";
import { classifyProfileMigrationState, sameMigrationEntity, sameParityEntity, toMigrationBaseBrew, type Brew, type SuggestedBrewPlan } from "@/domain";
import type { StoredUserProfile } from "@/repositories/user-profile-repository";
import type { LocalRepositoryBundle } from "@/infrastructure/repositories/repository-composition";
import type { CloudMigrationGateway, GatewayResult } from "@/infrastructure/supabase/cloud-migration-remote-gateway";
import type { RemoteMigrationRecord } from "@/infrastructure/supabase/remote-repository-contracts";
import type { PreparationSyncRecord } from "@/domain/brew-preparation";

export type PreflightCounts = { missing: number; matching: number; conflict: number; deleted: number; invalid: number };
export type MigrationRemotePreflight = { profile: "missing" | "matching" | "bootstrap" | "conflict" | "deleted" | "invalid"; beans:PreflightCounts; preparations:PreflightCounts; libraryState:"missing"|"matching"|"conflict"|"invalid"; brews: PreflightCounts; suggestedPlans: PreflightCounts; canStart: boolean };
export type MigrationRemotePreflightResult = { ok: true; value: MigrationRemotePreflight } | { ok: false; code: "unauthenticated" | "network_error" | "local_data_invalid"; message: string };
const empty = (): PreflightCounts => ({ missing: 0, matching: 0, conflict: 0, deleted: 0, invalid: 0 });

export class MigrationRemotePreflightService {
  constructor(private readonly local: LocalRepositoryBundle, private readonly remote: CloudMigrationGateway) {}
  private failure<T>(result: GatewayResult<T>): MigrationRemotePreflightResult | null { return result.ok ? null : { ok: false, code: result.code === "unauthenticated" ? "unauthenticated" : "network_error", message: "Remote preflight is unavailable. Local Mode remains active." }; }
  private classify<T>(record: RemoteMigrationRecord<T>, local: T, counts: PreflightCounts, base?: T) { if (record.state === "missing") counts.missing++; else if (record.state === "deleted") counts.deleted++; else if (record.state === "invalid") counts.invalid++; else if (sameMigrationEntity(local, record.entity) || (base && sameMigrationEntity(base, record.entity))) counts.matching++; else counts.conflict++; }
  async collect(): Promise<MigrationRemotePreflightResult> {
    const profileRead = this.local.userProfileRepository.load(), brewRead = this.local.brewRepository.listAll(), planRead = this.local.suggestedPlanRepository.list();
    if (profileRead.status !== "found" || !brewRead.ok || !planRead.ok) return { ok: false, code: "network_error", message: "Local migration data could not be reviewed." };
    const beans=this.local.beanRepository?.read(),preparations=this.local.preparationRepository?.readForMigration();
    const prepRecords:PreparationSyncRecord[]|undefined=preparations?.ok?[...preparations.value.entries.map(entry=>({id:entry.id,entry,deletedAt:null})),...preparations.value.deletedIds.map(id=>({id,entry:null,deletedAt:"1970-01-01T00:00:00.000Z"}))]:undefined;
    const libraryState=beans?.ok&&preparations?.ok?{legacyImportReviewed:beans.value.legacyImportReviewed,redirects:preparations.value.redirects,lineage:preparations.value.lineage,deletedIds:preparations.value.deletedIds}:undefined;
    const graph=validateLocalCloudMigrationGraph({profile:profileRead.value,brews:brewRead.value,suggestedPlans:planRead.value,...(beans?.ok&&{beans:beans.value.beans}),...((!beans||!beans.ok)&&{beanCatalogUnavailable:true}),...(prepRecords&&{preparations:prepRecords}),...((!preparations||!preparations.ok)&&{preparationCatalogUnavailable:true}),...(libraryState&&{libraryState})});
    if(graph.errors.some(error=>error.code.startsWith("unsupported_local")))return{ok:false,code:"local_data_invalid",message:"資料含尚未支援的欄位，保留本機，請待 REQ-37b。"};
    const profile = profileRead.value as StoredUserProfile, remoteProfile = await this.remote.readProfile(), profileFailure = this.failure(remoteProfile); if (profileFailure) return profileFailure;
    if (!remoteProfile.ok) return profileFailure!;
    let profileState: MigrationRemotePreflight["profile"];
    if (remoteProfile.value.state === "missing") profileState = "missing"; else if (remoteProfile.value.state === "deleted") profileState = "deleted"; else if (remoteProfile.value.state === "invalid") profileState = "invalid"; else { const state = classifyProfileMigrationState(profile, remoteProfile.value.entity); profileState = state === "missing_remote" ? "missing" : state === "profile_conflict" ? "conflict" : state; }
    const parity=this.remote.parityRepository;if(!parity)return{ok:false,code:"network_error",message:"Remote preflight is unavailable. Local Mode remains active."};
    const remoteBeans=await parity.listBeansForMigration(),remoteBeansFailure=this.failure(remoteBeans);if(remoteBeansFailure)return remoteBeansFailure;
    const remotePreparations=await parity.listPreparationsForMigration(),remotePreparationsFailure=this.failure(remotePreparations);if(remotePreparationsFailure)return remotePreparationsFailure;
    const remoteState=await parity.readLibraryState(),remoteStateFailure=this.failure(remoteState);if(remoteStateFailure)return remoteStateFailure;
    const beansCount=empty(),preparationsCount=empty(),brews = empty(), suggestedPlans = empty();
    const remoteBeanMap=new Map(remoteBeans.ok?remoteBeans.value.map(value=>[value.entity.id,value]):[]),remotePreparationMap=new Map(remotePreparations.ok?remotePreparations.value.map(value=>[value.entity.id,value]):[]);
    for(const bean of beans?.ok?beans.value.beans:[]){const found=remoteBeanMap.get(bean.id);if(!found)beansCount.missing++;else if(sameParityEntity(bean,found.entity))beansCount.matching++;else beansCount.conflict++;}
    for(const preparation of prepRecords??[]){const found=remotePreparationMap.get(preparation.id);if(!found)preparationsCount.missing++;else if(sameParityEntity(preparation,found.entity))preparationsCount.matching++;else preparationsCount.conflict++;}
    const libraryStateStatus:MigrationRemotePreflight["libraryState"]=!remoteState.ok||!remoteState.value?"missing":libraryState&&sameParityEntity(libraryState,remoteState.value.entity)?"matching":"conflict";
    for (const brew of brewRead.value) { const result = await this.remote.readBrew(brew.id), failure = this.failure(result); if (failure) return failure; if (result.ok) this.classify<Brew>(result.value, brew, brews, toMigrationBaseBrew(brew)); }
    for (const plan of planRead.value) { const result = await this.remote.readPlan(plan.id), failure = this.failure(result); if (failure) return failure; if (result.ok) this.classify<SuggestedBrewPlan>(result.value, plan, suggestedPlans); }
    const conflicts = profileState === "conflict" || profileState === "deleted" || profileState === "invalid" || libraryStateStatus==="conflict"||beansCount.conflict+beansCount.deleted+beansCount.invalid+preparationsCount.conflict+preparationsCount.deleted+preparationsCount.invalid+brews.conflict + brews.deleted + brews.invalid + suggestedPlans.conflict + suggestedPlans.deleted + suggestedPlans.invalid > 0;
    return { ok: true, value: { profile: profileState,beans:beansCount,preparations:preparationsCount,libraryState:libraryStateStatus, brews, suggestedPlans, canStart: !conflicts } };
  }
}
