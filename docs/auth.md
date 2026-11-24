# Authentication and Local Mode

CupMaster uses Better Auth for optional email and password sign-in. Next.js serves auth at `/api/auth/[...all]`. Better Auth stores users and sessions in Neon Postgres. Cloud data requests go to `/api/cloud/*` and derive ownership from the authenticated session. Signing in and signing out leave browser data intact.

## Local setup

1. Set `DATABASE_URL` to the Neon Postgres connection string in `.env.local`.
2. Set `BETTER_AUTH_SECRET` to a random secret of at least 32 bytes and set `BETTER_AUTH_URL=http://localhost:3000`.
3. Run `npm run db:migrate`. The initial SQL creates UUID auth tables and all six cloud data tables. The migration runner applies each file once and checks checksums on later runs.
4. Run `npm run dev` and open `/auth`. Signup uses the entered nickname and requires confirmation on the following screen. This phase creates an authenticated session immediately and email verification is deferred.

Credentials stay on the server. The cloud client forwards only authenticated same-origin requests. The account header detects an account switch in another tab. It never determines SQL ownership. Local Mode stays active even after copying data to the account from `/migration`.

To verify account isolation end to end, set `CUPMASTER_AUTH_TEST_URL=http://localhost:3000` with a local server running against a test Neon database and run `npm test -- src/infrastructure/cloud/cloud-isolation.integration.test.ts`. This creates two synthetic accounts and sample rows.
