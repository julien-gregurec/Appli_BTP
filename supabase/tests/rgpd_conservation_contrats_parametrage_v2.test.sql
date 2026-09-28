-- RGPD × contrats acceptés — paramétrage de la conservation V2 (migration 20260928000501).
-- Rapport : docs/qualification/ELSATIA_RGPD_CONTRACT_RETENTION_PARAMETERIZATION_V2.md
--
-- Les durées (1, 5, 10 ans) et règles de départ utilisées ici sont des PARAMÈTRES TECHNIQUES
-- DE TEST, posés dans la transaction du test puis annulés. Ce ne sont ni des recommandations
-- ni des valeurs juridiques ; aucune migration ne les écrit.
--
--   1. État livré : C retenue, aucun paramètre validé → duree_requise, fail-closed.
--   2. Validation des paramètres (liste fermée de règles, durée sans heure ni signe négatif).
--   3. Fail-closed : chaque combinaison incomplète refuse (purge, préservation, échéance).
--   4. Point de départ : chaque règle, combinaison (date la plus tardive), repli, indéterminable.
--   5. Durées de test 1 / 5 / 10 ans : dernier jour conservé et échéance.
--   6. Échéance : avant, jour même, après ; changement d'heure ; 29 février ; fuseau de session.
--   7. Purge réelle avec paramètres de test : instantanés figés dès la première étape (R5).
--   8. Immutabilité pendant la conservation.
--   9. Suppression après échéance : contrôlée, auditée, transactionnelle, rejouable ;
--      allongement / raccourcissement de la durée ; retour fail-closed.
begin;
create extension if not exists pgtap with schema extensions;
select plan(102);

\ir fixtures/isolation_multitenant.inc
\ir fixtures/rgpd_tenant_facture_emise.inc
\ir fixtures/rgpd_tenant_contrats_acceptes.inc

select set_config('t.a', 'a0000000-0000-0000-0000-000000000001', true);
select set_config('t.b', 'b0000000-0000-0000-0000-000000000001', true);
select set_config('t.d1', 'c3000000-0000-0000-0000-000000000001', true);   -- devis accepté, chantier c2…01, émis J-60
select set_config('t.d2', 'c3000000-0000-0000-0000-000000000002', true);   -- devis accepté, chantier c2…01, émis J-40
select set_config('t.d3', 'a9000000-0000-0000-0000-000000000001', true);   -- devis accepté, chantier a4…01
select set_config('t.av', (select id::text from public.avenants where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut = 'accepte'), true);
update public.entreprises set suppression_prevue_at = now() - interval '1 second' where id = current_setting('t.a')::uuid;

create temporary table _b_avant on commit drop as
select md5(string_agg(to_jsonb(d)::text, '|' order by d.id)) as e from public.devis d where d.entreprise_id = current_setting('t.b')::uuid;

-- ─── 1. État livré ─────────────────────────────────────────────────────
select is(platform.etat_politique_contrats(), 'duree_requise', '1.1 état livré : duree_requise (non actif)');
select is(platform.parametres_conservation_manquants(), array['duree', 'point_depart', 'pieces_photos'],
  '1.2 les trois paramètres à décider sont manquants : durée, point de départ, pièces/photos');
select ok((select politique = 'conserver_contrat_minimise' and duree_conservation is null and regles_depart is null
                  and regle_depart_repli is null and not inclure_photos and not choix_photos_explicite
             from platform.purge_politique_contrats),
  '1.3 aucune durée, aucune règle, aucun choix de photos inventés');
select is(platform.regles_depart_conservation_contrat(),
  array['date_contrat', 'acceptation', 'fin_chantier', 'reception_travaux', 'derniere_facture', 'dernier_paiement', 'demande_suppression'],
  '1.4 liste fermée des règles de départ techniquement calculables');
select has_column('platform', 'purge_politique_contrats_journal', 'regles_depart', '1.5 le journal (ajout seul) porte les nouveaux paramètres');

-- ─── 2. Validation ─────────────────────────────────────────────────────
select throws_ok($$select platform.definir_politique_purge_contrats('conserver_contrat_minimise', 'X', interval '1 year', false, array['resiliation'])$$,
  '23514', null, '2.1 règle « resiliation » refusée (aucune donnée de résiliation en base)');
select throws_ok($$select platform.definir_politique_purge_contrats('conserver_contrat_minimise', 'X', interval '1 year', false, array['inconnue'])$$,
  '23514', null, '2.2 règle inconnue refusée');
select throws_ok($$select platform.definir_politique_purge_contrats('conserver_contrat_minimise', 'X', interval '1 year', false, array[]::text[])$$,
  '23514', null, '2.3 liste de règles vide refusée');
select throws_ok($$select platform.definir_politique_purge_contrats('conserver_contrat_minimise', 'X', interval '1 year', false, array['fin_chantier', 'fin_chantier'])$$,
  '23514', null, '2.4 règle en double refusée');
select throws_ok($$select platform.definir_politique_purge_contrats('conserver_contrat_minimise', 'X', interval '1 year', false, array['fin_chantier', null])$$,
  '23514', null, '2.5 règle NULL refusée');
select throws_ok($$select platform.definir_politique_purge_contrats('conserver_contrat_minimise', 'X', interval '1 year', false, array['fin_chantier'], 'inconnue')$$,
  '23514', null, '2.6 repli inconnu refusé');
select throws_ok($$select platform.definir_politique_purge_contrats('conserver_contrat_minimise', 'X', interval '1 year 3 hours', false, array['date_contrat'])$$,
  '23514', null, '2.7 durée avec composante horaire refusée (l''échéance est un jour civil)');
select throws_ok($$select platform.definir_politique_purge_contrats('conserver_contrat_minimise', 'X', interval '1 year -5 days', false, array['date_contrat'])$$,
  '23514', null, '2.8 durée avec composante négative refusée');
select throws_ok($$select platform.definir_politique_purge_contrats('conserver_contrat_minimise', 'X', interval '0', false, array['date_contrat'])$$,
  '23514', null, '2.9 durée nulle refusée');
select throws_ok($$select platform.definir_politique_purge_contrats('supprimer_apres_preuve', 'X', null, null, array['date_contrat'])$$,
  '23514', null, '2.10 une règle de départ hors conservation (D) est refusée');

-- ─── 3. Fail-closed : combinaisons incomplètes ─────────────────────────
-- 3a. Durée seule (appel à 3 arguments) : ni point de départ ni choix des photos.
select platform.definir_politique_purge_contrats('conserver_contrat_minimise', 'TEST-V2-3A', interval '10 years');
select is(platform.etat_politique_contrats(), 'parametres_requis', '3a.1 durée seule : parametres_requis');
select is(platform.parametres_conservation_manquants(), array['point_depart', 'pieces_photos'], '3a.2 manquants : point de départ, pièces/photos');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select row(ok, lignes_supprimees) from public.purger_table_entreprise(current_setting('t.a')::uuid, 'devis', 'c9000000-0000-0000-0000-00000000a3a1')),
  row(false, null::integer), '3a.3 purge de devis refusée');
select throws_like('select * from public.purger_contrats_conserves_echus()',
  'DECISION_REQUIRED:RGPD-PARAMETRES-CONSERVATION-CONTRAT%', '3a.4 suppression des instantanés échus refusée');
reset role;
select set_config('request.jwt.claims', '', true);
select ok((select erreur like 'DECISION_REQUIRED:RGPD-PARAMETRES-CONSERVATION-CONTRAT — 4 contrat(s)%'
                  and detail -> 'parametres_manquants' = '["point_depart", "pieces_photos"]'::jsonb and lignes_affectees is null
             from platform.purge_audit where run_id = 'c9000000-0000-0000-0000-00000000a3a1'),
  '3a.5 refus audité avec la cause et les paramètres manquants, aucune ligne affectée');
select throws_like($$select public._preserver_contrats_acceptes('a0000000-0000-0000-0000-000000000001', gen_random_uuid())$$,
  'DECISION_REQUIRED:RGPD-PARAMETRES-CONSERVATION-CONTRAT%', '3a.6 préservation directe refusée');

-- 3b. Ancien appel à 4 arguments (504) : durée + photos, sans point de départ.
select platform.definir_politique_purge_contrats('conserver_contrat_minimise', 'TEST-V2-3B', interval '10 years', false);
select is(platform.parametres_conservation_manquants(), array['point_depart'], '3b.1 appel à 4 arguments : point de départ toujours manquant');
select is(platform.etat_politique_contrats(), 'parametres_requis', '3b.2 appel à 4 arguments : non actif');

-- 3c. Point de départ + photos, sans durée.
select platform.definir_politique_purge_contrats('conserver_contrat_minimise', 'TEST-V2-3C', null, false, array['date_contrat']);
select is(platform.etat_politique_contrats(), 'duree_requise', '3c.1 sans durée : duree_requise');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok((select not ok and erreur like 'DECISION_REQUIRED:RGPD-DUREE-CONSERVATION-CONTRAT%(paramètres manquants : duree)%'
             from public.purger_table_entreprise(current_setting('t.a')::uuid, 'avenants', 'c9000000-0000-0000-0000-00000000a3c1')),
  '3c.2 purge des avenants refusée, cause durée');
reset role;
select set_config('request.jwt.claims', '', true);

-- 3d. Durée + point de départ, sans choix explicite des photos.
select platform.definir_politique_purge_contrats('conserver_contrat_minimise', 'TEST-V2-3D', interval '10 years', null, array['date_contrat']);
select is(platform.parametres_conservation_manquants(), array['pieces_photos'], '3d.1 choix des photos non exprimé : manquant (le défaut false ne vaut pas décision)');

-- 3e. Purge complète du tenant avec paramètres incomplets : incomplète, contrats intacts.
select set_config('rgpd.entreprise_cible', current_setting('t.a'), true);
select set_config('rgpd.run_id', 'c9000000-0000-0000-0000-00000000a3e1', true);
\ir fixtures/rgpd_purge_driver.inc
select is(current_setting('rgpd.resultat'), 'incomplete:avenants,lignes_devis,pieces_jointes_devis,chantiers,devis',
  '3e.1 purge incomplète, arrêtée sur les 5 tables porteuses');
select is((select count(*)::integer from public.devis where entreprise_id = current_setting('t.a')::uuid and statut = 'accepte')
          + (select count(*)::integer from public.avenants where entreprise_id = current_setting('t.a')::uuid and statut = 'accepte'),
  4, '3e.2 les 4 contrats acceptés sont intacts');
select is((select count(*)::integer from platform.contrats_acceptes_purges), 0, '3e.3 aucun instantané figé');
select ok((select purgee_at is null from public.entreprises where id = current_setting('t.a')::uuid), '3e.4 entreprise non marquée purgée');

-- ─── 4. Point de départ par règle (simulation, rien d'activé) ──────────
-- Données de test : fin réelle du chantier c2…01 (D1, D2, avenant) ; a4…01 (D3) en cours.
update public.chantiers set date_fin_reelle = current_date - 10 where id = 'c2000000-0000-0000-0000-000000000001';
insert into public.reserves_chantiers (entreprise_id, nom, source, chantier_gp_id, statut, date_reception, created_by)
values (current_setting('t.a')::uuid, 'Rénovation maison Lefèvre (Réserves)', 'gestion_pro', 'c2000000-0000-0000-0000-000000000001',
        'receptionne', current_date - 7, '10000000-0000-0000-0000-000000000001');
update public.entreprises set suppression_demandee_at = now() - interval '31 days' where id = current_setting('t.a')::uuid;
create temporary table _sim on commit drop as
select r.regle, c.type, c.id, s.date_depart, s.regles_appliquees
  from unnest(platform.regles_depart_conservation_contrat()) r(regle)
  cross join (values ('devis', current_setting('t.d1')::uuid), ('devis', current_setting('t.d2')::uuid),
                     ('devis', current_setting('t.d3')::uuid), ('avenant', current_setting('t.av')::uuid)) c(type, id)
  cross join lateral platform.simuler_conservation_contrat(c.type, c.id, interval '1 year', array[r.regle]) s;
select is((select date_depart from _sim where regle = 'date_contrat' and id = current_setting('t.d1')::uuid), current_date - 60,
  '4.1 date_contrat (devis) : date d''émission');
select is((select date_depart from _sim where regle = 'date_contrat' and id = current_setting('t.av')::uuid),
  (select (date_acceptation at time zone 'Europe/Paris')::date from public.avenants where id = current_setting('t.av')::uuid),
  '4.2 date_contrat (avenant) : date d''acceptation, jour civil Europe/Paris');
select is((select date_depart from _sim where regle = 'acceptation' and id = current_setting('t.d1')::uuid), null::date,
  '4.3 acceptation (devis) : aucune trace « devis_accepte » au journal → indéterminable');
select is((select date_depart from _sim where regle = 'acceptation' and id = current_setting('t.av')::uuid),
  (select (date_acceptation at time zone 'Europe/Paris')::date from public.avenants where id = current_setting('t.av')::uuid),
  '4.4 acceptation (avenant) : date enregistrée par le verrou');
select is((select array_agg(date_depart order by id) from _sim where regle = 'fin_chantier'),
  (select array_agg(v order by k) from (values (current_setting('t.av')::uuid, current_date - 10), (current_setting('t.d3')::uuid, null::date),
     (current_setting('t.d1')::uuid, current_date - 10), (current_setting('t.d2')::uuid, current_date - 10)) t(k, v)),
  '4.5 fin_chantier : fin réelle du chantier rattaché ; chantier en cours → indéterminable');
select is((select date_depart from _sim where regle = 'reception_travaux' and id = current_setting('t.d2')::uuid), current_date - 7,
  '4.6 reception_travaux : date de réception saisie dans Réserves');
select is((select date_depart from _sim where regle = 'reception_travaux' and id = current_setting('t.d3')::uuid), null::date,
  '4.7 reception_travaux : pas de réception → indéterminable');
select is((select date_depart from _sim where regle = 'derniere_facture' and id = current_setting('t.d1')::uuid),
  (select max(date_emission) from public.factures where devis_origine_id = current_setting('t.d1')::uuid and statut <> 'brouillon'),
  '4.8 derniere_facture : dernière facture émise rattachée au devis');
select is((select date_depart from _sim where regle = 'derniere_facture' and id = current_setting('t.d2')::uuid), null::date,
  '4.9 derniere_facture : devis non facturé → indéterminable');
select is((select date_depart from _sim where regle = 'dernier_paiement' and id = current_setting('t.av')::uuid), current_date - 5,
  '4.10 dernier_paiement (avenant → devis d''origine) : dernier règlement');
select is((select count(*)::integer from _sim where regle = 'demande_suppression'
                                             and date_depart = ((now() - interval '31 days') at time zone 'Europe/Paris')::date), 4,
  '4.11 demande_suppression : date de la demande de suppression du compte, pour tous les contrats');
select is((select date_depart from platform.simuler_conservation_contrat('devis', current_setting('t.d1')::uuid, interval '1 year',
                                                                         array['date_contrat', 'fin_chantier', 'reception_travaux'])),
  current_date - 7, '4.12 plusieurs règles : la date la plus tardive');
select is((select row(date_depart, regles_appliquees) from platform.simuler_conservation_contrat('devis', current_setting('t.d3')::uuid, interval '1 year',
                                                                         array['fin_chantier'], 'date_contrat')),
  row((select date_emission from public.devis where id = current_setting('t.d3')::uuid), array['repli:date_contrat']),
  '4.13 indéterminable + repli : la règle de repli s''applique et est tracée');
select is((select date_depart from platform.simuler_conservation_contrat('devis', current_setting('t.d3')::uuid, interval '1 year',
                                                                         array['fin_chantier', 'date_contrat'])),
  null::date, '4.14 une règle indéterminable dans une combinaison, sans repli → indéterminable (jamais de date partielle)');
select throws_ok($$select * from platform.simuler_conservation_contrat('devis', 'c3000000-0000-0000-0000-000000000001', interval '1 year', array['resiliation'])$$,
  '22023', null, '4.15 simulation : règle non supportée refusée');
select is((select count(*)::integer from platform.contrats_acceptes_purges), 0, '4.16 la simulation n''écrit rien');

-- ─── 5. Durées de TEST 1 / 5 / 10 ans ─────────────────────────────────
select is(
  (select array_agg(row(dernier_jour_conserve, suppression_possible_a_partir_de)::text order by d)
     from unnest(array[interval '1 year', interval '5 years', interval '10 years']) d
     cross join lateral platform.simuler_conservation_contrat('devis', current_setting('t.d1')::uuid, d, array['date_contrat'])),
  (select array_agg(row((current_date - 60 + d)::date, ((current_date - 60 + d)::date + 1)::timestamp at time zone 'Europe/Paris')::text order by d)
     from unnest(array[interval '1 year', interval '5 years', interval '10 years']) d),
  '5.1 1 / 5 / 10 ans (valeurs de TEST) : dernier jour = départ + durée ; suppression le lendemain 00:00 Europe/Paris');
select is(platform.dernier_jour_conservation_contrat(date '2021-06-15', interval '5 years'), date '2026-06-15', '5.2 5 ans : 2021-06-15 → 2026-06-15 inclus');
select is(platform.dernier_jour_conservation_contrat(date '2016-06-15', interval '10 years'), date '2026-06-15', '5.3 10 ans : 2016-06-15 → 2026-06-15 inclus');
select is(platform.dernier_jour_conservation_contrat(date '2025-06-15', interval '1 year'), date '2026-06-15', '5.4 1 an : 2025-06-15 → 2026-06-15 inclus');

-- ─── 6. Échéance : avant / jour / après, changement d'heure, 29 février, fuseau ─
-- Départ 2025-03-15, 5 ans (TEST) : dernier jour 2030-03-15 ; suppression dès 2030-03-16 00:00 Paris (23:00 UTC la veille, heure d'hiver).
select is(platform.echeance_conservation_contrat(date '2025-03-15', interval '5 years'), timestamptz '2030-03-15 23:00:00+00',
  '6.1 hiver : suppression possible à 2030-03-16 00:00 Europe/Paris (= 23:00 UTC)');
select is(platform.echeance_conservation_contrat(date '2025-07-01', interval '1 year'), timestamptz '2026-07-01 22:00:00+00',
  '6.2 été : 2026-07-02 00:00 Europe/Paris (= 22:00 UTC)');
select is(platform.echeance_conservation_contrat(date '2025-03-29', interval '1 year'), timestamptz '2026-03-29 22:00:00+00',
  '6.3 dernier jour = jour du passage à l''heure d''été (2026-03-29) : suppression le 30 mars 00:00 CEST (= 22:00 UTC)');
select is(platform.dernier_jour_conservation_contrat(date '2024-02-29', interval '1 year'), date '2025-02-28', '6.4 29 février + 1 an : 28 février (arithmétique PostgreSQL)');
select is(platform.dernier_jour_conservation_contrat(date '2024-02-29', interval '4 years'), date '2028-02-29', '6.5 29 février + 4 ans : 29 février');
-- Instantané de test : départ 2025-03-15, 5 ans, inséré par le propriétaire (paramètres cohérents, contrainte V2).
insert into platform.contrats_acceptes_purges (id, entreprise_id, type_contrat, source_id, reference, politique, decision_ref,
  niveau, contenu, empreinte_document, empreinte_contenu, conserver_jusqu_au,
  date_depart_conservation, regles_depart_appliquees, duree_conservation, dernier_jour_conserve, inclure_photos)
values ('c9e00000-0000-0000-0000-000000000001', current_setting('t.b')::uuid, 'devis', gen_random_uuid(), 'BORNE', 'conserver_contrat_minimise', 'TEST-V2-BORNE',
  'contrat_minimise', '{}', repeat('1', 64), repeat('2', 64), platform.echeance_conservation_contrat(date '2025-03-15', interval '5 years'),
  date '2025-03-15', array['date_contrat'], interval '5 years', date '2030-03-15', false);
select throws_ok($$insert into platform.contrats_acceptes_purges (entreprise_id, type_contrat, source_id, reference, politique, decision_ref,
    niveau, contenu, empreinte_document, empreinte_contenu, conserver_jusqu_au,
    date_depart_conservation, regles_depart_appliquees, duree_conservation, dernier_jour_conserve, inclure_photos)
  values ('b0000000-0000-0000-0000-000000000001', 'devis', gen_random_uuid(), 'INCOHERENT', 'conserver_contrat_minimise', 'X',
    'contrat_minimise', '{}', repeat('3', 64), repeat('4', 64), timestamptz '2030-03-15 00:00:00+00',
    date '2025-03-15', array['date_contrat'], interval '5 years', date '2030-03-15', false)$$,
  '23514', null, '6.6 instantané dont l''échéance ne découle pas de départ + durée : refusé');
select platform.definir_politique_purge_contrats('conserver_contrat_minimise', 'TEST-V2-6', interval '5 years', false, array['date_contrat']);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
create temporary table _bornes (libelle text, instant timestamptz, attendu boolean) on commit drop;
insert into _bornes values
  ('avant : veille du dernier jour', timestamptz '2030-03-14 12:00:00 Europe/Paris', false),
  ('jour échéance 00:00', timestamptz '2030-03-15 00:00:00 Europe/Paris', false),
  ('jour échéance 23:59:59.999999', timestamptz '2030-03-15 23:59:59.999999 Europe/Paris', false),
  ('lendemain 00:00', timestamptz '2030-03-16 00:00:00 Europe/Paris', true),
  ('après', timestamptz '2031-01-01 00:00:00 Europe/Paris', true);
select is((select array_agg(b.libelle || '=' || r.echu order by b.instant) from _bornes b
             cross join lateral public.rapport_echeances_contrats_conserves(b.instant) r
            where r.id = 'c9e00000-0000-0000-0000-000000000001'),
          (select array_agg(libelle || '=' || attendu order by instant) from _bornes),
  '6.7 avant échéance : conservé ; jour de l''échéance (jusqu''à 23:59:59.999999 Paris) : conservé ; lendemain 00:00 : échu');
reset role;
select set_config('request.jwt.claims', '', true);
-- Fuseau de la session : mêmes résultats.
create temporary table _fuseaux (tz text, e1 timestamptz, e2 date, dep date, echu boolean) on commit drop;
set local timezone = 'Pacific/Kiritimati';
insert into _fuseaux select 'Pacific/Kiritimati', platform.echeance_conservation_contrat(date '2025-03-15', interval '5 years'),
  platform.dernier_jour_conservation_contrat(date '2025-03-15', interval '5 years'),
  (select date_depart from platform.simuler_conservation_contrat('avenant', current_setting('t.av')::uuid, interval '1 year', array['date_contrat'])),
  (select echu from public.rapport_echeances_contrats_conserves(timestamptz '2030-03-15 23:30:00+00') where id = 'c9e00000-0000-0000-0000-000000000001');
set local timezone = 'America/Los_Angeles';
insert into _fuseaux select 'America/Los_Angeles', platform.echeance_conservation_contrat(date '2025-03-15', interval '5 years'),
  platform.dernier_jour_conservation_contrat(date '2025-03-15', interval '5 years'),
  (select date_depart from platform.simuler_conservation_contrat('avenant', current_setting('t.av')::uuid, interval '1 year', array['date_contrat'])),
  (select echu from public.rapport_echeances_contrats_conserves(timestamptz '2030-03-15 23:30:00+00') where id = 'c9e00000-0000-0000-0000-000000000001');
set local timezone = 'UTC';
insert into _fuseaux select 'UTC', platform.echeance_conservation_contrat(date '2025-03-15', interval '5 years'),
  platform.dernier_jour_conservation_contrat(date '2025-03-15', interval '5 years'),
  (select date_depart from platform.simuler_conservation_contrat('avenant', current_setting('t.av')::uuid, interval '1 year', array['date_contrat'])),
  (select echu from public.rapport_echeances_contrats_conserves(timestamptz '2030-03-15 23:30:00+00') where id = 'c9e00000-0000-0000-0000-000000000001');
select is((select count(distinct (e1, e2, dep, echu))::integer from _fuseaux), 1,
  '6.8 fuseau de session (Kiritimati +14, Los Angeles, UTC) : échéance, dernier jour, départ et statut identiques');
select ok((select bool_and(echu) from _fuseaux), '6.9 2030-03-15 23:30 UTC (= 16 mars 00:30 Paris) : échu dans tous les fuseaux');

-- ─── 7. Purge réelle, paramètres de TEST : 10 ans, fin_chantier, repli date_contrat, sans photos ─
select set_config('t.d3_emission', (select date_emission::text from public.devis where id = current_setting('t.d3')::uuid), true);
select platform.definir_politique_purge_contrats('conserver_contrat_minimise', 'TEST-V2-PURGE', interval '10 years', false,
  array['fin_chantier', 'reception_travaux'], 'date_contrat');
select is(platform.etat_politique_contrats(), 'conserver_contrat_minimise', '7.1 paramètres complets (TEST) : actif');
-- R5 : première étape de la purge = une table SANS contrat (la réception Réserves du chantier).
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select row(ok, lignes_supprimees) from public.purger_table_entreprise(current_setting('t.a')::uuid, 'reserves_chantiers', 'c9000000-0000-0000-0000-00000000a701')),
  row(true, 1), '7.2 première étape : reserves_chantiers supprimée');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select count(*)::integer from platform.contrats_acceptes_purges where run_id = 'c9000000-0000-0000-0000-00000000a701'), 4,
  '7.3 instantanés figés dès cette première étape, AVANT la suppression de la réception (R5)');
select set_config('rgpd.run_id', 'c9000000-0000-0000-0000-00000000a701', true);
\ir fixtures/rgpd_purge_driver.inc
select is(current_setting('rgpd.resultat'), 'complete', '7.4 purge complète');
select is(
  (select array_agg(row(type_contrat, date_depart_conservation, regles_depart_appliquees)::text order by type_contrat, source_id)
     from platform.contrats_acceptes_purges where entreprise_id = current_setting('t.a')::uuid),
  (select array_agg(v order by k1, k2) from (values
     ('avenant', current_setting('t.av')::uuid, row('avenant', current_date - 7, array['fin_chantier', 'reception_travaux'])::text),
     ('devis', current_setting('t.d3')::uuid, row('devis', current_setting('t.d3_emission')::date, array['repli:date_contrat'])::text),
     ('devis', current_setting('t.d1')::uuid, row('devis', current_date - 7, array['fin_chantier', 'reception_travaux'])::text),
     ('devis', current_setting('t.d2')::uuid, row('devis', current_date - 7, array['fin_chantier', 'reception_travaux'])::text)) t(k1, k2, v)),
  '7.5 départ figé : réception (plus tardive que la fin de chantier) ; D3 sans fin ni réception → repli date_contrat');
select is((select count(*)::integer from platform.contrats_acceptes_purges
            where entreprise_id = current_setting('t.a')::uuid and duree_conservation = interval '10 years' and not inclure_photos
              and dernier_jour_conserve = (date_depart_conservation + interval '10 years')::date
              and conserver_jusqu_au = platform.echeance_conservation_contrat(date_depart_conservation, interval '10 years')),
  4, '7.6 durée, choix des photos, dernier jour et échéance figés dans chaque instantané');
select is((select count(*)::integer from platform.contrats_acceptes_purges
            where entreprise_id = current_setting('t.a')::uuid and jsonb_path_exists(contenu, '$.photos[*].storage_path')),
  0, '7.7 photos non conservées (choix de TEST false) : aucun chemin Storage');
select ok((select detail ->> 'duree_conservation' = '10 years' and detail -> 'regles_depart' = '["fin_chantier", "reception_travaux"]'::jsonb
                  and detail ->> 'regle_depart_repli' = 'date_contrat'
             from platform.purge_audit where run_id = 'c9000000-0000-0000-0000-00000000a701' and etape = 'preuve_contrats_acceptes' and ok),
  '7.8 audit : paramètres de conservation consignés avec la preuve');
select is((select md5(string_agg(to_jsonb(d)::text, '|' order by d.id)) from public.devis d where d.entreprise_id = current_setting('t.b')::uuid),
  (select e from _b_avant), '7.9 tenant B strictement inchangé');
-- Échéance réelle (10 ans) : rien d'échu aujourd'hui.
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select count(*)::integer from public.purger_contrats_conserves_echus() where entreprise_id = current_setting('t.a')::uuid), 0,
  '7.10 avant échéance : aucun instantané du tenant supprimé');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select array_agg(echu order by instant) from (
             select r.echu, x.instant from (values (-1), (0)) o(k)
             cross join lateral (select c.conserver_jusqu_au + o.k * interval '1 microsecond' as instant
                                   from platform.contrats_acceptes_purges c where c.source_id = current_setting('t.d1')::uuid) x
             cross join lateral public.rapport_echeances_contrats_conserves(x.instant) r
            where r.source_id = current_setting('t.d1')::uuid) t),
  array[false, true], '7.11 instantané réel : non échu 1 µs avant l''échéance, échu à l''échéance');

-- ─── 8. Immutabilité pendant la conservation ───────────────────────────
select throws_ok($$update platform.contrats_acceptes_purges set contenu = '{}' where source_id = 'c3000000-0000-0000-0000-000000000001'$$,
  'Une preuve de contrat purgé est immuable', '8.1 contenu non modifiable');
select throws_ok($$update platform.contrats_acceptes_purges set conserver_jusqu_au = now() - interval '1 day' where source_id = 'c3000000-0000-0000-0000-000000000001'$$,
  'Une preuve de contrat purgé est immuable', '8.2 échéance non avançable');
select throws_ok($$update platform.contrats_acceptes_purges set date_depart_conservation = date '2000-01-01' where source_id = 'c3000000-0000-0000-0000-000000000001'$$,
  'Une preuve de contrat purgé est immuable', '8.3 point de départ non modifiable');
select throws_ok($$update platform.contrats_acceptes_purges set duree_conservation = interval '1 year' where source_id = 'c3000000-0000-0000-0000-000000000001'$$,
  'Une preuve de contrat purgé est immuable', '8.4 durée figée non modifiable');
select throws_ok($$delete from platform.contrats_acceptes_purges where source_id = 'c3000000-0000-0000-0000-000000000001'$$,
  'Une preuve de contrat purgé ne peut être supprimée qu''après son échéance de conservation', '8.5 suppression avant échéance refusée (même au propriétaire)');
select throws_ok('truncate platform.contrats_acceptes_purges',
  'Les preuves de contrats purgés ne peuvent pas être vidées (TRUNCATE refusé)', '8.6 TRUNCATE refusé');
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok('delete from platform.contrats_acceptes_purges', '42501', null, '8.7 service_role : aucune suppression directe');
select throws_ok('select * from platform.contrats_acceptes_purges', '42501', null, '8.8 service_role : aucune lecture directe');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok('select * from public.purger_contrats_conserves_echus()', '42501', null, '8.9 authenticated : suppression des échus interdite');
select throws_ok('select * from public.rapport_echeances_contrats_conserves()', '42501', null, '8.10 authenticated : rapport des échéances interdit');
select throws_ok($$select * from platform.simuler_conservation_contrat('devis', gen_random_uuid(), interval '1 year', array['date_contrat'])$$,
  '42501', null, '8.11 authenticated : simulation interdite');
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok($$select platform.definir_politique_purge_contrats('conserver_contrat_minimise', 'X', interval '1 year', true, array['date_contrat'])$$,
  '42501', null, '8.12 service_role : paramètres non modifiables');
select throws_ok($$select * from platform.simuler_conservation_contrat('devis', gen_random_uuid(), interval '1 year', array['date_contrat'])$$,
  '42501', null, '8.13 service_role : simulation réservée au propriétaire');
reset role;
select set_config('request.jwt.claims', '', true);

-- ─── 9. Suppression après échéance ─────────────────────────────────────
-- Instantanés de test du propriétaire, paramètres cohérents (contrainte V2). Politique courante : 10 ans.
insert into platform.contrats_acceptes_purges (id, entreprise_id, type_contrat, source_id, reference, politique, decision_ref,
  niveau, contenu, empreinte_document, empreinte_contenu, conserver_jusqu_au,
  date_depart_conservation, regles_depart_appliquees, duree_conservation, dernier_jour_conserve, inclure_photos)
select v.id, current_setting('t.b')::uuid, 'devis', gen_random_uuid(), v.ref, 'conserver_contrat_minimise', 'TEST-V2-ECHEANCE',
       'contrat_minimise', v.contenu, v.e1, v.e2, platform.echeance_conservation_contrat(v.dep, v.duree),
       v.dep, array['date_contrat'], v.duree, platform.dernier_jour_conservation_contrat(v.dep, v.duree), true
  from (values
    -- échu : départ il y a 10 ans et 5 jours, 10 ans
    ('c9e00000-0000-0000-0000-000000000011'::uuid, 'ECHU-1', ((now() at time zone 'Europe/Paris')::date - interval '10 years' - interval '5 days')::date, interval '10 years',
     '{"photos":[{"storage_path":"b0000000-0000-0000-0000-000000000001/echu-1/b.jpg"},{"storage_path":"b0000000-0000-0000-0000-000000000001/echu-1/a.jpg"}]}'::jsonb,
     repeat('5', 64), repeat('6', 64)),
    -- échu : départ il y a 10 ans et 1 jour (dernier jour = hier)
    ('c9e00000-0000-0000-0000-000000000012'::uuid, 'ECHU-2', ((now() at time zone 'Europe/Paris')::date - interval '10 years' - interval '1 day')::date, interval '10 years',
     '{}'::jsonb, repeat('7', 64), repeat('8', 64)),
    -- jour de l'échéance : dernier jour = aujourd'hui (Paris) → conservé
    ('c9e00000-0000-0000-0000-000000000013'::uuid, 'JOUR-J', ((now() at time zone 'Europe/Paris')::date - interval '10 years')::date, interval '10 years',
     '{}'::jsonb, repeat('9', 64), repeat('a', 64)),
    -- échéance figée passée (1 an) mais durée courante 10 ans → allongement : conservé
    ('c9e00000-0000-0000-0000-000000000014'::uuid, 'ALLONGE', ((now() at time zone 'Europe/Paris')::date - interval '2 years')::date, interval '1 year',
     '{}'::jsonb, repeat('b', 64), repeat('c', 64))
  ) v(id, ref, dep, duree, contenu, e1, e2);
-- Raccourcissement : échéance figée (10 ans) future, alors qu'avec 5 ans elle serait passée → conservé.
insert into platform.contrats_acceptes_purges (id, entreprise_id, type_contrat, source_id, reference, politique, decision_ref,
  niveau, contenu, empreinte_document, empreinte_contenu, conserver_jusqu_au,
  date_depart_conservation, regles_depart_appliquees, duree_conservation, dernier_jour_conserve, inclure_photos)
values ('c9e00000-0000-0000-0000-000000000015', current_setting('t.b')::uuid, 'devis', gen_random_uuid(), 'RACCOURCI', 'conserver_contrat_minimise', 'TEST-V2-ECHEANCE',
  'contrat_minimise', '{}', repeat('d', 64), repeat('e', 64),
  platform.echeance_conservation_contrat(((now() at time zone 'Europe/Paris')::date - interval '6 years')::date, interval '10 years'),
  ((now() at time zone 'Europe/Paris')::date - interval '6 years')::date, array['date_contrat'], interval '10 years',
  platform.dernier_jour_conservation_contrat(((now() at time zone 'Europe/Paris')::date - interval '6 years')::date, interval '10 years'), false);

select throws_ok($$delete from platform.contrats_acceptes_purges where id = 'c9e00000-0000-0000-0000-000000000012'$$,
  'Une preuve de contrat purgé ne se supprime que par purger_contrats_conserves_echus',
  '9.1 échu mais suppression directe (même propriétaire) refusée : seule la fonction contrôlée supprime');

-- Transactionnel : une erreur au milieu du lot annule tout le lot.
create function pg_temp.panne_echeance() returns trigger language plpgsql as $$
begin
  if old.reference = 'ECHU-2' then raise exception 'panne simulée pendant la suppression'; end if;
  return old;
end $$;
create trigger panne_echeance after delete on platform.contrats_acceptes_purges for each row execute function pg_temp.panne_echeance();
select throws_ok('select * from public.purger_contrats_conserves_echus()', 'P0001', 'panne simulée pendant la suppression',
  '9.2 panne pendant le lot : erreur remontée');
drop trigger panne_echeance on platform.contrats_acceptes_purges;
select is((select count(*)::integer from platform.contrats_acceptes_purges where reference in ('ECHU-1', 'ECHU-2')), 2,
  '9.3 tout ou rien : aucun instantané supprimé par le lot en panne');
select is((select count(*)::integer from platform.purge_audit where etape = 'echeance_contrat_conserve'), 0,
  '9.4 tout ou rien : aucune entrée d''audit du lot en panne');
select is((select count(*)::integer from platform.purge_autorisations_echeance), 0, '9.5 aucune autorisation résiduelle');

create temporary table _etat_avant on commit drop as
select md5(string_agg(id::text || empreinte_contenu, '|' order by id)) as e from platform.contrats_acceptes_purges;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
create temporary table _lot1 on commit drop as select * from public.purger_contrats_conserves_echus();
select ok((select bool_and(entreprise_id = current_setting('t.b')::uuid and type_contrat = 'devis') from _lot1),
  '9.6 lot exécuté par service_role : instantanés échus du tenant B uniquement');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select array_agg(reference order by reference) from platform.contrats_acceptes_purges where entreprise_id = current_setting('t.b')::uuid),
  array['ALLONGE', 'BORNE', 'JOUR-J', 'RACCOURCI'],
  '9.7 seuls ECHU-1 et ECHU-2 supprimés ; jour J, allongement, raccourcissement et 2030 conservés');
select is((select count(*)::integer from _lot1), 2, '9.8 deux instantanés rendus par le lot');
select is((select string_agg(array_to_string(chemins_storage, ','), ';' order by array_length(chemins_storage, 1) nulls first) from _lot1),
  ';b0000000-0000-0000-0000-000000000001/echu-1/a.jpg,b0000000-0000-0000-0000-000000000001/echu-1/b.jpg',
  '9.9 chemins Storage des photos à supprimer rendus (triés, déterministes)');
select is((select count(*)::integer from platform.purge_audit
            where etape = 'echeance_contrat_conserve' and ok and lignes_affectees = 1
              and detail ->> 'reference' in ('ECHU-1', 'ECHU-2') and detail ? 'date_depart_conservation'
              and detail ->> 'duree_conservation_courante' = '10 years' and detail ->> 'decision_ref_courante' = 'TEST-V2-PURGE'),
  2, '9.10 audit par instantané : référence, départ, durée figée et courante, décision');
select is((select count(*)::integer from platform.purge_autorisations_echeance), 0, '9.11 autorisations retirées après le lot');

-- Rejeu : rien de plus.
create temporary table _etat_apres on commit drop as
select md5(string_agg(id::text || empreinte_contenu, '|' order by id)) as e from platform.contrats_acceptes_purges;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select count(*)::integer from public.purger_contrats_conserves_echus()), 0, '9.12 rejeu : aucune suppression supplémentaire');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select md5(string_agg(id::text || empreinte_contenu, '|' order by id)) from platform.contrats_acceptes_purges),
  (select e from _etat_apres), '9.13 rejeu : état identique');
select isnt((select e from _etat_avant), (select e from _etat_apres), '9.14 (témoin) le premier lot a bien changé l''état');

-- Retour fail-closed : paramètres retirés → plus aucune suppression, même échue.
select platform.definir_politique_purge_contrats('conserver_contrat_minimise', 'TEST-V2-RETRAIT', null, false, array['date_contrat']);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_like('select * from public.purger_contrats_conserves_echus()',
  'DECISION_REQUIRED:RGPD-PARAMETRES-CONSERVATION-CONTRAT%état duree_requise%', '9.15 durée retirée : suppression des échus refusée');
select is((select count(*)::integer from public.rapport_echeances_contrats_conserves(timestamptz '2100-01-01') where echu), 0,
  '9.16 durée retirée : plus rien n''est considéré échu, même en 2100');
reset role;
select set_config('request.jwt.claims', '', true);
select platform.definir_politique_purge_contrats('non_decidee', null);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_like('select * from public.purger_contrats_conserves_echus()',
  'DECISION_REQUIRED:RGPD-PARAMETRES-CONSERVATION-CONTRAT%état non_decidee%', '9.17 politique non décidée : refus');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select count(*)::integer from platform.contrats_acceptes_purges), 8, '9.18 refus : aucun instantané supprimé (4 du tenant A, 4 du tenant B)');
select ok((select count(*) >= 7 from platform.purge_politique_contrats_journal
            where definie_le = now() and decision_ref like 'TEST-V2-%'),
  '9.19 chaque changement de paramètres de test est journalisé');

select * from finish();
rollback;
