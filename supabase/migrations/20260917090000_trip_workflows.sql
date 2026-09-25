begin;
alter table public.trip_costs add column if not exists due_date date, add column if not exists payment_instructions text not null default '';
alter table public.trip_expense_payments add column if not exists claimed_at timestamptz, add column if not exists confirmed_by uuid references auth.users(id) on delete set null;
create table public.trip_decisions (
  trip_id uuid references public.trips(id) on delete cascade,
  category text check(category in ('hotels','activities','transport','dining')),
  option_id uuid not null,
  locked_at timestamptz not null default now(),
  locked_by uuid references auth.users(id) on delete set null,
  primary key(trip_id,category)
);
create table public.trip_decision_history (
  id uuid primary key default gen_random_uuid(), trip_id uuid references public.trips(id) on delete cascade,
  category text not null, option_id uuid, action text not null, reason text not null default '',
  actor_id uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
alter table public.trip_decisions enable row level security;
alter table public.trip_decision_history enable row level security;
revoke all on public.trip_decisions,public.trip_decision_history from anon,authenticated;
grant all on public.trip_decisions,public.trip_decision_history to service_role;

create function public.trip_card_progress(trip_ids uuid[]) returns jsonb
language sql stable set search_path=public as $$
 select coalesce(jsonb_object_agg(t.id, (
   select jsonb_object_agg(c.category, jsonb_build_object('voted', (
     select count(distinct v.voter_id) from poll_votes v join poll_options po on po.id=v.poll_option_id
     join options o on o.id=po.option_id where o.trip_id=t.id and o.category=c.category
     and exists(select 1 from (select id,trip_id,'hotels' as category from hotels union all select id,trip_id,'activities' from activities union all select id,trip_id,'transport' from transport union all select id,trip_id,'dining' from dining) entity where entity.id::text=o.metadata->>'entityId' and entity.trip_id=t.id and entity.category=c.category)
     and (v.voter_id=t.owner_id or exists(select 1 from trip_participants p where p.trip_id=t.id and p.user_id=v.voter_id and case when p.membership_status is not null then p.membership_status='active' else p.status='accepted' end))
   ), 'eligible', (select count(*) from (
     select 'user:'||t.owner_id::text as person
     union select coalesce('user:'||p.user_id::text,'email:'||lower(p.email)) from trip_participants p where p.trip_id=t.id and case when p.membership_status is not null then p.membership_status='active' else p.status='accepted' end
   ) people))) from (values ('hotels'),('activities'),('transport'),('dining')) c(category)
 )), '{}'::jsonb) from trips t where t.id=any(trip_ids);
$$;
revoke all on function public.trip_card_progress(uuid[]) from public;
grant execute on function public.trip_card_progress(uuid[]) to service_role;

create function public.guard_trip_vote() returns trigger language plpgsql set search_path=public as $$
declare trip_record record; vote_record record; category_name text;
begin
 if tg_op='DELETE' then vote_record:=old; else vote_record:=new; end if;
 select t.* into trip_record from trips t join polls p on p.trip_id=t.id where p.id=vote_record.poll_id for update of t;
 if trip_record.id is null or not exists(select 1 from poll_options where id=vote_record.poll_option_id) then if tg_op='DELETE' then return old; end if; return new; end if;
 select o.category into category_name from poll_options po join options o on o.id=po.option_id where po.id=vote_record.poll_option_id and po.poll_id=vote_record.poll_id and o.trip_id=trip_record.id;
 if category_name is null then raise exception 'Invalid voting option.'; end if;
 if trip_record.status in ('cancelled','closed','completed') or (trip_record.voting_deadline is not null and trip_record.voting_deadline<=now()) or exists(select 1 from trip_decisions where trip_id=trip_record.id and category=category_name) then
   raise exception 'Voting is closed. Ask the organiser to reopen the decision.' using errcode='P0001';
 end if;
 if vote_record.voter_id is distinct from trip_record.owner_id and not exists(select 1 from trip_participants p where p.trip_id=trip_record.id and p.user_id=vote_record.voter_id and case when p.membership_status is not null then p.membership_status='active' else p.status='accepted' end) then
   raise exception 'Only active travellers can vote.' using errcode='P0001';
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end; $$;
create trigger guard_trip_vote before insert or update or delete on public.poll_votes for each row execute function public.guard_trip_vote();
-- Deleting a trip cascades votes; normal vote removal is guarded in the API.

create function public.set_trip_decision(target_trip uuid, target_category text, target_option uuid, actor uuid, change_reason text, reopen_until timestamptz default null) returns void
language plpgsql set search_path=public as $$
declare trip_record record; exists_option boolean; recipient record;
begin
 select * into trip_record from trips where id=target_trip for update;
 if trip_record.owner_id is distinct from actor then raise exception 'Only the organiser can change decisions.'; end if;
 if trip_record.status in ('cancelled','closed','completed') then raise exception 'This trip is closed.'; end if;
 if target_category not in ('hotels','activities','transport','dining') then raise exception 'Invalid category'; end if;
 if target_option is null then
   if length(trim(coalesce(change_reason,'')))<3 then raise exception 'Add a reason for reopening this decision.'; end if;
   if reopen_until is null or reopen_until<=now() then raise exception 'Choose a future voting deadline.'; end if;
   delete from trip_decisions where trip_id=target_trip and category=target_category;
   update trips set voting_deadline=reopen_until where id=target_trip;
 else
   if length(trim(coalesce(change_reason,'')))<3 then raise exception 'Add a reason for this decision.'; end if;
   if exists(select 1 from trip_decisions where trip_id=target_trip and category=target_category) then raise exception 'Reopen this decision before changing it.'; end if;
   execute format('select exists(select 1 from public.%I where id=$1 and trip_id=$2)',target_category) into exists_option using target_option,target_trip;
   if not exists_option then raise exception 'Choose an option from this trip.'; end if;
   insert into trip_decisions(trip_id,category,option_id,locked_by) values(target_trip,target_category,target_option,actor);
 end if;
 insert into trip_decision_history(trip_id,category,option_id,action,reason,actor_id) values(target_trip,target_category,target_option,case when target_option is null then 'reopened' else 'locked' end,coalesce(change_reason,''),actor);
 for recipient in select distinct p.user_id,case when p.user_id is null then lower(p.email) else null end as email from trip_participants p where p.trip_id=target_trip and case when p.membership_status is not null then p.membership_status='active' else p.status='accepted' end loop
   insert into user_notifications(user_id,recipient_email,trip_id,action_key,title,message,action_url) values(recipient.user_id,recipient.email,target_trip,'decision.'||case when target_option is null then 'reopened' else 'locked' end,'Trip decision updated',initcap(target_category)||case when target_option is null then ' voting reopened. Reason: '||change_reason else ' decision locked by the organiser.' end,'/trips/'||target_trip::text);
 end loop;
end; $$;
revoke all on function public.set_trip_decision(uuid,text,uuid,uuid,text,timestamptz) from public;
grant execute on function public.set_trip_decision(uuid,text,uuid,uuid,text,timestamptz) to service_role;

create function public.guard_locked_trip_option() returns trigger language plpgsql set search_path=public as $$
begin
 perform 1 from trips where id=old.trip_id for update;
 if not found then if tg_op='DELETE' then return old; end if; return new; end if;
 if exists(select 1 from trip_decisions where trip_id=old.trip_id and category=tg_table_name and option_id=old.id) then raise exception 'Reopen the locked decision before editing or deleting its option.'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end; $$;
create trigger guard_locked_hotel before update or delete on hotels for each row execute function guard_locked_trip_option();
create trigger guard_locked_activity before update or delete on activities for each row execute function guard_locked_trip_option();
create trigger guard_locked_transport before update or delete on transport for each row execute function guard_locked_trip_option();
create trigger guard_locked_dining before update or delete on dining for each row execute function guard_locked_trip_option();
create function public.update_trip_payment(target_trip uuid,target_payment uuid,actor uuid,paid boolean) returns jsonb
language plpgsql set search_path=public as $$
declare item trip_expense_payments%rowtype; owner uuid; actor_email text;
begin
 select owner_id into owner from trips where id=target_trip;
 -- Match the split writer's lock order: expense before payment.
 perform 1 from trip_costs where id=(select expense_id from trip_expense_payments where id=target_payment and trip_id=target_trip) for update;
 select * into item from trip_expense_payments where id=target_payment and trip_id=target_trip for update;
 if item.id is null then raise exception 'Payment not found.'; end if;
 if actor=owner then
   update trip_expense_payments set status=case when paid then 'paid' else 'due' end, paid_at=case when paid then coalesce(paid_at,now()) else null end,
   confirmed_by=case when paid then actor else null end, claimed_at=null, updated_at=now() where id=item.id returning * into item;
 else
   select email into actor_email from auth.users where id=actor;
   if not exists(select 1 from trip_participants p where p.trip_id=target_trip
     and (case when p.membership_status is not null then p.membership_status='active' else p.status='accepted' end)
     and (p.user_id=actor or (p.user_id is null and lower(p.email)=lower(actor_email)))
     and (item.payer->>'id'='user:'||actor::text or item.payer->>'id'='participant:'||p.id::text)) then raise exception 'You can only claim your own payment.'; end if;
   if item.status='paid' then raise exception 'Ask the organiser to change a confirmed payment.'; end if;
   update trip_expense_payments set claimed_at=case when paid then coalesce(claimed_at,now()) else null end,updated_at=now() where id=item.id returning * into item;
 end if;
 return to_jsonb(item);
end; $$;
revoke all on function public.update_trip_payment(uuid,uuid,uuid,boolean) from public;
grant execute on function public.update_trip_payment(uuid,uuid,uuid,boolean) to service_role;

-- Keep a departing traveller's existing obligations visible to the organiser;
-- do not silently redistribute or erase other people's bills.
create function public.notify_membership_expense_review() returns trigger language plpgsql set search_path=public as $$
declare owner uuid;
begin
 if (case when new.membership_status is not null then new.membership_status='active' else new.status='accepted' end)
   is distinct from (case when old.membership_status is not null then old.membership_status='active' else old.status='accepted' end)
   and exists(select 1 from trip_expense_payments where trip_id=new.trip_id and status='due') then
   select owner_id into owner from trips where id=new.trip_id;
   insert into user_notifications(user_id,trip_id,action_key,title,message,action_url) values(owner,new.trip_id,'expense.membership_changed','Review trip splits',coalesce(new.full_name,'A traveller')||' changed membership. Existing shares have been kept; review any unpaid splits.','/trips/'||new.trip_id::text||'/expenses');
 end if;
 return new;
end; $$;
create trigger notify_membership_expense_review after update of membership_status,status on trip_participants for each row execute function notify_membership_expense_review();

create function public.invalidate_changed_payment_claim() returns trigger language plpgsql as $$
begin
 if new.amount_minor is distinct from old.amount_minor or new.payer->>'id' is distinct from old.payer->>'id' then new.claimed_at:=null; end if;
 return new;
end; $$;
create trigger invalidate_changed_payment_claim before update on trip_expense_payments for each row execute function invalidate_changed_payment_claim();

create or replace function public.notify_expense_payment_change() returns trigger
language plpgsql set search_path = public as $$
declare
  payment public.trip_expense_payments%rowtype;
  trip_owner uuid;
  trip_title text;
  recipient record;
  event_key text;
  heading text;
  body text;
  amount text;
  notify_owner boolean := false;
begin
  if tg_op = 'DELETE' then payment := old; else payment := new; end if;
  select owner_id, title into trip_owner, trip_title from public.trips where id = payment.trip_id;
  if trip_owner is null then return null; end if;
  amount := '£' || to_char(payment.amount_minor / 100.0, 'FM999999990.00');

  if tg_op = 'DELETE' then
    event_key := 'expense.payment_removed'; heading := 'Payment removed';
    body := payment.label || ' (' || amount || ') is no longer assigned to you.';
  elsif tg_op = 'UPDATE' then
    if new.status is not distinct from old.status
      and new.amount_minor is not distinct from old.amount_minor
      and new.claimed_at is not distinct from old.claimed_at
      and new.label is not distinct from old.label
      and new.payer->>'id' is not distinct from old.payer->>'id' then
      return null;
    end if;
    if new.claimed_at is distinct from old.claimed_at and new.status = old.status and new.amount_minor=old.amount_minor and new.payer->>'id'=old.payer->>'id' then
      notify_owner := true;
      event_key := 'expense.payment_claimed'; heading := case when new.claimed_at is null then 'Payment claim withdrawn' else 'Payment needs confirmation' end;
      body := coalesce(payment.payer->>'name', 'A traveller') || case when new.claimed_at is null then ' withdrew their claim for ' else ' says they paid ' end || payment.label || ' (' || amount || ').';
    elsif new.status is distinct from old.status then
      notify_owner := true;
      event_key := 'expense.payment_' || new.status;
      heading := case when new.status = 'paid' then 'Payment marked paid' else 'Payment marked due' end;
      body := payment.label || ' (' || amount || ') for ' || coalesce(payment.payer->>'name', 'a traveller') || ' has been marked ' || new.status || '.';
    else
      notify_owner := old.claimed_at is not null;
      event_key := 'expense.payment_updated'; heading := 'Your payment was updated';
      body := payment.label || ': your payment is now ' || amount || ' (' || payment.status || ').';
    end if;
  else
    event_key := 'expense.payment_' || payment.status;
    heading := case when payment.status = 'paid' then 'Payment recorded as paid' else 'New payment due' end;
    body := payment.label || ': ' || amount || case when payment.status = 'paid' then ' has been recorded as paid.' else ' is due from you.' end;
    notify_owner := payment.status = 'paid';
  end if;

  -- Resolve both current user IDs and older participant IDs, and never notify
  -- removed/inactive travellers. Email-only invitees can use the same inbox after signing in.
  for recipient in
    select distinct targets.user_id, targets.email from (
      select trip_owner as user_id, null::text as email
      where payment.payer->>'id' = 'user:' || trip_owner::text or notify_owner
      union all
      select p.user_id, case when p.user_id is null then lower(p.email) else null end
      from public.trip_participants p
      where p.trip_id = payment.trip_id
        and (case when p.membership_status is not null then p.membership_status = 'active' else p.status = 'accepted' end)
        and (payment.payer->>'id' = 'user:' || p.user_id::text or payment.payer->>'id' = 'participant:' || p.id::text)
    ) targets where targets.user_id is not null or nullif(targets.email, '') is not null
  loop
    insert into public.user_notifications(user_id,recipient_email,trip_id,action_key,title,message,action_url)
    values(recipient.user_id,recipient.email,payment.trip_id,event_key,heading,
      body || ' Trip: ' || trip_title, '/trips/' || payment.trip_id::text || '/expenses');
  end loop;
  return null;
end;
$$;

create function public.cancel_trip(target_trip uuid,actor uuid,reason text) returns void language plpgsql set search_path=public as $$
declare t trips%rowtype; recipient record;
begin
 select * into t from trips where id=target_trip for update;
 if t.owner_id is distinct from actor then raise exception 'Only the organiser can cancel this trip.'; end if;
 if t.status='cancelled' then return; end if;
 if t.status not in ('active','draft') then raise exception 'This trip cannot be cancelled in its current state.'; end if;
 if length(trim(coalesce(reason,'')))<3 or length(reason)>1000 then raise exception 'Explain why the trip is cancelled (3–1,000 characters).'; end if;
 update trips set status='cancelled',updated_at=now() where id=target_trip;
 insert into trip_decision_history(trip_id,category,action,reason,actor_id) values(target_trip,'trip','cancelled',reason,actor);
 for recipient in select distinct p.user_id,case when p.user_id is null then lower(p.email) else null end as email from trip_participants p where p.trip_id=target_trip and case when p.membership_status is not null then p.membership_status='active' else p.status='accepted' end loop
   insert into user_notifications(user_id,recipient_email,trip_id,action_key,title,message,action_url) values(recipient.user_id,recipient.email,target_trip,'decision.trip_cancelled','Trip cancelled',t.title||' was cancelled. '||reason||' Existing payment records are retained for reconciliation.','/trips/'||target_trip::text);
 end loop;
end; $$;
revoke all on function public.cancel_trip(uuid,uuid,text) from public;
grant execute on function public.cancel_trip(uuid,uuid,text) to service_role;

notify pgrst,'reload schema';
commit;
