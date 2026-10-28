import {BeanEditPage} from "@/components/bean-edit-page";
export default async function Page({params}:{params:Promise<{beanId:string}>}){return <BeanEditPage beanId={(await params).beanId}/>;}
