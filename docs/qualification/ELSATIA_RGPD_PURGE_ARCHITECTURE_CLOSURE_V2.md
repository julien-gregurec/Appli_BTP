# ELSATIA — Clôture architecture de la purge RGPD (art. 17) — V2

Date : 2026-09-22
Mission : transformer la purge RGPD en mécanisme techniquement cohérent, suite au
verdict **RGPD PURGE NOT PROVEN** de la qualification end-to-end V1
(`docs/qualification/ELSATIA_RGPD_PURGE_END_TO_END_V1.md`), qui a confirmé 8 défauts
structurels (F1-F8) sur données réelles. Aucune décision juridique nouvelle n'a été
prise dans ce lot : toute ambiguïté de rétention est résolue par défaut vers la
conservation, conformément à la mission.

## Verdict

# RGPD PURGE ARCHITECTURE LOCALLY QUALIFIED

Les 8 défauts structurels confirmés par la qualification V1 (F1-F8) sont corrigés et
**exécutés réellement de bout en bout** — pas relus, pas simulés — sur un jeu de
données multi-domaines représentatif (clients, fournisseurs, salariés avec fichiers
Storage réels, devis, chantiers, factures dont un avoir, paiements, notes de frais
verrouillées par virement, préparation de paie complète, signatures de documents,
pointages GPS) : dry-run, sauvegarde restaurée avec succès, purge réelle **interrompue
de force puis reprise**, vérification de complétude, isolation d'un second tenant
prouvée octet pour octet avant/après. Tous les tests automatisés (46 assertions pgTAP +
111 tests vitest) passent réellement.

« Localement qualifiée » plutôt que « techniquement prête sans réserve » parce que :
cette exécution reste sur un environnement reconstruit (PostgreSQL natif + mock
PostgREST/Storage, Docker toujours inaccessible), pas la stack Supabase de production
complète (pas de vrai GoTrue, pas de vraie API Storage Supabase) — même réserve
méthodologique que la qualification V1, qui n'affecte pas la logique de purge
elle-même (entièrement côté SQL/PL-pgSQL, indépendante de la stack Auth/Storage réelle)
mais que l'honnêteté sur le périmètre exige de garder. Les décisions juridiques listées
en §12 restent, par construction de cette mission, non tranchées.

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
- Un jeu de données réel (§9) a été purgé de bout en bout (dry-run, sauvegarde
  `pg_dump`, purge interrompue de force par un vrai `SIGKILL` du processus puis
  reprise, vérification) contre l'environnement ci-dessus, avec un second tenant
  témoin dont l'empreinte de contenu est restée bit-à-bit identique avant/après.

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

Exécuté réellement sur le tenant de qualification (13 fichiers Storage réels, 4
buckets) :

| Étape | ORPHELIN | RETAIN | A_PURGER |
|---|---|---|---|
| Avant purge (dry-run) | 1 (fichier délibérément non référencé, semé pour ce test) | 9 (docs employés + signature + justificatifs notes de frais) | 3 (photos pointages/sessions, tables DELETE pas encore purgées) |
| Après purge complète | 0 | 3 (signature + 2 justificatifs notes de frais retenus) | 0 |

10 fichiers physiquement supprimés lors de la purge réelle (`storage.from(bucket)
.remove()`, appel HTTP réel — pas un `DELETE` SQL direct sur `storage.objects`) :
7 documents employés (photo/signature/carte BTP, devenus orphelins après
l'anonymisation de `employes`) + 3 photos de pointage/session (devenues orphelines
après la purge de `pointages`/`sessions_pointage`). Confirmé par re-listing après
purge : 0 fichier restant pour ces chemins, à la fois côté `storage.objects` et par
absence dans le rapport de réconciliation.

Cas particulier trouvé et corrigé pendant cette exécution (F7 additionnel, non identifié
par la qualification V1) : `entreprises.logo_url` stocke une URL publique complète, pas
un chemin nu — ne correspondait donc à aucune colonne `*_storage_path` scannée. Sans
correctif, un logo aurait été classé ORPHELIN et supprimé par le script AVANT que
`marquer_entreprise_purgee` ne vide `logo_url`, créant une référence morte transitoire
si la purge est interrompue entre les deux étapes. Corrigé en traitant `logo_url` comme
un cas explicite, toujours classé RETAIN tant que la fiche entreprise n'est pas
anonymisée.

## 6. Plan de purge

`rapport_purge_entreprise()` remplace l'ordre alphabétique (F2) par un tri topologique
réel calculé à chaque appel depuis `pg_constraint` (algorithme des niveaux/plus long
chemin, garde-fou anti-cycle à 50 niveaux — profondeur réelle observée : 2). Supporte :

- **dry-run** : `node scripts/purger-entreprise.mjs <id> dry-run` — lecture seule.
- **execute** : purge réelle, `run_id` généré et affiché.
- **resume** : `execute --run-id=<id>` — idempotent, reprend sans double travail.
- **verify** : contrôle de complétude, code de sortie 0/1.

## 7. Interruption / reprise

Forcé réellement, pas simulé : le mock PostgREST a été configuré avec un délai
artificiel par appel (`MOCK_RPC_DELAY_MS`), le script `execute` lancé, puis le
processus Node tué avec `SIGKILL` (`timeout -s KILL`, pas un `Ctrl+C` propre — le pire
cas, aucun handler de sortie ne s'exécute) après 3 des 11 tables DELETE.

Constat réel notable : au moment du `SIGKILL`, le serveur avait déjà committé une 4ᵉ
table (`permissions_poste`) que le script n'avait pas encore eu le temps d'afficher à
l'écran — la preuve que l'état réel (base + `platform.purge_audit`) est la seule
source de vérité, jamais la sortie du script. Confirmé par lecture directe de l'audit
juste après l'interruption : 4 lignes `purge_table` avec `ok=true`, aucune ligne
incohérente.

Reprise avec le même `--run-id` : reprend exactement où l'exécution précédente
s'était arrêtée (les 4 tables déjà purgées n'apparaissent plus dans le rapport dynamique
donc ne sont jamais retentées), termine les 7 tables DELETE restantes, les 3 tables
ANONYMIZE, la réconciliation Storage puis le marquage entreprise — sans aucune erreur,
sans double traitement. Un second appel `execute` complet (double purge, sur une
entreprise déjà entièrement purgée) confirme l'idempotence : toutes les étapes
renvoient `ok=true` avec 0 ligne affectée, `verify` retourne toujours *PURGE COMPLÈTE*.

## 8. Isolation tenant

Empreinte de contenu (MD5 par ligne, agrégée par table, puis un MD5 global sur les 127
tables `entreprise_id`) calculée pour le Tenant B **avant** toute opération sur le
Tenant A, puis recalculée **après** : dry-run, sauvegarde, purge interrompue de force,
reprise, double purge, et une tentative de purge du Tenant B lui-même sans suppression
programmée (« mauvais tenant », voir ci-dessous).

```
empreinte Tenant B avant : 2a58218c30e0e8c859b0e608257e98ea
empreinte Tenant B après : 2a58218c30e0e8c859b0e608257e98ea
```

**Identique au caractère près.** Confirmé aussi par lecture directe : le Tenant B
conserve ses 9 tables DELETE avec lignes, ses 2 tables ANONYMIZE non anonymisées, ses 2
tables RETAIN — exactement l'état seedé, aucune ligne créée/modifiée/supprimée.

**Mauvais tenant** : une tentative explicite de `purger_table_entreprise`/`execute` sur
le Tenant B (qui n'a jamais eu de suppression programmée) échoue proprement sur
l'intégralité de ses tables DELETE, sans exception, avec un message désormais clair
(« cette entreprise n'a pas de suppression programmée échue — ce n'est pas un défaut
d'architecture », correctif apporté pendant cette exécution après un premier message
trompeur qui suggérait à tort un problème structurel). Le Tenant A, purgé entre-temps,
n'a jamais influencé ce refus : chaque entreprise est vérifiée indépendamment sur sa
propre colonne `suppression_prevue_at`.

## 9. Dataset

`supabase/production/seed_purge_qualification_v2.sql` (idempotent, `ON CONFLICT (id)
DO NOTHING`, ids fixes). Volumétrie volontairement compacte (pas un remplacement de la
qualification V1 à échelle réelle, qui reste la preuve de charge) mais couvrant chaque
branche de classification :

**Tenant A « Entreprise Purge Qualification V2 »** (`aaaaaaaa-0000-0000-0000-000000000001`) :
clients 5, fournisseurs 4, employés 5 (2 avec les 3 documents Storage complets
photo+signature+carte BTP, 1 avec photo seule), chantiers 4, devis 4 (+7 lignes),
factures 5 (+8 lignes — dont une `finale` avec `chantier_id` ET `devis_origine_id` non
nuls, et son `avoir` correspondant, pour exercer F8 sur les deux), paiements 2, notes de
frais 5 (2 remboursées via `ordres_virements`, donc verrouillées par RESTRICT — F3),
lots de virement 1, ordres de virement 2, périodes de paie 1, dossiers de paie 3,
journal d'audit de paie 3, signatures de documents 1, pointages 5, sessions de pointage
3 (latitude/longitude + photos), journal d'activité 5, fichiers Storage réels 13 (12
référencés + 1 orphelin délibéré).

**Tenant B « Entreprise Controle B »** (`aaaaaaaa-0000-0000-0000-000000000002`) : sous-
ensemble équivalent (clients 3, employés 2, chantiers 2, devis 1+2 lignes, factures
1+2 lignes) — jamais purgé, sert uniquement de témoin d'isolation (§8).

Point de périmètre découvert en construisant ce jeu de données : **aucune table du
schéma ne correspond à des « réserves » de chantier** (défauts/levées de réserve en fin
de travaux) — vérifié sur les 180 migrations, seule occurrence du mot : « réservé »
dans un message d'erreur sans rapport. Rien n'a donc été semé pour ce point de la
mission ; il n'existe simplement pas de fonctionnalité correspondante dans ce dépôt à
ce jour.

## 10. Exécution réelle

Séquence réellement exécutée sur le Tenant A, via HTTP contre le mock PostgREST
(`@supabase/supabase-js` non modifié, exactement comme en production) :

1. **dry-run** : rapport correct (11 DELETE ordonnées topologiquement sur 3 niveaux,
   3 ANONYMIZE, 10 RETAIN, Storage 1 ORPHELIN/9 RETAIN/3 A_PURGER). Rien modifié.
2. **backup** : `pg_dump -Fc` de la base entière, restauré dans une base neuve
   (`pg_restore`), comptage de lignes identique avant/après restauration (24/24 sur
   `rapport_purge_entreprise`) — sauvegarde confirmée réellement restaurable, pas
   seulement "un fichier existe".
3. **execute, interrompu de force** : `SIGKILL` après 3-4 tables (voir §7) — aucun état
   incohérent, audit complet des étapes déjà commitées.
4. **resume** (`--run-id`) : termine les 7 tables DELETE restantes, les 3 ANONYMIZE,
   supprime 10 fichiers Storage orphelins réels, marque l'entreprise purgée.
5. **verify** : code de sortie 0, *PURGE COMPLÈTE*, 21 entrées d'audit (dont les 4
   refus légitimes d'avant l'échéance, antérieurs à ce run).
6. **double purge** (`execute` rejoué sur une entreprise déjà entièrement purgée) :
   toutes les étapes idempotentes, `ok=true`, 0 ligne affectée partout.

Résultats vérifiés directement en base après l'exécution complète :
- `factures.purge_snapshot` contient les libellés réels et exacts des lignes purgées
  (`"Renovation appartement Lefevre"` pour `chantier_id`, `"DEV-2026-001"` pour
  `devis_origine_id`), sur la facture `finale` ET son `avoir` — F8 vérifié avec des
  valeurs réelles, pas seulement "la colonne existe".
- `employes` : 5 lignes toujours présentes (`nom`/`prenom` = « Anonymise RGPD » /
  « Anonymise »), toutes les colonnes `*_storage_path` à `NULL` — F3 + F7 vérifiés
  ensemble sur des lignes réelles.
- `entreprises` : ligne jamais supprimée, `nom` = « Entreprise supprimee »,
  `purgee_at` renseigné.

Aucune table n'est restée bloquée : les 11 tables DELETE se sont toutes purgées avec
succès (dont deux qui auraient échoué structurellement sous l'architecture V1 —
`chantiers`, verrouillée par `mouvements_outillage`/`pointages`/`sessions_pointage`/
`situations_travaux` en RESTRICT, purgée sans incident grâce à l'ordre topologique).

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
