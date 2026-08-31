# Migration Supabase vers MySQL sans perte

## Principe de sécurité

Supabase reste la source de vérité jusqu'à ce que les quatre contrôles suivants soient verts :

1. export cohérent de `auth.users`, des tables publiques et des objets Storage ;
2. import idempotent dans MySQL en conservant tous les UUID et hashes bcrypt ;
3. égalité des comptages, absence d'orphelins et tests fonctionnels en lecture seule ;
4. fenêtre de cutover avec gel court des écritures, delta final, sauvegarde et plan de retour.

Le script ne supprime aucune donnée Supabase. Il utilise des `UPSERT`, donc une reprise après interruption est possible.

## Architecture cible

- `server/` : API Express stateless, JWT courts, rate limits et contrôle d'accès centralisé.
- MySQL 8/InnoDB : données relationnelles, index de feed, conversations normalisées et audit.
- Redis : adaptateur Socket.IO et cache partagé à ajouter au déploiement multi-instance.
- LiveKit : SFU WebRTC pour audio/vidéo, avec TURN/TLS et jetons de salle de 10 minutes.
- Stockage S3 compatible : photos et médias ; la base ne conserve que les clés/URLs.

## Secrets nécessaires

Copier `server/.env.example` vers un secret manager Railway, jamais dans Git :

- `SUPABASE_DATABASE_URL` : connexion PostgreSQL directe avec lecture de `auth.users` ;
- `MYSQL_URL` : nouvelle base MySQL avec TLS et sauvegardes automatiques ;
- `JWT_SECRET` : au moins 32 octets aléatoires ;
- `SUPABASE_URL` et `SUPABASE_ANON_KEY` : pont de session temporaire ;
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` ;
- paramètres S3/R2/MinIO pour la migration Storage.

## Exécution contrôlée

```powershell
cd server
npm install
mysql --ssl-mode=REQUIRED "$env:MYSQL_URL" < sql/001_mysql_schema.sql
npm run db:migrate
npm run db:verify
```

Après `db:verify`, effectuer un test de lecture sur une copie/staging. Ne modifier `EXPO_PUBLIC_API_URL` et `VITE_API_URL` en production qu'après validation des parcours : inscription, connexion, profil, photos, feed, déblocages, paiement, messages, administration et appels.

## Cutover et retour arrière

1. annoncer une maintenance brève et bloquer les nouvelles écritures ;
2. sauvegarder Supabase et MySQL ;
3. relancer l'import idempotent puis `db:verify` ;
4. basculer les variables client vers l'API MySQL ;
5. surveiller erreurs, latence, connexions et files Socket.IO ;
6. en cas d'écart, remettre l'ancien endpoint Supabase : aucune donnée source n'a été supprimée.

## Capacité milliers d'utilisateurs

- API stateless derrière plusieurs instances Railway ;
- pool MySQL borné par instance et proxy de connexions si nécessaire ;
- index composites sur feed, messages et paiements ; pagination par curseur à privilégier ;
- Redis obligatoire avant plusieurs instances Socket.IO ;
- LiveKit séparé de l'API : le trafic média ne traverse jamais Express ;
- métriques : p95/p99, connexions MySQL, salles LiveKit, erreurs TURN, débit Storage ;
- sauvegardes automatiques, restauration testée et réplica de lecture lorsque le trafic le justifie.

## Limites actuelles avant activation

Le dépôt ne contient ni accès administrateur Supabase, ni `MYSQL_URL`, ni identifiants LiveKit/S3. La fondation est donc compilable mais volontairement inactive. Ce verrou empêche un basculement incomplet ou une perte de comptes.
