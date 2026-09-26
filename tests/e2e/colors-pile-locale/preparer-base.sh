#!/usr/bin/env bash
# Prépare la base de la recette e2e Colors sur le PostgreSQL 16 local (sans Docker).
#
#   1. reconstruit la base depuis zéro : amorce Supabase minimale + TOUT le train de
#      migrations (scripts/local-postgres-bootstrap/rebuild_db.sh) ;
#   2. rétablit ce que le service Storage hébergé pose lui-même et que les migrations ne
#      posent jamais : GRANT ALL sur storage.objects / storage.buckets aux trois rôles
#      d'API (les policies RLS restent seules juges, comme en production) ;
#   3. ouvre les deux rôles de connexion de la passerelle : `authenticator` (PostgREST) et
#      `supabase_admin` (administrateur interne GoTrue/Storage), avec le mot de passe local
#      PASSERELLE_MDP_DB ;
#   4. charge le jeu de recette tests/e2e/fixtures/colors-pilote.sql avec MDP_RECETTE.
#
# Aucun secret n'est écrit sur disque ni affiché : les deux mots de passe viennent de
# l'environnement et transitent par stdin / l'environnement de psql.
#
# Usage : MDP_RECETTE=… PASSERELLE_MDP_DB=… tests/e2e/colors-pile-locale/preparer-base.sh [base]
set -euo pipefail

BASE="${1:-${COLORS_E2E_DB:-colors_e2e}}"
: "${MDP_RECETTE:?MDP_RECETTE requise (mot de passe des comptes de recette)}"
: "${PASSERELLE_MDP_DB:?PASSERELLE_MDP_DB requise (mot de passe local des rôles de la passerelle)}"
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPOT="$(cd "$ICI/../../.." && pwd)"

bash "$DEPOT/scripts/local-postgres-bootstrap/rebuild_db.sh" "$BASE"

echo "== parité Storage + rôles de connexion =="
su postgres -w PASSERELLE_MDP_DB -c "psql -X -q -v ON_ERROR_STOP=1 -d $BASE" <<'SQL'
\getenv mdp PASSERELLE_MDP_DB
grant all on table storage.objects, storage.buckets to anon, authenticated, service_role;
-- Colonnes texte que GoTrue porte sur auth.users et que l'amorce minimale n'a pas : le jeu
-- de recette les normalise (il a été écrit pour une vraie pile GoTrue).
alter table auth.users
  add column if not exists confirmation_token text, add column if not exists recovery_token text,
  add column if not exists email_change_token_new text, add column if not exists email_change text,
  add column if not exists email_change_token_current text, add column if not exists phone_change text,
  add column if not exists phone_change_token text, add column if not exists reauthentication_token text;
alter role authenticator with login password :'mdp';
alter role supabase_admin with login password :'mdp';
SQL

echo "== jeu de recette Colors =="
su postgres -w MDP_RECETTE -c "psql -X -q -v ON_ERROR_STOP=1 -d $BASE -f $DEPOT/tests/e2e/fixtures/colors-pilote.sql"

echo "== OK : base $BASE prête pour la recette Colors =="
