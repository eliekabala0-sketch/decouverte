-- Autorise explicitement l'admin (profiles.role='admin') à insérer des paiements
-- pour d'autres utilisateurs (cas cadeau pack / geste commercial).
-- Additif, idempotent, sans suppression de données.

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'payments'
  ) then
    return;
  end if;

  alter table public.payments enable row level security;

  drop policy if exists "Profiles admin role can insert gift payments" on public.payments;
  create policy "Profiles admin role can insert gift payments"
    on public.payments
    for insert
    to authenticated
    with check (public.is_profiles_admin());
end $$;
