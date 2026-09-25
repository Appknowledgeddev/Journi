create table if not exists public.notification_actions (
  action_key text primary key,
  label text not null,
  category text not null,
  enabled boolean not null default true,
  send_push boolean not null default true,
  send_email boolean not null default false,
  recipient_types text[] not null default array['active_participants']::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_batches (
  id uuid primary key default gen_random_uuid(),
  action_key text not null,
  trip_id uuid references public.trips(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'processing' check (status in ('processing','completed','partial','failed','skipped')),
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.notification_batches(id) on delete cascade,
  recipient_user_id uuid references auth.users(id) on delete set null,
  recipient_email text,
  recipient_name text,
  recipient_type text not null,
  channel text not null check (channel in ('push','email')),
  status text not null check (status in ('sent','failed','skipped')),
  subject text,
  message text,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  recipient_email text,
  trip_id uuid references public.trips(id) on delete cascade,
  batch_id uuid references public.notification_batches(id) on delete set null,
  action_key text not null,
  title text not null,
  message text not null,
  action_url text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (user_id is not null or recipient_email is not null)
);

create index if not exists notification_batches_created_at_idx on public.notification_batches(created_at desc);
create index if not exists notification_deliveries_batch_id_idx on public.notification_deliveries(batch_id);
create index if not exists user_notifications_user_created_idx on public.user_notifications(user_id,created_at desc);
alter table public.notification_actions enable row level security;
alter table public.notification_batches enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.user_notifications enable row level security;
revoke all on table public.notification_actions, public.notification_batches, public.notification_deliveries from anon, authenticated;
grant select, update on table public.user_notifications to authenticated;
drop policy if exists "Users read own notifications" on public.user_notifications;
create policy "Users read own notifications" on public.user_notifications for select using (user_id = auth.uid() or lower(recipient_email) = lower(auth.jwt() ->> 'email'));
drop policy if exists "Users update own notifications" on public.user_notifications;
create policy "Users update own notifications" on public.user_notifications for update using (user_id = auth.uid() or lower(recipient_email) = lower(auth.jwt() ->> 'email')) with check (user_id = auth.uid() or lower(recipient_email) = lower(auth.jwt() ->> 'email'));

insert into public.notification_actions (action_key,label,category,send_push,send_email,recipient_types) values
('chat.message_sent','Message sent in chat','Chat',true,false,array['organiser','active_participants']),
('chat.reply_sent','Reply sent in chat','Chat',true,false,array['organiser','active_participants']),
('vote.cast','Vote cast or changed','Voting',true,false,array['organiser','active_participants']),
('vote.removed','Vote removed','Voting',true,false,array['organiser','active_participants']),
('participant.invited','Participant invited','Participants',true,true,array['invited_participant']),
('participant.accepted','Participant accepted invite','Participants',true,true,array['organiser']),
('participant.declined','Participant declined invite','Participants',true,true,array['organiser']),
('participant.approved','Participant approved','Participants',true,true,array['affected_participant']),
('participant.removed','Participant removed','Participants',true,true,array['affected_participant']),
('membership.requested','Membership requested','Membership',true,true,array['organiser']),
('membership.approved','Membership approved','Membership',true,true,array['affected_participant']),
('membership.declined','Membership declined','Membership',true,true,array['affected_participant']),
('trip.created','Trip created','Trips',false,false,array['organiser']),
('trip.updated','Trip details updated','Trips',true,false,array['active_participants']),
('trip.published','Trip published','Trips',true,true,array['active_participants','invited_participants']),
('trip.cancelled','Trip cancelled','Trips',true,true,array['active_participants','invited_participants']),
('planning.option_added','Planning option added','Planning',true,false,array['active_participants']),
('planning.option_updated','Planning option updated','Planning',true,false,array['active_participants']),
('planning.option_removed','Planning option removed','Planning',true,false,array['active_participants']),
('payment.requested','Payment requested','Payments',true,true,array['affected_participant']),
('payment.received','Payment received','Payments',true,true,array['organiser','affected_participant']),
('payment.overdue','Payment overdue','Payments',true,true,array['affected_participant']),
('deadline.approaching','Deadline approaching','Reminders',true,true,array['active_participants']),
('booking.confirmed','Booking confirmed','Bookings',true,true,array['active_participants'])
on conflict (action_key) do nothing;
