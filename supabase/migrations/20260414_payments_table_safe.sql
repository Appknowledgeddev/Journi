create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references public.trips(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  stripe_product_ref uuid,
  stripe_customer_id text,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'pending',
  amount numeric(10,2),
  currency text default 'GBP',
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_user_id_idx on public.payments(user_id);
create index if not exists payments_trip_id_idx on public.payments(trip_id);
