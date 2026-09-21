-- TERRAIN-MOBILE-V1C : la sécurité ne dépend jamais du masquage UI. Ces tests
-- appellent directement les tables/RPC comme le ferait une Server Action
-- invoquée sans passer par le formulaire (le scénario que le mécanisme CSS
-- "lecture seule" ne protégeait pas), pour prouver que RLS/permissions
-- tiennent la barrière indépendamment de l'interface.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

\ir fixtures/isolation_multitenant.inc

-- Le fixture partagé ne seed aucune affectation : nécessaire pour tester
-- réellement UPDATE/DELETE (INSERT sur table vide ne prouve rien de plus).
insert into public.affectations (id, entreprise_id, chantier_id, employe_id, date, heures, type_activite) values
  ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', current_date, 4, 'chantier');

-- ===== Planning : creerAffectationAction/modifierAffectationAction/
-- supprimerGroupeAffectationsAction n'ont aucune vérification de permission
-- applicative (contrairement à chantiers.ts) — RLS est la seule barrière.

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);

select throws_like(
  $$insert into public.affectations (entreprise_id, chantier_id, employe_id, date, heures, type_activite)
    values ('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', current_date + 5, 4, 'chantier')$$,
  '%row-level security%',
  'ouvrier A (sans gerer_planning) ne peut pas créer une affectation en appelant directement la table'
);

select lives_ok(
  $$update public.affectations set heures = 8 where id = 'c1000000-0000-0000-0000-000000000001'$$,
  'la tentative de modification directe d''une affectation par ouvrier A ne lève pas d''erreur...'
);
reset role;
select is(
  (select heures from public.affectations where id = 'c1000000-0000-0000-0000-000000000001'),
  4::numeric,
  '...mais ne modifie rien (vérifié en superuser) : gerer_planning reste requis'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$delete from public.affectations where id = 'c1000000-0000-0000-0000-000000000001'$$,
  'la tentative de suppression directe par ouvrier A ne lève pas d''erreur...'
);
reset role;
select ok(
  exists(select 1 from public.affectations where id = 'c1000000-0000-0000-0000-000000000001'),
  '...mais ne supprime rien (vérifié en superuser)'
);

-- Conducteur A a gerer_planning (fixture — le chef équipe A du fixture n'a que
-- acces_planning en lecture, pas gerer_planning) : la même action directe réussit.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.email', 'conducteur-a@invalid.local', true);
select lives_ok(
  $$insert into public.affectations (entreprise_id, chantier_id, employe_id, date, heures, type_activite)
    values ('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', current_date + 6, 4, 'chantier')$$,
  'conducteur A (gerer_planning) peut créer une affectation directement'
);

-- Cross-tenant : même conducteur A ne peut rien faire chez B.
select throws_like(
  $$insert into public.affectations (entreprise_id, chantier_id, employe_id, date, heures, type_activite)
    values ('b0000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002', current_date + 6, 4, 'chantier')$$,
  '%row-level security%',
  'conducteur A ne peut pas créer d''affectation chez B (isolation cross-tenant)'
);

reset role;

-- ===== Nettoyage des branches auth.role()='anon' vestigiales =====

select ok(
  (select count(*) from pg_proc
   where proname in ('peut_pointer_pour_employe','peut_consulter_pointage_employe','cloturer_session_pointage_interne','valider_preuve_pointage')
     and prosrc ilike '%anon%') = 0,
  'aucune des 4 fonctions de pointage ne référence plus auth.role()=''anon'''
);

select ok(
  not has_function_privilege('anon', 'public.peut_pointer_pour_employe(uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.peut_consulter_pointage_employe(uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.valider_preuve_pointage(uuid,uuid,text,text)', 'EXECUTE'),
  'anon ne possède toujours aucun privilège EXECUTE sur ces fonctions (confirme que le nettoyage ne change aucun comportement observable)'
);

-- Non-régression du comportement réel de peut_pointer_pour_employe après le nettoyage.
-- saisir_son_pointage suit une règle à part (pointage_personnel_actif, découverte
-- PLANNING-POINTAGE-V1) que le fixture partagé ne positionne pas : nécessaire ici.
update public.utilisateurs_entreprises set pointage_personnel_actif = true
  where utilisateur_id = '10000000-0000-0000-0000-000000000002' and entreprise_id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select ok(
  public.peut_pointer_pour_employe('a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002'),
  'ouvrier A peut toujours pointer pour lui-même après le nettoyage des branches anon'
);
select ok(
  not public.peut_pointer_pour_employe('a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000003'),
  'ouvrier A ne peut toujours pas pointer pour un collègue (impersonation) après le nettoyage'
);
reset role;

-- ===== Financier : non-régression après tous les changements V1B/V1C =====
-- Ouvrier A n'a ni acces_devis ni acces_factures : RLS doit rendre ces
-- tables invisibles (0 ligne, pas une erreur), quel que soit l'entreprise.

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is(
  (select count(*)::integer from public.devis where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
  0,
  'ouvrier A ne voit aucun devis de sa propre entreprise (RLS financière inchangée)'
);
select is(
  (select count(*)::integer from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
  0,
  'ouvrier A ne voit aucune facture de sa propre entreprise (RLS financière inchangée)'
);
reset role;

select * from finish();
rollback;
