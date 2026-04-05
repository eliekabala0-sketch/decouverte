-- Découverte - Schéma Supabase
-- Exécuter dans l'éditeur SQL Supabase
--
-- Règles métier reflétées dans ce schéma :
-- - Homme (M) : accès aux profils/photos conditionné par paiement (profiles_access_until).
-- - Femme (F) : inscription libre ; accès aux profils/photos non conditionné par paiement 1.
-- - Mode Libre / Mode Sérieux : mode_libre_active, mode_serieux_active, serieux_intention.
-- - Paiement 1 : accès profils/photos pendant 30 jours → profile_access.profiles_access_until.
-- - Paiement 2 : packs contacts avec quotas modifiables par l'admin (ex. 1, 3, 5, 10).
-- - Publications : admin en premier (is_pinned pour mise en avant).
-- - Campagnes publicitaires, messages de masse, paramètres admin activables/désactivables.
-- - Paiement : moteur prévu Badiboss Pay (payments.provider = 'badiboss_pay').

-- Extensions
create extension if not exists "uuid-ossp";

-- RLS policies (à adapter selon vos rôles)
alter table if exists auth.users enable row level security;

-- Profils (lié à auth.users via user_id)
-- gender 'M' = homme (accès profils conditionné par paiement), 'F' = femme (inscription libre)
create table if not exists public.profiles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  display_name text not null,
  gender text not null check (gender in ('M', 'F', 'other')),
  birth_date date not null,
  city text not null,
  commune text not null,
  bio text,
  avatar_url text,
  photo_urls text[] default '{}',
  mode_libre_active boolean default false,
  mode_serieux_active boolean default false,
  serieux_intention text check (serieux_intention in ('amitie', 'copinage', 'amour', 'mariage')),
  status text default 'active' check (status in ('active', 'suspended', 'banned')),
  is_verified boolean default false,
  is_boosted boolean default false,
  boosted_until timestamptz,
  boost_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_profiles_user_id on public.profiles(user_id);
create index if not exists idx_profiles_status on public.profiles(status);
create index if not exists idx_profiles_city on public.profiles(city);
create index if not exists idx_profiles_mode_libre on public.profiles(mode_libre_active);
create index if not exists idx_profiles_mode_serieux on public.profiles(mode_serieux_active);

-- Accès utilisateur (quotas et accès profils)
-- Pour les hommes : profiles_access_until doit être renseigné (paiement 1) pour voir photos/profils complets.
-- Pour les femmes : accès libre (inscription libre) ; profiles_access_until peut rester null ou être ignoré en logique.
-- contact_quota / contact_quota_used = paiement 2 (packs contacts, ex. 1, 3, 5, 10).
create table if not exists public.profile_access (
  user_id uuid references auth.users(id) on delete cascade primary key,
  profiles_access_until timestamptz,
  contact_quota int default 0,
  contact_quota_used int default 0,
  updated_at timestamptz default now()
);

-- Packs contacts (gérés par l'admin ; quotas modifiables sans déploiement, ex. 1, 3, 5, 10)
create table if not exists public.contact_packs (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  quota int not null,
  price_cents int not null,
  currency text default 'USD',
  is_active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- Paiements
-- type 'profiles_access' = paiement 1 (accès profils/photos 30 jours), 'contact_pack' = paiement 2, 'boost' = mise en avant.
-- provider = moteur de paiement (ex. 'badiboss_pay').
create table if not exists public.payments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null check (type in ('profiles_access', 'contact_pack', 'boost')),
  provider text default 'badiboss_pay',
  amount_cents int not null,
  currency text default 'USD',
  status text default 'pending' check (status in ('pending', 'completed', 'failed', 'refunded')),
  reference text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index if not exists idx_payments_user_id on public.payments(user_id);

-- Pour base déjà créée sans la colonne provider : décommenter et exécuter une fois
-- ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS provider text DEFAULT 'badiboss_pay';

-- Conversations
create table if not exists public.conversations (
  id uuid primary key default uuid_generate_v4(),
  participant_ids uuid[] not null,
  last_message_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Messages
create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  sender_id uuid references auth.users(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now(),
  read_at timestamptz
);

create index if not exists idx_messages_conversation on public.messages(conversation_id);

-- Publications publiques (admin d'abord : seules les publications de l'admin sont prévues en premier ; is_pinned = en premier pour tous)
create table if not exists public.public_publications (
  id uuid primary key default uuid_generate_v4(),
  author_id uuid references auth.users(id) on delete set null,
  title text not null,
  content text not null,
  content_type text default 'text' check (content_type in ('text', 'image', 'video')),
  image_url text,
  video_url text,
  is_pinned boolean default false,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Campagnes publicitaires
create table if not exists public.ad_campaigns (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  image_url text not null,
  text text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  audience text default 'all' check (audience in ('all', 'men', 'women', 'paying', 'non_paying')),
  priority int default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Signalements
create table if not exists public.reports (
  id uuid primary key default uuid_generate_v4(),
  reporter_id uuid references auth.users(id) on delete cascade not null,
  reported_id uuid references public.profiles(id) on delete cascade not null,
  type text,
  reason text,
  status text default 'pending' check (status in ('pending', 'reviewed', 'resolved', 'dismissed')),
  created_at timestamptz default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id)
);

-- Messages de masse
create table if not exists public.mass_messages (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  body text not null,
  content_type text default 'text' check (content_type in ('text', 'image', 'video')),
  image_url text,
  video_url text,
  segment text not null check (segment in ('all', 'men', 'women', 'paying', 'non_paying', 'city', 'commune', 'mode_libre', 'mode_serieux')),
  segment_value text,
  sent_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- Paramètres admin (fonctionnalités activables/désactivables)
create table if not exists public.admin_settings (
  id uuid primary key default uuid_generate_v4(),
  key text unique not null,
  value jsonb not null,
  updated_at timestamptz default now()
);

-- Paramètres admin (fonctionnalités activables/désactivables sans toucher au code)
insert into public.admin_settings (key, value) values
  ('mode_libre_enabled', 'true'),
  ('mode_serieux_enabled', 'true'),
  ('public_publications_enabled', 'true'),
  ('ad_campaigns_enabled', 'true'),
  ('mass_messages_enabled', 'true'),
  ('boost_enabled', 'true'),
  ('reporting_enabled', 'true'),
  ('display_photos_enabled', 'true'),
  ('direct_contact_access_enabled', 'false'),
  ('match_required_enabled', 'false'),
  ('badges_enabled', 'true'),
  ('profile_verification_enabled', 'true'),
  ('contact_packs_enabled', 'true'),
  ('promo_offers_enabled', 'true')
on conflict (key) do nothing;

-- RLS (exemple : les utilisateurs voient leur propre profil)
alter table public.profiles enable row level security;
alter table public.profile_access enable row level security;
alter table public.payments enable row level security;
alter table public.contact_packs enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.public_publications enable row level security;
alter table public.ad_campaigns enable row level security;
alter table public.reports enable row level security;
alter table public.admin_settings enable row level security;

create policy "Users can read own profile" on public.profiles for select using (auth.uid() = user_id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = user_id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = user_id);

-- Politiques à compléter selon vos règles métier (lecture profils autres, conversations, etc.)
-- Exemple lecture profils (selon accès payant à gérer en app ou en fonction RPC)
create policy "Profiles are readable by authenticated" on public.profiles for select using (auth.role() = 'authenticated');

-- Lecture app utilisateur (publications, campagnes, packs)
create policy "Public publications readable by authenticated" on public.public_publications for select using (auth.role() = 'authenticated');
create policy "Ad campaigns readable by authenticated" on public.ad_campaigns for select using (auth.role() = 'authenticated');
create policy "Contact packs readable by authenticated" on public.contact_packs for select using (auth.role() = 'authenticated');

-- Conversations et messages : participants uniquement
create policy "Users can read own conversations" on public.conversations for select using (auth.uid() = any(participant_ids));
create policy "Users can insert conversations as participant" on public.conversations for insert with check (auth.uid() = any(participant_ids));
create policy "Users can update own conversations" on public.conversations for update using (auth.uid() = any(participant_ids));
create policy "Users can read messages in own conversations" on public.messages for select using (
  exists (select 1 from public.conversations c where c.id = conversation_id and auth.uid() = any(c.participant_ids))
);
create policy "Users can send messages in own conversations" on public.messages for insert with check (
  sender_id = auth.uid() and exists (select 1 from public.conversations c where c.id = conversation_id and auth.uid() = any(c.participant_ids))
);
