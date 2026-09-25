begin;
alter table public.trip_expense_payments add column split_person_id text;
create unique index trip_expense_payments_split_unique
  on public.trip_expense_payments(expense_id, split_person_id) where split_person_id is not null;

create function public.sync_expense_split_payments() returns trigger
language plpgsql set search_path = public as $$
declare
  share jsonb;
begin
  -- A paid share must be explicitly marked due before its amount can change.
  if exists (
    select 1 from public.trip_expense_payments p
    where p.expense_id = new.id and p.split_person_id is not null and p.status = 'paid'
      and not exists (
        select 1 from jsonb_array_elements(new.shares) s
        where new.kind = 'bill' and s->>'id' = p.split_person_id
          and (s->>'amountMinor')::bigint = p.amount_minor
      )
  ) then
    raise exception 'Mark the affected split payment as due before changing its share.' using errcode = 'P0001';
  end if;

  delete from public.trip_expense_payments p
  where p.expense_id = new.id and p.split_person_id is not null and p.status = 'due'
    and not exists (
      select 1 from jsonb_array_elements(new.shares) s
      where new.kind = 'bill' and s->>'id' = p.split_person_id and (s->>'amountMinor')::bigint > 0
    );

  if new.kind = 'bill' then
    for share in select value from jsonb_array_elements(new.shares) loop
      if (share->>'amountMinor')::bigint > 0 then
        insert into public.trip_expense_payments
          (trip_id, expense_id, created_by, label, amount_minor, currency, payer, status, split_person_id)
        values
          (new.trip_id, new.id, new.created_by, left(new.title || ' · share', 160),
           (share->>'amountMinor')::bigint, new.currency,
           jsonb_build_object('id', share->>'id', 'name', share->>'name'), 'due', share->>'id')
        on conflict (expense_id, split_person_id) where split_person_id is not null
        do update set label = excluded.label, amount_minor = excluded.amount_minor,
          payer = excluded.payer, updated_at = now();
      end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_expense_split_payments() from public;
grant execute on function public.sync_expense_split_payments() to service_role;
create trigger sync_expense_split_payments
  after insert or update of shares, kind, title on public.trip_costs
  for each row execute function public.sync_expense_split_payments();

-- Bring previously saved splits into the payments list too.
update public.trip_costs set shares = shares where kind = 'bill';

commit;
