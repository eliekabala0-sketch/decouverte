-- 014 - RLS contact_packs : admin write, users read
-- Admin = auth.email() LIKE 'admin@decouverte.%'
-- Users = lecture uniquement (authenticated)

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'contact_packs') then
    alter table public.contact_packs enable row level security;

    -- Lecture pour utilisateurs connectés
    drop policy if exists "Contact packs readable by authenticated" on public.contact_packs;
    create policy "Contact packs readable by authenticated"
      on public.contact_packs
      for select
      using (auth.role() = 'authenticated');

    -- Ecriture réservée admin
    drop policy if exists "Admin can insert contact_packs" on public.contact_packs;
    create policy "Admin can insert contact_packs"
      on public.contact_packs
      for insert
      with check (auth.email() like 'admin@decouverte.%');

    drop policy if exists "Admin can update contact_packs" on public.contact_packs;
    create policy "Admin can update contact_packs"
      on public.contact_packs
      for update
      using (auth.email() like 'admin@decouverte.%')
      with check (auth.email() like 'admin@decouverte.%');

    drop policy if exists "Admin can delete contact_packs" on public.contact_packs;
    create policy "Admin can delete contact_packs"
      on public.contact_packs
      for delete
      using (auth.email() like 'admin@decouverte.%');
  end if;
end $$;

