-- 039 - Allow super_admin/is_admin profiles through shared admin helpers.
--
-- Earlier admin RPC/RLS helpers only accepted profiles.role = 'admin'.
-- The dashboard now distinguishes admin from super_admin, but shared SQL
-- helpers must still accept both so audit writes and sensitive RPCs work.

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

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
      and coalesce(pr.status, 'active') not in ('banned', 'deleted')
      and (
        coalesce(pr.is_admin, false)
        or lower(coalesce(pr.role, '')) in ('admin', 'super_admin', 'superadmin')
      )
  );
$$;

revoke all on function public.is_profiles_admin() from public;
grant execute on function public.is_profiles_admin() to authenticated;

comment on function public.is_profiles_admin()
  is 'Returns true for active dashboard admins: role admin/super_admin/superadmin or profiles.is_admin = true.';

notify pgrst, 'reload schema';