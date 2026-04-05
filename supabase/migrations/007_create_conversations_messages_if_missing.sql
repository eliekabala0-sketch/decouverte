-- Créer les tables conversations et messages si elles n'existent pas.
-- Ne suppose aucune structure existante : création minimale, index uniquement si la colonne existe.
-- Référence : schema.sql et usage app/admin (conversations, messages, conversation_id, participant_ids).

create extension if not exists "uuid-ossp";

-- Table conversations (attendue par l'app et l'admin)
create table if not exists public.conversations (
  id uuid primary key default uuid_generate_v4(),
  participant_ids uuid[] not null,
  last_message_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Table messages (attendue par l'app ; FK vers conversations)
create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  sender_id uuid references auth.users(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now(),
  read_at timestamptz
);

-- Index uniquement si la colonne conversation_id existe (évite erreur si messages a une autre structure)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = 'conversation_id'
  ) then
    create index if not exists idx_messages_conversation on public.messages(conversation_id);
  end if;
end $$;
