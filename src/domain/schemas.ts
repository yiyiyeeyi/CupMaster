import { z } from "zod";

export const experienceLevelSchema = z.enum(["beginner", "developing", "intermediate", "advanced"]);
export const userNeedSchema = z.enum(["gear_guidance", "learn_basics", "improve_consistency", "find_recipe_for_bean", "track_and_compare", "improve_flavor"]);
export const userProfileSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().trim().min(2).max(40),
  experienceLevel: experienceLevelSchema,
  currentNeeds: z.array(userNeedSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const recipeStepSchema = z.object({
  id: z.string().min(1), order: z.number().int().positive(), title: z.string().min(1),
  targetWaterGrams: z.number().positive(), durationSeconds: z.number().positive().optional(),
  pattern: z.enum(["center", "spiral", "pulse", "continuous", "immersion"]).optional(), instruction: z.string().min(1),
});

export const recipeSchema = z.object({
  id: z.string().min(1), type: z.enum(["official", "personal", "forked", "suggested_plan"]),
  currentVersion: z.object({
    id: z.string().min(1), recipeId: z.string().min(1), version: z.number().int().positive(), title: z.string().min(1),
    description: z.string().min(1), method: z.enum(["pour_over", "immersion", "hybrid"]), author: z.string().min(1),
    doseGrams: z.number().positive(), totalWaterGrams: z.number().positive(), temperatureCelsius: z.number().min(0).max(100),
    grindDescription: z.string().min(1), dripper: z.string().min(1), expectedTimeSeconds: z.number().positive(),
    difficulty: z.enum(["beginner", "easy", "intermediate", "advanced"]),
    roastSuitability: z.array(z.enum(["light", "medium_light", "medium", "medium_dark", "dark"])).min(1),
    steps: z.array(recipeStepSchema).min(1), createdAt: z.string().datetime(),
  }),
  parentRecipeId: z.string().optional(), publishedAt: z.string().datetime().optional(),
});

const optionalTrimmed = (max: number) => z.string().trim().max(max).transform((value) => value || undefined).optional();
export const quickPrepareSchema = z.object({
  recipeVersionId: z.string().min(1),
  coffeeDose: z.number().finite().positive().max(100),
  waterTotal: z.number().finite().positive().max(2000),
  waterTemperature: z.number().finite().min(60).max(100),
  dripper: z.string().trim().min(1, "Dripper is required.").max(80),
  grindSetting: optionalTrimmed(100),
  beanName: optionalTrimmed(100),
  equipmentNotes: optionalTrimmed(300),
  userGoal: optionalTrimmed(120),
}).superRefine((value, context) => {
  if (value.waterTotal <= value.coffeeDose) context.addIssue({ code: "custom", path: ["waterTotal"], message: "Water total must be greater than coffee dose." });
});

export const flavorOverallImpressionSchema = z.enum(["liked", "neutral", "disliked"]);
export const flavorRatingSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);
export const flavorNoteSchema = z.enum(["floral", "citrus", "berry", "stone_fruit", "tropical", "nutty", "chocolate", "caramel", "tea_like", "spicy", "fermented", "clean", "juicy", "dry", "bitter", "sour"]);
export const flavorFeedbackInputSchema = z.object({
  overallImpression: flavorOverallImpressionSchema,
  acidity: flavorRatingSchema.optional(), sweetness: flavorRatingSchema.optional(), bitterness: flavorRatingSchema.optional(),
  body: flavorRatingSchema.optional(), clarity: flavorRatingSchema.optional(), aftertaste: flavorRatingSchema.optional(), balance: flavorRatingSchema.optional(),
  flavorNotes: z.array(flavorNoteSchema).refine((notes) => new Set(notes).size === notes.length, "Flavor notes cannot be repeated."),
  freeformNotes: z.string().trim().max(500).transform((value) => value || undefined).optional(),
});
export const flavorFeedbackSchema = flavorFeedbackInputSchema.extend({ id: z.string().min(1), brewId: z.string().min(1), createdAt: z.string().datetime(), updatedAt: z.string().datetime() });
const nullableText = (max:number) => z.string().trim().max(max).transform((value)=>value||undefined).nullish();
const beanDetailsSchema = z.object({ name:nullableText(100),roaster:nullableText(100),origin:nullableText(120),variety:nullableText(120),process:nullableText(100),roastLevel:nullableText(50),roastDate:nullableText(10) }).transform((value)=>Object.fromEntries(Object.entries(value).filter(([,item])=>item!==undefined)));
const equipmentDetailsSchema = z.object({ dripper:nullableText(80),grinder:nullableText(100),grinderSetting:nullableText(80),kettle:nullableText(100),filter:nullableText(100) }).transform((value)=>Object.fromEntries(Object.entries(value).filter(([,item])=>item!==undefined)));
export const brewRecordDetailsInputSchema = z.object({ bean:beanDetailsSchema.nullish(),equipment:equipmentDetailsSchema.nullish(),actualDoseGrams:z.number().finite().positive().max(100).nullish(),actualWaterGrams:z.number().finite().positive().max(2000).nullish(),actualTemperatureCelsius:z.number().finite().min(20).max(110).nullish(),notes:nullableText(1000) }).superRefine((value,context)=>{ const date=value.bean?.roastDate; if(!date)return; if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(`${date}T00:00:00Z`))) context.addIssue({code:"custom",path:["bean","roastDate"],message:"Use a valid roast date."}); else { const today=new Date(); today.setHours(23,59,59,999); if(Date.parse(`${date}T00:00:00`)>today.getTime()) context.addIssue({code:"custom",path:["bean","roastDate"],message:"Roast date cannot be in the future."}); } });
export const brewRecordDetailsSchema = z.object({ bean:beanDetailsSchema.nullable(),equipment:equipmentDetailsSchema.nullable(),actualDoseGrams:z.number().finite().positive().max(100).nullable(),actualWaterGrams:z.number().finite().positive().max(2000).nullable(),actualTemperatureCelsius:z.number().finite().min(20).max(110).nullable(),notes:z.string().max(1000).nullable(),createdAt:z.string().datetime(),updatedAt:z.string().datetime() });
