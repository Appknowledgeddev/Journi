create table if not exists public.trip_participants (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  inviter_id uuid references auth.users(id) on delete set null,
  email text not null,
  full_name text,
  role text not null default 'traveller',
  status text not null default 'invited',
  invited_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, email)
);

create index if not exists trip_participants_trip_id_idx
  on public.trip_participants(trip_id);

create index if not exists trip_participants_email_idx
  on public.trip_participants(email);

alter table public.trip_participants enable row level security;

create policy "Users can view participants on own trips"
on public.trip_participants
for select
using (
  exists (
    select 1
    from public.trips
    where public.trips.id = trip_participants.trip_id
      and public.trips.owner_id = auth.uid()
  )
);

create policy "Users can invite participants on own trips"
on public.trip_participants
for insert
with check (
  exists (
    select 1
    from public.trips
    where public.trips.id = trip_participants.trip_id
      and public.trips.owner_id = auth.uid()
  )
  and inviter_id = auth.uid()
);

create policy "Users can update participants on own trips"
on public.trip_participants
for update
using (
  exists (
    select 1
    from public.trips
    where public.trips.id = trip_participants.trip_id
      and public.trips.owner_id = auth.uid()
  )
);

create policy "Users can delete participants on own trips"
on public.trip_participants
for delete
using (
  exists (
    select 1
    from public.trips
    where public.trips.id = trip_participants.trip_id
      and public.trips.owner_id = auth.uid()
  )
);
