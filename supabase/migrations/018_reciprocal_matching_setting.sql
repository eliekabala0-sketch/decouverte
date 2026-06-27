-- Paramètre admin: active/désactive la recherche réciproque.
-- Par défaut false: fonctionnement non réciproque.

insert into public.admin_settings (key, value)
select 'reciprocal_matching_enabled', to_jsonb(false)
where not exists (
  select 1 from public.admin_settings where key = 'reciprocal_matching_enabled'
);
