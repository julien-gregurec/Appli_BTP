-- ELSATIA-RENTABILITE-DATA-CORRECTNESS-V1 — rentabilité et heures chantier
-- calculées en base (20261002001107_rentabilite_agregats_chantiers_v1.sql).
--
-- Avant : /rentabilite, l'analyse IA, le copilote et la fiche chantier
-- additionnaient côté Next des lignes lues par PostgREST, plafonnées à
-- max_rows = 1 000 → heures, coûts et marges faux au-delà. Ici : 1 462
-- pointages et 1 200 affectations pour A, plus du bruit chez B.
--
-- Matrice : surface et droits ; vérité DB (superutilisateur) ; PARITÉ STRICTE
-- avec la RLS réelle pour chaque profil (le même calcul exécuté sous
-- `authenticated`, policies appliquées, est comparé à la RPC) — garde contre
-- toute dérive entre les fonctions SECURITY DEFINER et les policies ; refus
-- autre entreprise, membre désactivé, entreprise suspendue, sans identité,
-- anon ; chantier non consultable ; pagination sans perte ni doublon ;
-- paramètres invalides.
-- GP BUSINESS HARDENING V9.1 (B25, 20261003001406) : vérité de référence du CA mise à jour —
-- factures émises (brouillons et annulées exclus), factures créditées (avoir_emis) comprises,
-- avoirs émis déduits ; l'ancienne règle retirait la facture créditée ET déduisait son avoir.
begin;
create extension if not exists pgtap with schema extensions;
select plan(60);

\ir fixtures/isolation_multitenant.inc

-- ───────────────────────────────────────────────────────────────────────────
-- Jeu de données.
-- ───────────────────────────────────────────────────────────────────────────
-- Comptable A : accès chantiers et préparation des virements (branche
-- « sources bancaires » des notes de frais) en plus de ses droits financiers.
insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
select 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000005', d.cle, true
from public.permissions_disponibles d where d.cle in ('acces_chantiers', 'preparer_virements')
on conflict do nothing;

-- Trois chantiers de plus pour A (pagination), dont un sans activité.
insert into public.chantiers (id, entreprise_id, client_id, nom, statut, created_at) values
  ('a4000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'TEST_A_Chantier 3', 'en_cours', now() - interval '3 days'),
  ('a4000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000003', 'TEST_A_Chantier 4', 'en_cours', now() - interval '4 days'),
  ('a4000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000003', 'TEST_A_Chantier vide', 'en_cours', now() - interval '5 days');

-- Coûts horaires : admin et ouvrier renseignés ; conducteur à 0 ; chef absent.
insert into public.employes_cout_horaire (employe_id, entreprise_id, cout_horaire) values
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 31.17),
  ('a2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 22.43),
  ('a2000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 0),
  ('b2000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 99.99);

-- 1 462 pointages pour A (3/4 sur le chantier 01), heures non rondes, statuts mêlés.
insert into public.pointages (entreprise_id, employe_id, chantier_id, date, heures_normales, heures_supplementaires, tache, verification_statut)
select 'a0000000-0000-0000-0000-000000000001',
       ('a2000000-0000-0000-0000-00000000000' || (1 + g % 4))::uuid,
       case when g % 4 = 3 then ('a4000000-0000-0000-0000-00000000000' || (2 + (g / 4) % 3))::uuid else 'a4000000-0000-0000-0000-000000000001'::uuid end,
       date '2025-10-01' + (g % 365),
       round(1 + ((g * 37) % 587) / 100.0 + 0.07, 2),
       case when g % 3 = 0 then round(((g * 13) % 190) / 100.0 + 0.01, 2) else 0 end,
       'PGTAP-RENT',
       case when g % 8 = 1 then 'a_verifier' when g % 8 = 5 then 'rejete' else 'valide' end
from generate_series(0, 1461) g;

-- 1 200 affectations sur le chantier 01 (heures planifiées de la fiche chantier).
insert into public.affectations (entreprise_id, employe_id, chantier_id, date, heures, tache, type_activite)
select 'a0000000-0000-0000-0000-000000000001', ('a2000000-0000-0000-0000-00000000000' || (1 + g % 4))::uuid,
       'a4000000-0000-0000-0000-000000000001', date '2025-10-01' + (g / 4), round(2 + ((g * 29) % 500) / 100.0 + 0.03, 2),
       'PGTAP-RENT #' || g, 'chantier'
from generate_series(0, 1199) g;

-- Devis, factures (annulée, avoir, avoir émis), dépenses (sous-traitance, annulée).
insert into public.devis (entreprise_id, numero, client_id, chantier_id, statut, montant_ht, montant_tva, montant_ttc)
select 'a0000000-0000-0000-0000-000000000001', 'PGTAP-DEV-' || g, 'a3000000-0000-0000-0000-000000000001',
       ('a4000000-0000-0000-0000-00000000000' || (1 + g % 4))::uuid,
       case when g % 5 = 2 then 'refuse' else 'accepte' end, 1000 + g * 11.11, 0, 1000 + g * 11.11
from generate_series(0, 19) g;
insert into public.factures (entreprise_id, numero, client_id, chantier_id, statut, type, montant_ht, montant_tva, montant_ttc)
select 'a0000000-0000-0000-0000-000000000001', 'PGTAP-FAC-' || g, 'a3000000-0000-0000-0000-000000000001',
       ('a4000000-0000-0000-0000-00000000000' || (1 + g % 4))::uuid,
       case when g % 7 = 3 then 'annulee' when g % 11 = 5 then 'avoir_emis' else 'envoyee' end,
       case when g % 6 = 4 then 'avoir' else 'simple' end,
       500 + g * 23.47, 0, 500 + g * 23.47
from generate_series(0, 39) g;
insert into public.depenses_fournisseurs (entreprise_id, fournisseur_id, chantier_id, numero_piece, categorie, statut, montant_ht, montant_tva)
select 'a0000000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000001',
       ('a4000000-0000-0000-0000-00000000000' || (1 + g % 4))::uuid, 'PGTAP-DEP-' || g,
       case when g % 3 = 0 then 'sous_traitance' else 'materiaux' end,
       case when g % 5 = 4 then 'annulee' else 'a_payer' end, 70 + g * 3.33, 0
from generate_series(0, 29) g;
insert into public.mouvements_stock (entreprise_id, article_id, chantier_id, type, quantite, motif)
select 'a0000000-0000-0000-0000-000000000001', 'ad000000-0000-0000-0000-000000000001',
       ('a4000000-0000-0000-0000-00000000000' || (1 + g % 4))::uuid, case when g % 4 = 0 then 'entree' else 'sortie' end, 1, 'PGTAP-RENT'
from generate_series(0, 7) g;
-- Notes de frais : ouvrier A (validées et non), admin A (validées), statuts de chaque branche RLS.
insert into public.notes_frais (entreprise_id, employe_id, chantier_id, reference, montant_ttc, statut)
select 'a0000000-0000-0000-0000-000000000001',
       ('a2000000-0000-0000-0000-00000000000' || (1 + g % 2))::uuid,
       ('a4000000-0000-0000-0000-00000000000' || (1 + g % 3))::uuid, 'PGTAP-NDF-' || g, 10 + g * 1.07,
       (array['valide', 'validee', 'remboursee', 'exporte_comptabilite', 'archive', 'verrouille', 'soumis', 'refuse'])[1 + g % 8]
from generate_series(0, 31) g;

-- Bruit chez B, sur des chantiers de B.
insert into public.pointages (entreprise_id, employe_id, chantier_id, date, heures_normales, tache, verification_statut)
select 'b0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002', 'b4000000-0000-0000-0000-000000000001',
       date '2025-10-01' + g, 5.55, 'PGTAP-B', 'valide'
from generate_series(0, 99) g;

-- Vérité (superutilisateur, sans RLS) : formule de /rentabilite.
create temp table verite as
select c.id as chantier_id,
  coalesce((select sum(montant_ht) from public.devis d where d.chantier_id = c.id and d.statut = 'accepte'), 0) as budget_ht,
  coalesce((select sum(montant_ht) from public.factures f where f.chantier_id = c.id and f.statut not in ('brouillon', 'annulee')), 0) as facture_ht,
  coalesce((select sum(p.heures_normales + p.heures_supplementaires) from public.pointages p where p.chantier_id = c.id and p.verification_statut = 'valide'), 0) as heures,
  coalesce((select sum((p.heures_normales + p.heures_supplementaires) * coalesce(co.cout_horaire, 0)) from public.pointages p left join public.employes_cout_horaire co on co.employe_id = p.employe_id where p.chantier_id = c.id and p.verification_statut = 'valide'), 0) as cout_main_oeuvre,
  coalesce((select sum(montant_ht) from public.depenses_fournisseurs d where d.chantier_id = c.id and d.statut <> 'annulee' and d.categorie <> 'sous_traitance'), 0) as cout_achats,
  coalesce((select sum(montant_ht) from public.depenses_fournisseurs d where d.chantier_id = c.id and d.statut <> 'annulee' and d.categorie = 'sous_traitance'), 0) as cout_sous_traitance,
  coalesce((select sum(m.quantite * a.prix_achat_ht) from public.mouvements_stock m join public.articles_stock a on a.id = m.article_id where m.chantier_id = c.id and m.type = 'sortie'), 0) as cout_stock,
  coalesce((select sum(montant_ttc) from public.notes_frais n where n.chantier_id = c.id and n.statut in ('valide', 'exporte_comptabilite', 'verrouille', 'archive', 'validee', 'remboursee')), 0) as cout_notes_frais
from public.chantiers c where c.entreprise_id = 'a0000000-0000-0000-0000-000000000001';
grant select on verite to authenticated;

-- Parité : le MÊME calcul exécuté sous l'identité de l'appelant, RLS appliquée
-- (aucun plafond de lignes en SQL). C'est ce que /rentabilite obtiendrait
-- sans la troncature PostgREST.
create function pg_temp.parite_rentabilite(e uuid)
returns table (chantier_id uuid, budget_ht numeric, facture_ht numeric, facture_ht_avoirs numeric, heures numeric,
  cout_main_oeuvre numeric, cout_horaire_manquant boolean, cout_achats numeric, cout_sous_traitance numeric,
  cout_stock numeric, cout_notes_frais numeric, cout_indemnites_paie numeric)
language sql stable as $$
  select c.id,
    coalesce((select sum(d.montant_ht) from public.devis d where d.entreprise_id = e and d.chantier_id = c.id and d.statut = 'accepte'), 0),
    coalesce((select sum(f.montant_ht) from public.factures f where f.entreprise_id = e and f.chantier_id = c.id and f.statut not in ('brouillon', 'annulee')), 0),
    coalesce((select sum(f.montant_ht) from public.factures f where f.entreprise_id = e and f.chantier_id = c.id and f.statut not in ('brouillon', 'annulee') and f.type = 'avoir'), 0),
    coalesce((select sum(p.heures_normales + p.heures_supplementaires) from public.pointages p where p.entreprise_id = e and p.chantier_id = c.id and p.verification_statut = 'valide'), 0),
    coalesce((select sum((p.heures_normales + p.heures_supplementaires) * coalesce(co.cout_horaire, 0)) from public.pointages p left join public.employes_cout_horaire co on co.employe_id = p.employe_id and co.entreprise_id = e where p.entreprise_id = e and p.chantier_id = c.id and p.verification_statut = 'valide'), 0),
    coalesce((select bool_or(coalesce(co.cout_horaire, 0) = 0) from public.pointages p left join public.employes_cout_horaire co on co.employe_id = p.employe_id and co.entreprise_id = e where p.entreprise_id = e and p.chantier_id = c.id and p.verification_statut = 'valide'), false),
    coalesce((select sum(d.montant_ht) from public.depenses_fournisseurs d where d.entreprise_id = e and d.chantier_id = c.id and d.statut is distinct from 'annulee' and d.categorie is distinct from 'sous_traitance'), 0),
    coalesce((select sum(d.montant_ht) from public.depenses_fournisseurs d where d.entreprise_id = e and d.chantier_id = c.id and d.statut is distinct from 'annulee' and d.categorie = 'sous_traitance'), 0),
    coalesce((select sum(m.quantite * coalesce(a.prix_achat_ht, 0)) from public.mouvements_stock m left join public.articles_stock a on a.id = m.article_id where m.entreprise_id = e and m.chantier_id = c.id and m.type = 'sortie'), 0),
    coalesce((select sum(n.montant_ttc) from public.notes_frais n where n.entreprise_id = e and n.chantier_id = c.id and n.statut in ('valide', 'exporte_comptabilite', 'verrouille', 'archive', 'validee', 'remboursee')), 0),
    coalesce((select sum(i.total) from public.couts_indemnites_paie_par_chantier(e, c.id) i), 0)
  from public.chantiers c where c.entreprise_id = e
$$;
create function pg_temp.parite_heures(e uuid, ch uuid)
returns table (heures_planifiees numeric, nb_affectations integer, heures_validees numeric, nb_pointages_valides integer)
language sql stable as $$
  select (select coalesce(sum(a.heures), 0) from public.affectations a where a.entreprise_id = e and a.chantier_id = ch),
         (select count(*)::integer from public.affectations a where a.entreprise_id = e and a.chantier_id = ch),
         (select coalesce(sum(p.heures_normales + p.heures_supplementaires), 0) from public.pointages p where p.entreprise_id = e and p.chantier_id = ch and p.verification_statut = 'valide'),
         (select count(*)::integer from public.pointages p where p.entreprise_id = e and p.chantier_id = ch and p.verification_statut = 'valide')
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Surface et droits.
-- ───────────────────────────────────────────────────────────────────────────
select has_function('public', 'rentabilite_chantiers_totaux', array['uuid'], '1. rentabilite_chantiers_totaux(uuid) existe');
select has_function('public', 'rentabilite_chantiers_page', array['uuid', 'text', 'integer', 'integer', 'boolean'], '2. rentabilite_chantiers_page existe');
select has_function('public', 'rentabilite_chantier', array['uuid', 'uuid'], '3. rentabilite_chantier existe');
select has_function('public', 'chantier_heures_synthese', array['uuid', 'uuid'], '4. chantier_heures_synthese existe');
select is(
  (select array_agg(f || ':' || r order by f, r) from unnest(array[
      'public.rentabilite_chantiers_totaux(uuid)', 'public.rentabilite_chantiers_page(uuid, text, integer, integer, boolean)',
      'public.rentabilite_chantier(uuid, uuid)', 'public.chantier_heures_synthese(uuid, uuid)',
      'public.chantier_pointages_valides_page(uuid, uuid, integer, integer)']) f,
    unnest(array['anon', 'authenticated', 'service_role']) r
   where has_function_privilege(r, f, 'execute')),
  array['public.chantier_heures_synthese(uuid, uuid):authenticated', 'public.chantier_pointages_valides_page(uuid, uuid, integer, integer):authenticated',
        'public.rentabilite_chantier(uuid, uuid):authenticated',
        'public.rentabilite_chantiers_page(uuid, text, integer, integer, boolean):authenticated', 'public.rentabilite_chantiers_totaux(uuid):authenticated'],
  '5. EXECUTE : authenticated seul (ni anon, ni service_role)');
select is(
  (select bool_or(has_function_privilege(r, 'public.rentabilite_chantiers_calcul(uuid, uuid)', 'execute')) from unnest(array['anon', 'authenticated', 'service_role']) r),
  false, '6. calcul interne rentabilite_chantiers_calcul : aucun rôle applicatif');
select ok(
  (select bool_and(p.prosecdef and 'search_path=public' = any(p.proconfig)) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in ('rentabilite_chantiers_calcul', 'rentabilite_chantiers_totaux', 'rentabilite_chantiers_page', 'rentabilite_chantier', 'chantier_heures_synthese', 'chantier_pointages_valides_page')),
  '7. SECURITY DEFINER et search_path figé');
select cmp_ok((select count(*)::int from public.pointages where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and verification_statut = 'valide'), '>', 1000,
  '8. jeu de test : plus de 1 000 pointages validés pour A');

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Dirigeant A (tous droits) : vérité DB exacte.
-- ───────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);

select results_eq(
  $$select chantier_id, budget_ht, facture_ht, heures, cout_main_oeuvre, cout_achats, cout_sous_traitance, cout_stock, cout_notes_frais
    from public.rentabilite_chantiers_page('a0000000-0000-0000-0000-000000000001', 'recent', 500, 0, false) order by chantier_id$$,
  $$select chantier_id, budget_ht, facture_ht, heures, cout_main_oeuvre, cout_achats, cout_sous_traitance, cout_stock, cout_notes_frais from verite order by chantier_id$$,
  '9. dirigeant A : chaque composante par chantier = vérité DB, au centime');
select results_eq(
  $$select nb_chantiers, heures, facture_ht, cout_main_oeuvre, marge from public.rentabilite_chantiers_totaux('a0000000-0000-0000-0000-000000000001')$$,
  $$select count(*)::integer, sum(heures), sum(facture_ht), sum(cout_main_oeuvre),
           sum(facture_ht - cout_main_oeuvre - cout_achats - cout_sous_traitance - cout_stock - cout_notes_frais) from verite$$,
  '10. dirigeant A : totaux (heures, CA, coût MO, marge) = vérité DB');
select is(
  (select heures from public.rentabilite_chantier('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001')),
  (select heures from verite where chantier_id = 'a4000000-0000-0000-0000-000000000001'),
  '11. dirigeant A : un chantier (analyse IA) = vérité DB');
select cmp_ok((select heures from verite where chantier_id = 'a4000000-0000-0000-0000-000000000001'), '>', 0::numeric, '12. le chantier 01 porte des heures validées');
select is(
  (select nb_pointages_valides from public.chantier_heures_synthese('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001')),
  (select count(*)::integer from public.pointages where chantier_id = 'a4000000-0000-0000-0000-000000000001' and verification_statut = 'valide'),
  '13. fiche chantier : nombre de pointages validés exact (> 1 000 lignes non tronquées)');
select results_eq(
  $$select * from public.chantier_heures_synthese('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001')$$,
  $$select * from pg_temp.parite_heures('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001')$$,
  '14. fiche chantier : heures planifiées (1 200 affectations) et validées exactes');
select is(
  (select marge from public.rentabilite_chantiers_page('a0000000-0000-0000-0000-000000000001', 'recent', 500, 0, false) where chantier_id = 'a4000000-0000-0000-0000-000000000001'),
  (select facture_ht - cout_main_oeuvre - cout_achats - cout_sous_traitance - cout_stock - cout_notes_frais from verite where chantier_id = 'a4000000-0000-0000-0000-000000000001'),
  '15. marge = CA − MO − achats − sous-traitance − indemnités − stock − notes (règle /rentabilite)');
select ok(
  (select cout_horaire_manquant from public.rentabilite_chantiers_page('a0000000-0000-0000-0000-000000000001', 'recent', 500, 0, false) where chantier_id = 'a4000000-0000-0000-0000-000000000001'),
  '16. alerte coût horaire manquant (chef sans coût, conducteur à 0)');
select is(
  (select count(*)::int from public.rentabilite_chantiers_page('a0000000-0000-0000-0000-000000000001', 'recent', 500, 0, true)),
  (select count(*)::int from verite where facture_ht > 0 or heures > 0 or budget_ht > 0),
  '17. filtre « avec activité » : le chantier vide est exclu');

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Parité avec la RLS réelle, profil par profil.
-- ───────────────────────────────────────────────────────────────────────────
select results_eq(
  $$select chantier_id, budget_ht, facture_ht, facture_ht_avoirs, heures, cout_main_oeuvre, cout_horaire_manquant, cout_achats, cout_sous_traitance, cout_stock, cout_notes_frais, cout_indemnites_paie
    from public.rentabilite_chantiers_page('a0000000-0000-0000-0000-000000000001', 'recent', 500, 0, false) order by chantier_id$$,
  $$select * from pg_temp.parite_rentabilite('a0000000-0000-0000-0000-000000000001') order by chantier_id$$,
  '18. parité RLS : dirigeant A');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq(
  $$select chantier_id, budget_ht, facture_ht, facture_ht_avoirs, heures, cout_main_oeuvre, cout_horaire_manquant, cout_achats, cout_sous_traitance, cout_stock, cout_notes_frais, cout_indemnites_paie
    from public.rentabilite_chantiers_page('a0000000-0000-0000-0000-000000000001', 'recent', 500, 0, false) order by chantier_id$$,
  $$select * from pg_temp.parite_rentabilite('a0000000-0000-0000-0000-000000000001') order by chantier_id$$,
  '19. parité RLS : admin A');
select results_eq($$select * from public.chantier_heures_synthese('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001')$$,
  $$select * from pg_temp.parite_heures('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001')$$, '20. parité RLS heures chantier : admin A');

-- Ouvrier : chantier assigné seulement, ses propres pointages, ses notes, ni factures ni devis ni coûts.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select results_eq(
  $$select chantier_id, budget_ht, facture_ht, facture_ht_avoirs, heures, cout_main_oeuvre, cout_horaire_manquant, cout_achats, cout_sous_traitance, cout_stock, cout_notes_frais, cout_indemnites_paie
    from public.rentabilite_chantiers_page('a0000000-0000-0000-0000-000000000001', 'recent', 500, 0, false) order by chantier_id$$,
  $$select * from pg_temp.parite_rentabilite('a0000000-0000-0000-0000-000000000001') order by chantier_id$$,
  '21. parité RLS : ouvrier A');
select is(
  (select array_agg(chantier_id::text) from public.rentabilite_chantiers_page('a0000000-0000-0000-0000-000000000001', 'recent', 500, 0, false)),
  array['a4000000-0000-0000-0000-000000000001'], '22. ouvrier A : seul son chantier assigné');
select ok(
  (select facture_ht = 0 and budget_ht = 0 and cout_main_oeuvre = 0 and cout_achats = 0 from public.rentabilite_chantiers_page('a0000000-0000-0000-0000-000000000001', 'recent', 500, 0, false)),
  '23. ouvrier A : ni CA, ni devis, ni coût MO, ni achats');
select is(
  (select heures from public.rentabilite_chantiers_page('a0000000-0000-0000-0000-000000000001', 'recent', 500, 0, false)),
  (select sum(heures_normales + heures_supplementaires) from public.pointages
    where chantier_id = 'a4000000-0000-0000-0000-000000000001' and verification_statut = 'valide' and employe_id = 'a2000000-0000-0000-0000-000000000002'),
  '24. ouvrier A : ses seules heures');
select results_eq($$select * from public.chantier_heures_synthese('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001')$$,
  $$select * from pg_temp.parite_heures('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001')$$, '25. parité RLS heures chantier : ouvrier A (ses affectations, ses pointages)');
select throws_ok($$select * from public.chantier_heures_synthese('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002')$$,
  '42501', 'RENTABILITE_ACCES_REFUSE', '26. ouvrier A : chantier non assigné refusé');
select is(
  (select count(*)::int from public.rentabilite_chantier('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002')),
  0, '27. ouvrier A : rentabilité d''un chantier non consultable = aucune ligne');

-- Chef d'équipe : chantier assigné, pointages de l'équipe, sans coût horaire (MO = 0, alerte).
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select results_eq(
  $$select chantier_id, budget_ht, facture_ht, facture_ht_avoirs, heures, cout_main_oeuvre, cout_horaire_manquant, cout_achats, cout_sous_traitance, cout_stock, cout_notes_frais, cout_indemnites_paie
    from public.rentabilite_chantiers_page('a0000000-0000-0000-0000-000000000001', 'recent', 500, 0, false) order by chantier_id$$,
  $$select * from pg_temp.parite_rentabilite('a0000000-0000-0000-0000-000000000001') order by chantier_id$$,
  '28. parité RLS : chef d''équipe A');
select ok(
  (select r.heures = v.heures and r.cout_main_oeuvre = 0 and r.cout_horaire_manquant
     from public.rentabilite_chantiers_page('a0000000-0000-0000-0000-000000000001', 'recent', 500, 0, false) r
     join verite v on v.chantier_id = r.chantier_id),
  '29. chef d''équipe A : toutes les heures de l''équipe, coût invisible (0) et signalé');
select results_eq($$select * from public.chantier_heures_synthese('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001')$$,
  $$select * from pg_temp.parite_heures('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001')$$, '30. parité RLS heures chantier : chef d''équipe A');

-- Conducteur : tous chantiers, devis, pointages, planning ; ni factures ni coûts.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select results_eq(
  $$select chantier_id, budget_ht, facture_ht, facture_ht_avoirs, heures, cout_main_oeuvre, cout_horaire_manquant, cout_achats, cout_sous_traitance, cout_stock, cout_notes_frais, cout_indemnites_paie
    from public.rentabilite_chantiers_page('a0000000-0000-0000-0000-000000000001', 'recent', 500, 0, false) order by chantier_id$$,
  $$select * from pg_temp.parite_rentabilite('a0000000-0000-0000-0000-000000000001') order by chantier_id$$,
  '31. parité RLS : conducteur A');
select results_eq($$select * from public.chantier_heures_synthese('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002')$$,
  $$select * from pg_temp.parite_heures('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002')$$, '32. parité RLS heures chantier : conducteur A');

-- Comptable (+ acces_chantiers, preparer_virements) : CA, achats, coûts ; pointages : aucun (pas de salarié) ;
-- notes : branche « sources bancaires » (valide, validee, exporte_comptabilite seulement).
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select results_eq(
  $$select chantier_id, budget_ht, facture_ht, facture_ht_avoirs, heures, cout_main_oeuvre, cout_horaire_manquant, cout_achats, cout_sous_traitance, cout_stock, cout_notes_frais, cout_indemnites_paie
    from public.rentabilite_chantiers_page('a0000000-0000-0000-0000-000000000001', 'recent', 500, 0, false) order by chantier_id$$,
  $$select * from pg_temp.parite_rentabilite('a0000000-0000-0000-0000-000000000001') order by chantier_id$$,
  '33. parité RLS : comptable A');
select is(
  (select sum(cout_notes_frais) from public.rentabilite_chantiers_page('a0000000-0000-0000-0000-000000000001', 'recent', 500, 0, false)),
  (select sum(montant_ttc) from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id is not null and statut in ('valide', 'validee', 'exporte_comptabilite')),
  '34. comptable A : notes de frais limitées aux statuts « sources bancaires »');
select is(
  (select sum(heures) from public.rentabilite_chantiers_page('a0000000-0000-0000-0000-000000000001', 'recent', 500, 0, false)),
  0::numeric, '35. comptable A : aucune heure (aucun pointage visible)');
select results_eq(
  $$select nb_chantiers, heures, facture_ht, cout_main_oeuvre, cout_achats, cout_notes_frais from public.rentabilite_chantiers_totaux('a0000000-0000-0000-0000-000000000001')$$,
  $$select count(*)::integer, sum(heures), sum(facture_ht), sum(cout_main_oeuvre), sum(cout_achats), sum(cout_notes_frais) from pg_temp.parite_rentabilite('a0000000-0000-0000-0000-000000000001')$$,
  '36. parité RLS des totaux : comptable A');
select throws_ok($$select * from public.chantier_heures_synthese('a0000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001')$$,
  '42501', 'RENTABILITE_ACCES_REFUSE', '37. comptable A : chantier d''une autre entreprise refusé');

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Pagination et paramètres.
-- ───────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select results_eq(
  $$select chantier_id from (
      select * from public.rentabilite_chantiers_page('a0000000-0000-0000-0000-000000000001', 'recent', 2, 0, false)
      union all select * from public.rentabilite_chantiers_page('a0000000-0000-0000-0000-000000000001', 'recent', 2, 2, false)
      union all select * from public.rentabilite_chantiers_page('a0000000-0000-0000-0000-000000000001', 'recent', 2, 4, false)
      union all select * from public.rentabilite_chantiers_page('a0000000-0000-0000-0000-000000000001', 'recent', 2, 6, false)) p order by chantier_id$$,
  $$select chantier_id from verite order by chantier_id$$,
  '38. pagination (pages de 2) : chaque chantier une fois, aucun perdu');
select is(
  (select array_agg(marge order by n) from (select marge, row_number() over () n from public.rentabilite_chantiers_page('a0000000-0000-0000-0000-000000000001', 'marge_desc', 500, 0, true)) m),
  (select array_agg(marge order by marge desc) from public.rentabilite_chantiers_page('a0000000-0000-0000-0000-000000000001', 'recent', 500, 0, true)),
  '39. tri marge_desc');
select throws_ok($$select * from public.rentabilite_chantiers_page('a0000000-0000-0000-0000-000000000001', 'recent', 501, 0, false)$$,
  '22023', 'RENTABILITE_PARAMETRES_INVALIDES', '40. page > 500 lignes refusée (reste sous max_rows)');
select throws_ok($$select * from public.rentabilite_chantiers_page('a0000000-0000-0000-0000-000000000001', 'recent', 0, 0, false)$$,
  '22023', 'RENTABILITE_PARAMETRES_INVALIDES', '41. page vide refusée');
select throws_ok($$select * from public.rentabilite_chantiers_page('a0000000-0000-0000-0000-000000000001', 'nom; drop', 10, 0, false)$$,
  '22023', 'RENTABILITE_PARAMETRES_INVALIDES', '42. tri inconnu refusé');
select throws_ok($$select * from public.rentabilite_chantiers_page('a0000000-0000-0000-0000-000000000001', 'recent', 10, -1, false)$$,
  '22023', 'RENTABILITE_PARAMETRES_INVALIDES', '43. décalage négatif refusé');

-- ───────────────────────────────────────────────────────────────────────────
-- 4 bis. Fiche chantier : identifiants de pages de pointages validés.
-- ───────────────────────────────────────────────────────────────────────────
select results_eq(
  $$select pointage_id from public.chantier_pointages_valides_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 50, 0)$$,
  $$select id from public.pointages where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'
      and verification_statut = 'valide' order by date desc, id limit 50$$,
  '53. 1re page = 50 pointages validés les plus récents, visibles sous RLS');
select results_eq(
  $$select pointage_id from public.chantier_pointages_valides_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 50, 800)$$,
  $$select id from public.pointages where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'
      and verification_statut = 'valide' order by date desc, id limit 50 offset 800$$,
  '54. page profonde (décalage 800) = même ordre que la RLS');
select is(
  (select count(distinct x.pointage_id)::int from generate_series(0, 1000, 200) d,
     lateral public.chantier_pointages_valides_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 200, d) x),
  (select nb_pointages_valides from public.chantier_heures_synthese('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001')),
  '55. pages de 200 : chaque pointage validé une fois, nombre = synthèse');
select throws_ok($$select * from public.chantier_pointages_valides_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 201, 0)$$,
  '22023', 'RENTABILITE_PARAMETRES_INVALIDES', '56. page > 200 refusée');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select results_eq(
  $$select pointage_id from public.chantier_pointages_valides_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 200, 0)$$,
  $$select id from public.pointages where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'
      and verification_statut = 'valide' order by date desc, id limit 200$$,
  '57. parité RLS : ouvrier A ne reçoit que ses pointages');
select throws_ok($$select * from public.chantier_pointages_valides_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002', 50, 0)$$,
  '42501', 'RENTABILITE_ACCES_REFUSE', '58. ouvrier A : pointages d''un chantier non assigné refusés');
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select throws_ok($$select * from public.chantier_pointages_valides_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 50, 0)$$,
  '42501', 'RENTABILITE_ACCES_REFUSE', '59. dirigeant B : pointages d''un chantier de A refusés');
select throws_ok($$select * from public.chantier_pointages_valides_page('b0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 50, 0)$$,
  '42501', 'RENTABILITE_ACCES_REFUSE', '60. dirigeant B : chantier de A demandé sous B refusé');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Refus.
-- ───────────────────────────────────────────────────────────────────────────
-- Autre entreprise : dirigeant B sur A.
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select throws_ok($$select * from public.rentabilite_chantiers_totaux('a0000000-0000-0000-0000-000000000001')$$,
  '42501', 'RENTABILITE_ACCES_REFUSE', '44. dirigeant B : totaux de A refusés');
select throws_ok($$select * from public.rentabilite_chantier('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001')$$,
  '42501', 'RENTABILITE_ACCES_REFUSE', '45. dirigeant B : chantier de A refusé');
select throws_ok($$select * from public.chantier_heures_synthese('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001')$$,
  '42501', 'RENTABILITE_ACCES_REFUSE', '46. dirigeant B : heures d''un chantier de A refusées');
select is(
  (select heures from public.rentabilite_chantiers_totaux('b0000000-0000-0000-0000-000000000001')),
  (select sum(heures_normales + heures_supplementaires) from public.pointages where entreprise_id = 'b0000000-0000-0000-0000-000000000001' and verification_statut = 'valide'),
  '47. dirigeant B : ses propres totaux, sans aucune heure de A');
-- Chantier de B demandé sous l'entreprise A par un membre de A.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select is((select count(*)::int from public.rentabilite_chantier('a0000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001')),
  0, '48. chantier de B sous l''entreprise A : aucune ligne');

-- Sans identité.
select set_config('request.jwt.claims', '', true);
select throws_ok($$select * from public.rentabilite_chantiers_totaux('a0000000-0000-0000-0000-000000000001')$$,
  '42501', 'RENTABILITE_ACCES_REFUSE', '49. sans identité : refusé');
reset role;

-- anon.
set local role anon;
select throws_ok($$select * from public.rentabilite_chantiers_totaux('a0000000-0000-0000-0000-000000000001')$$,
  '42501', null, '50. anon : EXECUTE refusé');
reset role;

-- Membre désactivé (conducteur A).
update public.utilisateurs_entreprises set statut = 'desactive'
 where utilisateur_id = '10000000-0000-0000-0000-000000000004' and entreprise_id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select throws_ok($$select * from public.rentabilite_chantiers_page('a0000000-0000-0000-0000-000000000001', 'recent', 50, 0, false)$$,
  '42501', 'RENTABILITE_ACCES_REFUSE', '51. membre désactivé : refusé');
reset role;

-- Entreprise suspendue.
select set_config('request.jwt.claims', '', true);
update public.entreprises set abonnement_statut = 'suspendu' where id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select throws_ok($$select * from public.rentabilite_chantiers_totaux('a0000000-0000-0000-0000-000000000001')$$,
  '42501', 'RENTABILITE_ACCES_REFUSE', '52. entreprise suspendue : refusée');
reset role;

select * from finish();
rollback;
