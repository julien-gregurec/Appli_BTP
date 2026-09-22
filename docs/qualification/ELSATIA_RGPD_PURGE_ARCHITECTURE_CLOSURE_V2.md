# ELSATIA — Clôture architecture de la purge RGPD (art. 17) — V2

Date : 2026-09-22
Mission : transformer la purge RGPD en mécanisme techniquement cohérent, suite au
verdict **RGPD PURGE NOT PROVEN** de la qualification end-to-end V1
(`docs/qualification/ELSATIA_RGPD_PURGE_END_TO_END_V1.md`), qui a confirmé 8 défauts
structurels (F1-F8) sur données réelles. Aucune décision juridique nouvelle n'a été
prise dans ce lot : toute ambiguïté de rétention est résolue par défaut vers la
conservation, conformément à la mission.

## Verdict

<!-- PLACEHOLDER_VERDICT -->

## 0. Méthodologie

### 0.1 Environnement réellement utilisé

Même tier que la qualification V1 (registre Docker toujours bloqué par la politique
réseau de l'organisation, confirmé de nouveau non-retryable) : PostgreSQL 16 natif
(paquet Ubuntu, cluster déjà présent dans le conteneur), 180 vraies migrations du
dépôt appliquées telles quelles (0 erreur), platform Supabase reconstruite en SQL
minimal (`.qualification-tools/` — rôles anon/authenticated/service_role, auth.users,
storage.buckets/objects + storage.foldername()), et un serveur mock compatible
PostgREST + Storage-REST (`.qualification-tools/mock_supabase_server.mjs`, ~150 lignes,
Node + `pg`) qui traduit fidèlement les appels HTTP de `@supabase/supabase-js` (utilisé
sans modification par `scripts/purger-entreprise.mjs`) en vraies requêtes SQL, avec un
vrai `SET ROLE` par appel pour faire respecter les mêmes REVOKE/GRANT que les migrations
définissent. Contrairement à V1, cette qualification a aussi exécuté `pgTAP` réellement
(paquet `postgresql-16-pgtap` installé via apt, réseau disponible pour ce paquet).

Remarque hors périmètre, déjà signalée deux fois par les lots précédents : `AGENTS.md`
demande de lire `node_modules/next/dist/docs/`, qui n'existe pas. Non suivi, signalé par
prudence.

### 0.2 Ce qui est réellement prouvé dans ce lot

- Les 180 migrations (179 existantes + la nouvelle `20260729000185`) s'appliquent sans
  erreur sur une base neuve, dans l'ordre.
- Chaque fonction SQL nouvelle/modifiée a été exercée réellement (pas relue seulement) :
  `rapport_purge_entreprise`, `purger_table_entreprise`, `anonymiser_table_entreprise`,
  `verifier_storage_entreprise`, `marquer_entreprise_purgee`, `lire_audit_purge_entreprise`,
  `_snapshot_avant_purge`, `_libelle_ligne`.
- Le script `scripts/purger-entreprise.mjs` (dry-run/execute/verify) a été exécuté pour
  de vrai via HTTP contre le mock PostgREST, pas appelé directement en SQL.
- 46 assertions pgTAP exécutées réellement (2 fichiers, voir §11), 0 échec.
- <!-- PLACEHOLDER_DATASET_EXECUTION -->

## 1. Graphe de dépendances réel

Construit depuis `pg_constraint` (pas depuis l'ordre des migrations) sur les 127 tables
portant `entreprise_id` du schéma `public`, une fois les 180 migrations appliquées.

- **249 contraintes FK réelles** entre tables `entreprise_id`.
- **~40 arêtes RESTRICT/NO ACTION** identifiées, dont 10 restent internes au
  sous-graphe DELETE final (ordonnées par tri topologique, voir F2 ci-dessous) et le
  reste pointe depuis une table désormais RETAIN/ANONYMIZE.
- **12 arêtes SET NULL/SET DEFAULT** depuis une table RETAIN vers une table DELETE
  (F8, voir §3).

Classification finale (voir `public.tables_conservees_purge()`,
`public.tables_anonymisees_purge()`, migration `20260729000185`) :

| Catégorie | Nombre de tables | Exemples |
|---|---|---|
| DELETE | 98 | chantiers, devis, pointages, articles_stock, ... |
| ANONYMIZE | 3 | clients, employes, fournisseurs |
| RETAIN | 26 | factures, paiements, bulletins_paie, periodes_paie, notes_frais, signatures_documents, journal_activite, ... |

Aucune table n'est restée `LEGAL_DECISION_REQUIRED` au sens « impossible à classer » —
voir §12 pour ce qui reste un arbitrage juridique malgré une classification technique
tranchée par défaut vers la conservation.

## 2. Documents retenus (mission §2)

| Domaine mission | Tables RETAIN correspondantes |
|---|---|
| Factures, avoirs | `factures` (avoirs = `type='avoir'` dans la même table), `lignes_factures` |
| Paiements | `paiements`, `remises_banque_paiements`, `coordonnees_bancaires`, `connexions_bancaires`, `lots_virements`, `ordres_virements`, `journal_paiements_bancaires` |
| Paie | `bulletins_paie`, `periodes_paie`, `dossiers_paie_salaries`, `validations_paie`, `absences_paie`, `indemnites_deplacement_paie`, `pieces_jointes_paie`, `journal_audit_paie`, `grands_deplacements` |
| Écritures | `journal_activite` |
| Documents contractuels | `signatures_documents` |
| Audit | `journal_audit_paie` (paie), `journal_activite` (général), `platform.purge_audit` (purge elle-même, F4) |

Toutes ces tables ne dépendent jamais d'une ligne que la purge supprime : soit la ligne
référencée est elle-même RETAIN, soit elle est ANONYMIZE (ligne conservée), soit une FK
SET NULL/SET DEFAULT vers une table DELETE est désormais précédée d'un instantané
`purge_snapshot` (F8, §3).

## 3. Stratégie de référence par type de conflit

| Conflit FK | Stratégie retenue | Exemple réel |
|---|---|---|
| RESTRICT/NO ACTION depuis une table RETAIN vers une identité personnelle | **Anonymisation** (ligne conservée, PII vidée dynamiquement par pattern de colonnes) | `bulletins_paie.employe_id` → `employes` |
| RESTRICT/NO ACTION depuis une table RETAIN vers un enregistrement financier/paie | **Reclassification RETAIN** (le domaine légal l'exige de toute façon) | `ordres_virements.note_frais_id` → `notes_frais` |
| SET NULL/SET DEFAULT depuis une table RETAIN vers une table DELETE | **Snapshot** `{id, libelle, table_origine, purge_le}` dans une colonne `purge_snapshot jsonb`, écrit avant la suppression | `factures.devis_origine_id` → `devis` |
| Trigger d'immuabilité existant sur une table classée DELETE | **Reclassification RETAIN** (le trigger était le signal correct, pas la classification) | `journal_audit_paie`, `signatures_documents` |
| Colonne `*_storage_path` sur une ligne ANONYMIZE/DELETE | **Suppression physique** une fois la ligne anonymisée/purgée (le pointeur DB disparaît en même temps que le fichier, jamais l'un sans l'autre) | `employes.photo_storage_path` |
| Colonne `*_storage_path` sur une ligne RETAIN | **Conservation** (jamais supprimé, jamais réévalué indépendamment de la ligne) | `signatures_documents.signature_storage_path` |

Aucun tombstone dédié n'a été nécessaire au-delà du `purge_snapshot` : la ligne
`entreprises` elle-même joue déjà ce rôle (jamais supprimée, anonymisée et marquée
`purgee_at`), et chaque table ANONYMIZE conserve sa propre ligne comme « tombstone »
implicite référençable par les tables RETAIN qui en dépendent.

## 4. Audit trail

`platform.purge_audit` (schéma séparé, hors de portée du scan dynamique
`information_schema.columns where column_name='entreprise_id'` qui pilote
`rapport_purge_entreprise`) — voir migration §0 pour le détail. Chaque appel à
`purger_table_entreprise`/`anonymiser_table_entreprise`/`marquer_entreprise_purgee`
consigne un enregistrement, y compris en cas d'échec (F1 : la fonction ne relance plus
d'exception, donc la transaction PostgREST qui l'appelle commit toujours, préservant
l'audit). Lecture réservée à `service_role` via `lire_audit_purge_entreprise`.

## 5. Storage

`verifier_storage_entreprise()` découvre dynamiquement TOUTE colonne `*_storage_path`
du schéma `public` (18 colonnes réelles trouvées sur 12 tables, voir §1 du script de
découverte utilisé), croise avec les fichiers réels sous
`storage.foldername(name)[1] = entreprise_id`, et classe chaque fichier :
- **ORPHELIN** : plus aucune ligne ne le référence → supprimé physiquement par le
  script (`storage.from(bucket).remove()`, appel HTTP réel).
- **RETAIN** : référencé par une ligne conservée ou anonymisée → jamais supprimé.
- **A_PURGER** : référencé par une ligne DELETE pas encore purgée → bloque
  `marquer_entreprise_purgee` tant qu'il en reste (garde de complétude).

<!-- PLACEHOLDER_STORAGE_EXECUTION -->

## 6. Plan de purge

`rapport_purge_entreprise()` remplace l'ordre alphabétique (F2) par un tri topologique
réel calculé à chaque appel depuis `pg_constraint` (algorithme des niveaux/plus long
chemin, garde-fou anti-cycle à 50 niveaux — profondeur réelle observée : 2). Supporte :

- **dry-run** : `node scripts/purger-entreprise.mjs <id> dry-run` — lecture seule.
- **execute** : purge réelle, `run_id` généré et affiché.
- **resume** : `execute --run-id=<id>` — idempotent, reprend sans double travail.
- **verify** : contrôle de complétude, code de sortie 0/1.

## 7. Interruption / reprise

<!-- PLACEHOLDER_INTERRUPT_RESUME -->

## 8. Isolation tenant

<!-- PLACEHOLDER_ISOLATION -->

## 9. Dataset

<!-- PLACEHOLDER_DATASET -->

## 10. Exécution réelle

<!-- PLACEHOLDER_EXECUTION -->

## 11. Tests

pgTAP, exécutés réellement (pas de lecture statique) :

- `supabase/tests/purge_entreprise_supprimee.test.sql` — 20 assertions (existence,
  droits, F1/F3/F4/F8 avec assertions réelles remplaçant les `todo()` de V1).
- `supabase/tests/purge_entreprise_architecture_v2.test.sql` — 26 assertions
  (service_role uniquement sur toutes les nouvelles fonctions, mauvais tenant, double
  purge, retry après échec réel, échéance avant/après, ANONYMIZE de bout en bout,
  ordre topologique réel, isolation tenant, snapshot F8 avec valeur réelle).

**46/46 assertions passent.** Détail des cas couverts contre la liste mission §11 :

| Cas demandé | Couvert par |
|---|---|
| service_role only | Tests 8-12 (fichier 1), tests 1-6 (fichier 2) |
| wrong tenant | Test 23 (fichier 2) |
| double purge | Test 14 (fichier 2) |
| retry | Tests 15-16 (fichier 2) |
| expired schedule | Test 16 (fichier 1) |
| before schedule | Test 7 (fichier 2), tests 13-14 (fichier 1) |

vitest : `src/lib/rgpd.test.ts` mis à jour pour la classification V2 (ANONYMIZE
distincte de RETAIN) — 7/7 tests passent. Suite complète du dépôt : 111/111 tests
passent (29 fichiers), aucune régression introduite.

## 12. Décisions juridiques restantes (LEGAL_DECISION_REQUIRED)

Cette clôture V2 ne tranche aucune de ces questions — elle rend la conservation par
défaut techniquement cohérente et exécutable en attendant l'arbitrage :

1. **Durée exacte de rétention par domaine.** Le code ne stocke ni n'applique aucune
   durée (10 ans comptable est une hypothèse documentée, jamais vérifiée ni appliquée
   automatiquement table par table). Aucune purge automatique après expiration de la
   durée légale n'existe.
2. **Granularité du module paie.** Retenu en bloc (périodes, dossiers, absences,
   indemnités, pièces jointes) plutôt que ligne par ligne selon l'ancienneté — plus
   sûr mais potentiellement plus large que nécessaire.
3. **Fichiers Storage `notes_frais`.** Conservés par défaut avec la ligne (mission :
   conserver en cas de doute), jamais réévalués indépendamment — un justificatif de
   note de frais n'est pas nécessairement une donnée personnelle au même titre que la
   ligne comptable qui la référence.
4. **Anonymisation vs conservation intégrale** de `clients`/`employes`/`fournisseurs` :
   ce lot anonymise (pratique RGPD recommandée pour concilier droit à l'effacement et
   obligation de conservation), mais c'est un choix qui engage la plateforme, pas
   seulement une contrainte technique.
5. **`facturation_comptes_mensuelle`** (facturation de la plateforme elle-même au
   client) classée RETAIN par analogie avec les autres domaines comptables — jamais
   confirmé explicitement comme relevant de la même politique de rétention.

## 13. Runbook

Voir `docs/runbooks/ELSATIA_RGPD_PURGE_OPERATION_V2.md`.
