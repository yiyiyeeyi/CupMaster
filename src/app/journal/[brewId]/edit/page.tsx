import { EditBrewDetailsForm } from "@/components/edit-brew-details-form";
export default async function EditBrewDetailsPage({params}:{params:Promise<{brewId:string}>}){return <EditBrewDetailsForm brewId={(await params).brewId}/>;}
