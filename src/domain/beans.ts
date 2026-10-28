import {z} from "zod";
import type {Brew} from "./types";
const text=(max=100)=>z.string().trim().max(max).transform(value=>value||undefined).optional();
export const beanFields={
  name:text(),roaster:text(),origin:text(),process:text(),roastLevel:text(50),farm:text(),variety:text(),
  roastDate:z.preprocess(value=>value===""?undefined:value,z.iso.date().optional()),cropYear:text(40),altitude:text(80),
  agtron:z.number().finite().min(0).max(150).optional(),blend:text(500),flavors:z.array(z.string().trim().min(1).max(80)).max(30).optional(),
};
export const beanInputSchema=z.object(beanFields);
export const beanRecordSchema=beanInputSchema.extend({id:z.string().min(1),createdAt:z.string().datetime(),updatedAt:z.string().datetime(),deletedAt:z.string().datetime().optional(),unlinkPending:z.boolean().optional(),legacyKeys:z.array(z.string()).optional()});
export type BeanInput=z.input<typeof beanInputSchema>;
export type BeanRecord=z.infer<typeof beanRecordSchema>;
export type BeanSnapshot=Pick<BeanRecord,"roaster"|"origin"|"process"|"roastLevel"|"farm"|"variety"|"roastDate"|"cropYear"|"altitude"|"agtron"|"blend"|"flavors"> & {id:string;name:string};
export function beanDisplayName(bean:Pick<BeanRecord,"name"|"origin"|"process">){return bean.name || [bean.origin,bean.process].filter(Boolean).join(" ") || "這包豆子";}
export function beanIdentity(name?:string,roaster?:string){return name?.trim()?JSON.stringify([name.normalize("NFKC").trim().toLocaleLowerCase(),roaster?.normalize("NFKC").trim().toLocaleLowerCase()??""]):null;}
export function beanSnapshot(bean:BeanRecord):BeanSnapshot{
  const {id,roaster,origin,process,roastLevel,farm,variety,roastDate,cropYear,altitude,agtron,blend,flavors}=bean;
  return {id,name:beanDisplayName(bean),roaster,origin,process,roastLevel,farm,variety,roastDate,cropYear,altitude,agtron,blend,flavors:flavors?[...flavors]:undefined};
}
export interface LegacyBeanCandidate {key:string;input:BeanInput;count:number;}
export function legacyBeanCandidates(brews:readonly Brew[],known:readonly BeanRecord[]):LegacyBeanCandidate[]{
  const knownKeys=new Set(known.flatMap(bean=>[beanIdentity(beanDisplayName(bean),bean.roaster),...(bean.legacyKeys??[])].filter((key):key is string=>key!==null)));
  const result=new Map<string,LegacyBeanCandidate>();
  for(const brew of brews){
    if(brew.beanId)continue;
    const details=brew.recordDetails?.bean,snapshot=brew.recipeSnapshot.bean;
    const name=details?.name??snapshot?.name,roaster=details?.roaster??snapshot?.roaster,key=beanIdentity(name,roaster);
    if(!key || knownKeys.has(key))continue;
    const existing=result.get(key);
    if(existing)existing.count++;else result.set(key,{key,input:{name,roaster,origin:details?.origin??snapshot?.origin,process:details?.process??snapshot?.process,roastLevel:details?.roastLevel??snapshot?.roastLevel,variety:details?.variety??snapshot?.variety,roastDate:details?.roastDate??snapshot?.roastDate},count:1});
  }
  return [...result.values()];
}
export function beanBrews(bean:BeanRecord,allBeans:readonly BeanRecord[],brews:readonly Brew[]){
  const keys=new Set([beanIdentity(beanDisplayName(bean),bean.roaster),...(bean.legacyKeys??[])]);
  return brews.filter(brew=>{
    if(brew.executionStatus!=="completed")return false;
    if(brew.beanId)return brew.beanId===bean.id;
    const key=beanIdentity(brew.recordDetails?.bean?.name??brew.recipeSnapshot.bean?.name,brew.recordDetails?.bean?.roaster??brew.recipeSnapshot.bean?.roaster);
    if(!key || !keys.has(key))return false;
    return allBeans.filter(other=>!other.deletedAt && (beanIdentity(beanDisplayName(other),other.roaster)===key || other.legacyKeys?.includes(key))).length===1;
  }).sort((a,b)=>(b.completedAt??b.createdAt).localeCompare(a.completedAt??a.createdAt));
}
