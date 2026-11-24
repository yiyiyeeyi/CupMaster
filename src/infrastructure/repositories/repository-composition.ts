import type { RemoteBrewRepository, RemoteParityRepository, RemoteSuggestedPlanRepository, RemoteUserProfileRepository } from "@/infrastructure/cloud/remote-repository-contracts";
import { BetterAuthRepository } from "@/auth/better-auth-repository";
import type { AuthRepository } from "@/auth/auth-repository";
import { cloudCall, HttpUserProfileRepository, HttpBrewRepository, HttpSuggestedPlanRepository, HttpParityRepository } from "@/infrastructure/cloud/http-repositories";
import { LocalBeanRepository } from "@/repositories/local-bean-repository";
import type { UserProfileRepository } from "@/repositories/user-profile-repository";
import type { BrewRepository } from "@/repositories/brew-repository";
import type { SuggestedPlanRepository } from "@/repositories/suggested-plan-repository";
import type { RecipeRepository } from "@/repositories/recipe-repository";
import { LocalUserProfileRepository } from "@/repositories/local-user-profile-repository";
import { LocalBrewRepository } from "@/repositories/local-brew-repository";
import { LocalSuggestedPlanRepository } from "@/repositories/local-suggested-plan-repository";
import { MockRecipeRepository } from "@/repositories/mock-recipe-repository";
import { LocalBrewPreparationRepository } from "@/repositories/local-brew-preparation-repository";

export type RepositoryMode = "local" | "remote";
export type RuntimeRepositoryPolicy = { mode: "local"; reason: "local_mvp" | "cloud_migration_not_completed" };
export const RUNTIME_REPOSITORY_MODE = "local" as const;
export const RUNTIME_REPOSITORY_POLICY: RuntimeRepositoryPolicy = { mode: RUNTIME_REPOSITORY_MODE, reason: "cloud_migration_not_completed" };

export interface LocalRepositoryBundle { beanRepository?:LocalBeanRepository; preparationRepository?:LocalBrewPreparationRepository; userProfileRepository: UserProfileRepository; brewRepository: BrewRepository; suggestedPlanRepository: SuggestedPlanRepository; recipeRepository: RecipeRepository; }
export interface RemoteRepositoryBundle { userProfileRepository: RemoteUserProfileRepository; brewRepository: RemoteBrewRepository; suggestedPlanRepository: RemoteSuggestedPlanRepository; parityRepository?: RemoteParityRepository; }
export interface MigrationRepositoryBundle { local: LocalRepositoryBundle; remote: RemoteRepositoryBundle; authenticatedUserId: string; }
export type RemoteBundleResult = { ok: true; value: RemoteRepositoryBundle; authenticatedUserId: string } | { ok: false; code: "migration_unavailable" | "unauthenticated"; message: string };
export type MigrationBundleResult = { ok: true; value: MigrationRepositoryBundle } | { ok: false; code: "migration_unavailable" | "unauthenticated"; message: string };

export function createLocalRepositoryBundle(): LocalRepositoryBundle { return { beanRepository:new LocalBeanRepository(), preparationRepository:new LocalBrewPreparationRepository(), userProfileRepository: new LocalUserProfileRepository(), brewRepository: new LocalBrewRepository(), suggestedPlanRepository: new LocalSuggestedPlanRepository(), recipeRepository: new MockRecipeRepository() }; }
export function getRuntimeRepositoryBundle(): LocalRepositoryBundle { return createLocalRepositoryBundle(); }

type ClientFactory = () => Pick<AuthRepository, "getUser">;
const getAuth = () => new BetterAuthRepository();
export async function createAuthenticatedRemoteRepositoryBundle(getClient: ClientFactory = getAuth): Promise<RemoteBundleResult> {
  let client: ReturnType<ClientFactory>;
  try { client = getClient(); } catch { return { ok: false, code: "migration_unavailable", message: "Cloud repositories are unavailable. Local Mode remains active." }; }
  try {
    const current = await client.getUser();
    if (!current.ok || !current.value) return { ok: false, code: "unauthenticated", message: "Sign in is required before cloud migration can be prepared." };
    const call = cloudCall(current.value.id);
    return { ok: true, authenticatedUserId: current.value.id, value: { userProfileRepository: new HttpUserProfileRepository(call), brewRepository: new HttpBrewRepository(call), suggestedPlanRepository: new HttpSuggestedPlanRepository(call), parityRepository: new HttpParityRepository(call) } };
  } catch { return { ok: false, code: "migration_unavailable", message: "Cloud repositories are unavailable. Local Mode remains active." }; }
}

export async function createMigrationRepositoryBundle(getClient: ClientFactory = getAuth): Promise<MigrationBundleResult> {
  const remote = await createAuthenticatedRemoteRepositoryBundle(getClient);
  if (!remote.ok) return remote;
  const profile = await remote.value.userProfileRepository.load();
  if (!profile.ok || !profile.value) return { ok: false, code: "migration_unavailable", message: "請先確認暱稱；紀錄仍保存在這個瀏覽器。" };
  return { ok: true, value: { local: createLocalRepositoryBundle(), remote: remote.value, authenticatedUserId: remote.authenticatedUserId } };
}

export function getRepositoryDiagnostics(authMode: "local" | "authenticated", remoteAvailable: boolean) { return { authMode, runtimeRepositoryMode: RUNTIME_REPOSITORY_MODE, remoteRepositoryAvailability: remoteAvailable ? "available" as const : "unavailable" as const, migrationReadiness: authMode === "authenticated" && remoteAvailable ? "dependencies_ready" as const : "unavailable" as const, migrationStatus: "not_started" as const }; }
