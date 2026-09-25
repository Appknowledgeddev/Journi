alter table public.comments
  add column if not exists deleted_at timestamptz;

