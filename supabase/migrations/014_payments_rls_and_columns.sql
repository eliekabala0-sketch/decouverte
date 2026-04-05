-- 014 - Paiements : colonne provider + RLS (insert/select) pour éviter 403/échecs silencieux.
-- profile_access : ré-applique colonnes packs (idempotent) si 013 n’a pas été exécuté en prod.

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'payments') then
    alter table public.payments add column if not exists provider text default 'badiboss_pay';
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profile_access') then
    alter table public.profile_access
      add column if not exists photo_quota int default 0,
      add column if not exists photo_quota_used int default 0,
      add column if not exists all_profiles_access boolean default false;
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'payments') then
    drop policy if exists "Users can insert own payments" on public.payments;
    create policy "Users can insert own payments"
      on public.payments for insert
      with check (auth.uid() = user_id);

    drop policy if exists "Users can select own payments" on public.payments;
    create policy "Users can select own payments"
      on public.payments for select
      using (auth.uid() = user_id);
  end if;
end $$;
