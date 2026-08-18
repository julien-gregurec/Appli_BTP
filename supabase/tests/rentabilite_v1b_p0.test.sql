-- RENTABILITÉ-V1B : tests dynamiques des 2 corrections P0 touchant la base
-- (RLS de employes_cout_horaire, historisation du coût horaire sur pointages).
-- La formule de marge elle-même (P0 #1) est testée en unitaire côté application :
-- src/lib/rentabilite.test.ts.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

\ir fixtures/isolation_multitenant.inc

select hasnt_column('public', 'employes', 'cout_horaire', 'La colonne cout_horaire est retirée de employes (P0 #2)');
select has_column('public', 'employes_cout_horaire', 'cout_horaire', 'La table dédiée porte le coût horaire');
select has_column('public', 'pointages', 'cout_horaire_applique', 'Le pointage porte le coût figé (P0 #3)');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.employes_cout_horaire'::regclass),
  'RLS est active sur employes_cout_horaire'
);

-- Coûts horaires pour les employés existants du fixture (contexte superuser, hors RLS).
insert into public.employes_cout_horaire (employe_id, entreprise_id, cout_horaire) values
  ('a2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 20),
  ('b2000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 30)
on conflict (employe_id) do update set cout_horaire = excluded.cout_horaire;

-- Pointages de test insérés en contexte superuser (hors RLS) : le trigger de
-- cohérence verifier_pointage_coherence() lit employes/chantiers sous RLS, une
-- insertion sous une session authenticated d'une autre entreprise échouerait.
insert into public.pointages (
  id, entreprise_id, employe_id, chantier_id, date, heures_normales, heures_supplementaires, verification_statut
) values
  ('a5000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000001', current_date, 8, 0, 'sans_preuve'),
  ('a5000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000001', current_date, 8, 0, 'sans_preuve'),
  ('a5000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000001', current_date, 8, 0, 'sans_preuve')
on conflict (id) do nothing;

set local role authenticated;

-- Admin A (toutes permissions) : lit le coût A, jamais celui de B.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select is((select count(*) from public.employes_cout_horaire), 1::bigint, 'admin A ne voit que le coût horaire A');
select is((select cout_horaire from public.employes_cout_horaire limit 1), 20::numeric, 'admin A lit la bonne valeur (20)');

-- Comptable A (acces_rentabilite, sans voir_cout_interne_employe) : lit quand même.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claim.email', 'comptable-a@invalid.local', true);
select is(
  (select count(*) from public.employes_cout_horaire), 1::bigint,
  'comptable A lit via acces_rentabilite malgré l’absence de voir_cout_interne_employe'
);

-- Ouvrier A (terrain, aucune des deux permissions) : RLS masque la ligne sans erreur.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);
select is((select count(*) from public.employes_cout_horaire), 0::bigint, 'ouvrier A (terrain) ne lit aucun coût horaire');

-- Chef d’équipe A : absent du modèle de permission de ce fixture -> pas d’accès.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.email', 'chef-equipe-a@invalid.local', true);
select is((select count(*) from public.employes_cout_horaire), 0::bigint, 'chef d’équipe A sans droit financier ne lit aucun coût horaire');

-- Conducteur A : pas de droit financier -> pas d’accès.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.email', 'conducteur-a@invalid.local', true);
select is((select count(*) from public.employes_cout_horaire), 0::bigint, 'conducteur A sans droit financier ne lit aucun coût horaire');

-- Admin B : isolation cross-tenant symétrique, y compris sur une lecture ciblée par id.
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
select is((select count(*) from public.employes_cout_horaire), 1::bigint, 'admin B ne voit que le coût horaire B');
select is((select cout_horaire from public.employes_cout_horaire limit 1), 30::numeric, 'admin B lit la bonne valeur (30), jamais celle de A');
select is(
  (select count(*) from public.employes_cout_horaire where employe_id = 'a2000000-0000-0000-0000-000000000002'),
  0::bigint,
  'admin B ne peut pas lire le coût horaire d’un employé A par requête ciblée directe (accès type API)'
);

-- Historisation (P0 #3) : snapshot pris à la validation, jamais recalculé après coup.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.email', 'chef-equipe-a@invalid.local', true);
select lives_ok(
  $$select public.valider_preuve_pointage('a0000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000010', 'valide', null)$$,
  'chef d’équipe A (valider_pointages) peut valider un pointage'
);
select is(
  (select cout_horaire_applique from public.pointages where id = 'a5000000-0000-0000-0000-000000000010'),
  20::numeric,
  'le coût horaire est figé au coût courant (20) au moment de la validation'
);

reset role;
-- Changement de salaire (contexte superuser, simule une modification administrative réelle).
update public.employes_cout_horaire set cout_horaire = 25 where employe_id = 'a2000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.email', 'chef-equipe-a@invalid.local', true);

select is(
  (select cout_horaire_applique from public.pointages where id = 'a5000000-0000-0000-0000-000000000010'),
  20::numeric,
  'le pointage déjà validé garde son ancien coût figé (20) malgré le changement de salaire à 25'
);

select lives_ok(
  $$select public.valider_preuve_pointage('a0000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000011', 'valide', null)$$,
  'chef d’équipe A peut valider le pointage suivant, après le changement de salaire'
);
select is(
  (select cout_horaire_applique from public.pointages where id = 'a5000000-0000-0000-0000-000000000011'),
  25::numeric,
  'le nouveau pointage capture le nouveau coût horaire (25), sans affecter l’ancien'
);

-- Rejet : jamais de coût figé.
select lives_ok(
  $$select public.valider_preuve_pointage('a0000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000012', 'rejete', 'Motif de test')$$,
  'chef d’équipe A peut rejeter un pointage'
);
select is(
  (select cout_horaire_applique from public.pointages where id = 'a5000000-0000-0000-0000-000000000012'),
  null::numeric,
  'un pointage rejeté ne capture aucun coût horaire'
);

-- Suppression puis nouvelle déclaration : redéclenche naturellement une validation
-- et donc un nouveau snapshot, sans logique de correction spécifique nécessaire.
delete from public.pointages where id = 'a5000000-0000-0000-0000-000000000012';
select is(
  (select count(*) from public.pointages where id = 'a5000000-0000-0000-0000-000000000012'),
  0::bigint,
  'la suppression d’un pointage non validé fonctionne sans contrainte liée au coût figé'
);

-- Régression corrigée pendant ce lot : le rôle anon ne doit plus exécuter cette fonction.
reset role;
set local role anon;
select throws_ok(
  $$select public.valider_preuve_pointage('a0000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000010','valide',null)$$,
  '42501',
  null,
  'le rôle anon ne peut plus appeler valider_preuve_pointage directement (grant retiré)'
);
reset role;

select * from finish();
rollback;
