alter table public.poll_votes
  add column if not exists vote_direction text not null default 'up'
  check (vote_direction in ('up', 'down'));

