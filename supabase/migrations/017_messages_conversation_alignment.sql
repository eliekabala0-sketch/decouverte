-- Aligne messages avec le flux app (conversation_id, sender_id, read_at).
-- Non destructif: conserve les colonnes legacy sender/receiver.

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'messages') then
    alter table public.messages add column if not exists conversation_id uuid references public.conversations(id) on delete cascade;
    alter table public.messages add column if not exists sender_id uuid references auth.users(id) on delete cascade;
    alter table public.messages add column if not exists read_at timestamptz;

    create index if not exists idx_messages_conversation_id on public.messages(conversation_id);
    create index if not exists idx_messages_sender_id on public.messages(sender_id);

    -- Backfill sender_id selon le type réel de messages.sender.
    -- Cas 1: sender est déjà uuid -> copie directe.
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'messages'
        and column_name = 'sender'
        and data_type = 'uuid'
    ) then
      update public.messages
        set sender_id = sender
      where sender_id is null
        and sender is not null;
    -- Cas 2: sender est texte -> cast sécurisé uniquement si valeur UUID valide.
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'messages'
        and column_name = 'sender'
        and data_type in ('text', 'character varying', 'character')
    ) then
      update public.messages
        set sender_id = sender::uuid
      where sender_id is null
        and sender is not null
        and sender ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
    end if;

    alter table public.messages enable row level security;

    drop policy if exists "Users can read messages in own conversations" on public.messages;
    create policy "Users can read messages in own conversations"
      on public.messages for select
      using (
        conversation_id is not null and exists (
          select 1 from public.conversations c
          where c.id = conversation_id and auth.uid() = any(c.participant_ids)
        )
      );

    drop policy if exists "Users can send messages in own conversations" on public.messages;
    create policy "Users can send messages in own conversations"
      on public.messages for insert
      with check (
        conversation_id is not null
        and sender_id = auth.uid()
        and exists (
          select 1 from public.conversations c
          where c.id = conversation_id and auth.uid() = any(c.participant_ids)
        )
      );
  end if;
end $$;
