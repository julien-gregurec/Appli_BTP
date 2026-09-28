#!/usr/bin/env bash
# DR V2 — restauration d'une sauvegarde (backup.sh) dans une base locale jetable.
#
# Usage : scripts/dr/v2/restore.sh <dossier-backup> <base-cible> [--force]
#
#   1. intégrité : sha256 de chaque fichier (SHA256SUMS) ET du dump déclaré au manifeste ;
#   2. lisibilité : pg_restore --list, nombre d'entrées = manifeste ;
#   3. refus d'écraser une base existante non vide sans --force ;
#   4. rôles du cluster (roles.sql, idempotent), base vierge, pg_restore --exit-on-error
#      (propriétaires et ACL conservés), réglages de base (db_settings.sql), ANALYZE.
#
# Affiche la durée de restauration (secondes) sur la sortie standard.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

SRC="${1:?usage: restore.sh <dossier-backup> <base-cible> [--force]}"
CIBLE="${2:?usage: restore.sh <dossier-backup> <base-cible> [--force]}"
FORCE="${3:-}"
dr2_garde "$CIBLE" drill

[[ -f "$SRC/manifest.json" && -f "$SRC/SHA256SUMS" && -f "$SRC/db.dump" ]] || dr2_die "dossier de sauvegarde incomplet : $SRC"
(cd "$SRC" && sha256sum --quiet -c SHA256SUMS) || dr2_die "ECHEC INTEGRITE (SHA256SUMS) : restauration refusée"
ATTENDU=$(jq -r '.fichiers["db.dump"].sha256' "$SRC/manifest.json")
[[ "$(sha256sum "$SRC/db.dump" | cut -d' ' -f1)" == "$ATTENDU" ]] || dr2_die "ECHEC INTEGRITE (manifeste) : restauration refusée"
TOC=$(pg_restore --list "$SRC/db.dump" 2>/dev/null | grep -cvE '^;|^$' || true)
[[ "$TOC" == "$(jq -r '.pg_dump_toc_entrees' "$SRC/manifest.json")" ]] || dr2_die "dump illisible ou incomplet (TOC $TOC ≠ manifeste)"

if dr2_db_existe "$CIBLE"; then
  N=$(dr2_psqla "$CIBLE" -c "select count(*) from information_schema.tables where table_schema = 'public'")
  if [[ "$N" != "0" && "$FORCE" != "--force" ]]; then
    dr2_die "la base '$CIBLE' existe et contient $N tables : --force requis (restauration destructive assumée)"
  fi
fi

T0=$(dr2_now)
dr2_db_drop "$CIBLE"
# Rôles du cluster : les CREATE ROLE déjà présents échouent sans conséquence ; les ALTER
# ROLE réappliquent les attributs sauvegardés (bypassrls, login…).
dr2_psql postgres -v ON_ERROR_STOP=0 < "$SRC/roles.sql" 2>&1 | grep -vE 'already exists|^$' >&2 || true
dr2_psql postgres -c "create database \"$CIBLE\"" >/dev/null
chmod 644 "$SRC/db.dump"; chmod 755 "$SRC"
dr2_pg_restore -d "$CIBLE" --exit-on-error -j 4 "$SRC/db.dump" || dr2_die "pg_restore en échec : base '$CIBLE' à considérer comme INVALIDE"
sed "s/__BASE__/$CIBLE/g" "$SRC/db_settings.sql" | dr2_psql postgres >/dev/null
dr2_psql "$CIBLE" -c "analyze" >/dev/null
T1=$(dr2_now)
dr2_log "OK restauration $(jq -r .backup_id "$SRC/manifest.json") → $CIBLE en $(dr2_dur "$T0" "$T1") s"
dr2_dur "$T0" "$T1"
