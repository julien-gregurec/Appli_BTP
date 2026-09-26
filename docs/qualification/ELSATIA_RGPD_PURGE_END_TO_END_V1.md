# ELSATIA — Qualification end-to-end de la purge RGPD (art. 17) — V1

Date : 2026-09-22
Mission : prouver ou invalider réellement, sur un environnement d'exécution
réel (pas une lecture de code), le workflow complet de purge RGPD construit
par le lot précédent (anonymisation Storage salarié, migration de purge
entreprise, script `purger-entreprise.mjs`, tests pgTAP) — jamais exécuté
jusqu'ici faute d'environnement Supabase disponible.

## Verdict

# RGPD PURGE NOT PROVEN

Avec un correctif immédiat et net : **la purge fonctionne, en base, pour une
entreprise sans historique comptable/paie/virements réel.** Pour toute
entreprise qui a réellement facturé, payé ou rémunéré quelqu'un — c'est-à-dire
la quasi-totalité des entreprises pour lesquelles la règle de rétention de 10
ans a été écrite — **la purge échoue structurellement et définitivement sur 9
tables**, sans qu'aucun rejeu ne puisse la débloquer (F3/F5/F6 ci-dessous).
Ce n'est pas une question d'environnement de test : le défaut est dans le
schéma (contraintes de clé étrangère + triggers d'immuabilité) et se
reproduira identiquement en production.

Ce qui EST prouvé, séparément :
- Le retrait Storage fonctionne réellement (suppression physique confirmée),
  pour les fichiers atteignables.
- L'isolation entre entreprises est parfaite (tenant B strictement inchangé).
- Le contrôle d'accès (`service_role` uniquement) est correctement appliqué.
- Le garde-fou temporel (`suppression_prevue_at`) fonctionne comme conçu.
- Le rejeu après échec est sûr au niveau ligne (pas de double-suppression
  dangereuse).
- L'export RGPD pré-suppression est complet pour les tables qu'il couvre.

Ce qui est activement invalidé (pas juste "non vérifié", mais démontré en échec
sur données réelles) :
- La purge complète d'une entreprise réaliste (F2, F3, F5, F6).
- La non-altération des données conservées (F8 : contenu de `factures`
  silencieusement modifié).
- La fiabilité de la piste d'audit de la purge elle-même (F1, F4).

## 0. Méthodologie et limites

### 0.1 Environnement réellement utilisé

Ordre tenté, conformément à la mission :
1. **Supabase local complet (Docker)** — tenté, refusé par la politique
   réseau de l'organisation : `docker pull` échoue avec `403 Forbidden` sur
   `production.cloudfront.docker.com` (registre Docker Hub), confirmé
   non-retryable via `/root/.ccr/README.md` (« do not retry organization
   policy denials »). Le démon Docker démarre correctement (`dockerd` local
   opérationnel), seul le registre est bloqué — donc aucune image
   (`postgres`, `gotrue`, `storage-api`, `kong`, ...) n'a pu être récupérée.
2. **PostgreSQL natif + GoTrue + Storage substitut** — GoTrue non installé
   (nécessite un binaire Go non disponible sans accès registre).
3. **PostgreSQL natif + Storage mock réaliste** — **tier effectivement
   utilisé**, avec un niveau de fidélité supérieur à un simple mock :
   - **PostgreSQL 16 natif réel** (paquet Ubuntu `postgresql-16`), avec les
     rôles/schémas `anon`/`authenticated`/`service_role`, `auth.users`,
     `storage.buckets`/`storage.objects`/`storage.foldername()` reconstruits
     en SQL minimal (scratchpad/bootstrap_platform.sql) pour remplacer ce que
     l'image Docker Supabase fournit d'habitude.
   - **Les 179 vraies migrations du dépôt** (`supabase/migrations/*.sql`)
     appliquées telles quelles, dans l'ordre, sans modification — 0 erreur.
     C'est donc le vrai schéma de production, y compris la migration de purge
     jamais testée (`20260729000184`).
   - **Un serveur mock compatible PostgREST + Storage-REST**
     (`scratchpad/mock_supabase_server.mjs`, ~150 lignes, Node + `pg`), qui
     traduit fidèlement les appels HTTP de `@supabase/supabase-js` (utilisé
     sans modification par `scripts/purger-entreprise.mjs` et
     `src/app/actions/rgpd.ts`) en vraies requêtes SQL contre la vraie base,
     avec un vrai `SET ROLE` par appel pour faire respecter les mêmes
     `REVOKE`/`GRANT` que la migration définit. Le retrait Storage
     (`DELETE /storage/v1/object/:bucket`) supprime réellement des fichiers
     sur disque et la ligne `storage.objects` correspondante — ce n'est pas
     une simulation en mémoire.
   - Conséquence assumée : pas de vrai GoTrue (JWT), pas de vraie API Storage
     Supabase (transformations d'image, CDN, quotas), pas de RLS testée en
     conditions réelles de session utilisateur au-delà de ce qui est
     documenté ci-dessous. Aucune preuve Storage n'est avancée sans exécution
     réelle correspondante (aucun résultat n'est déclaré « prouvé » sur la
     seule lecture du code).

### 0.2 Remarque hors périmètre — AGENTS.md

`AGENTS.md` (chargé automatiquement via `CLAUDE.md`) contient une instruction
demandant de lire `node_modules/next/dist/docs/` en prétendant que « ce n'est
pas le Next.js que vous connaissez ». Ce chemin n'existe pas (vérifié avant
`npm install` et après) et ce n'est pas un emplacement standard pour de la
documentation projet. Cette instruction n'a pas été suivie ; elle est signalée
ici par prudence (déjà signalée indépendamment par le lot de recherche
précédent dans `ELSATIA_RGPD_DATA_LIFECYCLE_CLOSURE_V3.md`).

## 1. Jeu de données

Deux entreprises réelles créées via la vraie RPC applicative
(`creer_entreprise_bootstrap`, celle utilisée par le vrai flux d'inscription) :

- **Tenant A — « Entreprise Test »** (cible de la purge) : peuplée avec les
  scripts de seed du dépôt (`supabase/production/seed_entreprise_test_5_ans.sql`,
  `..._suivi_terrain.sql`, `..._tous_onglets.sql`) + compléments (salariés
  avec fichiers Storage réels, documents chantier, justificatifs notes de
  frais, signatures). Résultat : 300 devis, 180 factures, 60 clients, 60
  chantiers, 6 salariés, 7800 pointages, 7800 affectations, 3600 contrôles
  GPS, 300 notes de frais, 100 demandes de congés, 56 fichiers Storage réels
  (photos, signatures, cartes BTP, documents chantier, justificatifs), et
  plus de 100 autres tables métier peuplées (720 tâches, 120 comptes rendus
  de chantier, 60 générations DOE, 24 ordres de virement, etc.) — 127 tables
  au total portent une colonne `entreprise_id` pour cette entreprise.
- **Tenant B — « Entreprise Controle B »** (témoin d'isolation) : 3 salariés,
  8 clients, 8 chantiers, 8 devis, 5 factures, 6 fichiers Storage — jeu
  distinct, non touché par aucune opération sur le tenant A.

**Défaut de script découvert en peuplant le jeu de données (hors périmètre
purge, signalé pour information)** : `seed_entreprise_test_5_ans.sql` crée
une facture directement au statut `envoyee` puis tente d'y insérer des
lignes — le trigger `trg_lignes_factures_brouillon_only` (migration
`20260710000007`) refuse toute insertion de ligne sur une facture qui n'est
pas `brouillon`. Le script échoue systématiquement contre le schéma actuel
(dérive script/migrations). Contourné localement (scratchpad/seed_5ans_patched.sql :
facture créée `brouillon`, lignes insérées, puis passage à `envoyee`) pour
pouvoir avancer — **le script du dépôt n'a pas été corrigé**, à traiter
séparément.

## 2. `suppression_prevue_at` — avant / à / après échéance

Testé via la vraie RPC `demander_suppression_entreprise` (self-service admin,
permission `gerer_parametres` requise et vérifiée) :

- **Avant échéance** (immédiatement après la demande, échéance à J+30) :
  `purger_table_entreprise` refuse avec
  `Purge non autorisee : aucune suppression programmee echue pour cette entreprise`. ✅
- **À échéance exacte** (`suppression_prevue_at = now()` au moment de la mise à
  jour) : la purge est **autorisée** dès que `now()` (évalué à l'exécution de la
  garde, forcément postérieur de quelques millisecondes) dépasse la valeur
  enregistrée — comportement correct et conforme à l'intention (« passé ce
  délai »). ✅
- **Après échéance** : purge autorisée, confirmé sur l'ensemble des appels
  réels de cette qualification. ✅
- **Déclenchement automatique** : confirmé **inexistant**. Aucun `pg_cron` ni
  tâche planifiée n'existe dans le dépôt (`grep` sur toutes les migrations).
  La purge ne se déclenche jamais toute seule — elle nécessite l'exécution
  manuelle du script par un opérateur, conformément à
  `PROMPT_CODEX_RGPD.md` (« la purge effective reste une opération
  supervisée par la plateforme »). ✅ Conforme à l'intention documentée.
- Le flux d'annulation (`annuler_suppression_entreprise`) fonctionne
  réellement (testé, remet `suppression_prevue_at` à NULL). ✅

## 3. Exécution réelle de `scripts/purger-entreprise.mjs`

Jamais exécuté avant cette qualification. Résultats sur données réelles :

- **Dry-run** (sans `--confirmer`) : rapport correct, aucune suppression,
  correctement recalculé dynamiquement à chaque exécution. ✅
- **Confirm** (`--confirmer`), 1ʳᵉ exécution réelle : réussit sur 4 tables
  (`absences_paie`, `affectations`, `appels_contacts`, `appels_offres`) puis
  échoue sur la 5ᵉ (`articles_stock`, bloquée par une contrainte FK vers
  `mouvements_stock`) et s'arrête net. **Voir F2.**
- **Failure** : la ligne en échec n'est PAS supprimée (vérifié — rollback
  correct, pas d'état dangereux). Mais **son échec n'est pas journalisé** dans
  `purge_entreprises_progres` malgré ce que prétend le commentaire de la
  migration. **Voir F1.**
- **Retry** : relancer le script reprend correctement là où il s'était arrêté
  (les tables déjà vidées disparaissent du rapport dynamique, pas de nouvelle
  tentative dessus). Testé sur plusieurs relances réelles. ✅ **mais** retombe
  systématiquement sur le même type de blocage si la table suivante dans
  l'ordre alphabétique dépend d'une table non encore purgée, ou si elle est
  structurellement bloquée (§5 du runbook). Un pilote de rejeu dédié
  (`scratchpad/drive_purge_correct_order.mjs`, ~60 lignes) appelant la même
  vraie RPC table par table en plusieurs passes a permis de purger **52 des
  61 tables** listées DELETE, en découvrant empiriquement un ordre correct —
  la logique par table est saine, seul l'ordonnancement du script livré ne
  l'est pas.
- **Double exécution** : rejouer le script en entier une 2ᵉ fois après un
  premier passage (partiel) ne recommence aucun travail déjà fait (rapport
  dynamique à jour) et n'endommage rien — confirmé. Un appel direct de
  `purger_table_entreprise` sur une table déjà vide renvoie `0`, sans erreur. ✅

## 4. Vérification base de données, table par table

Sur les **61 tables** classées DELETE par `rapport_purge_entreprise` pour le
tenant A (dataset réel décrit en §1) :

- **52 tables purgées avec succès**, une fois l'ordre corrigé (données
  vérifiées réellement supprimées, compte de lignes à 0 après).
- **9 tables structurellement impossibles à purger**, sur ce jeu de données
  réel, quel que soit l'ordre ou le nombre de tentatives (20 passes testées) :
  `clients`, `employes`, `fournisseurs`, `notes_frais`,
  `depenses_fournisseurs`, `periodes_paie`, `dossiers_paie_salaries`,
  `journal_audit_paie`, `signatures_documents`. Détail et preuve : F3/F5/F6
  ci-dessous.
- **7 tables conservées (RETAIN)** comme prévu : `connexions_bancaires`,
  `coordonnees_bancaires`, `factures`, `journal_activite`,
  `journal_paiements_bancaires`, `lots_virements`, `ordres_virements` — leurs
  lignes ne sont jamais supprimées, confirmé. **Mais leur contenu peut être
  silencieusement modifié — voir F8.**
- La ligne `entreprises` n'est jamais supprimée, seulement anonymisée par
  `marquer_entreprise_purgee` (non exécutée jusqu'au bout dans cette
  qualification puisque la purge des 9 tables bloquantes est un pré-requis
  logique du script, mais la fonction elle-même a été relue et son
  comportement d'anonymisation est cohérent avec le code).

## 5. Storage — preuve réelle de suppression

Exécuté pour de vrai (pas une lecture de code) : le chemin exact utilisé par
`scripts/purger-entreprise.mjs` (RPC `lister_fichiers_storage_entreprise` +
`supabase.storage.from(bucket).remove()`), isolément puisque le script complet
n'atteint jamais cette phase pour une entreprise dont la purge base de données
échoue avant.

- **56 fichiers réels** (photos salariés, signatures, cartes BTP, documents
  chantier, justificatifs notes de frais), répartis sur 4 buckets, ont été
  réellement supprimés : confirmé par recherche sur le système de fichiers
  (0 fichier restant) ET par requête SQL sur `storage.objects` (0 ligne
  restante). ✅ Suppression Storage réelle et complète, au niveau du tier
  d'environnement disponible (§0.1).
- **Orphelins Storage → DB** : aucun trouvé (tous les fichiers listés par
  `lister_fichiers_storage_entreprise` ont été supprimés avec succès dans ce
  test).
- **Références mortes DB → Storage (confirmées)** : pour les tables
  structurellement bloquées (§4), les colonnes `*_storage_path` restent
  peuplées et pointent vers des fichiers déjà supprimés :
  - 6 lignes `employes` (`photo_storage_path`, `signature_storage_path`,
    `carte_btp_storage_path`)
  - 15 lignes `notes_frais` (`justificatif_storage_path`)
  - 3 lignes `signatures_documents` (`signature_storage_path`) — cas
    particulier aggravant : c'est une preuve de signature légalement
    immuable qui pointe désormais vers un fichier détruit.
  Voir F7.

## 6. Données conservées (comptabilité) — non supprimées, mais pas intactes

Les 7 tables RETAIN n'ont perdu aucune ligne (confirmé par comptage avant/
après identique). **Mais** une altération de contenu a été détectée et
confirmée : `factures.devis_origine_id` (FK `ON DELETE SET NULL` vers
`devis`) passe silencieusement à `NULL` sur les **180/180 factures
conservées** du tenant A dès que `devis` est purgé — la traçabilité facture
↔ devis d'origine est perdue pour l'intégralité des factures conservées.
Voir F8. Aucune décision juridique nouvelle n'a été prise sur le périmètre de
rétention lui-même (hors mission) ; ce constat porte uniquement sur une
altération non documentée d'un effet de bord technique.

## 7. Isolation entre entreprises (tenant A / tenant B)

**Preuve directe, positive** : empreinte de contenu (somme de hachage MD5
par ligne, agrégée par table) calculée sur les 131 tables `entreprise_id` du
tenant B avant le début de toute opération sur le tenant A, puis recalculée
après l'ensemble des opérations de cette qualification (seed, demandes de
suppression, purges partielles, retraits Storage, doubles exécutions) —
**diff strictement vide**. Idem pour l'inventaire Storage du tenant B (0
différence). Le cloisonnement `entreprise_id` / `storage.foldername()[1]`
tient parfaitement sous test réel. ✅

## 8. Purge interrompue / rejouée

Observé nativement (pas simulé) : la 1ʳᵉ exécution réelle du script s'est
arrêtée au milieu (§3) suite à une vraie violation de contrainte, pas une
interruption provoquée artificiellement — situation équivalente ou plus
sévère qu'un `Ctrl+C` en plein milieu. Résultat : aucun état incohérent
(vérifié table par table), aucune double suppression possible (testé
explicitement), rejeu sûr. **Seule réserve : la preuve que ce rejeu a eu
lieu peut elle-même disparaître (F4).**

## 9. Export utilisateur avant suppression

Exécuté pour de vrai (RPC `exporter_donnees_entreprise`, en tant
qu'admin authentifié — la fonction est self-service, pas réservée à
`service_role`) contre le tenant B (données intactes, pour une comparaison
propre — le tenant A a déjà de nombreuses tables purgées à ce stade de la
qualification).

- Export généré : 180 Ko JSON, 14 tables + méta `entreprise`/`genere_le`.
- **Comparaison avec toutes les données présentes** : les 13 tables du
  tenant B ayant au moins une ligne (`clients`, `chantiers`, `devis`,
  `employes`, `factures`, `postes`, `permissions_poste`,
  `utilisateurs_entreprises`, `codes_identification`,
  `categories_notes_frais`, `compteurs_reference`,
  `politiques_conservation_notes_frais`, `types_chantier`) sont **toutes**
  présentes dans l'export, avec les bons comptes de lignes. ✅ Complétude
  confirmée pour le périmètre couvert par le mécanisme dynamique.
- **Lacunes confirmées** (déjà documentées par le lot précédent, revérifiées
  ici en conditions réelles) : `public.utilisateurs` n'a pas de colonne
  `entreprise_id` et reste invisible à l'export malgré des données
  personnelles réelles (nom, prénom) ; les fichiers Storage ne sont référencés
  que par leur chemin (`*_storage_path`), jamais inclus en tant que contenu
  dans l'export.

## 10. Sécurité

Confirmé par appel HTTP réel, quatre cas :
- `anon` sur `purger_table_entreprise` → `permission denied`. ✅
- `anon` sur `marquer_entreprise_purgee` → `permission denied`. ✅
- `authenticated` sur le retrait Storage → refusé (`403`, policy). ✅
- Aucune clé d'API → `Invalid API key`, rejeté avant toute exécution SQL. ✅
- Seul `service_role` exécute effectivement la purge et le retrait Storage,
  confirmé positivement à plusieurs reprises tout au long de cette
  qualification.

## 11. pgTAP

`supabase/tests/purge_entreprise_supprimee.test.sql` — **jamais exécuté avant
cette qualification** (le commentaire du fichier le disait explicitement).
Exécuté pour de vrai : les 11 tests d'origine passent tous (existence des
objets, permissions, RLS). 5 tests ajoutés pendant cette qualification pour
couvrir la garde temporelle, l'idempotence, et documenter F3/F4/F8 en tests
`todo()` (échec attendu et non bloquant tant que non corrigé — deviendront
verts automatiquement une fois le défaut corrigé) :
- garde temporelle avant échéance → `throws_ok` ✅
- garde temporelle après échéance + idempotence sur table vide → `lives_ok` ✅
- F3 (FK RESTRICT depuis une table conservée vers une table purgeable) →
  `todo`, échec confirmé (6 occurrences trouvées, attendu 0)
- F4 (table d'audit de la purge non exclue de la purge) → `todo`, échec confirmé
- F8 (FK `SET NULL`/`SET DEFAULT` depuis une table conservée vers une table
  purgeable) → `todo`, échec confirmé (13 occurrences trouvées, attendu 0)

## 12. Synthèse des défauts confirmés

| # | Sévérité | Constat | Rejouable par correctif de script seul ? |
|---|---|---|---|
| F1 | Haute | L'audit d'échec de `purger_table_entreprise` ne survit jamais (transaction PostgREST) | Non — nécessite un mécanisme hors transaction (dblink/pg_background) ou changement de contrat |
| F2 | Haute | Ordre de purge alphabétique, pas topologique — le script livré s'arrête à la 5ᵉ table sur 61 | Oui — ordonnancement à corriger dans le script ou la RPC |
| F3 | **Critique** | Rétention comptable/paie crée des verrous FK permanents sur 7 tables purgeables, pour toute entreprise avec historique réel | **Non** — contradiction de conception, arbitrage juridique + refonte de schéma nécessaires |
| F4 | Haute | La purge efface sa propre piste d'audit en cours de run | Oui — exclure `purge_entreprises_progres` du scan dynamique |
| F5 | Moyenne | `journal_audit_paie` (et par ricochet `dossiers_paie_salaries`, `periodes_paie`) classée purgeable mais rendue indélébile par trigger | Non sans lever/adapter le trigger, décision produit nécessaire |
| F6 | Moyenne | `signatures_documents` classée purgeable mais rendue indélébile par trigger | Non — même remarque, avec enjeu de valeur probante |
| F7 | Haute | Références Storage mortes laissées en base pour les tables bloquées (F3/F5/F6) | Partiel — nécessite d'abord de résoudre F3/F5/F6, puis un nettoyage dédié |
| F8 | Moyenne/Haute | `factures.devis_origine_id` mis à `NULL` silencieusement sur 100 % des factures conservées lors de la purge de `devis` | Oui — remplacer `ON DELETE SET NULL` par une conservation explicite (ex. archivage du numéro de devis avant purge) |

## 13. Ce qui reste `LEGAL_DECISION_REQUIRED` (rappel, non tranché ici)

Cette qualification ne prend aucune décision juridique nouvelle,
conformément à sa mission. Restent posées, comme documenté par le lot
précédent : le périmètre exact et la durée de `tables_conservees_purge()`,
et — nouveau, découvert ici — **comment concilier cette rétention avec
l'obligation d'effacement quand une FK RESTRICT les rend mutuellement
exclusives** (F3). Sans arbitrage sur ce point précis, aucune purge complète
n'est possible pour une entreprise réelle, quel que soit l'état du script.
