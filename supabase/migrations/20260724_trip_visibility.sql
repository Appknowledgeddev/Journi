alter table public.trips
  add column if not exists visibility text not null default 'private';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'trips_visibility_check'
  ) then
    alter table public.trips
      add constraint trips_visibility_check check (visibility in ('private', 'public'));
  end if;
end $$;

create index if not exists trips_public_visibility_idx
  on public.trips (visibility, status, created_at);
