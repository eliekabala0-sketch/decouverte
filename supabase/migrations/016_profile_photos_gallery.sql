-- Galerie photos profil (photo principale + photos secondaires)
-- Compatible schéma actuel: profiles.photo reste la photo principale affichée.

create table if not exists public.profile_photos (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  photo_url text not null,
  is_primary boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_profile_photos_user_id on public.profile_photos(user_id);
create index if not exists idx_profile_photos_primary on public.profile_photos(user_id, is_primary desc, sort_order asc, created_at asc);

alter table public.profile_photos enable row level security;

drop policy if exists "Users read profile_photos authenticated" on public.profile_photos;
create policy "Users read profile_photos authenticated"
on public.profile_photos for select
using (auth.role() = 'authenticated');

drop policy if exists "Users insert own profile_photos" on public.profile_photos;
create policy "Users insert own profile_photos"
on public.profile_photos for insert
with check (auth.uid() = user_id);

drop policy if exists "Users update own profile_photos" on public.profile_photos;
create policy "Users update own profile_photos"
on public.profile_photos for update
using (auth.uid() = user_id);

drop policy if exists "Users delete own profile_photos" on public.profile_photos;
create policy "Users delete own profile_photos"
on public.profile_photos for delete
using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('profile-media', 'profile-media', true)
on conflict (id) do update set public = true;

drop policy if exists "Public read profile-media" on storage.objects;
create policy "Public read profile-media"
on storage.objects for select
using (bucket_id = 'profile-media');

drop policy if exists "Users upload own profile-media" on storage.objects;
create policy "Users upload own profile-media"
on storage.objects for insert
with check (
  bucket_id = 'profile-media'
  and auth.role() = 'authenticated'
  and name like (auth.uid()::text || '/%')
);

drop policy if exists "Users update own profile-media" on storage.objects;
create policy "Users update own profile-media"
on storage.objects for update
using (
  bucket_id = 'profile-media'
  and auth.role() = 'authenticated'
  and name like (auth.uid()::text || '/%')
);

drop policy if exists "Users delete own profile-media" on storage.objects;
create policy "Users delete own profile-media"
on storage.objects for delete
using (
  bucket_id = 'profile-media'
  and auth.role() = 'authenticated'
  and name like (auth.uid()::text || '/%')
);
