#!/usr/bin/env bash
# ELSATIA — Baseline performance V1 : non-régression Réserves (recette Playwright complète, chaîne
# du rapport V5 §13) sur une base préparée depuis un dépôt donné (V5 pur ou état « après »).
# Réserves doit tourner sur :3020 (next start) avec la même clé publique que ENV_PERF.
# Usage : ENV_PERF=/tmp/perf/env.sh recette-reserves-comparee.sh <dépôt-source-des-migrations> <base> <journal>
set -uo pipefail
SOURCE="${1:?dépôt}"; BASE="${2:?base}"; JOURNAL="${3:?journal}"
DEPOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
source "${ENV_PERF:?ENV_PERF requis}"
pkill -f "colors-pile-locale/passerelle.mjs" 2>/dev/null; sleep 1
(cd "$SOURCE" && bash tests/e2e/reserves-pile-locale/preparer-base.sh "$BASE") > "$JOURNAL.prep" 2>&1 || { echo "préparation KO"; exit 1; }
su postgres -c "psql -Xq -d $BASE -f $DEPOT/scripts/e2e/prepare-reserves-v6-charge.sql" >> "$JOURNAL.prep" 2>&1
(cd "$DEPOT" && PASSERELLE_PORT=54321 PASSERELLE_STOCKAGE="/tmp/perf/stockage_$BASE" \
  PASSERELLE_DATABASE_URL="postgres://authenticator:$PASSERELLE_MDP_DB@127.0.0.1:5432/$BASE" \
  PASSERELLE_ADMIN_DATABASE_URL="postgres://supabase_admin:$PASSERELLE_MDP_DB@127.0.0.1:5432/$BASE" \
  nohup node tests/e2e/colors-pile-locale/passerelle.mjs > "$JOURNAL.passerelle" 2>&1 &) </dev/null >/dev/null 2>&1
sleep 3
export E2E_RESERVES_URL=http://127.0.0.1:3020 E2E_SUPABASE_URL=http://127.0.0.1:54321 \
  E2E_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" E2E_SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  PW_CHROME_PATH=/opt/pw-browsers/chromium
cd "$DEPOT"
node scripts/e2e/amorcer-recette-v4.mjs >> "$JOURNAL.prep" 2>&1
: > "$JOURNAL"
for spec in reserves-v3-collaboration reserves-v4-listes-pdf reserves-v4-offline-mobile reserves-v5-offline reserves-v6-securite reserves-v6-performance; do
  extra=(); [ "$spec" = reserves-v5-offline ] && extra=(--grep-invert "rechargement hors ligne")
  timeout 1800 npx playwright test "tests/e2e/$spec.spec.ts" --project=desktop-chromium --reporter=line "${extra[@]}" > "$JOURNAL.$spec" 2>&1
  echo "$spec : $(grep -E '^\s+[0-9]+ (passed|failed|flaky|did not run)' "$JOURNAL.$spec" | tr -s ' ' | tr '\n' ' ')" | tee -a "$JOURNAL"
done
