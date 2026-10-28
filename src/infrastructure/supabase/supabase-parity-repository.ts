"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BeanRecord } from "@/domain/beans";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database.types";
import type { LibraryStatePayload, PreparationRecord } from "./mappers/library-mappers";
import { fromBeanRow, fromPreparationRow, fromLibraryStateRow, toBeanRow, toPreparationRow, toLibraryStateRow } from "./mappers/library-mappers";
import { mapPostgrestError, mapRepositoryException, remoteFailure } from "./repository-errors";
import type { RemoteParityRepository, RemoteResult } from "./remote-repository-contracts";

type Versioned<T> = { entity: T; revision: number };

/** Owner-scoped storage for the REQ-37b parity tables. All reads include tombstones for migration. */
export class SupabaseParityRepository implements RemoteParityRepository {
  constructor(private readonly client: SupabaseClient<Database> = getSupabaseBrowserClient()) {}

  private async userId(): Promise<RemoteResult<string>> {
    const { data, error } = await this.client.auth.getUser();
    return error || !data.user ? remoteFailure("unauthenticated", "Sign in is required for cloud persistence.") : { ok: true, value: data.user.id };
  }

  async listBeansForMigration(): Promise<RemoteResult<Array<Versioned<BeanRecord>>>> {
    const user = await this.userId(); if (!user.ok) return user;
    const { data, error } = await this.client.from("beans").select("*").eq("user_id", user.value).order("updated_at", { ascending: true });
    if (error) return mapPostgrestError(error);
    try { return { ok: true, value: (data ?? []).map((row) => fromBeanRow(row)) }; } catch (cause) { return mapRepositoryException(cause); }
  }

  async writeBean(bean: BeanRecord, expectedRevision?: number): Promise<RemoteResult<Versioned<BeanRecord>>> {
    const user = await this.userId(); if (!user.ok) return user;
    try {
      const row = toBeanRow(user.value, bean, (expectedRevision ?? 0) + 1);
      if (expectedRevision === undefined) {
        const result = await this.client.from("beans").insert(row).select("*").single();
        return result.error ? mapPostgrestError(result.error) : { ok: true, value: fromBeanRow(result.data) };
      }
      const { user_id: _owner, id: _id, created_at: _created, ...update } = row;
      void _owner; void _id; void _created;
      const result = await this.client.from("beans").update(update).eq("user_id", user.value).eq("id", bean.id).eq("revision", expectedRevision).select("*").maybeSingle();
      if (result.error) return mapPostgrestError(result.error);
      return result.data ? { ok: true, value: fromBeanRow(result.data) } : remoteFailure("revision_conflict", "The cloud Bean changed before this write completed.");
    } catch (cause) { return mapRepositoryException(cause); }
  }

  async listPreparationsForMigration(): Promise<RemoteResult<Array<Versioned<PreparationRecord>>>> {
    const user = await this.userId(); if (!user.ok) return user;
    const { data, error } = await this.client.from("brew_preparations").select("*").eq("user_id", user.value).order("updated_at", { ascending: true });
    if (error) return mapPostgrestError(error);
    try { return { ok: true, value: (data ?? []).map((row) => fromPreparationRow(row)) }; } catch (cause) { return mapRepositoryException(cause); }
  }

  async writePreparation(record: PreparationRecord, expectedRevision?: number): Promise<RemoteResult<Versioned<PreparationRecord>>> {
    const user = await this.userId(); if (!user.ok) return user;
    try {
      const row = toPreparationRow(user.value, record, (expectedRevision ?? 0) + 1);
      if (expectedRevision === undefined) {
        const result = await this.client.from("brew_preparations").insert(row).select("*").single();
        return result.error ? mapPostgrestError(result.error) : { ok: true, value: fromPreparationRow(result.data) };
      }
      const { user_id: _owner, id: _id, created_at: _created, ...update } = row;
      void _owner; void _id; void _created;
      const result = await this.client.from("brew_preparations").update(update).eq("user_id", user.value).eq("id", record.id).eq("revision", expectedRevision).select("*").maybeSingle();
      if (result.error) return mapPostgrestError(result.error);
      return result.data ? { ok: true, value: fromPreparationRow(result.data) } : remoteFailure("revision_conflict", "The cloud preparation changed before this write completed.");
    } catch (cause) { return mapRepositoryException(cause); }
  }

  async readLibraryState(): Promise<RemoteResult<Versioned<LibraryStatePayload> | null>> {
    const user = await this.userId(); if (!user.ok) return user;
    const { data, error } = await this.client.from("library_states").select("*").eq("user_id", user.value).maybeSingle();
    if (error) return mapPostgrestError(error);
    if (!data) return { ok: true, value: null };
    try { return { ok: true, value: fromLibraryStateRow(data) }; } catch (cause) { return mapRepositoryException(cause); }
  }

  async writeLibraryState(payload: LibraryStatePayload, expectedRevision?: number): Promise<RemoteResult<Versioned<LibraryStatePayload>>> {
    const user = await this.userId(); if (!user.ok) return user;
    try {
      const row = toLibraryStateRow(user.value, payload, (expectedRevision ?? 0) + 1);
      if (expectedRevision === undefined) {
        const result = await this.client.from("library_states").insert(row).select("*").single();
        return result.error ? mapPostgrestError(result.error) : { ok: true, value: fromLibraryStateRow(result.data) };
      }
      const { user_id: _owner, created_at: _created, ...update } = row;
      void _owner; void _created;
      const result = await this.client.from("library_states").update(update).eq("user_id", user.value).eq("revision", expectedRevision).select("*").maybeSingle();
      if (result.error) return mapPostgrestError(result.error);
      return result.data ? { ok: true, value: fromLibraryStateRow(result.data) } : remoteFailure("revision_conflict", "The cloud library state changed before this write completed.");
    } catch (cause) { return mapRepositoryException(cause); }
  }
}

