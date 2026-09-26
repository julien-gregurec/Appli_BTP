-- RGPD × contrats acceptés — V1 (migration 20260926000402, rapport
-- docs/qualification/ELSATIA_RGPD_ACCEPTED_CONTRACTS_RECONCILIATION_V1.md).
--
--   1. Politique par défaut `non_decidee` : la purge du tenant réaliste s'arrête sur les
--      contrats acceptés avec un refus explicite (DECISION_REQUIRED), avant écriture ;
--      contrats, lignes, photos et factures intacts ; aucune preuve figée.
--   2. Accès : la politique et les preuves sont inatteignables pour authenticated et
--      service_role (hors fonctions dédiées) ; aucun contrat accepté ne devient
--      modifiable, ni pour l'administrateur du tenant, ni pour service_role hors purge.
--   3. Exception de purge (politique activée, autorisation R1 simulée) : bornée à la
--      bonne table, au bon tenant, à une preuve À JOUR du contenu exact ; aucun champ
--      ne devient modifiable.
--   4. Immutabilité des preuves, de la politique et de son journal.
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

\ir fixtures/isolation_multitenant.inc
\ir fixtures/rgpd_tenant_facture_emise.inc
\ir fixtures/rgpd_tenant_contrats_acceptes.inc

select set_config('t.a', 'a0000000-0000-0000-0000-000000000001', true);
select set_config('t.b', 'b0000000-0000-0000-0000-000000000001', true);
select set_config('t.avenant', (select id::text from public.avenants where entreprise_id = current_setting('t.a')::uuid and statut = 'accepte'), true);
update public.entreprises set suppression_prevue_at = now() - interval '1 second' where id = current_setting('t.a')::uuid;

-- Contrats acceptés et factures avant toute opération.
create temporary table _contrats_avant on commit drop as
select 'devis'::text as type_contrat, d.id, d.entreprise_id,
       public._empreinte_jsonb(public._document_contrat_accepte('devis', d.id)) as empreinte
  from public.devis d where d.statut = 'accepte'
union all
select 'avenant', a.id, a.entreprise_id, public._empreinte_jsonb(public._document_contrat_accepte('avenant', a.id))
  from public.avenants a where a.statut = 'accepte';
create temporary table _factures_avant on commit drop as
select f.id, public.empreinte_comptable_facture(f.id) as empreinte from public.factures f;

-- ─── 1. Politique par défaut ───────────────────────────────────────────
select is((select politique from platform.purge_politique_contrats), 'non_decidee',
  'politique par défaut : non_decidee (aucune décision juridique prise par la migration)');
select ok((select count(*) from platform.purge_politique_contrats_journal where politique = 'non_decidee') >= 1,
  'le journal des politiques consigne l''état par défaut');
select is((select count(*)::integer from _contrats_avant where entreprise_id = current_setting('t.a')::uuid), 4,
  'tenant A : 3 devis acceptés + 1 avenant accepté');

-- Administrateur du tenant (avant la purge, qui supprime ses droits applicatifs).
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok('delete from public.devis where id = ''c3000000-0000-0000-0000-000000000002''',
  'Ce devis est accepté et ne peut plus être supprimé.', 'admin du tenant : suppression d''un devis accepté refusée');
select throws_ok('update public.devis set notes_client = ''modifié'' where id = ''c3000000-0000-0000-0000-000000000002''',
  'Ce devis est accepté et ne peut plus être modifié.', 'admin du tenant : modification d''un devis accepté refusée');
select throws_ok('update public.lignes_devis set designation = ''modifié'' where id = ''c3100000-0000-0000-0000-000000000011''',
  'Ce devis est accepté : ses lignes ne peuvent plus être modifiées.', 'admin du tenant : modification d''une ligne refusée');
select throws_ok(format('delete from public.avenants where id = %L', current_setting('t.avenant')),
  'Cet avenant est accepté et ne peut plus être supprimé.', 'admin du tenant : suppression d''un avenant accepté refusée');
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);

select set_config('rgpd.entreprise_cible', current_setting('t.a'), true);
select set_config('rgpd.run_id', 'c9000000-0000-0000-0000-0000000000e1', true);
\ir fixtures/rgpd_purge_driver.inc

select is(current_setting('rgpd.resultat'), 'incomplete:avenants,lignes_devis,pieces_jointes_devis,chantiers,devis',
  'non_decidee : purge incomplète, arrêtée sur les tables des contrats acceptés');
select is(
  (select count(*)::integer from platform.purge_audit
    where run_id = 'c9000000-0000-0000-0000-0000000000e1' and not ok
      and erreur not like 'DECISION_REQUIRED:RGPD-PURGE-VS-CONTRAT-ACCEPTE%'),
  0, 'non_decidee : tous les échecs sont le refus explicite DECISION_REQUIRED');
select is(
  (select array_agg(distinct table_nom order by table_nom) from platform.purge_audit
    where run_id = 'c9000000-0000-0000-0000-0000000000e1' and not ok),
  array['avenants', 'chantiers', 'devis', 'lignes_devis', 'pieces_jointes_devis'],
  'non_decidee : refus sur les 5 tables porteuses (dont pieces_jointes_devis, sans verrou propre)');
select is(
  (select count(*)::integer from _contrats_avant c
    where c.empreinte is distinct from public._empreinte_jsonb(public._document_contrat_accepte(c.type_contrat, c.id))),
  0, 'non_decidee : chaque contrat accepté (lignes, photos, signatures comprises) est intact');
select is(
  (select count(*)::integer from storage.objects where bucket_id = 'devis-medias' and name like current_setting('t.a') || '/%'),
  2, 'non_decidee : la photo et la note vocale du devis accepté sont toujours dans Storage');
select is((select count(*)::integer from platform.contrats_acceptes_purges), 0, 'non_decidee : aucune preuve figée');
select is(
  (select count(*)::integer from _factures_avant f where f.empreinte is distinct from public.empreinte_comptable_facture(f.id)),
  0, 'non_decidee : aucune facture modifiée');
select ok((select purgee_at is null from public.entreprises where id = current_setting('t.a')::uuid),
  'non_decidee : entreprise non marquée purgée (échec sûr)');

-- ─── 2. Accès ──────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok('select * from platform.purge_politique_contrats', '42501', null,
  'authenticated : aucun accès à la politique');
select throws_ok($$select platform.definir_politique_purge_contrats('supprimer_apres_preuve', 'X')$$, '42501', null,
  'authenticated : ne peut pas définir la politique');
select throws_ok('select * from public.rapport_contrats_acceptes_purge(''a0000000-0000-0000-0000-000000000001'')', '42501', null,
  'authenticated : pas de rapport des contrats');
select throws_ok('select * from public.lire_contrats_acceptes_purges(''a0000000-0000-0000-0000-000000000001'')', '42501', null,
  'authenticated : pas de lecture des preuves');
select throws_ok('select public._preserver_contrats_acceptes(''a0000000-0000-0000-0000-000000000001'', gen_random_uuid())', '42501', null,
  'authenticated : ne peut pas figer de preuve');
reset role;

set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok($$select platform.definir_politique_purge_contrats('supprimer_apres_preuve', 'X')$$, '42501', null,
  'service_role : ne peut pas définir la politique (décision = migration)');
select throws_ok('update platform.purge_politique_contrats set politique = ''supprimer_apres_preuve''', '42501', null,
  'service_role : ne peut pas écrire la politique');
select throws_ok('select * from platform.contrats_acceptes_purges', '42501', null,
  'service_role : pas d''accès direct aux preuves');
select throws_ok('select public._preserver_contrats_acceptes(''a0000000-0000-0000-0000-000000000001'', gen_random_uuid())', '42501', null,
  'service_role : ne peut pas figer de preuve hors purge');
select is(
  (select row(politique, devis_acceptes, avenants_acceptes, preuves) from public.rapport_contrats_acceptes_purge(current_setting('t.a')::uuid)),
  row('non_decidee'::text, 3, 1, 0), 'service_role : rapport des contrats (politique, 3 devis, 1 avenant, 0 preuve)');
reset role;

-- Politique activée (par le propriétaire, comme le ferait une migration de décision).
select lives_ok($$select platform.definir_politique_purge_contrats('supprimer_apres_preuve', 'TEST-DECISION-SECU')$$,
  'propriétaire : politique activée avec référence de décision');

set local role service_role;
select throws_ok('delete from public.devis where id = ''c3000000-0000-0000-0000-000000000002''', '42501', null,
  'service_role hors purge (politique activée) : aucun droit DELETE sur devis');
select throws_ok(format('delete from public.avenants where id = %L', current_setting('t.avenant')), '42501', null,
  'service_role hors purge : aucun droit DELETE sur avenants');
select throws_ok('truncate public.lignes_avenants',
  'TRUNCATE interdit sur lignes_avenants : un contrat accepté ne disparaît que par la purge RGPD, après preuve.',
  'service_role : TRUNCATE des lignes d''avenants refusé (contournerait les verrous)');
select throws_ok('truncate public.pieces_jointes_devis',
  'TRUNCATE interdit sur pieces_jointes_devis : un contrat accepté ne disparaît que par la purge RGPD, après preuve.',
  'service_role : TRUNCATE des pièces jointes de devis refusé');
reset role;
-- Les écritures suivantes sont faites par le propriétaire des tables (les privilèges de
-- purger_table_entreprise, SECURITY DEFINER) : seul le verrou peut les arrêter.

-- ─── 3. Exception de purge (autorisation R1 simulée par le propriétaire) ─
insert into platform.purge_autorisations_facture (txid, entreprise_id, table_purgee) values (txid_current(), current_setting('t.a')::uuid, 'devis');
select throws_ok('delete from public.devis where id = ''c3000000-0000-0000-0000-000000000002''',
  'Ce devis est accepté et ne peut plus être supprimé.', 'bonne autorisation mais aucune preuve figée : suppression refusée');
delete from platform.purge_autorisations_facture;
select is(public._preserver_contrats_acceptes(current_setting('t.a')::uuid, 'c9000000-0000-0000-0000-0000000000e2'), 4,
  'preuve figée pour les 4 contrats du tenant A (et pas ceux de B)');
insert into platform.purge_autorisations_facture (txid, entreprise_id, table_purgee) values (txid_current(), current_setting('t.a')::uuid, 'chantiers');
select throws_ok('delete from public.devis where id = ''c3000000-0000-0000-0000-000000000002''',
  'Ce devis est accepté et ne peut plus être supprimé.', 'preuve figée mais autorisation d''une autre étape (chantiers) : suppression refusée');
insert into platform.purge_autorisations_facture (txid, entreprise_id, table_purgee) values (txid_current(), current_setting('t.a')::uuid, 'devis');
select throws_ok('update public.devis set montant_ht = 1 where id = ''c3000000-0000-0000-0000-000000000002''',
  'Ce devis est accepté et ne peut plus être modifié.', 'pendant la purge, preuve figée : le montant reste verrouillé');
select throws_ok('update public.devis set chantier_id = null where id = ''c3000000-0000-0000-0000-000000000002''',
  'Ce devis est accepté et ne peut plus être modifié.', 'pendant la purge : délier un chantier qui existe encore est refusé');
select throws_ok('delete from public.devis where id = ''b9000000-0000-0000-0000-000000000001''',
  'Ce devis est accepté et ne peut plus être supprimé.', 'autorisation du tenant A : devis accepté du tenant B intouchable');
-- Preuve périmée : une photo ajoutée après la preuve change le document.
insert into public.pieces_jointes_devis (entreprise_id, devis_id, storage_path, nom_original, mime_type, type_media, taille_octets)
values (current_setting('t.a')::uuid, 'c3000000-0000-0000-0000-000000000002',
        'a0000000-0000-0000-0000-000000000001/c3000000-0000-0000-0000-000000000002/ajout.jpg', 'ajout.jpg', 'image/jpeg', 'image', 10);
select throws_ok('delete from public.devis where id = ''c3000000-0000-0000-0000-000000000002''',
  'Ce devis est accepté et ne peut plus être supprimé.', 'preuve périmée (contenu changé depuis) : suppression refusée');
select is(public._preserver_contrats_acceptes(current_setting('t.a')::uuid, 'c9000000-0000-0000-0000-0000000000e2'), 1,
  'nouvelle preuve figée pour le seul contrat modifié (ajout seul, l''ancienne est gardée)');
select lives_ok('delete from public.devis where id = ''c3000000-0000-0000-0000-000000000002''',
  'autorisation + preuve à jour : la suppression passe');
select is((select count(*)::integer from platform.contrats_acceptes_purges where source_id = 'c3000000-0000-0000-0000-000000000002'), 2,
  'les deux versions de la preuve restent');
select is((select count(*)::integer from public.devis where id = 'b9000000-0000-0000-0000-000000000001' and statut = 'accepte'), 1,
  'tenant B : devis accepté intact');

-- ─── 4. Immutabilité ───────────────────────────────────────────────────
select throws_ok('update platform.contrats_acceptes_purges set contenu = ''{}''', 'Une preuve de contrat purgé est immuable',
  'preuve : modification refusée (même au propriétaire)');
select throws_ok('delete from platform.contrats_acceptes_purges',
  'Une preuve de contrat purgé ne peut être supprimée qu''après son échéance de conservation', 'preuve : suppression refusée');
select throws_ok('truncate platform.contrats_acceptes_purges',
  'Les preuves de contrats purgés ne peuvent pas être vidées (TRUNCATE refusé)', 'preuve : TRUNCATE refusé');
select throws_ok($$select platform.definir_politique_purge_contrats('non_decidee', null)$$,
  'Une purge est en cours : politique des contrats non modifiable maintenant', 'politique non modifiable pendant une purge');
delete from platform.purge_autorisations_facture;
select throws_ok('update platform.purge_politique_contrats_journal set politique = ''x''',
  'Le journal des politiques de purge des contrats est en ajout seul', 'journal des politiques : ajout seul');

select * from finish();
rollback;
