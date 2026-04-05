# Roadmap jusqu'à la livraison — Découverte

## Vue d’ensemble

- **Admin** : tableau de bord (packs, boosts, publications, messages de masse, campagnes, paramètres, profils, paiements, signalements, conversations).
- **Utilisateurs** : création de compte, connexion, profil, accueil, profils (modes Libre/Sérieux), publications, campagnes, messages/conversations, packs/paiements, compte.
- **Base** : Supabase (tables réelles possibles : profiles, profile_access, contact_packs, payments, conversations, messages, public_publications, mass_messages, admin_settings ; ad_campaigns, reports, etc. peuvent manquer selon l’historique).

---

## Étapes restantes avant livraison

### 1. Base de données et migrations
- Exécuter les migrations dans l’ordre (001 à 006) ; 004 et 005 sont conditionnelles (pas d’erreur si une table n’existe pas).
- Si la table **ad_campaigns** manque : exécuter **006** pour la créer et appliquer la politique de lecture.
- Vérifier que les politiques RLS (admin et app) correspondent au schéma réel (service_role ou anon + politiques).

### 2. Parcours utilisateur (tests et finition)
- **Création de compte** : Welcome → Register (téléphone/email synthétique + mot de passe) → Create profile (données profil).
- **Connexion** : Welcome → Login → redirection vers l’app si profil existant.
- **Profils** : liste par mode (Libre/Sérieux), profils boostés en premier, détail profil, déblocage contact / envoi message (quota).
- **Publications / Campagnes** : affichage des contenus actifs (texte, image, vidéo selon le cas).
- **Messages** : liste des conversations, ouverture conversation, envoi/réception (temps réel si activé).
- **Packs / Paiements** : affichage packs en USD, simulation achat (à remplacer par Badiboss Pay en prod).
- **Compte** : déconnexion, édition profil si prévu.
- Tester sur téléphone et desktop (responsive / PWA si applicable).

### 3. Admin (tests et cohérence)
- Vérifier chaque section (Packs, Boosts, Publications, Messages de masse, Campagnes, Paramètres, Profils, Paiements, Signalements, Conversations) avec la base réelle.
- Si une table n’existe pas : exécuter la migration de création correspondante (ex. 002 pour contact_packs, public_publications, mass_messages, admin_settings ; 006 pour ad_campaigns).
- Upload médias (images/vidéos) : bucket **admin-media** et politique de lecture publique.

### 4. Paiement réel (Badiboss Pay)
- Remplacer la simulation par l’intégration Badiboss Pay (initiation paiement, webhook, mise à jour `payments` et `profile_access` / quotas).
- Tester en staging avec des montants réels ou sandbox si disponible.

### 5. Signalements (côté app)
- Permettre à l’utilisateur de signaler un profil depuis la fiche profil (ou liste).
- Côté admin : écran Signalements déjà prévu.

### 6. Messages de masse (envoi effectif)
- Déclencher l’envoi des messages de masse (push, email ou in-app) selon les segments définis dans l’admin.
- Gérer statut (envoyé / échec) et métadonnées si besoin.

### 7. Sécurité et confidentialité
- Vérifier toutes les politiques RLS (profiles, profile_access, payments, conversations, messages, reports, etc.) selon les rôles (anon, authenticated, service_role).
- Vérifier que les données sensibles (téléphone, email) ne sont pas exposées côté client au-delà du nécessaire.

### 8. Déploiement et livraison
- Build production : app (Expo/React Native), admin (Vite).
- Variables d’environnement (Supabase URL/keys, Badiboss si applicable).
- Hébergement admin + déploiement app (stores ou lien web).
- Documentation courte : démarrage projet, exécution des migrations, configuration env.

---

## Ordre recommandé des migrations (base réelle)

1. **001** — Évolutions conditionnelles (USD, boost_reason, content_type, etc.).
2. **002** — Création des tables manquantes (contact_packs, public_publications, mass_messages, admin_settings).
3. **003** — Storage admin-media (bucket + politiques).
4. **004** — Politiques de lecture app (conditionnelles : public_publications, ad_campaigns, contact_packs).
5. **006** — Création **ad_campaigns** si absente + politique de lecture.
6. **007** — Création **conversations** et **messages** si absentes (index conditionnel).
7. **005** — RLS conversations et messages (conditionnel ; exécuter après 007).
8. **008** — Création **reports** si absente + RLS.
9. **009** — RLS **mass_messages** (lecture app Annonces + envoi admin). Vérifier information_schema avant toute migration.

Après 009, l’admin Campagnes et l’écran Campagnes de l’app fonctionnent (si les autres tables et politiques sont en place).
