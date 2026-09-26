#!/usr/bin/env bash
# Prépare la base de la recette e2e ELSATIA Réserves sur le PostgreSQL 16 local, SANS Docker.
#
# Miroir de scripts/e2e/recette-reserves-v4.sh (qui vise un conteneur `docker exec`) pour les
# postes où seul PostgreSQL est disponible. Le décor est STRICTEMENT le même : mêmes fichiers
# SQL, dans le même ordre. Seul le transport change (psql local au lieu de docker exec), plus
# ce que GoTrue/Storage hébergés posent eux-mêmes et que l'amorce minimale n'a pas.
#
#   1. base reconstruite depuis zéro : amorce Supabase minimale + TOUT le train de migrations ;
#   2. parité Storage (GRANT aux rôles d'API, les policies jugent), rôles de connexion de la
#      passerelle (tests/e2e/colors-pile-locale/passerelle.mjs), colonnes GoTrue ;
#   3. décor Réserves V3/V4 puis V6 (sécurité : organisation B sans lien).
#
# Les objets Storage (plan, photos) sont déposés ensuite, passerelle démarrée, par
# scripts/e2e/amorcer-recette-v4.mjs.
#
# Usage : PASSERELLE_MDP_DB=… tests/e2e/reserves-pile-locale/preparer-base.sh [base]
set -euo pipefail

BASE="${1:-${RESERVES_E2E_DB:-reserves_e2e}}"
: "${PASSERELLE_MDP_DB:?PASSERELLE_MDP_DB requise (mot de passe local des rôles de la passerelle)}"
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPOT="$(cd "$ICI/../../.." && pwd)"

psql_base() { su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $BASE"; }

bash "$DEPOT/scripts/local-postgres-bootstrap/rebuild_db.sh" "$BASE"

echo "== parité Storage / GoTrue + rôles de connexion =="
su postgres -w PASSERELLE_MDP_DB -c "psql -X -q -v ON_ERROR_STOP=1 -d $BASE" <<'SQL'
\getenv mdp PASSERELLE_MDP_DB
grant all on table storage.objects, storage.buckets to anon, authenticated, service_role;
alter table auth.users
  add column if not exists confirmation_token text, add column if not exists recovery_token text,
  add column if not exists email_change_token_new text, add column if not exists email_change text,
  add column if not exists email_change_token_current text, add column if not exists phone_change text,
  add column if not exists phone_change_token text, add column if not exists reauthentication_token text;
create table if not exists auth.identities (
  id uuid not null, provider_id text not null, user_id uuid not null references auth.users(id) on delete cascade,
  identity_data jsonb not null, provider text not null, created_at timestamptz, updated_at timestamptz,
  primary key (provider_id, provider)
);
alter role authenticator with login password :'mdp';
alter role supabase_admin with login password :'mdp';
SQL

echo "== décor Réserves (ordre de recette-reserves-v4.sh) =="
{ echo "begin;"; cat "$DEPOT/supabase/tests/fixtures/isolation_multitenant.inc"; echo "commit;"; } | psql_base
psql_base < "$DEPOT/scripts/e2e/prepare-local-recipe.sql"
psql_base < "$DEPOT/scripts/e2e/prepare-reserves-v3-recipe.sql"
psql_base < "$DEPOT/scripts/e2e/prepare-local-recipe.sql"
psql_base < "$DEPOT/scripts/e2e/reset-reserves-recipe.sql"
psql_base < "$DEPOT/scripts/e2e/prepare-reserves-v4-listes.sql"
psql_base < "$DEPOT/scripts/e2e/prepare-reserves-v6-securite.sql"

echo "== OK : base $BASE prête. Démarrer la passerelle, puis : node scripts/e2e/amorcer-recette-v4.mjs =="
