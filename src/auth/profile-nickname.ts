import { z } from "zod";
import type { Json } from "@/types/database.types";

// Count characters the way Postgres length() does (code points), not UTF-16 units, so emoji match the DB check.
const characters = (value: string) => Array.from(value).length;
export const nicknameSchema = z.string().trim().refine(value => characters(value) >= 2, "暱稱至少 2 個字").refine(value => characters(value) <= 40, "暱稱最多 40 個字");
export function profilePreferences(value: Json): Record<string, Json | undefined> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}
export function needsNickname(displayName: string | null, email: string | undefined, preferences: Json): boolean {
  if (!displayName || !nicknameSchema.safeParse(displayName).success) return true;
  if (profilePreferences(preferences).displayNameConfirmed === true) return false;
  const legacy = email?.split("@")[0]?.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 60) || "Coffee Brewer";
  return displayName === legacy;
}
