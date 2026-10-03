#!/usr/bin/env bash
# ELSATIA — harnais d'upgrade Production → V9.x — PHASE K : fenêtre de compatibilité de l'ANCIEN code.
# Sur une copie jetable de la source 210, applique les migrations en attente UNE PAR UNE (même transaction
# + ledger que le harnais) et, après chacune, confronte le contrat base de l'ancien code Production
# (lib/old_code_contract.py) à l'état courant. Sortie : la première migration qui casse chaque accès, donc
# le dernier point du ledger jusqu'où un rollback « code seul » reste possible.
# Usage : scripts/upgrade/old-code-window.sh <base-source-210> <sha-cible> <sortie> [sha-ancien-code] [--bridge F]...
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
. "$HERE/lib/common.sh"
SRC="${1:?base source}"; SHA="${2:?sha cible}"; OUTW="${3:?sortie}"; shift 3
ANCIEN="fcdd4e7c90f32abb15502e825335659f9d57c9a1"
if [ $# -gt 0 ] && [[ "$1" != --* ]]; then ANCIEN="$1"; shift; fi
PONTS=(); while [ $# -gt 0 ]; do case "$1" in --bridge) PONTS+=("$2"); shift 2;; *) upg_die "option $1";; esac; done
upg_garde_locale "$SRC" "$SHA" "$OUTW"
mkdir -p "$OUTW"; chmod 777 "$OUTW"
DB="${SRC}_fen"; upg_nom_base "$DB"
upg_clone "$SRC" "$DB"
upg_extraire_migrations "$REPO" "$SHA" "$OUTW/target"; MIG="$OUTW/target/supabase/migrations"
for p in "${PONTS[@]}"; do cp "$p" "$MIG/"; done
upg_ledger "$DB" > "$OUTW/ledger.txt"
: > "$OUTW/fenetre.tsv"
python3 "$HERE/lib/old_code_contract.py" "$REPO" "$ANCIEN" "$SRC" "$DB" "$OUTW/c_000.json" > /dev/null
i=0
for f in "$MIG"/*.sql; do
  b=$(basename "$f" .sql); v=${b%%_*}
  grep -qx "$v" "$OUTW/ledger.txt" && continue
  i=$((i+1))
  { upg_contenu_migration "$f" | python3 "$HERE/lib/strip_txn.py"; echo; echo "insert into supabase_migrations.schema_migrations(version, name) values ('$v', '${b#*_}');"; } \
    | su postgres -c "psql -X -q -1 -v ON_ERROR_STOP=1 -d $DB" >/dev/null 2>"$OUTW/err" || { cat "$OUTW/err"; upg_die "migration $b"; }
  python3 "$HERE/lib/old_code_contract.py" "$REPO" "$ANCIEN" "$SRC" "$DB" "$OUTW/c.json" > /dev/null
  n=$(python3 -c "import json;print(len(json.load(open('$OUTW/c.json')).get('CASSE_PAR_UPGRADE',[])))")
  printf '%s\t%s\t%s\n' "$i" "$b" "$n" >> "$OUTW/fenetre.tsv"
  [ "$n" != "${prec:-0}" ] && { echo "  après #$i $b : $n accès de l'ancien code cassé(s)"; cp "$OUTW/c.json" "$OUTW/c_$(printf %03d $i).json"; }
  prec=$n
done
premiere=$(awk -F'\t' '$3>0{print $2; exit}' "$OUTW/fenetre.tsv")
derniere_ok=$(awk -F'\t' '$3>0{exit} {d=$2} END{print d}' "$OUTW/fenetre.tsv")
echo "Fenêtre de rollback « code seul » : sûre jusqu'à ${derniere_ok:-(aucune migration)} ; première migration cassante : ${premiere:-aucune}"
upg_drop "$DB"
