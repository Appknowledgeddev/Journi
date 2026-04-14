create table if not exists public.hotels (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  option_id uuid,
  name text not null,
  location text,
  booking_url text,
  price_per_night numeric(10,2),
  currency text default 'GBP',
  rating numeric(3,2),
  notes text,
  google_place_id text,
  source_photo_url text,
  source_photo_attribution text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  option_id uuid,
  title text not null,
  location text,
  booking_url text,
  scheduled_for timestamptz,
  price numeric(10,2),
  currency text default 'GBP',
  notes text,
  google_place_id text,
  source_photo_url text,
  source_photo_attribution text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transport (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  option_id uuid,
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
  google_place_id text,
  source_photo_url text,
  source_photo_attribution text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dining (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  option_id uuid,
  name text not null,
  location text,
  reservation_url text,
  scheduled_for timestamptz,
  cuisine text,
  price_level text,
  notes text,
  google_place_id text,
  source_photo_url text,
  source_photo_attribution text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hotels add column if not exists google_place_id text;
alter table public.hotels add column if not exists source_photo_url text;
alter table public.hotels add column if not exists source_photo_attribution text;
alter table public.hotels add column if not exists latitude double precision;
alter table public.hotels add column if not exists longitude double precision;

alter table public.activities add column if not exists google_place_id text;
alter table public.activities add column if not exists source_photo_url text;
alter table public.activities add column if not exists source_photo_attribution text;
alter table public.activities add column if not exists latitude double precision;
alter table public.activities add column if not exists longitude double precision;

alter table public.transport add column if not exists google_place_id text;
alter table public.transport add column if not exists source_photo_url text;
alter table public.transport add column if not exists source_photo_attribution text;
alter table public.transport add column if not exists latitude double precision;
alter table public.transport add column if not exists longitude double precision;

alter table public.dining add column if not exists google_place_id text;
alter table public.dining add column if not exists source_photo_url text;
alter table public.dining add column if not exists source_photo_attribution text;
alter table public.dining add column if not exists latitude double precision;
alter table public.dining add column if not exists longitude double precision;

create index if not exists hotels_trip_id_idx on public.hotels(trip_id);
create index if not exists hotels_google_place_id_idx on public.hotels(google_place_id);
create index if not exists activities_trip_id_idx on public.activities(trip_id);
create index if not exists activities_google_place_id_idx on public.activities(google_place_id);
create index if not exists transport_trip_id_idx on public.transport(trip_id);
create index if not exists transport_google_place_id_idx on public.transport(google_place_id);
create index if not exists dining_trip_id_idx on public.dining(trip_id);
create index if not exists dining_google_place_id_idx on public.dining(google_place_id);

alter table public.hotels enable row level security;
alter table public.activities enable row level security;
alter table public.transport enable row level security;
alter table public.dining enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'hotels' and policyname = 'Users can view hotels on own trips'
  ) then
    create policy "Users can view hotels on own trips"
    on public.hotels
    for select
    using (
      exists (
        select 1 from public.trips
        where public.trips.id = hotels.trip_id
          and public.trips.owner_id = auth.uid()
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'hotels' and policyname = 'Users can insert hotels on own trips'
  ) then
    create policy "Users can insert hotels on own trips"
    on public.hotels
    for insert
    with check (
      exists (
        select 1 from public.trips
        where public.trips.id = hotels.trip_id
          and public.trips.owner_id = auth.uid()
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'hotels' and policyname = 'Users can update hotels on own trips'
  ) then
    create policy "Users can update hotels on own trips"
    on public.hotels
    for update
    using (
      exists (
        select 1 from public.trips
        where public.trips.id = hotels.trip_id
          and public.trips.owner_id = auth.uid()
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'hotels' and policyname = 'Users can delete hotels on own trips'
  ) then
    create policy "Users can delete hotels on own trips"
    on public.hotels
    for delete
    using (
      exists (
        select 1 from public.trips
        where public.trips.id = hotels.trip_id
          and public.trips.owner_id = auth.uid()
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'activities' and policyname = 'Users can view activities on own trips'
  ) then
    create policy "Users can view activities on own trips"
    on public.activities
    for select
    using (
      exists (
        select 1 from public.trips
        where public.trips.id = activities.trip_id
          and public.trips.owner_id = auth.uid()
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'activities' and policyname = 'Users can insert activities on own trips'
  ) then
    create policy "Users can insert activities on own trips"
    on public.activities
    for insert
    with check (
      exists (
        select 1 from public.trips
        where public.trips.id = activities.trip_id
          and public.trips.owner_id = auth.uid()
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'activities' and policyname = 'Users can update activities on own trips'
  ) then
    create policy "Users can update activities on own trips"
    on public.activities
    for update
    using (
      exists (
        select 1 from public.trips
        where public.trips.id = activities.trip_id
          and public.trips.owner_id = auth.uid()
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'activities' and policyname = 'Users can delete activities on own trips'
  ) then
    create policy "Users can delete activities on own trips"
    on public.activities
    for delete
    using (
      exists (
        select 1 from public.trips
        where public.trips.id = activities.trip_id
          and public.trips.owner_id = auth.uid()
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'transport' and policyname = 'Users can view transport on own trips'
  ) then
    create policy "Users can view transport on own trips"
    on public.transport
    for select
    using (
      exists (
        select 1 from public.trips
        where public.trips.id = transport.trip_id
          and public.trips.owner_id = auth.uid()
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'transport' and policyname = 'Users can insert transport on own trips'
  ) then
    create policy "Users can insert transport on own trips"
    on public.transport
    for insert
    with check (
      exists (
        select 1 from public.trips
        where public.trips.id = transport.trip_id
          and public.trips.owner_id = auth.uid()
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'transport' and policyname = 'Users can update transport on own trips'
  ) then
    create policy "Users can update transport on own trips"
    on public.transport
    for update
    using (
      exists (
        select 1 from public.trips
        where public.trips.id = transport.trip_id
          and public.trips.owner_id = auth.uid()
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'transport' and policyname = 'Users can delete transport on own trips'
  ) then
    create policy "Users can delete transport on own trips"
    on public.transport
    for delete
    using (
      exists (
        select 1 from public.trips
        where public.trips.id = transport.trip_id
          and public.trips.owner_id = auth.uid()
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'dining' and policyname = 'Users can view dining on own trips'
  ) then
    create policy "Users can view dining on own trips"
    on public.dining
    for select
    using (
      exists (
        select 1 from public.trips
        where public.trips.id = dining.trip_id
          and public.trips.owner_id = auth.uid()
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'dining' and policyname = 'Users can insert dining on own trips'
  ) then
    create policy "Users can insert dining on own trips"
    on public.dining
    for insert
    with check (
      exists (
        select 1 from public.trips
        where public.trips.id = dining.trip_id
          and public.trips.owner_id = auth.uid()
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'dining' and policyname = 'Users can update dining on own trips'
  ) then
    create policy "Users can update dining on own trips"
    on public.dining
    for update
    using (
      exists (
        select 1 from public.trips
        where public.trips.id = dining.trip_id
          and public.trips.owner_id = auth.uid()
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'dining' and policyname = 'Users can delete dining on own trips'
  ) then
    create policy "Users can delete dining on own trips"
    on public.dining
    for delete
    using (
      exists (
        select 1 from public.trips
        where public.trips.id = dining.trip_id
          and public.trips.owner_id = auth.uid()
      )
    );
  end if;
end $$;
