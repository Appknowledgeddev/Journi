create table if not exists public.options (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  category text not null,
  title text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title text not null,
  description text,
  allows_multiple boolean not null default true,
  closes_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid references public.options(id) on delete set null,
  label text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  poll_option_id uuid not null references public.poll_options(id) on delete cascade,
  voter_id uuid references auth.users(id) on delete set null,
  voter_name text,
  created_at timestamptz not null default now(),
  unique (poll_id, poll_option_id, voter_id)
);

create index if not exists options_trip_id_idx on public.options(trip_id);
create index if not exists polls_trip_id_idx on public.polls(trip_id);
create index if not exists poll_options_poll_id_idx on public.poll_options(poll_id);
create index if not exists poll_votes_poll_id_idx on public.poll_votes(poll_id);
