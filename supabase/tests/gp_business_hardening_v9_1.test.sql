-- ELSATIA GP BUSINESS HARDENING V9.1 — témoins rouge → vert des défauts de la
-- recette métier GP (branche source claude/loving-heisenberg-ygkjck, rapport
-- ELSATIA_GP_END_TO_END_BUSINESS_ACCEPTANCE_V1.md) encore reproductibles sur V9.1.
-- Chaque attente est la règle correcte ; sur V9.1 (391 migrations) les témoins
-- des défauts reproduits échouent, ils passent après les migrations 20261003001401+.
-- Rapport : docs/qualification/ELSATIA_GP_BUSINESS_HARDENING_V9_1.md
begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

\ir fixtures/isolation_multitenant.inc

-- Décor complémentaire (superutilisateur).
update public.entreprises set horaires_journaliers = '{"1":7,"2":7,"3":7,"4":7,"5":7,"6":7,"7":7}'
 where id = 'a0000000-0000-0000-0000-000000000001';
update public.utilisateurs_entreprises set pointage_personnel_actif = true
 where entreprise_id = 'a0000000-0000-0000-0000-000000000001';
insert into public.employes_cout_horaire (entreprise_id, employe_id, cout_horaire) values
  ('a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 26.5),
  ('a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000003', 41.5)
on conflict do nothing;
update public.pointages set cout_horaire_applique = 26.5 where id = 'a5000000-0000-0000-0000-000000000001';
update public.pointages set cout_horaire_applique = 60 where id = 'a5000000-0000-0000-0000-000000000002';
-- Pointage rejeté de l'ouvrier A (12 h) : ne doit compter dans aucun total.
insert into public.pointages (id, entreprise_id, employe_id, chantier_id, date, heures_normales, heures_supplementaires, verification_statut)
values ('a5000000-0000-0000-0000-0000000000f1', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002',
        'a4000000-0000-0000-0000-000000000001', current_date - 2, 7, 5, 'rejete');

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

-- ─── Non-régression V9.1 : création de chantier (B04) ───
select lives_ok(
  $$insert into public.chantiers (entreprise_id, client_id, nom, statut) values ('a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'B04 gérant', 'en_cours')$$,
  'B04 : le gérant crée un chantier (non-régression V9.1)');

-- ─── B16 : facture depuis devis remisé = devis au centime ───
insert into t_ids select 'd1', public.creer_devis_brouillon('a0000000-0000-0000-0000-000000000001',
  '{"client_id":"a3000000-0000-0000-0000-000000000001","chantier_id":"a4000000-0000-0000-0000-000000000001","remise_globale":3}'::jsonb,
  '[{"designation":"Peinture","type":"main_oeuvre","quantite":12.5,"unite":"m2","prix_unitaire_ht":33.33,"remise_ligne":5,"taux_tva":10,"ordre":1},
    {"designation":"Fourniture","type":"fourniture","quantite":3,"unite":"u","prix_unitaire_ht":1234.56,"remise_ligne":2.5,"taux_tva":20,"ordre":2},
    {"designation":"Isolation","type":"forfait","quantite":1,"unite":"u","prix_unitaire_ht":999.99,"remise_ligne":0,"taux_tva":5.5,"ordre":3}]'::jsonb);
update public.devis set statut = 'envoye' where id = (select v from t_ids where k = 'd1');
update public.devis set statut = 'accepte' where id = (select v from t_ids where k = 'd1');
insert into t_ids select 'f1', public.creer_facture_depuis_devis((select v from t_ids where k = 'd1'), 'simple');

select is((select montant_ht from public.factures where id = (select v from t_ids where k = 'f1')),
          (select montant_ht from public.devis where id = (select v from t_ids where k = 'd1')),
          'B16 : HT de la facture = HT du devis remisé (remise globale reportée)');
select is((select montant_tva from public.factures where id = (select v from t_ids where k = 'f1')),
          (select montant_tva from public.devis where id = (select v from t_ids where k = 'd1')),
          'B16 : TVA de la facture = TVA du devis remisé');
select is((select montant_ttc from public.factures where id = (select v from t_ids where k = 'f1')),
          (select montant_ttc from public.devis where id = (select v from t_ids where k = 'd1')),
          'B16 : TTC de la facture = TTC du devis remisé (5 648,96 €)');
select is((select montant_ttc from public.devis where id = (select v from t_ids where k = 'd1')), 5648.96::numeric,
          'B16 : calcul indépendant du devis (remises ligne + globale 3 %, 3 taux de TVA)');

-- Non-régression B34 : un devis ne se facture qu'une fois par ce chemin.
select throws_like($$select public.creer_facture_depuis_devis((select v from t_ids where k = 'd1'), 'simple')$$,
  '%déjà facturé%', 'B34 : refacturation du même devis refusée (non-régression V9.1)');

-- Émission de F1.
update public.factures set statut = 'envoyee' where id = (select v from t_ids where k = 'f1');

-- ─── B17 : double envoi identique d'un paiement partiel ───
select lives_ok($$select public.enregistrer_paiement_facture('a0000000-0000-0000-0000-000000000001', (select v from t_ids where k = 'f1'), 1000, current_date, 'virement', null)$$,
  'B17 : premier paiement partiel de 1 000 € accepté');
select throws_like($$select public.enregistrer_paiement_facture('a0000000-0000-0000-0000-000000000001', (select v from t_ids where k = 'f1'), 1000, current_date, 'virement', null)$$,
  '%double envoi%', 'B17 : le même paiement renvoyé aussitôt (double clic) est refusé');
select lives_ok($$select public.enregistrer_paiement_facture('a0000000-0000-0000-0000-000000000001', (select v from t_ids where k = 'f1'), 1000, current_date, 'cheque', 'CHQ-2')$$,
  'B17 : un second paiement distinct (autre mode, autre référence) reste accepté');
select is((select montant_paye from public.factures where id = (select v from t_ids where k = 'f1')), 2000.00::numeric,
  'B17 : montant payé = 2 000 € (pas de doublon)');

-- ─── B24 : facture émise non annulable directement ───
select throws_like($$update public.factures set statut = 'annulee' where id = (select v from t_ids where k = 'f1')$$,
  '%avoir%', 'B24 : une facture émise ne passe pas directement à « annulée » (avoir obligatoire)');
insert into t_ids values ('fb', gen_random_uuid());
insert into public.factures (id, entreprise_id, client_id, chantier_id, type, statut, montant_ht, montant_tva, montant_ttc)
values ((select v from t_ids where k = 'fb'), 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001',
        'a4000000-0000-0000-0000-000000000002', 'simple', 'brouillon', 500, 100, 600);
select lives_ok($$update public.factures set statut = 'annulee' where id = (select v from t_ids where k = 'fb')$$,
  'B24 : un brouillon (non numéroté) reste annulable');

-- ─── B19 : facturation avancée, remise globale reportée ───
insert into t_ids select 'd2', public.creer_devis_brouillon('a0000000-0000-0000-0000-000000000001',
  '{"client_id":"a3000000-0000-0000-0000-000000000001","chantier_id":"a4000000-0000-0000-0000-000000000002","remise_globale":3}'::jsonb,
  '[{"designation":"A","type":"forfait","quantite":10,"unite":"u","prix_unitaire_ht":1000,"remise_ligne":5,"taux_tva":20,"ordre":1},
    {"designation":"B","type":"fourniture","quantite":4,"unite":"u","prix_unitaire_ht":250,"remise_ligne":0,"taux_tva":10,"ordre":2}]'::jsonb);
update public.devis set statut = 'envoye' where id = (select v from t_ids where k = 'd2');
update public.devis set statut = 'accepte' where id = (select v from t_ids where k = 'd2');
insert into t_ids select 'ac', public.creer_facture_avancee('a0000000-0000-0000-0000-000000000001', (select v from t_ids where k = 'd2'), 'acompte', 30);
select is((select montant_ht from public.factures where id = (select v from t_ids where k = 'ac')),
          (select round(montant_ht * 0.30, 2) from public.devis where id = (select v from t_ids where k = 'd2')),
          'B19 : acompte 30 % = 30 % du HT remisé du devis');
select is((select montant_ttc from public.factures where id = (select v from t_ids where k = 'ac')),
          (select round(montant_ttc * 0.30, 2) from public.devis where id = (select v from t_ids where k = 'd2')),
          'B19 : acompte 30 % = 30 % du TTC remisé du devis');
update public.factures set statut = 'envoyee' where id = (select v from t_ids where k = 'ac');
insert into t_ids select 'av', public.creer_facture_avancee('a0000000-0000-0000-0000-000000000001', (select v from t_ids where k = 'd2'), 'avoir', 10, false, (select v from t_ids where k = 'ac'));
select is((select montant_ht from public.factures where id = (select v from t_ids where k = 'av')),
          (select -round(montant_ht * 0.10, 2) from public.devis where id = (select v from t_ids where k = 'd2')),
          'B19 : avoir 10 % = −10 % du HT remisé du devis');

-- Situation de travaux : la période répartie sur les lignes et la facture de
-- situation égalent la période calculée (défaut mathématique avec remise globale).
insert into t_ids select 's', public.creer_situation_travaux('a0000000-0000-0000-0000-000000000001', (select v from t_ids where k = 'd2'), 60, 5, null);
select ok(abs((select sum(montant_periode_ht) from public.lignes_situations where situation_id = (select v from t_ids where k = 's'))
            - (select montant_periode_ht from public.situations_travaux where id = (select v from t_ids where k = 's'))) <= 0.02,
          'Situation : somme des lignes = montant de la période (remise globale non regonflée)');
insert into t_ids select 'fs', public.facturer_situation_travaux('a0000000-0000-0000-0000-000000000001', (select v from t_ids where k = 's'));
select ok(abs((select montant_ht from public.factures where id = (select v from t_ids where k = 'fs'))
            - (select montant_periode_ht from public.situations_travaux where id = (select v from t_ids where k = 's'))) <= 0.02,
          'Situation : HT de la facture de situation = montant de la période');

-- ─── B25 : rentabilité et tableau de bord hors brouillons, avoirs nets ───
reset role;
-- Chantier dédié : facture émise 1 000 HT, brouillon 500 HT, facture 2 000 HT
-- partiellement créditée (avoir émis −200 HT), avoir brouillon −50 HT.
insert into public.chantiers (id, entreprise_id, client_id, nom, statut)
values ('a4000000-0000-0000-0000-0000000000c5', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'B25 rentabilité', 'en_cours');
insert into public.factures (id, entreprise_id, client_id, chantier_id, type, statut, montant_ht, montant_tva, montant_ttc, date_echeance) values
  ('aa000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-0000000000c5', 'simple', 'envoyee', 1000, 200, 1200, current_date),
  ('aa000000-0000-0000-0000-0000000000c2', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-0000000000c5', 'simple', 'brouillon', 500, 100, 600, current_date),
  ('aa000000-0000-0000-0000-0000000000c3', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-0000000000c5', 'simple', 'avoir_emis', 2000, 400, 2400, current_date);
insert into public.factures (id, entreprise_id, client_id, chantier_id, type, statut, facture_origine_id, montant_ht, montant_tva, montant_ttc, date_echeance) values
  ('aa000000-0000-0000-0000-0000000000c4', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-0000000000c5', 'avoir', 'envoyee', 'aa000000-0000-0000-0000-0000000000c3', -200, -40, -240, current_date),
  ('aa000000-0000-0000-0000-0000000000c6', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-0000000000c5', 'avoir', 'brouillon', 'aa000000-0000-0000-0000-0000000000c1', -50, -10, -60, current_date);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select is((select facture_ht from public.rentabilite_chantier('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-0000000000c5')),
          2800::numeric, 'B25 : CA de rentabilité = émis net d''avoirs émis (1 000 + 2 000 − 200), brouillons exclus');
select is((select facture_ht_avoirs from public.rentabilite_chantier('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-0000000000c5')),
          -200::numeric, 'B25 : part des avoirs = avoirs émis seulement (avoir brouillon exclu)');
select ok(not exists (
            select 1 from jsonb_array_elements(public.dashboard_indicateurs('a0000000-0000-0000-0000-000000000001', current_date) -> 'factures_alertes') a
            where (a ->> 'id')::uuid in ('aa000000-0000-0000-0000-0000000000c2', 'aa000000-0000-0000-0000-0000000000c4', 'aa000000-0000-0000-0000-0000000000c6')),
          'B25 : les alertes « à encaisser » ignorent brouillons et avoirs');
select is((public.dashboard_indicateurs('a0000000-0000-0000-0000-000000000001', current_date) ->> 'factures_total')::numeric,
          (select sum(montant_ttc) from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut not in ('brouillon', 'annulee')),
          'B25 : « Total facturé » du tableau de bord = factures émises (brouillons exclus)');

-- ─── B12 / B35 : pointage oublié ───
select lives_ok($$select public.declarer_pointage_oublie('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', current_date - 3, '07:30', '16:30', 60, null, null, null, 'oubli')$$,
  'B12 : première déclaration de pointage oublié acceptée');
select throws_like($$select public.declarer_pointage_oublie('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', current_date - 3, '17:00', '21:00', 0, null, null, null, 'bis')$$,
  '%existe d%', 'B12 : seconde déclaration le même jour sur le même chantier refusée');
select lives_ok($$select public.declarer_pointage_oublie('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002', current_date - 3, '06:00', '14:00', 0, null, null, null, 'autre chantier')$$,
  'B35 : une déclaration sur un autre chantier reste possible (16 h cumulées)');
select throws_like($$select public.declarer_pointage_oublie('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-0000000000c5', current_date - 3, '00:00', '09:00', 0, null, null, null, 'trop')$$,
  '%24 h%', 'B35 : le cumul journalier tous chantiers ne dépasse pas 24 h');
select is((select sum(heures_normales + heures_supplementaires) from public.pointages
            where employe_id = 'a2000000-0000-0000-0000-000000000001' and date = current_date - 3), 16.00::numeric,
          'B35 : 16 h enregistrées pour la journée (refus sans écriture partielle)');
-- Un pointage rejeté ne bloque pas une nouvelle déclaration.
reset role;
update public.pointages set verification_statut = 'rejete'
 where employe_id = 'a2000000-0000-0000-0000-000000000001' and date = current_date - 3 and chantier_id = 'a4000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.declarer_pointage_oublie('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', current_date - 3, '15:00', '18:00', 0, null, null, null, 'après rejet')$$,
  'B12 : après rejet, une nouvelle déclaration sur le même chantier est possible');

-- ─── B37 : totaux du mois hors pointages rejetés ───
select is((select heures_total from public.pointages_gestion_totaux_mois('a0000000-0000-0000-0000-000000000001', current_date - 10, current_date)
            where employe_id = 'a2000000-0000-0000-0000-000000000002'), 7.00::numeric,
          'B37 : « Total par employé » exclut le pointage rejeté (7 h, pas 19 h)');
select is((select nb_pointages from public.pointages_gestion_totaux_mois('a0000000-0000-0000-0000-000000000001', current_date - 10, current_date)
            where employe_id = 'a2000000-0000-0000-0000-000000000002'), 1::bigint,
          'B37 : le nombre de pointages comptés exclut le rejeté');

-- ─── B28 : coût horaire figé sur les pointages ───
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select throws_ok($$select cout_horaire_applique from public.pointages$$, '42501', null,
  'B28 : le chef d''équipe (valider_pointages, sans voir_cout_interne_employe) ne lit plus le coût horaire de ses collègues');
select ok((select count(*) from public.pointages where employe_id <> 'a2000000-0000-0000-0000-000000000003' and heures_normales is not null) >= 2,
  'B28 : le chef d''équipe garde la lecture des pointages eux-mêmes (heures, statut)');
select throws_ok($$select * from public.pointages_couts_appliques('a0000000-0000-0000-0000-000000000001', current_date - 31, current_date)$$, '42501', null,
  'B28 : la RPC des coûts appliqués est refusée au chef d''équipe');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select throws_ok($$select cout_horaire_applique from public.pointages$$, '42501', null,
  'B28 : le salarié ne lit pas le coût horaire employeur par l''API');
select is((select count(*)::int from public.employes_cout_horaire), 0,
  'B28 : le salarié ne lit aucun coût horaire de collègue (non-régression V9.1)');
select is((select count(*)::int from public.employes_taux_facture), 0,
  'B28 : le salarié ne lit aucun taux de facturation (non-régression V9.1)');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select is((select count(*)::int from public.pointages_couts_appliques('a0000000-0000-0000-0000-000000000001', current_date - 31, current_date)
           where cout_horaire_applique is not null), 2,
  'B28 : le comptable (acces_rentabilite) conserve l''accès aux coûts appliqués par la RPC');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select is((select cout_horaire_applique from public.pointages_couts_appliques('a0000000-0000-0000-0000-000000000001', current_date - 31, current_date)
           where pointage_id = 'a5000000-0000-0000-0000-000000000002'), 60.00::numeric,
  'B28 : le gérant conserve l''accès aux coûts appliqués par la RPC');
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select throws_ok($$select * from public.pointages_couts_appliques('a0000000-0000-0000-0000-000000000001', current_date - 31, current_date)$$, '42501', null,
  'B28 : aucun coût d''une autre entreprise par la RPC');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select ok(not has_function_privilege('anon', 'public.pointages_couts_appliques(uuid,date,date)', 'execute'),
  'B28 : RPC fermée à anon');

-- ─── Garde-fous de saisie en base (B31, B07, B05) ───
select throws_ok($$insert into public.chantiers (entreprise_id, client_id, nom, statut, budget_previsionnel) values ('a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'B31', 'en_cours', -500)$$,
  '23514', null, 'B31 : budget prévisionnel négatif refusé par la base');
select throws_ok($$insert into public.chantiers (entreprise_id, client_id, nom, statut, date_debut_prevue, date_fin_prevue) values ('a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'B07', 'en_cours', '2026-10-10', '2026-10-01')$$,
  '23514', null, 'B07 : fin prévue antérieure au début refusée par la base');
select throws_ok($$select public.creer_devis_brouillon('a0000000-0000-0000-0000-000000000001', '{"client_id":"a3000000-0000-0000-0000-000000000001","remise_globale":0}'::jsonb, '[{"designation":"rem","type":"forfait","quantite":1,"unite":"u","prix_unitaire_ht":120,"remise_ligne":150,"taux_tva":20,"ordre":1}]'::jsonb)$$,
  '23514', null, 'B05 : remise de ligne > 100 % refusée par la base');
select throws_ok($$select public.creer_devis_brouillon('a0000000-0000-0000-0000-000000000001', '{"client_id":"a3000000-0000-0000-0000-000000000001","remise_globale":150}'::jsonb, '[]'::jsonb)$$,
  '23514', null, 'B05 : remise globale > 100 % refusée par la base');

select * from finish();
rollback;
