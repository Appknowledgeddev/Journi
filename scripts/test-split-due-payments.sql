-- Integration test: all fixture writes are rolled back.
begin;
do $$
declare
  trip uuid;
  owner_user uuid;
  cost uuid := gen_random_uuid();
  first_payment uuid;
  first_paid_at timestamptz;
begin
  select id, owner_id into trip, owner_user from public.trips limit 1;
  if trip is null then raise exception 'A trip is required for this rollback-only test'; end if;
  insert into public.trip_costs(id,trip_id,created_by,title,category,amount_minor,kind,shares,split_method)
  values (cost,trip,owner_user,'Split payment test','other',1000,'bill',
    '[{"id":"test:one","name":"Test One","amountMinor":600},{"id":"test:two","name":"Test Two","amountMinor":400}]','custom');
  if (select count(*) from public.trip_expense_payments where expense_id=cost and status='due') <> 2 then raise exception 'Due payments not generated'; end if;
  if (select sum(amount_minor) from public.trip_expense_payments where expense_id=cost) <> 1000 then raise exception 'Wrong total'; end if;
  select id into first_payment from public.trip_expense_payments where expense_id=cost and split_person_id='test:one';
  update public.trip_costs set shares=shares where id=cost;
  if (select count(*) from public.trip_expense_payments where expense_id=cost) <> 2 then raise exception 'Duplicate payments'; end if;
  if not exists(select 1 from public.trip_expense_payments where id=first_payment) then raise exception 'Payment ID changed'; end if;
  update public.trip_expense_payments set status='paid',paid_at=now() where id=first_payment;
  select paid_at into first_paid_at from public.trip_expense_payments where id=first_payment;
  update public.trip_costs set title='Renamed split' where id=cost;
  if not exists(select 1 from public.trip_expense_payments where id=first_payment and status='paid' and paid_at=first_paid_at) then raise exception 'Paid status reset'; end if;
  begin
    update public.trip_costs set shares='[{"id":"test:one","name":"Test One","amountMinor":500},{"id":"test:two","name":"Test Two","amountMinor":500}]' where id=cost;
    raise exception 'Paid share was changed' using errcode='P0002';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'Mark the affected split payment as due before changing its share.' then raise; end if;
  end;
  update public.trip_expense_payments set status='due',paid_at=null where id=first_payment;
  update public.trip_costs set shares='[{"id":"test:one","name":"Test One","amountMinor":500},{"id":"test:two","name":"Test Two","amountMinor":500}]' where id=cost;
  if (select amount_minor from public.trip_expense_payments where id=first_payment) <> 500 then raise exception 'Share not updated'; end if;
  insert into public.trip_expense_payments(trip_id,expense_id,created_by,label,amount_minor,payer)
  values(trip,cost,owner_user,'Manual payment',100,'{"id":"test:one","name":"Test One"}');
  update public.trip_costs set shares='[{"id":"test:one","name":"Test One","amountMinor":1000},{"id":"test:two","name":"Test Two","amountMinor":0}]' where id=cost;
  if exists(select 1 from public.trip_expense_payments where expense_id=cost and split_person_id='test:two') then raise exception 'Zero share retained'; end if;
  if not exists(select 1 from public.trip_expense_payments where expense_id=cost and split_person_id is null and label='Manual payment') then raise exception 'Manual payment changed'; end if;
end;
$$;
rollback;
select 'PASS: due payments, idempotency, paid-state protection, share changes and manual record preservation' as result;
