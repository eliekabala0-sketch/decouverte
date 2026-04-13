-- Finalisation côté client : pending → completed pour les commandes boost visibilité.
-- Schéma réel payments : id, user_id, subscription_id, amount, currency, payment_method,
-- payment_provider, transaction_ref, status, created_at, provider.
-- Idempotent, additive, sans suppression de données.

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'payments'
  ) then
    return;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments' and column_name = 'user_id'
  ) then
    return;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments' and column_name = 'status'
  ) then
    return;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments' and column_name = 'provider'
  ) then
    return;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments' and column_name = 'payment_provider'
  ) then
    return;
  end if;

  alter table public.payments enable row level security;

  drop policy if exists "Users can complete own boost payment" on public.payments;
  drop policy if exists "Users can complete own visibility_boost payment" on public.payments;
  drop policy if exists "Users can complete own boost by provider" on public.payments;

  create policy "Users can complete own boost by provider"
    on public.payments
    for update
    to authenticated
    using (
      auth.uid() = user_id
      and coalesce(status, '') = 'pending'
      and coalesce(provider, '') = 'visibility_boost'
      and coalesce(payment_provider, '') = 'Badiboss Pay'
    )
    with check (
      auth.uid() = user_id
      and coalesce(status, '') = 'completed'
      and coalesce(provider, '') = 'visibility_boost'
      and coalesce(payment_provider, '') = 'Badiboss Pay'
    );
end $$;
