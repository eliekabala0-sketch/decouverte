-- 037 - P2: approximate IP location metadata for admin-only diagnostics.
-- Non destructive. Stores no raw IP address.

alter table public.profiles
  add column if not exists ip_country text,
  add column if not exists ip_region text,
  add column if not exists ip_city text,
  add column if not exists ip_hash text,
  add column if not exists ip_source text,
  add column if not exists ip_confidence numeric,
  add column if not exists ip_last_seen_at timestamptz,
  add column if not exists ip_city_mismatch boolean;

create index if not exists profiles_ip_city_idx on public.profiles (ip_city);
create index if not exists profiles_ip_last_seen_idx on public.profiles (ip_last_seen_at);

notify pgrst, 'reload schema';
