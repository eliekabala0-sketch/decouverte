-- Lecture (app Annonces) et mise à jour (admin Envoyer) des messages de masse.
-- À exécuter seulement si la table mass_messages existe. Aucune supposition sur les colonnes.

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'mass_messages') then
    drop policy if exists "Mass messages readable by authenticated" on public.mass_messages;
    create policy "Mass messages readable by authenticated"
      on public.mass_messages for select using (auth.role() = 'authenticated');

    drop policy if exists "Mass messages insert by authenticated" on public.mass_messages;
    create policy "Mass messages insert by authenticated"
      on public.mass_messages for insert with check (auth.role() = 'authenticated');

    drop policy if exists "Mass messages updatable by authenticated" on public.mass_messages;
    create policy "Mass messages updatable by authenticated"
      on public.mass_messages for update using (auth.role() = 'authenticated');
  end if;
end $$;
