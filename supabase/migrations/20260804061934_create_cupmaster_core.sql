-- CupMaster Cloud 1 core schema. Contains no users, secrets, or fixture data.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  experience_level text not null,
  selected_needs text[] not null default '{}',
  onboarding_completed boolean not null default false,
  preferences jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz null,
  constraint profiles_display_name_check check (length(btrim(display_name)) between 2 and 40),
  constraint profiles_experience_level_check check (experience_level in ('beginner', 'developing', 'intermediate', 'advanced')),
  constraint profiles_selected_needs_check check (selected_needs <@ array['gear_guidance', 'learn_basics', 'improve_consistency', 'find_recipe_for_bean', 'track_and_compare', 'improve_flavor']::text[]),
  constraint profiles_revision_check check (revision >= 1),
  constraint profiles_preferences_object_check check (jsonb_typeof(preferences) = 'object')
);

-- Created before suggested_plans so the cyclic Plan reference is added later.
create table public.brews (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_recipe_id text not null,
  execution_status text not null,
  record_status text not null,
  feedback_status text not null,
  analysis_status text not null,
  source_type text not null,
  source_suggested_plan_id text null,
  source_brew_id text null,
  source_analysis_id text null,
  source_recommendation_id text null,
  source_fingerprint text null,
  recipe_snapshot jsonb not null,
  brew_plan jsonb not null,
  stage_results jsonb not null default '[]'::jsonb,
  flavor_feedback jsonb null,
  record_details jsonb null,
  analysis jsonb null,
  analysis_attempt jsonb null,
  suggested_plan_handoff jsonb null,
  quick_rating text null,
  current_stage_order integer not null default 0,
  accumulated_pause_seconds integer not null default 0,
  actual_total_time_seconds integer null,
  actual_total_water numeric null,
  started_at timestamptz null,
  current_stage_started_at timestamptz null,
  paused_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  revision bigint not null default 1,
  deleted_at timestamptz null,
  constraint brews_id_user_unique unique (id, user_id),
  constraint brews_execution_status_check check (execution_status in ('not_started', 'in_progress', 'paused', 'completed', 'abandoned')),
  constraint brews_record_status_check check (record_status in ('draft', 'saved', 'archived')),
  constraint brews_feedback_status_check check (feedback_status in ('not_requested', 'awaiting_feedback', 'completed', 'skipped')),
  constraint brews_analysis_status_check check (analysis_status in ('not_requested', 'pending', 'completed', 'failed')),
  constraint brews_source_type_check check (source_type in ('recipe', 'suggested_plan', 'previous_brew', 'manual')),
  constraint brews_quick_rating_check check (quick_rating is null or quick_rating in ('liked', 'neutral', 'disliked', 'skipped')),
  constraint brews_stage_results_array_check check (jsonb_typeof(stage_results) = 'array'),
  constraint brews_current_stage_order_check check (current_stage_order >= 0),
  constraint brews_pause_seconds_check check (accumulated_pause_seconds >= 0),
  constraint brews_actual_time_check check (actual_total_time_seconds is null or actual_total_time_seconds >= 0),
  constraint brews_actual_water_check check (actual_total_water is null or actual_total_water >= 0),
  constraint brews_revision_check check (revision >= 1),
  constraint brews_suggested_source_check check (source_type <> 'suggested_plan' or source_suggested_plan_id is not null),
  constraint brews_recipe_handoff_check check (source_type <> 'recipe' or suggested_plan_handoff is null)
);

create table public.suggested_plans (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_brew_id text not null,
  source_analysis_id text not null,
  source_recommendation_id text not null,
  source_fingerprint text not null,
  source_analysis_generated_at timestamptz not null,
  title text not null,
  status text not null,
  base_recipe_snapshot jsonb not null,
  adjustments jsonb not null,
  rationale text not null,
  confidence text not null,
  evidence jsonb not null,
  keep_unchanged text[] not null,
  resulting_brew_id text null,
  used_at timestamptz null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  revision bigint not null default 1,
  deleted_at timestamptz null,
  constraint suggested_plans_id_user_unique unique (id, user_id),
  constraint suggested_plans_status_check check (status in ('draft', 'used')),
  constraint suggested_plans_confidence_check check (confidence in ('low', 'medium', 'high')),
  constraint suggested_plans_adjustments_check check (jsonb_typeof(adjustments) = 'array' and jsonb_array_length(adjustments) = 1),
  constraint suggested_plans_evidence_array_check check (jsonb_typeof(evidence) = 'array'),
  constraint suggested_plans_revision_check check (revision >= 1),
  constraint suggested_plans_v2_lifecycle_check check ((status = 'draft' and used_at is null) or (status = 'used' and resulting_brew_id is not null and used_at is not null)),
  constraint suggested_plans_source_brew_fk foreign key (source_brew_id, user_id) references public.brews(id, user_id) on delete restrict deferrable initially deferred,
  constraint suggested_plans_resulting_brew_fk foreign key (resulting_brew_id, user_id) references public.brews(id, user_id) on delete restrict deferrable initially deferred
);

alter table public.brews add constraint brews_source_suggested_plan_fk
  foreign key (source_suggested_plan_id, user_id) references public.suggested_plans(id, user_id)
  on delete restrict deferrable initially deferred;

create index brews_user_id_idx on public.brews(user_id);
create index brews_user_updated_idx on public.brews(user_id, updated_at desc);
create index brews_user_execution_idx on public.brews(user_id, execution_status);
create index brews_user_record_idx on public.brews(user_id, record_status);
create index brews_user_completed_idx on public.brews(user_id, completed_at desc);
create index brews_source_suggested_plan_idx on public.brews(source_suggested_plan_id);
create index brews_active_idx on public.brews(user_id) where deleted_at is null;
create unique index brews_one_result_per_plan_idx on public.brews(user_id, source_suggested_plan_id) where source_suggested_plan_id is not null and deleted_at is null;

create index suggested_plans_user_id_idx on public.suggested_plans(user_id);
create index suggested_plans_user_updated_idx on public.suggested_plans(user_id, updated_at desc);
create index suggested_plans_source_brew_idx on public.suggested_plans(source_brew_id);
create index suggested_plans_resulting_brew_idx on public.suggested_plans(resulting_brew_id);
create index suggested_plans_source_analysis_idx on public.suggested_plans(source_analysis_id);
create index suggested_plans_source_recommendation_idx on public.suggested_plans(source_recommendation_id);
create index suggested_plans_active_idx on public.suggested_plans(user_id) where deleted_at is null;
create unique index suggested_plans_one_plan_per_result_idx on public.suggested_plans(user_id, resulting_brew_id) where resulting_brew_id is not null and deleted_at is null;
create unique index suggested_plans_deduplication_idx on public.suggested_plans(user_id, source_analysis_id, source_recommendation_id, source_fingerprint) where deleted_at is null;

create function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger brews_set_updated_at before update on public.brews for each row execute function public.set_updated_at();
create trigger suggested_plans_set_updated_at before update on public.suggested_plans for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.brews enable row level security;
alter table public.suggested_plans enable row level security;

create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "brews_select_own" on public.brews for select to authenticated using ((select auth.uid()) = user_id);
create policy "brews_insert_own" on public.brews for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "brews_update_own" on public.brews for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "suggested_plans_select_own" on public.suggested_plans for select to authenticated using ((select auth.uid()) = user_id);
create policy "suggested_plans_insert_own" on public.suggested_plans for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "suggested_plans_update_own" on public.suggested_plans for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on table public.profiles, public.brews, public.suggested_plans from anon;
revoke all on table public.profiles, public.brews, public.suggested_plans from authenticated;
grant select, insert, update on table public.profiles, public.brews, public.suggested_plans to authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
