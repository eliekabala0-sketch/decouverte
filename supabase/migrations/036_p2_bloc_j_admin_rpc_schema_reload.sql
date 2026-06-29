-- 036 - Corrective reload for Bloc J admin actions.
-- The previous migration may be absent from PostgREST schema cache; this file
-- recreates the admin RPCs with the exact names used by UI and smoke scripts.

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

notify pgrst, 'reload schema';
