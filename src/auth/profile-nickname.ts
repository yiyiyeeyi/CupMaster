import { z } from "zod";
import type { Json } from "@/types/database.types";

export const nicknameSchema = z.string().trim().min(2, "暱稱至少 2 個字").max(40, "暱稱最多 40 個字");
export function profilePreferences(value: Json): Record<string, Json | undefined> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}
export function needsNickname(displayName: string | null, email: string | undefined, preferences: Json): boolean {
  if (!displayName || !nicknameSchema.safeParse(displayName).success) return true;
  if (profilePreferences(preferences).displayNameConfirmed === true) return false;
  const legacy = email?.split("@")[0]?.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 60) || "Coffee Brewer";
  return displayName === legacy;
}
