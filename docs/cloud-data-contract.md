# Cloud data contract

Cloud 3-2 separates `authMode` from `repositoryMode`. Authentication never selects remote storage: runtime is fixed to Local and does not inspect environment, session, URL, or development flags. Authenticated Remote and Migration bundles are dependency assembly only; they do not read LocalStorage, query application tables, write Supabase, or create checkpoints.

Cloud 4-2 writes only through the authenticated migration bundle after fingerprint-bound consent. Local IDs are Remote IDs. Suggested-plan Brews use a temporary base projection followed by revision-aware reference patching. Insert success is not completion until mapper round-trip and graph verification pass.

The checkpoint, deterministic graph validator, logical import order, and entity-state classifier are contracts for Cloud 4. Local and remote IDs must match. Content/revision divergence is a conflict, and migration cannot complete until graph verification succeeds.

Cloud 2 adds optional Auth and a minimal profile bootstrap only. Authentication is not synchronization: LocalStorage remains the runtime source and no local record is uploaded, replaced, or deleted. Explicit migration is reserved for Cloud 4 and ongoing synchronization for Cloud 5.

Browser and cookie-aware clients use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; no secret or service-role credential belongs in this contract.

Cloud 1 defines a PostgreSQL boundary for Profile, Brew, and Suggested Plan while the LocalStorage repositories remain the only runtime source. No local record has been uploaded, rewritten, or assigned a new ID.

## Storage shape

- `profiles` keeps onboarding identity and needs as relational columns; small future preferences remain a JSON object.
- `brews` keeps queryable ownership, lifecycle, graph IDs, timestamps, and counters as columns. Immutable Recipe Snapshot, BrewPlan, Stage Results, Feedback, details, Analysis, attempt, and handoff remain JSONB and are Zod-validated before entering domain code.
- `suggested_plans` keeps source/result graph identifiers and lifecycle relational. The immutable base Snapshot, exactly one adjustment, and evidence are JSONB.

Database IDs are text for Brew and Plan and are preserved byte-for-byte. The database does not regenerate deterministic, imported, or Demo-safe IDs. Profile IDs match `auth.users.id`.

## Revision and timestamps

`revision` is a bigint starting at 1 and reserved for future optimistic concurrency. Cloud 1 does not auto-increment it: a future remote repository must explicitly provide the next revision and later introduce a conditional update/RPC contract. This avoids ambiguous double increments.

## Cloud 3-1 remote repository infrastructure

Inactive Supabase implementations cover the current Profile, Brew, and Suggested Plan method sets. Existing Local interfaces remain synchronous because LocalStorage is the active runtime source; remote mirror contracts are async because Supabase JS is network-bound. No provider, service, page, component, or route imports these implementations.

Ownership comes from the authenticated client, never a caller user ID. Creates start at revision 1. `updateIfRevision(entity, expectedRevision)` writes revision `expectedRevision + 1` only when owner, id, expected revision, and active-row filters match. Zero rows return `revision_conflict`; deletes are soft deletes with the same guard.

Errors normalize to `unauthenticated`, `not_found`, `revision_conflict`, `permission_denied`, `invalid_data`, or `persistence_failed`. Cloud 3-1 excludes runtime selection, migration, sync, retries, offline queues, and conflict UI.

The `set_updated_at` trigger is the sole database mechanism for update timestamps. Domain timestamps remain ISO 8601 strings. `deleted_at` is a soft-delete marker; Cloud 1 mappers reject deleted rows as active entities, and future repository reads must add `deleted_at is null`.

## Circular graph

Plan-to-Brew references use same-user composite foreign keys and are `DEFERRABLE INITIALLY DEFERRED`. Deletes between Brew and Plan use `RESTRICT`; only deletion of the owning Auth user cascades. This protects history while supporting a future transaction:

1. Validate the complete local graph.
2. Upsert Profile.
3. Upsert Brews with nullable Plan references.
4. Upsert Suggested Plans.
5. Patch `Brew.sourceSuggestedPlanId`.
6. Patch `Plan.resultingBrewId`.
7. Validate source/result mappings, ownership, and timestamps.
8. Mark the migration complete outside the domain records.

Cloud 1 does not execute this migration, implement sync, or resolve conflicts.

## Type status

`src/types/database.types.ts` is a checked-in **provisional** contract mirrored from the migration, not output from a remote schema. After an approved push, regenerate it with Supabase CLI and review the diff before remote repositories are implemented.
