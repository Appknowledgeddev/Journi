alter table public.notification_rules
  add column if not exists push_body text;

alter table public.notification_rules
  add column if not exists custom_template_html text;

update public.notification_rules
set custom_template_html = body
where template_mode = 'custom'
  and custom_template_html is null;
