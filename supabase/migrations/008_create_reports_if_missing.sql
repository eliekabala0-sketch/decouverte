-- Créer la table reports si elle n'existe pas (signalements app + admin).
-- Politiques RLS uniquement si la table existe et contient les colonnes attendues (reporter_id, reported_id).

create table if not exists public.reports (
  id uuid primary key default uuid_generate_v4(),
  reporter_id uuid references auth.users(id) on delete cascade not null,
  reported_id uuid references public.profiles(id) on delete cascade not null,
  type text,
  reason text,
  status text default 'pending' check (status in ('pending', 'reviewed', 'resolved', 'dismissed')),
  created_at timestamptz default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id)
);

-- Politiques uniquement si la table reports existe et a les colonnes attendues
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'reports')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'reports' and column_name = 'reporter_id')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'reports' and column_name = 'reported_id')
  then
    drop policy if exists "Users can insert own reports" on public.reports;
    create policy "Users can insert own reports" on public.reports for insert
      with check (reporter_id = auth.uid());

    drop policy if exists "Reports readable by authenticated" on public.reports;
    create policy "Reports readable by authenticated" on public.reports for select
      using (auth.role() = 'authenticated');

    drop policy if exists "Reports updatable by authenticated" on public.reports;
    create policy "Reports updatable by authenticated" on public.reports for update
      using (auth.role() = 'authenticated');
  end if;
end $$;
