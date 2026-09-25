-- Run after migrations. Every fixture is rolled back, including notifications.
begin;
do $$
declare
 owner_user uuid; member_user uuid; fixture uuid:=gen_random_uuid(); participant uuid:=gen_random_uuid(); cost uuid:=gen_random_uuid(); option_uuid uuid:=gen_random_uuid(); poll uuid:=gen_random_uuid(); opt uuid:=gen_random_uuid(); poll_opt uuid:=gen_random_uuid(); payment uuid; result jsonb; claims int; reminder_count int;
begin
 select id into owner_user from auth.users order by created_at limit 1;
 select id into member_user from auth.users where id<>owner_user order by created_at limit 1;
 if member_user is null then raise exception 'Two existing accounts are required for rollback tests.'; end if;
 insert into trips(id,owner_id,title,status,voting_deadline) values(fixture,owner_user,'Workflow rollback test','active',now()+interval '12 hours');
 insert into trip_participants(id,trip_id,user_id,email,full_name,status,membership_status) select participant,fixture,member_user,email,'Workflow traveller','accepted','active' from auth.users where id=member_user;
 insert into trip_costs(id,trip_id,created_by,title,category,amount_minor,kind,shares,split_method,due_date) values(cost,fixture,owner_user,'Workflow bill','other',1000,'bill',jsonb_build_array(jsonb_build_object('id','user:'||member_user::text,'name','Traveller','amountMinor',1000)),'equal',current_date);
 select id into payment from trip_expense_payments where expense_id=cost;
 result:=update_trip_payment(fixture,payment,member_user,true);
 if result->>'status'<>'due' or result->>'claimed_at' is null then raise exception 'Claim must stay due'; end if;
 select count(*) into claims from user_notifications where trip_id=fixture and action_key='expense.payment_claimed';
 perform update_trip_payment(fixture,payment,member_user,true);
 if (select count(*) from user_notifications where trip_id=fixture and action_key='expense.payment_claimed')<>claims then raise exception 'Duplicate claim notification'; end if;
 result:=update_trip_payment(fixture,payment,owner_user,true);
 if result->>'status'<>'paid' or result->>'confirmed_by'<>owner_user::text then raise exception 'Owner confirmation failed'; end if;
 begin
  perform update_trip_payment(fixture,payment,member_user,false); raise exception 'Traveller reverted confirmed payment' using errcode='P0002';
 exception when sqlstate 'P0001' then null; end;
 perform update_trip_payment(fixture,payment,owner_user,false);
 perform update_trip_payment(fixture,payment,member_user,true);
 update trip_costs set amount_minor=1100,shares=jsonb_set(shares,'{0,amountMinor}','1100') where id=cost;
 if (select claimed_at from trip_expense_payments where id=payment) is not null then raise exception 'Changed amount retained stale payment claim'; end if;
 insert into hotels(id,trip_id,name) values(option_uuid,fixture,'Workflow hotel');
 insert into polls(id,trip_id,created_by,title) values(poll,fixture,owner_user,'Hotel votes');
 insert into options(id,trip_id,created_by,category,title,metadata) values(opt,fixture,owner_user,'hotels','Workflow hotel',jsonb_build_object('entityId',option_uuid));
 insert into poll_options(id,poll_id,option_id,label) values(poll_opt,poll,opt,'Workflow hotel');
 insert into poll_votes(poll_id,poll_option_id,voter_id,vote_direction) values(poll,poll_opt,member_user,'up');
 result:=trip_card_progress(array[fixture]);
 if (result->fixture::text->'hotels'->>'voted')::int<>1 or (result->fixture::text->'hotels'->>'eligible')::int<>2 then raise exception 'Incorrect progress %',result; end if;
 begin
  perform set_trip_decision(fixture,'hotels',option_uuid,member_user,'Cannot lock as a traveller',null); raise exception 'Traveller locked a decision' using errcode='P0002';
 exception when sqlstate 'P0001' then null; end;
 perform set_trip_decision(fixture,'hotels',option_uuid,owner_user,'Group preference',null);
 begin
  delete from poll_votes where poll_id=poll; raise exception 'Deleted locked vote' using errcode='P0002';
 exception when sqlstate 'P0001' then null; end;
 begin
  update hotels set name='Changed' where id=option_uuid; raise exception 'Edited locked option' using errcode='P0002';
 exception when sqlstate 'P0001' then null; end;
 perform set_trip_decision(fixture,'hotels',null,owner_user,'New availability',now()+interval '2 days');
 delete from poll_votes where poll_id=poll;
 update trips set voting_deadline=now()-interval '1 hour' where id=fixture;
 begin
  insert into poll_votes(poll_id,poll_option_id,voter_id,vote_direction) values(poll,poll_opt,member_user,'up'); raise exception 'Late vote accepted' using errcode='P0002';
 exception when sqlstate 'P0001' then null; end;
 perform send_trip_reminders();
 select count(*) into reminder_count from user_notifications where trip_id=fixture and action_key='reminder.payment';
 if reminder_count<>1 then raise exception 'Expected one due reminder, got %',reminder_count; end if;
 perform send_trip_reminders();
 if (select count(*) from user_notifications where trip_id=fixture and action_key='reminder.payment')<>reminder_count then raise exception 'Duplicate reminder'; end if;
 insert into notification_preferences(user_id,payments,in_app,email) values(member_user,false,true,true) on conflict(user_id) do update set payments=false;
 claims:=(select count(*) from notification_email_queue where trip_id=fixture);
 insert into user_notifications(user_id,trip_id,action_key,title,message) values(member_user,fixture,'expense.test','Muted event','Should not deliver');
 if exists(select 1 from user_notifications where trip_id=fixture and action_key='expense.test') or (select count(*) from notification_email_queue where trip_id=fixture)<>claims then raise exception 'Preferences ignored'; end if;
 perform cancel_trip(fixture,owner_user,'Travel plans changed');
 if (select status from trips where id=fixture)<>'cancelled' then raise exception 'Cancellation failed'; end if;
 if not exists(select 1 from trip_expense_payments where id=payment) then raise exception 'Cancellation deleted obligations'; end if;
 update trips set voting_deadline=now()+interval '1 day' where id=fixture;
 begin
  insert into poll_votes(poll_id,poll_option_id,voter_id,vote_direction) values(poll,poll_opt,member_user,'up'); raise exception 'Cancelled trip accepted votes' using errcode='P0002';
 exception when sqlstate 'P0001' then null; end;
 delete from trips where id=fixture;
end; $$;
rollback;
select 'PASS: claim/confirm permissions, duplicate suppression, real progress, lock/reopen/deadline enforcement, reminder idempotency, preferences and cleanup' as result;
