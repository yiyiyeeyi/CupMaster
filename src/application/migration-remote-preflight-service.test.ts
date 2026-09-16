import { describe, expect, it, vi } from "vitest";
import type { LocalRepositoryBundle } from "@/infrastructure/repositories/repository-composition";
import type { CloudMigrationGateway } from "@/infrastructure/supabase/cloud-migration-remote-gateway";
import { LocalUserProfileRepository } from "@/repositories/local-user-profile-repository";
import { LocalBrewRepository } from "@/repositories/local-brew-repository";
import { LocalSuggestedPlanRepository } from "@/repositories/local-suggested-plan-repository";
import { MockRecipeRepository } from "@/repositories/mock-recipe-repository";
import { MigrationRemotePreflightService } from "./migration-remote-preflight-service";
import { DemoSeedService } from "@/dev/demo-seed-service";

class MemoryStorage { values = new Map<string,string>(); getItem(key:string){return this.values.get(key)??null} setItem(key:string,value:string){this.values.set(key,value)} }
function localBundle():LocalRepositoryBundle { const storage=new MemoryStorage(); return { userProfileRepository:new LocalUserProfileRepository(storage),brewRepository:new LocalBrewRepository(storage),suggestedPlanRepository:new LocalSuggestedPlanRepository(storage),recipeRepository:new MockRecipeRepository() }; }
const missingGateway = (): CloudMigrationGateway => ({ readProfile:vi.fn(async()=>({ok:true as const,value:{state:"missing" as const}})),createProfile:vi.fn(),updateProfile:vi.fn(),readBrew:vi.fn(async()=>({ok:true as const,value:{state:"missing" as const}})),createBrew:vi.fn(),patchBrew:vi.fn(),readPlan:vi.fn(async()=>({ok:true as const,value:{state:"missing" as const}})),createPlan:vi.fn(),patchPlan:vi.fn(),listBrews:vi.fn(),listPlans:vi.fn() });
describe("MigrationRemotePreflightService",()=>{
  it("summarizes missing remote entities without writes",async()=>{const local=localBundle(),seed=new DemoSeedService(local.userProfileRepository,local.brewRepository,local.suggestedPlanRepository,"test");seed.seed("migration_smoke",{overwriteProfile:true});const gateway=missingGateway(),result=await new MigrationRemotePreflightService(local,gateway).collect();expect(result).toMatchObject({ok:true,value:{profile:"missing",brews:{missing:2},suggestedPlans:{missing:1},canStart:true}});expect(gateway.createProfile).not.toHaveBeenCalled();expect(gateway.createBrew).not.toHaveBeenCalled();expect(gateway.createPlan).not.toHaveBeenCalled()});
  it("maps remote failure to a safe retryable result",async()=>{const local=localBundle(),seed=new DemoSeedService(local.userProfileRepository,local.brewRepository,local.suggestedPlanRepository,"test");seed.seed("migration_smoke",{overwriteProfile:true});const gateway=missingGateway();gateway.readProfile=vi.fn(async()=>({ok:false as const,code:"persistence_failed" as const,message:"private details"}));expect(await new MigrationRemotePreflightService(local,gateway).collect()).toEqual({ok:false,code:"network_error",message:"Remote preflight is unavailable. Local Mode remains active."})});
});
