-- P1: controlled profile private details after an access entitlement exists.
-- The RPC never returns phone/contact data.

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

revoke all on function public.get_profile_private_details(uuid) from public;
grant execute on function public.get_profile_private_details(uuid) to authenticated;
