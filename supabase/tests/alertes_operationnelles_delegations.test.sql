-- ALERTES-DELEGATION-V1 : preuve d'exécution réelle de deleguer_alerte_operationnelle
-- (permission du délégateur, permission et statut du destinataire, isolation
-- multi-tenant, idempotence, réassignation), pas seulement des privilèges de table.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

\ir fixtures/isolation_multitenant.inc

select has_table(
  'public', 'alertes_operationnelles_delegations',
  'Les délégations d''alertes opérationnelles sont enregistrées'
);
select has_function(
  'public', 'employes_delegables_alertes', array['uuid'],
  'La fonction de liste des employés délégables existe'
);
select has_function(
  'public', 'deleguer_alerte_operationnelle',
  array['uuid','text','text','text','text','text','uuid','text'],
  'La fonction de délégation existe'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.alertes_operationnelles_delegations'::regclass),
  'RLS active sur les délégations'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'alertes_operationnelles_delegations'),
  1,
  'Une seule politique (lecture) : toute écriture passe par la fonction security definer'
);
select ok(
  has_table_privilege('authenticated', 'public.alertes_operationnelles_delegations', 'select'),
  'Un utilisateur authentifié peut lire les délégations de son entreprise'
);
-- Le rôle authenticated a un grant table-level large (comme le reste du schéma,
-- hérité du bootstrap Supabase), donc has_table_privilege renverrait vrai :
-- la vraie protection est RLS (aucune politique insert = toute ligne refusée).
-- On le vérifie par une tentative d'écriture directe réelle, pas par le grant.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$insert into public.alertes_operationnelles_delegations (
      entreprise_id, alerte_cle, alerte_domaine, alerte_titre, alerte_href, alerte_niveau, employe_id, delegue_par_user_id
    ) values (
      'a0000000-0000-0000-0000-000000000001', 'test-ecriture-directe', 'Facturation', 'x', '/x', 'critique',
      'a2000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'
    )$$,
  '42501',
  null,
  'Aucune écriture directe possible sur la table (RLS) : uniquement via la fonction security definer'
);
reset role;

-- Comptable A (gerer_factures, sans fiche employe) délègue une alerte de
-- facturation à Admin A (fiche employe + tous les droits).
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select lives_ok(
  $$select public.deleguer_alerte_operationnelle(
    'a0000000-0000-0000-0000-000000000001', 'facture-aa000000-0000-0000-0000-000000000001',
    'Facturation', 'TEST_A_FAC_001 à encaisser', '/factures/aa000000-0000-0000-0000-000000000001',
    'critique', 'a2000000-0000-0000-0000-000000000001', 'Peux-tu relancer ce client ?'
  )$$,
  'Comptable A (gerer_factures) délègue réellement l''alerte à Admin A'
);
reset role;

select is(
  (select employe_id::text from public.alertes_operationnelles_delegations
   where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and alerte_cle = 'facture-aa000000-0000-0000-0000-000000000001'),
  'a2000000-0000-0000-0000-000000000001',
  'La délégation est enregistrée pour Admin A'
);
select is(
  (select count(*)::integer from public.notifications_utilisateurs
   where utilisateur_id = '10000000-0000-0000-0000-000000000001' and type = 'alerte_deleguee'),
  1,
  'Une notification est créée pour le destinataire via le centre existant'
);

-- Ouvrier A a une fiche employe et un compte, mais pas gerer_factures.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select throws_like(
  $$select public.deleguer_alerte_operationnelle(
    'a0000000-0000-0000-0000-000000000001', 'facture-aa000000-0000-0000-0000-000000000001',
    'Facturation', 'TEST_A_FAC_001 à encaisser', '/factures/aa000000-0000-0000-0000-000000000001',
    'critique', 'a2000000-0000-0000-0000-000000000002', null
  )$$,
  '%droits nécessaires%',
  'Ouvrier A (sans gerer_factures) ne peut pas être destinataire d''une alerte de facturation'
);
reset role;

-- Admin B n'est pas membre de l'entreprise A : mauvais tenant.
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select throws_like(
  $$select public.deleguer_alerte_operationnelle(
    'a0000000-0000-0000-0000-000000000001', 'facture-aa000000-0000-0000-0000-000000000001',
    'Facturation', 'TEST_A_FAC_001 à encaisser', '/factures/aa000000-0000-0000-0000-000000000001',
    'critique', 'a2000000-0000-0000-0000-000000000001', null
  )$$,
  '%Accès refusé%',
  'Admin B ne peut pas déléguer une alerte de l''entreprise A (mauvais tenant)'
);
reset role;

-- Comptable A tente de déléguer vers un employé de l'entreprise B.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select throws_like(
  $$select public.deleguer_alerte_operationnelle(
    'a0000000-0000-0000-0000-000000000001', 'facture-aa000000-0000-0000-0000-000000000001',
    'Facturation', 'TEST_A_FAC_001 à encaisser', '/factures/aa000000-0000-0000-0000-000000000001',
    'critique', 'b2000000-0000-0000-0000-000000000001', null
  )$$,
  '%Employé invalide%',
  'Un employé de l''entreprise B ne peut jamais être destinataire d''une délégation de l''entreprise A'
);
reset role;

-- Ouvrier A comme délégateur (n'a pas gerer_factures) : refus.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select throws_like(
  $$select public.deleguer_alerte_operationnelle(
    'a0000000-0000-0000-0000-000000000001', 'facture-aa000000-0000-0000-0000-000000000001',
    'Facturation', 'TEST_A_FAC_001 à encaisser', '/factures/aa000000-0000-0000-0000-000000000001',
    'critique', 'a2000000-0000-0000-0000-000000000001', null
  )$$,
  '%Accès refusé%',
  'Ouvrier A (sans gerer_factures) ne peut pas déléguer une alerte de facturation'
);
reset role;

-- Idempotence : redéléguer la même alerte au même employé ne crée pas de doublon.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select lives_ok(
  $$select public.deleguer_alerte_operationnelle(
    'a0000000-0000-0000-0000-000000000001', 'facture-aa000000-0000-0000-0000-000000000001',
    'Facturation', 'TEST_A_FAC_001 à encaisser', '/factures/aa000000-0000-0000-0000-000000000001',
    'critique', 'a2000000-0000-0000-0000-000000000001', 'Relance déjà faite'
  )$$,
  'Une seconde délégation identique s''exécute sans erreur'
);
reset role;
select is(
  (select count(*)::integer from public.alertes_operationnelles_delegations
   where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and alerte_cle = 'facture-aa000000-0000-0000-0000-000000000001'),
  1,
  'Idempotence : toujours une seule ligne active pour cette alerte'
);

-- Réassignation : Ouvrier A obtient gerer_factures (uniquement dans cette
-- transaction de test) puis devient une cible valide.
insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
values ('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'gerer_factures', true)
on conflict (entreprise_id, poste_id, cle_permission) do update set autorise = true;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select lives_ok(
  $$select public.deleguer_alerte_operationnelle(
    'a0000000-0000-0000-0000-000000000001', 'facture-aa000000-0000-0000-0000-000000000001',
    'Facturation', 'TEST_A_FAC_001 à encaisser', '/factures/aa000000-0000-0000-0000-000000000001',
    'critique', 'a2000000-0000-0000-0000-000000000002', 'Réassignée'
  )$$,
  'Réassignation vers Ouvrier A (désormais autorisé) exécutée sans erreur'
);
reset role;
select is(
  (select employe_id::text from public.alertes_operationnelles_delegations
   where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and alerte_cle = 'facture-aa000000-0000-0000-0000-000000000001'),
  'a2000000-0000-0000-0000-000000000002',
  'La réassignation met à jour la ligne existante (toujours une seule ligne, nouvel employé)'
);

-- Employé inactif : refus même si les droits seraient par ailleurs corrects.
update public.employes set statut = 'suspendu' where id = 'a2000000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select throws_like(
  $$select public.deleguer_alerte_operationnelle(
    'a0000000-0000-0000-0000-000000000001', 'facture-aa000000-0000-0000-0000-000000000001',
    'Facturation', 'TEST_A_FAC_001 à encaisser', '/factures/aa000000-0000-0000-0000-000000000001',
    'critique', 'a2000000-0000-0000-0000-000000000003', null
  )$$,
  '%Employé invalide%',
  'Un employé inactif (suspendu) ne peut pas être destinataire d''une délégation'
);
reset role;

-- Employé sans compte applicatif lié.
update public.employes set statut = 'actif', utilisateur_id = null where id = 'a2000000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select throws_like(
  $$select public.deleguer_alerte_operationnelle(
    'a0000000-0000-0000-0000-000000000001', 'facture-aa000000-0000-0000-0000-000000000001',
    'Facturation', 'TEST_A_FAC_001 à encaisser', '/factures/aa000000-0000-0000-0000-000000000001',
    'critique', 'a2000000-0000-0000-0000-000000000003', null
  )$$,
  '%compte applicatif%',
  'Un employé sans compte applicatif (utilisateur_id null) ne peut pas être destinataire'
);
reset role;

-- Isolation multi-tenant en lecture : une délégation de l'entreprise B n'est
-- jamais visible depuis l'entreprise A, et réciproquement chacun voit la sienne.
insert into public.alertes_operationnelles_delegations (
  entreprise_id, alerte_cle, alerte_domaine, alerte_titre, alerte_href, alerte_niveau,
  employe_id, delegue_par_user_id
) values (
  'b0000000-0000-0000-0000-000000000001', 'facture-ba000000-0000-0000-0000-000000000001',
  'Facturation', 'TEST_B_FAC_001 à encaisser', '/factures/ba000000-0000-0000-0000-000000000001',
  'critique', 'b2000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select is(
  (select count(*)::integer from public.alertes_operationnelles_delegations where alerte_cle = 'facture-ba000000-0000-0000-0000-000000000001'),
  0,
  'Admin A ne voit jamais la délégation de l''entreprise B'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select is(
  (select count(*)::integer from public.alertes_operationnelles_delegations where alerte_cle = 'facture-ba000000-0000-0000-0000-000000000001'),
  1,
  'Admin B voit bien la délégation de sa propre entreprise'
);
reset role;

select * from finish();
rollback;
