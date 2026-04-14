alter table public.trip_participants
add column if not exists response_reason text;

alter table public.trip_participants
add column if not exists responded_at timestamptz;
