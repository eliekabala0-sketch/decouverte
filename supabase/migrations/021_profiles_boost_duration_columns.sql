-- Colonnes optionnelles pour fin de campagne boost (additive, idempotent).
-- Sans effet sur les lignes existantes ; l’app peut lire boosted_until pour tri / badge.

alter table if exists public.profiles
  add column if not exists boosted_until timestamptz;

alter table if exists public.profiles
  add column if not exists is_boosted boolean default false;
