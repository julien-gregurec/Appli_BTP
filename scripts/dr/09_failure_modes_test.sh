#!/usr/bin/env bash
# Harnais de tests des modes de défaillance (mission DR EXACT-TIP V2 §7).
# Vérifie que 06_restore.sh échoue PROPREMENT (message clair, code de sortie
# non nul, aucune destruction silencieuse) sur chaque scénario, plutôt que
# de supposer que "pg_restore a tourné" veut dire "la restauration a
# réussi".
#
# Usage: scripts/dr/09_failure_modes_test.sh
#
# Utilise une base cible dédiée (elsatia_dr_drill_failtest, jamais la base
# de drill principale) pour ne jamais interférer avec un jeu de données déjà
# validé. Nécessite qu'un backup valide existe déjà (voir 05_backup.sh) ---
# passer son chemin en argument, sinon le dernier backup de DR_BACKUP_DIR
# est utilisé.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
source lib/common.sh
# lib/common.sh impose "set -euo pipefail" (utile pour les scripts qui
# doivent s'arrêter au premier pépin) ; ce harnais de tests fait l'inverse
# par nature : il APPELLE des commandes censées échouer et doit continuer
# ensuite pour vérifier chaque scénario. On désactive donc errexit ici,
# après le source, sciemment et seulement dans ce script.
set +e

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  sed -n '2,15p' "${BASH_SOURCE[0]}"; exit 0
fi

BACKUP_DIR="${1:-}"
if [[ -z "$BACKUP_DIR" ]]; then
  BASE_DIR="${DR_BACKUP_DIR:-/tmp/elsatia-dr-backups}"
  BACKUP_DIR="$BASE_DIR/$(ls -1 "$BASE_DIR" 2>/dev/null | sort | tail -1)"
fi
[[ -f "$BACKUP_DIR/backup_index.json" ]] || dr_die "Backup de référence introuvable: $BACKUP_DIR (passez un chemin explicite)."

export DR_PGDATABASE="elsatia_dr_drill_failtest"
dr_require_local_target

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

PASS=0
FAIL=0

check() {
  local label="$1" expect_fail="$2" actual_exit="$3"
  if [[ "$expect_fail" == "1" && "$actual_exit" != "0" ]]; then
    echo "[PASS] $label (a échoué comme attendu, code=$actual_exit)"
    PASS=$((PASS+1))
  elif [[ "$expect_fail" == "0" && "$actual_exit" == "0" ]]; then
    echo "[PASS] $label (a réussi comme attendu)"
    PASS=$((PASS+1))
  else
    echo "[FAIL] $label (code=$actual_exit, attendu: $( [[ $expect_fail == 1 ]] && echo 'échec' || echo 'succès' ))"
    FAIL=$((FAIL+1))
  fi
}

dr_psql_db postgres -c "drop database if exists \"$DR_PGDATABASE\";" >/dev/null

echo "--- Scénario 1: dump tronqué ---"
mkdir -p "$WORKDIR/s1"
cp "$BACKUP_DIR/roles.sql" "$WORKDIR/s1/"
head -c 2000 "$BACKUP_DIR/elsatia_dr_drill.dump" > "$WORKDIR/s1/elsatia_dr_drill.dump"
ORIG_SHA=$(jq -r '.fichiers.dump.sha256' "$BACKUP_DIR/backup_index.json")
jq --arg sha "$ORIG_SHA" '.fichiers.dump.sha256=$sha' "$BACKUP_DIR/backup_index.json" > "$WORKDIR/s1/backup_index.json"
./06_restore.sh "$WORKDIR/s1" --force >/tmp/dr_fail_s1.log 2>&1
check "backup tronqué détecté par le sha256 (mismatch attendu)" 1 $?
grep -q "ECHEC INTEGRITE" /tmp/dr_fail_s1.log && echo "    -> message d'erreur clair confirmé"

echo "--- Scénario 2: mauvais fichier (pas un dump pg_dump) ---"
mkdir -p "$WORKDIR/s2"
cp "$BACKUP_DIR/roles.sql" "$WORKDIR/s2/"
echo "ceci n'est pas un dump postgres" > "$WORKDIR/s2/elsatia_dr_drill.dump"
BAD_SHA=$(sha256sum "$WORKDIR/s2/elsatia_dr_drill.dump" | awk '{print $1}')
jq --arg sha "$BAD_SHA" '.fichiers.dump.sha256=$sha' "$BACKUP_DIR/backup_index.json" > "$WORKDIR/s2/backup_index.json"
./06_restore.sh "$WORKDIR/s2" --force >/tmp/dr_fail_s2.log 2>&1
check "mauvais fichier détecté (intégrité OK mais pas un dump valide)" 1 $?
grep -q "fichier invalide" /tmp/dr_fail_s2.log && echo "    -> message d'erreur clair confirmé"

echo "--- Scénario 3: mauvais mot de passe ---"
DR_PGPASSWORD_SAVE="${DR_PGPASSWORD:-}"
DR_PGPASSWORD="mot_de_passe_incorrect" ./06_restore.sh "$BACKUP_DIR" --force >/tmp/dr_fail_s3.log 2>&1
check "mauvais mot de passe rejeté par PostgreSQL" 1 $?
export DR_PGPASSWORD="$DR_PGPASSWORD_SAVE"

echo "--- Scénario 4: restore sur schéma non vide sans --force ---"
./06_restore.sh "$BACKUP_DIR" >/tmp/dr_fail_s4.log 2>&1
check "première restauration (base absente, doit réussir)" 0 $?
./06_restore.sh "$BACKUP_DIR" >/tmp/dr_fail_s4b.log 2>&1
check "seconde restauration SANS --force sur base non vide refusée" 1 $?
grep -q "\-\-force" /tmp/dr_fail_s4b.log && echo "    -> message pointe vers --force"

echo "--- Scénario 5: restore partiel (dump coupé en plein milieu du contenu) ---"
mkdir -p "$WORKDIR/s5"
cp "$BACKUP_DIR/roles.sql" "$WORKDIR/s5/"
FULL_SIZE=$(stat -c%s "$BACKUP_DIR/elsatia_dr_drill.dump")
HALF=$((FULL_SIZE / 2))
head -c "$HALF" "$BACKUP_DIR/elsatia_dr_drill.dump" > "$WORKDIR/s5/elsatia_dr_drill.dump"
HALF_SHA=$(sha256sum "$WORKDIR/s5/elsatia_dr_drill.dump" | awk '{print $1}')
jq --arg sha "$HALF_SHA" '.fichiers.dump.sha256=$sha' "$BACKUP_DIR/backup_index.json" > "$WORKDIR/s5/backup_index.json"
./06_restore.sh "$WORKDIR/s5" --force >/tmp/dr_fail_s5.log 2>&1
check "dump coupé en plein contenu: sha256 recalculé sur le fichier coupé passe, mais pg_restore --list/l'exécution doit échouer" 1 $?

echo "--- Scénario 6: double restauration consécutive AVEC --force (idempotence) ---"
./06_restore.sh "$BACKUP_DIR" --force >/tmp/dr_fail_s6a.log 2>&1
check "premier restore --force" 0 $?
./06_restore.sh "$BACKUP_DIR" --force >/tmp/dr_fail_s6b.log 2>&1
check "second restore --force consécutif (doit re-réussir, pas de corruption cumulative)" 0 $?

dr_psql_db postgres -c "drop database if exists \"$DR_PGDATABASE\";" >/dev/null

echo
echo "=== Résultat: $PASS test(s) conformes, $FAIL non conforme(s) ==="
[[ "$FAIL" == "0" ]]
