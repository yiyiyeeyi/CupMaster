"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database.types";
import { authError } from "./auth-errors";
import type { AuthResult } from "./auth-types";
import { needsNickname, nicknameSchema, profilePreferences } from "./profile-nickname";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export class ProfileBootstrapService {
  constructor(private readonly client: SupabaseClient<Database> = getSupabaseBrowserClient()) {}
  async ensureCurrentUserProfile(): Promise<AuthResult<ProfileRow | null>> {
    const { data: authData, error: authFailure } = await this.client.auth.getUser();
    if (authFailure || !authData.user) return { ok: false, error: authError("profile_bootstrap_failed") };
    const user = authData.user;
    const existing = await this.client.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (existing.error) return { ok: false, error: authError("profile_bootstrap_failed") };
    if (existing.data) return { ok: true, value: existing.data };
    // No profile means local mode until the owner explicitly confirms a nickname.
    return { ok: true, value: null };
  }
  async readNickname(userId: string) {
    const result = await this.ensureCurrentUserProfile();
    const current = await this.client.auth.getUser();
    if (!result.ok || current.error || current.data.user?.id !== userId) return { ok: false as const, error: authError("profile_bootstrap_failed") };
    const metadataName = nicknameSchema.safeParse(current.data.user.user_metadata.display_name);
    return { ok: true as const, value: { name: result.value?.display_name ?? (metadataName.success ? metadataName.data : ""), required: !result.value || needsNickname(result.value.display_name, current.data.user.email, result.value.preferences) } };
  }
  async confirmNickname(userId: string, name: string): Promise<AuthResult<ProfileRow>> {
    const parsed = nicknameSchema.safeParse(name);
    if (!parsed.success) return { ok: false, error: { code: "profile_bootstrap_failed", message: parsed.error.issues[0].message } };
    const existing = await this.ensureCurrentUserProfile();
    if (!existing.ok) return existing;
    const current = await this.client.auth.getUser();
    if (current.error || current.data.user?.id !== userId || (existing.value && existing.value.id !== userId)) return { ok: false, error: authError("profile_bootstrap_failed") };
    const row = existing.value;
    if (row && !needsNickname(row.display_name, current.data.user.email, row.preferences)) return { ok: true, value: row };
    const preferences = { ...profilePreferences(row?.preferences ?? {}), displayNameConfirmed: true, ...(!row && { experienceLevelSource: "unset" }) };
    if (row) {
      const updated = await this.client.from("profiles").update({ display_name: parsed.data, preferences, updated_at: new Date().toISOString(), revision: row.revision + 1 }).eq("id", userId).eq("revision", row.revision).select("*").maybeSingle();
      return updated.error || !updated.data ? { ok: false, error: authError("profile_bootstrap_failed") } : { ok: true, value: updated.data };
    }
    const inserted = await this.client.from("profiles").insert({ id: userId, display_name: parsed.data, experience_level: "beginner", preferences, selected_needs: [], onboarding_completed: false }).select("*").single();
    if (!inserted.error) return { ok: true, value: inserted.data };
    // A concurrent callback may have created the same profile. Never overwrite it.
    const reread = await this.client.from("profiles").select("*").eq("id", userId).maybeSingle();
    return !reread.error && reread.data && !needsNickname(reread.data.display_name, current.data.user.email, reread.data.preferences) ? { ok: true, value: reread.data } : { ok: false, error: authError("profile_bootstrap_failed") };
  }
}
