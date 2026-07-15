import { z } from "zod";

const confidenceSchema = z.enum(["low", "medium", "high"]);
const evidenceSchema = z.object({ source: z.enum(["brew_parameter", "stage_result", "flavor_feedback", "user_note"]), reference: z.string().min(1), value: z.union([z.string(), z.number(), z.boolean()]) });
const hypothesisSchema = z.object({ statement: z.string().min(1), confidence: confidenceSchema, evidence: z.array(evidenceSchema).min(1) });
const changeSchema = z.object({ variable: z.enum(["dose", "water", "temperature", "grind", "pour", "time"]), from: z.union([z.string(), z.number()]).optional(), to: z.union([z.string(), z.number()]), reason: z.string().min(1) });

export const aiAnalysisSchema = z.object({
  observations: z.array(z.object({ statement: z.string().min(1), evidence: z.array(evidenceSchema) })),
  possibleImpacts: z.array(hypothesisSchema),
  whatWorked: z.array(z.object({ statement: z.string().min(1), evidence: z.array(evidenceSchema).min(1) })),
  nextPlan: z.object({ primaryChange: changeSchema.nullable(), rationale: z.string().min(1) }),
  confidence: confidenceSchema,
  evidence: z.array(evidenceSchema),
  keepUnchanged: z.array(z.string().min(1)),
  disclaimer: z.string().min(1),
  missingInformation: z.array(z.string().min(1)),
});

export type AIAnalysis = z.infer<typeof aiAnalysisSchema>;
