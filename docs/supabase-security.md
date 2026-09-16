# Supabase security boundary

Cloud 3-2 does not treat authentication as migration consent. Repository mode remains Local after sign-in. The composition root accepts no arbitrary user ID, uses no service-role credential, stores no token, and derives any future checkpoint user ID only from `auth.getUser()`. Creating a Remote or Migration bundle does not read/upload Local data or create remote entities. UI permission never replaces RLS.

Cloud 4-2 requires fingerprint-bound consent plus Start. Owner scope comes from authenticated repositories; URL/form user IDs are not accepted. Tombstones are read during preflight and never revived. Checkpoints contain no payload or credential, and safe UI errors never expose PostgREST details. RLS remains authoritative.

Cloud 4-3 diagnostics are development-only and aggregate-only. Smoke fixtures write Local repositories only. Remote preflight performs authenticated RLS-protected reads; it never uses service role or admin APIs. Fault injection is test-only and production-blocked. Checkpoint reset is account-scoped and never deletes Remote rows.

Cloud 2 Auth uses only `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, the browser-safe public credential. Supabase manages sessions; CupMaster never separately stores or logs tokens, uses metadata for authorization, or clears local app storage on sign-out. Profile bootstrap obtains the current Auth user internally, accepts no arbitrary id, and relies on RLS. Errors are safely mapped without raw stack or token output.

Browser configuration uses direct, complete Next.js references: `process.env.NEXT_PUBLIC_SUPABASE_URL` and `process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. It never enumerates or aliases `process.env` and no real key is documented.

- The browser-safe publishable key identifies the project; it is not an authorization boundary. Every user-owned exposed table must enable RLS.
- Service-role and secret keys must never enter browser code, `NEXT_PUBLIC_*`, Git, fixtures, screenshots, or logs.
- `.env.local` and other local environment files stay ignored. Database passwords and access tokens do not belong in this repository.
- `profiles`, `brews`, and `suggested_plans` grant SELECT/INSERT/UPDATE only to `authenticated`; `anon` receives no table privileges and no policy.
- Policies combine `TO authenticated` with `(select auth.uid())` ownership. UPDATE uses both `USING` and `WITH CHECK`, preventing ownership reassignment.
- UI visibility is not authorization. Future server and browser repositories must rely on RLS and still handle permission failures safely.
- Every future user-data table in an exposed schema requires an explicit privilege review and RLS before use.
- Soft delete is retention state, not anonymization. Account deletion needs a future authenticated server-side process that revokes sessions and handles retained data intentionally.
- No service-role client exists in Cloud 1. No raw secrets are logged.

The SQL RLS matrix is documented in `supabase/tests/rls.sql`. It has not been run against a remote project.

Confirmation resend uses the Supabase SDK rather than a hand-built Auth URL. The submitted email lives only in transient component state: it is not logged, persisted, stored in metadata, or added to query parameters. Passwords are removed when confirmation state begins. No arbitrary redirect URL is accepted.

Cloud 3-1 remote repositories derive ownership from `auth.getUser()` and also filter by `user_id`; callers cannot supply arbitrary owners. RLS remains authoritative. Updates and soft deletes filter by expected revision, and safe error codes replace raw PostgREST details. These repositories are not connected to App runtime.
