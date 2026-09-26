-- RGPD — export complet : tables enfants sans entreprise_id (migration 20260926000505).
-- Rapport : docs/qualification/ELSATIA_CANONICAL_TRAIN_V3_FINAL_CONVERGENCE.md (§4).
--
-- Tenant réaliste A (devis acceptés, avenant accepté, factures, paiements, contact client),
-- tenant B complet. L'export de A, demandé par son administrateur :
--   - contient lignes_avenants (contenu de l'avenant accepté), contacts_clients, paiements,
--     taches, chantier_transferts — exactement les lignes rattachées à A ;
--   - ne contient AUCUNE ligne de B (marqueurs de B absents) ;
--   - conserve les clés existantes (avenants, devis, factures…) et le manifeste de fichiers ;
--   - reste refusé à l'administrateur de B.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

\ir fixtures/isolation_multitenant.inc
\ir fixtures/rgpd_tenant_facture_emise.inc
\ir fixtures/rgpd_tenant_contrats_acceptes.inc

-- Compléments : tâches et transferts de chantier chez A et B ; contact et tâche marqués chez B.
insert into public.contacts_clients (id, client_id, nom, fonction, telephone, email, principal) values
  ('b8000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', 'TEST_B_CONTACT_SECRET', 'Gérant', '0600000000', 'contact-b@invalid.local', true);
insert into public.taches (id, chantier_id, libelle, statut) values
  ('a8100000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'TEST_A_TACHE', 'a_faire'),
  ('b8100000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 'TEST_B_TACHE_SECRETE', 'a_faire');
insert into public.chantier_transferts (id, chantier_id, ancien_client_id, nouveau_client_id, utilisateur_id) values
  ('a8200000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001',
   'a3000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001'),
  ('b8200000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000002', 'b3000000-0000-0000-0000-000000000001',
   'b3000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001');

create temporary table _attendu on commit drop as
select 'lignes_avenants'::text as t, count(*)::integer as n from public.lignes_avenants l
  join public.avenants a on a.id = l.avenant_id where a.entreprise_id = 'a0000000-0000-0000-0000-000000000001'
union all
select 'contacts_clients', count(*)::integer from public.contacts_clients c
  join public.clients k on k.id = c.client_id where k.entreprise_id = 'a0000000-0000-0000-0000-000000000001'
union all
select 'paiements', count(*)::integer from public.paiements p
  join public.factures f on f.id = p.facture_id where f.entreprise_id = 'a0000000-0000-0000-0000-000000000001'
union all
select 'taches', count(*)::integer from public.taches t
  join public.chantiers c on c.id = t.chantier_id where c.entreprise_id = 'a0000000-0000-0000-0000-000000000001'
union all
select 'chantier_transferts', count(*)::integer from public.chantier_transferts t
  join public.chantiers c on c.id = t.chantier_id where c.entreprise_id = 'a0000000-0000-0000-0000-000000000001';
grant select on _attendu to authenticated;

select ok((select n from _attendu where t = 'lignes_avenants') >= 1 and (select n from _attendu where t = 'paiements') >= 1
          and (select n from _attendu where t = 'contacts_clients') >= 1,
  'jeu de données : A a des lignes d''avenant, des paiements et un contact client');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
create temporary table _export on commit drop as
select public.exporter_donnees_entreprise('a0000000-0000-0000-0000-000000000001') as e;

select is(jsonb_array_length((select e -> 'donnees' -> 'lignes_avenants' from _export)),
  (select n from _attendu where t = 'lignes_avenants'), 'export : lignes_avenants présentes, exactement celles de A');
select ok((select e -> 'donnees' -> 'lignes_avenants' -> 0 ? 'designation' from _export),
  'export : contenu contractuel de la ligne d''avenant (désignation) inclus');
select is(jsonb_array_length((select e -> 'donnees' -> 'contacts_clients' from _export)),
  (select n from _attendu where t = 'contacts_clients'), 'export : contacts_clients de A');
select is(jsonb_array_length((select e -> 'donnees' -> 'paiements' from _export)),
  (select n from _attendu where t = 'paiements'), 'export : paiements de A');
select is(jsonb_array_length((select e -> 'donnees' -> 'taches' from _export)),
  (select n from _attendu where t = 'taches'), 'export : taches de A');
select is(jsonb_array_length((select e -> 'donnees' -> 'chantier_transferts' from _export)),
  (select n from _attendu where t = 'chantier_transferts'), 'export : chantier_transferts de A');
select ok(position('TEST_B_' in (select e::text from _export)) = 0
          and position('b0000000-0000-0000-0000-000000000001' in (select e::text from _export)) = 0,
  'export de A : aucune donnée ni identifiant du tenant B');
select ok((select (e -> 'donnees') ?& array['avenants', 'devis', 'factures', 'clients', 'entreprise'] from _export),
  'export : clés existantes conservées (avenants, devis, factures, clients, entreprise)');
select ok((select e -> 'manifeste_fichiers' ? 'fichiers' from _export), 'export : manifeste de fichiers conservé');
select is(
  (select count(*)::integer from jsonb_array_elements((select e -> 'donnees' -> 'lignes_avenants' from _export)) l
    where (l ->> 'avenant_id')::uuid not in (select id from public.avenants where entreprise_id = 'a0000000-0000-0000-0000-000000000001')),
  0, 'export : chaque ligne d''avenant appartient à un avenant de A');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.exporter_donnees_entreprise('a0000000-0000-0000-0000-000000000001')$$,
  'Accès refusé', 'administrateur de B : export de A refusé');
select ok(position('TEST_A_' in public.exporter_donnees_entreprise('b0000000-0000-0000-0000-000000000001')::text) = 0
          and position('TEST_B_CONTACT_SECRET' in public.exporter_donnees_entreprise('b0000000-0000-0000-0000-000000000001')::text) > 0,
  'export de B : son propre contact, rien de A');
reset role;

set local role anon;
select throws_ok($$select public.exporter_donnees_entreprise('a0000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'anon : aucun accès à l''export');
reset role;

select * from finish();
rollback;
