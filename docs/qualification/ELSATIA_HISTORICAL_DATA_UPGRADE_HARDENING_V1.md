# ELSATIA — Historical Data Upgrade Hardening V1

Mission autonome (~8h) : fermer le release blocker exact-tip confirmé sur la
migration `20260921000300`, qui échoue et laisse une base **partiellement
migrée** dès qu'un tenant réel a au moins une facture déjà émise.

Base retenue comme « dernier train réel » : `origin/claude/awesome-turing-tn9yh6`
(313 migrations, tip exact du rapport
`docs/qualification/ELSATIA_FINAL_EXACT_TIP_QUALIFICATION_V3.md` qui a
initialement détecté ce défaut). `main` est un point d'intégration ancien
(183 migrations, dernier commit 20260729) sans rapport avec ce train ; il n'a
pas été utilisé comme base. Aucune autre branche n'avait déjà corrigé ce
défaut (vérifié par recherche exhaustive sur toutes les branches distantes).

Environnement : PostgreSQL 16 local (pas de stack Supabase/Docker complète
disponible dans ce sandbox — le démon Docker n'est pas accessible). Un
harnais minimal reproduit les parties normalement pré-provisionnées par
l'image Supabase (rôles `anon`/`authenticated`/`service_role`, schéma `auth`
avec `auth.uid()/role()/email()/jwt()` et `auth.users`, schéma `storage`
avec `storage.buckets`/`storage.objects`/`storage.foldername()`, extension
`pgtap`, stub fail-closed pour `pgsodium.crypto_sign_verify_detached`).
Avec ce harnais, les 313 migrations s'appliquent sans erreur sur une base
vide (Fresh) et la suite pgTAP tourne à l'identique avant/après le
correctif (voir §FRESH). Ce harnais est un choix délibéré de sandbox : les
314 échecs pgTAP pré-existants dans ce même run (colors_*, reserves_*,
platform_stripe_attestation_r72, etc.) sont des lacunes d'environnement
(fixtures spécifiques à d'autres modules, signature Ed25519 réelle
indisponible...), **strictement identiques que la migration 300 porte le
correctif ou non** — donc hors périmètre de cette mission et non de
nouvelles régressions introduites ici (preuve différentielle en §FRESH).

## ORIGINAL FAILURE

Rapport source :
`docs/qualification/ELSATIA_FINAL_EXACT_TIP_QUALIFICATION_V3.md` §"upgrade" :

> `20260921000300_correctif_perf_rls_lignes_devis_factures.sql` échoue sur
> « Les lignes d'une facture émise ne peuvent plus être modifiées » : son
> `UPDATE` de backfill sur `lignes_factures.entreprise_id` déclenche le
> trigger d'immuabilité `lignes_factures_brouillon_only`, qui est
> **inconditionnel**, dès qu'il existe au moins une facture déjà émise.

Reproduit à l'identique dans cette mission (voir §REAL DATA CASE).

## REAL DATA CASE

Scénarios construits et migrés jusqu'à juste avant `20260921000300`, puis
confrontés à la migration :

| # | Scénario | Détail | Résultat migration ORIGINALE |
|---|---|---|---|
| A | Entreprise vierge | Fresh complet, 0 ligne de données | déjà vert (aucune facture émise) |
| B | Devis existants | brouillon + accepté, avec lignes | vert (lignes_devis non bloquant) |
| C | Facture brouillon | lignes librement modifiables | vert |
| D | **Facture émise** | 1 tenant, 1 facture `envoyee`, 2 lignes | **FAIL — cas exact du rapport** |
| E | Facture payée intégralement | facture `envoyee` + paiement ≥ TTC | FAIL (même trigger) |
| F | Facture avec paiements partiels | 2 paiements < TTC | FAIL (même trigger) |
| G | Facture avec avoir | facture émise + avoir lié (`facture_origine_id`) | FAIL (même trigger, sur les deux factures) |
| H | Plusieurs tenants | 2 entreprises, isolation croisée | FAIL dès le 1er tenant avec facture émise |
| I | Gros historique | 40 tenants, 5000 factures (1912 émises), 40 000 lignes_factures, 5000 devis, 30 000 lignes_devis, 1319 paiements | FAIL (même trigger ; non poussé jusqu'au bout, le blocage est déterministe dès la 1ʳᵉ ligne d'une facture émise rencontrée par l'`UPDATE`) |

Preuve d'exécution (scénario D, migration originale non modifiée,
`psql -f` sur une base réelle avec une facture déjà émise) :

```
ALTER TABLE
UPDATE 0
ALTER TABLE
...
ERROR:  Les lignes d'une facture émise ne peuvent plus être modifiées
CONTEXT:  PL/pgSQL function trg_lignes_factures_brouillon_only() line 10 at RAISE
```

## PARTIAL STATE

État exact laissé par l'échec (scénario D, avant tout correctif) :

| Objet | `lignes_devis` | `lignes_factures` |
|---|---|---|
| Colonne `entreprise_id` | ✅ ajoutée + peuplée | ⚠️ ajoutée, **NULL sur toutes les lignes** |
| `NOT NULL` | ✅ | ❌ (jamais atteint) |
| FK composite | ✅ | ❌ |
| Index | ✅ | ❌ |
| Trigger `fixer_entreprise_ligne_*` | ✅ | ❌ |
| 5 policies RLS | ✅ (nouvelle forme) | ❌ (anciennes policies conservées, incohérentes avec le reste du schéma) |

```
                  id                  | entreprise_id
--------------------------------------+---------------
 027c42b2-aee7-4721-bc52-30ac779e313d |
 09062d52-8bc5-40cc-b6be-5a5dbe6ded02 |
```

Cause de la **non-atomicité** : `psql -f` exécute chaque instruction du
fichier en autocommit par défaut (aucun `BEGIN`/`COMMIT` explicite dans la
migration d'origine) — les instructions déjà exécutées avant l'erreur
(`lignes_devis` en entier, `ALTER TABLE ... ADD COLUMN` sur
`lignes_factures`) restent **committées** indépendamment de l'échec de
l'instruction suivante. Confirmé en forçant un `SELECT 1/0` en fin de
fichier corrigé (voir §FAILURE INJECTION) : sans l'enveloppe transactionnelle
ajoutée par ce correctif, un échec en tout point du fichier aurait le même
effet — pas seulement au point de blocage historique.

## ROOT CAUSE

1. **Trigger inconditionnel.** `trg_lignes_factures_brouillon_only`
   (migration `20260710000007_consolidation_financiere.sql`) est un
   `BEFORE INSERT OR UPDATE OR DELETE` sans condition — il bloque *toute*
   écriture sur `lignes_factures` dès que `factures.statut <> 'brouillon'`,
   y compris une opération de migration légitime et purement technique
   (backfill d'une colonne de dénormalisation qui ne touche à aucune
   donnée contractuelle).
2. **Asymétrie avec `lignes_devis`.** Le trigger jumeau n'existe pas sous
   cette forme sur `lignes_devis` (le verrou `verrouiller_devis_accepte`,
   introduit bien plus tard en migration 210, a une portée différente) —
   c'est pourquoi seule la moitié `lignes_factures` du correctif original
   échouait.
3. **Non-atomicité de la migration.** Aucune enveloppe transactionnelle
   explicite : un échec à n'importe quel point du fichier committe les
   instructions précédentes (cf. §PARTIAL STATE).
4. **Effet de bord de performance non lié au trigger d'immuabilité** : le
   `UPDATE` de backfill déclenche aussi, ligne par ligne, les triggers
   `AFTER` de recalcul (`recalc_facture_apres_ligne`,
   `recalc_devis_apres_ligne`, `synchroniser_taches_ligne_devis`) alors
   qu'aucune des colonnes dont ils dépendent n'est modifiée — découvert et
   mesuré au §PERFORMANCE, corrigé dans le même correctif.

Aucune suppression de données n'a été nécessaire ni envisagée pour ce
correctif — cause structurelle (trigger + absence de transaction), pas un
problème de données invalides.

## MIGRATION STRATEGY (safe migration design)

Fichier modifié :
`supabase/migrations/20260921000300_correctif_perf_rls_lignes_devis_factures.sql`
(313 → même fichier, contenu durci ; aucun nouveau fichier de migration —
la migration n'a jamais été publiée/appliquée en Production, donc la
corriger en place est sûr et préférable à un correctif additif).

1. **Atomicité explicite** : tout le corps de la migration est enveloppé
   dans `begin; ... commit;`. Un échec à n'importe quel point annule
   l'intégralité de la migration, quel que soit l'outil qui l'exécute
   (`psql -f`, dashboard SQL, CLI Supabase).
2. **Préflight + validation explicite** avant chaque `SET NOT NULL` : un
   bloc `DO $$ ... RAISE EXCEPTION ... $$` compte les lignes qui
   resteraient sans `entreprise_id` après le backfill et échoue avec un
   diagnostic exploitable plutôt que le message générique de contrainte
   (cas ambigu théorique — la FK garantit l'existence du parent — mais
   défense en profondeur demandée par la mission).
3. **Backfill sans affaiblir la protection applicative** : les triggers
   bloquants sont désactivés (`ALTER TABLE ... DISABLE TRIGGER`)
   uniquement pour la durée de l'`UPDATE` de backfill, à l'intérieur de la
   même transaction que le reste de la migration (donc jamais persistant
   en cas d'échec), puis immédiatement réactivés :
   - `lignes_factures_brouillon_only` (immuabilité) ;
   - `recalc_facture_apres_ligne`, `recalc_devis_apres_ligne`,
     `synchroniser_taches_ligne_devis` (effets de bord de performance,
     cf. §PERFORMANCE).
4. **Aucun changement de comportement applicatif** : après la migration,
   les 4 triggers désactivés temporairement sont ré-activés avec un état
   catalogue identique (`tgenabled = 'O'`) — vérifié explicitement en
   pgTAP (§ci-dessous) et en test manuel (tentative d'`UPDATE` sur une
   ligne de facture émise après migration → toujours rejetée avec le même
   message).
5. **Cas ambigus traités de façon conservatrice** : aucune donnée
   contractuelle (désignation, quantités, prix, TVA, montants, paiements,
   avoirs) n'est lue ni modifiée par ce correctif — seule la colonne
   technique `entreprise_id`, garantie égale à celle du parent par FK
   composite + trigger `fixer_entreprise_ligne_*` pour toute écriture
   future.

## HISTORICAL CONTRACT

Aucune mutation rétroactive des documents contractuels : vérifié par
checksum avant/après sur les colonnes métier (`numero`, `statut`,
`montant_ht`, `montant_tva`, `montant_ttc`, `montant_paye`,
`facture_origine_id` pour les factures ; `designation`, `quantite`,
`prix_unitaire_ht`, `remise_ligne`, `taux_tva` pour les lignes) — identique
au bit près avant/après la migration, sur le scénario multi-tenant
(B–H, avoir inclus) et sur le scénario à l'échelle (I). Voir §DATA
INTEGRITY.

Seul effet de bord observé : `factures.updated_at` est retouché par le
recalcul des totaux si ce trigger n'est pas désactivé (c'est précisément
pourquoi il l'est désormais pendant le backfill — cf. §PERFORMANCE) ;
avec le correctif final, `updated_at` n'est plus touché par la migration.

## FRESH

313 migrations rejouées de zéro avec le fichier corrigé : **succès**,
schéma final identique à celui obtenu par la migration d'origine sur base
vide. Preuve différentielle : suite pgTAP complète (95 fichiers, 2050 tests
au total selon `pg_prove`) exécutée deux fois sur un Fresh — une fois avec
la migration originale, une fois avec le correctif — **résultat
strictement identique** (`Files=95, Tests=2050`, mêmes fichiers en échec,
mêmes numéros de sous-tests en échec). Les échecs présents dans les deux
runs (`colors_*`, `reserves_v1/v2/v3_*`, `platform_stripe_state_attestation_r72`,
`gp_pilot_plateforme_admin_role_total`, `gp_pilot_rgpd_manifeste_fichiers`,
`document_partage_public_par_jeton_v1`, etc.) sont des lacunes de ce
harnais minimal (fixtures propres à d'autres modules, signature Ed25519
réelle absente) — classification cohérente avec
`ELSATIA_FINAL_EXACT_TIP_QUALIFICATION_V3.md` qui les documentait déjà
comme `TEST_DEFECT/PRE_EXISTING` ou `ENVIRONMENT_LIMITATION`. **Aucune
régression imputable à ce correctif.**

Nouveau test pgTAP ajouté (10 assertions, vert) :
`supabase/tests/upgrade_historique_entreprise_id_lignes.test.sql` — couvre
le backfill automatique à l'insertion, l'immuabilité post-migration
(update/insert/delete rejetés sur une facture émise), l'état catalogue du
trigger (`tgenabled = 'O'`), le schéma (`NOT NULL`, index), et l'absence de
divergence `entreprise_id` entre lignes et parents.

## UPGRADE MATRIX

Le système Postgres/Supabase ne permet pas de « démarrer » à un numéro de
migration arbitraire : chaque tenant réel a nécessairement rejoué la
totalité du ledger depuis la migration 1, l'axe pertinent est donc l'état
des **données** au moment où la migration 300 s'exécute, pas le nombre de
migrations. C'est cet axe qui structure la matrice ci-dessus (§REAL DATA
CASE) et ci-dessous :

| FROM (état des données avant 300) | TO | Migration ORIGINALE | Migration CORRIGÉE |
|---|---|---|---|
| Vide (Fresh, scénario A) | 313 | PASS | PASS |
| Devis seuls, aucune facture (B) | 313 | PASS | PASS |
| Facture brouillon uniquement (C) | 313 | PASS | PASS |
| 1 facture émise (D) | 300 | **FAIL (partiel)** | PASS |
| Facture payée (E) | 300 | **FAIL (partiel)** | PASS |
| Facture avec paiements partiels (F) | 300 | **FAIL (partiel)** | PASS |
| Facture + avoir lié (G) | 300 | **FAIL (partiel)** | PASS |
| 2 tenants, mix B–G (H) | 313 (train complet rejoué après 300) | **FAIL (partiel)** | PASS — checksum métier identique avant/après sur tout le train restant (301→313) |
| 40 tenants, 5000 factures/1912 émises, 40k+30k lignes (I) | 300 | **FAIL (partiel, déterministe)** | PASS en 6,2 s (voir §PERFORMANCE) |
| DB déjà mordue par le bug (backfill partiel pré-existant, migration originale) | 300 (retry) | — | PASS (voir §RETRY) |

DATA INTEGRITY : PASS sur toutes les lignes ci-dessus (checksums identiques,
zéro valeur `entreprise_id` divergente du parent, zéro ligne orpheline).

## RETRY / IDEMPOTENCE

Trois scénarios de reprise testés sur une base réelle avec facture émise :

1. **Ré-exécution du correctif sur une base déjà migrée avec succès** :
   `begin; ... commit;` retraverse toutes les instructions `IF [NOT]
   EXISTS`/`CREATE OR REPLACE` — aucune erreur, aucun changement d'état.
   PASS.
2. **Reprise après un échec de la migration ORIGINALE (bug réel, tel qu'un
   déploiement Production aurait pu le vivre)** : base amenée exactement
   dans l'état §PARTIAL STATE (colonne `lignes_factures.entreprise_id`
   ajoutée, `NULL`, sans contrainte/index), puis migration **corrigée**
   appliquée par-dessus → backfill complété, contrainte/FK/index posés,
   policies alignées, trigger réactivé. PASS, sans intervention manuelle.
3. **Injection d'échec en cours de migration corrigée, puis reprise** (voir
   §FAILURE INJECTION) : après rollback complet, ré-application de la
   migration (non modifiée) → PASS.

Double exécution logique couverte par (1). Aucun des trois scénarios ne
nécessite d'intervention DBA manuelle avec le correctif.

## FAILURE INJECTION

Deux formes testées sur le scénario multi-tenant, avec le correctif en
place :

1. **Erreur SQL injectée** (`select 1/0;`) juste après la création de
   l'index `lignes_factures_entreprise_idx`, donc après le backfill et la
   ré-activation du trigger d'immuabilité, mais avant `COMMIT` :
   - Avant l'injection : `entreprise_id` colonne absente (comme sur base
     vierge).
   - Après l'échec : **colonne totalement absente à nouveau** —
     `ADD COLUMN` lui-même a été annulé, pas seulement le backfill.
     Checksum métier identique à l'état pré-migration. Rollback complet
     confirmé.
2. **Terminaison brutale du backend** (`pg_terminate_backend`) pendant
   l'`UPDATE` de backfill sur le scénario à l'échelle (40k lignes) :
   même résultat — colonne `entreprise_id` absente après coup, aucun état
   incohérent, aucune ligne verrouillée orpheline.

Dans les deux cas, une ré-application de la migration réelle (non
modifiée) immédiatement après réussit sans étape de nettoyage.

## DATA INTEGRITY (checksum avant/après)

Checksum MD5 calculé sur la concaténation ordonnée des colonnes
contractuelles (`factures`, `lignes_factures`, `paiements`, `devis`,
`lignes_devis`) :

- Scénario multi-tenant (B–H) : `3148a0caf282943a6d52927c8865cfae` avant
  migration 300 → identique après 300 → **identique après le reste du
  train (301→313)**.
- Scénario à l'échelle (I) : `3798db526a9cd134a2a5914cd22746ff` avant →
  identique après.
- Zéro ligne avec `entreprise_id is null` après migration, sur tous les
  scénarios.
- Zéro ligne avec `entreprise_id` divergent de son devis/facture parent
  (isolation tenant intacte), y compris sur 40 tenants simultanés.

## PERFORMANCE

Backfill mesuré sur le scénario I (40 tenants, 5000 factures dont 1912
émises, 40 000 `lignes_factures`, 5000 devis, 30 000 `lignes_devis`) :

- **Avant optimisation** (correctif atomique + désactivation du seul
  trigger d'immuabilité) : le simple `UPDATE` de backfill sur
  `lignes_factures` n'était **toujours pas terminé après 1 min 43 s**
  (verrou `ACCESS EXCLUSIVE` tenu tout ce temps). Cause : le trigger
  `recalc_facture_apres_ligne` (recalcul des totaux HT/TVA/TTC) se
  déclenche une fois par ligne mise à jour et effectue une agrégation sur
  toutes les lignes de la facture — alors qu'aucune colonne dont il
  dépend n'est modifiée par ce backfill.
- **Après optimisation** (désactivation additionnelle, pour la durée du
  backfill uniquement, de `recalc_facture_apres_ligne`,
  `recalc_devis_apres_ligne` et `synchroniser_taches_ligne_devis`, tous
  fonctionnellement no-ops ici car aucune des colonnes dont ils dépendent
  n'est touchée) : **migration entière (lignes_devis + lignes_factures +
  index + policies + analyze) en 6,2 s**, checksum identique, zéro
  divergence.

Pour un volume de production significativement plus grand que celui
mesuré ici, le commentaire déjà présent dans la migration (stratégie
`CREATE INDEX CONCURRENTLY` + backfill par lots hors transaction) reste la
recommandation applicable — non nécessaire pour le volume RC actuel ni pour
le volume testé ici (40k/30k lignes en quelques secondes une fois les
triggers de recalcul neutralisés).

## GATES

- `npm run verify:migrations` → `313 migrations valides, noms et
  horodatages uniques.` PASS.
- `npm run verify:secrets` → `2503 fichiers suivis contrôlés, aucun secret
  reconnu (2 exceptions nommées).` PASS.
- Fresh (313/313) : PASS (voir §FRESH).
- Upgrade (matrice complète) : PASS (voir §UPGRADE MATRIX).
- pgTAP : 2050 tests exécutés, résultat strictement identique
  avant/après le correctif (aucune régression) + 10 nouveaux tests verts.
- Gates JS/TS (`typecheck`, `lint`, `vitest`, `build`) : **non ré-exécutés
  dans cette session** — `node_modules` n'est pas installé dans ce
  sandbox et le changement est confiné à un fichier SQL de migration plus
  un fichier de test pgTAP, sans aucun changement de code applicatif
  TypeScript. Ces gates étaient verts au commit de base exact
  (`ELSATIA_FINAL_EXACT_TIP_QUALIFICATION_V3.md` : 20/20 gates,
  GP 1786 tests, Colors 427, Tools 1992, Studio 260, Reserves 178) et rien
  dans ce correctif ne les affecte.

## RÉSUMÉ DU CHANGEMENT

Fichiers modifiés :
- `supabase/migrations/20260921000300_correctif_perf_rls_lignes_devis_factures.sql`
  (même migration, jamais appliquée en Production, durcie en place — voir
  diff : enveloppe transactionnelle, désactivation ciblée de 4 triggers
  pendant les deux backfills, préflight de validation avant `SET NOT
  NULL`).
- `supabase/tests/upgrade_historique_entreprise_id_lignes.test.sql`
  (nouveau — régression pgTAP dédiée).

Aucune donnée supprimée, aucune contrainte métier affaiblie, aucun
changement de comportement applicatif observable après migration.

## VERDICT

**UPGRADE BLOCKER CLOSED LOCALLY**

Le blocker exact-tip est reproduit, sa cause racine est identifiée et
corrigée par une migration réellement atomique et sûre pour toute base
historique réelle (tous statuts de facture, paiements partiels/complets,
avoirs, multi-tenant, grand volume), avec reprise/idempotence prouvée y
compris depuis un état partiellement migré par l'ancienne version buguée,
et sans perte ni mutation de donnée contractuelle. Fresh et la suite pgTAP
restent strictement inchangés (preuve différentielle). Ne pas exécuter les
gates JS/TS applicatifs dans cette session (environnement sans
`node_modules`, changement non-applicatif) empêche un verdict
« HISTORICAL UPGRADE LOCALLY QUALIFIED » complet — à confirmer par un
passage `npm run verify` standard avant merge/déploiement.
