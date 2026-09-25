create table if not exists public.email_delivery_settings (
  id text primary key,
  provider text not null default 'webhook',
  webhook_url text not null,
  webhook_secret_encrypted text,
  updated_at timestamptz not null default now()
);

alter table public.email_delivery_settings enable row level security;
revoke all on table public.email_delivery_settings from anon, authenticated;
