#!/usr/bin/env bash
# Train canonique V3 — exécute des suites pgTAP, chacune sur une copie neuve d'une base modèle.
# Rapport : docs/qualification/ELSATIA_CANONICAL_TRAIN_V3_FINAL_CONVERGENCE.md
#
# Usage : scripts/qualification/pgtap-run-v3.sh <base-modèle> [motif-glob ...]
#   base-modèle : base déjà migrée (scripts/local-postgres-bootstrap/rebuild_db.sh <nom>).
#   motif-glob  : fichiers de supabase/tests (défaut : *.test.sql).
# Sortie (une ligne par fichier) : <fichier> plan=<N> ok=<n> not_ok=<n> erreurs=<n> [PROPRE|NON_PROPRE]
# Journaux détaillés : $PGTAP_OUT (défaut : dossier temporaire), un fichier par suite.
# À lancer en root (bascule sur postgres, authentification pair, comme rebuild_db.sh).
set -uo pipefail
TPL="${1:?usage: pgtap-run-v3.sh <base-modèle> [motif ...]}"; shift
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTS="$(cd "$HERE/../../supabase/tests" && pwd)"
OUT="${PGTAP_OUT:-$(mktemp -d)}"; mkdir -p "$OUT"; chmod 777 "$OUT" 2>/dev/null || true
[ $# -eq 0 ] && set -- "*.test.sql"
pg() { runuser -u postgres -- psql -X -q "$@"; }
tot_ok=0; tot_ko=0; propres=0; n=0
cd "$TESTS"
for motif in "$@"; do
  for f in $motif; do
    [ -f "$f" ] || continue
    n=$((n+1)); t="${f%.test.sql}"; db="tap_${n}_$$"
    pg -c "drop database if exists \"$db\"" >/dev/null 2>&1
    pg -c "create database \"$db\" template \"$TPL\"" >/dev/null
    pg -c "alter database \"$db\" set search_path = public, extensions" >/dev/null
    runuser -u postgres -- psql -X -q -At -d "$db" -f "$TESTS/$f" > "$OUT/$t.log" 2>&1
    plan=$(grep -oE '^1\.\.[0-9]+' "$OUT/$t.log" | head -1 | cut -c4-)
    ok=$(grep -cE '^ok ' "$OUT/$t.log"); ko=$(grep -cE '^not ok ' "$OUT/$t.log")
    err=$(grep -cE 'ERROR:' "$OUT/$t.log")
    etat=NON_PROPRE
    if [ -n "$plan" ] && [ "$ok" = "$plan" ] && [ "$ko" = 0 ] && [ "$err" = 0 ]; then etat=PROPRE; propres=$((propres+1)); fi
    echo "$t plan=${plan:-?} ok=$ok not_ok=$ko erreurs=$err $etat"
    tot_ok=$((tot_ok+ok)); tot_ko=$((tot_ko+ko))
    pg -c "drop database if exists \"$db\"" >/dev/null 2>&1
  done
done
echo "TOTAL fichiers=$n propres=$propres ok=$tot_ok not_ok=$tot_ko journaux=$OUT"
