#!/usr/bin/env bash
# Enchaînement complet du banc E2E Studio dédié (local et CI) :
#   1. démarrage de la pile réelle + contrôle bloquant de la chaîne (stack.sh start)
#   2. canaris : la garde de chaîne échoue bien sur migration GP / oubliée / RPC non classée / table GP
#   3. suite Playwright dédiée (e2e-dedicated/specs)
#   4. arrêt de la pile (toujours)
# Code de sortie non nul au premier échec. Usage : apps/studio/e2e-dedicated/run.sh [args playwright]
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$(cd "$HERE/.." && pwd)"
E2E_DIR="${E2E_DIR:-/var/tmp/elsatia-studio-e2e}"
export E2E_DIR
trap '"$HERE/stack.sh" stop >/dev/null 2>&1 || true' EXIT
"$HERE/stack.sh" stop >/dev/null 2>&1 || true
"$HERE/stack.sh" start || exit 1
# shellcheck disable=SC1091
source "$E2E_DIR/env.sh"
node "$HERE/verify-dedicated-chain.canary.mjs" --db "$STUDIO_DB_URL" || exit 1
cd "$APP" && npx playwright test -c e2e-dedicated/playwright.config.ts "$@"
