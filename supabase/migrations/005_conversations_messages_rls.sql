-- RLS pour conversations et messages.
-- À exécuter uniquement après 007. Ne touche à une table que si elle existe ;
-- pour messages, n'ajoute des politiques que si conversations existe ET messages contient conversation_id.

-- Politiques conversations (si la table existe)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'conversations') then
    drop policy if exists "Users can read own conversations" on public.conversations;
    create policy "Users can read own conversations"
      on public.conversations for select using (auth.uid() = any(participant_ids));

    drop policy if exists "Users can insert conversations as participant" on public.conversations;
    create policy "Users can insert conversations as participant"
      on public.conversations for insert with check (auth.uid() = any(participant_ids));

    drop policy if exists "Users can update own conversations" on public.conversations;
    create policy "Users can update own conversations"
      on public.conversations for update using (auth.uid() = any(participant_ids));
  end if;
end $$;

-- Politiques messages (seulement si conversations existe ET messages a la colonne conversation_id)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'conversations')
     and exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'messages')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'messages' and column_name = 'conversation_id')
  then
    drop policy if exists "Users can read messages in own conversations" on public.messages;
    create policy "Users can read messages in own conversations"
      on public.messages for select
      using (
        exists (
          select 1 from public.conversations c
          where c.id = conversation_id and auth.uid() = any(c.participant_ids)
        )
      );

    drop policy if exists "Users can send messages in own conversations" on public.messages;
    create policy "Users can send messages in own conversations"
      on public.messages for insert
      with check (
        sender_id = auth.uid()
        and exists (
          select 1 from public.conversations c
          where c.id = conversation_id and auth.uid() = any(c.participant_ids)
        )
      );
  end if;
end $$;
