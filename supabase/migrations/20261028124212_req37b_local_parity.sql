-- REQ-37b local parity. Local Supabase only until separate cloud approval.
-- Verified on local Supabase with reset, two idempotent re-runs, SQL tests, and advisors.
-- Do not apply to any cloud project. See docs/project/batch-4-b-local-blocker.md.
-- Payloads are stored contracts, not model-registry/input validation rules.
-- Local Bean tombstones retain their full BeanRecord, including deletedAt and payload.
create table if not exists public.beans (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  payload jsonb not null,
  revision bigint not null default 1 check (revision >= 1),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz null,
  primary key (user_id, id),
  constraint beans_payload_shape_check check (jsonb_typeof(payload) = 'object'),
  constraint beans_payload_identity_check check (payload ? 'id' and payload ->> 'id' = id)
);

create table if not exists public.brew_preparations (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  payload jsonb null,
  revision bigint not null default 1 check (revision >= 1),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz null,
  primary key (user_id, id),
  constraint brew_preparations_payload_shape_check check (
    (payload is null and deleted_at is not null)
    or (payload is not null and jsonb_typeof(payload) = 'object' and payload ? 'id' and payload ->> 'id' = id)
  )
);

-- Preserves local library envelope metadata, including preparation redirects,
-- lineage, deletedIds and legacyImportReviewed only. Raw backups stay local.
create table if not exists public.library_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  revision bigint not null default 1 check (revision >= 1),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz null,
  constraint library_states_payload_shape_check check (jsonb_typeof(payload) = 'object')
);

alter table public.brews
  add column if not exists bean_id text null,
  add column if not exists source_preparation_id text null,
  add column if not exists legacy_preparation_id text null,
  add column if not exists applied_adjustment jsonb null,
  add column if not exists applied_adjustment_present boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.brews'::regclass and conname = 'brews_owner_bean_fk') then
    alter table public.brews add constraint brews_owner_bean_fk
      -- Deferred checks do not span PostgREST requests; push Beans before Brews.
      foreign key (user_id, bean_id) references public.beans(user_id, id)
      on delete restrict deferrable initially deferred;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.brews'::regclass and conname = 'brews_applied_adjustment_shape_check') then
    alter table public.brews add constraint brews_applied_adjustment_shape_check
      check (applied_adjustment is null or jsonb_typeof(applied_adjustment) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.brews'::regclass and conname = 'brews_applied_adjustment_presence_check') then
    alter table public.brews add constraint brews_applied_adjustment_presence_check
      check (applied_adjustment is null or applied_adjustment_present);
  end if;
end;
$$;

-- Primary keys begin with user_id and already index the owner predicate.
create index if not exists beans_user_updated_idx on public.beans(user_id, updated_at desc);
create index if not exists beans_active_idx on public.beans(user_id) where deleted_at is null;
create index if not exists brew_preparations_user_updated_idx on public.brew_preparations(user_id, updated_at desc);
create index if not exists brew_preparations_active_idx on public.brew_preparations(user_id) where deleted_at is null;
create index if not exists brews_owner_bean_idx on public.brews(user_id, bean_id);
create index if not exists brews_source_preparation_idx on public.brews(user_id, source_preparation_id);

alter table public.beans enable row level security;
alter table public.brew_preparations enable row level security;
alter table public.library_states enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['beans', 'brew_preparations', 'library_states'] loop
    if not exists (select 1 from pg_trigger where tgrelid = format('public.%I', table_name)::regclass and tgname = table_name || '_set_updated_at' and not tgisinternal) then
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', table_name || '_set_updated_at', table_name);
    end if;
    if not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = table_name and p.policyname = table_name || '_select_own') then
      execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', table_name || '_select_own', table_name);
    end if;
    if not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = table_name and p.policyname = table_name || '_insert_own') then
      execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', table_name || '_insert_own', table_name);
    end if;
    if not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = table_name and p.policyname = table_name || '_update_own') then
      execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', table_name || '_update_own', table_name);
    end if;
  end loop;
end;
$$;

revoke all on table public.beans, public.brew_preparations, public.library_states from anon;
revoke all on table public.beans, public.brew_preparations, public.library_states from authenticated;
grant select, insert, update on table public.beans, public.brew_preparations, public.library_states to authenticated;
