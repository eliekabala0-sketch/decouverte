-- 025 - P0 fondation sécurité/confidentialité/paiement/audit.
-- Additif, idempotent, compatible avec les données existantes.

create extension if not exists "uuid-ossp";

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

revoke all on function public.is_profiles_admin() from public;
grant execute on function public.is_profiles_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Paramètres applicatifs: lecture authentifiée, écriture admin.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'admin_settings'
  ) then
    alter table public.admin_settings enable row level security;

    drop policy if exists "Authenticated users can read admin_settings" on public.admin_settings;
    create policy "Authenticated users can read admin_settings"
      on public.admin_settings
      for select
      to authenticated
      using (true);

    drop policy if exists "Profiles admin role manages admin_settings" on public.admin_settings;
    create policy "Profiles admin role manages admin_settings"
      on public.admin_settings
      for all
      to authenticated
      using (public.is_profiles_admin())
      with check (public.is_profiles_admin());
  end if;
end $$;

insert into public.admin_settings (key, value)
values (
  'visibility_boost_offers',
  '[{"id":"boost_7","label":"7 jours","days":7,"amount":9.99,"active":true},{"id":"boost_14","label":"14 jours","days":14,"amount":17.99,"active":true},{"id":"boost_30","label":"30 jours","days":30,"amount":29.99,"active":true}]'::jsonb
)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Audit des actions sensibles.
-- ---------------------------------------------------------------------------

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

create index if not exists idx_audit_events_actor_created
  on public.audit_events(actor_id, created_at desc);
create index if not exists idx_audit_events_target_created
  on public.audit_events(target_user_id, created_at desc);
create index if not exists idx_audit_events_action_created
  on public.audit_events(action, created_at desc);

alter table public.audit_events enable row level security;

drop policy if exists "Profiles admin role can read audit_events" on public.audit_events;
create policy "Profiles admin role can read audit_events"
  on public.audit_events
  for select
  to authenticated
  using (public.is_profiles_admin());

drop policy if exists "Profiles admin role can insert audit_events" on public.audit_events;
create policy "Profiles admin role can insert audit_events"
  on public.audit_events
  for insert
  to authenticated
  with check (public.is_profiles_admin() and actor_id = auth.uid());

create or replace function public.log_admin_audit(
  action text,
  entity_type text default null,
  entity_id text default null,
  target_user_id uuid default null,
  reason text default null,
  metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not public.is_profiles_admin() then
    raise exception 'admin role required';
  end if;

  insert into public.audit_events (
    actor_id,
    target_user_id,
    action,
    entity_type,
    entity_id,
    reason,
    metadata
  )
  values (
    auth.uid(),
    target_user_id,
    action,
    entity_type,
    entity_id,
    reason,
    coalesce(metadata, '{}'::jsonb)
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.log_admin_audit(text, text, text, uuid, text, jsonb) from public;
grant execute on function public.log_admin_audit(text, text, text, uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Accès profil/contact par cible, pour éviter les doubles paiements.
-- ---------------------------------------------------------------------------

create table if not exists public.profile_access_entitlements (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_profile_id uuid not null references public.profiles(id) on delete cascade,
  access_type text not null check (access_type in ('profile', 'photo', 'contact', 'conversation')),
  mode text not null default 'global' check (mode in ('global', 'libre', 'serieux')),
  source text not null default 'admin_grant'
    check (source in ('admin_grant', 'subscription', 'credit', 'payment', 'legacy', 'webhook')),
  payment_id uuid,
  granted_by uuid references auth.users(id) on delete set null,
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

alter table public.profile_access_entitlements enable row level security;

drop policy if exists "Users can read own profile_access_entitlements" on public.profile_access_entitlements;
create policy "Users can read own profile_access_entitlements"
  on public.profile_access_entitlements
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Profiles admin role manages profile_access_entitlements" on public.profile_access_entitlements;
create policy "Profiles admin role manages profile_access_entitlements"
  on public.profile_access_entitlements
  for all
  to authenticated
  using (public.is_profiles_admin())
  with check (public.is_profiles_admin());

create table if not exists public.profile_access_events (
  id uuid primary key default uuid_generate_v4(),
  entitlement_id uuid references public.profile_access_entitlements(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  target_profile_id uuid references public.profiles(id) on delete set null,
  access_type text,
  event_type text not null,
  actor_id uuid references auth.users(id) on delete set null,
  payment_id uuid,
  credits_spent integer not null default 0,
  reason text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_profile_access_events_user_created
  on public.profile_access_events(user_id, created_at desc);
create index if not exists idx_profile_access_events_target_created
  on public.profile_access_events(target_profile_id, created_at desc);

alter table public.profile_access_events enable row level security;

drop policy if exists "Users can read own profile_access_events" on public.profile_access_events;
create policy "Users can read own profile_access_events"
  on public.profile_access_events
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Profiles admin role manages profile_access_events" on public.profile_access_events;
create policy "Profiles admin role manages profile_access_events"
  on public.profile_access_events
  for all
  to authenticated
  using (public.is_profiles_admin())
  with check (public.is_profiles_admin());

create or replace function public.has_profile_entitlement(
  p_viewer_id uuid,
  p_target_profile_id uuid,
  p_entitlement_type text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profile_access_entitlements pe
    where pe.user_id = p_viewer_id
      and pe.target_profile_id = p_target_profile_id
      and pe.access_type in (p_entitlement_type, 'profile')
      and pe.revoked_at is null
      and pe.starts_at <= now()
      and (pe.expires_at is null or pe.expires_at > now())
  );
$$;

revoke all on function public.has_profile_entitlement(uuid, uuid, text) from public;
grant execute on function public.has_profile_entitlement(uuid, uuid, text) to authenticated;

create or replace function public.grant_profile_entitlement(
  target_user_id uuid,
  target_profile_id uuid,
  entitlement_type text,
  grant_mode text default 'global',
  grant_source text default 'admin_grant',
  grant_expires_at timestamptz default null,
  grant_reason text default null,
  grant_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  entitlement_id uuid;
begin
  if not public.is_profiles_admin() then
    raise exception 'admin role required';
  end if;

  insert into public.profile_access_entitlements (
    user_id,
    target_profile_id,
    access_type,
    mode,
    source,
    granted_by,
    expires_at,
    revoked_at,
    reason,
    metadata,
    updated_at
  )
  values (
    target_user_id,
    target_profile_id,
    entitlement_type,
    grant_mode,
    grant_source,
    auth.uid(),
    grant_expires_at,
    null,
    grant_reason,
    coalesce(grant_metadata, '{}'::jsonb),
    now()
  )
  on conflict (user_id, target_profile_id, access_type)
  do update set
    mode = excluded.mode,
    source = excluded.source,
    granted_by = excluded.granted_by,
    expires_at = excluded.expires_at,
    revoked_at = null,
    reason = excluded.reason,
    metadata = excluded.metadata,
    updated_at = now()
  returning id into entitlement_id;

  insert into public.profile_access_events (
    entitlement_id,
    user_id,
    target_profile_id,
    access_type,
    event_type,
    actor_id,
    reason,
    metadata
  )
  values (
    entitlement_id,
    target_user_id,
    target_profile_id,
    entitlement_type,
    'grant',
    auth.uid(),
    grant_reason,
    coalesce(grant_metadata, '{}'::jsonb)
  );

  perform public.log_admin_audit(
    'grant_profile_entitlement',
    'profile_access_entitlements',
    entitlement_id::text,
    target_user_id,
    grant_reason,
    jsonb_build_object(
      'target_profile_id', target_profile_id,
      'access_type', entitlement_type,
      'mode', grant_mode,
      'source', grant_source,
      'expires_at', grant_expires_at
    )
  );

  return entitlement_id;
end;
$$;

revoke all on function public.grant_profile_entitlement(uuid, uuid, text, text, text, timestamptz, text, jsonb) from public;
grant execute on function public.grant_profile_entitlement(uuid, uuid, text, text, text, timestamptz, text, jsonb) to authenticated;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'profile_access'
  ) then
    alter table public.profile_access
      add column if not exists profiles_access_until timestamptz;
  end if;
end $$;

create or replace function public.unlock_profile_contact(
  p_target_profile_id uuid,
  p_mode text default 'global'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  requester uuid := auth.uid();
  existing_id uuid;
  entitlement_id uuid;
  current_quota integer;
  current_used integer;
begin
  if requester is null then
    raise exception 'authenticated user required';
  end if;

  if requester = p_target_profile_id then
    raise exception 'cannot unlock own contact';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_target_profile_id and p.status = 'active'
  ) then
    raise exception 'target profile unavailable';
  end if;

  select pe.id into existing_id
  from public.profile_access_entitlements pe
  where pe.user_id = requester
    and pe.target_profile_id = p_target_profile_id
    and pe.access_type in ('contact', 'conversation')
    and pe.revoked_at is null
    and pe.starts_at <= now()
    and (pe.expires_at is null or pe.expires_at > now())
  limit 1;

  if existing_id is not null then
    return existing_id;
  end if;

  select coalesce(pa.contact_quota, 0), coalesce(pa.contact_quota_used, 0)
    into current_quota, current_used
  from public.profile_access pa
  where pa.user_id = requester
  for update;

  if current_quota is null or current_quota <= current_used then
    raise exception 'contact quota required';
  end if;

  update public.profile_access
  set contact_quota_used = current_used + 1,
      updated_at = now()
  where user_id = requester;

  insert into public.profile_access_entitlements (
    user_id,
    target_profile_id,
    access_type,
    mode,
    source,
    credits_spent,
    metadata,
    updated_at
  )
  values (
    requester,
    p_target_profile_id,
    'contact',
    p_mode,
    'credit',
    1,
    jsonb_build_object('quota_before', current_quota - current_used),
    now()
  )
  on conflict (user_id, target_profile_id, access_type)
  do update set
    mode = excluded.mode,
    source = excluded.source,
    credits_spent = excluded.credits_spent,
    revoked_at = null,
    metadata = excluded.metadata,
    updated_at = now()
  returning id into entitlement_id;

  insert into public.profile_access_events (
    entitlement_id,
    user_id,
    target_profile_id,
    access_type,
    event_type,
    actor_id,
    credits_spent,
    metadata
  )
  values (
    entitlement_id,
    requester,
    p_target_profile_id,
    'contact',
    'unlock',
    requester,
    1,
    jsonb_build_object('mode', p_mode)
  );

  return entitlement_id;
end;
$$;

revoke all on function public.unlock_profile_contact(uuid, text) from public;
grant execute on function public.unlock_profile_contact(uuid, text) to authenticated;

create or replace function public.unlock_profile_photo(
  p_target_profile_id uuid,
  p_mode text default 'global'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  requester uuid := auth.uid();
  existing_id uuid;
  entitlement_id uuid;
  current_quota integer;
  current_used integer;
  has_global_access boolean;
begin
  if requester is null then
    raise exception 'authenticated user required';
  end if;

  if requester = p_target_profile_id then
    raise exception 'cannot unlock own photo';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_target_profile_id and p.status = 'active'
  ) then
    raise exception 'target profile unavailable';
  end if;

  select pe.id into existing_id
  from public.profile_access_entitlements pe
  where pe.user_id = requester
    and pe.target_profile_id = p_target_profile_id
    and pe.access_type in ('profile', 'photo')
    and pe.revoked_at is null
    and pe.starts_at <= now()
    and (pe.expires_at is null or pe.expires_at > now())
  limit 1;

  if existing_id is not null then
    return existing_id;
  end if;

  select
    coalesce(pa.photo_quota, 0),
    coalesce(pa.photo_quota_used, 0),
    coalesce(pa.all_profiles_access, false)
      or (pa.profiles_access_until is not null and pa.profiles_access_until > now())
    into current_quota, current_used, has_global_access
  from public.profile_access pa
  where pa.user_id = requester
  for update;

  if not coalesce(has_global_access, false) then
    if current_quota is null or current_quota <= current_used then
      raise exception 'photo quota or subscription required';
    end if;

    update public.profile_access
    set photo_quota_used = current_used + 1,
        updated_at = now()
    where user_id = requester;
  end if;

  insert into public.profile_access_entitlements (
    user_id,
    target_profile_id,
    access_type,
    mode,
    source,
    credits_spent,
    metadata,
    updated_at
  )
  values (
    requester,
    p_target_profile_id,
    'photo',
    p_mode,
    case when coalesce(has_global_access, false) then 'subscription' else 'credit' end,
    case when coalesce(has_global_access, false) then 0 else 1 end,
    jsonb_build_object('global_access', coalesce(has_global_access, false)),
    now()
  )
  on conflict (user_id, target_profile_id, access_type)
  do update set
    mode = excluded.mode,
    source = excluded.source,
    credits_spent = excluded.credits_spent,
    revoked_at = null,
    metadata = excluded.metadata,
    updated_at = now()
  returning id into entitlement_id;

  insert into public.profile_access_events (
    entitlement_id,
    user_id,
    target_profile_id,
    access_type,
    event_type,
    actor_id,
    credits_spent,
    metadata
  )
  values (
    entitlement_id,
    requester,
    p_target_profile_id,
    'photo',
    'unlock',
    requester,
    case when coalesce(has_global_access, false) then 0 else 1 end,
    jsonb_build_object('mode', p_mode, 'global_access', coalesce(has_global_access, false))
  );

  return entitlement_id;
end;
$$;

revoke all on function public.unlock_profile_photo(uuid, text) from public;
grant execute on function public.unlock_profile_photo(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Crédits, abonnements et événements de paiement serveur/webhook.
-- ---------------------------------------------------------------------------

create table if not exists public.user_credit_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  contact_credits integer not null default 0,
  photo_credits integer not null default 0,
  premium_credits integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.user_credit_balances enable row level security;

drop policy if exists "Users can read own credit balances" on public.user_credit_balances;
create policy "Users can read own credit balances"
  on public.user_credit_balances
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Profiles admin role manages credit balances" on public.user_credit_balances;
create policy "Profiles admin role manages credit balances"
  on public.user_credit_balances
  for all
  to authenticated
  using (public.is_profiles_admin())
  with check (public.is_profiles_admin());

create table if not exists public.user_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_key text not null,
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled', 'granted')),
  source text not null default 'payment' check (source in ('payment', 'admin_grant', 'webhook', 'legacy')),
  payment_id uuid,
  granted_by uuid references auth.users(id) on delete set null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_subscriptions_user_status
  on public.user_subscriptions(user_id, status, ends_at);

alter table public.user_subscriptions enable row level security;

drop policy if exists "Users can read own subscriptions" on public.user_subscriptions;
create policy "Users can read own subscriptions"
  on public.user_subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Profiles admin role manages subscriptions" on public.user_subscriptions;
create policy "Profiles admin role manages subscriptions"
  on public.user_subscriptions
  for all
  to authenticated
  using (public.is_profiles_admin())
  with check (public.is_profiles_admin());

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'payments'
  ) then
    alter table public.payments
      add column if not exists provider text default 'badiboss_pay',
      add column if not exists payment_provider text,
      add column if not exists payment_method text,
      add column if not exists transaction_ref text,
      add column if not exists amount numeric,
      add column if not exists currency text default 'USD',
      add column if not exists status text default 'pending',
      add column if not exists metadata jsonb default '{}'::jsonb;

    create index if not exists idx_payments_transaction_ref
      on public.payments(transaction_ref);
  end if;
end $$;

create table if not exists public.payment_events (
  id uuid primary key default uuid_generate_v4(),
  payment_id uuid,
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

alter table public.payment_events enable row level security;

drop policy if exists "Profiles admin role can read payment_events" on public.payment_events;
create policy "Profiles admin role can read payment_events"
  on public.payment_events
  for select
  to authenticated
  using (public.is_profiles_admin());

-- ---------------------------------------------------------------------------
-- Confidentialité photos: RLS table et bucket privé futur.
-- Le bucket historique profile-media reste inchangé pour compatibilité.
-- ---------------------------------------------------------------------------

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
      select 1
      from public.profiles pr
      where pr.id = viewer_id and pr.role = 'admin'
    )
    or exists (
      select 1
      from public.profile_access pa
      where pa.user_id = viewer_id
        and (
          coalesce(pa.all_profiles_access, false)
          or coalesce(pa.photo_quota, 0) > coalesce(pa.photo_quota_used, 0)
          or (pa.profiles_access_until is not null and pa.profiles_access_until > now())
        )
    )
    or public.has_profile_entitlement(viewer_id, target_user_id, 'photo');
$$;

revoke all on function public.can_access_profile_photos(uuid, uuid) from public;
grant execute on function public.can_access_profile_photos(uuid, uuid) to authenticated;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'profile_photos'
  ) then
    alter table public.profile_photos enable row level security;

    drop policy if exists "Users read profile_photos authenticated" on public.profile_photos;
    drop policy if exists "Users can read permitted profile_photos" on public.profile_photos;
    create policy "Users can read permitted profile_photos"
      on public.profile_photos
      for select
      to authenticated
      using (public.can_access_profile_photos(auth.uid(), user_id));
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('profile-protected-media', 'profile-protected-media', false)
on conflict (id) do update set public = false;

drop policy if exists "Users upload own profile-protected-media" on storage.objects;
create policy "Users upload own profile-protected-media"
on storage.objects for insert
with check (
  bucket_id = 'profile-protected-media'
  and auth.role() = 'authenticated'
  and name like (auth.uid()::text || '/%')
);

drop policy if exists "Users read own profile-protected-media" on storage.objects;
create policy "Users read own profile-protected-media"
on storage.objects for select
using (
  bucket_id = 'profile-protected-media'
  and auth.role() = 'authenticated'
  and name like (auth.uid()::text || '/%')
);

drop policy if exists "Profiles admin read profile-protected-media" on storage.objects;
create policy "Profiles admin read profile-protected-media"
on storage.objects for select
using (
  bucket_id = 'profile-protected-media'
  and public.is_profiles_admin()
);
