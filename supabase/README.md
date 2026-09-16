# CupMaster Supabase workflow

Cloud 1 defines the local migration contract only. It does not replace LocalStorage repositories and has not pushed schema or data to a remote project.

Commands:

```sh
npx supabase --version
npx supabase migration list
npx supabase gen types typescript --project-id "$SUPABASE_PROJECT_REF" --schema public
```

The checked-in `src/types/database.types.ts` is provisional and mirrors the migration. After an approved migration push, regenerate it with the CLI and review the diff. Do not run `db push`, `db reset`, or `migration repair` without explicit approval.

RLS verification is documented in `tests/rls.sql`. It requires a disposable local stack and is not intended for a production database.
