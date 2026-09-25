-- Splitting an expense allocates shares without requiring a recorded payer.
alter table public.trip_costs drop constraint trip_costs_check;
alter table public.trip_costs add constraint trip_costs_check check (
  (kind = 'planned' and paid_by is null and jsonb_array_length(shares) = 0)
  or (kind = 'bill' and (paid_by is null or jsonb_typeof(paid_by) = 'object') and jsonb_array_length(shares) > 0)
);
