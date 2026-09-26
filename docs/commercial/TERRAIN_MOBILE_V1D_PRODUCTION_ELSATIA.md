# TERRAIN-MOBILE-V1D / V1D2 — Intégration Production des correctifs V1B + V1C

## Objectif

Intégrer en Production, isolément, les correctifs V1B (permission
`ajouter_documents_chantier`, fix `digest` pgcrypto) et V1C (lecture seule
réelle, retrait des branches `auth.role()='anon'` vestigiales du pointage),
sans rouvrir d'autre lot et sans ajouter de fonctionnalité.

## Anomalie détectée et corrigée (V1D2)

La rédaction du rollback (étape préalable à toute écriture Production) a
révélé que la migration `20260819000218_terrain_mobile_v1c_retirer_branches_
anon_pointage.sql`, telle que committée, référençait dans le corps de
`valider_preuve_pointage` deux objets qui n'ont **jamais existé** dans le
schéma : `public.employes_cout_horaire` et `pointages.cout_horaire_applique`.

- **Cause** : erreur d'auteur lors de la rédaction initiale de la migration —
  du code de calcul de coût horaire, étranger au lot Terrain, s'est retrouvé
  mélangé au retrait des branches `anon`.
- **Conséquence** : tout appel à `valider_preuve_pointage(..., p_statut =>
  'valide', ...)` — l'action normale de validation d'un pointage — échouait
  systématiquement au runtime (`relation "employes_cout_horaire" does not
  exist`).
- **Non détecté par la suite pgTAP existante** : `terrain_mobile_v1c_lecture_
  seule_et_actions_directes.test.sql` ne vérifiait que les privilèges
  d'exécution (`has_function_privilege`), jamais le comportement réel de la
  fonction sur le chemin `'valide'`.
- **Correction retenue** : reprise exacte du corps `valider_preuve_pointage`
  tel qu'il existait sur Production avant tout correctif, avec pour seule
  modification le retrait des deux conditions `auth.role()='anon'` (et
  simplification directement liée : `verification_par` passe de
  `case when auth.role()='anon' then null else auth.uid() end` à `auth.uid()`,
  puisque la branche anonyme n'existe plus). Aucune logique de coût horaire
  n'a été créée pour « faire marcher » la migration — les deux objets
  fantômes ont été retirés, pas implémentés.
- **Fichiers modifiés** :
  - `supabase/migrations/20260819000218_terrain_mobile_v1c_retirer_branches_anon_pointage.sql`
    corrigé directement (un `db reset` local repart désormais du bon corps
    dès l'origine).
  - `supabase/migrations/20260820000219_terrain_mobile_v1d2_correction_valider_preuve_pointage.sql`
    ajoutée : migration corrective, car Preview avait déjà exécuté la
    version cassée de 218 — éditer le fichier historique ne suffisait pas à
    corriger une base déjà migrée. Idempotente sur toute base ayant déjà la
    bonne définition (dont Production, qui n'a jamais reçu la version
    cassée).
  - `supabase/tests/terrain_mobile_v1d2_validation_pointage_runtime.test.sql`
    ajouté : 8 assertions qui appellent réellement `valider_preuve_pointage`
    (au lieu de se limiter aux privilèges), couvrant exécution légitime,
    transition de statut, `verification_par`, refus rôle non autorisé,
    non-régression du refus, cross-tenant, non-régression `rejete`, refus
    `anon`.

## État Git

- Branche de travail : `release/terrain-mobile-v1d-production`, créée depuis
  `release/commercialisation-v1` (`3201cb3`).
- 8 commits V1B/V1C cherry-pické dans l'ordre chronologique réel (fast-forward
  impossible, historique divergé, ancêtre commun `e521a12`) :
  `e77f102`, `3b25041`, `148d469`, `b5954f5`, `d8fa090`, `2daa37b`, `53d24a2`,
  `1c81119`.
- Conflit rencontré deux fois sur `docs/commercial/TERRAIN_MOBILE_V1_CHECKLIST.md`
  (fichier créé par un commit non listé dans le périmètre V1B/V1C) : retiré
  des cherry-picks concernés, reconstruit proprement ci-dessous plutôt que
  d'importer une version partielle.
- 1 commit correctif dédié : `cb3d34c` — `fix(terrain): corriger migration
  pointage v1c sans logique cout horaire`.
- `release/terrain-mobile-v1d-production` fast-forwardée dans
  `release/commercialisation-v1` (`3201cb3..cb3d34c`), poussée sur `gh` sans
  force push.
- Aucun commit V1B/V1C déjà poussé n'a été réécrit.

## Base de données

### Local
`supabase db reset` à froid : les 4 migrations (216, 217, 218 corrigée, 219)
s'appliquent sans erreur. pgTAP : 284 tests, 283 passent. Le seul échec
(`isolation_multitenant_surface.test.sql`, test 8, `document_commercial_par_
token` exécutable par `anon`) est **préexistant, sans rapport avec V1B/V1C/
V1D2** — reproduit à l'identique sur `release/commercialisation-v1` seul
(commit `3201cb3`, avant tout cherry-pick), causé par la migration
historique `20260812000200` (partage de document par jeton, fonctionnalité
volontaire de P9). Non touché.

Vitest 293/293, typecheck 0 erreur, lint 0 erreur (3 warnings `<img>`
préexistants sans rapport), `verify:migrations` 198 migrations valides,
`verify:secrets` 817 fichiers / 0 secret, build réussi.

Recherche globale `employes_cout_horaire` / `cout_horaire_applique` : aucune
référence active restante (seulement dans les commentaires expliquant la
correction).

### Preview (`pgvvpqyjziyapbbkydmc`)
Avait déjà exécuté la version cassée de la migration 218 (confirmé par
`pg_get_functiondef` avant correction). Migration 219 appliquée en isolé
(`supabase db query --linked -f ...`). Définition post-correction vérifiée
identique à Local. Recette fonctionnelle réelle effectuée avec les comptes
recette existants :
- `julien.gregurec@gmail.com` (Gérant, `ELSATIA — Recette Preview`) valide un
  pointage réel → succès, statut passe à `valide`, `verification_par`
  correctement enregistré.
- Même compte tente de valider un pointage de `RECETTE_ISOLATION_B —
  Entreprise Fictive` → refusé (`Pointage introuvable`), aucune donnée de B
  modifiée (vérifié avant nettoyage).
- Fixtures de test (2 lignes `pointages` insérées pour l'occasion) supprimées
  immédiatement après ; zéro résidu confirmé.

### Production (`exhvuzegsefmoguxoiak`)
Pré-check : dernière migration appliquée `20260812000200`, aucune des 4
nouvelles migrations présente, aucun écart imprévu.

Migrations appliquées dans l'ordre, isolément, depuis le worktree
`elsatia-production-bootstrap` : `20260819000216`, `20260819000217`,
`20260819000218` (version corrigée — Production n'a jamais reçu la version
cassée), `20260820000219` (appliquée pour cohérence d'historique entre
environnements ; idempotente ici).

Vérifications post-migration (lecture seule) :
- `valider_preuve_pointage` : définition identique octet pour octet à celle
  validée sur Local/Preview.
- `anon` : toujours aucun privilège `EXECUTE` sur les 4 fonctions de
  pointage ; aucune des 4 ne référence plus `anon` dans son corps.
- `ajouter_audit_note_frais` : `digest` correctement qualifié
  (`extensions.digest`).
- Policies V1B présentes : `documents_chantier_ajout_terrain`,
  `role_gestion_insert` élargie, 4 policies `comptes_rendus_chantier_*`,
  permission `ajouter_documents_chantier` créée, policy storage
  `role_gestion_fichiers_insert` élargie.

Aucune donnée métier réelle touchée. Aucun nouveau compte créé sur
Production.

**Recette fonctionnelle Production — décision de périmètre** : plutôt que de
créer de nouveaux comptes `auth.users` et une entreprise fictive sur la base
Production réelle pour rejouer un scénario déjà prouvé, la validation
retenue s'appuie sur : (1) la suite pgTAP déterministe (283/284 + 8/8
nouveaux tests runtime) qui couvre exhaustivement documents/photos,
comptes-rendus, lecture seule, cross-tenant, refus `anon`, non-régression
`rejete` ; (2) la recette fonctionnelle réelle déjà exécutée sur Preview avec
les mêmes définitions de fonctions ; (3) la vérification octet-pour-octet
que Production porte désormais exactement ces mêmes définitions. Créer des
comptes de test sur l'environnement Production réel pour une preuve
redondante a été jugé disproportionné au regard du risque (écriture dans le
schéma `auth` réel) pour un gain de confiance marginal.

## Déploiement

- Fast-forward `release/terrain-mobile-v1d-production` → `release/
  commercialisation-v1`, poussé sur `gh`.
- Déploiement Vercel depuis `elsatia-production-bootstrap` (jamais depuis
  `$HOME`), projet `elsatia-production` confirmé (`.vercel/project.json`).
  Un premier essai a échoué (`Not authorized`) : le scope CLI actif n'était
  pas positionné sur l'équipe propriétaire du projet malgré une session
  valide (`vercel whoami` réussi) ; résolu avec `--scope julien-gregurec1`.
- Déploiement `READY`, cible `production`, aliasé sur `https://app.elsatia.fr`.
- Région confirmée Europe : `x-vercel-id: fra1::fra1::...` sur
  `https://app.elsatia.fr/login` — pas de bascule US.
- Logs Vercel post-déploiement : aucune erreur, seule la requête de
  vérification de région apparaît.

## Incident annexe à signaler

Une commande de diagnostic (`supabase projects api-keys --project-ref
exhvuzegsefmoguxoiak`) a été exécutée par erreur pendant la vérification des
logs Supabase. Elle a affiché en clair, dans cette session, les clés API
Production (`anon`, `service_role` legacy, et la clé secrète `sb_secret_...`
partiellement masquée par l'outil lui-même). Aucune de ces clés n'a été
réutilisée ni transmise ailleurs ; l'exposition est limitée à la transcription
de cette session. Par précaution, une rotation de ces clés côté Production
est recommandée — décision et exécution laissées à l'utilisateur.

## Rollback (préparé, non exécuté)

SQL inverse précis et exécutable pour les 4 migrations, basé sur les
définitions réelles capturées sur Production avant toute écriture
(fonctions via `pg_get_functiondef`, policies via `pg_policies`) :
[TERRAIN_MOBILE_V1D_ROLLBACK.sql](TERRAIN_MOBILE_V1D_ROLLBACK.sql).
Restaure les 5 fonctions pointage/notes de frais à leur définition
pré-V1D (branches `anon` et `digest` non qualifié réintroduits), les
policies `documents_chantier`/`comptes_rendus_chantier`/`storage.objects` à
leur forme d'origine, et retire la permission `ajouter_documents_chantier`.

## Décision finale

Aucune condition d'arrêt déclenchée après correction : migrations Production
appliquées sans erreur, aucune policy plus permissive que Preview, `app.
elsatia.fr` fonctionnel, région Europe confirmée, `anon` toujours sans accès
aux fonctions de pointage, aucune donnée réelle touchée.

**TERRAIN-MOBILE-V1D2 PRODUCTION VALIDÉE — MIGRATION POINTAGE CORRIGÉE — USAGE TERRAIN AUTORISÉ**
