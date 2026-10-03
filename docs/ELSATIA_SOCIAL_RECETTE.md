# ELSATIA Social : recette V1 (3 octobre 2026)

Recette réalisée sur une **stack Supabase locale complète**, avec les vrais services : Postgres 17 Supabase, GoTrue (authentification), Storage, PostgREST. Les 179 migrations du dépôt y sont appliquées, et l'application Next.js est pilotée dans Chromium.

Aucun appel n'a été envoyé à Meta ni à LinkedIn :
- les comptes de test sont factices (faux jetons chiffrés) ;
- `SOCIAL_DRY_RUN=true` ;
- l'environnement n'est pas `production`.

## 1. Scénario de bout en bout (sans aucune publication réelle)

| # | Étape | Résultat |
|---|---|---|
| 1 | Brouillon : titre, produit ELSATIA Réserves, texte maître | ✓ |
| 2 | Image : téléversement direct vers le bucket privé, conversion JPEG 1080 × 1080, texte alternatif | ✓ |
| 3 | Génération IA « Adapter par réseau » | ✓ Trois variantes différentes : Facebook 190 c., Instagram 166 c. avec hashtags, LinkedIn 222 c. |
| 4 | Prévisualisation Facebook, Instagram et LinkedIn | ✓ |
| 5 | Soumission à validation | ✓ |
| 6 | Un Éditeur ouvre la publication | ✓ Aucun bouton de validation, message « En attente d'un Administrateur ou d'un Validateur ». Configuration et OAuth refusés. |
| 7 | Validation par un Administrateur, avec commentaire | ✓ |
| 8 | « Publier » sans cocher la confirmation | ✓ Refusé |
| 9 | Publication simulée après confirmation explicite | ✓ « Facebook : simulé · Instagram : simulé · LinkedIn : simulé » |
| 10 | Modification du texte après validation | ✓ Retour en brouillon, validation et empreinte effacées |

État en base après l'étape 9 :
- trois cibles en statut `simule`, **aucun identifiant externe** ;
- requêtes qui auraient été envoyées, tracées dans l'audit : `/{page}/photos`, `/{ig}/media` puis `/media_publish`, `/rest/posts` ;
- journal complet : `media_televerse`, `ia_variantes`, `publication_creee`, `publication_soumise`, `publication_validee`, `publication_demandee`, puis `publication_simulee` pour chacun des trois réseaux.

L'IA était servie par un faux serveur local compatible OpenAI (`scripts/recette-elsatia-social/faux-openai.mjs`), branché via `OPENAI_BASE_URL`. La qualité rédactionnelle réelle reste donc à juger avec la clé de production.

## 2. Interface (42 vues)

Les 14 pages ont été contrôlées dans 3 configurations (bureau clair, mobile 390 px, bureau sombre) :
- pages : publications, nouvelle publication, calendrier mois/semaine/jour, statistiques, commentaires, messages, assistant, comptes, comptes avec erreur OAuth, configuration, équipe, journal ;
- résultat : 42/42 en HTTP 200, bandeau **MODE SIMULATION — aucune publication réelle ne sera envoyée** présent partout, aucun défilement horizontal, aucune erreur JavaScript, aucune couleur or dans le module.

Corrigé pendant la recette :
- débordement horizontal sur mobile (libellé masqué du champ de recherche) ;
- calendrier mensuel illisible sur mobile : il passe en agenda sous 768 px ;
- jeton qui expire sous 10 jours affiché en vert : il passe en rouge, avec une consigne de reconnexion ;
- erreurs affichées sur un formulaire vierge ;
- statut brut « connecte » au lieu de « Connecté » ;
- entrée de menu dorée.

## 3. Base de données (migration 184)

- Appliquée à la suite des 178 migrations existantes, puis retour arrière (0 table restante) et réapplication (16 tables) : cycle validé.
- Testé via PostgREST avec les vrais rôles d'API :

| Rôle | Résultat |
|---|---|
| `service_role` | Écrit. Verrou anti-doublon pris une seule fois. Quota appliqué. Journal impossible à modifier. |
| Utilisateur Éditeur (jeton réel) | Lecture seule. Écriture, jetons et verrou refusés. |
| Anonyme | Tout refusé. |

- **Deux défauts corrigés avant tout déploiement** :
  1. GRANT explicites absents : le projet n'expose plus automatiquement les nouvelles tables, même à `service_role`, donc le module aurait été inutilisable ;
  2. droit d'exécution de `social_verrouiller_cible` et `social_consommer_quota` absent pour `service_role` : le verrou anti-doublon et les quotas auraient échoué.

## 4. Points d'entrée

| Point d'entrée | Résultat |
|---|---|
| `/api/social/cron` | 401 sans secret ou avec un mauvais secret, 200 avec `CRON_SECRET` |
| Webhook Meta | GET avec un mauvais jeton : 403. POST non signé : 401. |
| Webhook LinkedIn | POST non signé : 401. Défi sans secret configuré : 400. |
| OAuth par un Éditeur | Refusé avec message |

## 5. Rejouer la recette

```bash
# Stack locale démarrée (Supabase) et application : npm run dev, avec .env.local de test
npm i --no-save playwright-core
node scripts/recette-elsatia-social/faux-openai.mjs &        # IA factice sur le port 4010
OPENAI_BASE_URL=http://localhost:4010/v1 npm run dev
RECETTE_CAPTURES=/tmp/captures node scripts/recette-elsatia-social/visite.mjs
RECETTE_VISUEL=/tmp/visuel.png node scripts/recette-elsatia-social/scenario.mjs
```

Les comptes de test (`admin@elsatia.test`, `editeur@elsatia.test`) n'existent que dans la base locale.
