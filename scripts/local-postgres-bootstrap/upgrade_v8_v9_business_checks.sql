-- Train canonique V9 — contrôles métier APRÈS upgrade V8 → V9 (scripts/qualification/upgrade-v8-v9.sh §9).
-- Exécutés sur la base upgradée (données de l'ère V8 : upgrade_v8_v9_seed_complement.sql + jeux
-- volumétriques des lots), dans une transaction annulée. Profils : administrateur F1462 / R1462
-- (toutes permissions), ouvrier F1462 (aucun droit finance). Rapport V9 §6.
\set ON_ERROR_STOP 0
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(30);

create or replace function pg_temp.en(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
end $$;
grant execute on function pg_temp.en(uuid) to authenticated;

-- Vérités superutilisateur (sans RLS ni plafond), calculées avant de changer de rôle.
create temp table verite as select
  (select sum(heures_normales + heures_supplementaires) from public.pointages
     where entreprise_id = 'f1462e00-0000-0000-0000-000000000001' and date between '2026-03-01' and '2026-03-31') as heures_mars,
  (select count(*) from public.pointages
     where entreprise_id = 'f1462e00-0000-0000-0000-000000000001' and date between '2026-03-01' and '2026-03-31') as nb_pointages_mars,
  (select sum(heures_normales + heures_supplementaires) from public.pointages
     where entreprise_id = 'f1462e00-0000-0000-0000-000000000001' and verification_statut = 'valide') as heures_valides,
  (select count(*) from public.factures where entreprise_id = 'f1462e00-0000-0000-0000-000000000001'
     and date_emission between '2026-01-01' and '2026-06-30' and statut <> 'brouillon') as nb_ventes,
  (select sum(montant_ttc) filter (where statut not in ('brouillon', 'annulee')) from public.factures
     where client_id = 'a1462c00-0000-0000-0000-000000000001') as facture_client_r1462,
  (select compteur from public.rate_limits_applicatifs where cle = 'auth:login' and identifiant_hash = repeat('c3', 32)) as compteur_c3;
grant select on verite to authenticated, service_role;

-- ── Ledger, mode sûr, surface ─────────────────────────────────────────────
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') and not public.incident_table_exemptee(c.relname)
              and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'incident_garde_ecriture')),
          0, 'I01 mode sûr : toute table non exemptée est gardée après upgrade (tables V9 comprises)');
select ok(exists (select 1 from pg_trigger where tgrelid = 'public.cles_chiffrement_bancaire'::regclass and tgname = 'incident_garde_ecriture'),
          'I02 registre des clés bancaires sous garde du mode sûr');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
              and p.proname in ('pointages_gestion_totaux_mois', 'pointages_gestion_compteurs_mois', 'modifier_facture_brouillon',
                                'rentabilite_chantiers_totaux', 'export_comptable_ventes', 'gp_client_synthese', 'gp_options_employes',
                                'consulter_rate_limit', 'cles_bancaires_inventaire', 'chiffres_bancaires_rechiffrer_lot',
                                'plateforme_applications_compteurs', 'paie_export_contenu', 'tresorerie_donnees')),
          0, 'S01 anon : aucune RPC V9 exécutable');
select ok(not has_function_privilege('authenticated', 'public.recalc_totaux_facture(uuid)', 'execute'),
          'S02 B4 corrigé SANS rouvrir recalc_totaux_facture à authenticated');

-- ── Facture brouillon de l'ère V8 (B4) ────────────────────────────────────
set local role authenticated;
select pg_temp.en('f1462a00-0000-0000-0000-000000000001');
select lives_ok($$ select public.modifier_facture_brouillon('f1462b90-0000-0000-0000-000000000001',
  '{"client_id":"f1462c00-0000-0000-0000-000000000001","type":"simple","date_emission":"2026-09-15"}'::jsonb,
  '[{"designation":"Maçonnerie","type":"main_oeuvre","quantite":3,"unite":"h","prix_unitaire_ht":100,"remise_ligne":0,"taux_tva":20,"ordre":1}]'::jsonb) $$,
  'D01 facture brouillon de l''ère V8 (lignes V8) modifiable par l''administrateur');
select results_eq($$ select montant_ht, montant_ttc from public.factures where id = 'f1462b90-0000-0000-0000-000000000001' $$,
  $$ values (300.00::numeric, 360.00::numeric) $$, 'D02 totaux recalculés par le trigger de lignes (300 HT / 360 TTC)');
select lives_ok($$ select public.modifier_facture_brouillon('f1462b90-0000-0000-0000-000000000001',
  '{"client_id":"f1462c00-0000-0000-0000-000000000001","type":"simple"}'::jsonb, '[]'::jsonb) $$,
  'D03 brouillon vidé de ses lignes : enregistrement accepté');
select results_eq($$ select montant_ht, montant_ttc from public.factures where id = 'f1462b90-0000-0000-0000-000000000001' $$,
  $$ values (0::numeric, 0::numeric) $$, 'D04 brouillon sans ligne : totaux à zéro');
select throws_like($$ select public.modifier_facture_brouillon((select id from public.factures where entreprise_id = 'f1462e00-0000-0000-0000-000000000001' and statut = 'payee' limit 1),
  '{"client_id":"f1462c00-0000-0000-0000-000000000001","type":"simple"}'::jsonb, '[]'::jsonb) $$,
  '%brouillon%', 'D05 facture émise de l''ère V8 : toujours non modifiable');
select pg_temp.en('f1462a00-0000-0000-0000-000000000002');
select throws_ok($$ select public.modifier_facture_brouillon('f1462b90-0000-0000-0000-000000000002',
  '{"client_id":"f1462c00-0000-0000-0000-000000000001","type":"simple"}'::jsonb, '[]'::jsonb) $$,
  'P0001', 'Facture introuvable', 'D06 ouvrier sans droit facturation : brouillon invisible (RLS)');
select throws_ok($$ select public.recalc_totaux_facture('f1462b90-0000-0000-0000-000000000002') $$, '42501', null,
  'D07 recalc_totaux_facture toujours refusé à authenticated');

-- ── Exactitude > 1 000 sur les données de l'ère V8 ───────────────────────
select pg_temp.en('f1462a00-0000-0000-0000-000000000001');
select is((select sum(heures_total) from public.pointages_gestion_totaux_mois('f1462e00-0000-0000-0000-000000000001', '2026-03-01', '2026-03-31')),
          (select heures_mars from verite), 'P01 /pointage/gestion : total d''heures du mois = vérité (1 462 pointages)');
select is((select sum(nb_pointages)::bigint from public.pointages_gestion_totaux_mois('f1462e00-0000-0000-0000-000000000001', '2026-03-01', '2026-03-31')),
          (select nb_pointages_mars from verite), 'P02 nombre de pointages du mois = vérité (> 1 000)');
select is((select heures from public.rentabilite_chantiers_totaux('f1462e00-0000-0000-0000-000000000001')),
          (select heures_valides from verite), 'R01 rentabilité : heures validées = vérité');
select is(jsonb_array_length(public.export_comptable_ventes('f1462e00-0000-0000-0000-000000000001', '2026-01-01', '2026-06-30'))::bigint,
          (select nb_ventes from verite), 'F01 export comptable des ventes complet (1 462 pièces, > max_rows)');
select pg_temp.en('a1462a00-0000-0000-0000-000000000001');
select is((public.gp_client_synthese('a1462e00-0000-0000-0000-000000000001', 'a1462c00-0000-0000-0000-000000000001')->'factures'->>'total_facture')::numeric,
          (select facture_client_r1462 from verite), 'G01 fiche client : facturé = vérité (1 462 factures)');
select pg_temp.en('f1462a00-0000-0000-0000-000000000001');
select throws_ok($$ select public.gp_client_synthese('a1462e00-0000-0000-0000-000000000001', 'a1462c00-0000-0000-0000-000000000001') $$,
          '42501', 'GP_AGREGAT_REFUSE', 'G02 administrateur d''un autre tenant : refusé');
-- Parité RLS pour un profil sans droit : l'ouvrier reçoit ce que la RLS lui montre.
select pg_temp.en('f1462a00-0000-0000-0000-000000000002');
select is(coalesce((select sum(heures_total) from public.pointages_gestion_totaux_mois('f1462e00-0000-0000-0000-000000000001', '2026-03-01', '2026-03-31')), 0),
          coalesce((select sum(heures_normales + heures_supplementaires) from public.pointages
                     where entreprise_id = 'f1462e00-0000-0000-0000-000000000001' and date between '2026-03-01' and '2026-03-31'), 0),
          'P03 ouvrier : total = ce que la RLS lui montre (parité, aucun droit élargi)');
select is((select count(*)::int from public.factures where entreprise_id = 'f1462e00-0000-0000-0000-000000000001'), 0,
          'P04 ouvrier : toujours aucune facture lisible (RLS inchangée)');

-- ── Chiffrement bancaire : données v1 de l'ère V8 ─────────────────────────
select throws_ok($$ select * from public.cles_chiffrement_bancaire $$, '42501', null, 'B01 authenticated : registre des clés illisible');
select throws_ok($$ select * from public.cles_bancaires_inventaire() $$, '42501', null, 'B02 authenticated : inventaire refusé');
reset role;
select results_eq($$ select cle_id, statut from public.cles_chiffrement_bancaire $$, $$ values ('k1'::text, 'active'::text) $$,
                  'B03 k1 (format v1 historique) enregistrée active');
select results_eq($$ select colonne, format, coalesce(cle_id, '-'), coalesce(statut_cle, '-'), nombre from public.cles_bancaires_inventaire()
                     where ressource = 'coordonnees_bancaires' and colonne = 'iban_chiffre' order by format $$,
                  $$ values ('iban_chiffre'::text, 'illisible'::text, '-'::text, '-'::text, 1::bigint), ('iban_chiffre', 'v1', 'k1', 'active', 1) $$,
                  'B04 inventaire : IBAN v1 sous k1 active, chiffré de démonstration compté illisible');
select is((select count(*)::int from public.coordonnees_bancaires where iban_hash_cle is not null), 0,
          'B05 aucune donnée réécrite : index aveugle historique (iban_hash_cle NULL)');
select lives_ok($$ update public.coordonnees_bancaires set titulaire = 'Salarié V8 un (renommé)' where id = 'f1462b92-0000-0000-0000-000000000001' $$,
                'B06 ligne v1 existante toujours modifiable (garde d''écriture)');
select throws_like($$ update public.coordonnees_bancaires set iban_chiffre = 'v2:k7:A256GCM:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBB:Q0lQSEVS', iban_hash = repeat('e5', 32)
                       where id = 'f1462b92-0000-0000-0000-000000000001' $$,
                   '%clé de chiffrement k7 inconnue%', 'B07 écriture sous une clé inconnue refusée');

-- ── Rate limit de connexion : compteurs de l'ancienne politique ───────────
set local role service_role;
select results_eq($$ select autorise, restant from public.consulter_rate_limit('auth:login', repeat('c3', 32), 3600, 10) $$,
                  $$ values (true, 3) $$, 'L01 consulter_rate_limit lit un compteur historique (7/10) sans l''incrémenter');
reset role;
select is((select compteur from public.rate_limits_applicatifs where cle = 'auth:login' and identifiant_hash = repeat('c3', 32)),
          (select compteur_c3 from verite), 'L02 lecture sans écriture : compteur inchangé');
select ok(not has_function_privilege('authenticated', 'public.consulter_rate_limit(text,text,integer,integer)', 'execute')
          and not has_function_privilege('anon', 'public.consulter_rate_limit(text,text,integer,integer)', 'execute'),
          'L03 consulter_rate_limit : service_role seul');
select is((select count(*)::int from public.rate_limits_applicatifs where cle = 'auth:login'), 2, 'L04 compteurs historiques conservés');

select * from finish();
rollback;
