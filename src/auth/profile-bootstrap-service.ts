"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database.types";
import { authError } from "./auth-errors";
import type { AuthResult } from "./auth-types";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export class ProfileBootstrapService {
  constructor(private readonly client: SupabaseClient<Database> = getSupabaseBrowserClient()) {}
  async ensureCurrentUserProfile(): Promise<AuthResult<ProfileRow>> {
    const { data: authData, error: authFailure } = await this.client.auth.getUser();
    if (authFailure || !authData.user) return { ok: false, error: authError("profile_bootstrap_failed") };
    const user = authData.user;
    const existing = await this.client.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (existing.error) return { ok: false, error: authError("profile_bootstrap_failed") };
    if (existing.data) return { ok: true, value: existing.data };
    const localPart = user.email?.split("@")[0]?.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 60) || "Coffee Brewer";
    const inserted = await this.client.from("profiles").insert({ id: user.id, display_name: localPart, experience_level: "beginner", selected_needs: [], onboarding_completed: false }).select("*").single();
    return inserted.error ? { ok: false, error: authError("profile_bootstrap_failed") } : { ok: true, value: inserted.data };
  }
}
