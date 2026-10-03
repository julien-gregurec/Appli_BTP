#!/usr/bin/env bash
# Train canonique V9.2 — intégrité de l'arbre de migrations.
#  1. les migrations de V9.1 (24a0c2e9) sont présentes et identiques à l'octet ;
#  2. chaque migration ajoutée provient d'un lot qualifié, identique à l'octet (nom conservé
#     ou renuméroté selon renumerotation-preuve.sh) ;
#  3. versions strictement croissantes, uniques, toutes > dernière V9.1 (aucune insertion).
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"; cd "$REPO"
BASE=24a0c2e993ec0836b492ea72f27ed7dc347a20fa
GP=d617f7ecef01c966a2d9a4abb3e92cb5563d4d57
PERF=a9b46f011915961cba6f1668d74ee3d71208a9b5
PLAT=2cd5ca6eea19d03371f0eca38dfaf689269b174a
ko=0
base_list=$(git ls-tree --name-only "$BASE" supabase/migrations/ | sed 's#.*/##')
nb_base=0
for f in $base_list; do
  nb_base=$((nb_base+1))
  if [ ! -f "supabase/migrations/$f" ]; then echo "ABSENTE_V91 $f"; ko=1; continue; fi
  [ "$(git show "$BASE:supabase/migrations/$f" | sha256sum)" = "$(sha256sum < "supabase/migrations/$f")" ] || { echo "MODIFIEE_V91 $f"; ko=1; }
done
derniere_base=$(echo "$base_list" | tail -1 | cut -c1-14)
echo "V9.1 : $nb_base migrations vérifiées à l'octet (dernière $derniere_base)"
declare -A RENUM=([20261003001501_push_file_durable_v1.sql]=20261003000101_push_file_durable_v1.sql
 [20261003001502_relances_auto_candidats_eligibles_v1.sql]=20261003000201_relances_auto_candidats_eligibles_v1.sql
 [20261003001503_rls_ensembles_entreprises_autorisees_v1.sql]=20261003000301_rls_ensembles_entreprises_autorisees_v1.sql
 [20261003001504_taches_chantier_created_idx_v1.sql]=20261003000401_taches_chantier_created_idx_v1.sql)
for p in supabase/migrations/*.sql; do
  f=$(basename "$p"); echo "$base_list" | grep -qx "$f" && continue
  src=""; nom="$f"; [ -n "${RENUM[$f]:-}" ] && nom="${RENUM[$f]}"
  for spec in "GP:$GP" "PERF:$PERF" "PLATFORM:$PLAT"; do
    ref=${spec#*:}
    if git cat-file -e "$ref:supabase/migrations/$nom" 2>/dev/null && ! git cat-file -e "$BASE:supabase/migrations/$nom" 2>/dev/null; then
      if [ "$(git show "$ref:supabase/migrations/$nom" | sha256sum)" = "$(sha256sum < "$p")" ]; then src="${spec%%:*}"; break; fi
    fi
  done
  if [ -z "$src" ]; then echo "ORIGINE_INCONNUE $f"; ko=1; else echo "AJOUT $f <= $src:$nom"; fi
  [ "${f:0:14}" \> "$derniere_base" ] || { echo "INSEREE_AVANT_V91 $f"; ko=1; }
done
dups=$(ls supabase/migrations/*.sql | sed 's#.*/##' | cut -c1-14 | sort | uniq -d)
[ -z "$dups" ] || { echo "VERSIONS_DUPLIQUEES $dups"; ko=1; }
echo "TOTAL $(ls supabase/migrations/*.sql | wc -l) migrations ; derniere $(ls supabase/migrations/*.sql | tail -1 | sed 's#.*/##' | cut -c1-14)"
[ $ko = 0 ] && echo "INTEGRITE_TRAIN=OK" || echo "INTEGRITE_TRAIN=KO"
exit $ko
