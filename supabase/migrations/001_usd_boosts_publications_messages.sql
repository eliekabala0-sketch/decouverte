-- Évolution : USD, boosts (raison), publications et messages multi-formats
-- S'applique uniquement aux tables déjà présentes (aucune erreur si une table n'existe pas).
-- Exécuter dans l'éditeur SQL Supabase.

-- 1. contact_packs : défaut devise USD (si la table existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contact_packs') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'contact_packs' AND column_name = 'currency') THEN
      ALTER TABLE public.contact_packs ALTER COLUMN currency SET DEFAULT 'USD';
    END IF;
  END IF;
END $$;

-- 2. payments : défaut devise USD (si la table existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payments') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'currency') THEN
      ALTER TABLE public.payments ALTER COLUMN currency SET DEFAULT 'USD';
    END IF;
  END IF;
END $$;

-- 3. profiles : colonne boost_reason (si la table existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'boost_reason') THEN
      ALTER TABLE public.profiles ADD COLUMN boost_reason text;
    END IF;
  END IF;
END $$;

-- 4. public_publications : content_type et video_url (si la table existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'public_publications') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'public_publications' AND column_name = 'content_type') THEN
      ALTER TABLE public.public_publications ADD COLUMN content_type text DEFAULT 'text';
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'public_publications_content_type_check') THEN
        ALTER TABLE public.public_publications ADD CONSTRAINT public_publications_content_type_check
          CHECK (content_type IN ('text', 'image', 'video'));
      END IF;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'public_publications' AND column_name = 'video_url') THEN
      ALTER TABLE public.public_publications ADD COLUMN video_url text;
    END IF;
  END IF;
END $$;

-- 5. mass_messages : content_type, image_url, video_url (si la table existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mass_messages') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'mass_messages' AND column_name = 'content_type') THEN
      ALTER TABLE public.mass_messages ADD COLUMN content_type text DEFAULT 'text';
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mass_messages_content_type_check') THEN
        ALTER TABLE public.mass_messages ADD CONSTRAINT mass_messages_content_type_check
          CHECK (content_type IN ('text', 'image', 'video'));
      END IF;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'mass_messages' AND column_name = 'image_url') THEN
      ALTER TABLE public.mass_messages ADD COLUMN image_url text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'mass_messages' AND column_name = 'video_url') THEN
      ALTER TABLE public.mass_messages ADD COLUMN video_url text;
    END IF;
  END IF;
END $$;
