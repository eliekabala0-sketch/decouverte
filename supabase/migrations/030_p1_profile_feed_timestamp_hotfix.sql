-- P1 hotfix: keep get_profile_feed compatible with existing timestamp columns.
-- The RPC intentionally never returns phone/contact data.

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
  ('male_boost_requires_reciprocity', to_jsonb(true))
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

revoke all on function public.get_profile_feed(text, integer, integer) from public;
grant execute on function public.get_profile_feed(text, integer, integer) to authenticated;
