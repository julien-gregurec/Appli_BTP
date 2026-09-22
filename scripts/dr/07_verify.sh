#!/usr/bin/env bash
# Compare deux manifestes (04_manifest.sh) — typiquement avant sauvegarde et
# après restauration — et échoue si la moindre différence est détectée
# (comptages de lignes, checksums de données, fonctions, triggers, policies
# RLS, contraintes). Mission DR EXACT-TIP V2 §6 : "Zéro perte attendue".
#
# Usage:
#   scripts/dr/07_verify.sh <manifest-avant.json> <manifest-apres.json>
#
# Code de sortie 0 si identique, 1 sinon (avec le détail des divergences).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
source lib/common.sh

usage() { sed -n '2,10p' "${BASH_SOURCE[0]}"; }

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then usage; exit 0; fi
BEFORE="${1:-}"; AFTER="${2:-}"
[[ -n "$BEFORE" && -n "$AFTER" ]] || { usage; dr_die "Deux manifestes requis."; }
[[ -f "$BEFORE" ]] || dr_die "Introuvable: $BEFORE"
[[ -f "$AFTER" ]] || dr_die "Introuvable: $AFTER"
command -v jq >/dev/null 2>&1 || dr_die "jq requis."

STATUS=0

compare_scalar() {
  local label="$1" jqpath="$2"
  local a b
  a=$(jq -r "$jqpath" "$BEFORE")
  b=$(jq -r "$jqpath" "$AFTER")
  if [[ "$a" != "$b" ]]; then
    echo "DIVERGENCE $label: avant=$a apres=$b"
    STATUS=1
  fi
}

compare_scalar "nombre_fonctions_public" ".nombre_fonctions_public"
compare_scalar "nombre_triggers" ".nombre_triggers"
compare_scalar "nombre_policies_rls" ".nombre_policies_rls"
compare_scalar "nombre_contraintes_public" ".nombre_contraintes_public"
compare_scalar "nombre_tables_rls_activee" ".nombre_tables_rls_activee"
compare_scalar "checksum_fonctions" ".checksum_fonctions"
compare_scalar "checksum_triggers" ".checksum_triggers"
compare_scalar "checksum_policies" ".checksum_policies"

# Comparaison table par table : toute table absente d'un des deux côtés, ou
# dont le nombre de lignes / checksum diffère, est une divergence.
TABLES_BEFORE=$(jq -r '.tables | keys[]' "$BEFORE" | sort)
TABLES_AFTER=$(jq -r '.tables | keys[]' "$AFTER" | sort)
if [[ "$TABLES_BEFORE" != "$TABLES_AFTER" ]]; then
  echo "DIVERGENCE liste_tables: l'ensemble des tables diffère."
  diff <(echo "$TABLES_BEFORE") <(echo "$TABLES_AFTER") || true
  STATUS=1
fi

while IFS= read -r t; do
  la=$(jq -r --arg t "$t" '.tables[$t].lignes' "$BEFORE")
  lb=$(jq -r --arg t "$t" '.tables[$t].lignes // "ABSENTE"' "$AFTER")
  ca=$(jq -r --arg t "$t" '.tables[$t].checksum' "$BEFORE")
  cb=$(jq -r --arg t "$t" '.tables[$t].checksum // "ABSENTE"' "$AFTER")
  if [[ "$la" != "$lb" || "$ca" != "$cb" ]]; then
    echo "DIVERGENCE table $t: lignes avant=$la apres=$lb | checksum avant=$ca apres=$cb"
    STATUS=1
  fi
done <<< "$TABLES_BEFORE"

if [[ "$STATUS" == "0" ]]; then
  dr_log "OK: aucune divergence entre $BEFORE et $AFTER (zéro perte confirmée)."
else
  dr_log "ECHEC: divergences détectées entre $BEFORE et $AFTER (voir ci-dessus)."
fi
exit $STATUS
