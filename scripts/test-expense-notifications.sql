-- Rollback-only integration test: no notifications or fixture data survive.
begin;
do $$
declare
  trip uuid;
  owner_user uuid;
  participant uuid := gen_random_uuid();
  cost uuid := gen_random_uuid();
  payment uuid;
  marker text := 'Notification test ' || gen_random_uuid()::text;
  traveller_email text := gen_random_uuid()::text || '@example.invalid';
  initial_notifications bigint;
begin
  select id,owner_id into trip,owner_user from public.trips limit 1;
  if trip is null then raise exception 'A trip is required for this rollback-only test'; end if;
  select count(*) into initial_notifications from public.user_notifications where trip_id=trip;
  insert into public.trip_participants(id,trip_id,email,full_name,status,membership_status)
  values(participant,trip,traveller_email,'Notification test traveller','accepted','active');
  insert into public.trip_costs(id,trip_id,created_by,title,category,amount_minor,kind,shares,split_method)
  values(cost,trip,owner_user,marker,'other',300,'bill',jsonb_build_array(
    jsonb_build_object('id','user:'||owner_user::text,'name','Owner','amountMinor',200),
    jsonb_build_object('id','participant:'||participant::text,'name','Traveller','amountMinor',100)),'custom');
  if (select count(*) from public.user_notifications where trip_id=trip) <> initial_notifications+2 then raise exception 'Wrong assignment audience'; end if;
  if not exists(select 1 from public.user_notifications where recipient_email=traveller_email and action_key='expense.payment_due' and action_url='/trips/'||trip::text||'/expenses') then raise exception 'Traveller notification missing'; end if;
  update public.trip_costs set shares=shares where id=cost;
  if (select count(*) from public.user_notifications where trip_id=trip) <> initial_notifications+2 then raise exception 'Unchanged save sent duplicates'; end if;
  update public.trip_costs set amount_minor=350,shares=jsonb_set(shares,'{1,amountMinor}','150') where id=cost;
  if (select count(*) from public.user_notifications where trip_id=trip) <> initial_notifications+3 then raise exception 'Changed share notified wrong audience'; end if;
  select id into payment from public.trip_expense_payments where expense_id=cost and split_person_id='participant:'||participant::text;
  update public.trip_expense_payments set status='paid',paid_at=now() where id=payment;
  if (select count(*) from public.user_notifications where trip_id=trip) <> initial_notifications+5 then raise exception 'Paid event must notify traveller and owner'; end if;
  update public.trip_expense_payments set status='paid',updated_at=now() where id=payment;
  if (select count(*) from public.user_notifications where trip_id=trip) <> initial_notifications+5 then raise exception 'Repeated paid save sent duplicates'; end if;
  update public.trip_expense_payments set status='due',paid_at=null where id=payment;
  if (select count(*) from public.user_notifications where trip_id=trip) <> initial_notifications+7 then raise exception 'Due event audience incorrect'; end if;
  update public.trip_costs set amount_minor=200,shares=jsonb_build_array(shares->0) where id=cost;
  if (select count(*) from public.user_notifications where trip_id=trip) <> initial_notifications+8 then raise exception 'Removed share notification missing'; end if;
  update public.trip_participants set membership_status='removed' where id=participant;
  if not exists(select 1 from public.user_notifications where trip_id=trip and user_id=owner_user and action_key='expense.membership_changed') then raise exception 'Organiser review prompt missing'; end if;
  insert into public.trip_expense_payments(trip_id,expense_id,created_by,label,amount_minor,payer)
  values(trip,cost,owner_user,marker,100,jsonb_build_object('id','participant:'||participant::text,'name','Inactive'));
  if (select count(*) from public.user_notifications where trip_id=trip) <> initial_notifications+9 then raise exception 'Inactive member notified'; end if;
  insert into public.trip_expense_payments(trip_id,expense_id,created_by,label,amount_minor,payer)
  values(trip,cost,owner_user,marker,100,jsonb_build_object('id','user:'||owner_user::text,'name','Owner'));
  if (select count(*) from public.user_notifications where trip_id=trip) <> initial_notifications+10 then raise exception 'Manual payment notification missing'; end if;
end;
$$;
rollback;
select 'PASS: targeted assignments, amount changes, paid/due updates, removed shares, inactive members, manual payments and duplicate prevention' as result;
