import {BeanDetailPage} from "@/components/bean-detail-page";
export default async function Page({params}:{params:Promise<{beanId:string}>}){return <BeanDetailPage beanId={(await params).beanId}/>;}
