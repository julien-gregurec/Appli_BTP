# ELSATIA V9 — Sauvegarde et restauration de la Preview avant cutover (pack générique)

| | |
|---|---|
| Cible | Preview `pgvvpqyjziyapbbkydmc` uniquement. **Jamais** `exhvuzegsefmoguxoiak`. |
| Où | un dossier **hors du dépôt** (`../elsatia-v9-backup-<date>`), jamais commité |
| Vérification | `node scripts/preview/v9/backup-manifest.mjs --dir <dossier>` puis `node scripts/preview/v9/backup-check.mjs <dossier>/manifest.json` |
| Consommé par | `v9-cutover.sh --backup-manifest <dossier>/manifest.json` (application refusée sans `BACKUP_DECLARED_OK`) |

## 1. Ce que la sauvegarde couvre — et ne couvre pas

| Artefact | Niveau | Fichier | Couvre | Ne couvre pas |
|---|---|---|---|---|
| Schéma | **REQUIRED** | `preview-schema.sql` | tables, fonctions, policies, droits des schémas applicatifs | données |
| Données applicatives | **REQUIRED** | `preview-data.sql` | lignes des schémas applicatifs (`public`, `platform`…) | Auth, Storage, ledger (schémas gérés par Supabase, exclus par défaut) |
| Utilisateurs Auth | **REQUIRED** | `preview-auth-data.sql` | `auth.users`, identités, facteurs MFA | mots de passe en clair (n'existent pas) ; configuration Auth du tableau de bord (SMTP, URL de redirection) → noter à la main |
| Table du ledger | **REQUIRED** | `preview-migrations-data.sql` | `supabase_migrations.schema_migrations` (`CURRENT_LEDGER` lignes) | — **Sans elle, une base restaurée a un ledger vide et `db push` rejouerait tout le train** (constaté sur le banc local) |
| Export du ledger | **REQUIRED** | `ledger-avant.json` | préfixe exact du train (`CURRENT_LEDGER`) + 813 originale (contrôlée par `backup-check`) | — |
| Rôles | RECOMMENDED | `preview-roles.sql` | rôles et droits personnalisés | rôles gérés par Supabase |
| Métadonnées Storage | RECOMMENDED | `preview-storage-data.sql` | `storage.buckets`, `storage.objects` (lignes) | **le contenu des fichiers** |
| Fichiers Storage | OPTIONAL | copie manuelle | objets (logos, pièces jointes de recette) | non requis : la V9 ne modifie aucun bucket |
| Sauvegarde du tableau de bord / PITR | OPTIONAL | identifiant consigné | restauration native Supabase | **plan gratuit : aucune** (runbook V3 STEP 3) → les dumps sont la seule restauration |
| Variables Vercel | RECOMMENDED | export de l'inventaire (noms) | liste et scopes | valeurs (jamais exportées par le pack) |

Ne pas prétendre sauvegarder ce qui n'est pas sauvegardé : le rapport d'exécution liste les
artefacts réellement présents (sortie de `backup-check`).

## 2. AVANT MIGRATION — commandes

Prérequis : projet lié (`npx supabase link --project-ref pgvvpqyjziyapbbkydmc`), garde verte
(`npm run preview:v9:guard -- --ref pgvvpqyjziyapbbkydmc --environment preview`),
`ELSATIA_PREVIEW_DB_URL` exportée dans le shell (jamais écrite dans un fichier du dépôt).

```bash
B=../elsatia-v9-backup-$(date +%F-%H%M); mkdir -p "$B"
npx supabase db dump --linked -f "$B/preview-schema.sql"
npx supabase db dump --linked --data-only -f "$B/preview-data.sql"
npx supabase db dump --linked --data-only --schema auth -f "$B/preview-auth-data.sql"
npx supabase db dump --linked --data-only --schema supabase_migrations -f "$B/preview-migrations-data.sql"
npx supabase db dump --linked --role-only -f "$B/preview-roles.sql"
npx supabase db dump --linked --data-only --schema storage -f "$B/preview-storage-data.sql"
PGOPTIONS='-c default_transaction_read_only=on' psql "$ELSATIA_PREVIEW_DB_URL" -X -At -v ON_ERROR_STOP=1 \
  -f docs/runbooks/sql/ELSATIA_V9_LEDGER_EXPORT.sql > "$B/ledger-brut.json"
node scripts/preview/v9/cutover-step.mjs ledger-tag pgvvpqyjziyapbbkydmc "$B/ledger-brut.json" "$B/ledger-avant.json"
node scripts/preview/v9/backup-manifest.mjs --dir "$B"
node scripts/preview/v9/backup-check.mjs "$B/manifest.json"
```

**Résultat attendu** : `BACKUP_DECLARED_OK`, les 5 lignes REQUIRED en ✓ (taille, sha256, contenu :
`CREATE TABLE`, `COPY public.…`, `auth.users`, `supabase_migrations.schema_migrations`, ledger
= `PREVIEW_LEDGER_PREFIX_OK`).

Si une commande `db dump --schema …` est refusée par la version de la CLI :
`DECISION_REQUIRED:V9-BACKUP-CLI` → repli `pg_dump "$ELSATIA_PREVIEW_DB_URL" --data-only -n <schéma> -f <fichier>`
(pg_dump de version ≥ celle du serveur), mêmes noms de fichiers. Ne pas poursuivre sans les 5
artefacts REQUIRED.

## 3. Vérifications (automatiques par `backup-check`)

| Contrôle | Règle |
|---|---|
| Projet | `project_ref` = `pgvvpqyjziyapbbkydmc` |
| Date | `created_at` = date du **plus ancien** fichier ; ≤ 12 h (option `--max-age-hours`) ; jamais dans le futur |
| Taille | > 0 ; = taille déclarée |
| Intégrité | sha256 = déclaré |
| Contenu | marqueur attendu présent dans chaque dump |
| Emplacement | **hors du dépôt** (sinon refus : risque de commit de données) |
| Ledger | export = préfixe exact du train avec migrations en attente, 813 originale prouvée ; `CURRENT_LEDGER` consigné |

À consigner dans le rapport d'exécution : chemin du dossier, `manifest.json` (sha256 de chaque
fichier), identifiant de sauvegarde Supabase s'il existe. Conserver le dossier **au moins jusqu'à
la clôture de la recette V9** (chiffré au repos si possible : il contient des données de recette
et les comptes Auth de la Preview).

## 4. Test de restauration (RECOMMENDED, local, sans toucher la Preview)

Prouvé sur le banc local du pack (PostgreSQL 16, dumps `pg_dump` équivalents) : schéma + données +
Auth + ledger restaurés, puis export du ledger restauré = `PREVIEW_LEDGER_PREFIX_OK` /
les mêmes `CURRENT_LEDGER` / `PENDING_MIGRATIONS` qu'avant le cutover (`check-ledger-v9.mjs --attendu-courant <n>`).

```bash
createdb elsatia_v9_restore_test
psql -X -v ON_ERROR_STOP=1 -d elsatia_v9_restore_test -f "$B/preview-schema.sql"
{ echo "set session_replication_role = replica;"; cat "$B/preview-auth-data.sql" "$B/preview-data.sql"; } \
  | psql -X -v ON_ERROR_STOP=1 -d elsatia_v9_restore_test
psql -X -v ON_ERROR_STOP=1 -d elsatia_v9_restore_test -f "$B/preview-migrations-data.sql"
psql -X -At -d elsatia_v9_restore_test -f docs/runbooks/sql/ELSATIA_V9_LEDGER_EXPORT.sql > /tmp/restore-ledger.json
node scripts/preview/v9/check-ledger-v9.mjs /tmp/restore-ledger.json --require-813-proof   # PREVIEW_LEDGER_PREFIX_OK
dropdb elsatia_v9_restore_test
```

Si `preview-data.sql` contient déjà `auth.users` (selon la version de la CLI), ne pas recharger
`preview-auth-data.sql` (doublons de clés). Limites : un dump `supabase db dump` d'un projet hébergé référence des rôles et extensions
Supabase (`supabase_admin`, `pgsodium`, `vault`…) absents d'un PostgreSQL nu : les erreurs de rôle
au chargement du schéma sur un poste local sont attendues ; le contrôle utile est le ledger et le
nombre de lignes des tables cœur. Le **seul** test de restauration complet est une restauration
dans un projet Supabase jetable (`DECISION_REQUIRED:V9-RESTORE-DRILL-PROJECT`, coût / quota du plan).

## 5. Restauration sur la Preview

Voir `ELSATIA_V9_PREVIEW_ROLLBACK.md` §4 : dernier recours, décision humaine, jamais scriptée par
le pack. Le classement par migration (dont les éventuelles `RESTORE_REQUIRED` et leurs notes) est généré dans
`docs/qualification/preview-pack/V9_MIGRATION_PLAN.generated.md` ; un retour code n'exige pas de restauration.
