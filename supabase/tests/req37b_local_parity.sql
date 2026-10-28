-- Disposable local stack only: supabase db query --local --file <this file>.
-- Not executed yet: local startup blocked. This is a verification draft.
-- All fixtures and writes are rolled back, including local Auth users.
begin;
insert into auth.users(id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');
insert into public.beans(user_id,id,payload) values
  ('11111111-1111-4111-8111-111111111111','shared-id','{"id":"shared-id"}'),
  ('22222222-2222-4222-8222-222222222222','shared-id','{"id":"shared-id"}'),
  ('22222222-2222-4222-8222-222222222222','b-only','{"id":"b-only"}');
insert into public.brew_preparations(user_id,id,payload) values
  ('22222222-2222-4222-8222-222222222222','b-plan','{"id":"b-plan"}');
insert into public.library_states(user_id,payload) values
  ('22222222-2222-4222-8222-222222222222','{}');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set constraints brews_owner_bean_fk immediate;
do $$
declare n integer;
begin
  select count(*) into n from public.beans;
  if n <> 1 then raise exception 'RLS exposed another owner Bean'; end if;
  if exists(select 1 from public.brew_preparations) or exists(select 1 from public.library_states) then
    raise exception 'RLS exposed another owner library';
  end if;
  insert into public.brew_preparations(user_id,id,payload) values
    ('11111111-1111-4111-8111-111111111111','a-plan','{"id":"a-plan"}');
  insert into public.brew_preparations(user_id,id,payload,deleted_at) values
    ('11111111-1111-4111-8111-111111111111','a-deleted',null,now());
  insert into public.library_states(user_id,payload) values
    ('11111111-1111-4111-8111-111111111111','{"legacyImportReviewed":true}');
  update public.library_states set revision=revision+1 where user_id=auth.uid();
  if not found then raise exception 'Owner could not update library state'; end if;
  update public.beans set revision=revision+1 where user_id='22222222-2222-4222-8222-222222222222';
  if found then raise exception 'Owner updated another owner Bean'; end if;
  begin
    insert into public.beans(user_id,id,payload) values
      ('22222222-2222-4222-8222-222222222222','forbidden','{"id":"forbidden"}');
    raise exception 'Cross-owner insert unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    update public.beans set user_id='22222222-2222-4222-8222-222222222222' where id='shared-id';
    raise exception 'Owner reassignment unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.brews(id,user_id,source_recipe_id,execution_status,record_status,feedback_status,analysis_status,source_type,recipe_snapshot,brew_plan,created_at,updated_at,bean_id)
    values ('req37b-forbidden-brew',auth.uid(),'test','completed','saved','not_requested','not_requested','recipe','{}','{}',now(),now(),'b-only');
    raise exception 'Cross-owner Bean FK unexpectedly succeeded';
  exception when foreign_key_violation then null; end;
  insert into public.brews(id,user_id,source_recipe_id,execution_status,record_status,feedback_status,analysis_status,source_type,recipe_snapshot,brew_plan,created_at,updated_at,bean_id)
  values ('req37b-own-brew',auth.uid(),'test','completed','saved','not_requested','not_requested','recipe','{}','{}',now(),now(),'shared-id');
  update public.beans set deleted_at=now(),revision=revision+1 where id='shared-id';
  if not exists(select 1 from public.brews where id='req37b-own-brew') then raise exception 'Soft deletion removed Brew'; end if;
  begin
    delete from public.beans where id='shared-id';
    raise exception 'Hard delete unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end;
$$;

reset role;
set local role anon;
do $$
begin
  begin perform 1 from public.beans; raise exception 'Anon read unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.brew_preparations; raise exception 'Anon preparation read unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.library_states; raise exception 'Anon state read unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
select 'REQ37b local owner isolation, tombstones, grants and composite FK passed' as result;
rollback;
