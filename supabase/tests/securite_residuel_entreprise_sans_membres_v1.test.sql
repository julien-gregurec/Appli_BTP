-- Security Residual V2 (train canonique V9) — migration 20261002001001.
-- La clause fail-open « entreprise_sans_membres » est retirée des policies de
-- postes, permissions_poste et utilisateurs_entreprises ; les parcours légitimes
-- (création atomique, adhésion par code, invitation par un gestionnaire) restent ouverts.
-- Contre-épreuve : sur V8 + 813 (sans 1001), les tests 1, 2 et 3 échouent (have 5 / 10 / 903) ;
-- les tests 4 à 7 y passent déjà, l'écriture étant arrêtée par les seules policies
-- RESTRICTIVE role_gestion_* du lot Employés (seconde barrière).
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

create or replace function pg_temp.agir(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'gerant-a@residuel.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b1000000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', 'etranger@residuel.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1000000-0000-4000-8000-0000000000c1', 'authenticated', 'authenticated', 'invite@residuel.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-0000000000d1', 'authenticated', 'authenticated', 'nouveau@residuel.test', 'x', now(), now(), now());
insert into public.utilisateurs (id, prenom, nom) values
  ('a1000000-0000-4000-8000-0000000000a1', 'Gérant', 'A'),
  ('b1000000-0000-4000-8000-0000000000b1', 'Étranger', 'X'),
  ('c1000000-0000-4000-8000-0000000000c1', 'Invité', 'C'),
  ('d1000000-0000-4000-8000-0000000000d1', 'Nouveau', 'D')
on conflict (id) do nothing;

-- Entreprise A : créée par son gérant (bootstrap atomique SECURITY DEFINER).
select pg_temp.agir('a1000000-0000-4000-8000-0000000000a1');
create temp table ctx as select public.creer_entreprise_bootstrap('Résiduel A') as ent_a;
grant select on ctx to authenticated;

-- Entreprise V : créée par la plateforme, sans aucun membre (en attente de son dirigeant).
insert into public.entreprises (id, nom, raison_sociale, abonnement_statut, abonnement_note)
values ('e1000000-0000-4000-8000-0000000000e1', 'Résiduel vide', 'Résiduel vide', 'essai', 'Créée par la plateforme');
do $$ declare r record; begin
  for r in select cle from public.modeles_roles_predefinis order by ordre loop
    perform public.appliquer_modele_role_predefini_interne('e1000000-0000-4000-8000-0000000000e1', r.cle, true);
  end loop;
end $$;
create temp table code_v as select code_adhesion from public.entreprises where id = 'e1000000-0000-4000-8000-0000000000e1';
grant select on code_v to authenticated;

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public'
      and tablename in ('postes', 'permissions_poste', 'utilisateurs_entreprises')
      and (coalesce(qual, '') || coalesce(with_check, '')) ilike '%entreprise_sans_membres%'),
  0, 'Aucune policy du socle comptes ne référence plus entreprise_sans_membres');

-- Étranger authentifié, sans entreprise.
select pg_temp.agir('b1000000-0000-4000-8000-0000000000b1');
set local role authenticated;

select is((select count(*)::int from public.postes where entreprise_id = 'e1000000-0000-4000-8000-0000000000e1'),
  0, 'Un étranger ne lit plus les postes d''une entreprise sans membres');
select is((select count(*)::int from public.permissions_poste where entreprise_id = 'e1000000-0000-4000-8000-0000000000e1'),
  0, 'Un étranger ne lit plus la matrice de permissions d''une entreprise sans membres');
select throws_ok(
  $$insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut)
    select 'b1000000-0000-4000-8000-0000000000b1', 'e1000000-0000-4000-8000-0000000000e1', null, 'actif'$$,
  '42501', null, 'Un étranger ne peut pas s''auto-rattacher à une entreprise sans membres');
select throws_ok(
  $$insert into public.postes (entreprise_id, nom) values ('e1000000-0000-4000-8000-0000000000e1', 'Poste pirate')$$,
  '42501', null, 'Un étranger ne peut pas créer de poste dans une entreprise sans membres');

reset role;
select pg_temp.agir('b1000000-0000-4000-8000-0000000000b1');
set local role authenticated;
with m as (update public.postes set nom = nom where entreprise_id = 'e1000000-0000-4000-8000-0000000000e1' returning 1)
select is((select count(*)::int from m), 0, 'Un étranger ne voit aucun poste à modifier dans une entreprise sans membres');
with m as (update public.permissions_poste set autorise = true where entreprise_id = 'e1000000-0000-4000-8000-0000000000e1' returning 1)
select is((select count(*)::int from m), 0, 'Un étranger ne voit aucune permission à modifier dans une entreprise sans membres');
select ok(not public.est_membre_actif('e1000000-0000-4000-8000-0000000000e1'), 'L''étranger n''est pas membre de l''entreprise sans membres');

-- Témoin multi-tenant : l'entreprise peuplée A reste fermée à l'étranger.
select is((select count(*)::int from public.postes where entreprise_id = (select ent_a from ctx)),
  0, 'Un étranger ne lit pas les postes d''une entreprise peuplée');

-- Parcours légitimes.
reset role;
select pg_temp.agir('a1000000-0000-4000-8000-0000000000a1');
set local role authenticated;
select ok((select count(*) from public.postes where entreprise_id = (select ent_a from ctx)) > 0,
  'Le gérant lit les postes de son entreprise');
select ok((select count(*) from public.permissions_poste where entreprise_id = (select ent_a from ctx)) > 0,
  'Le gérant lit la matrice de permissions de son entreprise');
select lives_ok(
  $$insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut)
    select 'c1000000-0000-4000-8000-0000000000c1', ent_a, null, 'en_attente_validation' from ctx$$,
  'Le gérant invite toujours un utilisateur dans son entreprise');
select throws_ok(
  $$insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut)
    values ('a1000000-0000-4000-8000-0000000000a1', 'e1000000-0000-4000-8000-0000000000e1', null, 'actif')$$,
  '42501', null, 'Un membre d''une autre entreprise ne peut pas s''auto-rattacher à une entreprise sans membres');

reset role;
select pg_temp.agir('d1000000-0000-4000-8000-0000000000d1');
set local role authenticated;
select lives_ok($$select public.creer_entreprise_bootstrap('Résiduel D')$$,
  'La création atomique d''entreprise fonctionne sans la clause');
select ok((select count(*) from public.postes p join public.utilisateurs u on u.entreprise_active_id = p.entreprise_id
           where u.id = 'd1000000-0000-4000-8000-0000000000d1') > 0,
  'Le nouveau dirigeant lit les postes de l''entreprise qu''il vient de créer');

reset role;
select pg_temp.agir('b1000000-0000-4000-8000-0000000000b1');
set local role authenticated;
select is(
  (public.rejoindre_entreprise_par_code((select code_adhesion from code_v)) ->> 'statut'),
  'en_attente_validation',
  'L''adhésion par code reste ouverte et place le demandeur en attente de validation');

reset role;
select * from finish();
rollback;
