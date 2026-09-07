#!/usr/bin/env bash
# ELSATIA — Commandes de sauvegarde pré-cutover (B1 → B7).
#
# CE SCRIPT NE S'EXECUTE PAS TEL QUEL : il documente les commandes exactes.
# Chaque bloc est volontairement inerte (echo). Retirer le "echo" au moment du
# cutover réel, après validation du gate G1 par le rôle C.
#
# Prérequis opérateur : psql / pg_dump / pg_restore dans le PATH (voir §5 du rapport).
set -euo pipefail

# --- BACKUP_ID canonique -----------------------------------------------------
# Format : ELSATIA-PROD-CUTOVER-YYYYMMDD-HHMM  (heure locale Europe/Paris)
BACKUP_ID="ELSATIA-PROD-CUTOVER-$(date +%Y%m%d-%H%M)"
DEST="/Volumes/ELSATIA-DEV/backups/${BACKUP_ID}"
echo "BACKUP_ID = ${BACKUP_ID}"
echo "DEST      = ${DEST}"
# mkdir -p "${DEST}"

# PROD_DB_URL doit être fourni par l'opérateur au moment du cutover,
# JAMAIS écrit dans un fichier versionné.
: "${PROD_DB_URL:?definir PROD_DB_URL dans le shell, sans le committer}"

# --- B1 : snapshot managé Supabase ------------------------------------------
# Déclenché depuis le dashboard Supabase (Database > Backups).
# Nécessite le plan Pro. Noter l'identifiant du snapshot dans le journal.
echo "B1 : declencher le snapshot manage puis relever son identifiant -> ${DEST}/B1_snapshot_id.txt"

# --- B2 : dump logique complet, chiffré -------------------------------------
echo "B2 :"
echo "  pg_dump --format=custom --no-owner --no-privileges \"\$PROD_DB_URL\" \\"
echo "    | openssl enc -aes-256-cbc -pbkdf2 -iter 300000 -salt \\"
echo "        -out \"${DEST}/B2_${BACKUP_ID}.dump.enc\""
echo "  # empreinte de contrôle :"
echo "  shasum -a 256 \"${DEST}/B2_${BACKUP_ID}.dump.enc\" > \"${DEST}/B2_${BACKUP_ID}.sha256\""

# --- B3 : Storage ------------------------------------------------------------
# 13 buckets. Au dernier inventaire : 0 objet réel, seul entreprise-assets public.
echo "B3 :"
echo "  npx supabase storage ls --linked --recursive > \"${DEST}/B3_storage_inventaire.txt\""
echo "  # si des objets existent : npx supabase storage cp --linked -r ss:///<bucket> \"${DEST}/B3_storage/<bucket>\""

# --- B4 : métadonnées Auth ---------------------------------------------------
echo "B4 :"
echo "  pg_dump --format=plain --no-owner --schema=auth \"\$PROD_DB_URL\" \\"
echo "    | openssl enc -aes-256-cbc -pbkdf2 -iter 300000 -salt \\"
echo "        -out \"${DEST}/B4_auth_${BACKUP_ID}.sql.enc\""

# --- B5 : état pré-migration (ledger + sentinelles) --------------------------
echo "B5 :"
echo "  psql \"\$PROD_DB_URL\" -f scripts/cutover/sentinels-pre-migration.sql \\"
echo "    > \"${DEST}/B5_sentinelles_avant.txt\" 2>&1"
echo "  psql \"\$PROD_DB_URL\" -c \\"
echo "    \"copy (select version from supabase_migrations.schema_migrations order by version) to stdout\" \\"
echo "    > \"${DEST}/B5_ledger_avant.txt\""

# --- B6 : journal du backup_id ----------------------------------------------
echo "B6 :"
echo "  { echo \"backup_id=${BACKUP_ID}\";"
echo "    echo \"cible_code=996be15\";"
echo "    echo \"ledger_avant=\$(wc -l < ${DEST}/B5_ledger_avant.txt)\";"
echo "    echo \"operateur=<A>\"; echo \"decideur=<C>\"; } > \"${DEST}/B6_manifest.txt\""

# --- B7 : restauration de test (base jetable, JAMAIS Production) ------------
echo "B7 :"
echo "  createdb elsatia_restore_test"
echo "  openssl enc -d -aes-256-cbc -pbkdf2 -iter 300000 \\"
echo "    -in \"${DEST}/B2_${BACKUP_ID}.dump.enc\" \\"
echo "    | pg_restore --no-owner --no-privileges -d elsatia_restore_test"
echo "  psql -d elsatia_restore_test -c 'select count(*) from supabase_migrations.schema_migrations;'"
echo "  # ATTENDU : 210 — sinon la sauvegarde B2 est invalide -> STOP"
