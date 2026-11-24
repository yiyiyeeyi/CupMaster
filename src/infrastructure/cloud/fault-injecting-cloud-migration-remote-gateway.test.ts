import { describe, expect, it } from "vitest";
import type { CloudMigrationGateway } from "./cloud-migration-remote-gateway";
import { FaultInjectingCloudMigrationRemoteGateway, migrationFaultPoints } from "./fault-injecting-cloud-migration-remote-gateway";
const gateway=():CloudMigrationGateway=>({readProfile:async()=>({ok:true,value:{state:"missing"}}),createProfile:async p=>({ok:true,value:p}),updateProfile:async p=>({ok:true,value:p}),readBrew:async()=>({ok:true,value:{state:"missing"}}),createBrew:async b=>({ok:true,value:b}),patchBrew:async b=>({ok:true,value:b}),readPlan:async()=>({ok:true,value:{state:"missing"}}),createPlan:async p=>({ok:true,value:p}),patchPlan:async p=>({ok:true,value:p}),listBrews:async()=>({ok:true,value:[]}),listPlans:async()=>({ok:true,value:[]})});
describe("FaultInjectingCloudMigrationRemoteGateway",()=>{
 it("has the fixed closed fault point set",()=>expect(migrationFaultPoints).toHaveLength(8));
 it("cannot enable a fault in production",()=>expect(()=>new FaultInjectingCloudMigrationRemoteGateway(gateway(),"before_verification","production")).toThrow(/disabled/));
 it("fails safely before verification without corrupting rows",async()=>expect(await new FaultInjectingCloudMigrationRemoteGateway(gateway(),"before_verification","test").listBrews()).toMatchObject({ok:false,code:"persistence_failed"}));
 it("defaults to pass-through when injection is off",async()=>expect(await new FaultInjectingCloudMigrationRemoteGateway(gateway(),null,"test").listBrews()).toEqual({ok:true,value:[]}));
});
