#!/usr/bin/env bash
# DR V2 — limites de restauration Auth avec un VRAI GoTrue (supabase/auth compilé depuis les
# sources, cf. scripts/local-postgres-bootstrap/gotrue_pilot_bootstrap.sh).
# Rapport : docs/qualification/ELSATIA_DISASTER_RECOVERY_RESTORE_V2.md §9.
#
# Usage : scripts/dr/v2/auth_drill.sh [dossier-de-sortie]
# Prérequis : binaire GoTrue (GOTRUE_BIN, défaut /tmp/gotrue-build/gotrue), PostgreSQL 16 local.
# Sans binaire : verdict AUTH_NOT_PROVEN (code 2), rien n'est prétendu.
#
# Ce drill MESURE ce qu'une restauration de base fait à l'authentification (auth.users,
# auth.sessions, auth.refresh_tokens) — il ne « répare » rien en silence :
#   1. avant sauvegarde : U1 (2 sessions), U2 ;
#   2. après sauvegarde : U1 change de mot de passe et ferme sa session 2, U2 est banni,
#      U3 s'inscrit, la session 1 de U1 fait tourner son refresh token ;
#   3. restauration de la sauvegarde ;
#   4. constats (ce qui REVIENT : ancien mot de passe, session fermée, ban levé, jeton déjà
#      consommé ; ce qui est PERDU : U3, jetons émis après la sauvegarde) ;
#   5. mesures correctives testées : révocation globale des sessions, rotation du secret JWT.
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
set +e

OUT="${1:-/tmp/elsatia-dr-v2/auth-$(date -u +%Y%m%dT%H%M%SZ)}"
DB=elsatia_dr_v2_auth
GOTRUE_BIN="${GOTRUE_BIN:-/tmp/gotrue-build/gotrue}"
PORT=9998; URL="http://127.0.0.1:$PORT"
mkdir -p "$OUT"; RES="$OUT/auth_results.json"; echo '{"controles": []}' > "$RES"; ECHECS=0
exec > >(tee -a "$OUT/auth_drill.log") 2>&1
res_set() { local t; t=$(mktemp); jq "$1" "$RES" > "$t" && mv "$t" "$RES"; }
controle() {
  [[ "$3" == ok ]] || ECHECS=$((ECHECS + 1))
  printf '  %s %s — %s%s\n' "$([[ $3 == ok ]] && echo ✅ || echo ❌)" "$1" "$2" "${4:+ ($4)}"
  res_set ".controles += [{\"id\": \"$1\", \"libelle\": $(jq -Rn --arg v "$2" '$v'), \"statut\": \"$3\", \"detail\": $(jq -Rn --arg v "${4:-}" '$v')}]"
}
dr2_garde "$DB" drill
[[ -x "$GOTRUE_BIN" ]] || { echo "AUTH_NOT_PROVEN : binaire GoTrue absent ($GOTRUE_BIN)"; res_set '.verdict = "AUTH_NOT_PROVEN"'; exit 2; }

PW=$(openssl rand -hex 12)
SECRET="drv2-local-only-$(openssl rand -hex 24)"
arreter() { pkill -f "gotrue-drv2-$PORT" >/dev/null 2>&1; pkill -f "$GOTRUE_BIN serve" >/dev/null 2>&1; sleep 1; }
demarrer() { # demarrer <secret>
  ( export GOTRUE_DB_DRIVER=postgres DB_NAMESPACE=auth \
      DATABASE_URL="postgres://drv2_auth:$PW@127.0.0.1:${DR_PGPORT}/$DB" \
      GOTRUE_JWT_SECRET="$1" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated \
      GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES="service_role" \
      API_EXTERNAL_URL="$URL" GOTRUE_API_HOST=127.0.0.1 PORT=$PORT GOTRUE_SITE_URL=http://localhost:3000 \
      GOTRUE_MAILER_AUTOCONFIRM=true GOTRUE_DISABLE_SIGNUP=false GOTRUE_EXTERNAL_EMAIL_ENABLED=true \
      GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL=0 \
      GOTRUE_LOG_LEVEL=warn
    cd "$(dirname "$GOTRUE_BIN")"; exec -a "gotrue-drv2-$PORT" "$GOTRUE_BIN" "$2" ) >> "$OUT/gotrue.log" 2>&1 &
  [[ "$2" == migrate ]] && { wait $!; return $?; }
  for _ in $(seq 1 30); do curl -sf -m 2 "$URL/health" >/dev/null && return 0; sleep 1; done; return 1
}
jwt_admin() { node -e '
  const c=require("crypto"),b=o=>Buffer.from(JSON.stringify(o)).toString("base64url"),t=Math.floor(Date.now()/1000);
  const x=b({alg:"HS256",typ:"JWT"})+"."+b({role:"service_role",iss:"drv2",iat:t,exp:t+3600});
  console.log(x+"."+c.createHmac("sha256",process.argv[1]).update(x).digest("base64url"))' "$1"; }
login() { curl -s -m 5 "$URL/token?grant_type=password" -H 'content-type: application/json' -d "{\"email\":\"$1\",\"password\":\"$2\"}"; }
refresh() { curl -s -m 5 "$URL/token?grant_type=refresh_token" -H 'content-type: application/json' -d "{\"refresh_token\":\"$1\"}"; }
code_user() { curl -s -m 5 -o /dev/null -w '%{http_code}' "$URL/user" -H "Authorization: Bearer $1"; }
ok_si() { [[ "$1" == "$2" ]] && echo ok || echo ko; }
jeton() { jq -r "${2:-.access_token} // \"ECHEC:\" + (.error_code // .msg // .error // \"?\")" <<<"$1"; }

echo "== Auth DR — GoTrue réel ${GOTRUE_VERSION:-v2.196.0} ($GOTRUE_BIN) — sortie $OUT"
arreter
dr2_psql postgres -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'drv2_auth') then create role drv2_auth superuser login; end if; end \$\$" -c "alter role drv2_auth password '$PW'" -c "alter role drv2_auth set search_path = auth, public" >/dev/null
dr2_db_drop "$DB"; dr2_psql postgres -c "create database \"$DB\"" >/dev/null
dr2_psql "$DB" -c "create schema auth authorization drv2_auth" >/dev/null
demarrer "$SECRET" migrate || { echo "migrations GoTrue en échec"; tail "$OUT/gotrue.log"; exit 1; }
demarrer "$SECRET" serve || { echo "GoTrue ne démarre pas"; tail "$OUT/gotrue.log"; exit 1; }
res_set ".gotrue_tables_auth = $(dr2_psqla "$DB" -c "select count(*) from information_schema.tables where table_schema = 'auth'")"

# ── 1. État sauvegardé ─────────────────────────────────────────────────────────────────
for u in u1 u2; do curl -s -m 5 "$URL/signup" -H 'content-type: application/json' -d "{\"email\":\"$u@drv2.invalid\",\"password\":\"Ancien-mdp-$u-1\"}" >/dev/null; done
S1=$(login u1@drv2.invalid Ancien-mdp-u1-1); A1=$(jeton "$S1"); R1=$(jeton "$S1" .refresh_token)
S2=$(login u1@drv2.invalid Ancien-mdp-u1-1); A2=$(jeton "$S2"); R2=$(jeton "$S2" .refresh_token)
controle A-0 "GoTrue réel : 2 utilisateurs, 2 sessions de U1 (refresh tokens rotatifs)" "$([[ $A1 != ECHEC* && $R2 != ECHEC* ]] && echo ok || echo ko)" \
  "$(dr2_psqla "$DB" -c "select count(*) || ' sessions, ' || (select count(*) from auth.refresh_tokens) || ' refresh tokens' from auth.sessions")"

# ── 2. Sauvegarde puis événements de sécurité postérieurs ─────────────────────────────
T0=$(dr2_now); dr2_pg_dump -d "$DB" --format=custom > "$OUT/auth.dump"; dr2_reglages_base "$DB" > "$OUT/auth_settings.sql"
res_set ".mesures.backup_s = $(dr2_dur "$T0" "$(dr2_now)")"
curl -s -m 5 -X PUT "$URL/user" -H "Authorization: Bearer $A1" -H 'content-type: application/json' -d '{"password":"Nouveau-mdp-u1-2"}' >/dev/null
curl -s -m 5 -X POST "$URL/logout?scope=local" -H "Authorization: Bearer $A2" >/dev/null
U2=$(dr2_psqla "$DB" -c "select id from auth.users where email = 'u2@drv2.invalid'")
curl -s -m 5 -X PUT "$URL/admin/users/$U2" -H "Authorization: Bearer $(jwt_admin "$SECRET")" -H 'content-type: application/json' -d '{"ban_duration":"876000h"}' >/dev/null
S3=$(curl -s -m 5 "$URL/signup" -H 'content-type: application/json' -d '{"email":"u3@drv2.invalid","password":"Mdp-u3-apres-backup"}'); A3=$(jeton "$S3")
S1b=$(refresh "$R1"); R1b=$(jeton "$S1b" .refresh_token)
AVANT=$(printf '%s|%s|%s|%s' "$(jeton "$(login u1@drv2.invalid Ancien-mdp-u1-1)" | cut -c1-6)" "$(jeton "$(refresh "$R2")" | cut -c1-6)" \
  "$(jeton "$(login u2@drv2.invalid Ancien-mdp-u2-1)" | cut -c1-6)" "$(code_user "$A3")")
echo "  vérité après sauvegarde (ancien mdp U1 | session 2 fermée | U2 banni | U3) : $AVANT"
controle A-1 "après sauvegarde : ancien mot de passe refusé, session fermée refusée, U2 banni, U3 créé" \
  "$([[ $AVANT == ECHEC:*\|ECHEC:*\|ECHEC:*\|200 ]] && echo ok || echo ko)" "$AVANT"

# ── 3. Restauration ────────────────────────────────────────────────────────────────────
arreter
T0=$(dr2_now)
dr2_db_drop "$DB"; dr2_psql postgres -c "create database \"$DB\"" >/dev/null
dr2_pg_restore -d "$DB" --exit-on-error "$OUT/auth.dump"; sed "s/__BASE__/$DB/g" "$OUT/auth_settings.sql" | dr2_psql postgres >/dev/null
res_set ".mesures.restore_s = $(dr2_dur "$T0" "$(dr2_now)")"
demarrer "$SECRET" serve

# ── 4. Constats ────────────────────────────────────────────────────────────────────────
L1=$(jeton "$(login u1@drv2.invalid Ancien-mdp-u1-1)")
controle A-2 "RÉGRESSION : l'ancien mot de passe de U1 fonctionne de nouveau (changement postérieur perdu)" "$([[ $L1 != ECHEC* ]] && echo ok || echo ko)"
L1n=$(jeton "$(login u1@drv2.invalid Nouveau-mdp-u1-2)")
controle A-3 "le nouveau mot de passe est refusé" "$([[ $L1n == ECHEC* ]] && echo ok || echo ko)" "$L1n"
RR2J=$(refresh "$R2"); RR2=$(jeton "$RR2J"); RR2R=$(jeton "$RR2J" .refresh_token)
controle A-4 "RÉGRESSION : la session fermée après la sauvegarde est RESSUSCITÉE (refresh accepté)" "$([[ $RR2 != ECHEC* ]] && echo ok || echo ko)"
LU2=$(jeton "$(login u2@drv2.invalid Ancien-mdp-u2-1)")
controle A-5 "RÉGRESSION : le ban de U2 est levé" "$([[ $LU2 != ECHEC* ]] && echo ok || echo ko)"
controle A-6 "U3 (inscrit après la sauvegarde) n'existe plus ; son jeton d'accès est refusé" "$([[ $(code_user "$A3") != 200 ]] && echo ok || echo ko)" "GET /user = $(code_user "$A3")"
controle A-7 "jeton de rafraîchissement émis après la sauvegarde refusé" "$([[ $(jeton "$(refresh "$R1b")") == ECHEC* ]] && echo ok || echo ko)"
controle A-9 "jeton d'accès d'avant la sauvegarde (non expiré) toujours accepté" "$(ok_si "$(code_user "$A1")" 200)"

# ── 5. Mesures correctives ─────────────────────────────────────────────────────────────
dr2_psqla "$DB" -c "delete from auth.sessions" >/dev/null   # révocation globale (cascade refresh_tokens)
RR2n=$(jeton "$(refresh "$RR2R")"); R1n=$(jeton "$(refresh "$R1")")
controle A-10 "révocation globale des sessions : aucun refresh token ne passe plus" \
  "$([[ $RR2n == ECHEC* && $R1n == ECHEC* ]] && echo ok || echo ko)" "$RR2n / $R1n"
controle A-11 "révocation globale : les jetons d'accès liés à une session supprimée sont refusés" "$([[ $(code_user "$A1") != 200 ]] && echo ok || echo ko)" "GET /user = $(code_user "$A1")"
arreter; demarrer "drv2-local-only-$(openssl rand -hex 24)" serve
A1x=$(jeton "$(login u1@drv2.invalid Ancien-mdp-u1-1)")
controle A-12 "rotation du secret JWT : un jeton signé avec l'ancien secret est refusé, une nouvelle connexion fonctionne" \
  "$([[ $(code_user "$A2") != 200 && $A1x != ECHEC* && $(code_user "$A1x") == 200 ]] && echo ok || echo ko)"
arreter
res_set ".echecs = $ECHECS | .verdict = \"$([[ $ECHECS == 0 ]] && echo AUTH_LIMITS_MEASURED || echo AUTH_DRILL_FAILED)\""
echo "== Auth : $(jq -r .verdict "$RES") ($ECHECS échec(s)) — $RES"
exit $(( ECHECS > 0 ? 1 : 0 ))
