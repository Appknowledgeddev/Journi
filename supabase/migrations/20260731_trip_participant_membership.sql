alter table public.trip_participants
  add column if not exists membership_status text not null default 'invited',
  add column if not exists attendance_status text,
  add column if not exists request_message text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

update public.trip_participants
set membership_status = case
  when status = 'accepted' then 'active'
  when status = 'declined' then 'declined'
  when status = 'pending' then 'pending_approval'
  when status = 'linked' then 'invited'
  when status = 'removed' then 'removed'
  else 'invited'
end
where membership_status is null
  or membership_status = 'invited';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'trip_participants_membership_status_check'
  ) then
    alter table public.trip_participants
      add constraint trip_participants_membership_status_check
      check (membership_status in ('invited', 'pending_approval', 'active', 'declined', 'removed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'trip_participants_attendance_status_check'
  ) then
    alter table public.trip_participants
      add constraint trip_participants_attendance_status_check
      check (attendance_status is null or attendance_status in ('going', 'maybe', 'not_going'));
  end if;
end $$;

create index if not exists trip_participants_membership_status_idx
  on public.trip_participants(trip_id, membership_status);
