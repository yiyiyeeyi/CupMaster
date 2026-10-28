import {ZodError,z} from "zod";
import type {BeanRecord} from "@/domain/beans";
import type {SavedBrewPreparation} from "@/domain/brew-preparation";
import {beanRowSchema,preparationRowSchema,libraryStateRowSchema,libraryStatePayloadSchema,CloudMappingError} from "../cloud-row-schemas";
export type LibraryStatePayload=z.infer<typeof libraryStatePayloadSchema>;
export type PreparationRecord={id:string;entry:SavedBrewPreparation|null;deletedAt:string|null};
function parse<T>(schema:z.ZodType<T>,input:unknown):T{try{return schema.parse(input)}catch(error){if(error instanceof ZodError)throw new CloudMappingError("invalid_row",error.issues[0]?.message??"Stored row is invalid.");throw error}}
/** Whitelist only sync metadata. Raw backups/processedRaw/warnings never leave the browser. */
export function toLibraryStatePayload(input:unknown):LibraryStatePayload{return parse(libraryStatePayloadSchema,input);}
export function toBeanRow(userId:string,bean:BeanRecord,revision=1){return parse(beanRowSchema,{user_id:userId,id:bean.id,payload:bean,revision,created_at:bean.createdAt,updated_at:bean.updatedAt,deleted_at:bean.deletedAt??null});}
export function fromBeanRow(input:unknown){const row=parse(beanRowSchema,input);if((row.payload.deletedAt??null)!==row.deleted_at)throw new CloudMappingError("invalid_row","Bean tombstone mismatch.");return {entity:row.payload,revision:row.revision};}
export function toPreparationRow(userId:string,record:PreparationRecord,revision=1,at=new Date().toISOString()){
  return parse(preparationRowSchema,{user_id:userId,id:record.id,payload:record.entry,revision,created_at:record.entry?.createdAt??at,updated_at:record.entry?.updatedAt??at,deleted_at:record.deletedAt});
}
export function fromPreparationRow(input:unknown){const row=parse(preparationRowSchema,input);return {entity:{id:row.id,entry:row.payload,deletedAt:row.deleted_at},revision:row.revision};}
export function toLibraryStateRow(userId:string,input:unknown,revision=1,at=new Date().toISOString()){return parse(libraryStateRowSchema,{user_id:userId,payload:toLibraryStatePayload(input),revision,created_at:at,updated_at:at,deleted_at:null});}
export function fromLibraryStateRow(input:unknown){const row=parse(libraryStateRowSchema,input);if(row.deleted_at)throw new CloudMappingError("deleted_row","Library state is deleted.");return {entity:row.payload,revision:row.revision};}
