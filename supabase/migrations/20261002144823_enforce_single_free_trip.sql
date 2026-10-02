-- A grant survives trip deletion: deleting a trip does not renew a free allowance
-- or make a paid Checkout Session reusable. Only the server can issue grants.
create table public.trip_creation_ledger (
  trip_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  access_kind text not null check (access_kind in ('free', 'trip_pass', 'subscription', 'legacy')),
  checkout_session_id text unique,
  created_at timestamptz not null default now(),
  check ((access_kind = 'trip_pass') = (checkout_session_id is not null))
);
create unique index trip_creation_one_free_per_owner on public.trip_creation_ledger(owner_id) where access_kind = 'free';
create index trip_creation_ledger_owner on public.trip_creation_ledger(owner_id);
alter table public.trip_creation_ledger enable row level security;
revoke all on public.trip_creation_ledger from public, anon, authenticated;
grant all on public.trip_creation_ledger to service_role;

lock table public.trips in share row exclusive mode;
insert into public.trip_creation_ledger(trip_id, owner_id, access_kind, created_at)
select id, owner_id, case when row_number() over (partition by owner_id order by created_at, id) = 1 then 'free' else 'legacy' end, created_at
from public.trips where owner_id is not null;

-- Also guard legacy server insertion paths. Client inserts must use the API so
-- paid access can be verified with Stripe instead of trusting user metadata.
revoke insert on public.trips from public, anon, authenticated;
create function public.guard_trip_creation_access() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.owner_id is null then raise exception 'TRIP_OWNER_REQUIRED'; end if;
  if exists (select 1 from public.trip_creation_ledger where trip_id = new.id and owner_id = new.owner_id) then return new; end if;
  begin
    insert into public.trip_creation_ledger(trip_id,owner_id,access_kind) values(new.id,new.owner_id,'free');
  exception when unique_violation then
    raise exception 'FREE_TRIP_LIMIT' using errcode = 'P0001';
  end;
  return new;
end;
$$;
revoke all on function public.guard_trip_creation_access() from public, anon, authenticated;
create trigger guard_trip_creation_access before insert on public.trips for each row execute function public.guard_trip_creation_access();

create function public.create_trip_with_access(p_owner_id uuid, p_trip jsonb, p_access text default 'free', p_checkout_session_id text default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  trip_id uuid := gen_random_uuid();
  payload jsonb;
  columns_sql text;
begin
  if p_access not in ('free','trip_pass','subscription') then raise exception 'INVALID_TRIP_ACCESS'; end if;
  -- Unique indexes make free allowances and paid passes single-use even when
  -- two requests arrive at the same time. The entire function is atomic.
  begin
    insert into public.trip_creation_ledger(trip_id,owner_id,access_kind,checkout_session_id)
    values(trip_id,p_owner_id,p_access,p_checkout_session_id);
  exception when unique_violation then
    if p_access = 'trip_pass' then raise exception 'TRIP_PASS_ALREADY_USED' using errcode = 'P0001'; end if;
    raise exception 'FREE_TRIP_LIMIT' using errcode = 'P0001';
  end;
  payload := p_trip || jsonb_build_object('id',trip_id,'owner_id',p_owner_id);
  -- Retain compatibility with installations that don't yet have every optional
  -- organiser column, while keeping database defaults for omitted fields.
  select string_agg(format('%I', key), ', ' order by key) into columns_sql
  from jsonb_object_keys(payload) as fields(key)
  join pg_catalog.pg_attribute a on a.attrelid = 'public.trips'::regclass and a.attname = key and a.attnum > 0 and not a.attisdropped;
  execute format('insert into public.trips (%s) select %s from jsonb_populate_record(null::public.trips, $1)', columns_sql, columns_sql) using payload;
  return trip_id;
end;
$$;
revoke all on function public.create_trip_with_access(uuid,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.create_trip_with_access(uuid,jsonb,text,text) to service_role;

-- Only a failed server-side creation may return its allowance, never a normal
-- deletion requested by a user. Deleting both records is one transaction.
create function public.rollback_trip_creation(p_trip_id uuid, p_owner_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.trips where id=p_trip_id and owner_id=p_owner_id;
  delete from public.trip_creation_ledger where trip_id=p_trip_id and owner_id=p_owner_id;
end;
$$;
revoke all on function public.rollback_trip_creation(uuid,uuid) from public, anon, authenticated;
grant execute on function public.rollback_trip_creation(uuid,uuid) to service_role;
