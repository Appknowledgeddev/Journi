alter table public.notification_actions
  add column if not exists suppress_email_when_active boolean not null default true;

alter table public.notification_actions
  add column if not exists active_window_minutes integer not null default 5
  check (active_window_minutes between 1 and 120);

create table if not exists public.user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  current_path text,
  updated_at timestamptz not null default now()
);

alter table public.user_presence enable row level security;
revoke all on table public.user_presence from anon, authenticated;
