import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { UserProfileRepository } from "@/repositories/user-profile-repository";
import type { BrewRepository } from "@/repositories/brew-repository";
import type { SuggestedPlanRepository } from "@/repositories/suggested-plan-repository";
import type { RecipeRepository } from "@/repositories/recipe-repository";
import { LocalUserProfileRepository } from "@/repositories/local-user-profile-repository";
import { LocalBrewRepository } from "@/repositories/local-brew-repository";
import { LocalSuggestedPlanRepository } from "@/repositories/local-suggested-plan-repository";
import { MockRecipeRepository } from "@/repositories/mock-recipe-repository";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { RemoteBrewRepository, RemoteSuggestedPlanRepository, RemoteUserProfileRepository } from "@/infrastructure/supabase/remote-repository-contracts";
import { SupabaseUserProfileRepository } from "@/infrastructure/supabase/supabase-user-profile-repository";
import { SupabaseBrewRepository } from "@/infrastructure/supabase/supabase-brew-repository";
import { SupabaseSuggestedPlanRepository } from "@/infrastructure/supabase/supabase-suggested-plan-repository";

export type RepositoryMode = "local" | "remote";
export type RuntimeRepositoryPolicy = { mode: "local"; reason: "local_mvp" | "cloud_migration_not_completed" };
export const RUNTIME_REPOSITORY_MODE = "local" as const;
export const RUNTIME_REPOSITORY_POLICY: RuntimeRepositoryPolicy = { mode: RUNTIME_REPOSITORY_MODE, reason: "cloud_migration_not_completed" };

export interface LocalRepositoryBundle { userProfileRepository: UserProfileRepository; brewRepository: BrewRepository; suggestedPlanRepository: SuggestedPlanRepository; recipeRepository: RecipeRepository; }
export interface RemoteRepositoryBundle { userProfileRepository: RemoteUserProfileRepository; brewRepository: RemoteBrewRepository; suggestedPlanRepository: RemoteSuggestedPlanRepository; }
export interface MigrationRepositoryBundle { local: LocalRepositoryBundle; remote: RemoteRepositoryBundle; authenticatedUserId: string; }
export type RemoteBundleResult = { ok: true; value: RemoteRepositoryBundle; authenticatedUserId: string } | { ok: false; code: "migration_unavailable" | "unauthenticated"; message: string };
export type MigrationBundleResult = { ok: true; value: MigrationRepositoryBundle } | { ok: false; code: "migration_unavailable" | "unauthenticated"; message: string };

export function createLocalRepositoryBundle(): LocalRepositoryBundle { return { userProfileRepository: new LocalUserProfileRepository(), brewRepository: new LocalBrewRepository(), suggestedPlanRepository: new LocalSuggestedPlanRepository(), recipeRepository: new MockRecipeRepository() }; }
export function getRuntimeRepositoryBundle(): LocalRepositoryBundle { return createLocalRepositoryBundle(); }

type ClientFactory = () => SupabaseClient<Database>;
export async function createAuthenticatedRemoteRepositoryBundle(getClient: ClientFactory = getSupabaseBrowserClient): Promise<RemoteBundleResult> {
  let client: SupabaseClient<Database>;
  try { client = getClient(); } catch { return { ok: false, code: "migration_unavailable", message: "Cloud repositories are unavailable. Local Mode remains active." }; }
  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return { ok: false, code: "unauthenticated", message: "Sign in is required before cloud migration can be prepared." };
    return { ok: true, authenticatedUserId: data.user.id, value: { userProfileRepository: new SupabaseUserProfileRepository(client), brewRepository: new SupabaseBrewRepository(client), suggestedPlanRepository: new SupabaseSuggestedPlanRepository(client) } };
  } catch { return { ok: false, code: "migration_unavailable", message: "Cloud repositories are unavailable. Local Mode remains active." }; }
}

export async function createMigrationRepositoryBundle(getClient: ClientFactory = getSupabaseBrowserClient): Promise<MigrationBundleResult> {
  const remote = await createAuthenticatedRemoteRepositoryBundle(getClient);
  if (!remote.ok) return remote;
  return { ok: true, value: { local: createLocalRepositoryBundle(), remote: remote.value, authenticatedUserId: remote.authenticatedUserId } };
}

export function getRepositoryDiagnostics(authMode: "local" | "authenticated", remoteAvailable: boolean) { return { authMode, runtimeRepositoryMode: RUNTIME_REPOSITORY_MODE, remoteRepositoryAvailability: remoteAvailable ? "available" as const : "unavailable" as const, migrationReadiness: authMode === "authenticated" && remoteAvailable ? "dependencies_ready" as const : "unavailable" as const, migrationStatus: "not_started" as const }; }
