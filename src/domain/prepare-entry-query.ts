import { z } from "zod";
export const prepareEntryQuerySchema = z.object({
  beanId:z.string().min(1).optional(),
  sourceBrewId: z.string().min(1).optional(), recommendationId: z.string().min(1).optional(), preparationId: z.string().min(1).optional(),
  entry: z.literal("quick").optional(), returnTo: z.string().optional(),
}).superRefine((value, context) => {
  if ((value.preparationId && value.sourceBrewId) || (value.recommendationId && !value.sourceBrewId) || (value.entry && (value.sourceBrewId || value.preparationId))) {
    context.addIssue({ code: "custom", message: "請使用單一準備入口。" });
  }
});
