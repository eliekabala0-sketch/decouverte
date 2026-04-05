-- Script optionnel : lister les tables et colonnes du schéma public (pour vérifier la base réelle).
-- Exécuter dans l'éditeur SQL Supabase pour afficher les tables existantes.
-- Ne pas exécuter en même temps que les migrations 001 et 002.

SELECT table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
