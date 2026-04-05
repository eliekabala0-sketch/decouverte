-- Créer la table ad_campaigns si elle n'existe pas (admin Campagnes + app Campagnes).
-- N'altère pas les tables existantes. Exécuter si l'admin ou l'app doit gérer les campagnes.

CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  image_url text not null,
  text text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  audience text default 'all' check (audience in ('all', 'men', 'women', 'paying', 'non_paying')),
  priority int default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Politique de lecture pour l'app (utilisateurs authentifiés)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ad_campaigns') THEN
    DROP POLICY IF EXISTS "Ad campaigns readable by authenticated" ON public.ad_campaigns;
    CREATE POLICY "Ad campaigns readable by authenticated"
    ON public.ad_campaigns FOR SELECT
    USING (auth.role() = 'authenticated');
  END IF;
END $$;
