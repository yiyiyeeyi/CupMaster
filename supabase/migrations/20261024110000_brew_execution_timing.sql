-- Preserve sub-second pauses while completed total time remains integer seconds.
alter table public.brews
  alter column accumulated_pause_seconds type numeric using accumulated_pause_seconds::numeric,
  add column execution_run integer null check (execution_run is null or execution_run > 0),
  add column current_stage_paused_seconds numeric null check (current_stage_paused_seconds is null or current_stage_paused_seconds >= 0);
