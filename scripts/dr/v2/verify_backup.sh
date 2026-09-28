#!/usr/bin/env bash
# DR V2 — vérification d'une sauvegarde (backup.sh) : lisible ET restaurable à l'identique.
#
# Usage : scripts/dr/v2/verify_backup.sh <dossier-backup> [base-de-test]
#
#   1. SHA256SUMS + sha256 du manifeste ;
#   2. manifest.json valide, backup_id cohérent avec le dossier ;
#   3. pg_restore --list (table des matières lisible, nombre d'entrées = manifeste) ;
#   4. restauration de test dans une base jetable (défaut elsatia_dr_v2_verify), instantané,
#      comparaison STRICTE à snapshot.json de la sauvegarde, puis dépôt de la base de test.
#
# Une sauvegarde n'est déclarée valide qu'après restauration effective (4) : un fichier
# lisible n'est pas une sauvegarde restaurable.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

SRC="${1:?usage: verify_backup.sh <dossier-backup> [base-de-test]}"
TEST_DB="${2:-elsatia_dr_v2_verify}"
dr2_garde "$TEST_DB" drill

T0=$(dr2_now)
(cd "$SRC" && sha256sum --quiet -c SHA256SUMS) || dr2_die "SHA256SUMS : ÉCHEC"
jq -e '.backup_id and .fichiers["db.dump"].sha256 and .pg_dump_toc_entrees' "$SRC/manifest.json" >/dev/null || dr2_die "manifeste invalide"
[[ "$(jq -r .backup_id "$SRC/manifest.json")" == "$(basename "$SRC")" ]] || dr2_die "backup_id ≠ nom du dossier"
TOC=$(pg_restore --list "$SRC/db.dump" | grep -cvE '^;|^$')
dr2_log "intégrité OK, manifeste OK, TOC lisible ($TOC entrées)"
DUREE_RESTORE=$("$DR2_HERE/restore.sh" "$SRC" "$TEST_DB" --force)
python3 "$DR2_HERE/snapshot.py" "$TEST_DB" "$SRC/../verify_$(basename "$SRC").json" >&2
python3 "$DR2_HERE/compare.py" "$SRC/snapshot.json" "$SRC/../verify_$(basename "$SRC").json" >&2 || dr2_die "restauration de test ≠ sauvegarde"
dr2_db_drop "$TEST_DB"
T1=$(dr2_now)
dr2_log "SAUVEGARDE VALIDE : $(basename "$SRC") (restauration de test ${DUREE_RESTORE}s, vérification totale $(dr2_dur "$T0" "$T1")s)"
echo "$DUREE_RESTORE $(dr2_dur "$T0" "$T1")"
