-- RGPD × contrats acceptés — V1, stratégie D « supprimer_apres_preuve »
-- (migration 20260926000402 ; NON activée dans le dépôt : le test l'active dans sa
-- transaction, comme le ferait une migration de décision, puis annule tout).
--
-- Tenant réaliste A : purge complète ; avant suppression, chaque contrat accepté laisse
-- une preuve MINIMALE non identifiante (numéro, dates, montants, empreinte SHA-256 du
-- document complet) ; aucun nom, adresse, désignation ni photo n'est conservé au titre
-- des contrats ; factures inchangées ; tenant B intact ; preuve non supprimable.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

\ir fixtures/isolation_multitenant.inc
\ir fixtures/rgpd_tenant_facture_emise.inc
\ir fixtures/rgpd_tenant_contrats_acceptes.inc

select set_config('t.a', 'a0000000-0000-0000-0000-000000000001', true);
select set_config('t.b', 'b0000000-0000-0000-0000-000000000001', true);
update public.entreprises set suppression_prevue_at = now() - interval '1 second' where id = current_setting('t.a')::uuid;

create temporary table _contrats_avant on commit drop as
select 'devis'::text as type_contrat, d.id, d.entreprise_id, d.numero, d.montant_ttc,
       public._document_contrat_accepte('devis', d.id) as document
  from public.devis d where d.statut = 'accepte'
union all
select 'avenant', a.id, a.entreprise_id, null, a.montant_ttc, public._document_contrat_accepte('avenant', a.id)
  from public.avenants a where a.statut = 'accepte';
create temporary table _factures_avant on commit drop as
select f.id, public.empreinte_comptable_facture(f.id) as empreinte from public.factures f;
create temporary table _b_avant on commit drop as
select md5(string_agg(to_jsonb(d)::text, '|' order by d.id)) as e from public.devis d where d.entreprise_id = current_setting('t.b')::uuid;

select lives_ok($$select platform.definir_politique_purge_contrats('supprimer_apres_preuve', 'TEST-DECISION-D')$$,
  'décision simulée : supprimer après preuve minimale');
select throws_ok($$select platform.definir_politique_purge_contrats('supprimer_apres_preuve', 'TEST', interval '1 year')$$,
  '23514', null, 'supprimer_apres_preuve n''accepte pas de durée de conservation (rien n''est conservé)');

select set_config('rgpd.entreprise_cible', current_setting('t.a'), true);
select set_config('rgpd.run_id', 'c9000000-0000-0000-0000-0000000000d9', true);
\ir fixtures/rgpd_purge_driver.inc

select is(current_setting('rgpd.resultat'), 'complete', 'purge complète du tenant réaliste');
select is(
  (select count(*)::integer from public.devis where entreprise_id = current_setting('t.a')::uuid)
  + (select count(*)::integer from public.avenants where entreprise_id = current_setting('t.a')::uuid)
  + (select count(*)::integer from public.pieces_jointes_devis where entreprise_id = current_setting('t.a')::uuid),
  0, 'contrats acceptés supprimés');
select is(
  (select count(*)::integer from _contrats_avant c
     join platform.contrats_acceptes_purges p on p.type_contrat = c.type_contrat and p.source_id = c.id
    where c.entreprise_id = current_setting('t.a')::uuid
      and p.niveau = 'preuve_minimale' and p.conserver_jusqu_au is null and p.decision_ref = 'TEST-DECISION-D'
      and p.empreinte_document = public._empreinte_jsonb(c.document)),
  4, '4 preuves minimales, empreinte du document complet exact avant purge');
select is(
  (select count(*)::integer from _contrats_avant c
     join platform.contrats_acceptes_purges p on p.source_id = c.id
    where (p.contenu ->> 'montant_ttc')::numeric = c.montant_ttc
      and (c.numero is null or p.contenu ->> 'numero' = c.numero)),
  4, 'numéro et montants conservés');
select is(
  (select count(*)::integer from platform.contrats_acceptes_purges
    where contenu::text ~* '(Lef[eè]vre|Lilas|Strasbourg|Marc|Ravalement|Échafaudage|Dépose|Placo|Peinture|portail|Acompte 30|example\.test|06[0-9]{8}|facade|memo|Isolation A|12345678900011|"client"|"entreprise"|designation|storage_path|nom_signataire)'),
  0, 'aucune donnée identifiante ni contenu descriptif conservé (ni client, ni émetteur, ni désignations, ni photos)');
-- Authentification ultérieure d'une copie restituée : l'empreinte du document exporté
-- avant la purge (export RGPD = mêmes lignes) retrouve la preuve.
select ok(
  exists (select 1 from platform.contrats_acceptes_purges p join _contrats_avant c on c.id = p.source_id
           where c.id = 'c3000000-0000-0000-0000-000000000002' and p.empreinte_document = public._empreinte_jsonb(c.document)),
  'une copie exacte du contrat (restituée avant purge) est authentifiable par son empreinte');
select is(
  (select string_agg(bucket_id || ':' || split_part(name, '/', 3) || split_part(name, '/', 2), ',' order by bucket_id, name)
     from storage.objects where name like current_setting('t.a') || '/%'),
  'documents-employes:devis-c3000000-0002.pngsignatures,logos:logo.png',
  'Storage : photo et note vocale du contrat supprimées ; signature interne (RETAIN) et logo (factures) conservés');
select is(
  (select count(*)::integer from _factures_avant f where f.empreinte is distinct from public.empreinte_comptable_facture(f.id)),
  0, 'aucune facture modifiée');
select ok((select purgee_at is not null from public.entreprises where id = current_setting('t.a')::uuid), 'entreprise marquée purgée');
select is((select md5(string_agg(to_jsonb(d)::text, '|' order by d.id)) from public.devis d where d.entreprise_id = current_setting('t.b')::uuid),
  (select e from _b_avant), 'tenant B : devis (dont accepté) strictement inchangés');
select throws_ok('delete from platform.contrats_acceptes_purges',
  'Une preuve de contrat purgé ne peut être supprimée qu''après son échéance de conservation',
  'preuve minimale : sans échéance, jamais supprimable');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select count(*)::integer from public.purger_contrats_conserves_echus()), 0, 'échéance : aucune preuve minimale concernée');
select is(
  (select row(politique, devis_acceptes, avenants_acceptes, preuves) from public.rapport_contrats_acceptes_purge(current_setting('t.a')::uuid)),
  row('supprimer_apres_preuve'::text, 0, 0, 4), 'rapport : plus aucun contrat accepté actif, 4 preuves');
select is(
  (select row(ok, lignes_supprimees) from public.purger_table_entreprise(current_setting('t.a')::uuid, 'avenants', 'c9000000-0000-0000-0000-0000000000da')),
  row(true, 0), 'rejeu : purger à nouveau avenants est idempotent');
reset role;

select * from finish();
rollback;
