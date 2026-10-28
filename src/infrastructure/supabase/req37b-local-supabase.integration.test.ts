import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { beanBrews, beanSnapshot } from "@/domain/beans";
import { bestStars } from "@/domain/brew-ratings";
import { MigrationRemotePreflightService } from "@/application/migration-remote-preflight-service";
import { LocalToCloudMigrationService } from "@/application/local-to-cloud-migration-service";
import { MigrationReviewService } from "@/application/migration-review-service";
import { createFullDemoFixtures } from "@/dev/demo-fixtures";
import { brewPersistenceSchema } from "@/data/local-brew-schema";
import type { Database } from "@/types/database.types";
import { CloudMigrationRemoteGateway } from "./cloud-migration-remote-gateway";
import { SupabaseBrewRepository } from "./supabase-brew-repository";
import { SupabaseParityRepository } from "./supabase-parity-repository";
import { SupabaseSuggestedPlanRepository } from "./supabase-suggested-plan-repository";
import { SupabaseUserProfileRepository } from "./supabase-user-profile-repository";
import { LocalBeanRepository } from "@/repositories/local-bean-repository";
import { LocalBrewPreparationRepository } from "@/repositories/local-brew-preparation-repository";
import { LocalBrewRepository } from "@/repositories/local-brew-repository";
import { LocalSuggestedPlanRepository } from "@/repositories/local-suggested-plan-repository";
import { LocalUserProfileRepository } from "@/repositories/local-user-profile-repository";
import { MockRecipeRepository } from "@/repositories/mock-recipe-repository";
import { CloudMigrationCheckpointRepository } from "@/repositories/cloud-migration-checkpoint-repository";
import type { LocalRepositoryBundle } from "@/infrastructure/repositories/repository-composition";

const localUrl = process.env.REQ37B_LOCAL_URL;
const anonKey = process.env.REQ37B_LOCAL_ANON_KEY;
const serviceKey = process.env.REQ37B_LOCAL_SERVICE_KEY;
const enabled = Boolean(localUrl && anonKey && serviceKey);

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe.skipIf(!enabled)("REQ-37b local Supabase migration integration", () => {
  const serviceClient = createClient<Database>(localUrl ?? "http://127.0.0.1:54321", serviceKey ?? "missing", { auth: { persistSession: false, autoRefreshToken: false } });
  let createdUserId: string | null = null;

  afterAll(async () => {
    if (createdUserId) await serviceClient.auth.admin.deleteUser(createdUserId);
  });

  it("migrates a new local user and reads the complete Journal, Collection and Bean Detail data back", async () => {
    const email = `req37b-${randomUUID()}@example.test`;
    const password = `Local-${randomUUID()}-Aa1!`;
    const created = await serviceClient.auth.admin.createUser({ email, password, email_confirm: true });
    expect(created.error).toBeNull();
    if (!created.data.user) throw new Error("Local Supabase Auth did not return the test user.");
    createdUserId = created.data.user.id;

    const userClient = createClient<Database>(localUrl!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const signedIn = await userClient.auth.signInWithPassword({ email, password });
    expect(signedIn.error).toBeNull();
    if (!signedIn.data.user) throw new Error("Local Supabase sign-in did not return the test user.");

    const storage = new MemoryStorage();
    const profileRepository = new LocalUserProfileRepository(storage);
    const profileSaved = profileRepository.save({ displayName: "REQ-37b local test", experienceLevel: "developing", selectedNeeds: ["track_and_compare"] });
    expect(profileSaved.ok).toBe(true);

    const beans = new LocalBeanRepository(storage);
    const beanResult = beans.save({ name: "Local parity lot", roaster: "CupMaster Test", origin: "Huila", process: "Washed", flavors: ["citrus", "caramel"] }, "req37b-bean");
    expect(beanResult.ok).toBe(true);
    if (!beanResult.ok) throw new Error(beanResult.message);

    const fixtures = createFullDemoFixtures();
    const source = fixtures.brews[0];
    const feedbackSource = fixtures.brews.find((brew) => brew.flavorFeedback)?.flavorFeedback;
    if (!feedbackSource) throw new Error("Demo fixture has no flavor feedback template.");
    const grindSettings = [
      { grinderId: "timemore-c3", format: "single" as const, value: 18 },
      { grinderId: "1zpresso-k-ultra", format: "compound" as const, parts: [0, 9, 2] },
      { grinderId: "custom:eureka-mignon", format: "number" as const, value: 2.5 },
    ];
    const brews = grindSettings.map((grind, index) => {
      const id = `req37b-${randomUUID()}-${index}`;
      const settingText = grind.format === "compound" ? "0.9.2" : String(grind.value);
      return brewPersistenceSchema.parse({
        ...structuredClone(source),
        id,
        beanId: beanResult.value.id,
        sourcePreparationId: index === 0 ? "req37b-saved-preparation" : undefined,
        recipeSnapshot: { ...structuredClone(source.recipeSnapshot), bean: beanSnapshot(beanResult.value), grind, brewTemperatureMode: "iced", iceGrams: 70 + index * 10, equipment: { ...source.recipeSnapshot.equipment, grinder: grind.grinderId, grinderId: grind.grinderId, grinderSetting: settingText, accessories: ["server"] } },
        brewPlan: { ...structuredClone(source.brewPlan), grind, brewTemperatureMode: "iced", iceGrams: 70 + index * 10, equipment: { grinder: grind.grinderId, grinderId: grind.grinderId, grinderSetting: settingText, accessories: ["server"] } },
        flavorFeedback: { ...structuredClone(feedbackSource), id: `${id}:feedback`, brewId: id, overallImpression: undefined, stars: 3 + index, aroma: 4, tasteTags: ["甜", "平衡"], createdAt: source.updatedAt, updatedAt: source.updatedAt },
        feedbackStatus: "completed",
        recordDetails: { ...structuredClone(source.recordDetails), bean: { name: beanResult.value.name, roaster: beanResult.value.roaster, origin: beanResult.value.origin, process: beanResult.value.process }, equipment: { grinder: grind.grinderId, grinderSetting: settingText, dripper: "V60 02" } },
        updatedAt: source.updatedAt,
      });
    });

    const brewRepository = new LocalBrewRepository(storage);
    const brewSaved = brewRepository.upsertMany(brews, "req37b-");
    expect(brewSaved.ok).toBe(true);
    if (!brewSaved.ok) throw new Error(brewSaved.message);

    const preparations = new LocalBrewPreparationRepository(storage);
    const first = brews[0];
    const prepSaved = preparations.save({ beanId: beanResult.value.id, snapshot: first.recipeSnapshot, plan: first.brewPlan, sourceBrewId: null, appliedAdjustment: null }, "req37b-saved-preparation", first.updatedAt);
    expect(prepSaved.ok).toBe(true);

    const local: LocalRepositoryBundle = { beanRepository: beans, preparationRepository: preparations, userProfileRepository: profileRepository, brewRepository, suggestedPlanRepository: new LocalSuggestedPlanRepository(storage), recipeRepository: new MockRecipeRepository() };
    const remote = { userProfileRepository: new SupabaseUserProfileRepository(userClient), brewRepository: new SupabaseBrewRepository(userClient), suggestedPlanRepository: new SupabaseSuggestedPlanRepository(userClient), parityRepository: new SupabaseParityRepository(userClient) };
    const gateway = new CloudMigrationRemoteGateway(remote);
    const review = await new MigrationReviewService(local).review();
    expect(review.validation.valid).toBe(true);
    const preflight = await new MigrationRemotePreflightService(local, gateway).collect();
    expect(preflight).toMatchObject({ ok: true, value: { canStart: true, beans: { missing: 1 }, preparations: { missing: 1 }, libraryState: "missing", brews: { missing: 3 } } });
    if (!preflight.ok || !preflight.value.canStart) throw new Error("Local Supabase preflight did not permit the reviewed graph.");

    const checkpointStorage = new MemoryStorage();
    const migration = new LocalToCloudMigrationService(local, gateway, new CloudMigrationCheckpointRepository(checkpointStorage), created.data.user.id);
    const result = await migration.start({ consentConfirmed: true, reviewFingerprint: review.reviewFingerprint });
    expect(result).toMatchObject({ ok: true, checkpoint: { status: "completed", migratedBeanIds: [beanResult.value.id], migratedPreparationIds: ["req37b-saved-preparation"], totalBrewCount: 3, graphVerified: true } });

    const [remoteBeans, remotePreparations, remoteBrews, remoteJournal, remoteLibraryState] = await Promise.all([
      remote.parityRepository.listBeansForMigration(),
      remote.parityRepository.listPreparationsForMigration(),
      remote.brewRepository.listAll(),
      remote.brewRepository.listJournalEntries(),
      remote.parityRepository.readLibraryState(),
    ]);
    expect(remoteBeans.ok && remoteBeans.value.find((item) => item.entity.id === beanResult.value.id)?.entity).toEqual(beanResult.value);
    expect(remotePreparations.ok && remotePreparations.value.find((item) => item.entity.id === "req37b-saved-preparation")?.entity).toEqual({ id: "req37b-saved-preparation", entry: expect.objectContaining({ beanId: beanResult.value.id }), deletedAt: null });
    expect(remoteBrews.ok && remoteBrews.value.filter((brew) => brew.id.startsWith("req37b-")).sort((a, b) => a.id.localeCompare(b.id))).toEqual(brews.sort((a, b) => a.id.localeCompare(b.id)));
    expect(remoteJournal.ok && remoteJournal.value.filter((brew) => brew.id.startsWith("req37b-"))).toHaveLength(3);
    const localBeanState = beans.read();
    const localPreparationState = preparations.read();
    expect(remoteLibraryState.ok && remoteLibraryState.value?.entity).toEqual({
      legacyImportReviewed: localBeanState.ok ? localBeanState.value.legacyImportReviewed : null,
      redirects: localPreparationState.ok ? localPreparationState.value.redirects : null,
      lineage: localPreparationState.ok ? localPreparationState.value.lineage : null,
      deletedIds: localPreparationState.ok ? localPreparationState.value.deletedIds : null,
    });
    if (!remoteBrews.ok) throw new Error("Migrated Brews could not be read back.");
    const actualBeanBrews = beanBrews(beanResult.value, [beanResult.value], remoteBrews.value);
    expect(actualBeanBrews.map((brew) => brew.id).sort()).toEqual(brews.map((brew) => brew.id).sort());
    expect(bestStars(actualBeanBrews)).toBe(5);
  }, 120_000);
});
