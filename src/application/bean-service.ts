import {beanSnapshot,type BeanRecord} from "@/domain/beans";
import type {BrewPreparation} from "@/domain/brew-preparation";
import {synchronizePreparation} from "@/domain/brew-preparation";
import {LocalBeanRepository} from "@/repositories/local-bean-repository";
import {LocalBrewRepository} from "@/repositories/local-brew-repository";
import {LocalBrewPreparationRepository} from "@/repositories/local-brew-preparation-repository";
export function selectPreparationBean<T extends BrewPreparation>(seed:T,bean:BeanRecord):T{
  const next=structuredClone(seed);next.beanId=bean.id;next.snapshot.bean=beanSnapshot(bean);return{...next,...synchronizePreparation(next)};
}
export class BeanService{
  constructor(private readonly beans=new LocalBeanRepository(),private readonly brews=new LocalBrewRepository(),private readonly preparations=new LocalBrewPreparationRepository()){}
  remove(id:string){
    const deleted=this.beans.markDeleted(id);if(!deleted.ok)return deleted;
    const brews=this.brews.listAll();if(!brews.ok || brews.notice)return{ok:false as const,message:"豆子已刪除，沖煮連結尚未全部解除，請重試。"};
    for(const brew of brews.value.filter(brew=>brew.beanId===id)){const next=structuredClone(brew);delete next.beanId;const result=this.brews.updateDraft(next);if(!result.ok)return{ok:false as const,message:"豆子已刪除，部分沖煮連結尚未解除，請重試。"};}
    const read=this.preparations.read();if(!read.ok)return read;
    for(const preparation of read.value.entries.filter(entry=>entry.beanId===id)){const next=structuredClone(preparation);delete next.beanId;const result=this.preparations.save(next,next.id,next.updatedAt);if(!result.ok)return result;}
    return this.beans.finishUnlink(id);
  }
}
