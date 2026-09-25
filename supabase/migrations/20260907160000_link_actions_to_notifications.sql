alter table public.notification_actions
  add column if not exists email_notification_id text;

alter table public.notification_actions
  drop constraint if exists notification_actions_email_notification_id_fkey;

alter table public.notification_batches
  add column if not exists email_notification_id text;
