-- Colonne manquante pour l'UI (ville + commune) + confirmation RLS profils (flux authentifié).
-- À exécuter sur le projet Supabase (SQL Editor ou CLI).

alter table if exists public.profiles add column if not exists commune text;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profiles') then
    alter table public.profiles enable row level security;
    drop policy if exists "Users can read own profile" on public.profiles;
    create policy "Users can read own profile" on public.profiles for select using (auth.uid() = id);
    drop policy if exists "Users can update own profile" on public.profiles;
    create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
    drop policy if exists "Users can insert own profile" on public.profiles;
    create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);
    drop policy if exists "Profiles are readable by authenticated" on public.profiles;
    create policy "Profiles are readable by authenticated" on public.profiles for select using (auth.role() = 'authenticated');
  end if;
end $$;
