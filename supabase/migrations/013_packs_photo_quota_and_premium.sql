-- 013 - Packs: quotas photos + option premium, et suivi côté profile_access
-- Minimal: ajoute des colonnes (sans supprimer/modifier les données existantes).

do $$
begin
  -- ----- contact_packs -----
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'contact_packs') then
    alter table public.contact_packs
      add column if not exists contact_quota int,
      add column if not exists photo_quota int,
      add column if not exists all_profiles_access boolean default false;

    -- Garder compatibilité: si contact_quota est NULL, on utilise quota (existant) côté app/admin.
  end if;

  -- ----- profile_access -----
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profile_access') then
    alter table public.profile_access
      add column if not exists photo_quota int default 0,
      add column if not exists photo_quota_used int default 0,
      add column if not exists all_profiles_access boolean default false;
  end if;
end $$;

