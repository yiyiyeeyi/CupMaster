# Cloud migration engine

Cloud 4-2 copies one explicitly reviewed Local graph to the authenticated Supabase account. It does not switch runtime repositories, delete Local data, or start synchronization.

Two explicit actions are required: consent on Review and Start Migration on Ready. The command carries a deterministic fingerprint of the reviewed Profile/Brew/Plan content and Recipe count. The service rebuilds review before writing and rejects changes as `review_outdated`.

Progress is stored under `cupmaster:cloud-migration` in a version 1 Zod envelope isolated by authenticated user ID. It stores only IDs, counts, statuses, timestamps, attempts, fingerprint, and safe errors—never payloads, credentials, email, or notes. Batches contain at most 25 sorted IDs and checkpoint after each batch.

Execution performs conflict preflight, Profile, base Brews, Suggested Plans, Brew reference patches, optional Plan patches, and remote verification. Suggested-plan Brews temporarily use `source_type=recipe` without the circular Plan FK; after Plans exist, a revision-aware patch restores original metadata. Local entities are never modified.

Profile handling is conservative: missing is created, exact content is already present, and only the unmistakable incomplete `Coffee Brewer`/beginner/no-needs bootstrap may be replaced. Any other difference is a conflict.

Completion requires remote reread, content comparison, graph validation, and `graphVerified=true`. Failed or interrupted work retains completed IDs and requires explicit Retry/Resume. Completion means copied once, not synced. Cloud 5 remains responsible for continuous synchronization.

Cloud 4-3 adds a read-only preflight before Start, a fixed Local-only `migration-smoke-` graph, checkpoint inspection, and fake-gateway failure recovery tests. Real writes remain available only after explicit consent and a user click on `/migration`; diagnostics never start migration.
