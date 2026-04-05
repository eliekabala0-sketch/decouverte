-- Compte admin test (téléphone + mot de passe comme les utilisateurs).
-- À exécuter dans Supabase SQL Editor APRÈS création de l’utilisateur Auth (voir étape 1).

-- 1) Dashboard → Authentication → Users → « Add user »
--    Email : tel_243900000199@gmail.com   (identifiant interne, aligné sur l’app)
--    Mot de passe : celui que vous choisissez (ex. TestDc26)
--    Auto Confirm User : activé
--
-- 2) Récupérer l’UUID :
--    select id, email from auth.users where email = 'tel_243900000199@gmail.com';

-- 3) Remplacer <USER_ID> par cet UUID puis exécuter le bloc suivant :

insert into public.profiles (
  id, phone, username, gender, age, city, commune, bio,
  status, is_verified, country, role, photo, boost_reason
) values (
  '<USER_ID>'::uuid,
  '+243900000199',
  'AdminDecouverte',
  'M',
  35,
  'Kinshasa',
  'Gombe',
  'Compte administrateur test (rôle admin)',
  'active',
  true,
  'CD',
  'admin',
  'https://picsum.photos/seed/admindecouverte/400/400',
  null
)
on conflict (id) do update set
  phone = excluded.phone,
  username = excluded.username,
  gender = excluded.gender,
  age = excluded.age,
  city = excluded.city,
  commune = excluded.commune,
  bio = excluded.bio,
  status = excluded.status,
  is_verified = excluded.is_verified,
  country = excluded.country,
  role = excluded.role,
  photo = excluded.photo,
  boost_reason = excluded.boost_reason;

insert into public.profile_access (
  user_id, contact_quota, contact_quota_used, photo_quota, photo_quota_used, all_profiles_access, updated_at
) values (
  '<USER_ID>'::uuid,
  100, 0, 100, 0, true, now()
)
on conflict (user_id) do update set
  contact_quota = excluded.contact_quota,
  contact_quota_used = excluded.contact_quota_used,
  photo_quota = excluded.photo_quota,
  photo_quota_used = excluded.photo_quota_used,
  all_profiles_access = excluded.all_profiles_access,
  updated_at = excluded.updated_at;
