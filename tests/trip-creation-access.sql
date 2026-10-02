-- Run after the migration. All test accounts and trips are rolled back.
begin;
do $$
declare
  actor uuid := gen_random_uuid();
  other_actor uuid := gen_random_uuid();
  trip uuid;
  pass_id text := 'test_pass_' || gen_random_uuid()::text;
begin
  insert into auth.users(id) values(actor),(other_actor);
  execute 'set local role service_role';
  trip := public.create_trip_with_access(actor, '{"title":"Quota test","status":"draft"}', 'free', null);
  begin
    perform public.create_trip_with_access(actor, '{"title":"Must fail"}', 'free', null);
    raise exception 'TEST_FAILED: second free trip allowed';
  exception when raise_exception then
    if sqlerrm <> 'FREE_TRIP_LIMIT' then raise; end if;
  end;
  delete from public.trips where id=trip;
  begin
    perform public.create_trip_with_access(actor, '{"title":"Must still fail"}', 'free', null);
    raise exception 'TEST_FAILED: deletion reset free allowance';
  exception when raise_exception then
    if sqlerrm <> 'FREE_TRIP_LIMIT' then raise; end if;
  end;
  perform public.create_trip_with_access(actor, '{"title":"Paid test"}', 'trip_pass', pass_id);
  begin
    perform public.create_trip_with_access(other_actor, '{"title":"Reused pass"}', 'trip_pass', pass_id);
    raise exception 'TEST_FAILED: pass reused';
  exception when raise_exception then
    if sqlerrm <> 'TRIP_PASS_ALREADY_USED' then raise; end if;
  end;
  perform public.create_trip_with_access(actor, '{"title":"Pro test 1"}', 'subscription', null);
  perform public.create_trip_with_access(actor, '{"title":"Pro test 2"}', 'subscription', null);
  begin
    perform public.create_trip_with_access(other_actor, '{"title":null}', 'free', null);
    raise exception 'TEST_FAILED: invalid title saved';
  exception when not_null_violation then null;
  end;
  if exists(select 1 from public.trip_creation_ledger where owner_id=other_actor) then raise exception 'TEST_FAILED: failed insert spent allowance'; end if;
  trip := public.create_trip_with_access(other_actor, '{"title":"Rollback test"}', 'free', null);
  perform public.rollback_trip_creation(trip,other_actor);
  perform public.create_trip_with_access(other_actor, '{"title":"Restored after failed save"}', 'free', null);
  if has_function_privilege('authenticated','public.create_trip_with_access(uuid,jsonb,text,text)','execute') then raise exception 'TEST_FAILED: client can mint grants'; end if;
  if has_function_privilege('authenticated','public.rollback_trip_creation(uuid,uuid)','execute') then raise exception 'TEST_FAILED: client can restore grants'; end if;
  if has_table_privilege('authenticated','public.trips','insert') then raise exception 'TEST_FAILED: direct inserts allowed'; end if;
end $$;
select 'PASS: one free trip, deletion persistence, single-use pass, Pro, rollback and client permissions' as result;

rollback;
