import "server-only";
import type { AppUser } from "@/auth/auth-types";
import { needsNickname, nicknameSchema, profilePreferences } from "@/auth/profile-nickname";
import type { Tables } from "@/types/database.types";
import type { OwnerStore } from "./owner-store";
import { remoteFailure } from "./repository-errors";
import type { RemoteResult } from "./remote-repository-contracts";

export async function handleNickname(store: OwnerStore, user: AppUser, action: string, args: unknown[]): Promise<RemoteResult<unknown>> {
  if (!["ensure", "read", "confirm"].includes(action)) return remoteFailure("not_found", "Cloud operation was not found.");
  const profiles = () => store.from("profiles");
  const existing = await profiles().select("*").maybeSingle();
  const failed = () => remoteFailure("persistence_failed", "Cloud profile could not be prepared.");
  if (existing.error) return failed();
  const row = existing.data;
  if (action === "ensure") return { ok: true, value: row };
  const required = (profile: Tables<"profiles">) => needsNickname(profile.display_name, user.email, profile.preferences);
  const metadataName = nicknameSchema.safeParse(user.name);
  if (action === "read") {
    return { ok: true, value: { name: row?.display_name ?? (metadataName.success ? metadataName.data : ""), required: !row || required(row) } };
  }
  const parsed = nicknameSchema.safeParse(args[0]);
  if (!parsed.success) return remoteFailure("invalid_data", parsed.error.issues[0].message);
  if (row && !required(row)) return { ok: true, value: row };

  const preferences = { ...profilePreferences(row?.preferences ?? {}), displayNameConfirmed: true };
  if (row) {
    const updated = await profiles().update({ display_name: parsed.data, preferences, revision: row.revision + 1 }).eq("revision", row.revision).maybeSingle();
    return updated.data ? { ok: true, value: updated.data } : failed();
  }
  const inserted = await profiles().insert({
    display_name: parsed.data,
    experience_level: "beginner",
    preferences: { ...preferences, experienceLevelSource: "unset" },
    selected_needs: [],
    onboarding_completed: false,
  }).single();
  if (inserted.data) return { ok: true, value: inserted.data };
  const reread = await profiles().select("*").maybeSingle();
  return reread.data && !required(reread.data) ? { ok: true, value: reread.data } : failed();
}
