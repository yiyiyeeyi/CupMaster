"use client";

import type { RemoteUserProfileRepository, RemoteBrewRepository, RemoteSuggestedPlanRepository, RemoteParityRepository, RemoteResult } from "./remote-repository-contracts";

type CloudCall = <T>(resource: string, action: string, args: unknown[]) => Promise<RemoteResult<T>>;

export function cloudCall(expectedUserId: string, send: typeof fetch = fetch): CloudCall {
  return async <T>(resource: string, action: string, args: unknown[]): Promise<RemoteResult<T>> => {
    try {
      const providedArgs = [...args];
      while (providedArgs.length && providedArgs.at(-1) === undefined) providedArgs.pop();
      const response = await send(`/api/cloud/${resource}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-cupmaster-account": expectedUserId },
        body: JSON.stringify({ action, args: providedArgs }),
        cache: "no-store",
      });
      const result: unknown = await response.json();
      if (typeof result === "object" && result !== null && "ok" in result) {
        return result as RemoteResult<T>;
      }
    } catch {
      // Preserve the repository's recoverable failure contract on a network error.
    }
    return { ok: false, code: "persistence_failed", message: "Cloud persistence is temporarily unavailable." };
  };
}

export class HttpUserProfileRepository implements RemoteUserProfileRepository {
  constructor(private readonly call: CloudCall) {}

  load(...args: Parameters<RemoteUserProfileRepository["load"]>): ReturnType<RemoteUserProfileRepository["load"]> {
    return this.call("profile", "load", args);
  }

  save(...args: Parameters<RemoteUserProfileRepository["save"]>): ReturnType<RemoteUserProfileRepository["save"]> {
    return this.call("profile", "save", args);
  }

  updateIfRevision(...args: Parameters<RemoteUserProfileRepository["updateIfRevision"]>): ReturnType<RemoteUserProfileRepository["updateIfRevision"]> {
    return this.call("profile", "updateIfRevision", args);
  }

  remove(...args: Parameters<RemoteUserProfileRepository["remove"]>): ReturnType<RemoteUserProfileRepository["remove"]> {
    return this.call("profile", "remove", args);
  }

  getForMigration(...args: Parameters<RemoteUserProfileRepository["getForMigration"]>): ReturnType<RemoteUserProfileRepository["getForMigration"]> {
    return this.call("profile", "getForMigration", args);
  }
}

export class HttpBrewRepository implements RemoteBrewRepository {
  constructor(private readonly call: CloudCall) {}

  createDraft(...args: Parameters<RemoteBrewRepository["createDraft"]>): ReturnType<RemoteBrewRepository["createDraft"]> {
    return this.call("brew", "createDraft", args);
  }

  getById(...args: Parameters<RemoteBrewRepository["getById"]>): ReturnType<RemoteBrewRepository["getById"]> {
    return this.call("brew", "getById", args);
  }

  findBySourceSuggestedPlanId(...args: Parameters<RemoteBrewRepository["findBySourceSuggestedPlanId"]>): ReturnType<RemoteBrewRepository["findBySourceSuggestedPlanId"]> {
    return this.call("brew", "findBySourceSuggestedPlanId", args);
  }

  listAll(...args: Parameters<RemoteBrewRepository["listAll"]>): ReturnType<RemoteBrewRepository["listAll"]> {
    return this.call("brew", "listAll", args);
  }

  listDrafts(...args: Parameters<RemoteBrewRepository["listDrafts"]>): ReturnType<RemoteBrewRepository["listDrafts"]> {
    return this.call("brew", "listDrafts", args);
  }

  listJournalEntries(...args: Parameters<RemoteBrewRepository["listJournalEntries"]>): ReturnType<RemoteBrewRepository["listJournalEntries"]> {
    return this.call("brew", "listJournalEntries", args);
  }

  upsertMany(...args: Parameters<RemoteBrewRepository["upsertMany"]>): ReturnType<RemoteBrewRepository["upsertMany"]> {
    return this.call("brew", "upsertMany", args);
  }

  removeByIdPrefix(...args: Parameters<RemoteBrewRepository["removeByIdPrefix"]>): ReturnType<RemoteBrewRepository["removeByIdPrefix"]> {
    return this.call("brew", "removeByIdPrefix", args);
  }

  updateDraft(...args: Parameters<RemoteBrewRepository["updateDraft"]>): ReturnType<RemoteBrewRepository["updateDraft"]> {
    return this.call("brew", "updateDraft", args);
  }

  updateIfRevision(...args: Parameters<RemoteBrewRepository["updateIfRevision"]>): ReturnType<RemoteBrewRepository["updateIfRevision"]> {
    return this.call("brew", "updateIfRevision", args);
  }

  deleteDraft(...args: Parameters<RemoteBrewRepository["deleteDraft"]>): ReturnType<RemoteBrewRepository["deleteDraft"]> {
    return this.call("brew", "deleteDraft", args);
  }

  getForMigration(...args: Parameters<RemoteBrewRepository["getForMigration"]>): ReturnType<RemoteBrewRepository["getForMigration"]> {
    return this.call("brew", "getForMigration", args);
  }
}

export class HttpSuggestedPlanRepository implements RemoteSuggestedPlanRepository {
  constructor(private readonly call: CloudCall) {}

  create(...args: Parameters<RemoteSuggestedPlanRepository["create"]>): ReturnType<RemoteSuggestedPlanRepository["create"]> {
    return this.call("suggested-plan", "create", args);
  }

  getById(...args: Parameters<RemoteSuggestedPlanRepository["getById"]>): ReturnType<RemoteSuggestedPlanRepository["getById"]> {
    return this.call("suggested-plan", "getById", args);
  }

  findByResultingBrewId(...args: Parameters<RemoteSuggestedPlanRepository["findByResultingBrewId"]>): ReturnType<RemoteSuggestedPlanRepository["findByResultingBrewId"]> {
    return this.call("suggested-plan", "findByResultingBrewId", args);
  }

  list(...args: Parameters<RemoteSuggestedPlanRepository["list"]>): ReturnType<RemoteSuggestedPlanRepository["list"]> {
    return this.call("suggested-plan", "list", args);
  }

  listBySourceBrewId(...args: Parameters<RemoteSuggestedPlanRepository["listBySourceBrewId"]>): ReturnType<RemoteSuggestedPlanRepository["listBySourceBrewId"]> {
    return this.call("suggested-plan", "listBySourceBrewId", args);
  }

  upsertMany(...args: Parameters<RemoteSuggestedPlanRepository["upsertMany"]>): ReturnType<RemoteSuggestedPlanRepository["upsertMany"]> {
    return this.call("suggested-plan", "upsertMany", args);
  }

  removeByIdPrefix(...args: Parameters<RemoteSuggestedPlanRepository["removeByIdPrefix"]>): ReturnType<RemoteSuggestedPlanRepository["removeByIdPrefix"]> {
    return this.call("suggested-plan", "removeByIdPrefix", args);
  }

  update(...args: Parameters<RemoteSuggestedPlanRepository["update"]>): ReturnType<RemoteSuggestedPlanRepository["update"]> {
    return this.call("suggested-plan", "update", args);
  }

  updateIfRevision(...args: Parameters<RemoteSuggestedPlanRepository["updateIfRevision"]>): ReturnType<RemoteSuggestedPlanRepository["updateIfRevision"]> {
    return this.call("suggested-plan", "updateIfRevision", args);
  }

  markUsed(...args: Parameters<RemoteSuggestedPlanRepository["markUsed"]>): ReturnType<RemoteSuggestedPlanRepository["markUsed"]> {
    return this.call("suggested-plan", "markUsed", args);
  }

  getForMigration(...args: Parameters<RemoteSuggestedPlanRepository["getForMigration"]>): ReturnType<RemoteSuggestedPlanRepository["getForMigration"]> {
    return this.call("suggested-plan", "getForMigration", args);
  }
}

export class HttpParityRepository implements RemoteParityRepository {
  constructor(private readonly call: CloudCall) {}

  listBeansForMigration(...args: Parameters<RemoteParityRepository["listBeansForMigration"]>): ReturnType<RemoteParityRepository["listBeansForMigration"]> {
    return this.call("parity", "listBeansForMigration", args);
  }

  writeBean(...args: Parameters<RemoteParityRepository["writeBean"]>): ReturnType<RemoteParityRepository["writeBean"]> {
    return this.call("parity", "writeBean", args);
  }

  listPreparationsForMigration(...args: Parameters<RemoteParityRepository["listPreparationsForMigration"]>): ReturnType<RemoteParityRepository["listPreparationsForMigration"]> {
    return this.call("parity", "listPreparationsForMigration", args);
  }

  writePreparation(...args: Parameters<RemoteParityRepository["writePreparation"]>): ReturnType<RemoteParityRepository["writePreparation"]> {
    return this.call("parity", "writePreparation", args);
  }

  readLibraryState(...args: Parameters<RemoteParityRepository["readLibraryState"]>): ReturnType<RemoteParityRepository["readLibraryState"]> {
    return this.call("parity", "readLibraryState", args);
  }

  writeLibraryState(...args: Parameters<RemoteParityRepository["writeLibraryState"]>): ReturnType<RemoteParityRepository["writeLibraryState"]> {
    return this.call("parity", "writeLibraryState", args);
  }
}
