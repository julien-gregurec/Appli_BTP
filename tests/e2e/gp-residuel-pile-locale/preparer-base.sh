#!/usr/bin/env bash
# Base de la recette navigateur ELSATIA-GP-RESIDUAL-DATA-CORRECTNESS-V1, SANS Docker.
#
# Même socle que tests/e2e/finance-pile-locale : vrai PostgreSQL 16, train de
# migrations complet, parité GoTrue/Storage pour la passerelle. Décor :
# scripts/qualification/gp-residual/seed.sql (entreprises de 500, 1 000, 1 462,
# 5 000 et 20 000 lignes par chemin, plus un tenant témoin), puis adaptation Auth
# locale (mot de passe « test ») et abonnement actif. La pile se démarre ensuite
# avec tests/e2e/finance-pile-locale/demarrer-pile.sh <base> <journaux>.
#
# Usage : PASSERELLE_MDP_DB=… tests/e2e/gp-residuel-pile-locale/preparer-base.sh [base]
set -euo pipefail
BASE="${1:-gp_e2e}"
: "${PASSERELLE_MDP_DB:?PASSERELLE_MDP_DB requise (mot de passe local des rôles de la passerelle)}"
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPOT="$(cd "$ICI/../../.." && pwd)"
psql_base() { su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $BASE"; }

bash "$DEPOT/scripts/local-postgres-bootstrap/rebuild_db.sh" "$BASE"
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

echo "== décor volumétrique =="
psql_base < "$DEPOT/scripts/qualification/gp-residual/seed.sql" >/dev/null
psql_base <<'SQL'
update auth.users
   set encrypted_password = extensions.crypt('test', extensions.gen_salt('bf')),
       raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
       raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb),
       email_confirmed_at = coalesce(email_confirmed_at, now())
 where email like 'a%@invalid.local';
update public.entreprises
   set abonnement_statut = 'actif', abonnement_offre = 'entreprise', abonnement_echeance = current_date + 365
 where nom like 'Residuel %';
-- Modules BETA (sous-traitants, paie, CRM, interventions, facturation avancée)
-- ouverts aux tenants de recette : ils restent hors produit V3 par défaut, mais
-- leurs écrans font partie du périmètre audité.
insert into public.entreprise_feature_flags (entreprise_id, feature_key, statut, active)
select e.id, f.cle, 'beta', true
from public.entreprises e cross join (values ('subcontractors'), ('payroll'), ('crm'), ('interventions'), ('advanced_invoicing')) f(cle)
where e.nom like 'Residuel %'
on conflict (entreprise_id, feature_key) do update set statut = excluded.statut, active = excluded.active;
update public.utilisateurs u set entreprise_active_id = ue.entreprise_id
  from public.utilisateurs_entreprises ue
 where ue.utilisateur_id = u.id and ue.statut = 'actif'
   and ue.entreprise_id in (select id from public.entreprises where nom like 'Residuel %');
SQL
echo "== OK : base $BASE prête (démarrer : tests/e2e/finance-pile-locale/demarrer-pile.sh $BASE <journaux>) =="
