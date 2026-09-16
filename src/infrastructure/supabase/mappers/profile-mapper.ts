import { z } from "zod";
import { userProfileSchema } from "@/domain/schemas";
import type { UserProfile } from "@/domain";
import type { Json, Tables, TablesInsert } from "@/types/database.types";
import { parseActiveRow, profileRowSchema } from "../cloud-row-schemas";

export interface MappedProfile {
  entity: UserProfile;
  onboardingCompleted: boolean;
  preferences: Json;
  revision: number;
}

export function toProfileInsert(profile: UserProfile, options: { onboardingCompleted?: boolean; preferences?: Json; revision?: number } = {}): TablesInsert<"profiles"> {
  const valid = userProfileSchema.parse(profile);
  return {
    id: valid.id, display_name: valid.displayName, experience_level: valid.experienceLevel,
    selected_needs: [...valid.currentNeeds], onboarding_completed: options.onboardingCompleted ?? true,
    preferences: z.json().parse(options.preferences ?? {}), revision: options.revision ?? 1,
    created_at: valid.createdAt, updated_at: valid.updatedAt, deleted_at: null,
  };
}

export function fromProfileRow(input: Tables<"profiles"> | unknown): MappedProfile {
  const row = parseActiveRow(profileRowSchema, input);
  return {
    entity: userProfileSchema.parse({
      id: row.id, displayName: row.display_name, experienceLevel: row.experience_level,
      currentNeeds: row.selected_needs, createdAt: row.created_at, updatedAt: row.updated_at,
    }),
    onboardingCompleted: row.onboarding_completed,
    preferences: row.preferences,
    revision: row.revision,
  };
}
