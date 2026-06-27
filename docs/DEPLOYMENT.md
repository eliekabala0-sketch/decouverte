# Déploiement — Découverte

## Prérequis

- Node.js 18+
- Compte Supabase (projet créé, URL et clés anon/service)
- (Optionnel) passerelle de paiement serveur pour les paiements réels

## Variables d'environnement

### Application utilisateur (Expo / React Native)

- `EXPO_PUBLIC_SUPABASE_URL` — URL du projet Supabase
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Clé anon Supabase

Ne pas exposer de variable paiement dans Expo. Les paiements passent par les Edge Functions Supabase.

### Admin (Vite)

- `VITE_SUPABASE_URL` — URL du projet Supabase
- `VITE_SUPABASE_ANON_KEY` — Clé anon Supabase (ou service_role pour tout droit)

## Migrations Supabase

Exécuter dans l’éditeur SQL Supabase, **dans l’ordre** :

1. **001** — Évolutions conditionnelles (USD, boost_reason, content_type, etc.)
2. **002** — Création des tables manquantes (contact_packs, public_publications, mass_messages, admin_settings)
3. **003** — Storage bucket admin-media
4. **004** — Politiques de lecture app (public_publications, ad_campaigns, contact_packs)
5. **006** — Création table ad_campaigns si manquante
6. **007** — Création tables conversations et messages si manquantes
7. **005** — RLS conversations et messages
8. **008** — Création table reports si manquante + RLS
9. **009** — RLS mass_messages (lecture app + envoi admin)

Avant toute migration : vérifier l’état réel des tables (information_schema) pour éviter les erreurs.

## Build

### Admin (dashboard)

```bash
cd admin
npm install
npm run build
```

Sortie : `admin/dist/`. Héberger sur un hébergeur statique (Vercel, Netlify, etc.) avec les variables d’environnement configurées.

### Application utilisateur (Expo)

```bash
cd app
npm install
npx expo start
```

Pour un build de production (EAS ou local) :

```bash
npx expo prebuild
npx expo run:android
# ou
npx expo run:ios
```

Pour les stores : configurer EAS Build (expo build) et soumettre les binaires.

## Tests avant livraison

- **Admin** : connexion, Packs, Publications, Campagnes, Messages de masse (création + Envoyer), Boosts, Paramètres, Profils, Paiements, Signalements, Conversations.
- **Utilisateur** : Welcome → Créer un compte → Création profil → Accueil → Profils (modes) → Publications → Annonces → Campagnes → Messages → Signaler un profil → Packs / Paiements → Compte → Déconnexion.

## Paiement réel

Les paiements passent par les Edge Functions Supabase :

1. `payment-create` crée une transaction pending et appelle la passerelle côté serveur.
2. `payment-status` vérifie le statut côté serveur.
3. Le webhook Supabase de paiement reste le point de callback sécurisé et active les droits.

Variables serveur à configurer dans Supabase uniquement :

- `PAYMENT_API_KEY`
- `PAYMENT_API_SECRET`
- `PAYMENT_WEBHOOK_SECRET`
- `PAYMENT_BASE_URL`
- `PAYMENT_APP_SLUG`
- `PAYMENT_APP_ID`

Ne jamais mettre ces valeurs dans `EXPO_PUBLIC_*`, `VITE_*` ou dans le bundle frontend.
