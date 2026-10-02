#!/usr/bin/env bash
# Base de la recette cross-app Gestion Pro ↔ ELSATIA Réserves, SANS Docker.
#
# Même pile que la recette Réserves (tests/e2e/reserves-pile-locale/preparer-base.sh) :
# vrai PostgreSQL 16, train de migrations complet, passerelle locale
# (tests/e2e/colors-pile-locale/passerelle.mjs). Décor : fixture d'isolation A/B, puis
# scripts/e2e/prepare-gp-reserves-integration.sql, puis l'adaptateur Auth local.
#
# Usage : PASSERELLE_MDP_DB=… tests/e2e/gp-reserves-pile-locale/preparer-base.sh [base]
set -euo pipefail

BASE="${1:-${GP_RESERVES_E2E_DB:-gpres_e2e}}"
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

echo "== décor GP ↔ Réserves =="
{ echo "begin;"; cat "$DEPOT/supabase/tests/fixtures/isolation_multitenant.inc"; echo "commit;"; } | psql_base
psql_base < "$DEPOT/scripts/e2e/prepare-gp-reserves-integration.sql"
psql_base < "$DEPOT/scripts/e2e/prepare-local-recipe.sql"

echo "== OK : base $BASE prête. Démarrer la passerelle, Gestion Pro (3100) et Réserves (3040). =="
