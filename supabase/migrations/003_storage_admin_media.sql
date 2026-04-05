-- Bucket pour les médias admin (publications, messages de masse : images et vidéos).
-- Les fichiers sont en lecture publique ; seuls les utilisateurs authentifiés peuvent uploader.

-- Création du bucket (colonnes minimales pour compatibilité Supabase)
INSERT INTO storage.buckets (id, name, public)
VALUES ('admin-media', 'admin-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Politiques (éviter doublon si migration relancée)
DROP POLICY IF EXISTS "Public read admin-media" ON storage.objects;
CREATE POLICY "Public read admin-media"
ON storage.objects FOR SELECT
USING (bucket_id = 'admin-media');

DROP POLICY IF EXISTS "Authenticated upload admin-media" ON storage.objects;
CREATE POLICY "Authenticated upload admin-media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'admin-media' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated update admin-media" ON storage.objects;
CREATE POLICY "Authenticated update admin-media"
ON storage.objects FOR UPDATE
USING (bucket_id = 'admin-media' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated delete admin-media" ON storage.objects;
CREATE POLICY "Authenticated delete admin-media"
ON storage.objects FOR DELETE
USING (bucket_id = 'admin-media' AND auth.role() = 'authenticated');
