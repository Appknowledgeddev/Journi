create table public.trip_expense_receipts (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  expense_id uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  name text not null check (char_length(name) between 1 and 180),
  size integer not null check (size > 0 and size <= 10485760),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  foreign key (expense_id, trip_id) references public.trip_costs(id, trip_id) on delete cascade
);
create index trip_expense_receipts_trip_idx on public.trip_expense_receipts(trip_id, expense_id);
alter table public.trip_expense_receipts enable row level security;
revoke all on public.trip_expense_receipts from anon, authenticated;
grant select, insert, update, delete on public.trip_expense_receipts to service_role;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('expense-receipts', 'expense-receipts', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf']);
