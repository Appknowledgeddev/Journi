-- Manual payment records linked to a trip expense; no payment processing.
alter table public.trip_costs add constraint trip_costs_id_trip_unique unique (id, trip_id);
create table public.trip_expense_payments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  expense_id uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  label text not null check (char_length(label) between 1 and 160),
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 999999999),
  currency text not null default 'GBP' check (currency = 'GBP'),
  payer jsonb not null check (jsonb_typeof(payer) = 'object'),
  status text not null default 'due' check (status in ('due', 'paid')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (expense_id, trip_id) references public.trip_costs(id, trip_id) on delete cascade,
  check ((status = 'paid' and paid_at is not null) or (status = 'due' and paid_at is null))
);
create index trip_expense_payments_trip_idx on public.trip_expense_payments(trip_id, created_at desc);
create index trip_expense_payments_expense_idx on public.trip_expense_payments(expense_id);
alter table public.trip_expense_payments enable row level security;
revoke all on public.trip_expense_payments from anon, authenticated;
grant select, insert, update, delete on public.trip_expense_payments to service_role;
