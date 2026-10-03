#!/usr/bin/env bash
# Train canonique V9.2 — recette navigateur satellites (Colors, Tools, Réserves, GP) en trois modes,
# sur une base V9.2 locale (tests/e2e/satellites-pile-locale/preparer-base.sh), vrai PostgREST et
# passerelle auth (tests/e2e/finance-pile-locale/demarrer-pile.sh), 4 applications COMPILÉES
# (GP 127.0.0.1:3000, Colors :3010, Tools :3020, Réserves :3040).
# Variables : celles des recettes V9 (PASSERELLE_SECRET_JWT, PASSERELLE_MDP_DB, clés HS256 de banc,
# POSTGREST_BIN, PW_CHROME_PATH, PASSERELLE_AAL2_EMAILS) — secrets générés localement, jamais déployés.
# Usage : recette-satellites.sh <base-modèle-v92> <dossier-sortie> [modes…]   (défaut : local preview production)
set -uo pipefail
MODELE="${1:?base modèle}"; OUT="${2:?sortie}"; shift 2
MODES=("$@"); [ ${#MODES[@]} -eq 0 ] && MODES=(local preview production)
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; DEPOT="$(cd "$ICI/../../.." && pwd)"
mkdir -p "$OUT"; chmod 777 "$OUT"
: "${PASSERELLE_SECRET_JWT:?}" "${PASSERELLE_MDP_DB:?}" "${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:?}" "${SUPABASE_SERVICE_ROLE_KEY:?}"
LOCAL_SB=http://127.0.0.1:54321
arreter_apps() { for p in 3000 3010 3020 3040; do fuser -k -n tcp $p >/dev/null 2>&1 || true; done; }
arreter_pile() { for f in postgrest passerelle routeur; do [ -f "$OUT/pile/$f.pid" ] && kill "$(cat "$OUT/pile/$f.pid")" 2>/dev/null; done; sleep 1; }
attendre() { for _ in $(seq 1 120); do c=$(curl -s -o /dev/null -w '%{http_code}' "$1"); case $c in 000) sleep 1;; *) return 0;; esac; done; echo "non prêt : $1"; return 1; }
commun() { echo NEXT_PUBLIC_SUPABASE_URL=$LOCAL_SB NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY RATE_LIMIT_HMAC_KEY=$RATE_LIMIT_HMAC_KEY CRON_SECRET=$CRON_SECRET; }

echo "== builds GP / Colors / Réserves (ELSATIA_APPLICATION_ENV=local au build) =="
(cd "$DEPOT" && env $(commun) NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000 ELSATIA_APPLICATION_ENV=local npx next build > "$OUT/build_gp.log" 2>&1) || { echo "build GP KO"; exit 1; }
(cd "$DEPOT/apps/colors" && env $(commun) NEXT_PUBLIC_ELSATIA_ACCOUNT_URL=http://localhost:3000/abonnement NEXT_PUBLIC_COLORS_URL=http://localhost:3010 ELSATIA_APPLICATION_ENV=local npm run -s build > "$OUT/build_colors.log" 2>&1) || { echo "build Colors KO"; exit 1; }
(cd "$DEPOT/apps/reserves" && env $(commun) NEXT_PUBLIC_RESERVES_URL=http://localhost:3040 ELSATIA_APPLICATION_ENV=local npm run -s build > "$OUT/build_reserves.log" 2>&1) || { echo "build Réserves KO"; exit 1; }

for MODE in "${MODES[@]}"; do
  echo "== mode $MODE =="
  arreter_apps
  # Une seule base pour les trois modes (comme la recette d'origine) : l'url_preview de Colors est
  # définie par l'écran propriétaire en mode local (A-11) puis lue par les modes Preview / Production.
  if [ -z "${PILE_PRETE:-}" ]; then
    bash "$DEPOT/tests/e2e/satellites-pile-locale/preparer-base.sh" sat_e2e "$MODELE" > "$OUT/base.log" 2>&1 || { echo "base KO"; tail -n 20 "$OUT/base.log"; exit 1; }
    bash "$DEPOT/tests/e2e/finance-pile-locale/demarrer-pile.sh" sat_e2e "$OUT/pile" > "$OUT/pile.log" 2>&1 || { echo "pile KO"; exit 1; }
    PILE_PRETE=1
  fi
  case $MODE in
    local) T=(NEXT_PUBLIC_SUPABASE_URL=$LOCAL_SB NEXT_PUBLIC_TOOLS_URL=http://localhost:3020 NEXT_PUBLIC_TOOLS_ENV=local NEXT_PUBLIC_TOOLS_BILLING_API_URL=http://localhost:3000 NEXT_PUBLIC_TOOLS_GESTION_PRO_URL=http://localhost:3000 NEXT_PUBLIC_TOOLS_COLORS_URL=http://localhost:3010);;
    preview) T=(NEXT_PUBLIC_SUPABASE_URL=https://preview-simulee.supabase.co NEXT_PUBLIC_TOOLS_URL=https://elsatia-tools-git-preview.vercel.app NEXT_PUBLIC_TOOLS_ENV=preview NEXT_PUBLIC_TOOLS_BILLING_API_URL=https://elsatia-gp-git-preview.vercel.app NEXT_PUBLIC_TOOLS_GESTION_PRO_URL=https://elsatia-gp-git-preview.vercel.app NEXT_PUBLIC_TOOLS_COLORS_URL=https://elsatia-colors-git-preview.vercel.app);;
    production) T=(NEXT_PUBLIC_SUPABASE_URL=https://production-simulee.supabase.co NEXT_PUBLIC_TOOLS_URL=https://tools.elsatia.fr NEXT_PUBLIC_TOOLS_ENV=production NEXT_PUBLIC_TOOLS_BILLING_API_URL=https://app.elsatia.fr NEXT_PUBLIC_TOOLS_GESTION_PRO_URL=https://app.elsatia.fr NEXT_PUBLIC_TOOLS_COLORS_URL=https://colors.elsatia.fr);;
  esac
  (cd "$DEPOT/apps/tools" && env NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY "${T[@]}" npm run -s build > "$OUT/${MODE}_build_tools.log" 2>&1) || { echo "build Tools $MODE KO"; tail -n 20 "$OUT/${MODE}_build_tools.log"; exit 1; }
  (cd "$DEPOT" && env $(commun) NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000 ELSATIA_APPLICATION_ENV=$MODE TZ=UTC nohup npx next start -p 3000 -H 127.0.0.1 > "$OUT/${MODE}_gp.log" 2>&1 &)
  (cd "$DEPOT/apps/colors" && env $(commun) ELSATIA_APPLICATION_ENV=$MODE nohup npx next start -p 3010 -H localhost > "$OUT/${MODE}_colors.log" 2>&1 &)
  (cd "$DEPOT/apps/reserves" && env $(commun) ELSATIA_APPLICATION_ENV=$MODE nohup npx next start -p 3040 -H localhost > "$OUT/${MODE}_reserves.log" 2>&1 &)
  (cd "$DEPOT/apps/tools" && nohup npx next start -p 3020 -H localhost > "$OUT/${MODE}_tools.log" 2>&1 &)
  attendre http://127.0.0.1:3000/login && attendre http://localhost:3010/login && attendre http://localhost:3040/login && attendre http://localhost:3020/compte || exit 1
  (cd "$DEPOT" && E2E_SAT_MODE=$MODE npx playwright test tests/e2e/satellites-preview-readiness.spec.ts --project=desktop-chromium --workers=1 > "$OUT/playwright_${MODE}.txt" 2>&1); echo "   playwright $MODE rc=$? : $(grep -E '[0-9]+ (passed|failed|skipped)' "$OUT/playwright_${MODE}.txt" | tr -s ' ' | tr '\n' ' ')"
done
arreter_apps; arreter_pile
