#!/usr/bin/env bash
# Real end-to-end Auth/RLS acceptance scenarios against the stack built by
# gotrue_pilot_bootstrap.sh: real GoTrue signup, real onboarding RPCs
# (creer_entreprise_bootstrap / activer_compte_employe), real JWTs, and the
# mission's 5 required session scenarios (valid / expired / wrong tenant /
# inactive user / revoked membership), replayed through jwt_bridge.mjs
# (verify signature+exp, then RLS under `SET LOCAL role`+`request.jwt.claims`
# -- see that script's header for exactly what this does and does not prove
# relative to real PostgREST).
#
# Usage: run_pilot_auth_scenarios.sh [db-name]   (default: pilot_gp)
set -uo pipefail

DB="${1:-pilot_gp}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${GOTRUE_BUILD_DIR:-/tmp/gotrue-build}"
BRIDGE="$HERE/jwt_bridge.mjs"
source "$BUILD_DIR/gotrue.env.sh"

PASS="PiloteTest!2026"
FAIL_COUNT=0
pass() { echo "  PASS - $1"; }
fail() { echo "  FAIL - $1"; FAIL_COUNT=$((FAIL_COUNT+1)); }

psql_q() { su postgres -c "psql -X -q -t -A -d \"$DB\" -c \"$1\""; }

# entreprise_id is a fresh gen_random_uuid() on every bootstrap run (keyed
# for idempotent re-seeding by reference_interne='PILOTE-BTP-V1', not by a
# fixed id) -- look it up rather than hardcoding it.
ENTREPRISE_A=$(psql_q "select id from public.entreprises where reference_interne='PILOTE-BTP-V1';")
if [ -z "$ENTREPRISE_A" ]; then echo "pilot fixture not found in $DB -- run gotrue_pilot_bootstrap.sh first"; exit 1; fi

declare -A PROFILE_EMAIL=(
  [gerant]="pilote.karim.haddad@example.test"
  [admin]="pilote.nadia.ferreira@example.test"
  [chef_chantier]="pilote.farid.amrani@example.test"
  [chef_equipe]="pilote.rachid.belkacem@example.test"
  [ouvrier]="pilote.sofiane.aitali@example.test"
)

echo "== signing up the 5 pilot profiles via REAL GoTrue, then real onboarding RPCs =="
mkdir -p "$BUILD_DIR/tokens"
for key in "${!PROFILE_EMAIL[@]}"; do
  email="${PROFILE_EMAIL[$key]}"
  numero=$(psql_q "select numero_inscription from public.employes where email='$email' and entreprise_id='$ENTREPRISE_A';")
  # The fixture pre-creates a synthetic, already-activated auth.users row for
  # every employee (for pgTAP's fabricated-claims tests). Testing the REAL
  # onboarding flow means starting that one employee's account from scratch:
  # drop the fixture's stub row (public.utilisateurs/utilisateurs_entreprises
  # cascade/null out cleanly, see inscription_employes.sql), then sign up for
  # real.
  su postgres -c "psql -X -q -d \"$DB\" -c \"delete from auth.users where email='$email';\"" >/dev/null
  resp=$(curl -sS -m 10 -X POST http://localhost:9999/signup -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$PASS\"}")
  token=$(node -e "try{console.log(JSON.parse(process.argv[1]).access_token||'')}catch(e){console.log('')}" "$resp")
  if [ -z "$token" ]; then fail "$key signup ($email): $resp"; continue; fi
  echo "$token" > "$BUILD_DIR/tokens/$key.access_token"

  echo "insert into public.utilisateurs (id, nom, prenom) select auth.uid(), '', '' where auth.uid() is not null on conflict (id) do nothing;" | \
    node "$BRIDGE" run "$token" "$DB" - >/dev/null 2>&1
  actres=$(echo "select public.activer_compte_employe('$numero');" | node "$BRIDGE" run "$token" "$DB" - 2>&1)
  if echo "$actres" | grep -q "$ENTREPRISE_A"; then
    pass "ON-05 real onboarding activation: $key ($email / $numero)"
  else
    fail "ON-05 real onboarding activation: $key -- $actres"
  fi
done

echo "== ON-01: real bootstrap of a second, independent tenant (\"tenant B\") =="
EMAIL_B="pilote.tenantb.manager@example.test"
su postgres -c "psql -X -q -d \"$DB\" -c \"delete from auth.users where email='$EMAIL_B';\"" >/dev/null
resp=$(curl -sS -m 10 -X POST http://localhost:9999/signup -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL_B\",\"password\":\"TenantB!2026\"}")
TOKEN_B=$(node -e "try{console.log(JSON.parse(process.argv[1]).access_token||'')}catch(e){console.log('')}" "$resp")
echo "$TOKEN_B" > "$BUILD_DIR/tokens/tenant_b.access_token"
echo "insert into public.utilisateurs (id, nom, prenom) select auth.uid(), 'Moreau', 'Isabelle' where auth.uid() is not null on conflict (id) do nothing;" | \
  node "$BRIDGE" run "$TOKEN_B" "$DB" - >/dev/null 2>&1
bres=$(echo "select public.creer_entreprise_bootstrap('Tenant B - Atlantique Renov', '999888777', '10 rue de la Mer', '44000', 'Nantes');" | node "$BRIDGE" run "$TOKEN_B" "$DB" - 2>&1)
ENTREPRISE_B=$(echo "$bres" | grep -Eo '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
if [ -n "$ENTREPRISE_B" ]; then pass "ON-01 real tenant bootstrap: entreprise_b=$ENTREPRISE_B"; else fail "ON-01 real tenant bootstrap -- $bres"; fi

TOKEN_GERANT=$(cat "$BUILD_DIR/tokens/gerant.access_token")
TOKEN_OUVRIER=$(cat "$BUILD_DIR/tokens/ouvrier.access_token")
TOKEN_CE=$(cat "$BUILD_DIR/tokens/chef_equipe.access_token")

echo "== SEC-04 (real JWTs, not fabricated claims): cross-tenant isolation =="
n=$(echo "select count(*) from public.clients where entreprise_id='$ENTREPRISE_A';" | node "$BRIDGE" run "$TOKEN_B" "$DB" - 2>&1 | grep -v '^$' | tail -1 | tr -d ' \r')
[ "$n" = "0" ] && pass "tenant B cannot read tenant A clients (0 rows)" || fail "tenant B saw $n tenant A client rows"
n=$(echo "select count(*) from public.clients where entreprise_id='$ENTREPRISE_A';" | node "$BRIDGE" run "$TOKEN_GERANT" "$DB" - 2>&1 | grep -v '^$' | tail -1 | tr -d ' \r')
[ "$n" = "8" ] && pass "tenant A gerant reads tenant A clients (8 rows)" || fail "tenant A gerant saw $n rows (expected 8)"

echo "== session scenario: EXPIRED (real GoTrue token, 5s exp, replayed after real expiry) =="
sed 's/GOTRUE_JWT_EXP=3600/GOTRUE_JWT_EXP=5/' "$BUILD_DIR/gotrue.env.sh" > "$BUILD_DIR/gotrue.env.shortexp.sh"
pkill -9 -f "gotrue serve" >/dev/null 2>&1 || true; sleep 1
( source "$BUILD_DIR/gotrue.env.shortexp.sh"; cd "$BUILD_DIR"; nohup ./gotrue serve > "$BUILD_DIR/gotrue_serve.log" 2>&1 & disown )
sleep 2
sresp=$(curl -sS -m 10 -X POST "http://localhost:9999/token?grant_type=password" -H "Content-Type: application/json" \
  -d "{\"email\":\"${PROFILE_EMAIL[gerant]}\",\"password\":\"$PASS\"}")
STOKEN=$(node -e "try{console.log(JSON.parse(process.argv[1]).access_token||'')}catch(e){console.log('')}" "$sresp")
sleep 7
gt_resp=$(curl -sS -m 10 http://localhost:9999/user -H "Authorization: Bearer $STOKEN")
echo "$gt_resp" | grep -q "token is expired\|bad_jwt" && pass "real GoTrue rejects its own expired token" || fail "GoTrue accepted expired token: $gt_resp"
vresp=$(node "$BRIDGE" verify "$STOKEN")
echo "$vresp" | grep -q "TOKEN_EXPIRED" && pass "bridge (PostgREST-equivalent check) rejects the same expired token" || fail "bridge accepted expired token: $vresp"
pkill -9 -f "gotrue serve" >/dev/null 2>&1 || true; sleep 1
( source "$BUILD_DIR/gotrue.env.sh"; cd "$BUILD_DIR"; nohup ./gotrue serve > "$BUILD_DIR/gotrue_serve.log" 2>&1 & disown )
sleep 3

echo "== session scenario: INACTIVE USER (real GoTrue ban via admin API) =="
SVC_JWT=$(node "$BRIDGE" sign "{\"role\":\"service_role\",\"iss\":\"local-gotrue\",\"iat\":$(date +%s),\"exp\":$(($(date +%s)+3600))}")
OUV_ID=$(psql_q "select id from auth.users where email='${PROFILE_EMAIL[ouvrier]}';")
curl -sS -m 10 -X PUT "http://localhost:9999/admin/users/$OUV_ID" -H "Authorization: Bearer $SVC_JWT" \
  -H "Content-Type: application/json" -d '{"ban_duration":"87600h"}' >/dev/null
lresp=$(curl -sS -m 10 -X POST "http://localhost:9999/token?grant_type=password" -H "Content-Type: application/json" \
  -d "{\"email\":\"${PROFILE_EMAIL[ouvrier]}\",\"password\":\"$PASS\"}")
echo "$lresp" | grep -q "user_banned" && pass "real GoTrue refuses login for a banned user" || fail "banned user could still log in: $lresp"
uresp=$(curl -sS -m 10 http://localhost:9999/user -H "Authorization: Bearer $TOKEN_OUVRIER")
echo "$uresp" | grep -q "user_banned" && pass "GoTrue /user also rejects a pre-ban token for a now-banned user" || fail "unexpected /user response for banned user: $uresp"
# Documented, not a bug: a pre-ban token's signature/exp are still valid, so
# it still passes RLS via the bridge -- exactly how real PostgREST would
# behave too (it never calls back to GoTrue). Only membership-level
# deactivation (below) actually cuts off data access for an unexpired token.
n=$(echo "select count(*) from public.chantiers where entreprise_id='$ENTREPRISE_A';" | node "$BRIDGE" run "$TOKEN_OUVRIER" "$DB" - 2>&1 | grep -v '^$' | tail -1 | tr -d ' \r')
echo "  NOTE  - pre-ban token still passes RLS ($n rows) -- ban blocks new logins, not already-issued tokens (see PE-07)"

echo "== session scenario: REVOKED MEMBERSHIP (still-valid JWT, statut set to desactive) =="
n_before=$(echo "select count(*) from public.affectations where entreprise_id='$ENTREPRISE_A';" | node "$BRIDGE" run "$TOKEN_CE" "$DB" - 2>&1 | grep -v '^$' | tail -1 | tr -d ' \r')
CE_ID=$(psql_q "select id from auth.users where email='${PROFILE_EMAIL[chef_equipe]}';")
su postgres -c "psql -X -q -d \"$DB\" -c \"update public.utilisateurs_entreprises set statut='desactive' where utilisateur_id='$CE_ID';\"" >/dev/null
n_after=$(echo "select count(*) from public.affectations where entreprise_id='$ENTREPRISE_A';" | node "$BRIDGE" run "$TOKEN_CE" "$DB" - 2>&1 | grep -v '^$' | tail -1 | tr -d ' \r')
if [ "$n_before" != "0" ] && [ "$n_after" = "0" ]; then
  pass "revoked membership blocks RLS immediately on a still-valid JWT ($n_before -> 0 rows)"
else
  fail "revoked membership did not block access as expected (before=$n_before after=$n_after)"
fi

echo "== SEC-01/02/03, AV-04, CM-07, EX-03, ST-08, PA-04/05: centralized permission guard (a_permission) =="
PERMS="acces_clients acces_achats acces_exports acces_stock gerer_employes acces_employes gerer_utilisateurs acces_rentabilite consulter_sa_paie"
for p in $PERMS; do
  g=$(echo "select public.a_permission('$ENTREPRISE_A','$p');" | node "$BRIDGE" run "$TOKEN_GERANT" "$DB" - 2>&1 | grep -v '^$' | tail -1 | tr -d ' \r')
  o=$(echo "select public.a_permission('$ENTREPRISE_A','$p');" | node "$BRIDGE" run "$TOKEN_OUVRIER" "$DB" - 2>&1 | grep -v '^$' | tail -1 | tr -d ' \r')
  if [ "$g" = "t" ] && [ "$o" = "f" ]; then
    pass "a_permission('$p'): gerant=true, ouvrier=false"
  else
    fail "a_permission('$p'): gerant=$g ouvrier=$o (expected true/false)"
  fi
done

echo
echo "================================================================"
if [ "$FAIL_COUNT" -eq 0 ]; then
  echo "All local auth/RLS scenarios PASSED (real GoTrue + real JWTs)."
else
  echo "$FAIL_COUNT scenario(s) FAILED -- see above."
fi
echo "Tokens saved under $BUILD_DIR/tokens/ for further manual poking with jwt_bridge.mjs."
exit "$FAIL_COUNT"
