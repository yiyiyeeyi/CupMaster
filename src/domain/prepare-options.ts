import { z } from "zod";
export const prepareExtrasShape = {
  brewTemperatureMode: z.enum(["hot","iced"]).optional(),
  iceGrams: z.number().finite().positive().max(1000).optional(),
};
export const prepareExtrasSchema = z.object(prepareExtrasShape).superRefine((value,context)=>{
  if (value.brewTemperatureMode === "iced" && value.iceGrams === undefined) context.addIssue({code:"custom",path:["iceGrams"],message:"請填冰塊克數。"});
  if (value.brewTemperatureMode !== "iced" && value.iceGrams !== undefined) context.addIssue({code:"custom",path:["iceGrams"],message:"只有冰沖可記錄冰塊。"});
});
export const preparationGearSchema = z.object({
  grinderId:z.string().max(180).optional(), grinder:z.string().trim().max(100).optional(), grinderSetting:z.string().trim().max(80).optional(),
  accessories:z.array(z.string().trim().min(1).max(80)).max(20).optional(),
});
