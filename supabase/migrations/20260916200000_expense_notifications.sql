begin;

-- Expense events share the existing account inbox. They are written in the same
-- transaction as the payment, so failed saves and unchanged retries never notify.
create function public.notify_expense_payment_change() returns trigger
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
      and new.label is not distinct from old.label
      and new.payer->>'id' is not distinct from old.payer->>'id' then
      return null;
    end if;
    if new.status is distinct from old.status then
      notify_owner := true;
      event_key := 'expense.payment_' || new.status;
      heading := case when new.status = 'paid' then 'Payment marked paid' else 'Payment marked due' end;
      body := payment.label || ' (' || amount || ') for ' || coalesce(payment.payer->>'name', 'a traveller') || ' has been marked ' || new.status || '.';
    else
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
revoke all on function public.notify_expense_payment_change() from public;
grant execute on function public.notify_expense_payment_change() to service_role;
create trigger notify_expense_payment_change
  after insert or update or delete on public.trip_expense_payments
  for each row execute function public.notify_expense_payment_change();
commit;
