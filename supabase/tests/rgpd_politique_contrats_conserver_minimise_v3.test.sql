-- RGPD × contrats acceptés — train canonique V3 (migration 20260926000504).
-- Rapport : docs/qualification/ELSATIA_CANONICAL_TRAIN_V3_FINAL_CONVERGENCE.md (§4).
--
-- Politique retenue par le propriétaire : conserver_contrat_minimise. La durée de
-- conservation n'est pas juridiquement validée : aucune durée n'est inventée, et le
-- mécanisme reste FAIL-CLOSED tant qu'une durée valide manque.
--
--   1. État livré : C enregistrée, sans durée, état effectif `duree_requise`.
--   2. Contrainte : une durée renseignée doit être strictement positive.
--   3. Purge du tenant réaliste : refus nommé DECISION_REQUIRED:RGPD-DUREE-CONSERVATION-CONTRAT
--      sur les 5 tables porteuses, AVANT écriture ; contrats, photos, factures intacts ;
--      aucune preuve figée ; entreprise non marquée purgée ; tenant B intact.
--   4. Défense en profondeur : préservation directe refusée ; autorisation R1 simulée
--      insuffisante pour supprimer un devis accepté.
--   5. Accès : l'état effectif n'est lisible que par le rapport service_role.
--   6. Activation simulée (durée de TEST, jamais écrite dans une migration) : purge complète,
--      instantanés `contrat_minimise` ; retour à « sans durée » = de nouveau fail-closed.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

\ir fixtures/isolation_multitenant.inc
\ir fixtures/rgpd_tenant_facture_emise.inc
\ir fixtures/rgpd_tenant_contrats_acceptes.inc

select set_config('t.a', 'a0000000-0000-0000-0000-000000000001', true);
select set_config('t.b', 'b0000000-0000-0000-0000-000000000001', true);
update public.entreprises set suppression_prevue_at = now() - interval '1 second' where id = current_setting('t.a')::uuid;

create temporary table _contrats_avant on commit drop as
select 'devis'::text as type_contrat, d.id, d.entreprise_id,
       public._empreinte_jsonb(public._document_contrat_accepte('devis', d.id)) as empreinte
  from public.devis d where d.statut = 'accepte'
union all
select 'avenant', a.id, a.entreprise_id, public._empreinte_jsonb(public._document_contrat_accepte('avenant', a.id))
  from public.avenants a where a.statut = 'accepte';
create temporary table _factures_avant on commit drop as
select f.id, public.empreinte_comptable_facture(f.id) as empreinte from public.factures f;
create temporary table _b_avant on commit drop as
select md5(string_agg(to_jsonb(d)::text, '|' order by d.id)) as e from public.devis d where d.entreprise_id = current_setting('t.b')::uuid;

-- ─── 1. État livré ─────────────────────────────────────────────────────
select is((select politique from platform.purge_politique_contrats), 'conserver_contrat_minimise',
  'politique retenue : conserver_contrat_minimise');
select is((select duree_conservation from platform.purge_politique_contrats), null::interval,
  'aucune durée de conservation inventée (NULL)');
select is(platform.etat_politique_contrats(), 'duree_requise',
  'état effectif : duree_requise (politique non active, fail-closed)');
select ok((select decision_ref like 'OWNER-DECISION-2026-09-26:%' and not inclure_photos from platform.purge_politique_contrats),
  'référence de la décision propriétaire consignée ; photos non incluses (défaut de minimisation)');
select ok(exists (select 1 from platform.purge_politique_contrats_journal
                   where politique = 'conserver_contrat_minimise' and duree_conservation is null),
  'le journal (ajout seul) consigne la décision sans durée');

-- ─── 2. Contrainte ─────────────────────────────────────────────────────
select throws_ok($$select platform.definir_politique_purge_contrats('conserver_contrat_minimise', 'X', interval '0')$$,
  '23514', null, 'durée nulle refusée');
select throws_ok($$select platform.definir_politique_purge_contrats('conserver_contrat_minimise', 'X', interval '-1 day')$$,
  '23514', null, 'durée négative refusée');

-- ─── 3. Purge du tenant réaliste : refus nommé, avant écriture ─────────
select set_config('rgpd.entreprise_cible', current_setting('t.a'), true);
select set_config('rgpd.run_id', 'c9000000-0000-0000-0000-0000000003a1', true);
\ir fixtures/rgpd_purge_driver.inc

select is(current_setting('rgpd.resultat'), 'incomplete:avenants,lignes_devis,pieces_jointes_devis,chantiers,devis',
  'purge incomplète, arrêtée sur les 5 tables porteuses de contrats acceptés');
select is(
  (select count(*)::integer from platform.purge_audit
    where run_id = 'c9000000-0000-0000-0000-0000000003a1' and not ok
      and erreur not like 'DECISION_REQUIRED:RGPD-DUREE-CONSERVATION-CONTRAT%'),
  0, 'tous les échecs sont le refus explicite DECISION_REQUIRED:RGPD-DUREE-CONSERVATION-CONTRAT');
select ok(
  (select bool_and(detail ->> 'decision_requise' = 'RGPD-DUREE-CONSERVATION-CONTRAT' and lignes_affectees is null)
     from platform.purge_audit where run_id = 'c9000000-0000-0000-0000-0000000003a1' and not ok),
  'refus audités avec la décision requise, aucune ligne affectée');
select is(
  (select count(*)::integer from _contrats_avant c
    where c.empreinte is distinct from public._empreinte_jsonb(public._document_contrat_accepte(c.type_contrat, c.id))),
  0, 'chaque contrat accepté (lignes, photos, signatures) est intact');
select is(
  (select count(*)::integer from storage.objects where bucket_id = 'devis-medias' and name like current_setting('t.a') || '/%'),
  2, 'photo et note vocale du devis accepté toujours présentes');
select is((select count(*)::integer from platform.contrats_acceptes_purges), 0, 'aucun instantané figé sans durée');
select is(
  (select count(*)::integer from _factures_avant f where f.empreinte is distinct from public.empreinte_comptable_facture(f.id)),
  0, 'aucune facture modifiée');
select ok((select purgee_at is null from public.entreprises where id = current_setting('t.a')::uuid),
  'entreprise non marquée purgée (échec sûr)');
select is((select md5(string_agg(to_jsonb(d)::text, '|' order by d.id)) from public.devis d where d.entreprise_id = current_setting('t.b')::uuid),
  (select e from _b_avant), 'tenant B strictement inchangé');

-- ─── 4. Défense en profondeur ──────────────────────────────────────────
select throws_ok($$select public._preserver_contrats_acceptes('a0000000-0000-0000-0000-000000000001', gen_random_uuid())$$,
  'P0001', 'DECISION_REQUIRED:RGPD-DUREE-CONSERVATION-CONTRAT — politique conserver_contrat_minimise retenue, durée de conservation non validée',
  'préservation directe refusée sans durée');
insert into platform.purge_autorisations_facture (txid, entreprise_id, table_purgee, run_id)
values (txid_current(), current_setting('t.a')::uuid, 'devis', gen_random_uuid());
select is(public._purge_contrat_autorisee(current_setting('t.a')::uuid, 'devis'), false,
  'autorisation R1 présente mais politique non active : suppression non autorisée');
select throws_ok($$delete from public.devis where id = 'c3000000-0000-0000-0000-000000000002'$$,
  'Ce devis est accepté et ne peut plus être supprimé.', 'verrou : devis accepté non supprimable même avec R1');
delete from platform.purge_autorisations_facture where txid = txid_current();

-- ─── 5. Accès ──────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok('select platform.etat_politique_contrats()', '42501', null, 'authenticated : état non lisible');
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok('select platform.etat_politique_contrats()', '42501', null, 'service_role : pas d''appel direct');
select is(
  (select row(politique, etat, duree_conservation, devis_acceptes, avenants_acceptes, preuves)
     from public.rapport_contrats_acceptes_purge(current_setting('t.a')::uuid)),
  row('conserver_contrat_minimise'::text, 'duree_requise'::text, null::interval, 3, 1, 0),
  'service_role : le rapport expose l''état effectif duree_requise');
reset role;
select set_config('request.jwt.claims', '', true);

-- ─── 6. Activation simulée (durée de TEST), puis retour fail-closed ────
select lives_ok(
  $$select platform.definir_politique_purge_contrats('conserver_contrat_minimise', 'TEST-DUREE-VALIDEE', interval '3 years', false)$$,
  'activation simulée avec une durée de test (aucune migration ne l''écrit)');
select is(platform.etat_politique_contrats(), 'conserver_contrat_minimise', 'état effectif : active');
select set_config('rgpd.run_id', 'c9000000-0000-0000-0000-0000000003a2', true);
\ir fixtures/rgpd_purge_driver.inc
select is(current_setting('rgpd.resultat'), 'complete', 'politique active : purge complète');
select is(
  (select count(*)::integer from platform.contrats_acceptes_purges
    where entreprise_id = current_setting('t.a')::uuid and niveau = 'contrat_minimise' and conserver_jusqu_au is not null),
  4, '4 instantanés contrat_minimise avec échéance');
select lives_ok($$select platform.definir_politique_purge_contrats('conserver_contrat_minimise', 'RETOUR-SANS-DUREE', null, false)$$,
  'retrait de la durée admis');
select is(platform.etat_politique_contrats(), 'duree_requise', 'sans durée : de nouveau non active (fail-closed)');

select * from finish();
rollback;
