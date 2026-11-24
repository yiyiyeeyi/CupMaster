import type { Brew, SuggestedBrewPlan } from "@/domain";
import type { OnboardingDraft, StoredUserProfile } from "@/repositories/user-profile-repository";
import type { Json } from "@/types/database.types";
import type { BeanRecord } from "@/domain/beans";
import type { PreparationRecord, LibraryStatePayload } from "./mappers/library-mappers";

export type RemoteRepositoryErrorCode = "unauthenticated" | "not_found" | "revision_conflict" | "permission_denied" | "invalid_data" | "persistence_failed";
export type RemoteResult<T> = { ok: true; value: T; revision?: number } | { ok: false; code: RemoteRepositoryErrorCode; message: string };
export type RemoteMigrationRecord<T>={state:"missing"}|{state:"deleted";revision:number}|{state:"active";entity:T;revision:number}|{state:"invalid"};
export interface RemoteUserProfileRepository {
  load(): Promise<RemoteResult<StoredUserProfile | null>>;
  save(draft: Required<OnboardingDraft> & { preferences?: Json }): Promise<RemoteResult<StoredUserProfile>>;
  updateIfRevision(profile: StoredUserProfile, expectedRevision: number): Promise<RemoteResult<StoredUserProfile>>;
  remove(): Promise<RemoteResult<null>>;
  getForMigration():Promise<RemoteResult<RemoteMigrationRecord<StoredUserProfile>>>;
}
export interface RemoteBrewRepository {
  createDraft(draft: Brew): Promise<RemoteResult<Brew>>; getById(id: string): Promise<RemoteResult<Brew | null>>; findBySourceSuggestedPlanId(planId: string): Promise<RemoteResult<Brew | null>>;
  listAll(): Promise<RemoteResult<Brew[]>>; listDrafts(): Promise<RemoteResult<Brew[]>>; listJournalEntries(): Promise<RemoteResult<Brew[]>>; upsertMany(drafts: Brew[], idPrefix: string): Promise<RemoteResult<Brew[]>>;
  removeByIdPrefix(idPrefix: string): Promise<RemoteResult<number>>; updateDraft(draft: Brew): Promise<RemoteResult<Brew>>; updateIfRevision(draft: Brew, expectedRevision: number): Promise<RemoteResult<Brew>>; deleteDraft(id: string): Promise<RemoteResult<null>>;
  getForMigration(id:string):Promise<RemoteResult<RemoteMigrationRecord<Brew>>>;
}
export interface RemoteSuggestedPlanRepository {
  create(plan: SuggestedBrewPlan): Promise<RemoteResult<SuggestedBrewPlan>>; getById(id: string): Promise<RemoteResult<SuggestedBrewPlan | null>>; findByResultingBrewId(brewId: string): Promise<RemoteResult<SuggestedBrewPlan | null>>;
  list(): Promise<RemoteResult<SuggestedBrewPlan[]>>; listBySourceBrewId(brewId: string): Promise<RemoteResult<SuggestedBrewPlan[]>>; upsertMany(plans: SuggestedBrewPlan[], idPrefix: string): Promise<RemoteResult<SuggestedBrewPlan[]>>;
  removeByIdPrefix(idPrefix: string): Promise<RemoteResult<number>>; update(plan: SuggestedBrewPlan): Promise<RemoteResult<SuggestedBrewPlan>>; updateIfRevision(plan: SuggestedBrewPlan, expectedRevision: number): Promise<RemoteResult<SuggestedBrewPlan>>; markUsed(planId: string, resultingBrewId: string, usedAt: string): Promise<RemoteResult<SuggestedBrewPlan>>;
  getForMigration(id:string):Promise<RemoteResult<RemoteMigrationRecord<SuggestedBrewPlan>>>;
}

export interface RemoteParityRepository {
  listBeansForMigration(): Promise<RemoteResult<Array<{ entity: BeanRecord; revision: number }>>>;
  writeBean(bean: BeanRecord, expectedRevision?: number): Promise<RemoteResult<{ entity: BeanRecord; revision: number }>>;
  listPreparationsForMigration(): Promise<RemoteResult<Array<{ entity: PreparationRecord; revision: number }>>>;
  writePreparation(record: PreparationRecord, expectedRevision?: number): Promise<RemoteResult<{ entity: PreparationRecord; revision: number }>>;
  readLibraryState(): Promise<RemoteResult<{ entity: LibraryStatePayload; revision: number } | null>>;
  writeLibraryState(payload: LibraryStatePayload, expectedRevision?: number): Promise<RemoteResult<{ entity: LibraryStatePayload; revision: number }>>;
}
