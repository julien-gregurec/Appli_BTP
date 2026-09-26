#!/usr/bin/env bash
# Sauvegarde reproductible de la base DR locale : pg_dump (format custom,
# compressé), rôles/schéma cluster (pg_dumpall --roles-only), et un manifeste
# de vérification (04_manifest.sh). Les trois fichiers partagent un même
# backup_id et sont liés par un fichier d'index JSON, sur le même principe
# que ELSATIA_GP_CUTOVER_DAY_OF_RUNBOOK_V1.md (backup_id + horodatage UTC
# reliant DB et Storage).
#
# Usage:
#   scripts/dr/05_backup.sh [--out-dir DIR]
#
#   --out-dir DIR   Répertoire de sortie (défaut: DR_BACKUP_DIR ou
#                    /tmp/elsatia-dr-backups — jamais dans le dépôt git : ce
#                    sont des données, pas du code).
#
# Ne contient aucun secret en dur : le mot de passe vient de DR_PGPASSWORD
# (variable d'environnement), jamais d'une valeur écrite dans ce fichier.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
source lib/common.sh

usage() { sed -n '2,17p' "${BASH_SOURCE[0]}"; }

OUT_DIR="${DR_BACKUP_DIR:-/tmp/elsatia-dr-backups}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --out-dir) OUT_DIR="$2"; shift 2 ;;
    *) dr_die "Argument inconnu: $1 (voir --help)" ;;
  esac
done

dr_require_local_target

BACKUP_ID="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$OUT_DIR/$BACKUP_ID"
mkdir -p "$DEST"
dr_log "backup_id=$BACKUP_ID -> $DEST"

DUMP_FILE="$DEST/elsatia_dr_drill.dump"
ROLES_FILE="$DEST/roles.sql"
MANIFEST_FILE="$DEST/manifest.json"
INDEX_FILE="$DEST/backup_index.json"

T0=$(date +%s.%N)
dr_log "1/3 pg_dump --format=custom --compress=9 (schéma + données + policies RLS)"
## --no-owner/--no-privileges seraient plus simples à restaurer mais
## effaceraient les GRANTs vers anon/authenticated/service_role : or ce
## sont ces GRANTs (avec les policies RLS) qui matérialisent l'isolation
## multi-tenant. On les conserve pour que la restauration soit une preuve
## fidèle, pas juste des données réimportées dans un schéma dégradé.
PGPASSWORD="${DR_PGPASSWORD:-}" pg_dump -h "$DR_PGHOST" -p "$DR_PGPORT" -U "$DR_PGUSER" -d "$DR_PGDATABASE" \
  --format=custom --compress=9 \
  --file="$DUMP_FILE"
T1=$(date +%s.%N)

dr_log "2/3 pg_dumpall --roles-only (rôles cluster: anon/authenticated/service_role/...)"
PGPASSWORD="${DR_PGPASSWORD:-}" pg_dumpall -h "$DR_PGHOST" -p "$DR_PGPORT" -U "$DR_PGUSER" \
  --roles-only --no-role-passwords > "$ROLES_FILE"
T2=$(date +%s.%N)

dr_log "3/3 manifeste de vérification (comptages + checksums)"
./04_manifest.sh "$MANIFEST_FILE"
T3=$(date +%s.%N)

DUMP_SHA256=$(sha256sum "$DUMP_FILE" | awk '{print $1}')
ROLES_SHA256=$(sha256sum "$ROLES_FILE" | awk '{print $1}')
DUMP_SIZE=$(stat -c%s "$DUMP_FILE" 2>/dev/null || stat -f%z "$DUMP_FILE")

DUR_DUMP=$(awk -v a="$T0" -v b="$T1" 'BEGIN{printf "%.2f", b-a}')
DUR_ROLES=$(awk -v a="$T1" -v b="$T2" 'BEGIN{printf "%.2f", b-a}')
DUR_MANIFEST=$(awk -v a="$T2" -v b="$T3" 'BEGIN{printf "%.2f", b-a}')
DUR_TOTAL=$(awk -v a="$T0" -v b="$T3" 'BEGIN{printf "%.2f", b-a}')

cat > "$INDEX_FILE" <<EOF
{
  "backup_id": "$BACKUP_ID",
  "cree_le": "$(date -u +%FT%TZ)",
  "source_base": "$DR_PGDATABASE",
  "fichiers": {
    "dump": {"chemin": "elsatia_dr_drill.dump", "sha256": "$DUMP_SHA256", "taille_octets": $DUMP_SIZE},
    "roles": {"chemin": "roles.sql", "sha256": "$ROLES_SHA256"},
    "manifest": {"chemin": "manifest.json"}
  },
  "durees_secondes": {
    "pg_dump": $DUR_DUMP,
    "pg_dumpall_roles": $DUR_ROLES,
    "manifest": $DUR_MANIFEST,
    "total": $DUR_TOTAL
  }
}
EOF

dr_log "OK backup_id=$BACKUP_ID taille=${DUMP_SIZE}o durée_totale=${DUR_TOTAL}s"
dr_log "Index: $INDEX_FILE"
echo "$DEST"
