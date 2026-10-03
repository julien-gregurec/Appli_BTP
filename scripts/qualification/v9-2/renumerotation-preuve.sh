#!/usr/bin/env bash
# Train canonique V9.2 — preuve d'équivalence des migrations renumérotées.
# Pour chaque couple (source@ref, cible dans l'arbre courant) : sha256 du fichier entier et
# sha256 du corps fonctionnel (commentaires « -- » et lignes vides retirés, espaces de fin
# normalisés). Équivalence exigée sur les deux empreintes ; sortie non nulle sinon.
# Usage : scripts/qualification/v9-2/renumerotation-preuve.sh
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO"
SRC_REF="${PERF_REF:-a9b46f011915961cba6f1668d74ee3d71208a9b5}"
corps() { sed -E 's/[[:space:]]+$//; /^[[:space:]]*--/d; /^[[:space:]]*$/d' | sha256sum | cut -c1-64; }
echo "SOURCE | CIBLE | SHA256_FICHIER_AVANT | SHA256_FICHIER_APRES | SHA256_CORPS_AVANT | SHA256_CORPS_APRES | EQUIVALENT"
ko=0
while read -r ancien nouveau; do
  [ -n "$ancien" ] || continue
  fa=$(git show "$SRC_REF:supabase/migrations/$ancien" | sha256sum | cut -c1-64)
  fn=$(sha256sum "supabase/migrations/$nouveau" | cut -c1-64)
  ca=$(git show "$SRC_REF:supabase/migrations/$ancien" | corps)
  cn=$(corps < "supabase/migrations/$nouveau")
  eq=OUI; { [ "$fa" = "$fn" ] && [ "$ca" = "$cn" ]; } || { eq=NON; ko=1; }
  echo "$ancien | $nouveau | $fa | $fn | $ca | $cn | $eq"
done <<'MAP'
20261003000101_push_file_durable_v1.sql 20261003001501_push_file_durable_v1.sql
20261003000201_relances_auto_candidats_eligibles_v1.sql 20261003001502_relances_auto_candidats_eligibles_v1.sql
20261003000301_rls_ensembles_entreprises_autorisees_v1.sql 20261003001503_rls_ensembles_entreprises_autorisees_v1.sql
20261003000401_taches_chantier_created_idx_v1.sql 20261003001504_taches_chantier_created_idx_v1.sql
MAP
exit $ko
