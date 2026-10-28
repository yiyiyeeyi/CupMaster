import { describe, expect, it, vi } from "vitest";
import type { LocalRepositoryBundle } from "@/infrastructure/repositories/repository-composition";
import type { CloudMigrationGateway } from "@/infrastructure/supabase/cloud-migration-remote-gateway";
import { LocalUserProfileRepository } from "@/repositories/local-user-profile-repository";
import { LocalBrewRepository } from "@/repositories/local-brew-repository";
import { LocalSuggestedPlanRepository } from "@/repositories/local-suggested-plan-repository";
import { MockRecipeRepository } from "@/repositories/mock-recipe-repository";
import { MigrationRemotePreflightService } from "./migration-remote-preflight-service";
import { DemoSeedService } from "@/dev/demo-seed-service";
import {LocalBeanRepository,BEANS_KEY} from "@/repositories/local-bean-repository";
import {LocalBrewPreparationRepository} from "@/repositories/local-brew-preparation-repository";

class MemoryStorage { values = new Map<string,string>(); getItem(key:string){return this.values.get(key)??null} setItem(key:string,value:string){this.values.set(key,value)} }
function localBundle():LocalRepositoryBundle { const storage=new MemoryStorage(); return { beanRepository:new LocalBeanRepository(storage),preparationRepository:new LocalBrewPreparationRepository(storage),userProfileRepository:new LocalUserProfileRepository(storage),brewRepository:new LocalBrewRepository(storage),suggestedPlanRepository:new LocalSuggestedPlanRepository(storage),recipeRepository:new MockRecipeRepository() }; }
const missingGateway = (): CloudMigrationGateway => ({ parityRepository:{listBeansForMigration:vi.fn(async()=>({ok:true as const,value:[]})),writeBean:vi.fn(),listPreparationsForMigration:vi.fn(async()=>({ok:true as const,value:[]})),writePreparation:vi.fn(),readLibraryState:vi.fn(async()=>({ok:true as const,value:null})),writeLibraryState:vi.fn()},readProfile:vi.fn(async()=>({ok:true as const,value:{state:"missing" as const}})),createProfile:vi.fn(),updateProfile:vi.fn(),readBrew:vi.fn(async()=>({ok:true as const,value:{state:"missing" as const}})),createBrew:vi.fn(),patchBrew:vi.fn(),readPlan:vi.fn(async()=>({ok:true as const,value:{state:"missing" as const}})),createPlan:vi.fn(),patchPlan:vi.fn(),listBrews:vi.fn(),listPlans:vi.fn() });
describe("MigrationRemotePreflightService",()=>{
  it("allows a valid Bean catalog after parity coverage",async()=>{
    const local=localBundle();local.beanRepository?.save({name:"Coffee"},"bean");
    new DemoSeedService(local.userProfileRepository,local.brewRepository,local.suggestedPlanRepository,"test").seed("migration_smoke",{overwriteProfile:true});
    const result=await new MigrationRemotePreflightService(local,missingGateway()).collect();expect(result).toMatchObject({ok:true,value:{beans:{missing:1},preparations:{missing:0},canStart:true}});
  });
  it("stops before remote access for a corrupt Bean catalog",async()=>{
    const local=localBundle(),storage=new MemoryStorage();local.beanRepository=new LocalBeanRepository(storage);
    storage.setItem(BEANS_KEY,"broken");
    new DemoSeedService(local.userProfileRepository,local.brewRepository,local.suggestedPlanRepository,"test").seed("migration_smoke",{overwriteProfile:true});
    const gateway=missingGateway();expect(await new MigrationRemotePreflightService(local,gateway).collect()).toMatchObject({ok:false,code:"local_data_invalid"});
    expect(gateway.readProfile).not.toHaveBeenCalled();expect(gateway.createBrew).not.toHaveBeenCalled();
  });
  it("summarizes missing remote entities without writes",async()=>{const local=localBundle(),seed=new DemoSeedService(local.userProfileRepository,local.brewRepository,local.suggestedPlanRepository,"test");seed.seed("migration_smoke",{overwriteProfile:true});const gateway=missingGateway(),result=await new MigrationRemotePreflightService(local,gateway).collect();expect(result).toMatchObject({ok:true,value:{profile:"missing",brews:{missing:2},suggestedPlans:{missing:1},canStart:true}});expect(gateway.createProfile).not.toHaveBeenCalled();expect(gateway.createBrew).not.toHaveBeenCalled();expect(gateway.createPlan).not.toHaveBeenCalled()});
  it("maps remote failure to a safe retryable result",async()=>{const local=localBundle(),seed=new DemoSeedService(local.userProfileRepository,local.brewRepository,local.suggestedPlanRepository,"test");seed.seed("migration_smoke",{overwriteProfile:true});const gateway=missingGateway();gateway.readProfile=vi.fn(async()=>({ok:false as const,code:"persistence_failed" as const,message:"private details"}));expect(await new MigrationRemotePreflightService(local,gateway).collect()).toEqual({ok:false,code:"network_error",message:"Remote preflight is unavailable. Local Mode remains active."})});
});
