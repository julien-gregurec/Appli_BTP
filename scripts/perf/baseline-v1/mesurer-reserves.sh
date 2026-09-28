#!/usr/bin/env bash
# ELSATIA — Baseline performance V1 : mesure HTTP des parcours Réserves (100 / 1 000 / 5 000 réserves).
# Prérequis : base préparée (tests/e2e/reserves-pile-locale/preparer-base.sh + reserves_charge_100_1000_5000.sql),
# pile de mesure sur cette base, Réserves compilé et lancé sur :3020.
# Usage : ENV_PERF=/tmp/perf/env.sh mesurer-reserves.sh <base> [users] [iterations]
set -euo pipefail
BASE="${1:?base}"; USERS="${2:-1}"; ITER="${3:-5}"
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SORTIE="${SORTIE_PERF:-/tmp/perf/resultats}"; mkdir -p "$SORTIE"
source "${ENV_PERF:?ENV_PERF requis}"
q() { su postgres -c "psql -XAt -d $BASE -c \"$1\""; }
# Liste globale « Toutes les réserves » du compte (tous chantiers : ~6 100 réserves) mesurée une fois.
node "$ICI/bench-http.mjs" --app http://127.0.0.1:3020 --supabase "$NEXT_PUBLIC_SUPABASE_URL" --anon "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
  --users "$USERS" --email 'admin-a@invalid.local' --password test --iterations "$ITER" --warmup 1 --paths "/reserves,/dashboard,/chantiers" \
  --out "$SORTIE/reserves_global_u${USERS}.json"
for echelle in ${ECHELLES:-100 1000 5000}; do
  suffixe=$(printf '%03d' $(( echelle == 100 ? 100 : (echelle == 1000 ? 101 : 105) )))
  CH="e0000000-0000-0000-0000-000000000$suffixe"
  R=$(q "select id from reserves where chantier_id='$CH' order by numero desc limit 1")
  INTERV="e2000000-0000-0000-0000-000000000$suffixe"
  # Liste : fiche chantier (toutes ses réserves) et liste filtrée par l'entreprise intervenante
  # du chantier (même volume) ; filtres statut / priorité croisés ; fiche (historique) ; impression ; PDF.
  PATHS="/chantiers/$CH,/reserves?entreprise=$INTERV,/reserves?entreprise=$INTERV&statut=levee_demandee,/reserves?entreprise=$INTERV&priorite=bloquante&statut=emise,/reserves/$R,/imprimer/chantier/$CH"
  [ "${PDF:-1}" = 1 ] && PATHS="$PATHS,/api/documents/chantier/$CH/pdf"
  echo "== $echelle réserves (chantier $CH, fiche $R, historique $(q "select count(*) from reserves_historique where reserve_id='$R'") lignes)"
  node "$ICI/bench-http.mjs" --app http://127.0.0.1:3020 --supabase "$NEXT_PUBLIC_SUPABASE_URL" --anon "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
    --users "$USERS" --email 'admin-a@invalid.local' --password test --iterations "$ITER" --warmup 1 --paths "$PATHS" \
    --out "$SORTIE/reserves_${echelle}_u${USERS}.json"
done
