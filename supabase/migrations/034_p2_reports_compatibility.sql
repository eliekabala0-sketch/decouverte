-- P2 moderation compatibility.
-- Some live databases already had reports, but without the app/admin expected
-- reported_id column. Keep existing data and add the compatibility surface.

alter table public.reports
  add column if not exists reporter_id uuid references auth.users(id) on delete cascade,
  add column if not exists reported_id uuid references public.profiles(id) on delete cascade,
  add column if not exists type text,
  add column if not exists reason text,
  add column if not exists status text default 'pending',
  add column if not exists created_at timestamptz default now(),
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references auth.users(id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reports_status_check'
      and conrelid = 'public.reports'::regclass
  ) then
    alter table public.reports
      add constraint reports_status_check
      check (status in ('pending', 'reviewed', 'resolved', 'dismissed'));
  end if;
end $$;

create index if not exists idx_reports_reporter_id on public.reports(reporter_id);
create index if not exists idx_reports_reported_id on public.reports(reported_id);
create index if not exists idx_reports_status_created_at on public.reports(status, created_at desc);

alter table public.reports enable row level security;

drop policy if exists "Users can insert own reports" on public.reports;
create policy "Users can insert own reports"
  on public.reports for insert
  with check (reporter_id = auth.uid());

drop policy if exists "Reports readable by authenticated" on public.reports;
drop policy if exists "Reports updatable by authenticated" on public.reports;

create policy "Users can read own reports"
  on public.reports for select
  using (reporter_id = auth.uid() or public.is_profiles_admin());

create policy "Admins can update reports"
  on public.reports for update
  using (public.is_profiles_admin())
  with check (public.is_profiles_admin());

notify pgrst, 'reload schema';
