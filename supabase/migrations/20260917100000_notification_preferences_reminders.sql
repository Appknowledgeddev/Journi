begin;
alter table user_notifications add column if not exists context jsonb not null default '{}'::jsonb;
create table public.notification_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 in_app boolean not null default true, email boolean not null default true,
 invites boolean not null default true, planning boolean not null default true, payments boolean not null default true,
 updated_at timestamptz not null default now()
);
alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from anon,authenticated;
grant all on public.notification_preferences to service_role;
create table public.notification_email_queue (
 id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, recipient_email text,
 trip_id uuid references trips(id) on delete cascade, action_key text not null, title text not null, message text not null, action_url text,
 status text not null default 'pending' check(status in ('pending','processing','sent','failed','skipped')),
 context jsonb not null default '{}'::jsonb, attempts int not null default 0, available_at timestamptz not null default now(), last_error text, created_at timestamptz not null default now()
);
alter table public.notification_email_queue enable row level security;
revoke all on public.notification_email_queue from anon,authenticated;
grant all on public.notification_email_queue to service_role;
create index notification_email_queue_pending on notification_email_queue(available_at) where status in ('pending','processing');
create function public.notification_group(action text) returns text language sql immutable as $$
 select case when action like 'expense.%' or action like 'reminder.payment%' then 'payments' when action like '%invit%' or action like 'participant.%' then 'invites' else 'planning' end;
$$;
create function public.apply_notification_preferences() returns trigger language plpgsql security definer set search_path=public as $$
declare prefs notification_preferences%rowtype; recipient uuid; allowed boolean;
begin
 recipient:=new.user_id;
 if recipient is null then select id into recipient from auth.users where lower(email)=lower(new.recipient_email) limit 1; end if;
 select * into prefs from notification_preferences where user_id=recipient;
 allowed:=coalesce((to_jsonb(prefs)->>notification_group(new.action_key))::boolean,true);
 if allowed and coalesce(prefs.email,true) and (new.action_key like 'expense.%' or new.action_key like 'decision.%' or new.action_key like 'reminder.%') then
   insert into notification_email_queue(user_id,recipient_email,trip_id,action_key,title,message,action_url,context) values(recipient,new.recipient_email,new.trip_id,new.action_key,new.title,new.message,new.action_url,new.context);
 end if;
 if not allowed or not coalesce(prefs.in_app,true) then return null; end if;
 return new;
end; $$;
create trigger apply_notification_preferences before insert on user_notifications for each row execute function apply_notification_preferences();
create table public.trip_reminder_events (event_key text primary key,created_at timestamptz not null default now());
alter table public.trip_reminder_events enable row level security;
revoke all on public.trip_reminder_events from anon,authenticated;
grant all on public.trip_reminder_events to service_role;
create function public.send_trip_reminders() returns integer language plpgsql security definer set search_path=public as $$
declare item record; person record; marker text; inserted int; total int:=0;
begin
 -- One pre-due, due-day and three-days-overdue reminder per obligation/deadline.
 for item in select p.*,c.due_date,t.owner_id,t.title as trip_title from trip_expense_payments p join trip_costs c on c.id=p.expense_id join trips t on t.id=p.trip_id
 where p.status='due' and p.claimed_at is null and c.due_date in (current_date+1,current_date,current_date-3) and t.status not in ('cancelled','completed','closed') loop
  for person in select item.owner_id as user_id,null::text as email where item.payer->>'id'='user:'||item.owner_id::text
    union select p.user_id,case when p.user_id is null then lower(p.email) else null end from trip_participants p where p.trip_id=item.trip_id
      and (case when p.membership_status is not null then p.membership_status='active' else p.status='accepted' end)
      and (item.payer->>'id'='user:'||p.user_id::text or item.payer->>'id'='participant:'||p.id::text) loop
   marker:='payment:'||item.id::text||':'||item.due_date::text||':'||(current_date-item.due_date)::text||':'||coalesce(person.user_id::text,person.email);
   insert into trip_reminder_events(event_key) values(marker) on conflict do nothing; get diagnostics inserted=row_count;
   if inserted=1 then
    insert into user_notifications(user_id,recipient_email,trip_id,action_key,title,message,action_url,context) values(person.user_id,person.email,item.trip_id,'reminder.payment','Payment reminder',item.label||' · £'||to_char(item.amount_minor/100.0,'FM999999990.00')||case when item.due_date<current_date then ' is overdue.' when item.due_date=current_date then ' is due today.' else ' is due tomorrow.' end,'/trips/'||item.trip_id::text||'/expenses',jsonb_build_object('paymentId',item.id,'dueDate',item.due_date)); total:=total+1;
   end if;
  end loop;
 end loop;
 for item in select * from trips where voting_deadline>now() and voting_deadline<=now()+interval '24 hours' and status not in ('draft','cancelled','closed','completed') loop
  for person in select distinct p.user_id,case when p.user_id is null then lower(p.email) else null end as email from trip_participants p where p.trip_id=item.id
    and (case when p.membership_status is not null then p.membership_status='active' else p.status='accepted' end)
    and exists(select 1 from (select 'hotels' as category where exists(select 1 from hotels where trip_id=item.id) union select 'activities' where exists(select 1 from activities where trip_id=item.id) union select 'transport' where exists(select 1 from transport where trip_id=item.id) union select 'dining' where exists(select 1 from dining where trip_id=item.id)) c
      where not exists(select 1 from trip_decisions d where d.trip_id=item.id and d.category=c.category)
      and not exists(select 1 from poll_votes v join poll_options po on po.id=v.poll_option_id join options o on o.id=po.option_id where v.voter_id=p.user_id and o.trip_id=item.id and o.category=c.category)) loop
   marker:='voting:'||item.id::text||':'||item.voting_deadline::text||':'||coalesce(person.user_id::text,person.email);
   insert into trip_reminder_events(event_key) values(marker) on conflict do nothing; get diagnostics inserted=row_count;
   if inserted=1 then
    insert into user_notifications(user_id,recipient_email,trip_id,action_key,title,message,action_url,context) values(person.user_id,person.email,item.id,'reminder.voting','Voting closes soon','You still have choices to vote on for '||item.title||'. Voting closes within 24 hours.','/trips/'||item.id::text,jsonb_build_object('votingDeadline',item.voting_deadline)); total:=total+1;
   end if;
  end loop;
 end loop;
 return total;
end; $$;
revoke all on function public.send_trip_reminders() from public;
grant execute on function public.send_trip_reminders() to service_role;
create function public.recipient_notification_preferences(recipient uuid, recipient_address text) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce((select to_jsonb(p) from notification_preferences p join auth.users u on u.id=p.user_id where (recipient is not null and u.id=recipient) or (recipient is null and lower(u.email)=lower(recipient_address)) limit 1),'{}'::jsonb);
$$;
revoke all on function public.recipient_notification_preferences(uuid,text) from public;
grant execute on function public.recipient_notification_preferences(uuid,text) to service_role;
create function public.claim_notification_emails() returns setof notification_email_queue language plpgsql security definer set search_path=public as $$
begin
 update notification_email_queue set status='failed',last_error='Delivery lease expired after five attempts.' where status='processing' and attempts>=5 and available_at<=now();
 return query update notification_email_queue set status='processing',attempts=attempts+1,available_at=now()+interval '10 minutes'
 where id in (select id from notification_email_queue where status in ('pending','processing') and available_at<=now() and attempts<5 order by created_at for update skip locked limit 25) returning *;
end; $$;
revoke all on function public.claim_notification_emails() from public;
grant execute on function public.claim_notification_emails() to service_role;
-- Cron executes independently of browser visits. Email queue delivery is performed by the app's authenticated cron endpoint.
create extension if not exists pg_cron;
select cron.schedule('journi-trip-reminders','5 * * * *',$$select public.send_trip_reminders();$$);
notify pgrst,'reload schema';
commit;
