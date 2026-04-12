-- Finalisation côté client : pending → completed pour les commandes mise en avant,
-- sans utiliser la colonne payments.type (absente sur plusieurs déploiements réels).
-- Discrimination : metadata JSONB avec payment_kind = 'visibility_boost'.
-- Idempotent : ADD COLUMN / policy IF NOT EXISTS uniquement, aucune suppression de données.

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
    where table_schema = 'public' and table_name = 'payments' and column_name = 'metadata'
  ) then
    return;
  end if;

  alter table public.payments enable row level security;

  drop policy if exists "Users can complete own boost payment" on public.payments;
  drop policy if exists "Users can complete own visibility_boost payment" on public.payments;

  create policy "Users can complete own visibility_boost payment"
    on public.payments
    for update
    to authenticated
    using (
      auth.uid() = user_id
      and coalesce(status, '') = 'pending'
      and coalesce(metadata, '{}'::jsonb)->>'payment_kind' = 'visibility_boost'
    )
    with check (
      auth.uid() = user_id
      and coalesce(status, '') = 'completed'
      and coalesce(metadata, '{}'::jsonb)->>'payment_kind' = 'visibility_boost'
    );
end $$;
