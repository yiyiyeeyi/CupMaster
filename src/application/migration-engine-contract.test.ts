import{readFileSync,readdirSync}from"node:fs";import{resolve}from"node:path";import{describe,expect,it}from"vitest";import{RUNTIME_REPOSITORY_MODE,getRuntimeRepositoryBundle}from"@/infrastructure/repositories/repository-composition";import{LocalBrewRepository}from"@/repositories/local-brew-repository";import{SupabaseBrewRepository}from"@/infrastructure/supabase/supabase-brew-repository";import{SupabaseSuggestedPlanRepository}from"@/infrastructure/supabase/supabase-suggested-plan-repository";import{SupabaseUserProfileRepository}from"@/infrastructure/supabase/supabase-user-profile-repository";
const component=()=>readFileSync(resolve(process.cwd(),"src/components/migration-review.tsx"),"utf8"),service=()=>readFileSync(resolve(process.cwd(),"src/application/local-to-cloud-migration-service.ts"),"utf8"),gateway=()=>readFileSync(resolve(process.cwd(),"src/infrastructure/supabase/cloud-migration-remote-gateway.ts"),"utf8");
describe("Cloud 4-2 UI and runtime contract",()=>{
 it("requires an explicit Start Migration click",()=>{expect(component()).toContain("onClick={()=>void execute(\"start\")}");expect(component()).toContain("Start Migration")});
 it("does not start migration from a page-load effect",()=>expect(component()).not.toMatch(/useEffect\([^)]*execute\(/));
 it("guards duplicate submission",()=>expect(component()).toMatch(/if\(lock\.current/));
 it("shows real completed and total counts",()=>{expect(component()).toContain("cp.migratedBrewIds.length} / {cp.totalBrewCount");expect(component()).toContain("cp.migratedSuggestedPlanIds.length} / {cp.totalSuggestedPlanCount")});
 it("shows Retry for failed migration",()=>expect(component()).toContain('run.status==="interrupted"?"Resume":"Retry"'));
 it("shows Resume for interrupted migration",()=>expect(component()).toContain('run.status==="interrupted"?"Resume":"Retry"'));
 it("states that completed migration remains Local Mode",()=>expect(component()).toContain("CupMaster is still using local mode on this device."));
 it("does not claim sync is enabled",()=>{expect(component()).toContain("Automatic sync has not started.");expect(component()).not.toMatch(/Everything is now synced|Cloud mode enabled|update everywhere/)});
 it("keeps runtime repository mode Local",()=>{expect(RUNTIME_REPOSITORY_MODE).toBe("local");expect(getRuntimeRepositoryBundle().brewRepository).toBeInstanceOf(LocalBrewRepository)});
 it("does not delete Local Profile, Brew, or Plan records",()=>expect(service()).not.toMatch(/\.remove\(|deleteDraft|removeByIdPrefix|localStorage\.clear/));
 it("does not create a SyncService",()=>{const files=readdirSync(resolve(process.cwd(),"src"),{recursive:true}).map(String);expect(files.some(x=>/sync-service/i.test(x))).toBe(false)});
 it("does not create an OfflineQueue",()=>{const files=readdirSync(resolve(process.cwd(),"src"),{recursive:true}).map(String);expect(files.some(x=>/offline-queue/i.test(x))).toBe(false)});
});
describe("migration-specific Remote gateway contract",()=>{
 it.each([[SupabaseUserProfileRepository,"getForMigration"],[SupabaseBrewRepository,"getForMigration"],[SupabaseSuggestedPlanRepository,"getForMigration"]]as const)("%s exposes tombstone-aware migration reads",(Repository,method)=>expect(Object.getOwnPropertyNames(Repository.prototype)).toContain(method));
 it("does not accept caller userId",()=>expect(gateway()).not.toMatch(/constructor\([^)]*userId|readBrew\([^)]*userId/));
 it("uses revision-aware Brew patch",()=>expect(gateway()).toContain("updateIfRevision(b,r)"));
 it("uses revision-aware Plan patch",()=>expect(gateway()).toContain("updateIfRevision(p,r)"));
 it("contains no service role, token, or secret handling",()=>expect(`${gateway()}${service()}`).not.toMatch(/service.role|service_role|access_token|refresh_token|password/i));
});
