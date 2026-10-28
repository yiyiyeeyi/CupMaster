import {beanBrews,legacyBeanCandidates} from "@/domain/beans";
import {LocalBeanRepository} from "@/repositories/local-bean-repository";
import {LocalBrewRepository} from "@/repositories/local-brew-repository";
import {LocalBrewPreparationRepository} from "@/repositories/local-brew-preparation-repository";
import {BeanService} from "./bean-service";
export class CollectionService{
  constructor(private readonly beans=new LocalBeanRepository(),private readonly brews=new LocalBrewRepository(),private readonly preparations=new LocalBrewPreparationRepository()){}
  load(){
    const beans=this.beans.read();if(!beans.ok)return beans;
    const brews=this.brews.listAll();if(!brews.ok)return{ok:false as const,message:brews.message};
    const preparations=this.preparations.read();
    const active=beans.value.beans.filter(bean=>!bean.deletedAt);
    return{ok:true as const,value:{beans:active,allBeans:beans.value.beans,brews:brews.value,brewWarning:brews.notice,
      cards:active.map(bean=>({bean,count:brews.notice?undefined:beanBrews(bean,beans.value.beans,brews.value).length})),
      preparations:preparations.ok?preparations.value.entries:[],preparationError:preparations.ok?null:preparations.message,
      candidates:beans.value.legacyImportReviewed?[]:legacyBeanCandidates(brews.value,beans.value.beans),
      pending:beans.value.beans.filter(bean=>bean.unlinkPending),
    }};
  }
  confirmImport(selected:string[]){
    const state=this.load();if(!state.ok)return state;
    return this.beans.confirmLegacyImport(state.value.candidates,selected);
  }
  retryUnlink(id:string){return new BeanService(this.beans,this.brews,this.preparations).remove(id);}
}
