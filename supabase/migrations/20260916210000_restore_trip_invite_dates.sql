begin;
-- Restore the invite date fields defined by the original trip metadata migration.
alter table public.trips
  add column if not exists date_mode text not null default 'set_dates',
  add column if not exists voting_deadline timestamptz;
create index if not exists trips_voting_deadline_idx on public.trips(voting_deadline);
notify pgrst, 'reload schema';
commit;
