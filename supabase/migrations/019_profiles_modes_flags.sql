-- Ajoute les modes explicites libre/sérieux sur profiles.
-- Permet le choix "libre", "sérieux" ou "les deux" dès création profil.

alter table if exists public.profiles
  add column if not exists mode_libre_active boolean not null default false;

alter table if exists public.profiles
  add column if not exists mode_serieux_active boolean not null default false;

-- Pour les profils historiques: active les deux modes si rien n'est défini.
update public.profiles
set mode_libre_active = true,
    mode_serieux_active = true
where coalesce(mode_libre_active, false) = false
  and coalesce(mode_serieux_active, false) = false;
