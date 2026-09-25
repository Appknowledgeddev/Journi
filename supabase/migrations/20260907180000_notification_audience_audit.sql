create table if not exists public.notification_audience_evaluations (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.notification_batches(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  email text,
  name text,
  connection_type text not null,
  membership_status text,
  selected boolean not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists notification_audience_batch_idx on public.notification_audience_evaluations(batch_id);
alter table public.notification_audience_evaluations enable row level security;
revoke all on table public.notification_audience_evaluations from anon, authenticated;
