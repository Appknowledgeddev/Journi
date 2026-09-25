create table if not exists public.email_templates (
  id text primary key,
  name text not null,
  html text not null,
  updated_at timestamptz not null default now()
);

alter table public.email_templates enable row level security;

revoke all on table public.email_templates from anon, authenticated;

alter table public.notification_rules
  add column if not exists template_mode text not null default 'global'
  check (template_mode in ('global', 'custom'));

alter table public.notification_rules
  add column if not exists push_body text;

alter table public.notification_rules
  add column if not exists custom_template_html text;

update public.notification_rules
set custom_template_html = body
where template_mode = 'custom' and custom_template_html is null;
