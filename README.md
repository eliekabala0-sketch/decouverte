# Découverte

Application de rencontre / mise en relation locale pour la RDC. Deux espaces : **Mode Libre** et **Mode Sérieux**.

## Structure du projet

- **`app/`** — Application mobile (Expo / React Native), Android d’abord, extensible au web.
- **`admin/`** — Tableau de bord administrateur (Vite + React).
- **`lib/`** — Types, constantes et client Supabase partagés.
- **`supabase/`** — Schéma SQL et migrations.

## Prérequis

- Node.js 18+
- Compte Supabase
- (Optionnel) Expo Go sur Android pour tester l’app

## Configuration

1. **Variables d’environnement**

   - **App Expo** : créer `app/.env` ou définir dans `app.json` / EAS :
     - `EXPO_PUBLIC_SUPABASE_URL`
     - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - **Admin** : créer `admin/.env` :
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`
   - **Root** (si besoin) : `SUPABASE_URL`, `SUPABASE_ANON_KEY`

2. **Supabase**

   - Créer un projet sur [supabase.com](https://supabase.com).
   - Dans l’éditeur SQL, exécuter le contenu de `supabase/schema.sql`.
   - Activer l’auth (Email/Password pour l’admin ; pour l’app mobile, prévoir **Phone Auth** ou adapter l’inscription avec email dérivé du téléphone).

## Lancer l’application mobile (Expo)

```bash
cd app
npm install
npx expo start
```

- Appuyer sur `a` pour Android.
- Pour le web : `npx expo start --web`.

## Lancer l’admin

```bash
cd admin
npm install
npm run dev
```

Ouvrir http://localhost:3001. Connexion par **email + mot de passe** (compte Supabase Auth).

## Fonctionnalités principales

- **App** : accueil avec choix Mode Libre / Mode Sérieux, inscription (téléphone + mot de passe), création de profil (sexe, âge 18+, ville, commune, photo, bio), liste et détail de profils, paiements (accès profils 30 j, packs contacts, mise en avant), messagerie, publications publiques, campagnes.
- **Admin** : utilisateurs, profils (voir, modifier, suspendre, bannir, restaurer), conversations, signalements, paiements, packs contacts (quotas modifiables), boosts, paramètres dynamiques (activer/désactiver fonctionnalités), publications, campagnes publicitaires, messages de masse par segments.

## Paiement

- Intégration prévue avec **Badiboss Pay** : à brancher côté backend / Edge Functions Supabase pour les webhooks et la mise à jour des accès (profils, quotas contacts).

## Idées de modules complémentaires (dashboard)

- **Badges** (vérifié, premium, etc.) — déjà prévu dans les paramètres.
- **Offres promotionnelles** — activable/désactivable.
- **Statistiques avancées** — graphiques par ville, mode, conversions.
- **Export des données** — CSV/Excel pour les rapports.
- **Règles de modération** — seuils automatiques (nombre de signalements → suspension).
- **Notifications push** — configuration des templates depuis l’admin.

---

Style premium, navigation fluide, design élégant et local. Base propre et extensible.
