#!/usr/bin/env bash
# Restaure une sauvegarde produite par 05_backup.sh sur une base LOCALE
# JETABLE. Simule la catastrophe : dépose la base cible, la recrée vierge,
# recharge les rôles cluster puis le dump.
#
# Usage:
#   scripts/dr/06_restore.sh <répertoire-backup> [--target-db NOM] [--force]
#
#   <répertoire-backup>   Dossier produit par 05_backup.sh (contient
#                          backup_index.json, elsatia_dr_drill.dump, roles.sql)
#   --target-db NOM        Base à (re)créer (défaut: DR_PGDATABASE)
#   --force                Nécessaire si la base cible existe déjà et
#                           contient des données (protection anti-écrasement
#                           accidentel — cf. mission §7 "restore sur schéma
#                           non vide").
#
# Refuse toute cible non locale (voir dr_require_local_target). Vérifie le
# sha256 du dump avant de restaurer quoi que ce soit (voir mission §7
# "backup tronqué" / "mauvais fichier").
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
source lib/common.sh

usage() { sed -n '2,20p' "${BASH_SOURCE[0]}"; }

BACKUP_DIR=""
FORCE=0
TARGET_DB="$DR_PGDATABASE"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --force) FORCE=1; shift ;;
    --target-db) TARGET_DB="$2"; shift 2 ;;
    *) if [[ -z "$BACKUP_DIR" ]]; then BACKUP_DIR="$1"; shift; else dr_die "Argument inconnu: $1"; fi ;;
  esac
done
[[ -n "$BACKUP_DIR" ]] || { usage; dr_die "Répertoire de backup requis."; }

DR_PGDATABASE="$TARGET_DB"
dr_require_local_target

INDEX_FILE="$BACKUP_DIR/backup_index.json"
DUMP_FILE="$BACKUP_DIR/elsatia_dr_drill.dump"
ROLES_FILE="$BACKUP_DIR/roles.sql"

[[ -f "$INDEX_FILE" ]] || dr_die "Index de backup introuvable: $INDEX_FILE (mauvais répertoire ?)"
[[ -f "$DUMP_FILE" ]] || dr_die "Dump introuvable: $DUMP_FILE"
[[ -f "$ROLES_FILE" ]] || dr_die "Fichier rôles introuvable: $ROLES_FILE"

command -v jq >/dev/null 2>&1 || dr_die "jq requis pour lire l'index de backup."

EXPECTED_SHA=$(jq -r '.fichiers.dump.sha256' "$INDEX_FILE")
[[ -n "$EXPECTED_SHA" && "$EXPECTED_SHA" != "null" ]] || dr_die "Index de backup invalide: sha256 du dump absent."

dr_log "Vérification d'intégrité du dump (sha256)..."
ACTUAL_SHA=$(sha256sum "$DUMP_FILE" | awk '{print $1}')
if [[ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]]; then
  dr_die "ECHEC INTEGRITE: sha256 attendu=$EXPECTED_SHA obtenu=$ACTUAL_SHA. Dump tronqué/corrompu/substitué : restauration refusée."
fi
dr_log "Intégrité OK ($ACTUAL_SHA)."

# pg_restore refuse un fichier qui n'est pas un dump custom valide, mais on
# vérifie explicitement l'en-tête pour donner un message clair (mission §7
# "mauvais fichier").
if ! PGPASSWORD="${DR_PGPASSWORD:-}" pg_restore --list "$DUMP_FILE" >/dev/null 2>"/tmp/dr_restore_list_error.$$"; then
  dr_log "Le fichier n'est pas un dump pg_dump --format=custom valide :"
  cat "/tmp/dr_restore_list_error.$$" >&2
  rm -f "/tmp/dr_restore_list_error.$$"
  dr_die "Restauration refusée (fichier invalide)."
fi
rm -f "/tmp/dr_restore_list_error.$$"

EXISTS=$(dr_psql_db postgres -tAc "select 1 from pg_database where datname='$TARGET_DB'")
if [[ "$EXISTS" == "1" ]]; then
  ROWCOUNT=$(dr_psql_db "$TARGET_DB" -tAc "select count(*) from information_schema.tables where table_schema='public'" 2>/dev/null || echo "0")
  if [[ "$ROWCOUNT" != "0" && "$FORCE" != "1" ]]; then
    dr_die "La base '$TARGET_DB' existe déjà et contient $ROWCOUNT table(s). Utilisez --force pour l'écraser (restauration destructive assumée)."
  fi
  dr_log "Suppression de la base existante '$TARGET_DB'."
  dr_psql_db postgres -c "drop database \"$TARGET_DB\";"
fi

T0=$(date +%s.%N)
dr_log "1/3 Rechargement des rôles cluster (roles.sql)."
PGPASSWORD="${DR_PGPASSWORD:-}" psql -X -v ON_ERROR_STOP=0 -h "$DR_PGHOST" -p "$DR_PGPORT" -U "$DR_PGUSER" -d postgres -f "$ROLES_FILE" >/tmp/dr_roles_restore.$$ 2>&1 || true
# ON_ERROR_STOP=0 ici : roles.sql peut légitimement re-déclarer des rôles
# déjà présents sur le cluster (ex: 'postgres' lui-même) -> on log mais on
# ne bloque pas pour ce cas précis, uniquement pour l'absence du fichier.
grep -vi "already exists" /tmp/dr_roles_restore.$$ >&2 || true
rm -f /tmp/dr_roles_restore.$$

dr_log "2/3 Création de la base vierge '$TARGET_DB'."
dr_psql_db postgres -c "create database \"$TARGET_DB\";"

dr_log "3/3 pg_restore du dump."
PGPASSWORD="${DR_PGPASSWORD:-}" pg_restore -h "$DR_PGHOST" -p "$DR_PGPORT" -U "$DR_PGUSER" -d "$TARGET_DB" \
  --no-owner --role="$DR_PGUSER" -j 2 "$DUMP_FILE"
T1=$(date +%s.%N)

DUR=$(awk -v a="$T0" -v b="$T1" 'BEGIN{printf "%.2f", b-a}')
dr_log "OK: restauration de '$TARGET_DB' terminée en ${DUR}s depuis $BACKUP_DIR"
