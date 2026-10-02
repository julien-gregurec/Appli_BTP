#!/usr/bin/env bash
# Base de la recette navigateur ELSATIA POST-V9 HARDENING V1, SANS Docker.
#
# Même socle que les recettes locales Finance / Employés : vrai PostgreSQL 16, train complet,
# parité GoTrue/Storage pour la passerelle (tests/e2e/colors-pile-locale/passerelle.mjs),
# vrai PostgREST (tests/e2e/finance-pile-locale/demarrer-pile.sh).
#
# Décor (mot de passe « test » pour tous) :
#   - gerant@pv9.invalid      : gérant de « PV9 Entreprise A » (abonnement actif, un client, un chantier) ;
#   - secret-b@pv9.invalid    : gérant de « PV9 Tenant Secret B » (ne doit jamais apparaître ailleurs) ;
#   - sans-entreprise@pv9.invalid : authentifié, aucune entreprise (onboarding bloquant) ;
#   - plateforme@pv9.invalid  : administrateur plateforme « total » (AAL2 simulé par la passerelle,
#     PASSERELLE_AAL2_EMAILS=plateforme@pv9.invalid).
#
# Usage : PASSERELLE_MDP_DB=… tests/e2e/post-v9-pile-locale/preparer-base.sh [base] [base-modèle]
#   base-modèle (facultatif) : base déjà migrée à copier au lieu de rejouer le train.
set -euo pipefail
BASE="${1:-pv9_e2e}"
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

echo "== décor =="
psql_base <<'SQL'
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', '9a000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'gerant@pv9.invalid',
   extensions.crypt('test', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '9b000000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', 'secret-b@pv9.invalid',
   extensions.crypt('test', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '9c000000-0000-4000-8000-0000000000c1', 'authenticated', 'authenticated', 'sans-entreprise@pv9.invalid',
   extensions.crypt('test', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '9d000000-0000-4000-8000-0000000000d1', 'authenticated', 'authenticated', 'plateforme@pv9.invalid',
   extensions.crypt('test', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}');
insert into public.utilisateurs (id, prenom, nom) values
  ('9a000000-0000-4000-8000-0000000000a1', 'Gérant', 'PV9'),
  ('9b000000-0000-4000-8000-0000000000b1', 'Secret', 'B'),
  ('9c000000-0000-4000-8000-0000000000c1', 'Sans', 'Entreprise'),
  ('9d000000-0000-4000-8000-0000000000d1', 'Admin', 'Plateforme')
on conflict (id) do nothing;

-- Entreprises créées par le chemin réel (bootstrap atomique SECURITY DEFINER).
select set_config('request.jwt.claims', '{"sub":"9a000000-0000-4000-8000-0000000000a1","role":"authenticated"}', false);
select public.creer_entreprise_bootstrap('PV9 Entreprise A');
select set_config('request.jwt.claims', '{"sub":"9b000000-0000-4000-8000-0000000000b1","role":"authenticated"}', false);
select public.creer_entreprise_bootstrap('PV9 Tenant Secret B');
select set_config('request.jwt.claims', '', false);

update public.entreprises
   set abonnement_statut = 'actif', abonnement_offre = 'entreprise', abonnement_echeance = current_date + 365
 where nom in ('PV9 Entreprise A', 'PV9 Tenant Secret B');

-- Chantier (module cœur « jobs ») pour l'archivage manuel d'un e-mail (champ datetime-local).
insert into public.clients (id, entreprise_id, nom)
select '9e000000-0000-4000-8000-0000000000e1', id, 'Client PV9' from public.entreprises where nom = 'PV9 Entreprise A';
insert into public.chantiers (id, entreprise_id, client_id, nom)
select '9f000000-0000-4000-8000-0000000000f1', id, '9e000000-0000-4000-8000-0000000000e1', 'Chantier PV9'
  from public.entreprises where nom = 'PV9 Entreprise A';

insert into public.plateforme_admins (email, role, utilisateur_id, actif, statut_identite, activation_at, nom)
values ('plateforme@pv9.invalid', 'total', '9d000000-0000-4000-8000-0000000000d1', true, 'active', now(), 'Admin PV9')
on conflict (email) do update set role = 'total', utilisateur_id = excluded.utilisateur_id, actif = true,
  statut_identite = 'active', activation_at = now();
SQL
echo "== OK : base $BASE prête =="
