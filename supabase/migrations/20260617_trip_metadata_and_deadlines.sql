alter table public.trips
  add column if not exists trip_type_label text,
  add column if not exists audience_filter text,
  add column if not exists date_mode text not null default 'set_dates',
  add column if not exists voting_deadline timestamptz,
  add column if not exists group_size_band text,
  add column if not exists group_size_min integer,
  add column if not exists budget_mode text not null default 'per_person',
  add column if not exists budget_band text,
  add column if not exists budget_total numeric(10,2),
  add column if not exists budget_per_person_min numeric(10,2),
  add column if not exists budget_per_person_max numeric(10,2),
  add column if not exists ai_description_generated boolean not null default false;

create index if not exists trips_voting_deadline_idx
  on public.trips(voting_deadline);
