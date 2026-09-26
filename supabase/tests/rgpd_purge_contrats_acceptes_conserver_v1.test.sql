-- RGPD × contrats acceptés — V1, stratégie C « conserver_contrat_minimise »
-- (migration 20260926000402 ; NON activée dans le dépôt : le test l'active dans sa
-- transaction, comme le ferait une migration de décision, puis annule tout).
--
-- Tenant réaliste A : purge complète ; chaque contrat accepté est figé en instantané
-- immuable et minimisé (preuve du contenu exact, identité imprimée des parties, sans
-- e-mail, téléphone, contact, notes internes, identifiants d'utilisateurs, audio) avant
-- la suppression des objets métier actifs ; factures inchangées ; photos imprimées
-- conservées (décision « avec photos ») ; tenant B intact ; échéance de conservation.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

\ir fixtures/isolation_multitenant.inc
\ir fixtures/rgpd_tenant_facture_emise.inc
\ir fixtures/rgpd_tenant_contrats_acceptes.inc

select set_config('t.a', 'a0000000-0000-0000-0000-000000000001', true);
select set_config('t.b', 'b0000000-0000-0000-0000-000000000001', true);
update public.entreprises set suppression_prevue_at = now() - interval '1 second' where id = current_setting('t.a')::uuid;

create temporary table _contrats_avant on commit drop as
select 'devis'::text as type_contrat, d.id, d.entreprise_id, d.numero, d.montant_ttc, d.date_emission::timestamptz as depart,
       (select count(*) from public.lignes_devis l where l.devis_id = d.id)::integer as nb_lignes,
       public._empreinte_jsonb(public._document_contrat_accepte('devis', d.id)) as empreinte
  from public.devis d where d.statut = 'accepte'
union all
select 'avenant', a.id, a.entreprise_id, null, a.montant_ttc, date_trunc('day', a.date_acceptation),
       (select count(*) from public.lignes_avenants l where l.avenant_id = a.id)::integer,
       public._empreinte_jsonb(public._document_contrat_accepte('avenant', a.id))
  from public.avenants a where a.statut = 'accepte';
create temporary table _factures_avant on commit drop as
select f.id, f.entreprise_id, public.empreinte_comptable_facture(f.id) as empreinte from public.factures f;
create temporary table _b_avant on commit drop as
select md5(string_agg(to_jsonb(d)::text, '|' order by d.id)) as e from public.devis d where d.entreprise_id = current_setting('t.b')::uuid;

select lives_ok(
  $$select platform.definir_politique_purge_contrats('conserver_contrat_minimise', 'TEST-DECISION-C', interval '10 years', true)$$,
  'décision simulée : conserver les contrats minimisés 10 ans, photos comprises');

select set_config('rgpd.entreprise_cible', current_setting('t.a'), true);
select set_config('rgpd.run_id', 'c9000000-0000-0000-0000-0000000000c1', true);
\ir fixtures/rgpd_purge_driver.inc

select is(current_setting('rgpd.resultat'), 'complete', 'purge complète du tenant réaliste');
select ok((select purgee_at is not null from public.entreprises where id = current_setting('t.a')::uuid), 'entreprise marquée purgée');
select is(
  (select count(*)::integer from public.devis where entreprise_id = current_setting('t.a')::uuid)
  + (select count(*)::integer from public.avenants where entreprise_id = current_setting('t.a')::uuid)
  + (select count(*)::integer from public.lignes_devis where entreprise_id = current_setting('t.a')::uuid)
  + (select count(*)::integer from public.pieces_jointes_devis where entreprise_id = current_setting('t.a')::uuid),
  0, 'objets métier actifs supprimés (devis, avenants, lignes, pièces jointes)');

-- Instantanés
select is((select count(*)::integer from platform.contrats_acceptes_purges where entreprise_id = current_setting('t.a')::uuid), 4,
  'un instantané par contrat accepté (3 devis + 1 avenant)');
select is(
  (select count(*)::integer from _contrats_avant c
     join platform.contrats_acceptes_purges p on p.type_contrat = c.type_contrat and p.source_id = c.id
    where c.entreprise_id = current_setting('t.a')::uuid and p.empreinte_document = c.empreinte),
  4, 'chaque instantané prouve le contenu EXACT du contrat avant purge (empreinte SHA-256)');
select is(
  (select count(*)::integer from platform.contrats_acceptes_purges
    where niveau = 'contrat_minimise' and politique = 'conserver_contrat_minimise' and decision_ref = 'TEST-DECISION-C'
      and empreinte_contenu = public._empreinte_jsonb(contenu)),
  4, 'niveau, politique, référence de décision et empreinte du contenu cohérents');
select is(
  (select count(*)::integer from platform.contrats_acceptes_purges p
     join _contrats_avant c on c.id = p.source_id
    where p.conserver_jusqu_au = c.depart + interval '10 years'),
  4, 'échéance = date du contrat + durée décidée (déterministe, indépendante de la date de purge)');
select is(
  (select count(*)::integer from platform.contrats_acceptes_purges p
     join _contrats_avant c on c.id = p.source_id
    where (p.contenu ->> 'montant_ttc')::numeric = c.montant_ttc and jsonb_array_length(p.contenu -> 'lignes') = c.nb_lignes),
  4, 'montants et lignes conservés à l''identique');
select is(
  (select contenu -> 'client' ->> 'nom_affiche' || ' / ' || (contenu -> 'client' ->> 'adresse_facturation')
     from platform.contrats_acceptes_purges where source_id = 'c3000000-0000-0000-0000-000000000002'),
  'Marc Lefèvre / 3 impasse des Lilas', 'identité imprimée du client conservée (nom, adresse)');
select is(
  (select contenu -> 'entreprise' ->> 'siret' from platform.contrats_acceptes_purges where source_id = 'c3000000-0000-0000-0000-000000000002'),
  '12345678900011', 'identité émettrice figée conservée alors que la fiche entreprise est anonymisée');
select is(
  (select contenu ->> 'conditions' || ' | ' || (contenu ->> 'notes_client') from platform.contrats_acceptes_purges
    where source_id = 'c3000000-0000-0000-0000-000000000002'),
  'Acompte 30 % à la commande, solde à réception. | Accès par le portail côté jardin.',
  'conditions et notes au client (contenu contractuel) conservées');

-- Minimisation
select is(
  (select count(*)::integer from platform.contrats_acceptes_purges
    where contenu::text ~* '(example\.test|0611223344|0699887766|julie|pointilleux|notes_internes|email_envoye_a|client_id|accepte_par|created_by|memo\.webm|"contact"|"telephone"|"email"|reference_interne|conditions_paiement|Paul Martin|Conducteur)'),
  0, 'aucun e-mail, téléphone, contact, note interne, identifiant d''utilisateur, audio ni nom de salarié');
select is(
  (select (contenu ->> 'acceptation_saisie_par_un_membre')::boolean from platform.contrats_acceptes_purges where type_contrat = 'avenant'),
  true, 'avenant : l''identifiant de l''utilisateur qui a saisi l''acceptation est remplacé par un booléen');
select is(
  (select (contenu ->> 'nb_audio_non_conserves')::integer || ':' || jsonb_array_length(contenu -> 'photos')
     from platform.contrats_acceptes_purges where source_id = 'c3000000-0000-0000-0000-000000000002'),
  '1:1', 'photo imprimée conservée, note vocale non conservée (comptée)');
select is(
  (select contenu -> 'signatures' -> 0 ->> 'document_sha256' from platform.contrats_acceptes_purges
    where source_id = 'c3000000-0000-0000-0000-000000000002'),
  repeat('b', 64), 'référence à la signature interne conservée (empreinte du document signé)');

-- Storage
select is(
  (select string_agg(bucket_id || ':' || split_part(name, '/', 3) || split_part(name, '/', 2), ',' order by bucket_id, name)
     from storage.objects where name like current_setting('t.a') || '/%'),
  'devis-medias:facade.jpgc3000000-0000-0000-0000-000000000002,documents-employes:devis-c3000000-0002.pngsignatures,logos:logo.png',
  'Storage : photo du contrat, signature et logo conservés ; note vocale, document de chantier supprimés');
select is(
  (select categorie || ':' || table_referencee from public.verifier_storage_entreprise(current_setting('t.a')::uuid)
    where chemin like '%facade.jpg'),
  'RETAIN:__contrat_conserve__', 'la photo conservée est RETAIN au titre de l''instantané contractuel');

-- Factures, autre tenant, audit
select is(
  (select count(*)::integer from _factures_avant f where f.empreinte is distinct from public.empreinte_comptable_facture(f.id)),
  0, 'aucune facture modifiée (tenants A et B)');
select is(
  (select purge_snapshot -> 'devis_origine_id' ->> 'libelle' from public.factures
    where entreprise_id = current_setting('t.a')::uuid and type = 'finale'),
  'DEV-2026-001', 'facture finale : numéro du devis d''origine consigné avant délien');
select is((select md5(string_agg(to_jsonb(d)::text, '|' order by d.id)) from public.devis d where d.entreprise_id = current_setting('t.b')::uuid),
  (select e from _b_avant), 'tenant B : devis (dont accepté) strictement inchangés');
select is((select count(*)::integer from platform.contrats_acceptes_purges where entreprise_id = current_setting('t.b')::uuid), 0,
  'tenant B : aucune preuve figée');
select is(
  (select (detail ->> 'decision_ref') || ':' || lignes_affectees from platform.purge_audit
    where run_id = 'c9000000-0000-0000-0000-0000000000c1' and etape = 'preuve_contrats_acceptes'),
  'TEST-DECISION-C:4', 'audit : preuve figée une seule fois, avec la référence de la décision');
select is(jsonb_array_length(public.preuve_purge_entreprise(current_setting('t.a')::uuid) -> 'contrats_acceptes'), 4,
  'preuve hors base : les 4 empreintes de contrats y figurent');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select count(*)::integer from public.lire_contrats_acceptes_purges(current_setting('t.a')::uuid)), 4,
  'service_role : production des instantanés par la fonction dédiée');
select is(
  (select row(ok, lignes_supprimees) from public.purger_table_entreprise(current_setting('t.a')::uuid, 'devis', 'c9000000-0000-0000-0000-0000000000c2')),
  row(true, 0), 'rejeu : purger à nouveau devis est idempotent');
select is((select count(*)::integer from public.purger_contrats_conserves_echus()), 0,
  'échéance : rien à supprimer avant la date');
reset role;

select throws_ok('update platform.contrats_acceptes_purges set contenu = contenu - ''client''',
  'Une preuve de contrat purgé est immuable', 'après purge : instantané non modifiable');

-- Échéance atteinte (ligne insérée par le propriétaire avec une échéance passée).
insert into platform.contrats_acceptes_purges (entreprise_id, type_contrat, source_id, reference, politique, decision_ref,
  niveau, contenu, empreinte_document, empreinte_contenu, conserver_jusqu_au)
values (current_setting('t.a')::uuid, 'devis', gen_random_uuid(), 'ANCIEN', 'conserver_contrat_minimise', 'TEST-DECISION-C',
  'contrat_minimise', '{"photos":[{"storage_path":"a0000000-0000-0000-0000-000000000001/ancien/photo.jpg"}]}',
  repeat('c', 64), repeat('d', 64), now() - interval '1 day');
set local role service_role;
select is((select string_agg(reference_chemins, ',') from (select array_to_string(chemins_storage, ',') as reference_chemins
                                                           from public.purger_contrats_conserves_echus()) t),
  'a0000000-0000-0000-0000-000000000001/ancien/photo.jpg', 'échéance atteinte : instantané supprimé, photo à supprimer renvoyée');
reset role;
select is((select count(*)::integer from platform.contrats_acceptes_purges where entreprise_id = current_setting('t.a')::uuid), 4,
  'échéance : seuls les instantanés échus sont supprimés');

select * from finish();
rollback;
