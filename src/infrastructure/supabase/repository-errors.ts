import type { PostgrestError } from "@supabase/supabase-js";
import { CloudMappingError } from "./cloud-row-schemas";
import type { RemoteRepositoryErrorCode, RemoteResult } from "./remote-repository-contracts";
export function remoteFailure<T>(code: RemoteRepositoryErrorCode, message: string): RemoteResult<T> { return { ok: false, code, message }; }
export function mapPostgrestError<T>(error: PostgrestError): RemoteResult<T> { if (error.code === "42501") return remoteFailure("permission_denied", "Cloud access was denied."); if (error.code === "23505") return remoteFailure("revision_conflict", "The cloud record changed before this write completed."); return remoteFailure("persistence_failed", "Cloud persistence is temporarily unavailable."); }
export function mapRepositoryException<T>(error: unknown): RemoteResult<T> { return error instanceof CloudMappingError ? remoteFailure("invalid_data", "Cloud data does not match the current domain contract.") : remoteFailure("persistence_failed", "Cloud persistence is temporarily unavailable."); }
