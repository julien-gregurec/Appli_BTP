#!/usr/bin/env bash
# Prépare une base de sondes PostgREST : copie d'une base migrée + décor, rôle
# authenticator avec mot de passe local. Usage : preparer-banc.sh <modèle> <base> <mdp>
set -euo pipefail
MODELE="${1:?modèle}"; BASE="${2:?base}"; MDP="${3:?mot de passe local}"
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
pg() { runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 "$@"; }
pg -c "drop database if exists \"$BASE\"" -c "create database \"$BASE\" template \"$MODELE\""
pg -c "alter database \"$BASE\" set search_path = public, extensions"
pg -c "alter role authenticator with login password '$MDP'"
cd "$ICI" && pg -d "$BASE" -f seed-postgrest.sql > /dev/null
echo "banc prêt : $BASE"
