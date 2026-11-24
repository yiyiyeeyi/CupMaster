import "server-only";
import { z } from "zod";
import { brewPersistenceSchema, brewRecipeSnapshotSchema } from "@/data/local-brew-schema";
import { experienceLevelSchema, userNeedSchema, userProfileSchema } from "@/domain/schemas";
import { suggestedBrewPlanSchema } from "@/domain/suggested-plan";
import { libraryStatePayloadSchema, storedBeanSchema, storedPreparationSchema } from "./cloud-row-schemas";
import { remoteFailure } from "./repository-errors";
import type { RemoteResult } from "./remote-repository-contracts";
import type { OwnerStore } from "./owner-store";
import { PgUserProfileRepository } from "./pg-user-profile-repository";
import { PgBrewRepository } from "./pg-brew-repository";
import { PgSuggestedPlanRepository } from "./pg-suggested-plan-repository";
import { PgParityRepository } from "./pg-parity-repository";

const id = z.string().min(1);
const timestamp = z.iso.datetime();
const revision = z.int().positive().max(Number.MAX_SAFE_INTEGER - 1);
const optionalRevision = revision.optional();
const brew = brewPersistenceSchema;
const plan = suggestedBrewPlanSchema.refine(value => brewRecipeSnapshotSchema.safeParse(value.baseRecipeSnapshot).success);
const brews = z.array(brew);
const plans = z.array(plan);
const bean = storedBeanSchema;
const profile = z.object({
  profile: userProfileSchema,
  selectedNeeds: z.array(userNeedSchema),
  onboardingCompleted: z.boolean(),
  preferences: z.json().optional(),
});
const draft = z.object({
  displayName: z.string().trim().min(2).max(40),
  experienceLevel: experienceLevelSchema,
  selectedNeeds: z.array(userNeedSchema),
  preferences: z.json().optional(),
});
const preparation = z.object({
  id,
  entry: storedPreparationSchema.nullable(),
  deletedAt: timestamp.nullable(),
});
const library = libraryStatePayloadSchema;

function operation<Args extends unknown[]>(
  schema: z.ZodType<Args>,
  run: (...args: Args) => Promise<RemoteResult<unknown>>,
) {
  return async (input: unknown): Promise<RemoteResult<unknown>> => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return remoteFailure("invalid_data", "Cloud data does not match the current domain contract.");
    return run(...parsed.data);
  };
}

export function cloudOperations(store: OwnerStore) {
  const profileRepository = new PgUserProfileRepository(store);
  const brewRepository = new PgBrewRepository(store);
  const suggestedRepository = new PgSuggestedPlanRepository(store);
  const parityRepository = new PgParityRepository(store);
  return {
    "profile": {
      load: operation(z.tuple([]), (...args) => profileRepository.load(...args)),
      save: operation(z.tuple([draft]), (...args) => profileRepository.save(...args)),
      updateIfRevision: operation(z.tuple([profile, revision]), (...args) => profileRepository.updateIfRevision(...args)),
      remove: operation(z.tuple([]), (...args) => profileRepository.remove(...args)),
      getForMigration: operation(z.tuple([]), (...args) => profileRepository.getForMigration(...args)),
    },
    "brew": {
      createDraft: operation(z.tuple([brew]), (...args) => brewRepository.createDraft(...args)),
      getById: operation(z.tuple([id]), (...args) => brewRepository.getById(...args)),
      findBySourceSuggestedPlanId: operation(z.tuple([id]), (...args) => brewRepository.findBySourceSuggestedPlanId(...args)),
      listAll: operation(z.tuple([]), (...args) => brewRepository.listAll(...args)),
      listDrafts: operation(z.tuple([]), (...args) => brewRepository.listDrafts(...args)),
      listJournalEntries: operation(z.tuple([]), (...args) => brewRepository.listJournalEntries(...args)),
      upsertMany: operation(z.tuple([brews, id]), (...args) => brewRepository.upsertMany(...args)),
      removeByIdPrefix: operation(z.tuple([id]), (...args) => brewRepository.removeByIdPrefix(...args)),
      updateDraft: operation(z.tuple([brew]), (...args) => brewRepository.updateDraft(...args)),
      updateIfRevision: operation(z.tuple([brew, revision]), (...args) => brewRepository.updateIfRevision(...args)),
      deleteDraft: operation(z.tuple([id]), (...args) => brewRepository.deleteDraft(...args)),
      getForMigration: operation(z.tuple([id]), (...args) => brewRepository.getForMigration(...args)),
    },
    "suggested-plan": {
      create: operation(z.tuple([plan]), (...args) => suggestedRepository.create(...args)),
      getById: operation(z.tuple([id]), (...args) => suggestedRepository.getById(...args)),
      findByResultingBrewId: operation(z.tuple([id]), (...args) => suggestedRepository.findByResultingBrewId(...args)),
      list: operation(z.tuple([]), (...args) => suggestedRepository.list(...args)),
      listBySourceBrewId: operation(z.tuple([id]), (...args) => suggestedRepository.listBySourceBrewId(...args)),
      upsertMany: operation(z.tuple([plans, id]), (...args) => suggestedRepository.upsertMany(...args)),
      removeByIdPrefix: operation(z.tuple([id]), (...args) => suggestedRepository.removeByIdPrefix(...args)),
      update: operation(z.tuple([plan]), (...args) => suggestedRepository.update(...args)),
      updateIfRevision: operation(z.tuple([plan, revision]), (...args) => suggestedRepository.updateIfRevision(...args)),
      markUsed: operation(z.tuple([id, id, timestamp]), (...args) => suggestedRepository.markUsed(...args)),
      getForMigration: operation(z.tuple([id]), (...args) => suggestedRepository.getForMigration(...args)),
    },
    "parity": {
      listBeansForMigration: operation(z.tuple([]), (...args) => parityRepository.listBeansForMigration(...args)),
      writeBean: operation(z.tuple([bean, optionalRevision]), (...args) => parityRepository.writeBean(...args)),
      listPreparationsForMigration: operation(z.tuple([]), (...args) => parityRepository.listPreparationsForMigration(...args)),
      writePreparation: operation(z.tuple([preparation, optionalRevision]), (...args) => parityRepository.writePreparation(...args)),
      readLibraryState: operation(z.tuple([]), (...args) => parityRepository.readLibraryState(...args)),
      writeLibraryState: operation(z.tuple([library, optionalRevision]), (...args) => parityRepository.writeLibraryState(...args)),
    },
  };
}
