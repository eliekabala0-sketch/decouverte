-- 020 — RLS admin, publications, mass_messages resserré, assistance profils/paiements/galerie, état lecture annonces.
-- is_profiles_admin() en SECURITY DEFINER évite la récursion RLS sur profiles.

create or replace function public.is_profiles_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.role = 'admin'
  );
$$;

revoke all on function public.is_profiles_admin() from public;
grant execute on function public.is_profiles_admin() to authenticated;

-- ----- 1) public_publications : écriture admin -----
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'public_publications'
  ) then
    alter table public.public_publications enable row level security;
    drop policy if exists "Profiles admin manages public_publications" on public.public_publications;
    create policy "Profiles admin manages public_publications"
      on public.public_publications
      for all
      to authenticated
      using (public.is_profiles_admin())
      with check (public.is_profiles_admin());
  end if;
end $$;

-- ----- 2) profiles : admin peut mettre à jour tout profil -----
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'profiles'
  ) then
    drop policy if exists "Profiles admin role can update any profile" on public.profiles;
    create policy "Profiles admin role can update any profile"
      on public.profiles
      for update
      to authenticated
      using (public.is_profiles_admin())
      with check (public.is_profiles_admin());
  end if;
end $$;

-- ----- 3) profile_access : admin -----
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'profile_access'
  ) then
    alter table public.profile_access enable row level security;
    drop policy if exists "Profiles admin role manages profile_access" on public.profile_access;
    create policy "Profiles admin role manages profile_access"
      on public.profile_access
      for all
      to authenticated
      using (public.is_profiles_admin())
      with check (public.is_profiles_admin());
  end if;
end $$;

-- ----- 4) payments : admin lecture -----
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'payments'
  ) then
    alter table public.payments enable row level security;
    drop policy if exists "Profiles admin role can select all payments" on public.payments;
    create policy "Profiles admin role can select all payments"
      on public.payments
      for select
      to authenticated
      using (public.is_profiles_admin());
  end if;
end $$;

-- ----- 5) profile_photos : admin -----
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'profile_photos'
  ) then
    alter table public.profile_photos enable row level security;
    drop policy if exists "Profiles admin role manages profile_photos" on public.profile_photos;
    create policy "Profiles admin role manages profile_photos"
      on public.profile_photos
      for all
      to authenticated
      using (public.is_profiles_admin())
      with check (public.is_profiles_admin());
  end if;
end $$;

-- ----- 6) ad_campaigns -----
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'ad_campaigns'
  ) then
    alter table public.ad_campaigns enable row level security;
    drop policy if exists "Admin can manage ad_campaigns" on public.ad_campaigns;
    create policy "Admin can manage ad_campaigns"
      on public.ad_campaigns
      for all
      to authenticated
      using (
        (coalesce(auth.jwt() ->> 'email', '') ilike 'admin@decouverte.%')
        or public.is_profiles_admin()
      )
      with check (
        (coalesce(auth.jwt() ->> 'email', '') ilike 'admin@decouverte.%')
        or public.is_profiles_admin()
      );
  end if;
end $$;

-- ----- 7) mass_messages : plus d'insert/update pour tout utilisateur -----
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'mass_messages'
  ) then
    alter table public.mass_messages enable row level security;

    drop policy if exists "Mass messages insert by authenticated" on public.mass_messages;
    drop policy if exists "Mass messages updatable by authenticated" on public.mass_messages;
    drop policy if exists "Admin can manage mass_messages" on public.mass_messages;

    create policy "Admin can manage mass_messages"
      on public.mass_messages
      for all
      to authenticated
      using (
        (coalesce(auth.jwt() ->> 'email', '') ilike 'admin@decouverte.%')
        or public.is_profiles_admin()
      )
      with check (
        (coalesce(auth.jwt() ->> 'email', '') ilike 'admin@decouverte.%')
        or public.is_profiles_admin()
      );
  end if;
end $$;

-- ----- 8) Suivi lecture annonces -----
create table if not exists public.user_announcement_read_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_read_announcements_at timestamptz not null default '1970-01-01T00:00:00Z'
);

alter table public.user_announcement_read_state enable row level security;

drop policy if exists "user_announcement_read_state select own" on public.user_announcement_read_state;
create policy "user_announcement_read_state select own"
  on public.user_announcement_read_state
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_announcement_read_state insert own" on public.user_announcement_read_state;
create policy "user_announcement_read_state insert own"
  on public.user_announcement_read_state
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_announcement_read_state update own" on public.user_announcement_read_state;
create policy "user_announcement_read_state update own"
  on public.user_announcement_read_state
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
