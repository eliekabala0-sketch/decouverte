-- P0 hotfix: make server-side payment activations and admin grants work
-- against the current production schema.

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'profile_access'
  ) then
    alter table public.profile_access
      add column if not exists profiles_access_until timestamptz;

    create unique index if not exists idx_profile_access_user_id_unique
      on public.profile_access(user_id);
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profile_access_entitlements' and column_name = 'payment_id'
  ) then
    alter table public.profile_access_entitlements
      alter column payment_id type text using payment_id::text;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profile_access_events' and column_name = 'payment_id'
  ) then
    alter table public.profile_access_events
      alter column payment_id type text using payment_id::text;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payment_events' and column_name = 'payment_id'
  ) then
    alter table public.payment_events
      alter column payment_id type text using payment_id::text;
  end if;
end $$;

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
    grant_profile_entitlement.target_user_id,
    grant_profile_entitlement.target_profile_id,
    grant_profile_entitlement.entitlement_type,
    grant_profile_entitlement.grant_mode,
    grant_profile_entitlement.grant_source,
    auth.uid(),
    grant_profile_entitlement.grant_expires_at,
    null,
    grant_profile_entitlement.grant_reason,
    coalesce(grant_profile_entitlement.grant_metadata, '{}'::jsonb),
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
    grant_profile_entitlement.target_user_id,
    grant_profile_entitlement.target_profile_id,
    grant_profile_entitlement.entitlement_type,
    'grant',
    auth.uid(),
    grant_profile_entitlement.grant_reason,
    coalesce(grant_profile_entitlement.grant_metadata, '{}'::jsonb)
  );

  perform public.log_admin_audit(
    'grant_profile_entitlement',
    'profile_access_entitlements',
    entitlement_id::text,
    grant_profile_entitlement.target_user_id,
    grant_profile_entitlement.grant_reason,
    jsonb_build_object(
      'target_profile_id', grant_profile_entitlement.target_profile_id,
      'access_type', grant_profile_entitlement.entitlement_type,
      'mode', grant_profile_entitlement.grant_mode,
      'source', grant_profile_entitlement.grant_source,
      'expires_at', grant_profile_entitlement.grant_expires_at,
      'metadata', coalesce(grant_profile_entitlement.grant_metadata, '{}'::jsonb)
    )
  );

  return entitlement_id;
end;
$$;

revoke all on function public.grant_profile_entitlement(uuid, uuid, text, text, text, timestamptz, text, jsonb) from public;
grant execute on function public.grant_profile_entitlement(uuid, uuid, text, text, text, timestamptz, text, jsonb) to authenticated;
