# ELSATIA Social : recette V1 (3 octobre 2026)

## 0. Requalification sur le train canonique V9.2 (branche `integration/elsatia-social-v1`)

Base : HEAD du train `dfb59cc` + migration `20261003001601_elsatia_social.sql`. Aucun appel à Meta ni LinkedIn, `SOCIAL_DRY_RUN` en simulation.

| Contrôle | Résultat |
|---|---|
| Application de toutes les migrations sur PostgreSQL 16 vierge (`rebuild_db.sh`) | **409/409**, sans erreur ; noms et horodatages uniques (`verify:migrations`) |
| Collision | aucune migration `≥ 20261003001505` sur le train ni sur aucune branche distante |
| Retour arrière Social puis réapplication | 16 → 0 → 16 tables ; objets canoniques intacts |
| pgTAP Social (`supabase/tests/elsatia_social_v1.test.sql`) | **74/74** : RLS, anon, authenticated, service_role, AAL2, validation, verrou anti-doublon, quotas, audit, stockage, garde incident, RGPD |
| Suite pgTAP complète du train (182 fichiers, 9 249 assertions) | échecs **identiques** à la base témoin V9.2 sans Social (9 fichiers préexistants : 7 Studio — projet Supabase dédié —, attestation Stripe R72 — vrai `pgsodium` requis —, Tools cloud sync) |
| PostgREST + GoTrue réels, AAL2 par enrôlement TOTP réel (`postgrest-gotrue.mjs`) | **26/26** |
| Navigateur, `next dev` sur la pile réelle, ACL canonique conservée (`navigateur-v92.mjs`) | **16/16** : 14 pages × 3 affichages (42 vues) avec bandeau simulation, sans débordement ni erreur JS ; MFA exigé ; validation AAL2 ; publication simulée sans identifiant externe ; rôle modifié et journalisé ; identité révoquée coupée ; `/suppression-donnees` publique |

Défauts trouvés par cette requalification et corrigés avant tout déploiement :
1. **Garde du mode sûr incident** absente des 16 tables (règle du train) : `incident_installer_gardes()` ajoutée.
2. **Purge RGPD de toute entreprise cassée** : `verifier_storage_entreprise()` parcourt toute colonne `*storage_path*` en supposant un `entreprise_id` ; colonne Social renommée `chemin_objet` (10 suites pgTAP Tools/RGPD repassées).
3. **Page Équipe vide en conditions réelles** : le `service_role` n'a plus de droit sur `plateforme_admins` (réconciliation ACL 255). Le banc GoTrue historique masquait le défaut en accordant tout au `service_role` ; nouvelle RPC `social_lister_equipe()` sous JWT, recette refaite avec l'ACL canonique.
4. Privilèges par défaut : TRUNCATE/UPDATE/DELETE retirés explicitement au `service_role` sur le journal.

Non couvert localement : téléversement réel par URL signée (le stockage simulé du banc ne gère pas `upload/sign` ; couvert par la recette initiale sur Supabase complet), IA réelle, Meta et LinkedIn réels.

---

_Recette initiale, réalisée sur l'ancienne base `main` (migration 184), conservée pour l'historique :_

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

## 3. Base de données (migration 184, ancienne numérotation)

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
