-- 012 - Policies admin pour campagnes et messages de masse
-- Objectif : permettre aux comptes admin (emails découverts) de créer/mettre à jour
-- ad_campaigns et mass_messages depuis le front admin (clé anon + session),
-- sans ouvrir ces écritures aux utilisateurs applicatifs normaux.
-- Critère admin minimal : auth.email() LIKE 'admin@decouverte.%'

-- ----- ad_campaigns : écriture réservée aux comptes admin -----
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'ad_campaigns') then
    alter table public.ad_campaigns enable row level security;

    -- Nettoyage éventuel de policies existantes d'écriture
    drop policy if exists "Admin can manage ad_campaigns" on public.ad_campaigns;

    create policy "Admin can manage ad_campaigns"
      on public.ad_campaigns
      for all
      using (auth.email() like 'admin@decouverte.%')
      with check (auth.email() like 'admin@decouverte.%');
  end if;
end $$;

-- ----- mass_messages : écriture réservée aux comptes admin -----
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'mass_messages') then
    alter table public.mass_messages enable row level security;

    -- Nettoyage éventuel de policies existantes d'écriture
    drop policy if exists "Admin can manage mass_messages" on public.mass_messages;

    create policy "Admin can manage mass_messages"
      on public.mass_messages
      for all
      using (auth.email() like 'admin@decouverte.%')
      with check (auth.email() like 'admin@decouverte.%');
  end if;
end $$;

