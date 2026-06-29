-- 035 - P2 Bloc J: filtered feed, admin user actions, and targeted mass-message helpers.
-- Additive and compatible: no physical user deletion is performed here.

alter table public.mass_messages
  add column if not exists target_filters jsonb default '{}'::jsonb,
  add column if not exists recipient_count integer,
  add column if not exists preview_user_ids uuid[] default '{}'::uuid[];

create index if not exists idx_profiles_admin_filters
  on public.profiles(status, gender, city, commune, age, created_at desc);

create or replace function public.get_profile_feed(
  p_mode text default 'libre',
  p_page integer default 0,
  p_page_size integer default 20,
  p_city text default null,
  p_commune text default null,
  p_target_gender text default null,
  p_min_age integer default null,
  p_max_age integer default null,
  p_verified_only boolean default false,
  p_with_photo_only boolean default false,
  p_expand_scope boolean default false
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
  effective_page integer := greatest(coalesce(p_page, 0), 0);
  effective_size integer := least(greatest(coalesce(p_page_size, 20), 1), 50);
  effective_mode text := case when p_mode = 'serieux' then 'serieux' else 'libre' end;
  target_gender text := nullif(public.normalize_profile_gender(p_target_gender), 'other');
  limited_for_viewer boolean := false;
begin
  if viewer is null then
    raise exception 'authenticated user required';
  end if;

  select public.normalize_profile_gender(pr.gender)
    into viewer_gender
  from public.profiles pr
  where pr.id = viewer and pr.status = 'active';

  if viewer_gender is null then
    raise exception 'viewer profile required';
  end if;

  select coalesce((select (value #>> '{}')::boolean from public.admin_settings where key = 'reciprocal_matching_enabled'), false)
    into reciprocal_enabled;
  limited_for_viewer := viewer_gender = 'F' and not reciprocal_enabled;

  if target_gender is null then
    target_gender := case when viewer_gender = 'M' then 'F' when viewer_gender = 'F' then 'M' else null end;
  end if;

  return query
  with candidates as (
    select
      pr.*,
      public.normalize_profile_gender(pr.gender) as normalized_gender,
      (
        (pr.boosted_until is not null and pr.boosted_until > now())
        or coalesce(nullif(pr.boost_reason, ''), null) is not null
        or coalesce(pr.is_boosted, false)
      ) as effective_boost
    from public.profiles pr
    where pr.id <> viewer
      and pr.status = 'active'
      and (target_gender is null or public.normalize_profile_gender(pr.gender) = target_gender)
      and (p_expand_scope or nullif(trim(coalesce(p_city, '')), '') is null or lower(pr.city) = lower(trim(p_city)))
      and (p_expand_scope or nullif(trim(coalesce(p_commune, '')), '') is null or lower(coalesce(pr.commune, '')) = lower(trim(p_commune)))
      and (p_min_age is null or pr.age >= p_min_age)
      and (p_max_age is null or pr.age <= p_max_age)
      and (not coalesce(p_verified_only, false) or coalesce(pr.is_verified, false))
      and (not coalesce(p_with_photo_only, false) or coalesce(nullif(pr.photo, ''), null) is not null)
      and (
        (effective_mode = 'serieux' and coalesce(pr.mode_serieux_active, true))
        or (effective_mode = 'libre' and coalesce(pr.mode_libre_active, true))
      )
      and not exists (
        select 1 from public.blocked_profiles bp
        where (bp.blocker_id = viewer and bp.blocked_profile_id = pr.id)
           or (bp.blocker_id = pr.id and bp.blocked_profile_id = viewer)
      )
  ),
  visible_rows as (
    select
      c.*,
      (
        public.has_profile_entitlement(viewer, c.id, 'photo')
        or exists (
          select 1 from public.profile_access pa
          where pa.user_id = viewer
            and (
              coalesce(pa.all_profiles_access, false)
              or (pa.profiles_access_until is not null and pa.profiles_access_until > now())
            )
        )
        or exists (
          select 1 from public.profiles admin_profile
          where admin_profile.id = viewer
            and admin_profile.role in ('admin', 'super_admin', 'superadmin')
        )
      ) as row_can_view_full,
      count(*) over () as full_count,
      row_number() over (
        order by c.effective_boost desc, coalesce(c.is_verified, false) desc, c.boosted_until desc nulls last, c.created_at desc
      ) as rn
    from candidates c
  )
  select
    vr.id,
    vr.created_at::timestamptz,
    case when limited_for_viewer or not vr.row_can_view_full then null else vr.photo end,
    vr.normalized_gender,
    vr.city,
    vr.commune,
    case when limited_for_viewer or not vr.row_can_view_full then null else vr.bio end,
    vr.status,
    vr.is_verified,
    case when limited_for_viewer or not vr.row_can_view_full then 'Profil' else vr.username end,
    vr.age,
    vr.mode_libre_active,
    vr.mode_serieux_active,
    vr.boost_reason,
    vr.boosted_until::timestamptz,
    vr.is_boosted,
    vr.country,
    vr.role,
    (not limited_for_viewer and vr.row_can_view_full),
    (limited_for_viewer or not vr.row_can_view_full),
    vr.effective_boost,
    vr.full_count
  from visible_rows vr
  where vr.rn > effective_page * effective_size
    and vr.rn <= (effective_page + 1) * effective_size
  order by vr.rn;
end;
$$;

revoke all on function public.get_profile_feed(text, integer, integer, text, text, text, integer, integer, boolean, boolean, boolean) from public;
grant execute on function public.get_profile_feed(text, integer, integer, text, text, text, integer, integer, boolean, boolean, boolean) to authenticated;

create or replace function public.admin_set_profile_status(
  p_profile_id uuid,
  p_status text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_profiles_admin() then
    raise exception 'admin role required';
  end if;
  if p_status not in ('active', 'suspended', 'banned', 'deleted') then
    raise exception 'invalid profile status';
  end if;

  update public.profiles
  set status = p_status
  where id = p_profile_id;

  perform public.log_admin_audit(
    'admin_set_profile_status',
    'profiles',
    p_profile_id::text,
    p_profile_id,
    p_reason,
    jsonb_build_object('status', p_status)
  );
  return true;
end;
$$;

revoke all on function public.admin_set_profile_status(uuid, text, text) from public;
grant execute on function public.admin_set_profile_status(uuid, text, text) to authenticated;

create or replace function public.admin_soft_delete_user(
  p_profile_id uuid,
  p_confirmation text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
begin
  select role into actor_role from public.profiles where id = auth.uid();
  if actor_role not in ('super_admin', 'superadmin') then
    raise exception 'super admin role required';
  end if;
  if p_confirmation <> 'SUPPRIMER' then
    raise exception 'confirmation required';
  end if;

  update public.profiles
  set status = 'deleted'
  where id = p_profile_id
    and (
      username ilike '%test%'
      or phone ilike '%test%'
      or phone ilike '+24398%'
      or phone ilike '+24397%'
      or p_reason ilike '%test%'
    );

  if not found then
    raise exception 'only clearly identified test accounts can be archived here';
  end if;

  perform public.log_admin_audit(
    'admin_soft_delete_user',
    'profiles',
    p_profile_id::text,
    p_profile_id,
    p_reason,
    jsonb_build_object('confirmation', p_confirmation, 'mode', 'soft_delete')
  );
  return true;
end;
$$;

revoke all on function public.admin_soft_delete_user(uuid, text, text) from public;
grant execute on function public.admin_soft_delete_user(uuid, text, text) to authenticated;

create or replace function public.estimate_mass_message_recipients(filters jsonb default '{}'::jsonb)
returns table (recipient_count bigint, preview_user_ids uuid[])
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  seg text := coalesce(filters->>'segment', 'all');
  value text := nullif(filters->>'segment_value', '');
  min_age integer := nullif(filters->>'min_age', '')::integer;
  max_age integer := nullif(filters->>'max_age', '')::integer;
begin
  if not public.is_profiles_admin() then
    raise exception 'admin role required';
  end if;

  return query
  with recipients as (
    select p.id
    from public.profiles p
    left join public.profile_access pa on pa.user_id = p.id
    where p.status = 'active'
      and (min_age is null or p.age >= min_age)
      and (max_age is null or p.age <= max_age)
      and (
        seg = 'all'
        or (seg = 'men' and public.normalize_profile_gender(p.gender) = 'M')
        or (seg = 'women' and public.normalize_profile_gender(p.gender) = 'F')
        or (seg = 'city' and value is not null and lower(p.city) = lower(value))
        or (seg = 'commune' and value is not null and lower(coalesce(p.commune, '')) = lower(value))
        or (seg = 'mode_libre' and coalesce(p.mode_libre_active, false))
        or (seg = 'mode_serieux' and coalesce(p.mode_serieux_active, false))
        or (seg = 'verified' and coalesce(p.is_verified, false))
        or (seg = 'unverified' and not coalesce(p.is_verified, false))
        or (seg = 'boosted' and ((p.boosted_until is not null and p.boosted_until > now()) or coalesce(p.is_boosted, false)))
        or (seg = 'with_pack' and (coalesce(pa.contact_quota, 0) > coalesce(pa.contact_quota_used, 0) or coalesce(pa.photo_quota, 0) > coalesce(pa.photo_quota_used, 0) or coalesce(pa.all_profiles_access, false)))
        or (seg = 'without_pack' and not (coalesce(pa.contact_quota, 0) > coalesce(pa.contact_quota_used, 0) or coalesce(pa.photo_quota, 0) > coalesce(pa.photo_quota_used, 0) or coalesce(pa.all_profiles_access, false)))
        or (seg = 'new_users' and p.created_at >= now() - interval '30 days')
      )
    order by p.created_at desc
  )
  select count(*)::bigint, coalesce(array_agg(id) filter (where rn <= 20), '{}'::uuid[])
  from (
    select id, row_number() over (order by id) rn
    from recipients
  ) numbered;
end;
$$;

revoke all on function public.estimate_mass_message_recipients(jsonb) from public;
grant execute on function public.estimate_mass_message_recipients(jsonb) to authenticated;
