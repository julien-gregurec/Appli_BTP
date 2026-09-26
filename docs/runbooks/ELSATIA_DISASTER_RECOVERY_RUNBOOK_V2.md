# ELSATIA — Runbook Incident : Disaster Recovery (V2)

Statut : **DR EXACT-TIP LOCALLY PROVEN / HOSTED NOT PROVEN** — voir le
verdict complet dans `docs/qualification/ELSATIA_DR_EXACT_TIP_V2.md`.

Ce document remplace, pour tout ce qui concerne la restauration de base de
données, l'ancien audit DR (baseline 178 migrations). Le train actuel compte
**313 migrations** au SHA de `origin/claude/funny-bell-eqo1p5`
(`842b4b4f...`). Les preuves de ce runbook (backup/restore/validation) ont
été rejouées sur ce SHA exact, sur une base PostgreSQL 16 **locale et
jetable** — jamais sur Preview/Production.

Ce runbook est un COMPLÉMENT aux runbooks de cutover existants
(`ELSATIA_GP_CUTOVER_DAY_OF_RUNBOOK_V1.md`,
`ELSATIA_PRODUCTION_ROLLBACK_V1.md`), pas un remplacement : ceux-ci
décrivent la procédure de bascule Preview→Production et son rollback ; ce
document décrit la réponse à un incident de perte/corruption de données une
fois en exploitation, plus l'outillage réutilisable (`scripts/dr/`).

---

## 1. Classification SEV

| Niveau | Définition | Exemple | Délai de mobilisation |
|--------|------------|---------|------------------------|
| **SEV1** | Perte de données confirmée ou suspectée en Production, ou indisponibilité totale de la base. | Table métier vidée par erreur, corruption suite à une migration, suppression accidentelle de projet Supabase. | Immédiat, astreinte. |
| **SEV2** | Dégradation significative sans perte de données confirmée. | RLS cassée par une migration (fuite ou blocage cross-tenant), fonction métier critique en erreur (facturation, paie). | < 1h ouvrée. |
| **SEV3** | Anomalie localisée, contournable. | Une fonctionnalité secondaire en erreur, sans impact financier ou de confidentialité. | Cycle normal. |

Un incident touchant `BANK_DATA_ENCRYPTION_KEY` (IBAN chiffrés) ou une fuite
RLS cross-tenant est **toujours SEV1**, quelle que soit l'ampleur apparente :
voir §9 de la mission et `docs/qualification/ELSATIA_DR_EXACT_TIP_V2.md`
§Secrets.

## 2. Arbre de décision (SEV1 — suspicion de perte de données DB)

```
Incident détecté (alerte, signalement client, anomalie interne)
│
├─ La base répond-elle (SELECT 1) ?
│   ├─ NON → Panne infra Supabase : ouvrir un ticket support Supabase.
│   │         Ne PAS tenter de restauration tant que la cause n'est pas
│   │         identifiée (une restauration sur une base qui va revenir
│   │         seule serait un rollback destructif inutile).
│   └─ OUI → continuer
│
├─ Les données manquantes/corrompues sont-elles identifiées précisément
│  (tables, plage temporelle, entreprises concernées) ?
│   ├─ NON → Geler les écritures sur le périmètre suspect (feature flag /
│   │         maintenance ciblée), puis investiguer (logs applicatifs,
│   │         `pg_stat_activity`, audit trail applicatif) avant toute
│   │         action destructive.
│   └─ OUI → continuer
│
├─ Un PITR ou snapshot managé Supabase est-il CONFIRMÉ actif et
│  restaurable pour la fenêtre concernée ?
│   (cf. ELSATIA_GP_CUTOVER_DAY_OF_RUNBOOK_V1.md §J-1.1 : ceci N'EST PAS
│    acquis par défaut — le plan Supabase peut n'offrir qu'une sauvegarde
│    quotidienne, pas de PITR seconde-près.)
│   ├─ NON confirmé → STOP. Escalade décideur (Julien) : arbitrage entre
│   │   restaurer sur le dernier point disponible (perte de données
│   │   probable, cf. RPO réel = intervalle depuis ce point) ou ne pas
│   │   restaurer et corriger en direct. Ne jamais restaurer "à l'aveugle".
│   └─ OUI → restaurer sur un projet Supabase JETABLE de test d'abord
│             (jamais directement sur Production) pour valider le contenu,
│             PUIS basculer.
│
└─ Après restauration (test ou réelle) : exécuter la §5 Validation
   ci-dessous avant de rouvrir l'accès aux utilisateurs.
```

## 3. Sauvegarde — ce qui est prouvé vs ce qui ne l'est pas

### 3.1 Prouvé localement (ce runbook, `scripts/dr/`)

- `pg_dump --format=custom --compress=9` de la base applicative complète
  (schéma, données, contraintes, fonctions, triggers, **policies RLS**).
- `pg_dumpall --roles-only` pour les rôles cluster
  (`anon`/`authenticated`/`service_role`/`supabase_admin`/...), qui ne sont
  **pas** capturés par un `pg_dump` par base.
- Un manifeste de vérification (comptages + checksums MD5 par table +
  checksums des fonctions/triggers/policies) généré avant et après.
- Ces trois artefacts sont liés par un `backup_id` commun et un fichier
  `backup_index.json` portant les sha256 (cf. `05_backup.sh`).

### 3.2 PAS prouvé (hébergé)

- Qu'un mécanisme de sauvegarde **automatique et récurrent** existe
  réellement sur le projet Supabase Production actuel. Le dépôt ne contient
  **aucune preuve** que le plan Supabase Production dispose de PITR ou même
  d'un snapshot managé confirmé restaurable — `ELSATIA_GP_CUTOVER_DAY_OF_
  RUNBOOK_V1.md` (§J-1.1, ligne ~330) traite ceci comme un **point de
  vérification obligatoire non encore soldé**, pas comme un acquis.
- Toutes les procédures de sauvegarde décrites dans les runbooks de cutover
  existants (`ELSATIA_PRODUCTION_ROLLBACK_V1.md`,
  `ELSATIA_GP_CUTOVER_DAY_OF_RUNBOOK_V1.md`) sont des **procédures
  manuelles, déclenchées par un opérateur un jour de cutover** — aucun cron
  job, Edge Function ou tâche planifiée dans ce dépôt n'exécute de
  sauvegarde récurrente automatique. Voir §15 de la mission et le rapport de
  qualification, §Legal Claims : ceci contredit la formulation "sauvegardes
  automatiques régulières" des documents juridiques.

## 4. Procédure de sauvegarde (locale, reproductible)

```bash
export DR_PGUSER=postgres
export DR_PGPASSWORD='...'                 # jamais en dur
export DR_BACKUP_DIR=/chemin/hors-repo/backups
scripts/dr/05_backup.sh
```

Produit `$DR_BACKUP_DIR/<backup_id>/{elsatia_dr_drill.dump, roles.sql,
manifest.json, backup_index.json}`. Durée mesurée sur le jeu de données DR
(2 tenants synthétiques, ~100 lignes au total, schéma complet de 313
migrations = 237 tables) : **~35s au total**, dont l'essentiel
(~30s) est le calcul du manifeste (checksums), pas le `pg_dump` lui-même.
**Ce chiffre n'est PAS extrapolable à un volume de données de production** —
voir §8 RPO/RTO ci-dessous.

## 5. Procédure de restauration + validation

```bash
scripts/dr/06_restore.sh "$BACKUP_DIR" --force   # --force requis si la
                                                   # base cible n'est pas vide
scripts/dr/04_manifest.sh /tmp/apres.json
scripts/dr/07_verify.sh "$BACKUP_DIR/manifest.json" /tmp/apres.json
scripts/dr/08_verify_rls_functional.sh
```

`06_restore.sh` vérifie le sha256 du dump AVANT toute action destructive et
refuse un fichier tronqué/corrompu/substitué. `07_verify.sh` compare
comptages de lignes, checksums de données, et checksums des
fonctions/triggers/policies RLS — sort en erreur (code 1) à la moindre
divergence. `08_verify_rls_functional.sh` va plus loin : il **exécute** des
requêtes comme le ferait l'application (rôle `authenticated`, JWT simulé) et
vérifie que l'isolation multi-tenant produit réellement l'effet attendu, pas
seulement que le texte des policies est identique.

**Zéro divergence n'est acceptable en sortie de restauration.** Toute
divergence signalée par `07_verify.sh` est un incident en soi (le backup ou
la restauration a un défaut) et bloque la réouverture de l'accès.

## 6. Rollback

Si une restauration s'avère elle-même incorrecte ou incomplète (voir §7
"Modes de défaillance" ci-dessous), le rollback est : **ne pas rouvrir
l'accès**, conserver le dump défaillant pour analyse (jamais l'écraser), et
recommencer la restauration depuis un `backup_id` antérieur confirmé sain
par son propre `manifest.json`. Il n'existe pas de "rollback partiel" sûr
d'une restauration de base de données : soit la restauration entière est
validée par `07_verify.sh`, soit elle est rejetée entièrement.

Pour le rollback d'un cutover (bascule de version applicative + schéma),
voir `ELSATIA_PRODUCTION_ROLLBACK_V1.md`, qui reste la référence pour ce
scénario précis (redéploiement frontend couplé à la restauration DB).

## 7. Modes de défaillance couverts (`scripts/dr/09_failure_modes_test.sh`)

| Scénario | Comportement attendu | Vérifié |
|----------|----------------------|---------|
| Dump tronqué après écriture | Rejet avant toute action, sha256 ne correspond pas | ✅ |
| Mauvais fichier (pas un dump pg_dump) | Rejet par `pg_restore --list`, message explicite | ✅ |
| Mauvais mot de passe | Échec d'authentification PostgreSQL, aucune action | ✅ |
| Restore sur une base non vide sans confirmation | Refusé, message pointant vers `--force` | ✅ |
| Restore partiel (dump coupé en plein contenu) | `pg_restore` échoue en cours d'exécution (pas de succès silencieux) | ✅ |
| Double restauration consécutive (`--force` x2) | Idempotent, pas de corruption cumulative | ✅ |

Détail des runs et codes de sortie : voir le rapport de qualification,
§Failure Modes.

## 8. RPO / RTO

| Mesure | Valeur | Portée |
|--------|--------|--------|
| **RPO_LOCAL** | Égal à l'âge du dernier `pg_dump` réussi (pas de continu/PITR local dans cet outillage) | Base locale jetable, jeu de données DR synthétique |
| **RTO_LOCAL** | ~3 secondes (restauration mesurée, 2 runs) + temps de récupération/vérification du dump (négligeable en local) | Idem |
| **HOSTED_RPO** | **NOT_PROVEN** | Dépend du plan Supabase réellement actif (PITR vs snapshot quotidien vs rien de confirmé) — non vérifié dans cette mission |
| **HOSTED_RTO** | **NOT_PROVEN** | Dépend du volume réel de données Production (des ordres de grandeur supérieurs au jeu de données DR synthétique) et du temps de restauration côté plateforme Supabase, non mesurable depuis ce bac à sable |

Le RTO_LOCAL de quelques secondes est un artefact d'un jeu de données
minuscule (~100 lignes) sur du matériel local rapide : il **ne doit jamais
être cité comme un engagement de service**, seulement comme la preuve que
le *mécanisme* (script, intégrité, ordre des opérations) fonctionne.

## 9. Communications

- **Interne** : dès SEV1 déclaré, notifier le décideur (Julien) avant toute
  action de restauration réelle (voir arbre de décision §2). Toute
  restauration sur Preview/Production nécessite son accord explicite.
- **Clients** : en cas de perte de données confirmée touchant des tenants
  identifiés, la communication doit être cohérente avec les engagements des
  documents juridiques (`docs/juridique/cgv.md`,
  `docs/juridique/dpa-entreprises-clientes.md`) — ne pas sur-promettre au-delà
  de ce que ce runbook prouve réellement (voir §Legal Claims du rapport de
  qualification).
- **Registre** : consigner `backup_id` utilisé, résultat de `07_verify.sh`,
  et toute divergence, dans le postmortem (§10).

## 10. Postmortem (gabarit)

```
Incident : <SEV, date/heure UTC>
Détection : <comment, par qui, délai depuis l'événement>
Cause racine : <migration ? erreur applicative ? action manuelle ? panne infra ?>
Périmètre : <tenants/tables/plage temporelle affectés>
Action de restauration : <backup_id utilisé, horodatage du backup, RPO réel constaté>
Validation : <résultat de 07_verify.sh et 08_verify_rls_functional.sh, ou
              équivalent hébergé si applicable>
Durée totale (détection → réouverture accès) : <RTO réel constaté>
Divergences résiduelles : <néant / liste>
Actions correctives : <ex: activer PITR si absent, corriger la migration
                        fautive, ajouter un test de non-régression>
Communication envoyée : <interne/clients, quand, contenu>
```

## Références

- `docs/qualification/ELSATIA_DR_EXACT_TIP_V2.md` — verdict complet, preuves détaillées.
- `scripts/dr/README.md` — outillage et ordre d'exécution.
- `docs/runbooks/ELSATIA_GP_CUTOVER_DAY_OF_RUNBOOK_V1.md` — procédure de cutover (référence pour PITR/snapshot Production).
- `docs/runbooks/ELSATIA_PRODUCTION_ROLLBACK_V1.md` — rollback de cutover (DB + frontend couplés).
- `docs/runbooks/ELSATIA_ENV_MANIFEST_RUNBOOK_V1.md` — registre des secrets DR-critiques (`dr_critical`), y compris ses limites (`PF-DR-REGISTRY` ne vérifie jamais une copie hors site).
