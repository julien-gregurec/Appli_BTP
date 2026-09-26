#!/usr/bin/env bash
# Fonctions partagées par les scripts scripts/dr/*.sh.
#
# Garde-fou central : tous les scripts DR de ce dossier n'opèrent QUE sur une
# base locale, jetable, jamais sur Preview/Production. On le vérifie par
# construction (hôte + nom de base), pas par une simple convention de nommage.
set -euo pipefail

: "${DR_PGHOST:=127.0.0.1}"
: "${DR_PGPORT:=5432}"
: "${DR_PGDATABASE:=elsatia_dr_drill}"
: "${DR_PGUSER:=postgres}"

dr_log() {
  printf '[dr] %s\n' "$*" >&2
}

dr_die() {
  printf '[dr] ERREUR: %s\n' "$*" >&2
  exit 1
}

# Refuse d'opérer si la cible ne ressemble pas à une base locale de drill.
# Double vérification indépendante (hôte ET nom de base), sur le même
# principe que scripts/garde-scripts-production.mjs pour les scripts SQL de
# recette : une seule variable mal positionnée ne doit jamais suffire à
# pointer un script destructeur vers autre chose qu'une base jetable locale.
dr_require_local_target() {
  case "$DR_PGHOST" in
    127.0.0.1|localhost|::1) ;;
    *) dr_die "DR_PGHOST='$DR_PGHOST' n'est pas un hôte local. Les scripts DR refusent toute cible distante." ;;
  esac
  case "$DR_PGDATABASE" in
    elsatia_dr_drill|elsatia_dr_drill_restore|elsatia_dr_drill_*) ;;
    *) dr_die "DR_PGDATABASE='$DR_PGDATABASE' ne commence pas par 'elsatia_dr_drill'. Renommez la base de drill plutôt que d'assouplir ce garde-fou." ;;
  esac
  if [[ "${DR_PGDATABASE}" == *prod* || "${DR_PGDATABASE}" == *preview* ]]; then
    dr_die "DR_PGDATABASE='$DR_PGDATABASE' contient 'prod'/'preview' : refusé par précaution."
  fi
}

dr_psql() {
  PGPASSWORD="${DR_PGPASSWORD:-}" psql -X -q -v ON_ERROR_STOP=1 \
    -h "$DR_PGHOST" -p "$DR_PGPORT" -U "$DR_PGUSER" -d "$DR_PGDATABASE" "$@"
}

dr_psql_db() {
  # $1 = nom de base explicite (utilisé quand on cible autre chose que
  # DR_PGDATABASE, ex: la base 'postgres' de maintenance).
  local db="$1"; shift
  PGPASSWORD="${DR_PGPASSWORD:-}" psql -X -q -v ON_ERROR_STOP=1 \
    -h "$DR_PGHOST" -p "$DR_PGPORT" -U "$DR_PGUSER" -d "$db" "$@"
}
