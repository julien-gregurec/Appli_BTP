#!/usr/bin/env bash
# Base de la recette navigateur ELSATIA GP BUSINESS HARDENING V9.1, SANS Docker.
# Même socle que les recettes V9 (PostgreSQL 16 + train complet, vrai PostgREST, passerelle
# locale GoTrue/Storage). Mot de passe « test » pour tous les comptes :
#   gerant@gpb.invalid      Gérant (créateur de « GPB Alsace Test BTP » par le chemin réel)
#   conducteur@gpb.invalid  Conducteur de travaux (poste prédéfini)
#   chef@gpb.invalid        Chef de chantier (poste prédéfini)
#   salarie@gpb.invalid     Ouvrier (poste prédéfini, pointage personnel activé)
#   comptable@gpb.invalid   Comptable (poste prédéfini)
#   limite@gpb.invalid      « Accès limité » : consultation clients et chantiers seulement
#   autre@gpb.invalid       Gérant d'un second tenant (cloisonnement)
# Usage : PASSERELLE_MDP_DB=… preparer-base.sh [base] [base-modèle]
set -euo pipefail
BASE="${1:-gpb_e2e}"
MODELE="${2:-}"
: "${PASSERELLE_MDP_DB:?PASSERELLE_MDP_DB requise}"
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPOT="$(cd "$ICI/../../.." && pwd)"
psql_base() { su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $BASE"; }

if [ -n "$MODELE" ]; then
  su postgres -c "psql -X -q -c 'drop database if exists \"$BASE\"' -c 'create database \"$BASE\" template \"$MODELE\"'"
else
  bash "$DEPOT/scripts/local-postgres-bootstrap/rebuild_db.sh" "$BASE"
fi
su postgres -c "psql -X -q -c 'alter database \"$BASE\" set search_path = public, extensions'"

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

psql_base <<'SQL'
set elsatia.capacite_personnes_bypass = 'on';
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
select '00000000-0000-0000-0000-000000000000', id::uuid, 'authenticated', 'authenticated', email,
       extensions.crypt('test', extensions.gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'
from (values
  ('6a000000-0000-4000-8000-000000000001', 'gerant@gpb.invalid'),
  ('6a000000-0000-4000-8000-000000000002', 'conducteur@gpb.invalid'),
  ('6a000000-0000-4000-8000-000000000003', 'chef@gpb.invalid'),
  ('6a000000-0000-4000-8000-000000000004', 'salarie@gpb.invalid'),
  ('6a000000-0000-4000-8000-000000000005', 'comptable@gpb.invalid'),
  ('6a000000-0000-4000-8000-000000000006', 'limite@gpb.invalid'),
  ('6b000000-0000-4000-8000-000000000001', 'autre@gpb.invalid')) u(id, email);
insert into public.utilisateurs (id, prenom, nom) values
  ('6a000000-0000-4000-8000-000000000001', 'Gaston', 'Gérant'),
  ('6a000000-0000-4000-8000-000000000002', 'Corinne', 'Conducteur'),
  ('6a000000-0000-4000-8000-000000000003', 'Charles', 'Chef'),
  ('6a000000-0000-4000-8000-000000000004', 'Samir', 'Salarié'),
  ('6a000000-0000-4000-8000-000000000005', 'Claire', 'Comptable'),
  ('6a000000-0000-4000-8000-000000000006', 'Louis', 'Limité'),
  ('6b000000-0000-4000-8000-000000000001', 'Aline', 'Autre')
on conflict (id) do nothing;

select set_config('request.jwt.claims', '{"sub":"6a000000-0000-4000-8000-000000000001","role":"authenticated"}', false);
select public.creer_entreprise_bootstrap('GPB Alsace Test BTP');
select set_config('request.jwt.claims', '{"sub":"6b000000-0000-4000-8000-000000000001","role":"authenticated"}', false);
select public.creer_entreprise_bootstrap('GPB Autre Entreprise');
select set_config('request.jwt.claims', '', false);

update public.entreprises
   set abonnement_statut = 'actif', abonnement_offre = 'entreprise', abonnement_echeance = current_date + 365,
       horaires_journaliers = '{"1":7,"2":7,"3":7,"4":7,"5":7,"6":0,"7":0}'
 where nom in ('GPB Alsace Test BTP', 'GPB Autre Entreprise');

-- Poste « Accès limité » (consultation clients et chantiers).
insert into public.postes (entreprise_id, nom)
select id, 'Accès limité' from public.entreprises where nom = 'GPB Alsace Test BTP';
insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
select p.entreprise_id, p.id, k, true
from public.postes p cross join (values ('acces_clients'), ('acces_chantiers')) v(k)
where p.nom = 'Accès limité';

-- Comptes rattachés à leur poste, fiche salarié (coût horaire interne confidentiel).
with e as (select id from public.entreprises where nom = 'GPB Alsace Test BTP'),
comptes(uid, poste, prenom, nom, pointage) as (values
  ('6a000000-0000-4000-8000-000000000002'::uuid, 'Conducteur de travaux', 'Corinne', 'Conducteur', false),
  ('6a000000-0000-4000-8000-000000000003'::uuid, 'Chef de chantier', 'Charles', 'Chef', true),
  ('6a000000-0000-4000-8000-000000000004'::uuid, 'Ouvrier', 'Samir', 'Salarié', true),
  ('6a000000-0000-4000-8000-000000000005'::uuid, 'Comptable', 'Claire', 'Comptable', false),
  ('6a000000-0000-4000-8000-000000000006'::uuid, 'Accès limité', 'Louis', 'Limité', false))
insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut, pointage_personnel_actif)
select c.uid, e.id, p.id, 'actif', c.pointage from comptes c cross join e join public.postes p on p.entreprise_id = e.id and p.nom = c.poste;

insert into public.employes (entreprise_id, utilisateur_id, prenom, nom, statut, numero_inscription, identifiant_interne)
select e.id, u.id, u.prenom, u.nom, 'actif', 'GPB-' || right(u.id::text, 4), 'GPB' || right(u.id::text, 4)
from public.entreprises e cross join public.utilisateurs u
where e.nom = 'GPB Alsace Test BTP' and u.id::text like '6a000000-%'
  and not exists (select 1 from public.employes x where x.utilisateur_id = u.id and x.entreprise_id = e.id);
insert into public.employes_cout_horaire (entreprise_id, employe_id, cout_horaire)
select em.entreprise_id, em.id, case when em.nom = 'Salarié' then 26.50 when em.nom = 'Chef' then 41.50 else 55 end
from public.employes em join public.entreprises e on e.id = em.entreprise_id where e.nom = 'GPB Alsace Test BTP'
on conflict do nothing;
update public.utilisateurs_entreprises ue set pointage_personnel_actif = true
  from public.entreprises e where e.id = ue.entreprise_id and e.nom = 'GPB Alsace Test BTP'
   and ue.utilisateur_id = '6a000000-0000-4000-8000-000000000001';
SQL
echo "== OK : base $BASE prête =="
