begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

-- À partir d'ici, on veut le garde-fou RÉEL.
reset elsatia.capacite_personnes_bypass;

-- ───────────────────────────────────────────────────────────────────────────
-- Mise en place : entreprise A sur "mini" (base 3, supplément 0).
-- La fixture crée 4 fiches employés dans A ; on en sort 2 pour partir de 2
-- personnes actives (< capacité).
-- ───────────────────────────────────────────────────────────────────────────
update public.entreprises
set abonnement_offre = 'mini', capacite_personnes_supplementaire = 0
where id = 'a0000000-0000-0000-0000-000000000001';
update public.entreprises
set abonnement_offre = 'pro', capacite_personnes_supplementaire = 0
where id = 'b0000000-0000-0000-0000-000000000001';

update public.employes set statut = 'sorti', date_sortie = current_date
where id in ('a2000000-0000-0000-0000-000000000003','a2000000-0000-0000-0000-000000000004');

-- Contrat de décompte
select is(
  public.compter_personnes_actives_entreprise('a0000000-0000-0000-0000-000000000001'),
  2, 'décompte initial A = 2 personnes actives (2 fiches sorties non comptées)'
);
select is(public.capacite_personnes_base('a0000000-0000-0000-0000-000000000001'), 3, 'capacité base A (mini) = 3');
select is(public.capacite_personnes_totale('a0000000-0000-0000-0000-000000000001'), 3, 'capacité totale A = 3');
select is(public.etat_capacite_personnes('a0000000-0000-0000-0000-000000000001'), 'ok', 'état A = ok (2/3)');

-- 1. actif < capacité → création autorisée
select lives_ok(
  $$insert into public.employes(id, entreprise_id, prenom, nom)
    values ('a2000000-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-000000000001','Cap','Trois')$$,
  '1. création autorisée quand actives < capacité'
);
select is(public.compter_personnes_actives_entreprise('a0000000-0000-0000-0000-000000000001'), 3, 'A = 3/3 après création');
select is(public.etat_capacite_personnes('a0000000-0000-0000-0000-000000000001'), 'limite_atteinte', 'état A = limite_atteinte (3/3)');

-- 2. actif == capacité → création refusée
select throws_ok(
  $$insert into public.employes(id, entreprise_id, prenom, nom)
    values ('a2000000-0000-0000-0000-0000000000a2','a0000000-0000-0000-0000-000000000001','Cap','Quatre')$$,
  'P0001', 'CAPACITE_PERSONNES_ATTEINTE',
  '2. création refusée quand actives = capacité'
);

-- 12. personne active SANS compte Auth : compte quand même dans le plafond
select throws_ok(
  $$insert into public.employes(id, entreprise_id, prenom, nom, compte_application_statut)
    values ('a2000000-0000-0000-0000-0000000000a3','a0000000-0000-0000-0000-000000000001','Sans','Login','non_ouvert')$$,
  'P0001', 'CAPACITE_PERSONNES_ATTEINTE',
  '12. une fiche sans utilisateur_id (planning/pointage) consomme une place'
);

-- 3. supplément acheté augmente la capacité
update public.entreprises set capacite_personnes_supplementaire = 2
where id = 'a0000000-0000-0000-0000-000000000001';
select is(public.capacite_personnes_totale('a0000000-0000-0000-0000-000000000001'), 5, '3. capacité totale A = 3 + 2 = 5');
select lives_ok(
  $$insert into public.employes(id, entreprise_id, prenom, nom)
    values ('a2000000-0000-0000-0000-0000000000a2','a0000000-0000-0000-0000-000000000001','Cap','Quatre')$$,
  '3. création autorisée après achat de capacité'
);
select is(public.compter_personnes_actives_entreprise('a0000000-0000-0000-0000-000000000001'), 4, 'A = 4/5');

-- 5. pause ne libère PAS de place
update public.entreprises set capacite_personnes_supplementaire = 1
where id = 'a0000000-0000-0000-0000-000000000001'; -- capacité 4, actives 4 → limite
update public.employes set compte_application_statut = 'pause'
where id = 'a2000000-0000-0000-0000-000000000001';
select is(public.compter_personnes_actives_entreprise('a0000000-0000-0000-0000-000000000001'), 4, '5. pause reste comptée (4/4)');
select throws_ok(
  $$insert into public.employes(id, entreprise_id, prenom, nom)
    values ('a2000000-0000-0000-0000-0000000000a4','a0000000-0000-0000-0000-000000000001','Apres','Pause')$$,
  'P0001', 'CAPACITE_PERSONNES_ATTEINTE',
  '5. création toujours refusée après mise en pause'
);

-- 4. archivage (compte_application_statut = ferme) libère une place
update public.employes set compte_application_statut = 'ferme'
where id = 'a2000000-0000-0000-0000-000000000002';
select is(public.compter_personnes_actives_entreprise('a0000000-0000-0000-0000-000000000001'), 3, '4. archivage ferme → 3/4');
select lives_ok(
  $$insert into public.employes(id, entreprise_id, prenom, nom)
    values ('a2000000-0000-0000-0000-0000000000a4','a0000000-0000-0000-0000-000000000001','Apres','Archivage')$$,
  '4. création autorisée après archivage'
);

-- 6. réactivation à capacité pleine refusée
--    (A est de nouveau à 4/4 ; on tente de rouvrir la fiche archivée)
select is(public.etat_capacite_personnes('a0000000-0000-0000-0000-000000000001'), 'limite_atteinte', 'A de nouveau 4/4');
select throws_ok(
  $$update public.employes set compte_application_statut = 'actif'
    where id = 'a2000000-0000-0000-0000-000000000002'$$,
  'P0001', 'CAPACITE_PERSONNES_ATTEINTE',
  '6. réactivation (ferme → actif) refusée à capacité pleine'
);
select throws_ok(
  $$update public.employes set statut = 'actif'
    where id = 'a2000000-0000-0000-0000-000000000003'$$,
  'P0001', 'CAPACITE_PERSONNES_ATTEINTE',
  '6b. réactivation (sorti → actif) refusée à capacité pleine'
);

-- 7 + 9. downgrade : over_capacity, sans suppression
update public.entreprises set capacite_personnes_supplementaire = 0
where id = 'a0000000-0000-0000-0000-000000000001'; -- capacité 3, actives 4
select is(public.compter_personnes_actives_entreprise('a0000000-0000-0000-0000-000000000001'), 4, '9. aucune fiche supprimée au downgrade (toujours 4)');
select is(public.etat_capacite_personnes('a0000000-0000-0000-0000-000000000001'), 'over_capacity', '7. downgrade → état over_capacity (4/3)');

-- 8. over_capacity → nouvelle création refusée
select throws_ok(
  $$insert into public.employes(id, entreprise_id, prenom, nom)
    values ('a2000000-0000-0000-0000-0000000000a5','a0000000-0000-0000-0000-000000000001','Over','Capacity')$$,
  'P0001', 'CAPACITE_PERSONNES_ATTEINTE',
  '8. création refusée en état over_capacity'
);
-- ... mais l'édition d'une fiche existante reste possible (gérer l'entreprise)
select lives_ok(
  $$update public.employes set telephone = '0102030405'
    where id = 'a2000000-0000-0000-0000-0000000000a1'$$,
  '8b. édition d''une fiche active existante autorisée même en over_capacity'
);
-- ... et libérer une place reste possible
select lives_ok(
  $$update public.employes set statut = 'sorti', date_sortie = current_date
    where id = 'a2000000-0000-0000-0000-0000000000a1'$$,
  '8c. sortie d''une personne autorisée en over_capacity (libère une place)'
);
select is(public.etat_capacite_personnes('a0000000-0000-0000-0000-000000000001'), 'limite_atteinte',
  'A repasse sous le plafond (3/3 = limite_atteinte) après libération'
);

-- 10. multi-tenant : A saturée n'affecte pas B
select is(public.compter_personnes_actives_entreprise('a0000000-0000-0000-0000-000000000001'), 3, 'A = 3/3 (saturée)');
select is(public.compter_personnes_actives_entreprise('b0000000-0000-0000-0000-000000000001'), 4, 'B = 4 personnes actives');
select is(public.capacite_personnes_totale('b0000000-0000-0000-0000-000000000001'), 15, 'B (pro) capacité 15');
select lives_ok(
  $$insert into public.employes(id, entreprise_id, prenom, nom)
    values ('b2000000-0000-0000-0000-0000000000b1','b0000000-0000-0000-0000-000000000001','Tenant','B')$$,
  '10. création dans B autorisée indépendamment de la saturation de A'
);

-- 11. une ligne employé "sortie" ne consomme pas de place
select is(
  (select count(*) from public.employes
   where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut = 'sorti'),
  3::bigint, '11. 3 fiches sorties présentes mais non comptées dans le plafond'
);

-- 13. mutation directe de la capacité par un client : refusée
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email','admin-a@invalid.local', true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","email":"admin-a@invalid.local","role":"authenticated","aal":"aal2"}', true);
select throws_ok(
  $$update public.entreprises set capacite_personnes_supplementaire = 99
    where id = 'a0000000-0000-0000-0000-000000000001'$$,
  '42501', null,
  '13. UPDATE direct de capacite_personnes_supplementaire refusé pour authenticated'
);
select throws_ok(
  $$select public.plateforme_definir_capacite_personnes_supplementaire(
      'a0000000-0000-0000-0000-000000000001', 50, 'tentative client', 'admin_plateforme', null)$$,
  '42501', null,
  '13b. RPC de capacité refusée hors plateforme'
);
-- le trigger s'applique aussi sous le rôle authenticated
select throws_ok(
  $$insert into public.employes(id, entreprise_id, prenom, nom)
    values ('a2000000-0000-0000-0000-0000000000a6','a0000000-0000-0000-0000-000000000001','Role','Authenticated')$$,
  'P0001', 'CAPACITE_PERSONNES_ATTEINTE',
  '13c. trigger de capacité actif y compris via le rôle authenticated'
);
reset role;

-- ACL : surface exposée correctement
select ok(
  has_function_privilege('authenticated','public.capacite_personnes_entreprise(uuid)','EXECUTE')
  and has_function_privilege('authenticated','public.verifier_capacite_personnes(uuid,integer)','EXECUTE'),
  'lecture capacité et pré-contrôle exposés à authenticated'
);
select ok(
  not has_function_privilege('anon','public.capacite_personnes_entreprise(uuid)','EXECUTE')
  and not has_function_privilege('service_role','public.plateforme_definir_capacite_personnes_supplementaire(uuid,integer,text,text,text)','EXECUTE'),
  'anon sans lecture capacité ; service_role sans RPC capacité plateforme'
);
select matches(
  pg_get_functiondef('public.trg_capacite_personnes_actives()'::regprocedure),
  'SECURITY DEFINER', 'trigger capacité en SECURITY DEFINER'
);

select * from finish();
rollback;
