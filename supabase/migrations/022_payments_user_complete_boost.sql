-- Permet au client (auth.uid) de finaliser uniquement ses paiements boost encore « pending »
-- après passage sur Badiboss (simulation ou réel). Aucune suppression de données.

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'payments'
  ) then
    alter table public.payments enable row level security;

    drop policy if exists "Users can complete own boost payment" on public.payments;
    create policy "Users can complete own boost payment"
      on public.payments
      for update
      to authenticated
      using (
        auth.uid() = user_id
        and type = 'boost'
        and status = 'pending'
      )
      with check (
        auth.uid() = user_id
        and type = 'boost'
        and status = 'completed'
      );
  end if;
end $$;
