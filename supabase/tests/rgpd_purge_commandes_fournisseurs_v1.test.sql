-- RGPD × commandes fournisseurs engagées — réconciliation V1 (migration 20260926000506).
-- Rapport : docs/qualification/ELSATIA_RGPD_PURCHASE_ORDERS_RECONCILIATION_V1.md
--
--   1. Structure : instantanés hors périmètre, aucun droit applicatif, TRUNCATE refusé,
--      classification (commandes DELETE, règlements fournisseurs RETAIN).
--   2. Sécurité (PO-1) : une commande engagée n'est plus modifiable par un utilisateur normal
--      (ni par l'administrateur du tenant, ni en SQL direct) ; les flux du produit passent.
--   3. service_role hors purge : aucune écriture, aucune préservation directe.
--   4. Export RGPD : commandes + lignes (+ fournisseurs, factures, règlements) exportées.
--   5. Rollback : une étape qui échoue n'écrit ni instantané ni suppression.
--   6. Purge du tenant réaliste, politique contrats livrée (fail-closed) : les commandes ne
--      bloquent plus ; seuls les 5 tables contrats restent (décision déjà nommée).
--   7. Intégrité : numéro, date, articles, quantités, montants, TVA, statut, réception,
--      liens comptables ; empreinte du document complet ; facture fournisseur et
--      règlements inchangés (défaut D2 fermé) ; lignes jamais amputées (D1 fermé).
--   8. Minimisation : aucune donnée personnelle de la fixture dans les instantanés.
--   9. Politique contrats activée (durée de TEST) : purge complète, marquage, idempotence.
--  10. Audit et preuve hors base. Immutabilité des instantanés. Tenant B intact.
--  11. Preuve périmée : un instantané qui ne correspond plus au contenu exact ne permet
--      pas la suppression.
begin;
create extension if not exists pgtap with schema extensions;
select plan(75);

\ir fixtures/isolation_multitenant.inc
\ir fixtures/rgpd_tenant_facture_emise.inc
\ir fixtures/rgpd_tenant_contrats_acceptes.inc
\ir fixtures/rgpd_tenant_commandes_fournisseurs.inc

select set_config('t.a', 'a0000000-0000-0000-0000-000000000001', true);
select set_config('t.b', 'b0000000-0000-0000-0000-000000000001', true);

-- Photographie avant purge.
create temporary table _cmd_avant on commit drop as
select c.id, c.numero, c.statut, c.date_commande, c.montant_ht, c.montant_tva, c.montant_ttc,
       public._empreinte_jsonb(public._document_commande_fournisseur(c.id)) as empreinte,
       (select jsonb_agg(jsonb_build_object('designation', l.designation, 'quantite', l.quantite, 'unite', l.unite,
                                            'prix_unitaire_ht', l.prix_unitaire_ht, 'taux_tva', l.taux_tva,
                                            'quantite_recue', l.quantite_recue) order by l.ordre, l.id)
          from public.lignes_commande l where l.commande_id = c.id) as lignes
  from public.commandes_fournisseurs c
 where c.entreprise_id = current_setting('t.a')::uuid and c.statut in ('envoyee', 'confirmee', 'recue_partiel', 'recue');
create temporary table _fournisseurs_avant on commit drop as
select * from public.empreinte_comptable_fournisseurs_entreprise(current_setting('t.a')::uuid);
create temporary table _depense_avant on commit drop as
select d.id, d.statut, d.montant_ttc, d.montant_regle from public.depenses_fournisseurs d where d.entreprise_id = current_setting('t.a')::uuid;
create temporary table _b_avant on commit drop as
select md5(string_agg(to_jsonb(c)::text || coalesce((select string_agg(to_jsonb(l)::text, '|' order by l.id)
                                                       from public.lignes_commande l where l.commande_id = c.id), ''), '|' order by c.id)) as e
  from public.commandes_fournisseurs c where c.entreprise_id = current_setting('t.b')::uuid;
grant select on _cmd_avant, _fournisseurs_avant, _depense_avant, _b_avant to authenticated, service_role;

-- ─── 1. Structure ──────────────────────────────────────────────────────
select is((select count(*)::integer from _cmd_avant), 3, 'fixture : 3 commandes engagées (confirmée, reçue, reçue partiellement)');
select has_table('platform', 'commandes_fournisseurs_purgees', 'table des instantanés dans le schéma platform (hors périmètre de la purge)');
select ok((select relrowsecurity from pg_class where oid = 'platform.commandes_fournisseurs_purgees'::regclass), 'RLS activée');
select is(
  (select count(*)::integer from information_schema.role_table_grants
    where table_schema = 'platform' and table_name = 'commandes_fournisseurs_purgees'
      and grantee in ('anon', 'authenticated', 'service_role')),
  0, 'aucun droit applicatif sur les instantanés');
select is(
  (select count(*)::integer from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where t.tgname like 'refuser_truncate_%' and not t.tgisinternal
      and c.relname in ('commandes_fournisseurs', 'lignes_commande', 'depenses_fournisseurs', 'reglements_fournisseurs')),
  4, 'TRUNCATE refusé sur commandes, lignes, factures et règlements fournisseurs');
select ok('reglements_fournisseurs' = any(public.tables_conservees_purge()), 'règlements fournisseurs : RETAIN (D2)');
select ok('commandes_fournisseurs' <> all(public.tables_conservees_purge()) and 'lignes_commande' <> all(public.tables_conservees_purge()),
  'commandes et lignes restent DELETE (classification V2 inchangée)');

-- ─── 2. Sécurité : commande engagée non modifiable ─────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(format($$update public.commandes_fournisseurs set montant_ht = 1, montant_tva = 0, montant_ttc = 1 where id = %L$$, current_setting('rgpd.cf_confirmee')),
  'P0001', 'COMMANDE_ENGAGEE_VERROUILLEE', 'administrateur du tenant : montants d''une commande confirmée non modifiables');
select throws_ok(format($$update public.commandes_fournisseurs set numero = 'FAUX-1' where id = %L$$, current_setting('rgpd.cf_recue')),
  'P0001', 'COMMANDE_ENGAGEE_VERROUILLEE', 'numéro d''une commande reçue non modifiable');
select throws_ok(format($$update public.commandes_fournisseurs set statut = 'brouillon' where id = %L$$, current_setting('rgpd.cf_recue')),
  'P0001', 'COMMANDE_ENGAGEE_VERROUILLEE', 'retour en brouillon refusé (contournement de CM-06 fermé)');
select throws_ok(format($$update public.commandes_fournisseurs set statut = 'annulee' where id = %L$$, current_setting('rgpd.cf_recue')),
  'P0001', 'COMMANDE_ENGAGEE_VERROUILLEE', 'annulation d''une commande reçue refusée (hors transitions du produit)');
select throws_ok(format($$update public.commandes_fournisseurs set notes = 'réécrit', fournisseur_id = fournisseur_id where id = %L$$, current_setting('rgpd.cf_confirmee')),
  'P0001', 'COMMANDE_ENGAGEE_VERROUILLEE', 'notes d''une commande confirmée non modifiables');
select throws_ok(format($$insert into public.lignes_commande (entreprise_id, commande_id, designation, quantite, prix_unitaire_ht) values (%L, %L, 'ajout', 1, 1000)$$,
                        current_setting('t.a'), current_setting('rgpd.cf_recue')),
  'P0001', 'COMMANDE_ENGAGEE_VERROUILLEE', 'ajout d''une ligne à une commande reçue refusé');
select throws_ok(format($$delete from public.commandes_fournisseurs where id = %L$$, current_setting('rgpd.cf_confirmee')),
  'P0001', 'COMMANDE_SUPPRESSION_STATUT_INTERDIT', 'suppression d''une commande confirmée refusée (CM-06 inchangé)');
select lives_ok(format($$update public.commandes_fournisseurs set notes = 'Brouillon modifié' where id = %L$$, current_setting('rgpd.cf_brouillon')),
  'un brouillon reste librement modifiable');
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);

-- Même en SQL direct, propriétaire de la base : le verrou porte sur la ligne, pas sur le rôle.
select throws_ok(format($$update public.lignes_commande set prix_unitaire_ht = 0 where commande_id = %L$$, current_setting('rgpd.cf_recue')),
  'P0001', 'COMMANDE_ENGAGEE_VERROUILLEE', 'SQL direct : prix d''une ligne reçue non modifiable');
select throws_ok(format($$delete from public.lignes_commande where commande_id = %L$$, current_setting('rgpd.cf_confirmee')),
  'P0001', 'COMMANDE_ENGAGEE_VERROUILLEE', 'SQL direct : ligne d''une commande confirmée non supprimable hors cascade');

-- Flux du produit sur une commande engagée (tenant B) : statut, réception, correction.
select lives_ok($$select public.changer_statut_commande_interne('b0000000-0000-0000-0000-000000000001', current_setting('rgpd.cf_b')::uuid, 'recue')$$,
  'produit : confirmée → reçue (réception de toutes les lignes) passe');
select is((select statut from public.commandes_fournisseurs where id = current_setting('rgpd.cf_b')::uuid), 'recue', 'statut reçu');
-- Chantier supprimé : délien FK admis sur une commande engagée (tenant A, commande dédiée).
insert into public.chantiers (id, entreprise_id, client_id, nom, statut)
values ('d2000000-0000-0000-0000-000000000009', current_setting('t.a')::uuid, 'c1000000-0000-0000-0000-000000000001', 'Chantier éphémère', 'en_cours');
select set_config('rgpd.cf_chantier', public.creer_commande_fournisseur_interne(current_setting('t.a')::uuid,
  '{"fournisseur_id":"d1000000-0000-0000-0000-000000000001","chantier_id":"d2000000-0000-0000-0000-000000000009"}'::jsonb,
  '[{"designation":"Sable","quantite":2,"unite":"t","prix_unitaire_ht":40,"taux_tva":20,"ordre":1}]'::jsonb)::text, true);
select public.changer_statut_commande_interne(current_setting('t.a')::uuid, current_setting('rgpd.cf_chantier')::uuid, 'envoyee');
select lives_ok($$delete from public.chantiers where id = 'd2000000-0000-0000-0000-000000000009'$$,
  'chantier supprimé : le délien (FK SET NULL) d''une commande envoyée est admis');
select is((select chantier_id from public.commandes_fournisseurs where id = current_setting('rgpd.cf_chantier')::uuid), null::uuid,
  'commande envoyée déliée du chantier supprimé, contenu inchangé');
select throws_ok(format($$update public.commandes_fournisseurs set chantier_id = 'c2000000-0000-0000-0000-000000000001' where id = %L$$, current_setting('rgpd.cf_chantier')),
  'P0001', 'COMMANDE_ENGAGEE_VERROUILLEE', 'rattacher une commande envoyée à un autre chantier est refusé');
insert into _cmd_avant
select c.id, c.numero, c.statut, c.date_commande, c.montant_ht, c.montant_tva, c.montant_ttc,
       public._empreinte_jsonb(public._document_commande_fournisseur(c.id)),
       (select jsonb_agg(jsonb_build_object('designation', l.designation, 'quantite', l.quantite, 'unite', l.unite,
                                            'prix_unitaire_ht', l.prix_unitaire_ht, 'taux_tva', l.taux_tva,
                                            'quantite_recue', l.quantite_recue) order by l.ordre, l.id)
          from public.lignes_commande l where l.commande_id = c.id)
  from public.commandes_fournisseurs c where c.id = current_setting('rgpd.cf_chantier')::uuid;
update _b_avant set e = (
  select md5(string_agg(to_jsonb(c)::text || coalesce((select string_agg(to_jsonb(l)::text, '|' order by l.id)
                                                         from public.lignes_commande l where l.commande_id = c.id), ''), '|' order by c.id))
    from public.commandes_fournisseurs c where c.entreprise_id = current_setting('t.b')::uuid);

-- ─── 3. service_role hors purge ────────────────────────────────────────
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok(format($$delete from public.commandes_fournisseurs where id = %L$$, current_setting('rgpd.cf_recue')),
  '42501', null, 'service_role : aucune suppression directe d''une commande');
select throws_ok('truncate public.commandes_fournisseurs cascade', 'P0001', null, 'service_role : TRUNCATE commandes refusé');
select throws_ok('truncate public.reglements_fournisseurs', 'P0001', null, 'service_role : TRUNCATE règlements refusé');
select throws_ok(format($$select public._preserver_commandes_fournisseurs(%L, gen_random_uuid())$$, current_setting('t.a')),
  '42501', null, 'service_role : préservation directe non exécutable');
select throws_ok('select count(*) from platform.commandes_fournisseurs_purgees', '42501', null, 'service_role : instantanés non lisibles en direct');
select is((select ok from public.purger_table_entreprise(current_setting('t.a')::uuid, 'commandes_fournisseurs')), false,
  'purge avant échéance refusée');
reset role;
select set_config('request.jwt.claims', '', true);

-- ─── 4. Export RGPD (avant purge) ──────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
create temporary table _export on commit drop as select public.exporter_donnees_entreprise(current_setting('t.a')::uuid) as e;
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);
select is(jsonb_array_length((select e -> 'donnees' -> 'commandes_fournisseurs' from _export)),
  (select count(*)::integer from public.commandes_fournisseurs where entreprise_id = current_setting('t.a')::uuid),
  'export : toutes les commandes du tenant (tous statuts)');
select is(jsonb_array_length((select e -> 'donnees' -> 'lignes_commande' from _export)),
  (select count(*)::integer from public.lignes_commande where entreprise_id = current_setting('t.a')::uuid),
  'export : toutes les lignes de commande');
select ok((select (e -> 'donnees') ? 'depenses_fournisseurs' and (e -> 'donnees') ? 'reglements_fournisseurs' and (e -> 'donnees') ? 'fournisseurs' from _export),
  'export : factures fournisseurs, règlements et fournisseurs présents');
select ok((select exists (select 1 from jsonb_array_elements(e -> 'donnees' -> 'commandes_fournisseurs') c
                           where c ->> 'numero' = 'CMD-2026-003' and c ->> 'notes' = 'Suivi par Paul Martin.' and c ? 'cree_par_utilisateur_id')
             from _export),
  'export : la commande est complète (notes, auteur) — l''export restitue tout, la minimisation ne vaut que pour la purge');

-- ─── 5. Rollback : une étape en échec n'écrit rien ─────────────────────
update public.entreprises set suppression_prevue_at = now() - interval '1 second' where id = current_setting('t.a')::uuid;
-- Effet de bord simulé sur la facture fournisseur conservée pendant l'étape (F8 écrit
-- purge_snapshot → ce trigger de test réécrit aussi `notes`) : le garde-fou doit annuler l'étape.
create function pg_temp.effet_de_bord() returns trigger language plpgsql as $$
begin new.notes := coalesce(new.notes, '') || ' [modifié]'; return new; end $$;
create trigger t_effet_de_bord before update of purge_snapshot on public.depenses_fournisseurs
  for each row execute function pg_temp.effet_de_bord();
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select ok from public.purger_table_entreprise(current_setting('t.a')::uuid, 'commandes_fournisseurs', 'd9900000-0000-0000-0000-0000000000f1')), false,
  'garde-fou comptable fournisseurs : étape refusée si la facture fournisseur conservée changerait');
reset role;
select set_config('request.jwt.claims', '', true);
drop trigger t_effet_de_bord on public.depenses_fournisseurs;
select ok((select erreur like 'Garde-fou comptable fournisseurs%' from platform.purge_audit
            where run_id = 'd9900000-0000-0000-0000-0000000000f1' and not ok),
  'échec audité avec sa cause');
select is((select count(*)::integer from platform.commandes_fournisseurs_purgees), 0, 'rollback : aucun instantané conservé');
select is((select count(*)::integer from public.commandes_fournisseurs c join _cmd_avant a on a.id = c.id), 4,
  'rollback : aucune commande supprimée');
select is((select count(*)::integer from platform.purge_autorisations_facture), 0, 'rollback : aucune autorisation résiduelle');

-- ─── 6. Purge, politique contrats livrée (fail-closed) ─────────────────
select set_config('rgpd.entreprise_cible', current_setting('t.a'), true);
select set_config('rgpd.run_id', 'd9900000-0000-0000-0000-000000000001', true);
\ir fixtures/rgpd_purge_driver.inc
select is(current_setting('rgpd.resultat'), 'incomplete:avenants,lignes_devis,pieces_jointes_devis,chantiers,devis',
  'les commandes ne bloquent plus : seules restent les 5 tables contrats (DECISION_REQUIRED:RGPD-DUREE-CONSERVATION-CONTRAT)');
select is((select count(*)::integer from platform.purge_audit where run_id = 'd9900000-0000-0000-0000-000000000001' and not ok
            and (erreur like '%COMMANDE%' or table_nom in ('commandes_fournisseurs', 'lignes_commande'))), 0,
  'aucun échec sur les commandes fournisseurs');
select is((select count(*)::integer from public.commandes_fournisseurs where entreprise_id = current_setting('t.a')::uuid), 0,
  'toutes les commandes du tenant supprimées (brouillons, annulées, engagées après instantané)');
select is((select count(*)::integer from public.lignes_commande where entreprise_id = current_setting('t.a')::uuid), 0,
  'toutes les lignes supprimées');

-- ─── 7. Intégrité ──────────────────────────────────────────────────────
select is((select count(*)::integer from platform.commandes_fournisseurs_purgees where entreprise_id = current_setting('t.a')::uuid), 4,
  'un instantané par commande engagée');
select is(
  (select count(*)::integer from _cmd_avant a
     join platform.commandes_fournisseurs_purgees p on p.commande_id = a.id
    where p.empreinte_document = a.empreinte and p.numero = a.numero and p.statut = a.statut
      and p.contenu ->> 'numero' = a.numero and p.contenu ->> 'statut' = a.statut
      and (p.contenu ->> 'date_commande')::date = a.date_commande
      and (p.contenu ->> 'montant_ht')::numeric = a.montant_ht and (p.contenu ->> 'montant_tva')::numeric = a.montant_tva
      and (p.contenu ->> 'montant_ttc')::numeric = a.montant_ttc),
  4, 'numéro, statut, date, montants HT/TVA/TTC et empreinte du document complet identiques');
select is(
  (select count(*)::integer from _cmd_avant a join platform.commandes_fournisseurs_purgees p on p.commande_id = a.id
    where (select jsonb_agg(jsonb_build_object('designation', l -> 'designation', 'quantite', l -> 'quantite', 'unite', l -> 'unite',
                                                'prix_unitaire_ht', l -> 'prix_unitaire_ht', 'taux_tva', l -> 'taux_tva',
                                                'quantite_recue', l -> 'quantite_recue') order by (l ->> 'ordre')::int)
             from jsonb_array_elements(p.contenu -> 'lignes') l) = a.lignes),
  4, 'articles, quantités, unités, prix, TVA et quantités reçues identiques');
select is(
  (select p.contenu -> 'reception' from platform.commandes_fournisseurs_purgees p where p.numero = 'CMD-2026-004'),
  '{"complete": false, "quantite_recue": 17.00, "quantite_commandee": 80.00}'::jsonb,
  'réception partielle conservée (17 / 80)');
select is(
  (select p.contenu -> 'pieces_comptables' -> 0 ->> 'numero_piece' from platform.commandes_fournisseurs_purgees p where p.numero = 'CMD-2026-003'),
  'FAC-NMR-2026-0457', 'lien comptable : la facture fournisseur de la commande reçue est citée');
select is(
  (select purge_snapshot -> 'commande_id' ->> 'libelle' from public.depenses_fournisseurs where id = 'd4000000-0000-0000-0000-000000000001'),
  'CMD-2026-003', 'lien comptable : la facture fournisseur conservée garde le numéro de la commande (F8)');
select is((select empreinte from public.empreinte_comptable_fournisseurs_entreprise(current_setting('t.a')::uuid)),
  (select empreinte from _fournisseurs_avant), 'facture fournisseur et règlements : empreinte inchangée');
select is((select row(d.statut, d.montant_regle) from public.depenses_fournisseurs d where d.id = 'd4000000-0000-0000-0000-000000000001'),
  row('payee_partiel'::text, 300.00::numeric(12,2)), 'D2 fermé : la facture fournisseur reste payée partiellement (300 €)');
select is((select count(*)::integer from public.reglements_fournisseurs where depense_id = 'd4000000-0000-0000-0000-000000000001'), 1,
  'D2 fermé : le règlement fournisseur est conservé');
select is((select count(*)::integer from public.signatures_documents where type_document = 'commande' and entreprise_id = current_setting('t.a')::uuid), 1,
  'signature interne de la commande conservée (RETAIN)');
select is((select p.contenu -> 'signatures' -> 0 ->> 'document_sha256' from platform.commandes_fournisseurs_purgees p where p.numero = 'CMD-2026-003'),
  repeat('d', 64), 'l''instantané authentifie la signature (empreinte)');

-- ─── 8. Minimisation ───────────────────────────────────────────────────
select is(
  (select count(*)::integer from platform.commandes_fournisseurs_purgees p, unnest(array[
     'Sophie', 'Keller', 'sophie.keller', '0388112233', '0612345678', 'Négoce Matériaux Rhin', '5 quai des Bateliers', '98765432100017',
     'Lefèvre', '0611223344', 'Paul Martin', 'Suivi par', 'Brouillon', '2500 x 1200', 'ton pierre',
     '10000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001']) m
    where p.contenu::text ilike '%' || m || '%'),
  0, 'aucune donnée personnelle (contact, e-mail, téléphones, notes, auteur, salarié, chantier, descriptions libres) dans les instantanés');
select ok((select bool_and(not (p.contenu ?| array['notes', 'cree_par_utilisateur_id', 'cree_par_employe_id', 'chantier_id']))
             from platform.commandes_fournisseurs_purgees p),
  'liste blanche : ni notes, ni auteur, ni chantier');
select is((select p.contenu -> 'non_conserve' from platform.commandes_fournisseurs_purgees p where p.numero = 'CMD-2026-002'),
  '{"notes": true, "auteur": true, "descriptions_lignes": 1}'::jsonb,
  'ce qui n''est pas conservé est compté, sans le contenu');
select is((select p.contenu -> 'fournisseur' ->> 'reference' from platform.commandes_fournisseurs_purgees p where p.numero = 'CMD-2026-003'),
  'FRN-0001', 'fournisseur référencé par sa référence interne seulement');

-- ─── 9. Politique contrats activée (durée de TEST), purge complète ──────
select platform.definir_politique_purge_contrats('conserver_contrat_minimise', 'TEST-DUREE-VALIDEE', interval '3 years', false);
select set_config('rgpd.run_id', 'd9900000-0000-0000-0000-000000000002', true);
\ir fixtures/rgpd_purge_driver.inc
select is(current_setting('rgpd.resultat'), 'complete', 'purge complète');
select ok((select purgee_at is not null from public.entreprises where id = current_setting('t.a')::uuid), 'entreprise marquée purgée');
select ok((select email is null and telephone is null and contact_nom is null and notes is null and siret is null
             from public.fournisseurs where id = 'd1000000-0000-0000-0000-000000000001'),
  'fiche fournisseur anonymisée (contact, e-mail, téléphone, notes, SIRET)');
select set_config('rgpd.run_id', 'd9900000-0000-0000-0000-000000000003', true);
\ir fixtures/rgpd_purge_driver.inc
select is(current_setting('rgpd.resultat'), 'complete', 'rejeu sur un tenant purgé : complet');
select is((select count(*)::integer from platform.commandes_fournisseurs_purgees where entreprise_id = current_setting('t.a')::uuid), 4,
  'rejeu : aucun instantané en double (idempotent)');

-- ─── 10. Audit, preuve hors base, immutabilité, tenant B ───────────────
select is((select lignes_affectees from platform.purge_audit
            where run_id = 'd9900000-0000-0000-0000-000000000001' and etape = 'preuve_commandes_fournisseurs'), 4,
  'audit : instantanés consignés avec leurs empreintes');
select ok((select bool_and(detail ->> 'controle_factures_fournisseurs' = 'empreinte_inchangee') from platform.purge_audit
            where entreprise_id = current_setting('t.a')::uuid and etape = 'purge_table' and ok),
  'audit : chaque étape réussie consigne le contrôle des factures fournisseurs');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(jsonb_array_length(public.preuve_purge_entreprise(current_setting('t.a')::uuid) -> 'commandes_fournisseurs'), 4,
  'preuve hors base : empreintes des 4 commandes');
select is((select row(commandes_engagees, instantanes) from public.rapport_commandes_fournisseurs_purge(current_setting('t.a')::uuid)),
  row(0, 4), 'rapport service_role : 0 commande engagée active, 4 instantanés');
select is((select count(*)::integer from public.lire_commandes_fournisseurs_purgees(current_setting('t.a')::uuid)), 4,
  'lecture service_role par fonction dédiée');
reset role;
select set_config('request.jwt.claims', '', true);
select throws_ok($$update platform.commandes_fournisseurs_purgees set statut = 'recue'$$,
  'P0001', 'Un instantané de commande fournisseur purgée est immuable', 'instantané : UPDATE refusé');
select throws_ok($$delete from platform.commandes_fournisseurs_purgees$$,
  'P0001', null, 'instantané : DELETE refusé (aucune échéance)');
select throws_ok($$truncate platform.commandes_fournisseurs_purgees$$,
  'P0001', null, 'instantané : TRUNCATE refusé');
select is(
  (select md5(string_agg(to_jsonb(c)::text || coalesce((select string_agg(to_jsonb(l)::text, '|' order by l.id)
                                                          from public.lignes_commande l where l.commande_id = c.id), ''), '|' order by c.id))
     from public.commandes_fournisseurs c where c.entreprise_id = current_setting('t.b')::uuid),
  (select e from _b_avant), 'tenant B : commandes et lignes strictement inchangées');

-- ─── 11. Preuve périmée : suppression refusée ──────────────────────────
-- Tenant B, simulation contrôlée de l'étape : autorisation R1, instantané, puis la
-- commande change (réception) : l'instantané ne correspond plus, CM-06 refuse.
select set_config('rgpd.cf_b2', public.creer_commande_fournisseur_interne(current_setting('t.b')::uuid,
  '{"fournisseur_id":"d1000000-0000-0000-0000-0000000000b1"}'::jsonb,
  '[{"designation":"Gravier","quantite":4,"unite":"t","prix_unitaire_ht":30,"taux_tva":20,"ordre":1}]'::jsonb)::text, true);
select public.changer_statut_commande_interne(current_setting('t.b')::uuid, current_setting('rgpd.cf_b2')::uuid, 'envoyee');
insert into platform.purge_autorisations_facture (txid, entreprise_id, table_purgee, run_id)
values (txid_current(), current_setting('t.b')::uuid, 'commandes_fournisseurs', gen_random_uuid());
select ok(public._preserver_commandes_fournisseurs(current_setting('t.b')::uuid, gen_random_uuid()) >= 1, 'instantané figé');
select public.enregistrer_reception_commande_interne(current_setting('t.b')::uuid, current_setting('rgpd.cf_b2')::uuid,
  (select jsonb_agg(jsonb_build_object('ligne_id', l.id, 'quantite_recue', 1)) from public.lignes_commande l where l.commande_id = current_setting('rgpd.cf_b2')::uuid),
  null);
select throws_ok(format($$delete from public.commandes_fournisseurs where id = %L$$, current_setting('rgpd.cf_b2')),
  'P0001', 'COMMANDE_SUPPRESSION_STATUT_INTERDIT', 'contenu changé après l''instantané : suppression refusée même avec l''autorisation');
select lives_ok($$select public._preserver_commandes_fournisseurs('b0000000-0000-0000-0000-000000000001', gen_random_uuid())$$,
  'nouvel instantané du contenu à jour');
select lives_ok(format($$delete from public.commandes_fournisseurs where id = %L$$, current_setting('rgpd.cf_b2')),
  'instantané à jour + autorisation : suppression admise');
delete from platform.purge_autorisations_facture where txid = txid_current();
select throws_ok(format($$delete from public.commandes_fournisseurs where id = %L$$, current_setting('rgpd.cf_b')),
  'P0001', 'COMMANDE_SUPPRESSION_STATUT_INTERDIT', 'sans autorisation : instantané seul insuffisant');

select * from finish();
rollback;
