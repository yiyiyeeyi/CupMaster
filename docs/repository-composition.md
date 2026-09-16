# Repository composition

Cloud 3-2 introduces one composition root at `src/infrastructure/repositories/repository-composition.ts`. Authentication and persistence selection are independent: `authMode` may be `local` or `authenticated`, while `RUNTIME_REPOSITORY_MODE` remains the compile-time literal `local` until explicit migration succeeds in a later Cloud phase.

`createLocalRepositoryBundle()` constructs Profile, Brew, Suggested Plan, and Recipe repositories without reading LocalStorage at import or construction time. `getRuntimeRepositoryBundle()` always returns this Local bundle; environment variables, login state, development mode, URL parameters, and browser flags cannot switch it.

`createAuthenticatedRemoteRepositoryBundle()` lazily obtains the publishable-key browser client and verifies the current user through `auth.getUser()`. The caller cannot supply a user ID. Missing environment returns `migration_unavailable`; no user returns `unauthenticated`. Both leave Local Mode intact.

`createMigrationRepositoryBundle()` returns `{ local, remote, authenticatedUserId }` after authentication. It performs no LocalStorage read, application-table query, remote write, checkpoint creation, migration, or sync. Existing product components still contain some direct Local repository construction; consolidating those call sites is documented debt, not a runtime change for Cloud 3-2.

Cloud 4-2 consumes this bundle only after Start Migration. The application service—not components—orders reads, writes, patches, checkpoints, and verification. `getRuntimeRepositoryBundle()` remains Local after completion.
