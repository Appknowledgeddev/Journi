create table if not exists public.notification_rules (
  id text primary key,
  title text not null,
  trigger_key text not null,
  audience text not null,
  channel text not null default 'Email',
  send_timing text not null,
  subject text not null,
  body text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_rules_enabled_idx
  on public.notification_rules(enabled);

create index if not exists notification_rules_trigger_key_idx
  on public.notification_rules(trigger_key);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notification_rules_channel_check'
  ) then
    alter table public.notification_rules
      add constraint notification_rules_channel_check
      check (channel in ('Email', 'In-app', 'Email + In-app'));
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.journi_log_row_activity()') is not null then
    drop trigger if exists journi_activity_notification_rules on public.notification_rules;
    create trigger journi_activity_notification_rules
      after insert or update or delete on public.notification_rules
      for each row execute function public.journi_log_row_activity();
  end if;
end $$;
