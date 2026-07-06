-- 038 - Admin test-account detection and strong cleanup.
-- Additive: no direct destructive deletion; soft-delete with audit and access revocation.

alter table public.profiles
  add column if not exists admin_deleted_at timestamptz,
  add column if not exists admin_deleted_by uuid,
  add column if not exists admin_delete_reason text,
  add column if not exists admin_is_test_account boolean not null default false,
  add column if not exists admin_test_reasons text[] not null default '{}'::text[];

create index if not exists idx_profiles_admin_deleted_at
  on public.profiles(admin_deleted_at);

create index if not exists idx_profiles_admin_is_test_account
  on public.profiles(admin_is_test_account);

create or replace function public.admin_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('super_admin', 'superadmin')
  );
$$;

create or replace function public.admin_test_account_reasons(
  p_profile_id uuid,
  p_email text default null,
  p_username text default null,
  p_phone text default null
)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  reasons text[] := '{}'::text[];
begin
  if lower(coalesce(p_email, '')) ~ '(test|smoke|p1|p2|tel_p2|tel_test|admin[ _-]?action)' then
    reasons := array_append(reasons, 'email_pattern');
  end if;

  if lower(coalesce(p_username, '')) ~ '(test|smoke|p1|p2|admin[ _-]?action)' then
    reasons := array_append(reasons, 'username_pattern');
  end if;

  if lower(coalesce(p_phone, '')) ~ '(test|smoke|tel_p2|tel_test)' then
    reasons := array_append(reasons, 'phone_text_pattern');
  end if;

  if coalesce(p_phone, '') like '+2439000001%' then
    reasons := array_append(reasons, 'phone_test_prefix');
  end if;

  if exists (
    select 1
    from public.payments pay
    where pay.user_id = p_profile_id
      and (
        lower(coalesce(pay.transaction_ref, '')) ~ '(test|smoke|p1|p2|tel_p2|tel_test|admin[ _-]?action)'
        or lower(coalesce(pay.payment_provider, '')) ~ '(test|smoke|admin grant)'
        or lower(coalesce(pay.payment_method, '')) ~ '(test|smoke|admin grant)'
        or lower(coalesce(pay.provider, '')) ~ '(test|smoke)'
      )
  ) then
    reasons := array_append(reasons, 'payment_pattern');
  end if;

  return reasons;
end;
$$;

create or replace function public.admin_detect_test_accounts(
  p_include_deleted boolean default false
)
returns table (
  id uuid,
  email text,
  username text,
  phone text,
  city text,
  status text,
  created_at timestamptz,
  reasons text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.admin_is_super_admin() then
    raise exception 'super admin role required';
  end if;

  return query
  with rows as (
    select
      p.id,
      au.email::text,
      p.username::text,
      p.phone::text,
      p.city::text,
      p.status::text,
      p.created_at::timestamptz,
      public.admin_test_account_reasons(p.id, au.email, p.username, p.phone) as reasons
    from public.profiles p
    left join auth.users au on au.id = p.id
    where (p_include_deleted or p.status <> 'deleted')
      and coalesce(p.role, 'user') not in ('admin', 'super_admin', 'superadmin')
  )
  select rows.id, rows.email, rows.username, rows.phone, rows.city, rows.status, rows.created_at, rows.reasons
  from rows
  where cardinality(rows.reasons) > 0
  order by rows.created_at desc;
end;
$$;

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
  target public.profiles%rowtype;
  target_email text;
  reasons text[];
begin
  if not public.admin_is_super_admin() then
    raise exception 'super admin role required';
  end if;

  if p_confirmation <> 'SUPPRIMER' then
    raise exception 'confirmation required';
  end if;

  select * into target from public.profiles where id = p_profile_id;
  if target.id is null then
    raise exception 'profile not found';
  end if;

  if target.id = auth.uid() then
    raise exception 'cannot delete current admin account';
  end if;

  if coalesce(target.role, 'user') in ('admin', 'super_admin', 'superadmin') then
    raise exception 'admin accounts cannot be deleted by this action';
  end if;

  select email into target_email from auth.users where id = p_profile_id;
  reasons := public.admin_test_account_reasons(target.id, target_email, target.username, target.phone);

  if cardinality(reasons) = 0 and lower(coalesce(p_reason, '')) not like '%test%' then
    raise exception 'only clearly identified test accounts can be archived here';
  end if;

  update public.profiles
  set
    status = 'deleted',
    admin_deleted_at = coalesce(admin_deleted_at, now()),
    admin_deleted_by = auth.uid(),
    admin_delete_reason = coalesce(nullif(p_reason, ''), 'admin soft delete'),
    admin_is_test_account = cardinality(reasons) > 0,
    admin_test_reasons = reasons,
    mode_libre_active = false,
    mode_serieux_active = false,
    is_boosted = false,
    boosted_until = null,
    boost_reason = null
  where id = p_profile_id;

  delete from public.profile_access
  where user_id = p_profile_id;

  update auth.users
  set banned_until = '9999-12-31 23:59:59+00'::timestamptz
  where id = p_profile_id;

  perform public.log_admin_audit(
    'admin_soft_delete_user',
    'profiles',
    p_profile_id::text,
    p_profile_id,
    p_reason,
    jsonb_build_object(
      'confirmation', p_confirmation,
      'mode', 'strong_soft_delete',
      'test_reasons', reasons,
      'email', target_email
    )
  );

  return true;
end;
$$;

create or replace function public.admin_cleanup_test_accounts(
  p_confirmation text default null,
  p_dry_run boolean default true
)
returns table (
  id uuid,
  email text,
  username text,
  phone text,
  city text,
  status text,
  created_at timestamptz,
  reasons text[],
  action text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate record;
begin
  if not public.admin_is_super_admin() then
    raise exception 'super admin role required';
  end if;

  if p_dry_run then
    return query
    select d.id, d.email, d.username, d.phone, d.city, d.status, d.created_at, d.reasons, 'preview'::text
    from public.admin_detect_test_accounts(false) d;
    return;
  end if;

  if p_confirmation <> 'SUPPRIMER TESTS' then
    raise exception 'confirmation required';
  end if;

  for candidate in select * from public.admin_detect_test_accounts(false)
  loop
    perform public.admin_soft_delete_user(candidate.id, 'SUPPRIMER', 'batch cleanup test accounts');
    id := candidate.id;
    email := candidate.email;
    username := candidate.username;
    phone := candidate.phone;
    city := candidate.city;
    status := 'deleted';
    created_at := candidate.created_at;
    reasons := candidate.reasons;
    action := 'soft_deleted';
    return next;
  end loop;

  perform public.log_admin_audit(
    'admin_cleanup_test_accounts',
    'profiles',
    null,
    null,
    'batch cleanup test accounts',
    jsonb_build_object('confirmation', p_confirmation)
  );
end;
$$;

revoke all on function public.admin_is_super_admin() from public;
grant execute on function public.admin_is_super_admin() to authenticated;

revoke all on function public.admin_test_account_reasons(uuid, text, text, text) from public;
grant execute on function public.admin_test_account_reasons(uuid, text, text, text) to authenticated;

revoke all on function public.admin_detect_test_accounts(boolean) from public;
grant execute on function public.admin_detect_test_accounts(boolean) to authenticated;

revoke all on function public.admin_soft_delete_user(uuid, text, text) from public;
grant execute on function public.admin_soft_delete_user(uuid, text, text) to authenticated;

revoke all on function public.admin_cleanup_test_accounts(text, boolean) from public;
grant execute on function public.admin_cleanup_test_accounts(text, boolean) to authenticated;

notify pgrst, 'reload schema';
