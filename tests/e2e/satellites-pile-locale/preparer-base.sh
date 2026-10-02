#!/usr/bin/env bash
# Base de la recette navigateur ELSATIA SATELLITES PREVIEW READINESS V2, SANS Docker.
#
# Même socle que la recette POST-V9 : vrai PostgreSQL 16, train complet, parité GoTrue/Storage
# pour la passerelle (tests/e2e/colors-pile-locale/passerelle.mjs), vrai PostgREST
# (tests/e2e/finance-pile-locale/demarrer-pile.sh).
#
# Décor (mot de passe « test » pour tous les comptes) :
#   - seed PILOTE-BTP-V1 + fixture satellites (supabase/production/fixture_preview_satellites_pilote.sql) :
#       pilote.karim.haddad@example.test  : GP, Colors, Tools, Réserves (admin), jamais Drone ;
#       pilote.karim.belaid@example.test  : même entreprise, AUCUNE habilitation applicative ;
#   - expire@sat.invalid   : « SAT Droit expiré » — droit Colors échu (valide_jusqu_au passé) ;
#   - suspendu@sat.invalid : « SAT Colors suspendu » — droit Colors statut_commercial=suspended ;
#   - support@sat.invalid  : administrateur plateforme « support » (AAL2 simulé par la passerelle) ;
#   - julien@elsatia.fr    : propriétaire plateforme revendiqué (AAL2 simulé) — seul à pouvoir
#                            définir url_preview (A-11).
#   url_preview : gestion_pro, tools, reserves posées (origines Vercel fictives) ; colors laissée
#   NULL — la recette la définit par l'écran propriétaire.
#
# Usage : PASSERELLE_MDP_DB=… tests/e2e/satellites-pile-locale/preparer-base.sh [base] [base-modèle]
set -euo pipefail
BASE="${1:-sat_e2e}"
MODELE="${2:-}"
: "${PASSERELLE_MDP_DB:?PASSERELLE_MDP_DB requise (mot de passe local des rôles de la passerelle)}"
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPOT="$(cd "$ICI/../../.." && pwd)"
psql_base() { su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $BASE"; }

if [ -n "$MODELE" ]; then
  su postgres -c "psql -X -q -c 'drop database if exists \"$BASE\"' -c 'create database \"$BASE\" template \"$MODELE\"'"
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

echo "== seed pilote + fixture satellites =="
psql_base < "$DEPOT/supabase/production/seed_entreprise_pilote_btp.sql" > /dev/null
psql_base < "$DEPOT/supabase/production/fixture_preview_satellites_pilote.sql" > /dev/null
psql_base < "$DEPOT/supabase/production/assertions_fixture_preview_satellites_pilote.sql" > /dev/null

echo "== décor recette =="
psql_base <<'SQL'
-- Comptes du pilote : mot de passe de recette (le seed ne crée pas d'identifiant de connexion).
update auth.users
   set encrypted_password = extensions.crypt('test', extensions.gen_salt('bf')),
       email_confirmed_at = coalesce(email_confirmed_at, now()),
       instance_id = '00000000-0000-0000-0000-000000000000', aud = 'authenticated', role = 'authenticated',
       raw_app_meta_data = '{"provider":"email","providers":["email"]}', raw_user_meta_data = '{}'
 where email in ('pilote.karim.haddad@example.test', 'pilote.karim.belaid@example.test');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
select '00000000-0000-0000-0000-000000000000', id::uuid, 'authenticated', 'authenticated', email,
       extensions.crypt('test', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'
from (values
  ('5a000000-0000-4000-8000-0000000000a1', 'expire@sat.invalid'),
  ('5b000000-0000-4000-8000-0000000000b1', 'suspendu@sat.invalid'),
  ('5c000000-0000-4000-8000-0000000000c1', 'support@sat.invalid'),
  ('5d000000-0000-4000-8000-0000000000d1', 'julien@elsatia.fr')
) as c(id, email);
insert into public.utilisateurs (id, prenom, nom) values
  ('5a000000-0000-4000-8000-0000000000a1', 'Expiré', 'SAT'),
  ('5b000000-0000-4000-8000-0000000000b1', 'Suspendu', 'SAT'),
  ('5c000000-0000-4000-8000-0000000000c1', 'Support', 'SAT'),
  ('5d000000-0000-4000-8000-0000000000d1', 'Propriétaire', 'ELSATIA')
on conflict (id) do nothing;

-- Entreprises par le chemin réel (bootstrap SECURITY DEFINER), puis droits Colors dégradés.
select set_config('request.jwt.claims', '{"sub":"5a000000-0000-4000-8000-0000000000a1","role":"authenticated"}', false);
select public.creer_entreprise_bootstrap('SAT Droit expiré');
select set_config('request.jwt.claims', '{"sub":"5b000000-0000-4000-8000-0000000000b1","role":"authenticated"}', false);
select public.creer_entreprise_bootstrap('SAT Colors suspendu');
select set_config('request.jwt.claims', '', false);
update public.entreprises set abonnement_statut = 'actif', abonnement_echeance = date '2099-12-31'
 where nom in ('SAT Droit expiré', 'SAT Colors suspendu');

insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source, valide_du, valide_jusqu_au, statut_commercial)
select e.id, 'colors', true, 'manuel', now() - interval '60 days', now() - interval '1 day', 'entitled'
  from public.entreprises e where e.nom = 'SAT Droit expiré';
insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source, statut_commercial)
select e.id, 'colors', true, 'manuel', 'suspended'
  from public.entreprises e where e.nom = 'SAT Colors suspendu';
insert into public.habilitations_applications_utilisateurs (entreprise_id, utilisateur_id, application_code, role_code)
select e.id, u.id, 'colors', 'colors_admin_organisation'
  from public.entreprises e
  join (values ('SAT Droit expiré', '5a000000-0000-4000-8000-0000000000a1'::uuid),
               ('SAT Colors suspendu', '5b000000-0000-4000-8000-0000000000b1'::uuid)) as v(nom, uid) on v.nom = e.nom
  join auth.users u on u.id = v.uid;

-- Plateforme : délégué « support » et propriétaire revendiqué (AAL2 + MFA vérifiée).
insert into public.plateforme_admins (email, role, utilisateur_id, actif, statut_identite, activation_at, nom)
values ('support@sat.invalid', 'support', '5c000000-0000-4000-8000-0000000000c1', true, 'active', now(), 'Support SAT')
on conflict (email) do nothing;
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values ('5d000000-0000-4000-8000-0000000000fa', '5d000000-0000-4000-8000-0000000000d1', 'recette-totp', 'totp', 'verified', now(), now(), 'secret');
select set_config('request.jwt.claims', '{"sub":"5d000000-0000-4000-8000-0000000000d1","role":"authenticated","aal":"aal2","email":"julien@elsatia.fr"}', false);
select set_config('request.jwt.claim.sub', '5d000000-0000-4000-8000-0000000000d1', false);
select set_config('request.jwt.claim.email', 'julien@elsatia.fr', false);
set role authenticated;
select public.plateforme_proprietaire_revendiquer();
reset role;
select set_config('request.jwt.claims', '', false);
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claim.email', '', false);

-- url_preview fictives (jamais un hôte *.elsatia.fr) ; colors : définie par la recette (A-11).
update public.applications_elsatia set url_preview = case code
  when 'gestion_pro' then 'https://elsatia-gp-git-preview.vercel.app'
  when 'tools' then 'https://elsatia-tools-git-preview.vercel.app'
  when 'reserves' then 'https://elsatia-reserves-git-preview.vercel.app'
end where code in ('gestion_pro', 'tools', 'reserves');
SQL
echo "== OK : base $BASE prête =="
