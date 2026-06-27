-- Découverte - schéma de référence Supabase
--
-- Source de vérité pour les nouveaux environnements. Les migrations restent
-- additives/idempotentes pour les bases existantes déjà déployées.
--
-- Modèle opérationnel actuel:
-- - public.profiles.id = auth.users.id
-- - l'app utilise username, phone, photo, gender, age, city, commune
-- - l'administration utilise profiles.role = 'admin'
-- - les règles sensibles doivent être portées progressivement par RPC/RLS,
--   pas seulement par masquage côté client.

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Profils et accès
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text,
  photo text,
  gender text not null check (gender in ('M', 'F', 'other')),
  city text not null,
  commune text,
  bio text,
  status text not null default 'active' check (status in ('active', 'suspended', 'banned')),
  is_verified boolean not null default false,
  username text not null,
  age integer not null check (age >= 18),
  mode_libre_active boolean not null default true,
  mode_serieux_active boolean not null default false,
  boost_reason text,
  boosted_until timestamptz,
  is_boosted boolean not null default false,
  country text default 'CD',
  role text default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_status on public.profiles(status);
create index if not exists idx_profiles_gender on public.profiles(gender);
create index if not exists idx_profiles_city on public.profiles(city);
create index if not exists idx_profiles_mode_libre on public.profiles(mode_libre_active);
create index if not exists idx_profiles_mode_serieux on public.profiles(mode_serieux_active);
create index if not exists idx_profiles_boosted_until on public.profiles(boosted_until);

create table if not exists public.profile_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profiles_access_until timestamptz,
  contact_quota integer not null default 0,
  contact_quota_used integer not null default 0,
  photo_quota integer not null default 0,
  photo_quota_used integer not null default 0,
  all_profiles_access boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.profile_photos (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  photo_url text not null,
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_profile_photos_user_id on public.profile_photos(user_id);
create index if not exists idx_profile_photos_primary
  on public.profile_photos(user_id, is_primary desc, sort_order asc, created_at asc);

-- Accès courant par profil cible. Cette table empêche de faire repayer
-- plusieurs fois le même accès actif au même profil.
create table if not exists public.profile_access_entitlements (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_profile_id uuid not null references public.profiles(id) on delete cascade,
  access_type text not null check (access_type in ('profile', 'photo', 'contact', 'conversation')),
  mode text not null default 'global' check (mode in ('global', 'libre', 'serieux')),
  source text not null default 'admin_grant'
    check (source in ('admin_grant', 'subscription', 'credit', 'payment', 'legacy', 'webhook')),
  payment_id text,
  granted_by uuid references auth.users(id),
  credits_spent integer not null default 0,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  reason text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, target_profile_id, access_type)
);

create index if not exists idx_profile_access_entitlements_user
  on public.profile_access_entitlements(user_id, access_type, revoked_at, expires_at);
create index if not exists idx_profile_access_entitlements_target
  on public.profile_access_entitlements(target_profile_id);
create unique index if not exists idx_profile_access_user_id_unique
  on public.profile_access(user_id);

create table if not exists public.profile_access_events (
  id uuid primary key default uuid_generate_v4(),
  entitlement_id uuid references public.profile_access_entitlements(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  target_profile_id uuid references public.profiles(id) on delete set null,
  access_type text,
  event_type text not null,
  actor_id uuid references auth.users(id) on delete set null,
  payment_id text,
  credits_spent integer not null default 0,
  reason text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Paiements, crédits, abonnements, boost
-- ---------------------------------------------------------------------------

create table if not exists public.contact_packs (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  quota integer not null default 0,
  contact_quota integer,
  photo_quota integer,
  all_profiles_access boolean not null default false,
  price_cents integer not null default 0,
  currency text not null default 'USD',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  type text,
  provider text default 'badiboss_pay',
  payment_provider text,
  payment_method text,
  transaction_ref text,
  subscription_id text,
  amount numeric,
  amount_cents integer,
  currency text not null default 'USD',
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'refunded')),
  reference text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_payments_user_id on public.payments(user_id);
create index if not exists idx_payments_status_provider on public.payments(status, provider);

create table if not exists public.payment_events (
  id uuid primary key default uuid_generate_v4(),
  payment_id text,
  provider text not null default 'badiboss_pay',
  event_type text not null,
  event_id text,
  signature_valid boolean not null default false,
  processed_at timestamptz,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create unique index if not exists idx_payment_events_provider_event_id
  on public.payment_events(provider, event_id)
  where event_id is not null;

create table if not exists public.user_credit_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  contact_credits integer not null default 0,
  photo_credits integer not null default 0,
  premium_credits integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_key text not null,
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled', 'granted')),
  source text not null default 'payment' check (source in ('payment', 'admin_grant', 'webhook', 'legacy')),
  payment_id text,
  granted_by uuid references auth.users(id) on delete set null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_subscriptions_user_status
  on public.user_subscriptions(user_id, status, ends_at);

-- ---------------------------------------------------------------------------
-- Conversations, contenus, modération
-- ---------------------------------------------------------------------------

create table if not exists public.conversations (
  id uuid primary key default uuid_generate_v4(),
  participant_ids uuid[] not null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists idx_messages_conversation on public.messages(conversation_id);
create index if not exists idx_messages_sender on public.messages(sender_id);

create table if not exists public.public_publications (
  id uuid primary key default uuid_generate_v4(),
  author_id uuid references auth.users(id) on delete set null,
  title text not null,
  content text not null,
  content_type text not null default 'text' check (content_type in ('text', 'image', 'video')),
  image_url text,
  video_url text,
  is_pinned boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ad_campaigns (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  image_url text not null,
  text text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  audience text not null default 'all' check (audience in ('all', 'men', 'women', 'paying', 'non_paying')),
  priority integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default uuid_generate_v4(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  type text,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id)
);

create table if not exists public.mass_messages (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  body text not null,
  content_type text not null default 'text' check (content_type in ('text', 'image', 'video')),
  image_url text,
  video_url text,
  segment text not null check (segment in ('all', 'men', 'women', 'paying', 'non_paying', 'city', 'commune', 'mode_libre', 'mode_serieux')),
  segment_value text,
  sent_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.user_announcement_read_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_read_announcements_at timestamptz not null default '1970-01-01T00:00:00Z'
);

create table if not exists public.user_publication_read_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_read_publications_at timestamptz not null default '1970-01-01T00:00:00Z'
);

-- ---------------------------------------------------------------------------
-- Paramètres et audit
-- ---------------------------------------------------------------------------

create table if not exists public.admin_settings (
  id uuid primary key default uuid_generate_v4(),
  key text unique not null,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.admin_settings (key, value) values
  ('mode_libre_enabled', 'true'),
  ('mode_serieux_enabled', 'true'),
  ('reciprocal_matching_enabled', 'false'),
  ('public_publications_enabled', 'true'),
  ('ad_campaigns_enabled', 'true'),
  ('mass_messages_enabled', 'true'),
  ('boost_enabled', 'true'),
  ('reporting_enabled', 'true'),
  ('display_photos_enabled', 'true'),
  ('direct_contact_access_enabled', 'false'),
  ('female_non_reciprocal_feed_limit', '24'),
  ('feed_default_page_size', '20'),
  ('feed_max_page_size', '50'),
  ('male_boost_requires_reciprocity', 'true'),
  ('match_required_enabled', 'false'),
  ('badges_enabled', 'true'),
  ('profile_verification_enabled', 'true'),
  ('contact_packs_enabled', 'true'),
  ('promo_offers_enabled', 'true'),
  ('visibility_boost_offers', '[{"id":"boost_7","label":"7 jours","days":7,"amount":9.99,"active":true},{"id":"boost_14","label":"14 jours","days":14,"amount":17.99,"active":true},{"id":"boost_30","label":"30 jours","days":30,"amount":29.99,"active":true}]')
on conflict (key) do nothing;

create table if not exists public.audit_events (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  reason text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_events_actor_created on public.audit_events(actor_id, created_at desc);
create index if not exists idx_audit_events_target_created on public.audit_events(target_user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Fonctions utilitaires
-- ---------------------------------------------------------------------------

create or replace function public.is_profiles_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and pr.role = 'admin'
  );
$$;

create or replace function public.normalize_profile_gender(raw_gender text)
returns text
language sql
immutable
as $$
  select case
    when lower(coalesce(raw_gender, '')) in ('m', 'male', 'man', 'homme', 'h') then 'M'
    when lower(coalesce(raw_gender, '')) in ('f', 'female', 'woman', 'femme') then 'F'
    else coalesce(raw_gender, 'other')
  end;
$$;

create or replace function public.get_profile_feed(
  p_mode text default 'libre',
  p_page integer default 0,
  p_page_size integer default 20
)
returns table (
  id uuid,
  created_at timestamptz,
  photo text,
  gender text,
  city text,
  commune text,
  bio text,
  status text,
  is_verified boolean,
  username text,
  age integer,
  mode_libre_active boolean,
  mode_serieux_active boolean,
  boost_reason text,
  boosted_until timestamptz,
  is_boosted boolean,
  country text,
  role text,
  can_view_full boolean,
  is_limited_teaser boolean,
  active_boost boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  viewer_gender text;
  reciprocal_enabled boolean := false;
  libre_enabled boolean := true;
  serieux_enabled boolean := true;
  male_boost_needs_reciprocity boolean := true;
  female_limit integer := 24;
  default_size integer := 20;
  max_size integer := 50;
  effective_page integer := greatest(coalesce(p_page, 0), 0);
  effective_size integer;
  effective_mode text := case when p_mode = 'serieux' then 'serieux' else 'libre' end;
  limited_for_viewer boolean := false;
begin
  if viewer is null then
    raise exception 'authenticated user required';
  end if;

  select public.normalize_profile_gender(pr.gender)
    into viewer_gender
  from public.profiles pr
  where pr.id = viewer;

  if viewer_gender is null then
    raise exception 'viewer profile required';
  end if;

  select coalesce((select (value #>> '{}')::boolean from public.admin_settings where key = 'reciprocal_matching_enabled'), false)
    into reciprocal_enabled;
  select coalesce((select (value #>> '{}')::boolean from public.admin_settings where key = 'mode_libre_enabled'), true)
    into libre_enabled;
  select coalesce((select (value #>> '{}')::boolean from public.admin_settings where key = 'mode_serieux_enabled'), true)
    into serieux_enabled;
  select coalesce((select (value #>> '{}')::boolean from public.admin_settings where key = 'male_boost_requires_reciprocity'), true)
    into male_boost_needs_reciprocity;
  select greatest(coalesce((select (value #>> '{}')::integer from public.admin_settings where key = 'female_non_reciprocal_feed_limit'), 24), 0)
    into female_limit;
  select greatest(coalesce((select (value #>> '{}')::integer from public.admin_settings where key = 'feed_default_page_size'), 20), 1)
    into default_size;
  select greatest(coalesce((select (value #>> '{}')::integer from public.admin_settings where key = 'feed_max_page_size'), 50), 1)
    into max_size;

  effective_size := least(greatest(coalesce(p_page_size, default_size), 1), max_size);

  if effective_mode = 'serieux' and not serieux_enabled then
    return;
  end if;
  if effective_mode = 'libre' and not libre_enabled then
    return;
  end if;

  limited_for_viewer := viewer_gender = 'F' and not reciprocal_enabled;
  if limited_for_viewer then
    effective_size := least(effective_size, female_limit);
  end if;

  return query
  with candidates as (
    select
      pr.*,
      public.normalize_profile_gender(pr.gender) as normalized_gender,
      (
        (pr.boosted_until is not null and pr.boosted_until > now())
        or coalesce(nullif(pr.boost_reason, ''), null) is not null
      ) as raw_boost
    from public.profiles pr
    where pr.id <> viewer
      and pr.status = 'active'
      and (
        (effective_mode = 'serieux' and coalesce(pr.mode_serieux_active, true))
        or (effective_mode = 'libre' and coalesce(pr.mode_libre_active, true))
      )
      and (
        (viewer_gender = 'M' and public.normalize_profile_gender(pr.gender) = 'F')
        or (viewer_gender = 'F' and public.normalize_profile_gender(pr.gender) = 'M')
        or (viewer_gender not in ('M', 'F'))
      )
  ),
  ranked as (
    select
      c.*,
      (
        c.raw_boost
        and (
          c.normalized_gender = 'F'
          or reciprocal_enabled
          or not male_boost_needs_reciprocity
        )
      ) as effective_boost,
      count(*) over () as full_count,
      row_number() over (
        order by
          (
            c.raw_boost
            and (
              c.normalized_gender = 'F'
              or reciprocal_enabled
              or not male_boost_needs_reciprocity
            )
          ) desc,
          c.boosted_until desc nulls last,
          c.created_at desc
      ) as rn
    from candidates c
  ),
  visible_rows as (
    select
      r.*,
      (
        r.id = viewer
        or public.has_profile_entitlement(viewer, r.id, 'photo')
        or exists (
          select 1
          from public.profile_access pa
          where pa.user_id = viewer
            and (
              coalesce(pa.all_profiles_access, false)
              or (pa.profiles_access_until is not null and pa.profiles_access_until > now())
            )
        )
        or exists (
          select 1
          from public.profiles admin_profile
          where admin_profile.id = viewer
            and admin_profile.role = 'admin'
        )
      ) as row_can_view_full
    from ranked r
  )
  select
    vr.id,
    vr.created_at::timestamptz,
    case when limited_for_viewer or not vr.row_can_view_full then null else vr.photo end as photo,
    vr.normalized_gender as gender,
    vr.city,
    vr.commune,
    case when limited_for_viewer or not vr.row_can_view_full then null else vr.bio end as bio,
    vr.status,
    vr.is_verified,
    case when limited_for_viewer or not vr.row_can_view_full then 'Profil' else vr.username end as username,
    vr.age,
    vr.mode_libre_active,
    vr.mode_serieux_active,
    vr.boost_reason,
    vr.boosted_until::timestamptz,
    vr.is_boosted,
    vr.country,
    vr.role,
    (not limited_for_viewer and vr.row_can_view_full) as can_view_full,
    (limited_for_viewer or not vr.row_can_view_full) as is_limited_teaser,
    vr.effective_boost as active_boost,
    vr.full_count as total_count
  from visible_rows vr
  where vr.rn > effective_page * effective_size
    and vr.rn <= (effective_page + 1) * effective_size
    and (not limited_for_viewer or vr.rn <= female_limit)
  order by vr.rn;
end;
$$;

create or replace function public.get_profile_private_details(
  p_target_profile_id uuid
)
returns table (
  id uuid,
  photo text,
  bio text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
begin
  if viewer is null then
    raise exception 'authenticated user required';
  end if;

  if not public.can_access_profile_photos(viewer, p_target_profile_id) then
    raise exception 'profile photo access required';
  end if;

  return query
  select pr.id, pr.photo, pr.bio
  from public.profiles pr
  where pr.id = p_target_profile_id
    and pr.status = 'active';
end;
$$;

create or replace function public.mark_conversation_read(
  p_conversation_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  changed_count integer := 0;
begin
  if viewer is null then
    raise exception 'authenticated user required';
  end if;

  if not exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and viewer = any(c.participant_ids)
  ) then
    raise exception 'conversation access denied';
  end if;

  update public.messages m
  set read_at = now()
  where m.conversation_id = p_conversation_id
    and m.sender_id <> viewer
    and m.read_at is null;

  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;

create or replace function public.can_access_profile_photos(viewer_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    viewer_id = target_user_id
    or exists (
      select 1 from public.profiles pr
      where pr.id = viewer_id and pr.role = 'admin'
    )
    or exists (
      select 1 from public.profile_access pa
      where pa.user_id = viewer_id
        and (
          coalesce(pa.all_profiles_access, false)
          or coalesce(pa.photo_quota, 0) > coalesce(pa.photo_quota_used, 0)
          or (pa.profiles_access_until is not null and pa.profiles_access_until > now())
        )
    )
    or exists (
      select 1 from public.profile_access_entitlements pe
      where pe.user_id = viewer_id
        and pe.target_profile_id = target_user_id
        and pe.access_type in ('profile', 'photo')
        and pe.revoked_at is null
        and pe.starts_at <= now()
        and (pe.expires_at is null or pe.expires_at > now())
    );
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.profile_access enable row level security;
alter table public.profile_photos enable row level security;
alter table public.profile_access_entitlements enable row level security;
alter table public.profile_access_events enable row level security;
alter table public.contact_packs enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.user_credit_balances enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.public_publications enable row level security;
alter table public.ad_campaigns enable row level security;
alter table public.reports enable row level security;
alter table public.mass_messages enable row level security;
alter table public.admin_settings enable row level security;
alter table public.audit_events enable row level security;
alter table public.user_announcement_read_state enable row level security;
alter table public.user_publication_read_state enable row level security;

-- Les migrations opérationnelles posent les policies idempotentes complètes.
-- Ce fichier est une référence de bootstrap, pas un remplacement des migrations.
