#!/usr/bin/env bash
# Fonctions partagées de l'outillage DR V2 (scripts/dr/v2/*.sh).
# Rapport : docs/qualification/ELSATIA_DISASTER_RECOVERY_RESTORE_V2.md.
#
# Accès PostgreSQL :
#   - en root, par défaut : authentification pair via `runuser -u postgres` (comme
#     scripts/local-postgres-bootstrap/) ;
#   - sinon (ou DR2_PSQL_MODE=tcp) : TCP avec DR_PGHOST / DR_PGPORT / DR_PGUSER / DR_PGPASSWORD.
#
# Garde-fou : TOUTE base que ces scripts créent, déposent ou restaurent passe par
# dr2_garde, qui applique scripts/dr/v2/garde-cible.mjs (Production refusée par défaut,
# cible distante refusée sans autorisation explicite, base locale `elsatia_dr_*` exigée),
# puis une seconde vérification indépendante en bash (préfixe + hôte).
set -euo pipefail

DR2_HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DR2_REPO="$(cd "$DR2_HERE/../../.." && pwd)"
: "${DR_PGHOST:=127.0.0.1}"
: "${DR_PGPORT:=5432}"
: "${DR_PGUSER:=postgres}"
if [[ -z "${DR2_PSQL_MODE:-}" ]]; then
  if [[ "$(id -u)" == "0" && -z "${DR_PGPASSWORD:-}" ]]; then DR2_PSQL_MODE=peer; else DR2_PSQL_MODE=tcp; fi
fi
export DR2_PSQL_MODE DR_PGHOST DR_PGPORT DR_PGUSER

dr2_log() { printf '[dr-v2] %s\n' "$*" >&2; }
dr2_die() { printf '[dr-v2] ERREUR: %s\n' "$*" >&2; exit 1; }
dr2_now() { date +%s.%N; }
dr2_dur() { awk -v a="$1" -v b="$2" 'BEGIN{printf "%.2f", b-a}'; }

# dr2_garde <base> [mode] — refuse toute cible non autorisée (double contrôle).
dr2_garde() {
  local base="$1" mode="${2:-drill}"
  local verdict
  verdict=$(DR2_BASE="$base" DR2_MODE="$mode" node --input-type=module -e '
    import { verifierCibleDr } from "'"$DR2_HERE"'/garde-cible.mjs";
    const r = verifierCibleDr({ hote: process.env.DR_PGHOST, base: process.env.DR2_BASE, mode: process.env.DR2_MODE }, process.env);
    console.log((r.autorise ? "OK " : "REFUS ") + r.motif);
    process.exit(r.autorise ? 0 : 3);') || dr2_die "garde-fou : ${verdict#REFUS }"
  if [[ "$mode" == "drill" ]]; then
    case "$DR_PGHOST" in 127.0.0.1|localhost|::1) ;; *) dr2_die "garde-fou (bash) : hôte '$DR_PGHOST' non local pour un drill." ;; esac
    case "$base" in elsatia_dr_*) ;; *) dr2_die "garde-fou (bash) : base '$base' hors préfixe elsatia_dr_." ;; esac
  fi
}

_dr2_client() { # _dr2_client <binaire> <args…>
  local bin="$1"; shift
  if [[ "$DR2_PSQL_MODE" == "peer" ]]; then
    runuser -u postgres -- "$bin" "$@"
  else
    PGPASSWORD="${DR_PGPASSWORD:-}" "$bin" -h "$DR_PGHOST" -p "$DR_PGPORT" -U "$DR_PGUSER" "$@"
  fi
}
dr2_psql() { local db="$1"; shift; _dr2_client psql -X -q -v ON_ERROR_STOP=1 -d "$db" "$@"; }
dr2_psqla() { local db="$1"; shift; _dr2_client psql -X -q -At -v ON_ERROR_STOP=1 -d "$db" "$@"; }
dr2_pg_dump() { _dr2_client pg_dump "$@"; }
dr2_pg_dumpall() { _dr2_client pg_dumpall "$@"; }
dr2_pg_restore() { _dr2_client pg_restore "$@"; }

dr2_db_existe() { [[ "$(dr2_psqla postgres -c "select 1 from pg_database where datname = '$1'")" == "1" ]]; }

# dr2_db_drop <base> — dépose une base jetable (sessions coupées d'abord).
dr2_db_drop() {
  dr2_garde "$1" drill
  dr2_psqla postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = '$1' and pid <> pg_backend_pid()" >/dev/null
  dr2_psql postgres -c "drop database if exists \"$1\"" >/dev/null 2>&1
}

# dr2_db_copier <source> <cible> — copie par template + réglages de base (search_path…),
# qu'un `create database … template` ne reporte pas.
dr2_db_copier() {
  local src="$1" dst="$2"
  dr2_db_drop "$dst"
  dr2_psqla postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = '$src' and pid <> pg_backend_pid()" >/dev/null
  dr2_psql postgres -c "create database \"$dst\" template \"$src\"" >/dev/null
  dr2_reglages_base "$src" | sed "s/__BASE__/$dst/g" | dr2_psql postgres >/dev/null
}

# dr2_reglages_base <base> — SQL rejouable des réglages ALTER DATABASE … SET (cible : __BASE__).
dr2_reglages_base() {
  dr2_psqla postgres -c "
    select format('alter database %I set %s = %s;', '__BASE__', split_part(c, '=', 1),
                  -- search_path est une LISTE : la citer en un seul littéral en ferait un unique
                  -- schéma « public, extensions » (défaut détecté par la comparaison stricte).
                  case when split_part(c, '=', 1) = 'search_path' then substr(c, strpos(c, '=') + 1)
                       else quote_literal(substr(c, strpos(c, '=') + 1)) end)
      from pg_db_role_setting s, unnest(s.setconfig) c
     where s.setdatabase = (select oid from pg_database where datname = '$1') and s.setrole = 0
     order by 1"
}
