-- Créer les tables attendues par le dashboard admin si elles n'existent pas.
-- N'utilise que CREATE TABLE IF NOT EXISTS : aucune table existante n'est modifiée ni supprimée.
-- Exécuter après 001 dans l'éditeur SQL Supabase.

create extension if not exists "uuid-ossp";

-- Packs contacts (section "Packs contacts" du dashboard)
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

-- Publications publiques (section "Publications" du dashboard)
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

-- Messages de masse (section "Messages de masse" du dashboard)
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

-- Paramètres admin (section "Paramètres" du dashboard)
create table if not exists public.admin_settings (
  id uuid primary key default uuid_generate_v4(),
  key text unique not null,
  value jsonb not null,
  updated_at timestamptz default now()
);

-- Valeurs par défaut des paramètres (ignoré si la clé existe déjà ; ignoré si la table a une structure différente)
DO $$
BEGIN
  INSERT INTO public.admin_settings (key, value) VALUES
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
  ON CONFLICT (key) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  NULL; -- table existante avec structure différente : ignorer
END $$;
