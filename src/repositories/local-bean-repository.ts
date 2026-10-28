import {z} from "zod";
import {beanRecordSchema,beanInputSchema,beanIdentity,beanDisplayName,type BeanInput,type BeanRecord,type LegacyBeanCandidate} from "@/domain/beans";
export const BEANS_KEY="cupmaster:beans";
const envelope=z.object({version:z.literal(1),beans:z.array(beanRecordSchema).refine(values=>new Set(values.map(bean=>bean.id)).size===values.length),legacyImportReviewed:z.boolean().default(false)});
export type BeanState=z.infer<typeof envelope>;
type Port=Pick<Storage,"getItem"|"setItem">;
export type BeanResult<T>={ok:true;value:T}|{ok:false;message:string};
export class LocalBeanRepository{
  constructor(private readonly storage?:Port,private readonly now=()=>new Date().toISOString()){}
  private port(){const value=this.storage??(typeof window!=="undefined"?window.localStorage:null);if(!value)throw Error("storage");return value;}
  read():BeanResult<BeanState>{try{const raw=this.port().getItem(BEANS_KEY);return{ok:true,value:raw?envelope.parse(JSON.parse(raw)):{version:1,beans:[],legacyImportReviewed:false}};}catch{return{ok:false,message:"無法讀取豆子庫，原資料已保留。"};}}
  private write(state:BeanState):BeanResult<BeanState>{try{const valid=envelope.parse(state),raw=JSON.stringify(valid);this.port().setItem(BEANS_KEY,raw);if(this.port().getItem(BEANS_KEY)!==raw)throw Error("readback");return{ok:true,value:valid};}catch{return{ok:false,message:"豆子未成功儲存，輸入已保留，請重試。"};}}
  save(input:BeanInput,id:string):BeanResult<BeanRecord>{
    const read=this.read();if(!read.ok)return read;
    const parsed=beanInputSchema.safeParse(input);if(!parsed.success)return{ok:false,message:parsed.error.issues[0].message};
    const old=read.value.beans.find(bean=>bean.id===id);if(old?.deletedAt)return{ok:false,message:"這包豆子已刪除。"};
    const at=this.now(),oldKey=old?beanIdentity(beanDisplayName(old),old.roaster):null;
    const bean:BeanRecord={...parsed.data,id,createdAt:old?.createdAt??at,updatedAt:at,legacyKeys:[...new Set([...(old?.legacyKeys??[]),...(oldKey?[oldKey]:[])])]};
    const result=this.write({...read.value,beans:[...read.value.beans.filter(bean=>bean.id!==id),bean]});
    return result.ok?{ok:true,value:bean}:result;
  }
  markDeleted(id:string):BeanResult<BeanRecord>{
    const read=this.read();if(!read.ok)return read;const current=read.value.beans.find(bean=>bean.id===id);if(!current)return{ok:false,message:"找不到這包豆子。"};
    const bean={...current,deletedAt:current.deletedAt??this.now(),unlinkPending:true,updatedAt:this.now()};
    const result=this.write({...read.value,beans:read.value.beans.map(item=>item.id===id?bean:item)});return result.ok?{ok:true,value:bean}:result;
  }
  finishUnlink(id:string){const read=this.read();if(!read.ok)return read;return this.write({...read.value,beans:read.value.beans.map(bean=>bean.id===id?{...bean,unlinkPending:false}:bean)});}
  confirmLegacyImport(candidates:LegacyBeanCandidate[],selected:string[]):BeanResult<BeanState>{
    const read=this.read();if(!read.ok)return read;
    const keys=new Set(read.value.beans.flatMap(bean=>[beanIdentity(beanDisplayName(bean),bean.roaster),...(bean.legacyKeys??[])]));
    const additions:BeanRecord[]=[];
    for(const candidate of candidates){if(!selected.includes(candidate.key)||keys.has(candidate.key))continue;const parsed=beanInputSchema.safeParse(candidate.input);if(!parsed.success)return{ok:false,message:"舊豆子資料無法安全轉換，原件已保留。"};keys.add(candidate.key);additions.push({...parsed.data,id:crypto.randomUUID(),createdAt:this.now(),updatedAt:this.now(),legacyKeys:[candidate.key]});}
    return this.write({...read.value,beans:[...read.value.beans,...additions],legacyImportReviewed:true});
  }
}
