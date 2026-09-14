# Runbook — mise en Production GP V1 (préparé, NON exécuté)

Version 2026-09-14 (session autonome, qualification finale RC). Issu de la recette preview
(`ELSATIA_GP_V1_PREVIEW_VALIDATION_REPORT.md`, § 6, 7, 17, 18, 21). **Rien de ce runbook n'a été joué sur
Production** ; il décrit ce qui a été fait sur la preview et sur la RC, et ce qui doit l'être en Production,
dans l'ordre, avec le rôle réellement utilisé et les conditions d'arrêt.

**Changement de périmètre (2026-09-14)** : la branche `feat/gp-v1-metier-devis-planning-references-v1`
(258 commits / 1 380 fichiers depuis `release/commercialisation-v1`) s'est révélée trop large pour une
fusion directe — elle embarquait des chantiers plateforme non validés dans ce fil (bascule multi-application,
assistance inter-applications, hors-ligne/PWA Réserves, tarification/Stripe plateforme). Sur décision de
Julien, ce runbook ne référence plus cette branche mais **`release/gp-v1-rc`**, une release candidate
reconstruite à la main sur `release/commercialisation-v1` (base `fcdd4e7`), contenant uniquement le périmètre
minimal nécessaire à GP V1. Rapports complets : « GP V1 — Isolation Release Candidate » puis « GP V1 RC —
Qualification finale avant Production » (2026-09-14). `feat/gp-v1-metier-devis-planning-references-v1` reste
intacte comme référence de comportement validé, mais n'est plus la source de la mise en Production.

Périmètre : ledger `20260710000001` → `20260914000296` (239 fichiers), branche **`release/gp-v1-rc`** (HEAD
`2018ff383f2fa07b15787ed82039dccfb0993213` au 2026-09-14), projet Supabase Production
`exhvuzegsefmoguxoiak`, projet Vercel `elsatia-production` (branche de production
`release/commercialisation-v1`).

Deux migrations spécifiques à cette RC, ni l'une ni l'autre dans la branche feature d'origine :
- `20260903000252_gp_v1_rc_aal2_session_check.sql` — vendors `plateforme_exiger_session_aal2()` seule
  (dépendance réelle de la 257, trouvée par pgTAP — voir § 5.4).
- `20260911000297_gp_v1_rc_acl_prerequisites.sql` — sous-ensemble filtré des REVOKE de la migration
  `20260902000255_acl_reconciliation_v1` (voir § 5.3). **Portait le numéro 297 dès la première version de ce
  runbook** — pas de renumérotation a posteriori d'une migration déjà publiée : un scan de toutes les
  branches distantes (207) a trouvé une collision avec `20260909000281_colors_finition_reference_nuancier_v15.sql`
  (Colors, `integration/colors-pilot-readiness-v1`) sur le numéro fonctionnel 281 initialement choisi ; comme
  aucune des deux migrations n'était encore publiée, celle-ci a été déplacée à 297 (même date, même contenu)
  avant tout push.

## 1. Préchecks

1. Julien a validé visuellement Devis V2, Planning V2, le copier/coller et l'accès recette sur la preview
   (branche feature, comportement de référence) ; il a autorisé explicitement la préparation de la mise en
   Production (aucune étape ci-dessous ne se joue sans son accord explicite et renouvelé).
2. `release/gp-v1-rc` poussée sur origin, **non fusionnée** dans `release/commercialisation-v1` (c'est
   `release/commercialisation-v1` elle-même, au HEAD `fcdd4e7`, qui reste la branche de production Vercel —
   voir § 6) ; `npm run verify:migrations` (239 valides), `npm run verify:secrets`, `git diff --check` verts ;
   `npx tsc --noEmit`, `npm run lint`, build (`next build`) verts ; vitest complet : 1147/1151 en exécution
   séquentielle (`--no-file-parallelism`, 3 skip, 1 échec confirmé environnemental sur `xlsx.test.ts`,
   vert isolément) — en parallélisme par défaut, un second test (`route.test.ts` du webhook boutique) peut
   également échouer par intermittence : confirmé être une collision de `process.env` entre fichiers de test
   Vitest exécutés en parallèle sur cette machine chargée, pas un défaut du code (repasse au vert isolément,
   en groupe restreint, et systématiquement en séquentiel) ; pgTAP complet (920/920 sur 43 suites, rôle
   `postgres` — voir § 1.3, Fresh) verts.
3. **Rôle qui migre — confirmé critique empiriquement le 2026-09-14** : `supabase link --project-ref
   exhvuzegsefmoguxoiak` puis `db push --linked` — la CLI se connecte via l'API de gestion avec le rôle
   temporaire `cli_login_postgres` (membre de `postgres`, objets créés par `postgres`). La migration 297
   (§ ci-dessus) pose des `ALTER DEFAULT PRIVILEGES FOR ROLE postgres ...` : ces privilèges par défaut ne
   s'appliquent QU'aux objets créés ensuite par le rôle `postgres` nommément. Une répétition générale faite
   par erreur avec un rôle différent (`supabase_admin`, dans le harnais de test local) a laissé des tables
   créées après coup (ex. `ouvrages_versions`, migration 284) sans les privilèges par défaut attendus,
   provoquant de faux échecs pgTAP — reproduit et confirmé en refaisant la répétition avec le rôle `postgres`
   exact. **Vérifier que la migration Production s'exécute bien sous `postgres`, jamais sous un autre rôle,
   même superutilisateur.** Son `search_path` ne contient pas `extensions` : c'est pourquoi la 276 a été
   qualifiée (`gin_trgm_ops` résolu par le schéma réel de `pg_trgm`), prouvée sur Fresh et sur un rôle sans
   `extensions`. **Le rôle `postgres` (superutilisateur historique) n'est plus nécessaire — mais le rôle
   nommé `postgres` (via `cli_login_postgres`) l'est, pour les default privileges ci-dessus.** Vérifier
   `supabase/.temp/project-ref` avant toute écriture.
4. Fenêtre : hors heures ouvrées des clients ; responsable nommé ; canal de communication ouvert.

## 2. Sauvegarde

- Aucune sauvegarde physique n'existe sur les projets sans PITR (constaté sur la preview) : faire une
  **sauvegarde logique datée** avant toute écriture — `db dump --linked -f schema.sql`,
  `--data-only --use-copy -f data.sql`, `--role-only -f roles.sql` — et la conserver hors du dépôt.
- Relever les **compteurs de référence** (conservés dans le rapport de mise en Production) : `count(*)` de
  `entreprises`, `auth.users`, `clients`, `chantiers`, `devis`, `lignes_devis`, `factures`, `lignes_factures`,
  `planning_evenements`, et `max(numero)` de `devis` et de `factures`. Ils sont rejoués après migration
  (§ 11.2) : toute différence = STOP.

## 3. Comparaison des ledgers — NON ENCORE FAITE

**Cette section reste à exécuter avant toute Production.** Aucun accès Production (même en lecture) n'était
disponible dans la session du 2026-09-14 (`supabase` CLI présent mais sans session/jeton d'accès configuré
sur cette machine — ni variable d'environnement, ni connexion mémorisée). Julien a indiqué fournir l'accès en
lecture seule séparément. **Ne plus supposer que Production est exactement au ledger `20260810000210`** :
c'était l'état constaté lors d'une reconnaissance antérieure, non revérifié depuis. Dès l'accès obtenu :

- `supabase link --project-ref exhvuzegsefmoguxoiak` (lecture) ; `supabase migration list --linked` —
  constater le `max(version)` réel, pas le supposer.
- Construire la table : `| Migration | Prod | release/commercialisation-v1 | release/gp-v1-rc | Action future |`
  pour chaque migration entre le dernier état connu et 297.
- Si Production diverge du runbook (ledger différent de `20260810000210`, ou versions distantes absentes du
  dépôt local) : **STOP sur le déploiement**, mais poursuivre l'analyse — déterminer le train exact
  nécessaire et remettre à jour cette section avant nouvelle tentative.
- `db push --linked --dry-run --include-all` doit ensuite lister exactement les versions en attente (les
  numéros inférieurs au maximum distant — 200, 232, 236→240 — exigent `--include-all`).
- **Absence attendue et volontaire** : `20260902000255_acl_reconciliation_v1.sql` n'est PAS dans
  `release/gp-v1-rc` — son contenu utile à ce périmètre (REVOKE sur les objets réellement présents) a été
  extrait dans `20260911000297_gp_v1_rc_acl_prerequisites.sql` (321 fonctions, 762 tables, 6 séquences). Ce
  n'est pas un ledger incomplet : c'est un remplacement délibéré, vérifié par pgTAP (§ 4.4).

## 4. Répétition générale (obligatoire, sur clone jetable) — faite sur baseline, pas sur sauvegarde réelle

1. **Fait le 2026-09-14, sur la 211-baseline de `release/commercialisation-v1`** (pas encore sur une
   sauvegarde logique Production réelle — § 3 doit être close en premier). Conteneur Postgres jetable
   (`public.ecr.aws/supabase/postgres:17.6.1.143`, prélude `ELSATIA-STACKS/train-v3-dbtest/prelude.sql`),
   239 migrations appliquées **sous le rôle `postgres`** dans l'ordre lexical des noms de fichiers : succès
   intégral, schéma cohérent.
2. **Reste à faire, une fois § 3 close** : restaurer la sauvegarde logique RÉELLE de Production dans un
   Postgres jetable, y compris `auth.users` (extraire le bloc COPY, insérer id / email), puis appliquer le
   train RC exact déterminé par § 3 — pas nécessairement les 27 mêmes fichiers si Production a divergé.
3. **Dérives à chercher** (constatées sur la preview de la branche feature, hors ledger de ce périmètre) :
   `plateforme_admins.utilisateur_id` posé `NOT NULL` à la main — **non applicable à `release/gp-v1-rc`**,
   dont le schéma `plateforme_admins` ne porte pas cette colonne (introduite par une migration hors
   périmètre, 235+) ; postes orphelins (peuvent faire échouer la 282) ; toute correction manuelle de schéma
   ou de données doit être autorisée explicitement et consignée.
4. pgTAP sur le clone migré (43 suites pertinentes : GP direct + isolation multi-tenant + baseline générale
   affectée par des migrations GP) : **920/920 assertions vertes**, prouvé le 2026-09-14, rôle `postgres`.
   Fixture `isolation_multitenant.inc` adaptée pour ce périmètre (insert `plateforme_admins` réduit à
   `email, role` — colonnes réellement présentes) ; adaptation appliquée au fichier de test de la RC
   (`supabase/tests/fixtures/isolation_multitenant.inc`), pas à un correctif de conteneur volatile. À refaire
   sur la sauvegarde réelle une fois disponible : ces 920 assertions n'ont couru que sur la baseline locale.

## 5. Migration

1. `db push --linked --include-all --yes`, **rôle `postgres` exactement** (voir § 1.3 — critique). Chaque
   migration est une transaction : un arrêt laisse les précédentes appliquées ; corriger la cause puis
   relancer (reprise aux manquantes).
2. Contrôles immédiats : `count(*)` et `max(version)` de `supabase_migrations.schema_migrations` = 239 /
   `20260914000296` ; surface de sécurité — privilèges DDL des rôles applicatifs 0, SECURITY DEFINER
   exécutables par `anon` = exactement `document_commercial_par_token`, `document_rendu_par_token` (jamais
   `reserves_invitation_consulter` : Reserves hors périmètre de cette RC, absent du schéma), sans
   `search_path` 0 ; volumes inchangés ; `conflits_planning` en SECURITY DEFINER (290) ; déclencheurs
   `lignes_devis_source_meme_entreprise` et `devis_ouvrages_ouvrage_meme_entreprise` présents (291) ;
   `recalc_devis_apres_ligne` absent et les trois déclencheurs `recalc_devis_apres_lignes_*` présents (292) ;
   `enregistrer_devis_brouillon_v2` en SECURITY DEFINER, non exécutable par `anon` / `service_role` (293) ;
   tables `numerotation_documents` (294) et `parametres_devis` (295) présentes, RLS active, vides tant
   qu'aucune entreprise n'a réglé ; le format des numéros sans réglage reste `DEV-AAAA-NNN` /
   `FAC-AAAA-NNN` / `CMD-AAAA-NNN` (fonction `numero_document_apercu('<entreprise>', 'devis')`).
3. **Contrôle spécifique à ce périmètre (297 puis 296)** : `recalc_totaux_devis(uuid)` NON exécutable par
   `authenticated` ni `service_role` (REVOKE de la 297) ; aucune erreur `permission denied for function
   recalc_totaux_facture` sur un enregistrement de facture existante (correctif 296 — smoke test dédié,
   § 8 bis) ; `modifier_facture_brouillon` NON exécutable par `service_role`.
4. **Contrôle spécifique à ce périmètre (252)** : `plateforme_exiger_session_aal2()` NON exécutable par
   `anon` ni `authenticated` (REVOKE de la 252) — seule une RPC SECURITY DEFINER interne (module plateforme,
   migration 257) peut l'invoquer.

## 6. Drapeaux et déploiement applicatif

- Déployer l'application **après** la migration (l'éditeur v2 a besoin du schéma v2). Le code applicatif
  déployé est celui de `release/gp-v1-rc`, pas celui de la branche feature.
- Variables Production (Vercel) : `GP_DEVIS_V2=1`, `GP_PLANNING_V2=1`. **Jamais** `NEXT_PUBLIC_GP_PREVIEW_BADGE`
  ni `NEXT_PUBLIC_GP_DEMO_EMAIL` en Production ; le code les refuse de toute façon (`badge-preview.ts` :
  `VERCEL_ENV=production` ou adresse `app.elsatia.fr`).
- PDF : le lanceur Chromium pose l'indice AL2023 si Vercel n'expose pas `VERCEL=1` (`generer.ts`) ; PDF
  confirmé fonctionnel en Production par Julien avant ce lot, et sur la preview après correctif.

## 7. Smoke tests (compte réel, sans écriture métier)

Connexion, tableau de bord, `/devis` (liste), un devis existant en lecture, `/planning`, `/prestations`,
`/ouvrages/bibliotheque` (offre ≥ Pro), Télécharger PDF d'un devis existant.

**Le gate navigateur automatisé (E2E) couvrant ces contrôles et les § 8-10 ci-dessous
(`tests/e2e/gp-v1-metier.spec.ts`, `tests/e2e/gp-v1-ux.spec.ts`, présents sur `release/gp-v1-rc`) n'a pas pu
être exécuté dans la session du 2026-09-14** : `supabase start` reste bloqué sur cette machine (processus
vivant, CPU nul, aucun conteneur créé après plusieurs minutes, y compris en mode debug et avec un
projet/des ports dédiés pour ne risquer aucune collision avec les piles déjà actives) — limitation déjà
consignée (CLI Supabase bloqué sur ce Mac). La couche RPC/sécurité que ce gate exerce est vérifiée
empiriquement par pgTAP (§ 4.4, 920/920). Le gate navigateur reste un point ouvert : à exécuter sur un
environnement où le CLI fonctionne, avant l'autorisation Production finale.

## 8. Contrôles devis

Nouveau devis brouillon de test : client créé depuis le devis (« + Client »), chantier « + Chantier »,
ouvrage inséré (menu Ajouter ▾), article Ctrl+K, ligne libre en m² avec remise 5 % (PU net affiché), titre,
commentaire, texte riche (gras / souligné / couleur : identique en lecture, A4 et PDF), sous-total ;
copier/coller de la section ; menu contextuel de ligne (clic droit) ; bascule Grille / Document ;
enregistrement ; retour avec la garde « modifications non enregistrées » ; lecture ; PDF ; suppression du
devis de test. Paramètres > Devis et Paramètres > Numérotation ouverts, aperçu du prochain numéro lisible.

### 8 bis. Contrôle facture existante (correctif 296)

Ouvrir une facture existante (pas une facture de test créée pour l'occasion), déclencher un recalcul de ses
totaux (action qui appelle `recalc_totaux_facture`) : aucune erreur, notamment aucune erreur `permission
denied for function recalc_totaux_facture`. C'est le correctif validé que la migration 296 apporte ; son
absence de régression est la condition de sortie de ce point.

## 9. Contrôles planning

Vue semaine par salarié, création d'un évènement, déplacement clavier (+15 min), conflit détecté, règle 24 h
refusée dans le dialogue avec son message, suppression de l'évènement de test.

## 10. PDF

Devis existant (moteur historique) et devis v2 (moteur 2, multi-pages) : 200, `application/pdf`, pages
cohérentes avec l'aperçu.

## 11. Conditions d'arrêt (STOP) et retour arrière

Chaque condition ci-dessous **arrête** la mise en Production ; on ne « force » jamais. Le responsable nommé
(§ 1) décide de la reprise après analyse, ou du retour arrière (§ 11.3).

### 11.1 STOP avant toute écriture

| Condition | Contrôle | Décision |
| --- | --- | --- |
| **Ledger inattendu** : `max(version)` distant absent/différent de ce que § 3 a constaté, ou versions distantes absentes en local | `supabase migration list --linked` (§ 3) | STOP — ledger inconnu, ne pas pousser |
| § 3 (comparaison des ledgers réels) non close | — | STOP — ne pas pousser sur une hypothèse |
| Sauvegarde logique datée absente ou incomplète (schéma, données, rôles) | § 2 | STOP |
| Répétition générale rouge sur la sauvegarde réelle (§ 4.2, pgTAP) | § 4 | STOP |
| Compteurs de référence non relevés (§ 2) | § 2 | STOP |
| Migration exécutée sous un rôle autre que `postgres` | § 1.3 | STOP — les default privileges de la 297 ne s'appliqueraient pas correctement |

### 11.2 STOP pendant et juste après la migration

| Condition | Contrôle | Décision |
| --- | --- | --- |
| **Une migration échoue** (transaction annulée, message d'erreur) | sortie de `db push` | STOP — ne pas relancer à l'aveugle ; cause connue (dérive § 4.3) corrigée avec accord explicite, sinon retour arrière |
| **Compteurs incohérents** : `count(*)` de `entreprises`, `clients`, `chantiers`, `devis`, `lignes_devis`, `factures`, `lignes_factures`, `planning_evenements` différent d'avant migration, ou `max(numero)` modifié | requêtes de § 2 rejouées | STOP + retour arrière (une migration ne crée ni ne supprime de document) |
| **Surface RLS / sécurité changée de façon imprévue** : privilèges DDL des rôles applicatifs ≠ 0, SECURITY DEFINER exécutables par `anon` ≠ exactement les 2 attendus, fonctions SECURITY DEFINER sans `search_path` ≠ 0, `enregistrer_devis_brouillon_v2` exécutable par `anon` ou `service_role`, `recalc_totaux_devis` exécutable par `authenticated` ou `service_role`, `plateforme_exiger_session_aal2` exécutable par `anon` ou `authenticated` | § 5.2, § 5.3, § 5.4 | STOP + retour arrière |
| Ledger final ≠ 239 / `20260914000296` | § 5.2 | STOP |
| Erreur `permission denied for function recalc_totaux_facture` sur une facture existante | § 8 bis | STOP — régression du correctif 296, ne pas annoncer |

### 11.3 STOP après déploiement applicatif (smoke, § 7-10)

| Condition | Contrôle | Décision |
| --- | --- | --- |
| **Devis V2 inaccessible** : `/devis/nouveau` ou `/devis/<id>/modifier` ne rend pas la grille (erreur, page blanche, éditeur historique alors que `GP_DEVIS_V2=1`) | smoke § 8 | STOP — retirer les drapeaux (retour v1 immédiat, sans toucher à la base) |
| **Planning V2 inaccessible** : `/planning` en erreur ou sans blocs | smoke § 9 | STOP — idem drapeaux |
| **PDF cassé** : `/api/documents/devis/<id>/pdf` ≠ 200 `application/pdf`, ou pages incohérentes avec l'aperçu | § 10 | STOP — les devis restent consultables, ne pas annoncer la mise en service |
| **Erreur d'authentification généralisée** : connexion impossible pour plus d'un compte de smoke, erreurs 5xx sur `/login`, sessions perdues | § 7 | STOP — retour arrière applicatif (déploiement précédent) puis analyse base |
| Toute erreur `57014` (statement timeout) à l'enregistrement d'un devis | journaux | STOP — régression des migrations 282/293, analyser avant d'annoncer |

### 11.4 Retour arrière

- **Applicatif** : redéployer le déploiement Vercel précédent et/ou retirer `GP_DEVIS_V2` / `GP_PLANNING_V2`
  (l'application revient en v1 ; le schéma reste compatible v1, preuve : pgTAP historiques verts sur ce
  périmètre — voir § 4.4).
- **Base** : restauration de la sauvegarde logique (schéma + données + rôles) dans le projet Production après
  arrêt de l'application ; les migrations ne prévoient pas de `down`. Les drapeaux applicatifs restent à 0
  tant que la base n'est pas au 296.
- Consigner l'heure, la cause, la décision et le responsable dans le rapport.

## 12. Surveillance post-déploiement (48 h)

- Journaux Vercel : `[pdf]` (échecs Chromium), erreurs 5xx sur `/api/documents/**`, `/devis/**`, `/planning`.
- Supabase : temps de réponse de `contexte_abonnement_courant`, `conflits_planning`,
  `enregistrer_devis_brouillon_v2`, `recalc_totaux_facture` (attendu < 1 s jusqu'à 1 000 lignes ; toute erreur
  57014 ou `permission denied` = régression) ; verrous de révision (« modifié ailleurs ») ; erreurs 23514 des
  déclencheurs 291 (référence étrangère = tentative anormale).
- Métier : premiers devis v2 enregistrés, premiers PDF, planning semaine ; retours clients sur le
  copier/coller ; premier recalcul de facture existante sans erreur.
- Backlog plateforme connu (hors GP V1) : coût ligne à ligne des politiques RLS (`est_membre_actif`,
  ≈ 1,8 ms/ligne) — planning 400 évènements ≈ 3-6 s de rendu serveur.
