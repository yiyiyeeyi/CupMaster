import { z } from "zod";
import { experienceLevelSchema, userNeedSchema } from "./schemas";
import type { UserExperienceLevel, UserNeed } from "./types";
export const discoveryPreferencesSchema = z.object({ experienceLevel: experienceLevelSchema.nullable(), selectedNeeds: z.array(userNeedSchema), updatedAt: z.string().datetime() });
export type DiscoveryPreferences = z.infer<typeof discoveryPreferencesSchema>;
export function effectiveDiscoveryPreferences(current: DiscoveryPreferences | null, legacy: { profile: { experienceLevel: UserExperienceLevel }; selectedNeeds: UserNeed[]; onboardingCompleted?: boolean } | null) {
  return current ? { experienceLevel: current.experienceLevel, selectedNeeds: current.selectedNeeds } : {
    experienceLevel: legacy?.profile.experienceLevel ?? null, selectedNeeds: legacy?.selectedNeeds ?? [],
  };
}
