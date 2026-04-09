create extension if not exists "pgcrypto";

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  title text not null,
  destination text,
  description text,
  status text not null default 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  cover_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.options (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  category text not null,
  title text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title text not null,
  description text,
  allows_multiple boolean not null default false,
  closes_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid references public.options(id) on delete set null,
  label text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  poll_option_id uuid not null references public.poll_options(id) on delete cascade,
  voter_id uuid references auth.users(id) on delete set null,
  voter_name text,
  created_at timestamptz not null default now(),
  unique (poll_id, poll_option_id, voter_id)
);

create table if not exists public.hotels (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  option_id uuid references public.options(id) on delete set null,
  name text not null,
  location text,
  booking_url text,
  price_per_night numeric(10,2),
  currency text default 'GBP',
  rating numeric(3,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  option_id uuid references public.options(id) on delete set null,
  title text not null,
  location text,
  booking_url text,
  scheduled_for timestamptz,
  price numeric(10,2),
  currency text default 'GBP',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  parent_comment_id uuid references public.comments(id) on delete cascade,
  entity_type text not null default 'trip',
  entity_id uuid,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.images (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  uploaded_by uuid references auth.users(id) on delete set null,
  entity_type text not null default 'trip',
  entity_id uuid,
  storage_path text not null,
  public_url text,
  alt_text text,
  created_at timestamptz not null default now()
);

create table if not exists public.stripe_products (
  id uuid primary key default gen_random_uuid(),
  stripe_product_id text not null unique,
  stripe_price_id text unique,
  name text not null,
  description text,
  billing_interval text,
  amount numeric(10,2),
  currency text default 'GBP',
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references public.trips(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  stripe_product_ref uuid references public.stripe_products(id) on delete set null,
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

create table if not exists public.transport (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  option_id uuid references public.options(id) on delete set null,
  mode text not null,
  provider text,
  departure_location text,
  arrival_location text,
  departs_at timestamptz,
  arrives_at timestamptz,
  booking_reference text,
  price numeric(10,2),
  currency text default 'GBP',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dining (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  option_id uuid references public.options(id) on delete set null,
  name text not null,
  location text,
  reservation_url text,
  scheduled_for timestamptz,
  cuisine text,
  price_level text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trips_owner_id_idx on public.trips(owner_id);
create index if not exists options_trip_id_idx on public.options(trip_id);
create index if not exists polls_trip_id_idx on public.polls(trip_id);
create index if not exists poll_options_poll_id_idx on public.poll_options(poll_id);
create index if not exists poll_votes_poll_id_idx on public.poll_votes(poll_id);
create index if not exists hotels_trip_id_idx on public.hotels(trip_id);
create index if not exists activities_trip_id_idx on public.activities(trip_id);
create index if not exists comments_trip_id_idx on public.comments(trip_id);
create index if not exists images_trip_id_idx on public.images(trip_id);
create index if not exists payments_user_id_idx on public.payments(user_id);
create index if not exists payments_trip_id_idx on public.payments(trip_id);
create index if not exists transport_trip_id_idx on public.transport(trip_id);
create index if not exists dining_trip_id_idx on public.dining(trip_id);
