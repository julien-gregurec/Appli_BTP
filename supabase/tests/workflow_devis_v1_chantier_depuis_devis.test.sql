-- WORKFLOW-DEVIS-V1 : creer_chantier_depuis_devis() — éligibilité (devis accepté
-- uniquement), permission (gerer_chantiers), isolation cross-tenant, idempotence
-- (contrainte unique + message applicatif clair), mapping des champs.
--
-- NOTE : vérifié directement contre la base Preview liée (voir
-- docs/commercial/WORKFLOW_DEVIS_V1.md §pgTAP) car la stack Docker locale a échoué de
-- façon répétée cette session (conteneurs analytics/vector/storage unhealthy,
-- contrainte de ressources locales, sans rapport avec ce lot) — logique identique.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

\ir fixtures/isolation_multitenant.inc

insert into public.devis (id, entreprise_id, client_id, statut, montant_ht, numero) values
  ('d0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'accepte', 1000, 'DEV-A-001');
insert into public.devis (id, entreprise_id, client_id, statut, montant_ht) values
  ('d0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'brouillon', 500);
insert into public.devis (id, entreprise_id, client_id, statut, montant_ht) values
  ('d0000000-0000-0000-0000-00000000000c', 'b0000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', 'accepte', 2000);

set local role authenticated;

-- 1. Ouvrier A (sans gerer_chantiers) refusé
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);
select throws_like(
  $$select public.creer_chantier_depuis_devis('d0000000-0000-0000-0000-00000000000a', 'Test')$$,
  'Accès refusé',
  '1. Ouvrier A (sans gerer_chantiers) ne peut pas créer un chantier depuis un devis'
);

-- 2. Admin A, devis brouillon (non éligible) refusé
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select throws_like(
  $$select public.creer_chantier_depuis_devis('d0000000-0000-0000-0000-00000000000b', 'Test')$$,
  'Le devis doit être accepté%',
  '2. Un devis brouillon ne permet pas de créer un chantier'
);

-- 3. Admin A, devis B (cross-tenant) refusé — même avec l'id exact connu
select throws_like(
  $$select public.creer_chantier_depuis_devis('d0000000-0000-0000-0000-00000000000c', 'Test cross')$$,
  'Devis introuvable',
  '3. Admin A ne peut pas créer un chantier depuis un devis de l''entreprise B'
);

-- 4. Admin A, devis A accepté : création réussie
select lives_ok(
  $$select public.creer_chantier_depuis_devis('d0000000-0000-0000-0000-00000000000a', 'Chantier Test', 'Adresse test', '69000', 'Lyon', 'Description test')$$,
  '4. Admin A peut créer un chantier depuis son devis accepté'
);

select is(
  (select nom from public.chantiers where devis_source_id = 'd0000000-0000-0000-0000-00000000000a'),
  'Chantier Test', '5. Nom correctement mappé'
);
select is(
  (select adresse||'|'||code_postal||'|'||ville from public.chantiers where devis_source_id = 'd0000000-0000-0000-0000-00000000000a'),
  'Adresse test|69000|Lyon', '6. Adresse correctement mappée'
);
select is(
  (select statut from public.chantiers where devis_source_id = 'd0000000-0000-0000-0000-00000000000a'),
  'accepte', '7. Le chantier démarre au statut accepte (pas prospect) puisque créé depuis un devis déjà accepté'
);
select is(
  (select budget_previsionnel from public.chantiers where devis_source_id = 'd0000000-0000-0000-0000-00000000000a'),
  1000::numeric, '8. Budget prévisionnel = montant HT du devis source'
);

-- 5. Idempotence : deuxième tentative refusée avec message exploitable, aucun doublon
select throws_like(
  $$select public.creer_chantier_depuis_devis('d0000000-0000-0000-0000-00000000000a', 'Doublon')$$,
  'chantier_existant:%',
  '9. Une deuxième création depuis le même devis est refusée (idempotence)'
);
select is(
  (select count(*)::int from public.chantiers where devis_source_id = 'd0000000-0000-0000-0000-00000000000a'),
  1, '10. Un seul chantier existe pour ce devis malgré la tentative de doublon'
);

select * from finish();
rollback;
