-- Suivi persistant des publications lues (notifications visuelles côté app).
-- Additif, idempotent, sans suppression de données.

create table if not exists public.user_publication_read_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_read_publications_at timestamptz not null default '1970-01-01T00:00:00Z'
);

alter table public.user_publication_read_state enable row level security;

drop policy if exists "user_publication_read_state select own" on public.user_publication_read_state;
create policy "user_publication_read_state select own"
  on public.user_publication_read_state
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_publication_read_state insert own" on public.user_publication_read_state;
create policy "user_publication_read_state insert own"
  on public.user_publication_read_state
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_publication_read_state update own" on public.user_publication_read_state;
create policy "user_publication_read_state update own"
  on public.user_publication_read_state
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
