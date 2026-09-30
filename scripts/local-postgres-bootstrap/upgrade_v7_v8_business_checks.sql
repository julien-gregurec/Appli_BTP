-- Train canonique V8 — contrôles MÉTIER sur la base upgradée V7 → V8 (scripts/qualification/upgrade-v7-v8.sh §7).
-- Rapport : docs/qualification/ELSATIA_CANONICAL_TRAIN_V8_CONVERGENCE_V1.md §7.
--
-- Rejoue, sur les données V3 → V7 réelles du jeu d'upgrade (jusqu'à upgrade_v7_v8_seed_complement.sql),
-- les comportements introduits par V8. Transaction ANNULÉE : la base upgradée n'est pas modifiée.
--   B  Billing (…0801-0803) : catalogue canonique, contrats existants intacts, annulation terminale,
--      essai expiré fermé en base ;
--   P  Per-App (…0804) : gains prévus et tracés, aucune perte, D-01 selon la règle par application ;
--   S  Security V2 (…0805) : garde tenant ↔ chantier, révocations ;
--   E  Employés (…0806) : colonnes sensibles fermées à la lecture directe, fiche filtrée, données intactes ;
--   I  Incident (…0807-0808, …0811) : mode sûr inerte après upgrade, gardes partout, aucun orphelin ;
--   L  Relevé Lots 8-9 (…0809-0810) : plans figés V5/V6 intacts, métré et quantitatif sur un plan V7 ;
--   C  Performance C2 (…0812) : totaux de devis exacts ; X  identité / Studio du projet partagé inertes.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(47);

create function pg_temp.en_session(p uuid) returns text language sql as $$
  select set_config('role', 'authenticated', true)
      || set_config('request.jwt.claim.sub', p::text, true)
      || set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.en_service() returns text language sql as $$
  select set_config('role', 'postgres', true)
      || set_config('request.jwt.claim.sub', '', true)
      || set_config('request.jwt.claims', '', true)
$$;
create function pg_temp.plan(p_etat text) returns uuid language sql security definer as $$
  select id from public.tools_releves_plans where etage_id = 'f5300000-0000-4000-8000-000000000001' and etat_documente = p_etat
    and deleted_at is null order by numero desc limit 1
$$;
grant execute on function pg_temp.plan(text) to authenticated;
-- Entreprise et compte pilotes : UUID tirés au chargement du seed (reference_interne stable).
create function pg_temp.pilote() returns uuid language sql security definer as $$
  select id from public.entreprises where reference_interne = 'PILOTE-BTP-V1'
$$;
create function pg_temp.pilote_user() returns uuid language sql security definer as $$
  select ue.utilisateur_id from public.utilisateurs_entreprises ue
   where ue.entreprise_id = pg_temp.pilote() and ue.statut = 'actif' order by ue.utilisateur_id limit 1
$$;
grant execute on function pg_temp.pilote(), pg_temp.pilote_user() to authenticated;
do $$ begin execute format('grant temporary on database %I to authenticated', current_database()); end $$;
create temporary table _figes as select * from public.tools_releves_plans
  where etage_id = 'f5300000-0000-4000-8000-000000000001' and fige_le is not null;
grant select on _figes to authenticated;

-- ── B. Billing ──────────────────────────────────────────────────────────────────────────
select is((select string_agg(code || ' ' || prix_mensuel_ht::int || '/' || prix_annuel_ht::int, ' · ' order by code)
             from public.plans_abonnement where actif and code in ('mini', 'pro', 'business', 'entreprise')),
  'business 449/4490 · entreprise 599/5990 · mini 79/790 · pro 249/2490', 'B01 catalogue actif = grille canonique (annuel ×10)');
select is((select string_agg(code || ' v' || version || ' ' || prix_mensuel_ht::int || ' ' || actif, ' · ' order by code, version)
             from public.plans_abonnement where code in ('mini', 'pro', 'business') and prix_mensuel_ht in (69, 199, 399)),
  'business v2 399 false · mini v2 69 false · pro v3 199 false', 'B02 grille 69/199/399 conservée en historique, désactivée');
select is((select code_offre || '|' || version_tarif || '|' || prix_contractuel_ht || '|' || statut from public.abonnements_entreprises
            where id = 'a7700000-0000-4000-8000-000000000050'),
  'mini|2|69.00|actif', 'B03 contrat existant au prix 69 € : non modifié (DECISION_REQUIRED:BILLING-CONTRATS-PRIX-69)');
select is((public.appliquer_evenement_facture_abonnement_service('a7400000-0000-4000-8000-000000000070', 'evt_upg8_late_paid', 'invoice.paid',
            now(), 'in_upg8_late', 'paid', now(), 'F-UPG8', now() - interval '30 days', now(), 10, 2, 12, 'eur', null, null) ->> 'statut_resultant'),
  'annule', 'B04 annulé en V7 : un invoice.paid tardif ne le rouvre pas (B-1)');
select is((select abonnement_statut from public.entreprises where id = 'a7400000-0000-4000-8000-000000000070'), 'annule', 'B05 toujours annulé');
select pg_temp.en_session(pg_temp.pilote_user());
select ok(not public.est_membre_actif(pg_temp.pilote()),
  'B06 entreprise pilote, essai échu le 29/08 : métier Gestion Pro fermé en base (B-4)');
select ok(public.est_membre_plateforme_actif(pg_temp.pilote()),
  'B07 entreprise pilote : appartenance plateforme conservée (chemin facturation, autres applications)');
select is((select count(*)::int from public.chantiers), 0, 'B08 entreprise pilote : aucun chantier lisible par l''API (essai échu)');
select pg_temp.en_service();

-- ── P. Per-App ──────────────────────────────────────────────────────────────────────────
select is((select count(*)::int from public.rapport_migration_suspension_par_app_v1 where changement = 'perte_acces'), 0,
  'P01 rapport de migration : aucune perte d''accès');
select is((select string_agg(g, ',' order by g) from (
               select case when entreprise_id = pg_temp.pilote() then 'pilote' else left(entreprise_id::text, 8) end || ':' || application_code as g
                 from public.rapport_migration_suspension_par_app_v1 where changement = 'gain_acces') r),
  'a9000000:reserves,e0000000:colors,pilote:colors,pilote:reserves',
  'P02 gains tracés (état « avant » = train Billing …0803) : Colors B (GP suspendu), hôte D-01, pilote (essai échu)');
select is((select count(*)::int from public.acces_applications_entreprises where statut_commercial <> 'entitled'), 0,
  'P03 toutes les lignes existantes : entitled');
select is((select count(*)::int from public.entreprises where suspension_globale_at is not null), 0, 'P04 aucune suspension globale posée');
select pg_temp.en_session('11000000-0000-4000-8000-000000000006');
select ok(public.a_acces_application('e0000000-0000-4000-8000-00000000000b', 'colors')
          and not public.est_membre_actif('e0000000-0000-4000-8000-00000000000b'),
  'P05 GP suspendu (past_due) : Colors reste ouvert, Gestion Pro fermé (cas principal Per-App)');
select ok((select count(*) from public.colors_seaux) >= 1, 'P06 Colors B : seaux relus après upgrade');
select pg_temp.en_service();
select ok(public.application_commercialement_ouverte(pg_temp.pilote(), 'reserves')
          and public.application_commercialement_ouverte(pg_temp.pilote(), 'colors')
          and not public.application_commercialement_ouverte(pg_temp.pilote(), 'gestion_pro'),
  'P07 pilote (essai GP échu) : Colors et Réserves commercialement ouverts, Gestion Pro fermé (droit par application)');
select ok(public.reserves_hote_ecriture_ouverte('a9000000-0000-0000-0000-000000000001'),
  'P08 D-01 : hôte GP suspendu mais Réserves autorisé → écriture de l''invité rouverte (décision Per-App)');
select is((select count(*)::int from public.reserves where chantier_id = 'e9000000-0000-0000-0000-000000000001'), 2,
  'P09 D-01 : réserves de l''hôte intactes');

-- ── S. Security V2 ──────────────────────────────────────────────────────────────────────
select is((select count(*)::int from public.reserves_intervenants i join public.reserves_chantiers c on c.id = i.chantier_id
            where c.entreprise_id <> i.entreprise_id)
        + (select count(*)::int from public.reserves_plans p join public.reserves_chantiers c on c.id = p.chantier_id
            where c.entreprise_id <> p.entreprise_id), 0,
  'S01 aucun rattachement inter-tenant existant (la garde n''invalide rien)');
select throws_ok($$ insert into public.reserves_intervenants (entreprise_id, chantier_id, nom, created_by)
                    select 'b0000000-0000-0000-0000-000000000001', c.id, 'Intrus', '20000000-0000-0000-0000-000000000001'
                      from public.reserves_chantiers c where c.entreprise_id = 'a0000000-0000-0000-0000-000000000001' limit 1 $$,
  '42501', null, 'S02 intervenant rattaché au chantier d''un autre tenant : refusé (F4)');
select ok((select nom from public.reserves_intervenants where id = 'a7800000-0000-4000-8000-000000000001') = 'Intervenant UPG7',
  'S03 intervenant V7 du même tenant conservé');
select ok(not has_function_privilege('authenticated', 'public.construire_client_snapshot(uuid,uuid,text)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.capacite_stripe_operations_a_reprendre(integer)', 'EXECUTE')
          and has_function_privilege('service_role', 'public.capacite_stripe_operations_a_reprendre(integer)', 'EXECUTE'),
  'S04 F7 : deux SECURITY DEFINER inter-tenant retirées à authenticated, service conservé');

-- ── E. Employés ─────────────────────────────────────────────────────────────────────────
select pg_temp.en_session('10000000-0000-0000-0000-000000000002');
select throws_ok($$ select email from public.employes where id = 'a2000000-0000-0000-0000-000000000001' $$, '42501', null,
  'E01 ouvrier : e-mail d''un collègue illisible par la table (PostgREST)');
select throws_ok($$ select notes from public.employes $$, '42501', null, 'E02 ouvrier : notes RH illisibles par la table');
select is((select count(*)::int from public.employes), 4, 'E03 ouvrier : identité des collègues toujours lisible (embeds)');
select is((select string_agg(id::text, ',') from public.employes_fiche), 'a2000000-0000-0000-0000-000000000002',
  'E04 ouvrier : fiche détaillée limitée à la sienne');
select is((select notes from public.employes_fiche where id = 'a2000000-0000-0000-0000-000000000002'), null,
  'E05 ouvrier : sa propre note RH masquée');
select pg_temp.en_session('10000000-0000-0000-0000-000000000001');
select is((select notes from public.employes_fiche where id = 'a2000000-0000-0000-0000-000000000002'),
  'NOTE RH V7 — Ouvrier A (entretien annuel, confidentiel)', 'E06 gestionnaire : note RH de l''ère V7 relue intacte');
select is((select email || '|' || numero_inscription from public.employes_fiche where id = 'a2000000-0000-0000-0000-000000000004'),
  'conducteur.a@salaries-upg7.invalid|INS-V7-0004', 'E07 gestionnaire : coordonnées et numéro d''inscription intacts');
select pg_temp.en_service();
select ok(to_regprocedure('public.export_rgpd_section_autorisee(uuid,text)') is not null
          and not has_function_privilege('authenticated', 'public.export_rgpd_section_autorisee(uuid,text)', 'EXECUTE'),
  'E08 export RGPD : filtrage par section en place, prédicat interne non exposé');

-- ── I. Incident / mode sûr ──────────────────────────────────────────────────────────────
select is((select count(*)::int from public.incident_controles where actif), 0, 'I01 aucun contrôle actif après upgrade');
select is(public.incident_etat_public() -> 'controles', '[]'::jsonb, 'I02 état public : aucun contrôle');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') and not public.incident_table_exemptee(c.relname)
              and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'incident_garde_ecriture')), 0,
  'I03 garde du mode sûr sur toute table non exemptée (tables V3 → V8)');
select is((select count(*)::int from public.incident_statuts_services where statut = 'OPERATIONAL'), 12, 'I04 12 services OPERATIONAL');
select is((select count(*)::int from public.incident_webhooks_stripe_orphelins()), 0,
  'I05 aucun webhook Stripe historique signalé orphelin (rattrapage finalise_at)');
select pg_temp.en_session('10000000-0000-0000-0000-000000000001');
select lives_ok($$ update public.chantiers set nom = nom where entreprise_id = 'a0000000-0000-0000-0000-000000000001' $$,
  'I06 gardes inertes : écriture Gestion Pro normale');
select pg_temp.en_service();

-- ── L. Relevé Lots 8-9 sur les plans V5 / V6 / V7 ─────────────────────────────────────
select is((select count(*)::int from _figes where etat_documente in ('initial', 'corrige')), 2, 'L01 jeu : plans figés V5 et V6 présents');
select ok((select bool_and(empreinte = encode(extensions.digest(convert_to(public.tools_releve_plan_contenu(id)::text, 'UTF8'), 'sha256'), 'hex')) from _figes),
  'L02 plans figés V5 / V6 : empreinte recalculée à l''identique par le contenu V8 (Lots 8-9)');
select is((select count(*)::int from public.tools_releves_elements where plan_id = pg_temp.plan('as_built') and type = 'equipement' and deleted_at is null), 2,
  'L03 objets Lot 7 posés en V7 conservés');
select pg_temp.en_session('10000000-0000-0000-0000-000000000003');
select ok(jsonb_array_length(public.tools_releve_plan_metre(pg_temp.plan('as_built')) -> 'pieces') >= 1,
  'L04 métré Lot 8 calculé sur le plan « as built » de l''ère V6/V7');
select is((public.tools_releve_plan_quantitatif(pg_temp.plan('as_built')) ->> 'moteur') || '|'
          || jsonb_array_length(public.tools_releve_plan_quantitatif(pg_temp.plan('as_built')) -> 'ouvrages'),
  'quantitatif-v1|0', 'L05 quantitatif Lot 9 calculable (aucun ouvrage préexistant)');
select ok((public.tools_releve_plan_metre(pg_temp.plan('corrige')) ->> 'fige')::boolean,
  'L06 plan corrigé figé en V6 : métré relu comme figé');
select pg_temp.en_session('20000000-0000-0000-0000-000000000006');
select throws_ok($$ select public.tools_releve_plan_metre(pg_temp.plan('as_built')) $$, '42501', null, 'L07 autre tenant : métré refusé');
select pg_temp.en_service();
select ok((select bool_and(p.contours = f.contours and p.revision = f.revision and p.empreinte = f.empreinte and p.fige_le = f.fige_le)
             from public.tools_releves_plans p join _figes f using (id)), 'L08 plans figés V5 / V6 non touchés');

-- ── C. Performance C2 ───────────────────────────────────────────────────────────────────
insert into public.devis (id, entreprise_id, client_id, statut, date_emission, date_validite, remise_globale)
values ('d8800000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000001',
        (select id from public.clients where entreprise_id = 'a0000000-0000-0000-0000-000000000001' limit 1),
        'brouillon', current_date, current_date + 30, 10);
insert into public.lignes_devis (devis_id, designation, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre)
select 'd8800000-0000-4000-8000-000000000001', 'L' || g, 'fourniture', g, 'u', 12.5, 0, 20, g from generate_series(1, 40) g;
select is((select montant_ht || '|' || montant_ttc from public.devis where id = 'd8800000-0000-4000-8000-000000000001'),
  '9225.00|11070.00', 'C01 recalcul par instruction : totaux exacts (820 × 12,50 € − 10 %, TVA 20 %)');

-- ── X. Identité / Studio du projet partagé ─────────────────────────────────────────────
select is((select count(*)::int from public.elsatia_identity_subjects) + (select count(*)::int from public.elsatia_identity_outbox), 0,
  'X01 identité centrale : toujours inerte');
select is((select count(*)::int from pg_tables where schemaname in ('public', 'platform') and tablename in
            ('studio_render_limits', 'studio_brand_kits', 'studio_render_shares', 'studio_workspace_invitations')), 0,
  'X02 aucune table Studio post-H dans le projet partagé');
select is((select count(*)::int from pg_tables where schemaname = 'studio_guard'), 0,
  'X03 mode sûr Studio (journal de contrôle) : chaîne dédiée seulement');

select * from finish();
rollback;
