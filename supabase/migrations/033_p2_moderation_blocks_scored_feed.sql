-- P2: moderation blocks, audited admin status changes, and scored feed ordering.
-- The RPC intentionally never returns phone/contact data.

create table if not exists public.blocked_profiles (
  id uuid primary key default uuid_generate_v4(),
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_profile_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_profile_id)
);

create index if not exists idx_blocked_profiles_blocker
  on public.blocked_profiles(blocker_id, created_at desc);
create index if not exists idx_blocked_profiles_blocked
  on public.blocked_profiles(blocked_profile_id, created_at desc);

alter table public.blocked_profiles enable row level security;

drop policy if exists "Users manage own blocked profiles" on public.blocked_profiles;
create policy "Users manage own blocked profiles"
  on public.blocked_profiles
  for all
  to authenticated
  using (auth.uid() = blocker_id)
  with check (auth.uid() = blocker_id);

drop policy if exists "Admins read blocked profiles" on public.blocked_profiles;
create policy "Admins read blocked profiles"
  on public.blocked_profiles
  for select
  to authenticated
  using (public.is_profiles_admin());

create or replace function public.block_profile(
  p_target_profile_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  blocker uuid := auth.uid();
  block_id uuid;
begin
  if blocker is null then
    raise exception 'authenticated user required';
  end if;

  if blocker = p_target_profile_id then
    raise exception 'cannot block own profile';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_target_profile_id
  ) then
    raise exception 'target profile unavailable';
  end if;

  insert into public.blocked_profiles (blocker_id, blocked_profile_id, reason)
  values (blocker, p_target_profile_id, p_reason)
  on conflict (blocker_id, blocked_profile_id)
  do update set reason = excluded.reason
  returning id into block_id;

  return block_id;
end;
$$;

revoke all on function public.block_profile(uuid, text) from public;
grant execute on function public.block_profile(uuid, text) to authenticated;

create or replace function public.unblock_profile(
  p_target_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  blocker uuid := auth.uid();
begin
  if blocker is null then
    raise exception 'authenticated user required';
  end if;

  delete from public.blocked_profiles
  where blocker_id = blocker
    and blocked_profile_id = p_target_profile_id;

  return true;
end;
$$;

revoke all on function public.unblock_profile(uuid) from public;
grant execute on function public.unblock_profile(uuid) to authenticated;

create or replace function public.set_profile_moderation_status(
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

  if p_status not in ('active', 'suspended', 'banned') then
    raise exception 'invalid profile status';
  end if;

  update public.profiles
  set status = p_status
  where id = p_profile_id;

  perform public.log_admin_audit(
    'set_profile_moderation_status',
    'profiles',
    p_profile_id::text,
    p_profile_id,
    p_reason,
    jsonb_build_object('status', p_status)
  );

  return true;
end;
$$;

revoke all on function public.set_profile_moderation_status(uuid, text, text) from public;
grant execute on function public.set_profile_moderation_status(uuid, text, text) to authenticated;

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

revoke all on function public.normalize_profile_gender(text) from public;
grant execute on function public.normalize_profile_gender(text) to authenticated;

insert into public.admin_settings (key, value)
values
  ('female_non_reciprocal_feed_limit', to_jsonb(24)),
  ('feed_default_page_size', to_jsonb(20)),
  ('feed_max_page_size', to_jsonb(50)),
  ('male_boost_requires_reciprocity', to_jsonb(true)),
  ('feed_score_boost_weight', to_jsonb(100)),
  ('feed_score_verified_weight', to_jsonb(15)),
  ('feed_score_complete_weight', to_jsonb(20)),
  ('feed_score_recent_weight', to_jsonb(10)),
  ('feed_score_serious_mode_weight', to_jsonb(8))
on conflict (key) do nothing;

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
  score_boost integer := 100;
  score_verified integer := 15;
  score_complete integer := 20;
  score_recent integer := 10;
  score_serious_mode integer := 8;
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
  select coalesce((select (value #>> '{}')::integer from public.admin_settings where key = 'feed_score_boost_weight'), 100)
    into score_boost;
  select coalesce((select (value #>> '{}')::integer from public.admin_settings where key = 'feed_score_verified_weight'), 15)
    into score_verified;
  select coalesce((select (value #>> '{}')::integer from public.admin_settings where key = 'feed_score_complete_weight'), 20)
    into score_complete;
  select coalesce((select (value #>> '{}')::integer from public.admin_settings where key = 'feed_score_recent_weight'), 10)
    into score_recent;
  select coalesce((select (value #>> '{}')::integer from public.admin_settings where key = 'feed_score_serious_mode_weight'), 8)
    into score_serious_mode;

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
      and not exists (
        select 1 from public.blocked_profiles bp
        where (bp.blocker_id = viewer and bp.blocked_profile_id = pr.id)
           or (bp.blocker_id = pr.id and bp.blocked_profile_id = viewer)
      )
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
      (
        case when (
          c.raw_boost
          and (
            c.normalized_gender = 'F'
            or reciprocal_enabled
            or not male_boost_needs_reciprocity
          )
        ) then score_boost else 0 end
        + case when coalesce(c.is_verified, false) then score_verified else 0 end
        + case when coalesce(nullif(c.bio, ''), null) is not null and coalesce(nullif(c.photo, ''), null) is not null then score_complete else 0 end
        + case when c.created_at::timestamptz >= now() - interval '14 days' then score_recent else 0 end
        + case when effective_mode = 'serieux' and coalesce(c.mode_serieux_active, false) then score_serious_mode else 0 end
      ) as visibility_score,
      count(*) over () as full_count,
      row_number() over (
        order by
          (
            case when (
              c.raw_boost
              and (
                c.normalized_gender = 'F'
                or reciprocal_enabled
                or not male_boost_needs_reciprocity
              )
            ) then score_boost else 0 end
            + case when coalesce(c.is_verified, false) then score_verified else 0 end
            + case when coalesce(nullif(c.bio, ''), null) is not null and coalesce(nullif(c.photo, ''), null) is not null then score_complete else 0 end
            + case when c.created_at::timestamptz >= now() - interval '14 days' then score_recent else 0 end
            + case when effective_mode = 'serieux' and coalesce(c.mode_serieux_active, false) then score_serious_mode else 0 end
          ) desc,
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

revoke all on function public.get_profile_feed(text, integer, integer) from public;
grant execute on function public.get_profile_feed(text, integer, integer) to authenticated;
