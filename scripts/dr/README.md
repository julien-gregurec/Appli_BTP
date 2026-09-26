# `scripts/dr/` — Outillage Disaster Recovery LOCAL

Mécanisme reproductible de sauvegarde/restauration/vérification pour la base
PostgreSQL d'ELSATIA, exécuté et prouvé **exclusivement en local, sur une
base jetable** (`elsatia_dr_drill*`). Aucun de ces scripts ne touche
Preview ou Production — voir `dr_require_local_target` dans `lib/common.sh`,
qui refuse par construction toute cible non locale.

Contexte complet, verdict et limites : voir
`docs/qualification/ELSATIA_DR_EXACT_TIP_V2.md` et
`docs/runbooks/ELSATIA_DISASTER_RECOVERY_RUNBOOK_V2.md`.

## Ordre d'exécution

| # | Script | Rôle |
|---|--------|------|
| 1 | `00_supabase_stubs.sql` | Rôles/schémas/fonctions minimaux qui simulent la plateforme Supabase (auth, storage, extensions) sur un Postgres nu. Appliqué automatiquement par `01_replay_migrations.sh`. |
| 1b | `00b_install_pgsodium_stub.sh` | Installe un paquet d'extension Postgres factice `pgsodium` (nécessaire à 2 migrations). **Nécessite root**, à lancer une fois par machine avant `01_replay_migrations.sh`. |
| 2 | `01_replay_migrations.sh --fresh` | Rejoue les 313 migrations de `supabase/migrations/` sur une base neuve. |
| 3 | `03_seed_synthetic_dataset.sql` | Charge le jeu de données synthétique multi-tenant (2 entreprises fictives, aucune donnée réelle). |
| 4 | `04_manifest.sh <fichier.json>` | Comptages + checksums (tables, fonctions, triggers, policies RLS) — à lancer avant sauvegarde ET après restauration. |
| 5 | `05_backup.sh [--out-dir DIR]` | pg_dump (format custom) + rôles cluster + manifeste, liés par un `backup_id`. |
| 6 | `06_restore.sh <backup-dir> [--force] [--target-db NOM]` | Vérifie le sha256, restaure sur une base locale jetable. |
| 7 | `07_verify.sh <avant.json> <apres.json>` | Diff strict entre deux manifestes (code de sortie non nul si divergence). |
| 8 | `08_verify_rls_functional.sh` | Preuve fonctionnelle (pas juste textuelle) que l'isolation multi-tenant RLS fonctionne après restauration. |
| 9 | `09_failure_modes_test.sh [backup-dir]` | Harnais de tests des modes de défaillance (dump tronqué, mauvais fichier, mauvais mot de passe, restore sur base non vide, restore partiel, double restore). |

## Exemple de drill complet

```bash
export DR_PGUSER=postgres
export DR_PGPASSWORD='...'          # jamais en dur dans un fichier du dépôt
export DR_BACKUP_DIR=/chemin/hors-repo/backups

sudo ./00b_install_pgsodium_stub.sh          # une fois par machine
./01_replay_migrations.sh --fresh
psql ... -f 03_seed_synthetic_dataset.sql    # voir DR_PG* dans lib/common.sh

BACKUP_DIR=$(./05_backup.sh)
./04_manifest.sh /tmp/avant.json
./06_restore.sh "$BACKUP_DIR" --force
./04_manifest.sh /tmp/apres.json
./07_verify.sh /tmp/avant.json /tmp/apres.json
./08_verify_rls_functional.sh
./09_failure_modes_test.sh "$BACKUP_DIR"
```

## Ce que cet outillage NE couvre PAS

- **Supabase Storage** (fichiers binaires réels) : voir le runbook Storage
  dédié. Ces scripts ne créent que des lignes `storage.objects`/métadonnées,
  jamais de contenu binaire.
- **Supabase Auth réel** (hachage de mot de passe, JWT, providers, hooks) :
  `00_supabase_stubs.sql` documente explicitement ce qu'il ne reproduit pas.
- **Preview/Production hébergés** : rien ici n'a été exécuté ni testé contre
  un projet Supabase hébergé. Voir le verdict `HOSTED_RPO/RTO = NOT_PROVEN`
  dans le rapport de qualification.
