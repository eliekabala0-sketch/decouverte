-- RLS pour profile_access : lecture et mise à jour de sa propre ligne uniquement.
-- Nécessaire car le schéma active RLS sur profile_access sans policy, ce qui bloque l'app (AuthContext, déblocage contact).
-- À exécuter dans l'éditeur SQL Supabase si la table profile_access existe.

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profile_access') then
    drop policy if exists "Users can read own profile_access" on public.profile_access;
    create policy "Users can read own profile_access"
      on public.profile_access for select using (auth.uid() = user_id);

    drop policy if exists "Users can update own profile_access" on public.profile_access;
    create policy "Users can update own profile_access"
      on public.profile_access for update using (auth.uid() = user_id);

    drop policy if exists "Users can insert own profile_access" on public.profile_access;
    create policy "Users can insert own profile_access"
      on public.profile_access for insert with check (auth.uid() = user_id);
  end if;
end $$;
