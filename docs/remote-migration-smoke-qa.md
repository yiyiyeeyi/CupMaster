# Remote migration smoke QA

Cloud 4-3 validates Cloud 4-2 with one dedicated authenticated test account and the fixed `migration-smoke-` Local graph. Never record email, user UUID, token, key, project reference, or private Brew content in QA notes.

## Preconditions

1. Run the development server and sign in with the dedicated test account.
2. Open `/dev/migration-qa`; confirm authenticated = Yes, runtime = local, sync = Not implemented.
3. Seed Migration Smoke Graph. Confirm Profile present, 2 Brews, 1 Plan, and graph valid.
4. Run read-only preflight. Remote smoke entities must be missing or matching, with zero conflict/deleted/invalid rows.
5. Confirm checkpoint = none.

## User-authorized migration

1. Open `/migration`; verify Local summary and run remote preflight.
2. Check consent, Continue, then personally click Start Migration.
3. Keep the page open and record only aggregate progress counts.
4. Wait for completed and `graphVerified = true`. Codex, scripts, server actions, diagnostics, and repository calls must never replace this click.

## Verification and idempotency

1. Rerun read-only diagnostics: Profile exists, both Brew IDs and the Plan ID round-trip, references agree, and Snapshot/Feedback/Details compare successfully.
2. Reload `/migration`: completed remains visible, no automatic upload occurs, and remote counts do not change.
3. Create a non-smoke Local Brew. Confirm it never appears remotely automatically.

## Failure recovery

Integration tests use the closed fake-gateway fault points documented in `docs/remote-qa.md`. Verify checkpoint progress, disable injection, Retry/Resume, and verify no duplicate IDs. The development page does not connect injection to real migration.

No real smoke execution has occurred until the user completes the migration section. Cloud 5 sync, offline queue, and conflict merge remain out of scope.
