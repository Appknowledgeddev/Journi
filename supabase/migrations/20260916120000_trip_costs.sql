-- Planned costs and recorded bill splits are separate from payment transactions.
create table if not exists public.trip_costs (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  category text not null check (category in ('hotel','activity','transport','dining','other')),
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 999999999),
  currency text not null default 'GBP' check (currency = 'GBP'),
  kind text not null check (kind in ('planned','bill')),
  notes text not null default '' check (char_length(notes) <= 2000),
  paid_by jsonb,
  shares jsonb not null default '[]'::jsonb check (jsonb_typeof(shares) = 'array'),
  split_method text not null default 'equal' check (split_method in ('equal','custom')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'planned' and paid_by is null and jsonb_array_length(shares) = 0)
    or (kind = 'bill' and paid_by is not null and jsonb_typeof(paid_by) = 'object' and jsonb_array_length(shares) > 0))
);
create index if not exists trip_costs_trip_created_idx on public.trip_costs(trip_id, created_at desc);
alter table public.trip_costs enable row level security;
-- The authenticated API authorises membership and calculates shares server-side.
revoke all on public.trip_costs from anon, authenticated;
grant select, insert, update, delete on public.trip_costs to service_role;
