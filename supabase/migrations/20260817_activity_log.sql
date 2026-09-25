create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  table_name text,
  record_id text,
  trip_id uuid,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists activity_logs_occurred_at_idx
  on public.activity_logs(occurred_at desc);

create index if not exists activity_logs_actor_user_id_idx
  on public.activity_logs(actor_user_id);

create index if not exists activity_logs_table_record_idx
  on public.activity_logs(table_name, record_id);

create index if not exists activity_logs_trip_id_idx
  on public.activity_logs(trip_id);

alter table public.activity_logs enable row level security;

drop policy if exists "No direct client access to activity logs" on public.activity_logs;
create policy "No direct client access to activity logs"
  on public.activity_logs
  for all
  using (false)
  with check (false);

create or replace function public.journi_activity_row_label(row_data jsonb)
returns text
language sql
stable
as $$
  select coalesce(
    nullif(row_data->>'title', ''),
    nullif(row_data->>'name', ''),
    nullif(row_data->>'full_name', ''),
    nullif(row_data->>'email', ''),
    nullif(row_data->>'provider', ''),
    nullif(left(row_data->>'body', 80), ''),
    nullif(row_data->>'status', ''),
    row_data->>'id',
    'record'
  );
$$;

create or replace function public.journi_activity_trip_id(row_data jsonb)
returns uuid
language plpgsql
stable
as $$
declare
  candidate text;
begin
  candidate := row_data->>'trip_id';

  if candidate is null or candidate = '' then
    return null;
  end if;

  return candidate::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create or replace function public.journi_log_row_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb;
  old_data jsonb;
  changed_keys text[];
  action_name text;
  row_label text;
  row_id text;
  related_trip_id uuid;
begin
  if tg_table_name = 'activity_logs' then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    row_data := to_jsonb(old);
    old_data := to_jsonb(old);
  else
    row_data := to_jsonb(new);
    old_data := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  end if;

  if tg_op = 'UPDATE' then
    select coalesce(array_agg(key order by key), array[]::text[])
      into changed_keys
      from (
        select key
        from jsonb_each(row_data)
        where row_data->key is distinct from old_data->key
      ) changed;

    if coalesce(array_length(changed_keys, 1), 0) = 0 then
      return new;
    end if;
  else
    changed_keys := array[]::text[];
  end if;

  action_name := lower(tg_table_name || '.' || tg_op);
  row_label := public.journi_activity_row_label(row_data);
  row_id := row_data->>'id';
  related_trip_id := case
    when tg_table_name = 'trips' then row_id::uuid
    else public.journi_activity_trip_id(row_data)
  end;

  insert into public.activity_logs (
    actor_user_id,
    action,
    table_name,
    record_id,
    trip_id,
    summary,
    metadata
  )
  values (
    auth.uid(),
    action_name,
    tg_table_name,
    row_id,
    related_trip_id,
    initcap(tg_op) || ' on ' || replace(tg_table_name, '_', ' ') || ': ' || row_label,
    jsonb_build_object(
      'operation', tg_op,
      'changed_keys', changed_keys,
      'new', case when tg_op = 'DELETE' then null else row_data end,
      'old', case when tg_op = 'INSERT' then null else old_data end
    )
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists journi_activity_trips on public.trips;
create trigger journi_activity_trips
  after insert or update or delete on public.trips
  for each row execute function public.journi_log_row_activity();

drop trigger if exists journi_activity_trip_participants on public.trip_participants;
create trigger journi_activity_trip_participants
  after insert or update or delete on public.trip_participants
  for each row execute function public.journi_log_row_activity();

drop trigger if exists journi_activity_hotels on public.hotels;
create trigger journi_activity_hotels
  after insert or update or delete on public.hotels
  for each row execute function public.journi_log_row_activity();

drop trigger if exists journi_activity_activities on public.activities;
create trigger journi_activity_activities
  after insert or update or delete on public.activities
  for each row execute function public.journi_log_row_activity();

drop trigger if exists journi_activity_transport on public.transport;
create trigger journi_activity_transport
  after insert or update or delete on public.transport
  for each row execute function public.journi_log_row_activity();

drop trigger if exists journi_activity_dining on public.dining;
create trigger journi_activity_dining
  after insert or update or delete on public.dining
  for each row execute function public.journi_log_row_activity();

drop trigger if exists journi_activity_payments on public.payments;
create trigger journi_activity_payments
  after insert or update or delete on public.payments
  for each row execute function public.journi_log_row_activity();

drop trigger if exists journi_activity_comments on public.comments;
create trigger journi_activity_comments
  after insert or update or delete on public.comments
  for each row execute function public.journi_log_row_activity();

drop trigger if exists journi_activity_polls on public.polls;
create trigger journi_activity_polls
  after insert or update or delete on public.polls
  for each row execute function public.journi_log_row_activity();

drop trigger if exists journi_activity_options on public.options;
create trigger journi_activity_options
  after insert or update or delete on public.options
  for each row execute function public.journi_log_row_activity();

drop trigger if exists journi_activity_poll_options on public.poll_options;
create trigger journi_activity_poll_options
  after insert or update or delete on public.poll_options
  for each row execute function public.journi_log_row_activity();

drop trigger if exists journi_activity_poll_votes on public.poll_votes;
create trigger journi_activity_poll_votes
  after insert or update or delete on public.poll_votes
  for each row execute function public.journi_log_row_activity();

drop trigger if exists journi_activity_images on public.images;
create trigger journi_activity_images
  after insert or update or delete on public.images
  for each row execute function public.journi_log_row_activity();

do $$
begin
  if to_regclass('public.notification_rules') is not null then
    drop trigger if exists journi_activity_notification_rules on public.notification_rules;
    create trigger journi_activity_notification_rules
      after insert or update or delete on public.notification_rules
      for each row execute function public.journi_log_row_activity();
  end if;
end $$;
