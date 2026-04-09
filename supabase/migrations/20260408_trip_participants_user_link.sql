alter table public.trip_participants
add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists trip_participants_user_id_idx
  on public.trip_participants(user_id);
