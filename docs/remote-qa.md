# Cloud migration remote QA tooling

`/dev/migration-qa` is development-only. Production renders an unavailable state. Diagnostics display only authentication yes/no, Local runtime mode, aggregate graph counts, remote classifications, checkpoint counts/status, graph verification, and safe error codes. They never render email, complete UUIDs, tokens, keys, payloads, notes, or entity IDs.

Read-only preflight classifies Profile as missing/matching/bootstrap/conflict and Brews/Plans as missing/matching/conflict/deleted/invalid. Conflict, tombstone, invalid data, authentication failure, or network failure prevents Start Migration. The only remote-write route remains `/migration` after Review, consent, Continue, preflight, and explicit Start Migration.

The fault decorator supports only `before_profile_write`, `after_profile_write`, `before_brew_batch`, `after_first_brew_batch`, `before_plan_batch`, `after_first_plan_batch`, `before_reference_patch`, and `before_verification`. It is production-blocked, off by default, accepts no URL query switch, stores no payload, and tests fake repositories only.

Smoke reset removes only Local `migration-smoke-` Brew/Plan records. Checkpoint reset is scoped to the authenticated user, requires a second confirmation, and removes neither Local nor Remote entities. No hard-delete remote cleanup is provided.
