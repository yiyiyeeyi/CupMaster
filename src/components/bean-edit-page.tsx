"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {LocalBeanRepository} from "@/repositories/local-bean-repository";
import {BeanService} from "@/application/bean-service";
import type {BeanRecord} from "@/domain/beans";
import {BeanEditor} from "./bean-editor";
import {beanCopy as copy} from "./bean-copy";
import "./collection.css";
export function BeanEditPage({beanId}:{beanId?:string}){
  const router=useRouter(),[repository]=useState(()=>new LocalBeanRepository());
  const [state,setState]=useState<{ready:boolean;bean?:BeanRecord;error?:string}>(()=>({ready:!beanId}));
  const [confirmDelete,setConfirmDelete]=useState(false),[error,setError]=useState<string|null>(null);
  useEffect(()=>{if(!beanId)return;const timer=setTimeout(()=>{const read=repository.read();const bean=read.ok?read.value.beans.find(bean=>bean.id===beanId&&!bean.deletedAt):undefined;setState({ready:true,bean,...(!read.ok?{error:read.message}:!bean?{error:"找不到這包豆子。"}:{})});},0);return()=>clearTimeout(timer);},[beanId,repository]);
  return <main className="bean-edit-page"><Link href="/collection">← Collection</Link><h1>{beanId?copy.edit:"新增豆子"}</h1>
    {!state.ready?<p role="status">正在讀取豆子…</p>:state.error?<p role="alert">{state.error}</p>:<BeanEditor initial={state.bean} onCancel={()=>router.push("/collection")} onSaved={()=>router.push("/collection")}/>}
    {state.bean && <section className="bean-delete">{confirmDelete?<><p>{copy.deleteQuestion}</p><button type="button" className="secondary-button" onClick={()=>setConfirmDelete(false)}>{copy.cancel}</button><button type="button" className="secondary-button" onClick={()=>{const result=new BeanService().remove(state.bean!.id);if(result.ok)router.push("/collection");else setError(result.message);}}>{copy.delete}</button></>:<button className="text-button" type="button" onClick={()=>setConfirmDelete(true)}>{copy.delete}</button>}</section>}
    {error && <p role="alert">{error}</p>}
  </main>;
}
