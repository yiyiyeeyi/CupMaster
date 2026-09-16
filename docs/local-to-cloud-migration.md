# Local-to-cloud migration readiness

Cloud 3-2 defines contracts only. It does not inspect, export, upload, or remove local data and does not create a checkpoint. Cloud 4 must require explicit user intent before executing migration.

Cloud 4-1 adds `/migration`, an authenticated **read-only** review. `MigrationReviewService` reads counts through the runtime Local repository bundle, reuses the graph validator, and builds human-readable warnings. Consent advances only an in-memory page phase to “Migration Ready”; it creates no checkpoint and the disabled Start Migration control states that Cloud 4-2 is next. No Supabase client or application table is queried.

Cloud 4-2 enables a separate Start action. The engine validates the fingerprint, persists per-account progress, rejects conflicts/tombstones/invalid rows before writing, imports in batches of 25, patches circular references with expected revisions, and rereads the remote graph before completion. Interrupted work is never auto-resumed. Local repositories remain active and untouched.

The version 1 checkpoint tracks status, authenticated user ID, timestamps, Profile completion, migrated Brew/Plan IDs, graph verification, and a safe error code. Completed requires verification, `completedAt`, and no error; failed requires an error and preserves progress. Storage location remains undecided until Cloud 4.

The pure graph validator checks unique IDs, Plan source/result Brew references, Brew source Plan references, bidirectional one-to-one mappings, v2 used-state invariants, and resulting Brew source metadata. It preserves IDs, including Demo-safe IDs, and returns stable sorted IDs.

Logical ordering is Profile; Brews without circular links; Suggested Plans; patch Brew links; patch Plan links; verify graph; complete checkpoint. Cloud 3-2 executes neither this sequence nor a transaction.

Local ID equals Remote ID and retries never generate replacement IDs. Entity classification distinguishes `missing_remote`, `matching`, `conflict`, `deleted_remote`, and `invalid_remote`. Completed migration never restarts automatically; partial checkpoints identify unfinished IDs; graph failure prevents completion. Cloud 4 will implement migration and Cloud 5 sync/conflict UX.

Cloud 4-3 smoke QA uses two Local Brews and one Suggested Plan with fixed `migration-smoke-` IDs. Preflight is read-only; conflict blocks Start. Completion does not delete Local data, switch runtime mode, or upload later Local changes.
