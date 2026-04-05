-- Politiques de lecture pour l'application utilisateur (authenticated).
-- S'applique uniquement aux tables présentes : aucune erreur si une table n'existe pas.
-- Exécuter dans l'éditeur SQL Supabase.

-- public_publications (si la table existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'public_publications') THEN
    DROP POLICY IF EXISTS "Public publications readable by authenticated" ON public.public_publications;
    CREATE POLICY "Public publications readable by authenticated"
    ON public.public_publications FOR SELECT
    USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ad_campaigns (si la table existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ad_campaigns') THEN
    DROP POLICY IF EXISTS "Ad campaigns readable by authenticated" ON public.ad_campaigns;
    CREATE POLICY "Ad campaigns readable by authenticated"
    ON public.ad_campaigns FOR SELECT
    USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- contact_packs (si la table existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contact_packs') THEN
    DROP POLICY IF EXISTS "Contact packs readable by authenticated" ON public.contact_packs;
    CREATE POLICY "Contact packs readable by authenticated"
    ON public.contact_packs FOR SELECT
    USING (auth.role() = 'authenticated');
  END IF;
END $$;
