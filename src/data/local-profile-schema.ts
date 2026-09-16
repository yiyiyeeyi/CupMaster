import { z } from "zod";
import { experienceLevelSchema, userNeedSchema, userProfileSchema } from "@/domain";

export const LOCAL_PROFILE_VERSION = 1 as const;
export const localProfileEnvelopeSchema = z.object({
  version: z.literal(LOCAL_PROFILE_VERSION),
  data: z.object({
    displayName: z.string().trim().min(2).max(40), experienceLevel: experienceLevelSchema,
    selectedNeeds: z.array(userNeedSchema), onboardingCompleted: z.boolean(), profile: userProfileSchema,
  }),
});
export type LocalProfileEnvelope = z.infer<typeof localProfileEnvelopeSchema>;
