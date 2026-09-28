#!/usr/bin/env bash
# Base de la recette navigateur « données personnelles des salariés » (V1), SANS Docker.
#
# Même socle que les autres recettes locales (tests/e2e/gp-reserves-pile-locale) : vrai
# PostgreSQL 16, train de migrations complet, parité GoTrue/Storage pour la passerelle.
# Décor : supabase/tests/fixtures/employes_donnees_personnelles.inc (rôles canoniques réels,
# entreprises A et B), COMMITÉ, puis adaptation Auth locale et abonnement actif.
#
# Usage : PASSERELLE_MDP_DB=… tests/e2e/employes-pile-locale/preparer-base.sh [base] [--sans-701]
#   --sans-701 : rejoue le train SANS 20260928000701 (état V6) pour la preuve « avant ».
set -euo pipefail

BASE="${1:-edp_e2e}"
SANS_701="${2:-}"
: "${PASSERELLE_MDP_DB:?PASSERELLE_MDP_DB requise (mot de passe local des rôles de la passerelle)}"
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPOT="$(cd "$ICI/../../.." && pwd)"

psql_base() { su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $BASE"; }

if [ "$SANS_701" = "--sans-701" ]; then
  MIGR=$(mktemp -d); cp -r "$DEPOT/scripts" "$MIGR/"; mkdir -p "$MIGR/supabase"
  cp -r "$DEPOT/supabase/migrations" "$MIGR/supabase/"; rm -f "$MIGR/supabase/migrations/20260928000701_"*.sql
  chmod -R a+rX "$MIGR"
  bash "$MIGR/scripts/local-postgres-bootstrap/rebuild_db.sh" "$BASE"
  rm -rf "$MIGR"
else
  bash "$DEPOT/scripts/local-postgres-bootstrap/rebuild_db.sh" "$BASE"
fi
su postgres -c "psql -X -q -c 'alter database \"$BASE\" set search_path = public, extensions'"

echo "== parité Storage / GoTrue + rôles de connexion =="
su postgres -w PASSERELLE_MDP_DB -c "psql -X -q -v ON_ERROR_STOP=1 -d $BASE" <<'SQL'
\getenv mdp PASSERELLE_MDP_DB
grant all on table storage.objects, storage.buckets to anon, authenticated, service_role;
alter table auth.users
  add column if not exists confirmation_token text, add column if not exists recovery_token text,
  add column if not exists email_change_token_new text, add column if not exists email_change text,
  add column if not exists email_change_token_current text, add column if not exists phone_change text,
  add column if not exists phone_change_token text, add column if not exists reauthentication_token text;
alter role authenticator with login password :'mdp';
alter role supabase_admin with login password :'mdp';
SQL

echo "== décor employés A/B (rôles canoniques) =="
{ echo "begin;"; cat "$DEPOT/supabase/tests/fixtures/employes_donnees_personnelles.inc"; echo "commit;"; } | psql_base >/dev/null
psql_base <<'SQL'
update auth.users
   set raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
       raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb),
       email_confirmed_at = coalesce(email_confirmed_at, now())
 where email like '%@edp.invalid';
update public.entreprises
   set abonnement_statut = 'actif', abonnement_offre = 'entreprise', abonnement_echeance = current_date + 365
 where id in ('eda00000-0000-0000-0000-000000000001', 'edb00000-0000-0000-0000-000000000001');
update public.utilisateurs u set entreprise_active_id = ue.entreprise_id
  from public.utilisateurs_entreprises ue
 where ue.utilisateur_id = u.id and ue.statut = 'actif'
   and ue.entreprise_id in ('eda00000-0000-0000-0000-000000000001', 'edb00000-0000-0000-0000-000000000001');
-- Les sondes pgTAP du décor n'ont rien à faire dans une base servie par l'API.
drop function if exists public.edp_val(text);
drop function if exists public.edp_exec(text);
drop function if exists public.edp_as(uuid);
SQL
echo "== OK : base $BASE prête (routeur :54321, PostgREST, passerelle, Gestion Pro :3100). =="
