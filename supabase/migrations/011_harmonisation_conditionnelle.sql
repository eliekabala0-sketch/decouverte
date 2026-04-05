-- Migration d'harmonisation conditionnelle - Découverte
-- À exécuter après schema ou après 000-010. N'ajoute que ce qui manque.
-- Vérifie l'existence des tables via information_schema ; n'écrase pas l'existant.
-- Priorité : profiles, profile_access, conversations, messages, reports, public_publications, mass_messages, ad_campaigns, contact_packs.

-- Extension
create extension if not exists "uuid-ossp";

-- ----- profiles -----
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

-- ----- profile_access -----
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profile_access') then
    alter table public.profile_access enable row level security;
    drop policy if exists "Users can read own profile_access" on public.profile_access;
    create policy "Users can read own profile_access" on public.profile_access for select using (auth.uid() = user_id);
    drop policy if exists "Users can update own profile_access" on public.profile_access;
    create policy "Users can update own profile_access" on public.profile_access for update using (auth.uid() = user_id);
    drop policy if exists "Users can insert own profile_access" on public.profile_access;
    create policy "Users can insert own profile_access" on public.profile_access for insert with check (auth.uid() = user_id);
  end if;
end $$;

-- ----- conversations -----
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'conversations') then
    alter table public.conversations enable row level security;
    drop policy if exists "Users can read own conversations" on public.conversations;
    create policy "Users can read own conversations" on public.conversations for select using (auth.uid() = any(participant_ids));
    drop policy if exists "Users can insert conversations as participant" on public.conversations;
    create policy "Users can insert conversations as participant" on public.conversations for insert with check (auth.uid() = any(participant_ids));
    drop policy if exists "Users can update own conversations" on public.conversations;
    create policy "Users can update own conversations" on public.conversations for update using (auth.uid() = any(participant_ids));
  end if;
end $$;

-- ----- messages -----
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'messages')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'messages' and column_name = 'conversation_id') then
    alter table public.messages enable row level security;
    drop policy if exists "Users can read messages in own conversations" on public.messages;
    create policy "Users can read messages in own conversations" on public.messages for select
      using (exists (select 1 from public.conversations c where c.id = conversation_id and auth.uid() = any(c.participant_ids)));
    drop policy if exists "Users can send messages in own conversations" on public.messages;
    create policy "Users can send messages in own conversations" on public.messages for insert
      with check (sender_id = auth.uid() and exists (select 1 from public.conversations c where c.id = conversation_id and auth.uid() = any(c.participant_ids)));
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'reports')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'reports' and column_name = 'reporter_id') then
    alter table public.reports enable row level security;
    drop policy if exists "Users can insert own reports" on public.reports;
    create policy "Users can insert own reports" on public.reports for insert with check (reporter_id = auth.uid());
    drop policy if exists "Reports readable by authenticated" on public.reports;
    drop policy if exists "Reports updatable by authenticated" on public.reports;
  end if;
end $$;

-- ----- public_publications -----
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'public_publications') then
    alter table public.public_publications enable row level security;
    drop policy if exists "Public publications readable by authenticated" on public.public_publications;
    create policy "Public publications readable by authenticated" on public.public_publications for select using (auth.role() = 'authenticated');
  end if;
end $$;

-- ----- mass_messages -----
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'mass_messages') then
    alter table public.mass_messages enable row level security;
    drop policy if exists "Mass messages readable by authenticated" on public.mass_messages;
    create policy "Mass messages readable by authenticated" on public.mass_messages for select using (auth.role() = 'authenticated');
    drop policy if exists "Mass messages insert by authenticated" on public.mass_messages;
    drop policy if exists "Mass messages updatable by authenticated" on public.mass_messages;
  end if;
end $$;

-- ----- ad_campaigns -----
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'ad_campaigns') then
    alter table public.ad_campaigns enable row level security;
    drop policy if exists "Ad campaigns readable by authenticated" on public.ad_campaigns;
    create policy "Ad campaigns readable by authenticated" on public.ad_campaigns for select using (auth.role() = 'authenticated');
  end if;
end $$;

-- ----- contact_packs -----
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'contact_packs') then
    alter table public.contact_packs enable row level security;
    drop policy if exists "Contact packs readable by authenticated" on public.contact_packs;
    create policy "Contact packs readable by authenticated" on public.contact_packs for select using (auth.role() = 'authenticated');
  end if;
end $$;
