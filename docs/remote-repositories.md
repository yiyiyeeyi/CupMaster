# Remote repositories

Cloud 3-1 implements asynchronous Supabase repositories for Profile, Brew, and Suggested Plan. Cloud 3-2 exposes them only through the repository composition root.

The authenticated factory uses the lazy browser client and `auth.getUser()`, accepts no caller user ID, and does not initialize at module import. Missing configuration and unauthenticated sessions return safe availability results while runtime remains Local. The Migration bundle only assembles dependencies and performs no application data operation.

Cloud 4-2 minimally adds tombstone-aware migration reads. `CloudMigrationRemoteGateway` composes create, revision-aware patch, active-list verification, and safe errors. Ordinary UI still never selects Remote repositories for runtime persistence.

Remote CRUD remains revision-aware and RLS-scoped. Product routes do not select it after sign-in, and its presence does not mean user data has migrated or synchronized.
