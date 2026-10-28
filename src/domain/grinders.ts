import { z } from "zod";
import type { BrewRecipeSnapshot } from "./types";
export interface GrinderPart { label:string; min:number; max?:number; }
export interface GrinderDefinition { id:string; name:string; format:"single"|"compound"|"number"; unit:string; parts:GrinderPart[]; source:string; }
// Published formats/ranges may only be widened; tightening or changing formats requires a data migration.
export const grinders:readonly GrinderDefinition[]=[
  {id:"timemore-c3",name:"Timemore C3",format:"single",unit:"格",parts:[{label:"格",min:0}],source:"https://www.timemore.com/pages/download-center"},
  {id:"comandante-c40",name:"Comandante C40",format:"single",unit:"clicks",parts:[{label:"clicks",min:0}],source:"https://www.comandantegrinder.com/downloads/C40-Manual-E-Q3-21-web.pdf"},
  {id:"baratza-encore-esp",name:"Baratza Encore ESP",format:"single",unit:"Setting",parts:[{label:"Setting",min:1,max:40}],source:"https://assets.breville.com/ZCG495/manual-encoreesp-v1-0-en-010923.pdf"},
  {id:"breville-smart-grinder-pro",name:"Breville Smart Grinder Pro",format:"single",unit:"Grind Size",parts:[{label:"Grind Size",min:1,max:60}],source:"https://assets.breville.com/BCG820/BCG820_BSS_USCM_IB_I23_FA_Online.pdf"},
  {id:"1zpresso-k-ultra",name:"1Zpresso K-Ultra",format:"compound",unit:"",parts:[{label:"圈",min:0},{label:"數字",min:0,max:9},{label:"小格",min:0,max:9}],source:"https://1zpresso.coffee/grind-setting/"},
  {id:"fellow-ode-gen-2",name:"Fellow Ode Gen 2",format:"compound",unit:"",parts:[{label:"主刻度",min:1,max:11},{label:"小格",min:0,max:2}],source:"https://fellowproducts.com/pages/compare-grinders"},
  {id:"eureka-mignon-specialita",name:"Eureka Mignon Specialità",format:"number",unit:"",parts:[],source:"https://eureka.co.it/it/products/eureka%2B1920/prosumer%2Bgrinders/silent%2Brange/20/"},
];
export function grinderDefinition(value:string,name?:string):GrinderDefinition{
  return grinders.find(g=>g.id===value || g.name.toLocaleLowerCase()===value.trim().toLocaleLowerCase()) ??
    {id:value.startsWith("custom:")?value:`custom:${encodeURIComponent(value)}`,name:name??value,format:"number",unit:"",parts:[],source:""};
}
/** Persistence validates the stored shape, independently of the current model registry. */
export const storedGrindSettingSchema=z.discriminatedUnion("format",[
  z.object({grinderId:z.string().min(1),format:z.literal("single"),value:z.number().finite().int().nonnegative()}),
  z.object({grinderId:z.string().min(1),format:z.literal("compound"),parts:z.array(z.number().finite().int().nonnegative()).min(2).max(3)}),
  z.object({grinderId:z.string().min(1),format:z.literal("number"),value:z.number().finite().nonnegative()}),
]);
/** Current input rules only; never use this schema to read historical records. */
export const grindSettingSchema=storedGrindSettingSchema.superRefine((setting,context)=>{
  const definition=grinderDefinition(setting.grinderId);
  if(definition.format!==setting.format){context.addIssue({code:"custom",message:"刻度格式與磨豆機不同。"});return;}
  const values=setting.format==="compound"?setting.parts:setting.format==="single"?[setting.value]:[];
  if(values.length!==definition.parts.length || values.some((value,index)=>value<definition.parts[index].min || (definition.parts[index].max!==undefined && value>definition.parts[index].max!)))
    context.addIssue({code:"custom",message:"刻度超出範圍。"});
  if(setting.grinderId==="fellow-ode-gen-2" && setting.format==="compound" && setting.parts[0]===11 && setting.parts[1]!==0)
    context.addIssue({code:"custom",message:"11 是 Ode 的最後一個刻度。"});
});
export type GrindSetting=z.infer<typeof storedGrindSettingSchema>;
export function switchGrinderSetting(current:GrindSetting|undefined,grinderId:string):GrindSetting|undefined{
  if(!current)return undefined;
  const parsed=grindSettingSchema.safeParse({...current,grinderId});
  return parsed.success?parsed.data:undefined;
}
export function formatGrindSetting(setting:GrindSetting,withUnit=true){
  const definition=grinderDefinition(setting.grinderId);
  const value=setting.format==="compound"?setting.parts.join("."):String(setting.value);
  return withUnit && definition.format===setting.format && definition.unit?`${value} ${definition.unit}`:value;
}
export function compareGrindSettings(a:GrindSetting,b:GrindSetting):number|null{
  if(a.grinderId!==b.grinderId || a.format!==b.format)return null;
  const av=a.format==="compound"?a.parts:[a.value],bv=b.format==="compound"?b.parts:[b.value];
  for(let i=0;i<av.length;i++){if(av[i]!==bv[i])return Math.sign(av[i]-bv[i]);}
  return 0;
}
/** Old strings stay untouched; only explicit structured settings drive derived projections. */
export function deriveGrind(snapshot:BrewRecipeSnapshot):BrewRecipeSnapshot{
  if(!snapshot.grind)return snapshot;
  const parsed=storedGrindSettingSchema.safeParse(snapshot.grind);
  if(!parsed.success)return snapshot;
  const setting=parsed.data,definition=grinderDefinition(setting.grinderId,snapshot.equipment?.grinder);
  const value=formatGrindSetting(setting);
  return {...snapshot,equipment:{...snapshot.equipment,dripper:snapshot.dripper.value,grinderId:setting.grinderId,grinder:definition.name,grinderSetting:formatGrindSetting(setting,false)},
    grindDescription:{value,recipeDefault:snapshot.grindDescription?.recipeDefault??"",source:"user_override"}};
}
