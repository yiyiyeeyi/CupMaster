"use client";

import type { Tables } from "@/types/database.types";
import { cloudCall } from "@/infrastructure/cloud/http-repositories";
import { authError } from "./auth-errors";
import type { AuthRepository } from "./auth-repository";
import type { AuthResult } from "./auth-types";
import { BetterAuthRepository } from "./better-auth-repository";
import { nicknameSchema } from "./profile-nickname";

type ProfileRow = Tables<"profiles">;

export class ProfileBootstrapService {
  constructor(private readonly auth: Pick<AuthRepository, "getUser"> = new BetterAuthRepository()) {}

  async ensureCurrentUserProfile(): Promise<AuthResult<ProfileRow | null>> {
    const current = await this.auth.getUser();
    if (!current.ok || !current.value) return { ok: false, error: authError("profile_bootstrap_failed") };
    return this.request(current.value.id, "ensure", []);
  }

  readNickname(userId: string) {
    return this.request<{ name: string; required: boolean }>(userId, "read", []);
  }

  async confirmNickname(userId: string, name: string): Promise<AuthResult<ProfileRow>> {
    const parsed = nicknameSchema.safeParse(name);
    if (!parsed.success) return { ok: false, error: { code: "profile_bootstrap_failed", message: parsed.error.issues[0].message } };
    return this.request(userId, "confirm", [parsed.data]);
  }

  private async request<T>(userId: string, action: string, args: unknown[]): Promise<AuthResult<T>> {
    const result = await cloudCall(userId)<T>("nickname", action, args);
    return result.ok ? result : { ok: false, error: authError("profile_bootstrap_failed") };
  }
}
