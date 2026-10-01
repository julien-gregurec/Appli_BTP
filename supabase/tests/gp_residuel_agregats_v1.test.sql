-- ELSATIA-GP-RESIDUAL-DATA-CORRECTNESS-V1 — parité RLS des agrégats résiduels
-- (migrations 20260930000401, 20260930000402, 20260930000403).
--
-- FICHIER GÉNÉRÉ par scripts/qualification/gp-residual/generer_pgtap.py.
--
-- Chaque fonction SECURITY DEFINER doit renvoyer EXACTEMENT ce que la RLS des
-- tables donne au même utilisateur (même calcul sous `authenticated`), pour les
-- six profils du tenant A (admin, ouvrier, chef d'équipe, conducteur,
-- comptable, dirigeant) ; refus pour le tenant B, sans identité, et sur les
-- RPC plateforme pour un membre de tenant ; anon sans EXECUTE. Jeu : 1 462
-- lignes par chemin (> max_rows = 1 000), audiences de documents mêlées (tous_affectes, encadrement, gestionnaires).
begin;
create extension if not exists pgtap with schema extensions;
select plan(303);

\ir fixtures/isolation_multitenant.inc

set session_replication_role = replica;
-- Tiers, véhicule, outil, période de paie du tenant A.
insert into public.fournisseurs (id, entreprise_id, reference, nom, type_tiers) values ('a9900000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'PGTAP-ST', 'Sous-traitant PGTAP', 'sous_traitant');
insert into public.vehicules (id, entreprise_id, immatriculation, marque, modele, type, statut) values ('a9910000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'PG-TAP-01', 'Renault', 'Master', 'utilitaire', 'actif');
insert into public.outils (id, entreprise_id, reference, designation, categorie, statut, etat) values ('a9920000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'PGTAP-OUT', 'Perforateur', 'electroportatif', 'disponible', 'bon');
insert into public.periodes_paie (id, entreprise_id, mois, date_debut, date_fin, statut, cree_par) values ('a9930000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '2026-03-01', '2026-03-01', '2026-03-31', 'saisie_en_cours', '10000000-0000-0000-0000-000000000001');
-- 1 462 factures et devis du client, 1 462 factures fournisseurs par axe, 1 462 missions.
insert into public.factures (entreprise_id, numero, client_id, chantier_id, type, statut, date_emission, montant_ht, montant_tva, montant_ttc, montant_paye, created_at)
select 'a0000000-0000-0000-0000-000000000001', 'PGTAP-F-' || g, 'a3000000-0000-0000-0000-000000000001', case when g % 2 = 0 then 'a4000000-0000-0000-0000-000000000001'::uuid end, 'simple',
       case when g % 33 = 0 then 'annulee' when g % 4 = 0 then 'payee' when g % 4 = 1 then 'payee_partiel' else 'envoyee' end,
       date '2025-01-01' + g % 400, round(10 + (g * 37) % 997 * 1.07, 2), 0, round(10 + (g * 37) % 997 * 1.07, 2),
       case when g % 4 = 0 then round(10 + (g * 37) % 997 * 1.07, 2) when g % 4 = 1 then round((10 + (g * 37) % 997 * 1.07) / 3, 2) else 0 end,
       timestamptz '2025-01-01' + g * interval '1 minute'
from generate_series(1, 1462) g;
insert into public.devis (entreprise_id, numero, client_id, statut, montant_ht, montant_tva, montant_ttc)
select 'a0000000-0000-0000-0000-000000000001', 'PGTAP-D-' || g, 'a3000000-0000-0000-0000-000000000001', 'envoye', 10, 2, 12 from generate_series(1, 1462) g;
insert into public.chantiers (entreprise_id, client_id, nom, statut, date_fin_prevue, created_at)
select 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'PGTAP chantier ' || g, (array['en_cours','accepte','termine','archive','en_pause'])[1 + g % 5], date '2026-01-01' + g % 600, timestamptz '2024-01-01' + g * interval '1 minute'
from generate_series(1, 300) g;
insert into public.depenses_fournisseurs (entreprise_id, fournisseur_id, chantier_id, vehicule_id, outil_id, numero_piece, categorie, date_piece, statut, montant_ht, taux_tva, montant_tva, montant_regle)
select 'a0000000-0000-0000-0000-000000000001', 'a9900000-0000-0000-0000-000000000001', case a.n when 1 then 'a4000000-0000-0000-0000-000000000001'::uuid end, case a.n when 2 then 'a9910000-0000-0000-0000-000000000001'::uuid end, case a.n when 3 then 'a9920000-0000-0000-0000-000000000001'::uuid end,
       'PGTAP-' || a.n || '-' || g, 'autre', date '2025-01-01' + g % 400,
       case when g % 29 = 0 then 'annulee' when g % 3 = 0 then 'payee' else 'a_payer' end,
       round(5.13 + (g * 53) % 1999, 2), 20, round((5.13 + (g * 53) % 1999) * 0.2, 2), case when g % 3 = 0 then round((5.13 + (g * 53) % 1999) * 1.2, 2) else 0 end
from generate_series(1, 1462) g cross join (values (1), (2), (3)) a(n);
insert into public.sous_traitants_chantiers (entreprise_id, fournisseur_id, chantier_id, mission, montant_previsionnel_ht, statut)
select 'a0000000-0000-0000-0000-000000000001', 'a9900000-0000-0000-0000-000000000001', case when g % 2 = 0 then 'a4000000-0000-0000-0000-000000000001'::uuid else 'a4000000-0000-0000-0000-000000000002'::uuid end, 'Mission ' || g, round(0.37 + (g * 31) % 700, 2),
       (array['prevue','en_cours','terminee','annulee'])[1 + g % 4]
from generate_series(1, 1462) g;
-- 1 462 documents par chantier, audiences mêlées (dont NULL).
insert into public.documents_chantier (entreprise_id, chantier_id, nom, categorie, storage_path, mime_type, taille_octets, audience, created_at)
select 'a0000000-0000-0000-0000-000000000001', c.id, 'Doc ' || g, (array['photo_pendant','plan','autre'])[1 + g % 3], 'pgtap/' || c.n || '/' || g || '.jpg', 'image/jpeg', 100,
       (array['tous_affectes','encadrement','gestionnaires'])[1 + g % 3], timestamptz '2025-01-01' + g * interval '1 minute'
from generate_series(1, 1462) g cross join (values ('a4000000-0000-0000-0000-000000000001'::uuid, 1), ('a4000000-0000-0000-0000-000000000002'::uuid, 2)) c(id, n);
-- Notes de frais : 1 462 sur le chantier 1, quatre salariés, statuts variés, créées par l'ouvrier pour moitié.
insert into public.notes_frais (entreprise_id, employe_id, reference, date_frais, montant_ttc, statut, chantier_id, cree_par_utilisateur_id)
select 'a0000000-0000-0000-0000-000000000001', ('a2000000-0000-0000-0000-00000000000' || (1 + g % 4))::uuid, 'PGTAP-NF-' || g, date '2025-01-01' + g % 400, round(4.99 + (g * 17) % 300, 2),
       (array['brouillon','soumis','en_verification','correction_demandee','valide','refuse','exporte_comptabilite','verrouille'])[1 + g % 8],
       'a4000000-0000-0000-0000-000000000001', case when g % 2 = 0 then '10000000-0000-0000-0000-000000000002'::uuid else '10000000-0000-0000-0000-000000000001'::uuid end
from generate_series(1, 1462) g;
-- Paie : un dossier par salarié, une anomalie par dossier.
insert into public.dossiers_paie_salaries (entreprise_id, periode_id, employe_id, total_paniers, total_trajets, total_transports, total_grands_deplacements, total_primes, total_acomptes, total_notes_frais)
select 'a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001', e.id, 10.5, 3.25, 7.1, 31.3, 50.05 * row_number() over (order by e.id), 100, 12.34
from public.employes e where e.entreprise_id = 'a0000000-0000-0000-0000-000000000001';
insert into public.anomalies_paie (entreprise_id, periode_id, dossier_id, niveau, code, description)
select 'a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001', d.id, 'attention', 'PGTAP', 'Contrôle' from public.dossiers_paie_salaries d where d.periode_id = 'a9930000-0000-0000-0000-000000000001';
insert into public.pieces_jointes_paie (entreprise_id, employe_id, dossier_id, type_document, nom_original, storage_path, mime_type, taille_octets, importe_par)
select 'a0000000-0000-0000-0000-000000000001', d.employe_id, d.id, 'justificatif', 'p' || k || '.pdf', 'pgtap/paie/' || d.id || '/' || k || '.pdf', 'application/pdf', 100, '10000000-0000-0000-0000-000000000001'
from public.dossiers_paie_salaries d cross join generate_series(1, 3) k where d.periode_id = 'a9930000-0000-0000-0000-000000000001';
-- CRM, stock et DOE.
insert into public.appels_contacts (entreprise_id, client_id, type, sens, objet, a_rappeler_at, termine)
select 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'appel', 'sortant', 'Appel ' || g, case when g % 3 = 0 then now() end, g % 6 = 0 from generate_series(1, 1462) g;
insert into public.articles_stock (id, entreprise_id, reference, designation, unite, quantite_stock, seuil_alerte, actif)
select ('a9940000-0000-0000-0000-' || lpad(to_hex(g), 12, '0'))::uuid, 'a0000000-0000-0000-0000-000000000001', 'PGTAP-ART-' || g, 'Article ' || g, 'u', case when g % 7 = 0 then 1 else 50 end, 5, true
from generate_series(1, 1462) g;
insert into public.mouvements_stock (entreprise_id, article_id, chantier_id, type, quantite, date)
select 'a0000000-0000-0000-0000-000000000001', ('a9940000-0000-0000-0000-' || lpad(to_hex(g), 12, '0'))::uuid, 'a4000000-0000-0000-0000-000000000001', 'sortie', 1, current_date from generate_series(1, 1462) g;
insert into public.fiches_techniques_articles (entreprise_id, article_id, titre, type_document, storage_path, nom_original, mime_type, taille_octets, origine)
select 'a0000000-0000-0000-0000-000000000001', ('a9940000-0000-0000-0000-' || lpad(to_hex(g), 12, '0'))::uuid, 'Fiche ' || g, 'fiche_technique', 'pgtap/fiches/' || g || '.pdf', 'f.pdf', 'application/pdf', 100, 'import_manuel'
from generate_series(1, 1462) g where g % 2 = 0;
reset session_replication_role;

select ok(to_regprocedure('public.gp_depenses_synthese(uuid, uuid, uuid, uuid)') is not null, 'gp_depenses_synthese existe');
select is(has_function_privilege('anon', 'public.gp_depenses_synthese(uuid, uuid, uuid, uuid)', 'execute'), false, 'gp_depenses_synthese : anon n''a pas EXECUTE');
select is(has_function_privilege('authenticated', 'public.gp_depenses_synthese(uuid, uuid, uuid, uuid)', 'execute'), true, 'gp_depenses_synthese : authenticated a EXECUTE');
select ok((select prosecdef and proconfig::text like '%search_path=public%' from pg_proc where oid = to_regprocedure('public.gp_depenses_synthese(uuid, uuid, uuid, uuid)')), 'gp_depenses_synthese : SECURITY DEFINER, search_path figé');
select ok(to_regprocedure('public.gp_client_synthese(uuid, uuid)') is not null, 'gp_client_synthese existe');
select is(has_function_privilege('anon', 'public.gp_client_synthese(uuid, uuid)', 'execute'), false, 'gp_client_synthese : anon n''a pas EXECUTE');
select is(has_function_privilege('authenticated', 'public.gp_client_synthese(uuid, uuid)', 'execute'), true, 'gp_client_synthese : authenticated a EXECUTE');
select ok((select prosecdef and proconfig::text like '%search_path=public%' from pg_proc where oid = to_regprocedure('public.gp_client_synthese(uuid, uuid)')), 'gp_client_synthese : SECURITY DEFINER, search_path figé');
select ok(to_regprocedure('public.gp_client_chantiers_page(uuid, uuid, integer, timestamp with time zone, uuid)') is not null, 'gp_client_chantiers_page existe');
select is(has_function_privilege('anon', 'public.gp_client_chantiers_page(uuid, uuid, integer, timestamp with time zone, uuid)', 'execute'), false, 'gp_client_chantiers_page : anon n''a pas EXECUTE');
select is(has_function_privilege('authenticated', 'public.gp_client_chantiers_page(uuid, uuid, integer, timestamp with time zone, uuid)', 'execute'), true, 'gp_client_chantiers_page : authenticated a EXECUTE');
select ok((select prosecdef and proconfig::text like '%search_path=public%' from pg_proc where oid = to_regprocedure('public.gp_client_chantiers_page(uuid, uuid, integer, timestamp with time zone, uuid)')), 'gp_client_chantiers_page : SECURITY DEFINER, search_path figé');
select ok(to_regprocedure('public.gp_sous_traitant_missions_synthese(uuid, uuid)') is not null, 'gp_sous_traitant_missions_synthese existe');
select is(has_function_privilege('anon', 'public.gp_sous_traitant_missions_synthese(uuid, uuid)', 'execute'), false, 'gp_sous_traitant_missions_synthese : anon n''a pas EXECUTE');
select is(has_function_privilege('authenticated', 'public.gp_sous_traitant_missions_synthese(uuid, uuid)', 'execute'), true, 'gp_sous_traitant_missions_synthese : authenticated a EXECUTE');
select ok((select prosecdef and proconfig::text like '%search_path=public%' from pg_proc where oid = to_regprocedure('public.gp_sous_traitant_missions_synthese(uuid, uuid)')), 'gp_sous_traitant_missions_synthese : SECURITY DEFINER, search_path figé');
select ok(to_regprocedure('public.gp_chantier_documents_page(uuid, uuid, integer, timestamp with time zone, uuid)') is not null, 'gp_chantier_documents_page existe');
select is(has_function_privilege('anon', 'public.gp_chantier_documents_page(uuid, uuid, integer, timestamp with time zone, uuid)', 'execute'), false, 'gp_chantier_documents_page : anon n''a pas EXECUTE');
select is(has_function_privilege('authenticated', 'public.gp_chantier_documents_page(uuid, uuid, integer, timestamp with time zone, uuid)', 'execute'), true, 'gp_chantier_documents_page : authenticated a EXECUTE');
select ok((select prosecdef and proconfig::text like '%search_path=public%' from pg_proc where oid = to_regprocedure('public.gp_chantier_documents_page(uuid, uuid, integer, timestamp with time zone, uuid)')), 'gp_chantier_documents_page : SECURITY DEFINER, search_path figé');
select ok(to_regprocedure('public.chantier_synthese_chiffree(uuid, uuid, boolean, boolean, integer)') is not null, 'chantier_synthese_chiffree existe');
select is(has_function_privilege('anon', 'public.chantier_synthese_chiffree(uuid, uuid, boolean, boolean, integer)', 'execute'), false, 'chantier_synthese_chiffree : anon n''a pas EXECUTE');
select is(has_function_privilege('authenticated', 'public.chantier_synthese_chiffree(uuid, uuid, boolean, boolean, integer)', 'execute'), true, 'chantier_synthese_chiffree : authenticated a EXECUTE');
select ok((select prosecdef and proconfig::text like '%search_path=public%' from pg_proc where oid = to_regprocedure('public.chantier_synthese_chiffree(uuid, uuid, boolean, boolean, integer)')), 'chantier_synthese_chiffree : SECURITY DEFINER, search_path figé');
select ok(to_regprocedure('public.gp_doe_contenu(uuid, uuid)') is not null, 'gp_doe_contenu existe');
select is(has_function_privilege('anon', 'public.gp_doe_contenu(uuid, uuid)', 'execute'), false, 'gp_doe_contenu : anon n''a pas EXECUTE');
select is(has_function_privilege('authenticated', 'public.gp_doe_contenu(uuid, uuid)', 'execute'), true, 'gp_doe_contenu : authenticated a EXECUTE');
select ok((select prosecdef and proconfig::text like '%search_path=public%' from pg_proc where oid = to_regprocedure('public.gp_doe_contenu(uuid, uuid)')), 'gp_doe_contenu : SECURITY DEFINER, search_path figé');
select ok(to_regprocedure('public.paie_periode_synthese(uuid, uuid, text, text, uuid)') is not null, 'paie_periode_synthese existe');
select is(has_function_privilege('anon', 'public.paie_periode_synthese(uuid, uuid, text, text, uuid)', 'execute'), false, 'paie_periode_synthese : anon n''a pas EXECUTE');
select is(has_function_privilege('authenticated', 'public.paie_periode_synthese(uuid, uuid, text, text, uuid)', 'execute'), true, 'paie_periode_synthese : authenticated a EXECUTE');
select ok((select prosecdef and proconfig::text like '%search_path=public%' from pg_proc where oid = to_regprocedure('public.paie_periode_synthese(uuid, uuid, text, text, uuid)')), 'paie_periode_synthese : SECURITY DEFINER, search_path figé');
select ok(to_regprocedure('public.notes_frais_synthese_employes(uuid, text, text, uuid, uuid)') is not null, 'notes_frais_synthese_employes existe');
select is(has_function_privilege('anon', 'public.notes_frais_synthese_employes(uuid, text, text, uuid, uuid)', 'execute'), false, 'notes_frais_synthese_employes : anon n''a pas EXECUTE');
select is(has_function_privilege('authenticated', 'public.notes_frais_synthese_employes(uuid, text, text, uuid, uuid)', 'execute'), true, 'notes_frais_synthese_employes : authenticated a EXECUTE');
select ok((select prosecdef and proconfig::text like '%search_path=public%' from pg_proc where oid = to_regprocedure('public.notes_frais_synthese_employes(uuid, text, text, uuid, uuid)')), 'notes_frais_synthese_employes : SECURITY DEFINER, search_path figé');
select ok(to_regprocedure('public.notes_frais_page(uuid, text, text, uuid, uuid, integer, date, uuid)') is not null, 'notes_frais_page existe');
select is(has_function_privilege('anon', 'public.notes_frais_page(uuid, text, text, uuid, uuid, integer, date, uuid)', 'execute'), false, 'notes_frais_page : anon n''a pas EXECUTE');
select is(has_function_privilege('authenticated', 'public.notes_frais_page(uuid, text, text, uuid, uuid, integer, date, uuid)', 'execute'), true, 'notes_frais_page : authenticated a EXECUTE');
select ok((select prosecdef and proconfig::text like '%search_path=public%' from pg_proc where oid = to_regprocedure('public.notes_frais_page(uuid, text, text, uuid, uuid, integer, date, uuid)')), 'notes_frais_page : SECURITY DEFINER, search_path figé');
select ok(to_regprocedure('public.gp_crm_synthese(uuid)') is not null, 'gp_crm_synthese existe');
select is(has_function_privilege('anon', 'public.gp_crm_synthese(uuid)', 'execute'), false, 'gp_crm_synthese : anon n''a pas EXECUTE');
select is(has_function_privilege('authenticated', 'public.gp_crm_synthese(uuid)', 'execute'), true, 'gp_crm_synthese : authenticated a EXECUTE');
select ok((select prosecdef and proconfig::text like '%search_path=public%' from pg_proc where oid = to_regprocedure('public.gp_crm_synthese(uuid)')), 'gp_crm_synthese : SECURITY DEFINER, search_path figé');
select ok(to_regprocedure('public.gp_dashboard_chantiers(uuid, date, integer)') is not null, 'gp_dashboard_chantiers existe');
select is(has_function_privilege('anon', 'public.gp_dashboard_chantiers(uuid, date, integer)', 'execute'), false, 'gp_dashboard_chantiers : anon n''a pas EXECUTE');
select is(has_function_privilege('authenticated', 'public.gp_dashboard_chantiers(uuid, date, integer)', 'execute'), true, 'gp_dashboard_chantiers : authenticated a EXECUTE');
select ok((select prosecdef and proconfig::text like '%search_path=public%' from pg_proc where oid = to_regprocedure('public.gp_dashboard_chantiers(uuid, date, integer)')), 'gp_dashboard_chantiers : SECURITY DEFINER, search_path figé');
select ok(to_regprocedure('public.gp_alertes_stock(uuid, integer)') is not null, 'gp_alertes_stock existe');
select is(has_function_privilege('anon', 'public.gp_alertes_stock(uuid, integer)', 'execute'), false, 'gp_alertes_stock : anon n''a pas EXECUTE');
select is(has_function_privilege('authenticated', 'public.gp_alertes_stock(uuid, integer)', 'execute'), true, 'gp_alertes_stock : authenticated a EXECUTE');
select ok((select prosecdef and proconfig::text like '%search_path=public%' from pg_proc where oid = to_regprocedure('public.gp_alertes_stock(uuid, integer)')), 'gp_alertes_stock : SECURITY DEFINER, search_path figé');
select ok(to_regprocedure('public.paie_periode_dossiers_page(uuid, uuid, text, text, uuid, integer, integer)') is not null, 'paie_periode_dossiers_page existe');
select is(has_function_privilege('anon', 'public.paie_periode_dossiers_page(uuid, uuid, text, text, uuid, integer, integer)', 'execute'), false, 'paie_periode_dossiers_page : anon n''a pas EXECUTE');
select is(has_function_privilege('authenticated', 'public.paie_periode_dossiers_page(uuid, uuid, text, text, uuid, integer, integer)', 'execute'), true, 'paie_periode_dossiers_page : authenticated a EXECUTE');
select ok((select prosecdef and proconfig::text like '%search_path=public%' from pg_proc where oid = to_regprocedure('public.paie_periode_dossiers_page(uuid, uuid, text, text, uuid, integer, integer)')), 'paie_periode_dossiers_page : SECURITY DEFINER, search_path figé');
select ok(to_regprocedure('public.paie_export_contenu(uuid, uuid, boolean)') is not null, 'paie_export_contenu existe');
select is(has_function_privilege('anon', 'public.paie_export_contenu(uuid, uuid, boolean)', 'execute'), false, 'paie_export_contenu : anon n''a pas EXECUTE');
select is(has_function_privilege('authenticated', 'public.paie_export_contenu(uuid, uuid, boolean)', 'execute'), true, 'paie_export_contenu : authenticated a EXECUTE');
select ok((select prosecdef and proconfig::text like '%search_path=public%' from pg_proc where oid = to_regprocedure('public.paie_export_contenu(uuid, uuid, boolean)')), 'paie_export_contenu : SECURITY DEFINER, search_path figé');
select ok(to_regprocedure('public.paie_anomalies_page(uuid, uuid, uuid, integer)') is not null, 'paie_anomalies_page existe');
select is(has_function_privilege('anon', 'public.paie_anomalies_page(uuid, uuid, uuid, integer)', 'execute'), false, 'paie_anomalies_page : anon n''a pas EXECUTE');
select is(has_function_privilege('authenticated', 'public.paie_anomalies_page(uuid, uuid, uuid, integer)', 'execute'), true, 'paie_anomalies_page : authenticated a EXECUTE');
select ok((select prosecdef and proconfig::text like '%search_path=public%' from pg_proc where oid = to_regprocedure('public.paie_anomalies_page(uuid, uuid, uuid, integer)')), 'paie_anomalies_page : SECURITY DEFINER, search_path figé');
select ok(to_regprocedure('public.gp_parc_synthese(uuid, date)') is not null, 'gp_parc_synthese existe');
select is(has_function_privilege('anon', 'public.gp_parc_synthese(uuid, date)', 'execute'), false, 'gp_parc_synthese : anon n''a pas EXECUTE');
select is(has_function_privilege('authenticated', 'public.gp_parc_synthese(uuid, date)', 'execute'), true, 'gp_parc_synthese : authenticated a EXECUTE');
select ok((select prosecdef and proconfig::text like '%search_path=public%' from pg_proc where oid = to_regprocedure('public.gp_parc_synthese(uuid, date)')), 'gp_parc_synthese : SECURITY DEFINER, search_path figé');
select ok(to_regprocedure('public.gp_effectif_actif(uuid)') is not null, 'gp_effectif_actif existe');
select is(has_function_privilege('anon', 'public.gp_effectif_actif(uuid)', 'execute'), false, 'gp_effectif_actif : anon n''a pas EXECUTE');
select is(has_function_privilege('authenticated', 'public.gp_effectif_actif(uuid)', 'execute'), true, 'gp_effectif_actif : authenticated a EXECUTE');
select ok((select prosecdef and proconfig::text like '%search_path=public%' from pg_proc where oid = to_regprocedure('public.gp_effectif_actif(uuid)')), 'gp_effectif_actif : SECURITY DEFINER, search_path figé');
select ok(to_regprocedure('public.gp_alertes_parc(uuid, date, integer, integer)') is not null, 'gp_alertes_parc existe');
select is(has_function_privilege('anon', 'public.gp_alertes_parc(uuid, date, integer, integer)', 'execute'), false, 'gp_alertes_parc : anon n''a pas EXECUTE');
select is(has_function_privilege('authenticated', 'public.gp_alertes_parc(uuid, date, integer, integer)', 'execute'), true, 'gp_alertes_parc : authenticated a EXECUTE');
select ok((select prosecdef and proconfig::text like '%search_path=public%' from pg_proc where oid = to_regprocedure('public.gp_alertes_parc(uuid, date, integer, integer)')), 'gp_alertes_parc : SECURITY DEFINER, search_path figé');
select ok(to_regprocedure('public.gp_options_chantiers(uuid, text[], uuid, text)') is not null, 'gp_options_chantiers existe');
select is(has_function_privilege('anon', 'public.gp_options_chantiers(uuid, text[], uuid, text)', 'execute'), false, 'gp_options_chantiers : anon n''a pas EXECUTE');
select is(has_function_privilege('authenticated', 'public.gp_options_chantiers(uuid, text[], uuid, text)', 'execute'), true, 'gp_options_chantiers : authenticated a EXECUTE');
select ok((select prosecdef and proconfig::text like '%search_path=public%' from pg_proc where oid = to_regprocedure('public.gp_options_chantiers(uuid, text[], uuid, text)')), 'gp_options_chantiers : SECURITY DEFINER, search_path figé');
select ok(to_regprocedure('public.gp_options_employes(uuid, boolean)') is not null, 'gp_options_employes existe');
select is(has_function_privilege('anon', 'public.gp_options_employes(uuid, boolean)', 'execute'), false, 'gp_options_employes : anon n''a pas EXECUTE');
select is(has_function_privilege('authenticated', 'public.gp_options_employes(uuid, boolean)', 'execute'), true, 'gp_options_employes : authenticated a EXECUTE');
select ok((select prosecdef and proconfig::text like '%search_path=public%' from pg_proc where oid = to_regprocedure('public.gp_options_employes(uuid, boolean)')), 'gp_options_employes : SECURITY DEFINER, search_path figé');
select ok(to_regprocedure('public.gp_options_clients(uuid, text, text, text)') is not null, 'gp_options_clients existe');
select is(has_function_privilege('anon', 'public.gp_options_clients(uuid, text, text, text)', 'execute'), false, 'gp_options_clients : anon n''a pas EXECUTE');
select is(has_function_privilege('authenticated', 'public.gp_options_clients(uuid, text, text, text)', 'execute'), true, 'gp_options_clients : authenticated a EXECUTE');
select ok((select prosecdef and proconfig::text like '%search_path=public%' from pg_proc where oid = to_regprocedure('public.gp_options_clients(uuid, text, text, text)')), 'gp_options_clients : SECURITY DEFINER, search_path figé');
select ok(to_regprocedure('public.plateforme_postes_tarifs_entreprise(uuid)') is not null, 'plateforme_postes_tarifs_entreprise existe');
select is(has_function_privilege('anon', 'public.plateforme_postes_tarifs_entreprise(uuid)', 'execute'), false, 'plateforme_postes_tarifs_entreprise : anon n''a pas EXECUTE');
select is(has_function_privilege('authenticated', 'public.plateforme_postes_tarifs_entreprise(uuid)', 'execute'), true, 'plateforme_postes_tarifs_entreprise : authenticated a EXECUTE');
select ok((select prosecdef and proconfig::text like '%search_path=public%' from pg_proc where oid = to_regprocedure('public.plateforme_postes_tarifs_entreprise(uuid)')), 'plateforme_postes_tarifs_entreprise : SECURITY DEFINER, search_path figé');
select ok(to_regprocedure('public.plateforme_applications_compteurs()') is not null, 'plateforme_applications_compteurs existe');
select is(has_function_privilege('anon', 'public.plateforme_applications_compteurs()', 'execute'), false, 'plateforme_applications_compteurs : anon n''a pas EXECUTE');
select is(has_function_privilege('authenticated', 'public.plateforme_applications_compteurs()', 'execute'), true, 'plateforme_applications_compteurs : authenticated a EXECUTE');
select ok((select prosecdef and proconfig::text like '%search_path=public%' from pg_proc where oid = to_regprocedure('public.plateforme_applications_compteurs()')), 'plateforme_applications_compteurs : SECURITY DEFINER, search_path figé');
select is((select count(*)::int from public.factures where client_id = 'a3000000-0000-0000-0000-000000000001' and numero like 'PGTAP-F-%'), 1462, 'jeu : 1 462 factures pour le client (> 1 000)');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true) is not null as profil;
select is(public.gp_depenses_synthese('a0000000-0000-0000-0000-000000000001', p_fournisseur_id => 'a9900000-0000-0000-0000-000000000001'),
  (select jsonb_build_object('nb', count(*), 'nb_actives', count(*) filter (where statut is distinct from 'annulee'),
     'total_ht', coalesce(sum(montant_ht) filter (where statut is distinct from 'annulee'), 0),
     'total_ttc', coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0), 'total_regle', coalesce(sum(montant_regle), 0))
   from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and fournisseur_id = 'a9900000-0000-0000-0000-000000000001'),
  'parité RLS dépenses sous-traitant : admin A');
select is(public.gp_depenses_synthese('a0000000-0000-0000-0000-000000000001', p_vehicule_id => 'a9910000-0000-0000-0000-000000000001'),
  (select jsonb_build_object('nb', count(*), 'nb_actives', count(*) filter (where statut is distinct from 'annulee'),
     'total_ht', coalesce(sum(montant_ht) filter (where statut is distinct from 'annulee'), 0),
     'total_ttc', coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0), 'total_regle', coalesce(sum(montant_regle), 0))
   from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and vehicule_id = 'a9910000-0000-0000-0000-000000000001'),
  'parité RLS dépenses véhicule : admin A');
select is(public.gp_depenses_synthese('a0000000-0000-0000-0000-000000000001', p_outil_id => 'a9920000-0000-0000-0000-000000000001'),
  (select jsonb_build_object('nb', count(*), 'nb_actives', count(*) filter (where statut is distinct from 'annulee'),
     'total_ht', coalesce(sum(montant_ht) filter (where statut is distinct from 'annulee'), 0),
     'total_ttc', coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0), 'total_regle', coalesce(sum(montant_regle), 0))
   from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and outil_id = 'a9920000-0000-0000-0000-000000000001'),
  'parité RLS dépenses outil : admin A');
select is(public.gp_client_synthese('a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001'),
  jsonb_build_object(
    'factures', (select jsonb_build_object('nb', count(*), 'total_facture', coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0), 'total_paye', coalesce(sum(montant_paye), 0)) from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and client_id = 'a3000000-0000-0000-0000-000000000001'),
    'devis', (select jsonb_build_object('nb', count(*)) from public.devis where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and client_id = 'a3000000-0000-0000-0000-000000000001')),
  'parité RLS fiche client : admin A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.gp_client_chantiers_page('a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 200)->'lignes') with ordinality t(x, n)),
  (select array_agg(id order by created_at desc nulls last, id desc) from (select id, created_at from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and client_id = 'a3000000-0000-0000-0000-000000000001' order by created_at desc nulls last, id desc limit 200) c),
  'parité RLS chantiers du client (première page) : admin A');
select is(public.gp_sous_traitant_missions_synthese('a0000000-0000-0000-0000-000000000001', 'a9900000-0000-0000-0000-000000000001'),
  (select jsonb_build_object('nb', count(*), 'nb_actives', count(*) filter (where statut in ('prevue','en_cours')), 'previsionnel_ht', coalesce(sum(montant_previsionnel_ht) filter (where statut is distinct from 'annulee'), 0))
   from public.sous_traitants_chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and fournisseur_id = 'a9900000-0000-0000-0000-000000000001'),
  'parité RLS missions sous-traitant : admin A');
select is((public.gp_chantier_documents_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 60)->>'total')::bigint,
  (select count(*) from public.documents_chantier where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
  'parité RLS nombre de documents (chantier assigné) : admin A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.gp_chantier_documents_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 60)->'lignes') with ordinality t(x, n)),
  (select array_agg(id order by created_at desc nulls last, id desc) from (select id, created_at from public.documents_chantier where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001' order by created_at desc nulls last, id desc limit 60) d),
  'parité RLS première page de documents (chantier assigné) : admin A');
select is((public.gp_chantier_documents_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002', 60)->>'total')::bigint,
  (select count(*) from public.documents_chantier where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000002'),
  'parité RLS nombre de documents (chantier non assigné) : admin A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.gp_chantier_documents_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002', 60)->'lignes') with ordinality t(x, n)),
  (select array_agg(id order by created_at desc nulls last, id desc) from (select id, created_at from public.documents_chantier where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000002' order by created_at desc nulls last, id desc limit 60) d),
  'parité RLS première page de documents (chantier non assigné) : admin A');
select is(
  (select jsonb_build_object('f', s->'factures'->'nb', 'ft', s->'factures'->'total_facture', 'fp', s->'factures'->'total_paye',
                             'd', s->'factures_fournisseurs'->'nb', 'dt', s->'factures_fournisseurs'->'total_ttc', 'dr', s->'factures_fournisseurs'->'total_regle',
                             'n', s->'notes_frais'->'nb', 'nv', s->'notes_frais'->'total_validees', 'nc', s->'notes_frais'->'total_en_cours')
   from (select public.chantier_synthese_chiffree('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001') s) x),
  (select jsonb_build_object(
     'f', (select count(*) from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'ft', (select coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0) from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'fp', (select coalesce(sum(montant_paye), 0) from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'd', (select count(*) from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'dt', (select coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0) from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'dr', (select coalesce(sum(montant_regle), 0) from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'n', (select count(*) from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'nv', (select coalesce(sum(montant_ttc) filter (where statut in ('valide','exporte_comptabilite','verrouille','archive','validee','remboursee')), 0) from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'nc', (select coalesce(sum(montant_ttc) filter (where statut not in ('valide','exporte_comptabilite','verrouille','archive','validee','remboursee') and statut not in ('refuse','refusee')), 0) from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'))),
  'parité RLS synthèse fiche chantier : admin A');
select case when public.peut_consulter_chantier('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001') then
  is((select jsonb_build_object('docs', jsonb_array_length(c->'documents'), 'articles', jsonb_array_length(c->'article_ids'), 'fiches', jsonb_array_length(c->'fiches_techniques')) from (select public.gp_doe_contenu('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001') c) x),
     jsonb_build_object(
       'docs', (select count(*) from public.documents_chantier where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
       'articles', (select count(distinct article_id) from public.mouvements_stock where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001' and type = 'sortie' and article_id is not null),
       'fiches', (select count(*) from public.fiches_techniques_articles where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and article_id in (select article_id from public.mouvements_stock where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001' and type = 'sortie'))),
     'parité RLS contenu DOE : admin A')
  else throws_ok($$select public.gp_doe_contenu('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001')$$, '42501', null, 'DOE refusé hors chantier visible : admin A') end;
select is(
  (select s - 'nb_anomalies' from (select public.paie_periode_synthese('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001') s) x),
  (select jsonb_build_object('nb', count(*), 'total_paniers', coalesce(sum(d.total_paniers), 0), 'total_trajets', coalesce(sum(d.total_trajets), 0),
     'total_transports', coalesce(sum(d.total_transports), 0), 'total_grands_deplacements', coalesce(sum(d.total_grands_deplacements), 0),
     'total_primes', coalesce(sum(d.total_primes), 0), 'total_acomptes', coalesce(sum(d.total_acomptes), 0), 'total_notes_frais', coalesce(sum(d.total_notes_frais), 0))
   from public.dossiers_paie_salaries d join public.employes e on e.id = d.employe_id where d.entreprise_id = 'a0000000-0000-0000-0000-000000000001' and d.periode_id = 'a9930000-0000-0000-0000-000000000001'),
  'parité RLS indicateurs de paie : admin A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.paie_periode_dossiers_page('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001', p_limite => 500)->'lignes') with ordinality t(x, n)),
  (select array_agg(d.id order by e.nom, e.prenom, d.id) from public.dossiers_paie_salaries d join public.employes e on e.id = d.employe_id where d.entreprise_id = 'a0000000-0000-0000-0000-000000000001' and d.periode_id = 'a9930000-0000-0000-0000-000000000001'),
  'parité RLS page de dossiers de paie : admin A');
select is(
  (select jsonb_build_object('d', (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(c->'dossiers') with ordinality t(x, n)),
                             'p', (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(c->'pieces') with ordinality t(x, n)))
   from (select public.paie_export_contenu('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001') c) z),
  jsonb_build_object('d', (select array_agg(id order by employe_id, id) from public.dossiers_paie_salaries where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and periode_id = 'a9930000-0000-0000-0000-000000000001'),
                     'p', (select array_agg(p.id order by p.id) from public.pieces_jointes_paie p where p.dossier_id in (select id from public.dossiers_paie_salaries where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and periode_id = 'a9930000-0000-0000-0000-000000000001'))),
  'parité RLS contenu d''export de paie (dossiers et pièces) : admin A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.paie_anomalies_page('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001', null, 2000)) with ordinality t(x, n)),
  (select array_agg(id order by niveau, created_at, id) from public.anomalies_paie where periode_id = 'a9930000-0000-0000-0000-000000000001' and corrigee_at is null),
  'parité RLS liste des anomalies de paie : admin A');
select is((public.paie_periode_synthese('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001')->>'nb_anomalies')::bigint,
  (select count(*) from public.anomalies_paie where periode_id = 'a9930000-0000-0000-0000-000000000001' and corrigee_at is null),
  'parité RLS anomalies de paie : admin A');
select is(
  (select jsonb_agg(jsonb_build_object('e', x->>'employe_id', 'nb', x->'nb', 't', x->'total', 'a', x->'a_verifier') order by x->>'employe_id') from jsonb_array_elements(public.notes_frais_synthese_employes('a0000000-0000-0000-0000-000000000001')) x),
  (select jsonb_agg(jsonb_build_object('e', employe_id::text, 'nb', nb, 't', total, 'a', av) order by employe_id::text) from
     (select employe_id, count(*) nb, coalesce(sum(montant_ttc), 0) total, count(*) filter (where statut in ('soumis','en_verification','correction_demandee')) av
      from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' group by employe_id) g),
  'parité RLS notes de frais par salarié : admin A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.notes_frais_page('a0000000-0000-0000-0000-000000000001', p_limite => 300)->'lignes') with ordinality t(x, n)),
  (select array_agg(id order by date_frais desc, id desc) from (select id, date_frais from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' order by date_frais desc, id desc limit 300) n),
  'parité RLS première page de notes de frais : admin A');
select is(public.gp_crm_synthese('a0000000-0000-0000-0000-000000000001'),
  (select jsonb_build_object('nb_a_relancer', count(*), 'reste_a_encaisser', coalesce(sum(montant_ttc - montant_paye), 0)) from public.factures
    where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut in ('envoyee','payee_partiel','en_retard') and montant_ttc > montant_paye)
  || jsonb_build_object('rappels_ouverts', (select count(*) from public.appels_contacts where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and not coalesce(termine, false) and a_rappeler_at is not null)),
  'parité RLS CRM : admin A');
select is(
  (select jsonb_build_object('s', s->'par_statut', 'a', s->'nb_actifs', 'r', s->'nb_en_retard') from (select public.gp_dashboard_chantiers('a0000000-0000-0000-0000-000000000001', current_date) s) x),
  jsonb_build_object(
    's', coalesce((select jsonb_agg(jsonb_build_object('statut', statut, 'nb', nb) order by statut) from (select statut, count(*) nb from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' group by statut) g), '[]'::jsonb),
    'a', (select count(*) from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut in ('accepte','a_preparer','en_attente_validation','en_commande_materiel','en_cours','en_pause')),
    'r', (select count(*) from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut in ('accepte','a_preparer','en_attente_validation','en_commande_materiel','en_cours','en_pause') and date_fin_prevue < current_date)),
  'parité RLS tableau de bord chantiers : admin A');
select is((public.gp_alertes_stock('a0000000-0000-0000-0000-000000000001')->>'nb')::bigint,
  (select count(*) from public.articles_stock where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and actif and quantite_stock <= seuil_alerte),
  'parité RLS alertes de stock : admin A');
select is(
  (select array_agg((x->>'id')::uuid order by x->>'id') from jsonb_array_elements(public.gp_options_chantiers('a0000000-0000-0000-0000-000000000001')) x),
  (select array_agg(id order by id::text) from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut not in ('archive','annule')),
  'parité RLS options chantiers : admin A');
select is(
  (select array_agg((x->>'id')::uuid order by x->>'id') from jsonb_array_elements(public.gp_options_employes('a0000000-0000-0000-0000-000000000001')) x),
  (select array_agg(id order by id::text) from public.employes where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut = 'actif'),
  'parité RLS options salariés : admin A');
select is(
  (select array_agg((x->>'id')::uuid order by x->>'id') from jsonb_array_elements(public.gp_options_clients('a0000000-0000-0000-0000-000000000001')) x),
  (select array_agg(id order by id::text) from public.clients where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
  'parité RLS options clients : admin A');
select is(public.gp_parc_synthese('a0000000-0000-0000-0000-000000000001', current_date),
  jsonb_build_object(
    'vehicules', (select jsonb_build_object('nb', count(*), 'alertes', count(*) filter (where controle_technique_echeance <= current_date or assurance_echeance <= current_date or prochain_entretien_date <= current_date)) from public.vehicules where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
    'outils', (select jsonb_build_object('nb', count(*), 'alertes', count(*) filter (where prochaine_verification <= current_date), 'hors_service', count(*) filter (where statut = 'hors_service')) from public.outils where entreprise_id = 'a0000000-0000-0000-0000-000000000001')),
  'parité RLS compteurs du parc : admin A');
select is(
  (select jsonb_build_object('v', p->'nb_vehicules', 'o', p->'nb_outils') from (select public.gp_alertes_parc('a0000000-0000-0000-0000-000000000001', current_date) p) x),
  jsonb_build_object(
    'v', (select count(*) from public.vehicules where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut in ('actif','maintenance') and (controle_technique_echeance <= current_date + 30 or assurance_echeance <= current_date + 30 or prochain_entretien_date <= current_date + 30 or (prochain_entretien_km is not null and kilometrage >= prochain_entretien_km))),
    'o', (select count(*) from public.outils where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut not in ('hors_service','perdu') and prochaine_verification <= current_date + 30)),
  'parité RLS alertes du parc : admin A');
select is(public.gp_effectif_actif('a0000000-0000-0000-0000-000000000001'), (select count(*) from public.employes where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut = 'actif'), 'parité RLS effectif actif : admin A');
select throws_ok($$select public.gp_client_synthese('b0000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001')$$, '42501', null, 'cross-tenant refusé (client B) : admin A');
select throws_ok($$select public.plateforme_postes_tarifs_entreprise('a0000000-0000-0000-0000-000000000001')$$, '42501', null, 'tarifs plateforme refusés à un membre de tenant : admin A');
select throws_ok($$select public.plateforme_applications_compteurs()$$, '42501', null, 'compteurs plateforme refusés à un membre de tenant : admin A');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true) is not null as profil;
select is(public.gp_depenses_synthese('a0000000-0000-0000-0000-000000000001', p_fournisseur_id => 'a9900000-0000-0000-0000-000000000001'),
  (select jsonb_build_object('nb', count(*), 'nb_actives', count(*) filter (where statut is distinct from 'annulee'),
     'total_ht', coalesce(sum(montant_ht) filter (where statut is distinct from 'annulee'), 0),
     'total_ttc', coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0), 'total_regle', coalesce(sum(montant_regle), 0))
   from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and fournisseur_id = 'a9900000-0000-0000-0000-000000000001'),
  'parité RLS dépenses sous-traitant : ouvrier A');
select is(public.gp_depenses_synthese('a0000000-0000-0000-0000-000000000001', p_vehicule_id => 'a9910000-0000-0000-0000-000000000001'),
  (select jsonb_build_object('nb', count(*), 'nb_actives', count(*) filter (where statut is distinct from 'annulee'),
     'total_ht', coalesce(sum(montant_ht) filter (where statut is distinct from 'annulee'), 0),
     'total_ttc', coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0), 'total_regle', coalesce(sum(montant_regle), 0))
   from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and vehicule_id = 'a9910000-0000-0000-0000-000000000001'),
  'parité RLS dépenses véhicule : ouvrier A');
select is(public.gp_depenses_synthese('a0000000-0000-0000-0000-000000000001', p_outil_id => 'a9920000-0000-0000-0000-000000000001'),
  (select jsonb_build_object('nb', count(*), 'nb_actives', count(*) filter (where statut is distinct from 'annulee'),
     'total_ht', coalesce(sum(montant_ht) filter (where statut is distinct from 'annulee'), 0),
     'total_ttc', coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0), 'total_regle', coalesce(sum(montant_regle), 0))
   from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and outil_id = 'a9920000-0000-0000-0000-000000000001'),
  'parité RLS dépenses outil : ouvrier A');
select is(public.gp_client_synthese('a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001'),
  jsonb_build_object(
    'factures', (select jsonb_build_object('nb', count(*), 'total_facture', coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0), 'total_paye', coalesce(sum(montant_paye), 0)) from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and client_id = 'a3000000-0000-0000-0000-000000000001'),
    'devis', (select jsonb_build_object('nb', count(*)) from public.devis where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and client_id = 'a3000000-0000-0000-0000-000000000001')),
  'parité RLS fiche client : ouvrier A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.gp_client_chantiers_page('a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 200)->'lignes') with ordinality t(x, n)),
  (select array_agg(id order by created_at desc nulls last, id desc) from (select id, created_at from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and client_id = 'a3000000-0000-0000-0000-000000000001' order by created_at desc nulls last, id desc limit 200) c),
  'parité RLS chantiers du client (première page) : ouvrier A');
select is(public.gp_sous_traitant_missions_synthese('a0000000-0000-0000-0000-000000000001', 'a9900000-0000-0000-0000-000000000001'),
  (select jsonb_build_object('nb', count(*), 'nb_actives', count(*) filter (where statut in ('prevue','en_cours')), 'previsionnel_ht', coalesce(sum(montant_previsionnel_ht) filter (where statut is distinct from 'annulee'), 0))
   from public.sous_traitants_chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and fournisseur_id = 'a9900000-0000-0000-0000-000000000001'),
  'parité RLS missions sous-traitant : ouvrier A');
select is((public.gp_chantier_documents_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 60)->>'total')::bigint,
  (select count(*) from public.documents_chantier where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
  'parité RLS nombre de documents (chantier assigné) : ouvrier A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.gp_chantier_documents_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 60)->'lignes') with ordinality t(x, n)),
  (select array_agg(id order by created_at desc nulls last, id desc) from (select id, created_at from public.documents_chantier where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001' order by created_at desc nulls last, id desc limit 60) d),
  'parité RLS première page de documents (chantier assigné) : ouvrier A');
select is((public.gp_chantier_documents_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002', 60)->>'total')::bigint,
  (select count(*) from public.documents_chantier where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000002'),
  'parité RLS nombre de documents (chantier non assigné) : ouvrier A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.gp_chantier_documents_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002', 60)->'lignes') with ordinality t(x, n)),
  (select array_agg(id order by created_at desc nulls last, id desc) from (select id, created_at from public.documents_chantier where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000002' order by created_at desc nulls last, id desc limit 60) d),
  'parité RLS première page de documents (chantier non assigné) : ouvrier A');
select is(
  (select jsonb_build_object('f', s->'factures'->'nb', 'ft', s->'factures'->'total_facture', 'fp', s->'factures'->'total_paye',
                             'd', s->'factures_fournisseurs'->'nb', 'dt', s->'factures_fournisseurs'->'total_ttc', 'dr', s->'factures_fournisseurs'->'total_regle',
                             'n', s->'notes_frais'->'nb', 'nv', s->'notes_frais'->'total_validees', 'nc', s->'notes_frais'->'total_en_cours')
   from (select public.chantier_synthese_chiffree('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001') s) x),
  (select jsonb_build_object(
     'f', (select count(*) from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'ft', (select coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0) from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'fp', (select coalesce(sum(montant_paye), 0) from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'd', (select count(*) from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'dt', (select coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0) from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'dr', (select coalesce(sum(montant_regle), 0) from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'n', (select count(*) from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'nv', (select coalesce(sum(montant_ttc) filter (where statut in ('valide','exporte_comptabilite','verrouille','archive','validee','remboursee')), 0) from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'nc', (select coalesce(sum(montant_ttc) filter (where statut not in ('valide','exporte_comptabilite','verrouille','archive','validee','remboursee') and statut not in ('refuse','refusee')), 0) from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'))),
  'parité RLS synthèse fiche chantier : ouvrier A');
select case when public.peut_consulter_chantier('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001') then
  is((select jsonb_build_object('docs', jsonb_array_length(c->'documents'), 'articles', jsonb_array_length(c->'article_ids'), 'fiches', jsonb_array_length(c->'fiches_techniques')) from (select public.gp_doe_contenu('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001') c) x),
     jsonb_build_object(
       'docs', (select count(*) from public.documents_chantier where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
       'articles', (select count(distinct article_id) from public.mouvements_stock where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001' and type = 'sortie' and article_id is not null),
       'fiches', (select count(*) from public.fiches_techniques_articles where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and article_id in (select article_id from public.mouvements_stock where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001' and type = 'sortie'))),
     'parité RLS contenu DOE : ouvrier A')
  else throws_ok($$select public.gp_doe_contenu('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001')$$, '42501', null, 'DOE refusé hors chantier visible : ouvrier A') end;
select is(
  (select s - 'nb_anomalies' from (select public.paie_periode_synthese('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001') s) x),
  (select jsonb_build_object('nb', count(*), 'total_paniers', coalesce(sum(d.total_paniers), 0), 'total_trajets', coalesce(sum(d.total_trajets), 0),
     'total_transports', coalesce(sum(d.total_transports), 0), 'total_grands_deplacements', coalesce(sum(d.total_grands_deplacements), 0),
     'total_primes', coalesce(sum(d.total_primes), 0), 'total_acomptes', coalesce(sum(d.total_acomptes), 0), 'total_notes_frais', coalesce(sum(d.total_notes_frais), 0))
   from public.dossiers_paie_salaries d join public.employes e on e.id = d.employe_id where d.entreprise_id = 'a0000000-0000-0000-0000-000000000001' and d.periode_id = 'a9930000-0000-0000-0000-000000000001'),
  'parité RLS indicateurs de paie : ouvrier A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.paie_periode_dossiers_page('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001', p_limite => 500)->'lignes') with ordinality t(x, n)),
  (select array_agg(d.id order by e.nom, e.prenom, d.id) from public.dossiers_paie_salaries d join public.employes e on e.id = d.employe_id where d.entreprise_id = 'a0000000-0000-0000-0000-000000000001' and d.periode_id = 'a9930000-0000-0000-0000-000000000001'),
  'parité RLS page de dossiers de paie : ouvrier A');
select is(
  (select jsonb_build_object('d', (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(c->'dossiers') with ordinality t(x, n)),
                             'p', (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(c->'pieces') with ordinality t(x, n)))
   from (select public.paie_export_contenu('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001') c) z),
  jsonb_build_object('d', (select array_agg(id order by employe_id, id) from public.dossiers_paie_salaries where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and periode_id = 'a9930000-0000-0000-0000-000000000001'),
                     'p', (select array_agg(p.id order by p.id) from public.pieces_jointes_paie p where p.dossier_id in (select id from public.dossiers_paie_salaries where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and periode_id = 'a9930000-0000-0000-0000-000000000001'))),
  'parité RLS contenu d''export de paie (dossiers et pièces) : ouvrier A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.paie_anomalies_page('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001', null, 2000)) with ordinality t(x, n)),
  (select array_agg(id order by niveau, created_at, id) from public.anomalies_paie where periode_id = 'a9930000-0000-0000-0000-000000000001' and corrigee_at is null),
  'parité RLS liste des anomalies de paie : ouvrier A');
select is((public.paie_periode_synthese('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001')->>'nb_anomalies')::bigint,
  (select count(*) from public.anomalies_paie where periode_id = 'a9930000-0000-0000-0000-000000000001' and corrigee_at is null),
  'parité RLS anomalies de paie : ouvrier A');
select is(
  (select jsonb_agg(jsonb_build_object('e', x->>'employe_id', 'nb', x->'nb', 't', x->'total', 'a', x->'a_verifier') order by x->>'employe_id') from jsonb_array_elements(public.notes_frais_synthese_employes('a0000000-0000-0000-0000-000000000001')) x),
  (select jsonb_agg(jsonb_build_object('e', employe_id::text, 'nb', nb, 't', total, 'a', av) order by employe_id::text) from
     (select employe_id, count(*) nb, coalesce(sum(montant_ttc), 0) total, count(*) filter (where statut in ('soumis','en_verification','correction_demandee')) av
      from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' group by employe_id) g),
  'parité RLS notes de frais par salarié : ouvrier A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.notes_frais_page('a0000000-0000-0000-0000-000000000001', p_limite => 300)->'lignes') with ordinality t(x, n)),
  (select array_agg(id order by date_frais desc, id desc) from (select id, date_frais from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' order by date_frais desc, id desc limit 300) n),
  'parité RLS première page de notes de frais : ouvrier A');
select is(public.gp_crm_synthese('a0000000-0000-0000-0000-000000000001'),
  (select jsonb_build_object('nb_a_relancer', count(*), 'reste_a_encaisser', coalesce(sum(montant_ttc - montant_paye), 0)) from public.factures
    where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut in ('envoyee','payee_partiel','en_retard') and montant_ttc > montant_paye)
  || jsonb_build_object('rappels_ouverts', (select count(*) from public.appels_contacts where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and not coalesce(termine, false) and a_rappeler_at is not null)),
  'parité RLS CRM : ouvrier A');
select is(
  (select jsonb_build_object('s', s->'par_statut', 'a', s->'nb_actifs', 'r', s->'nb_en_retard') from (select public.gp_dashboard_chantiers('a0000000-0000-0000-0000-000000000001', current_date) s) x),
  jsonb_build_object(
    's', coalesce((select jsonb_agg(jsonb_build_object('statut', statut, 'nb', nb) order by statut) from (select statut, count(*) nb from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' group by statut) g), '[]'::jsonb),
    'a', (select count(*) from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut in ('accepte','a_preparer','en_attente_validation','en_commande_materiel','en_cours','en_pause')),
    'r', (select count(*) from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut in ('accepte','a_preparer','en_attente_validation','en_commande_materiel','en_cours','en_pause') and date_fin_prevue < current_date)),
  'parité RLS tableau de bord chantiers : ouvrier A');
select is((public.gp_alertes_stock('a0000000-0000-0000-0000-000000000001')->>'nb')::bigint,
  (select count(*) from public.articles_stock where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and actif and quantite_stock <= seuil_alerte),
  'parité RLS alertes de stock : ouvrier A');
select is(
  (select array_agg((x->>'id')::uuid order by x->>'id') from jsonb_array_elements(public.gp_options_chantiers('a0000000-0000-0000-0000-000000000001')) x),
  (select array_agg(id order by id::text) from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut not in ('archive','annule')),
  'parité RLS options chantiers : ouvrier A');
select is(
  (select array_agg((x->>'id')::uuid order by x->>'id') from jsonb_array_elements(public.gp_options_employes('a0000000-0000-0000-0000-000000000001')) x),
  (select array_agg(id order by id::text) from public.employes where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut = 'actif'),
  'parité RLS options salariés : ouvrier A');
select is(
  (select array_agg((x->>'id')::uuid order by x->>'id') from jsonb_array_elements(public.gp_options_clients('a0000000-0000-0000-0000-000000000001')) x),
  (select array_agg(id order by id::text) from public.clients where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
  'parité RLS options clients : ouvrier A');
select is(public.gp_parc_synthese('a0000000-0000-0000-0000-000000000001', current_date),
  jsonb_build_object(
    'vehicules', (select jsonb_build_object('nb', count(*), 'alertes', count(*) filter (where controle_technique_echeance <= current_date or assurance_echeance <= current_date or prochain_entretien_date <= current_date)) from public.vehicules where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
    'outils', (select jsonb_build_object('nb', count(*), 'alertes', count(*) filter (where prochaine_verification <= current_date), 'hors_service', count(*) filter (where statut = 'hors_service')) from public.outils where entreprise_id = 'a0000000-0000-0000-0000-000000000001')),
  'parité RLS compteurs du parc : ouvrier A');
select is(
  (select jsonb_build_object('v', p->'nb_vehicules', 'o', p->'nb_outils') from (select public.gp_alertes_parc('a0000000-0000-0000-0000-000000000001', current_date) p) x),
  jsonb_build_object(
    'v', (select count(*) from public.vehicules where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut in ('actif','maintenance') and (controle_technique_echeance <= current_date + 30 or assurance_echeance <= current_date + 30 or prochain_entretien_date <= current_date + 30 or (prochain_entretien_km is not null and kilometrage >= prochain_entretien_km))),
    'o', (select count(*) from public.outils where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut not in ('hors_service','perdu') and prochaine_verification <= current_date + 30)),
  'parité RLS alertes du parc : ouvrier A');
select is(public.gp_effectif_actif('a0000000-0000-0000-0000-000000000001'), (select count(*) from public.employes where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut = 'actif'), 'parité RLS effectif actif : ouvrier A');
select throws_ok($$select public.gp_client_synthese('b0000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001')$$, '42501', null, 'cross-tenant refusé (client B) : ouvrier A');
select throws_ok($$select public.plateforme_postes_tarifs_entreprise('a0000000-0000-0000-0000-000000000001')$$, '42501', null, 'tarifs plateforme refusés à un membre de tenant : ouvrier A');
select throws_ok($$select public.plateforme_applications_compteurs()$$, '42501', null, 'compteurs plateforme refusés à un membre de tenant : ouvrier A');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', true) is not null as profil;
select is(public.gp_depenses_synthese('a0000000-0000-0000-0000-000000000001', p_fournisseur_id => 'a9900000-0000-0000-0000-000000000001'),
  (select jsonb_build_object('nb', count(*), 'nb_actives', count(*) filter (where statut is distinct from 'annulee'),
     'total_ht', coalesce(sum(montant_ht) filter (where statut is distinct from 'annulee'), 0),
     'total_ttc', coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0), 'total_regle', coalesce(sum(montant_regle), 0))
   from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and fournisseur_id = 'a9900000-0000-0000-0000-000000000001'),
  'parité RLS dépenses sous-traitant : chef d''équipe A');
select is(public.gp_depenses_synthese('a0000000-0000-0000-0000-000000000001', p_vehicule_id => 'a9910000-0000-0000-0000-000000000001'),
  (select jsonb_build_object('nb', count(*), 'nb_actives', count(*) filter (where statut is distinct from 'annulee'),
     'total_ht', coalesce(sum(montant_ht) filter (where statut is distinct from 'annulee'), 0),
     'total_ttc', coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0), 'total_regle', coalesce(sum(montant_regle), 0))
   from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and vehicule_id = 'a9910000-0000-0000-0000-000000000001'),
  'parité RLS dépenses véhicule : chef d''équipe A');
select is(public.gp_depenses_synthese('a0000000-0000-0000-0000-000000000001', p_outil_id => 'a9920000-0000-0000-0000-000000000001'),
  (select jsonb_build_object('nb', count(*), 'nb_actives', count(*) filter (where statut is distinct from 'annulee'),
     'total_ht', coalesce(sum(montant_ht) filter (where statut is distinct from 'annulee'), 0),
     'total_ttc', coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0), 'total_regle', coalesce(sum(montant_regle), 0))
   from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and outil_id = 'a9920000-0000-0000-0000-000000000001'),
  'parité RLS dépenses outil : chef d''équipe A');
select is(public.gp_client_synthese('a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001'),
  jsonb_build_object(
    'factures', (select jsonb_build_object('nb', count(*), 'total_facture', coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0), 'total_paye', coalesce(sum(montant_paye), 0)) from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and client_id = 'a3000000-0000-0000-0000-000000000001'),
    'devis', (select jsonb_build_object('nb', count(*)) from public.devis where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and client_id = 'a3000000-0000-0000-0000-000000000001')),
  'parité RLS fiche client : chef d''équipe A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.gp_client_chantiers_page('a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 200)->'lignes') with ordinality t(x, n)),
  (select array_agg(id order by created_at desc nulls last, id desc) from (select id, created_at from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and client_id = 'a3000000-0000-0000-0000-000000000001' order by created_at desc nulls last, id desc limit 200) c),
  'parité RLS chantiers du client (première page) : chef d''équipe A');
select is(public.gp_sous_traitant_missions_synthese('a0000000-0000-0000-0000-000000000001', 'a9900000-0000-0000-0000-000000000001'),
  (select jsonb_build_object('nb', count(*), 'nb_actives', count(*) filter (where statut in ('prevue','en_cours')), 'previsionnel_ht', coalesce(sum(montant_previsionnel_ht) filter (where statut is distinct from 'annulee'), 0))
   from public.sous_traitants_chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and fournisseur_id = 'a9900000-0000-0000-0000-000000000001'),
  'parité RLS missions sous-traitant : chef d''équipe A');
select is((public.gp_chantier_documents_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 60)->>'total')::bigint,
  (select count(*) from public.documents_chantier where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
  'parité RLS nombre de documents (chantier assigné) : chef d''équipe A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.gp_chantier_documents_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 60)->'lignes') with ordinality t(x, n)),
  (select array_agg(id order by created_at desc nulls last, id desc) from (select id, created_at from public.documents_chantier where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001' order by created_at desc nulls last, id desc limit 60) d),
  'parité RLS première page de documents (chantier assigné) : chef d''équipe A');
select is((public.gp_chantier_documents_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002', 60)->>'total')::bigint,
  (select count(*) from public.documents_chantier where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000002'),
  'parité RLS nombre de documents (chantier non assigné) : chef d''équipe A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.gp_chantier_documents_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002', 60)->'lignes') with ordinality t(x, n)),
  (select array_agg(id order by created_at desc nulls last, id desc) from (select id, created_at from public.documents_chantier where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000002' order by created_at desc nulls last, id desc limit 60) d),
  'parité RLS première page de documents (chantier non assigné) : chef d''équipe A');
select is(
  (select jsonb_build_object('f', s->'factures'->'nb', 'ft', s->'factures'->'total_facture', 'fp', s->'factures'->'total_paye',
                             'd', s->'factures_fournisseurs'->'nb', 'dt', s->'factures_fournisseurs'->'total_ttc', 'dr', s->'factures_fournisseurs'->'total_regle',
                             'n', s->'notes_frais'->'nb', 'nv', s->'notes_frais'->'total_validees', 'nc', s->'notes_frais'->'total_en_cours')
   from (select public.chantier_synthese_chiffree('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001') s) x),
  (select jsonb_build_object(
     'f', (select count(*) from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'ft', (select coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0) from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'fp', (select coalesce(sum(montant_paye), 0) from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'd', (select count(*) from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'dt', (select coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0) from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'dr', (select coalesce(sum(montant_regle), 0) from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'n', (select count(*) from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'nv', (select coalesce(sum(montant_ttc) filter (where statut in ('valide','exporte_comptabilite','verrouille','archive','validee','remboursee')), 0) from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'nc', (select coalesce(sum(montant_ttc) filter (where statut not in ('valide','exporte_comptabilite','verrouille','archive','validee','remboursee') and statut not in ('refuse','refusee')), 0) from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'))),
  'parité RLS synthèse fiche chantier : chef d''équipe A');
select case when public.peut_consulter_chantier('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001') then
  is((select jsonb_build_object('docs', jsonb_array_length(c->'documents'), 'articles', jsonb_array_length(c->'article_ids'), 'fiches', jsonb_array_length(c->'fiches_techniques')) from (select public.gp_doe_contenu('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001') c) x),
     jsonb_build_object(
       'docs', (select count(*) from public.documents_chantier where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
       'articles', (select count(distinct article_id) from public.mouvements_stock where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001' and type = 'sortie' and article_id is not null),
       'fiches', (select count(*) from public.fiches_techniques_articles where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and article_id in (select article_id from public.mouvements_stock where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001' and type = 'sortie'))),
     'parité RLS contenu DOE : chef d''équipe A')
  else throws_ok($$select public.gp_doe_contenu('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001')$$, '42501', null, 'DOE refusé hors chantier visible : chef d''équipe A') end;
select is(
  (select s - 'nb_anomalies' from (select public.paie_periode_synthese('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001') s) x),
  (select jsonb_build_object('nb', count(*), 'total_paniers', coalesce(sum(d.total_paniers), 0), 'total_trajets', coalesce(sum(d.total_trajets), 0),
     'total_transports', coalesce(sum(d.total_transports), 0), 'total_grands_deplacements', coalesce(sum(d.total_grands_deplacements), 0),
     'total_primes', coalesce(sum(d.total_primes), 0), 'total_acomptes', coalesce(sum(d.total_acomptes), 0), 'total_notes_frais', coalesce(sum(d.total_notes_frais), 0))
   from public.dossiers_paie_salaries d join public.employes e on e.id = d.employe_id where d.entreprise_id = 'a0000000-0000-0000-0000-000000000001' and d.periode_id = 'a9930000-0000-0000-0000-000000000001'),
  'parité RLS indicateurs de paie : chef d''équipe A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.paie_periode_dossiers_page('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001', p_limite => 500)->'lignes') with ordinality t(x, n)),
  (select array_agg(d.id order by e.nom, e.prenom, d.id) from public.dossiers_paie_salaries d join public.employes e on e.id = d.employe_id where d.entreprise_id = 'a0000000-0000-0000-0000-000000000001' and d.periode_id = 'a9930000-0000-0000-0000-000000000001'),
  'parité RLS page de dossiers de paie : chef d''équipe A');
select is(
  (select jsonb_build_object('d', (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(c->'dossiers') with ordinality t(x, n)),
                             'p', (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(c->'pieces') with ordinality t(x, n)))
   from (select public.paie_export_contenu('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001') c) z),
  jsonb_build_object('d', (select array_agg(id order by employe_id, id) from public.dossiers_paie_salaries where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and periode_id = 'a9930000-0000-0000-0000-000000000001'),
                     'p', (select array_agg(p.id order by p.id) from public.pieces_jointes_paie p where p.dossier_id in (select id from public.dossiers_paie_salaries where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and periode_id = 'a9930000-0000-0000-0000-000000000001'))),
  'parité RLS contenu d''export de paie (dossiers et pièces) : chef d''équipe A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.paie_anomalies_page('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001', null, 2000)) with ordinality t(x, n)),
  (select array_agg(id order by niveau, created_at, id) from public.anomalies_paie where periode_id = 'a9930000-0000-0000-0000-000000000001' and corrigee_at is null),
  'parité RLS liste des anomalies de paie : chef d''équipe A');
select is((public.paie_periode_synthese('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001')->>'nb_anomalies')::bigint,
  (select count(*) from public.anomalies_paie where periode_id = 'a9930000-0000-0000-0000-000000000001' and corrigee_at is null),
  'parité RLS anomalies de paie : chef d''équipe A');
select is(
  (select jsonb_agg(jsonb_build_object('e', x->>'employe_id', 'nb', x->'nb', 't', x->'total', 'a', x->'a_verifier') order by x->>'employe_id') from jsonb_array_elements(public.notes_frais_synthese_employes('a0000000-0000-0000-0000-000000000001')) x),
  (select jsonb_agg(jsonb_build_object('e', employe_id::text, 'nb', nb, 't', total, 'a', av) order by employe_id::text) from
     (select employe_id, count(*) nb, coalesce(sum(montant_ttc), 0) total, count(*) filter (where statut in ('soumis','en_verification','correction_demandee')) av
      from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' group by employe_id) g),
  'parité RLS notes de frais par salarié : chef d''équipe A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.notes_frais_page('a0000000-0000-0000-0000-000000000001', p_limite => 300)->'lignes') with ordinality t(x, n)),
  (select array_agg(id order by date_frais desc, id desc) from (select id, date_frais from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' order by date_frais desc, id desc limit 300) n),
  'parité RLS première page de notes de frais : chef d''équipe A');
select is(public.gp_crm_synthese('a0000000-0000-0000-0000-000000000001'),
  (select jsonb_build_object('nb_a_relancer', count(*), 'reste_a_encaisser', coalesce(sum(montant_ttc - montant_paye), 0)) from public.factures
    where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut in ('envoyee','payee_partiel','en_retard') and montant_ttc > montant_paye)
  || jsonb_build_object('rappels_ouverts', (select count(*) from public.appels_contacts where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and not coalesce(termine, false) and a_rappeler_at is not null)),
  'parité RLS CRM : chef d''équipe A');
select is(
  (select jsonb_build_object('s', s->'par_statut', 'a', s->'nb_actifs', 'r', s->'nb_en_retard') from (select public.gp_dashboard_chantiers('a0000000-0000-0000-0000-000000000001', current_date) s) x),
  jsonb_build_object(
    's', coalesce((select jsonb_agg(jsonb_build_object('statut', statut, 'nb', nb) order by statut) from (select statut, count(*) nb from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' group by statut) g), '[]'::jsonb),
    'a', (select count(*) from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut in ('accepte','a_preparer','en_attente_validation','en_commande_materiel','en_cours','en_pause')),
    'r', (select count(*) from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut in ('accepte','a_preparer','en_attente_validation','en_commande_materiel','en_cours','en_pause') and date_fin_prevue < current_date)),
  'parité RLS tableau de bord chantiers : chef d''équipe A');
select is((public.gp_alertes_stock('a0000000-0000-0000-0000-000000000001')->>'nb')::bigint,
  (select count(*) from public.articles_stock where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and actif and quantite_stock <= seuil_alerte),
  'parité RLS alertes de stock : chef d''équipe A');
select is(
  (select array_agg((x->>'id')::uuid order by x->>'id') from jsonb_array_elements(public.gp_options_chantiers('a0000000-0000-0000-0000-000000000001')) x),
  (select array_agg(id order by id::text) from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut not in ('archive','annule')),
  'parité RLS options chantiers : chef d''équipe A');
select is(
  (select array_agg((x->>'id')::uuid order by x->>'id') from jsonb_array_elements(public.gp_options_employes('a0000000-0000-0000-0000-000000000001')) x),
  (select array_agg(id order by id::text) from public.employes where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut = 'actif'),
  'parité RLS options salariés : chef d''équipe A');
select is(
  (select array_agg((x->>'id')::uuid order by x->>'id') from jsonb_array_elements(public.gp_options_clients('a0000000-0000-0000-0000-000000000001')) x),
  (select array_agg(id order by id::text) from public.clients where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
  'parité RLS options clients : chef d''équipe A');
select is(public.gp_parc_synthese('a0000000-0000-0000-0000-000000000001', current_date),
  jsonb_build_object(
    'vehicules', (select jsonb_build_object('nb', count(*), 'alertes', count(*) filter (where controle_technique_echeance <= current_date or assurance_echeance <= current_date or prochain_entretien_date <= current_date)) from public.vehicules where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
    'outils', (select jsonb_build_object('nb', count(*), 'alertes', count(*) filter (where prochaine_verification <= current_date), 'hors_service', count(*) filter (where statut = 'hors_service')) from public.outils where entreprise_id = 'a0000000-0000-0000-0000-000000000001')),
  'parité RLS compteurs du parc : chef d''équipe A');
select is(
  (select jsonb_build_object('v', p->'nb_vehicules', 'o', p->'nb_outils') from (select public.gp_alertes_parc('a0000000-0000-0000-0000-000000000001', current_date) p) x),
  jsonb_build_object(
    'v', (select count(*) from public.vehicules where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut in ('actif','maintenance') and (controle_technique_echeance <= current_date + 30 or assurance_echeance <= current_date + 30 or prochain_entretien_date <= current_date + 30 or (prochain_entretien_km is not null and kilometrage >= prochain_entretien_km))),
    'o', (select count(*) from public.outils where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut not in ('hors_service','perdu') and prochaine_verification <= current_date + 30)),
  'parité RLS alertes du parc : chef d''équipe A');
select is(public.gp_effectif_actif('a0000000-0000-0000-0000-000000000001'), (select count(*) from public.employes where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut = 'actif'), 'parité RLS effectif actif : chef d''équipe A');
select throws_ok($$select public.gp_client_synthese('b0000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001')$$, '42501', null, 'cross-tenant refusé (client B) : chef d''équipe A');
select throws_ok($$select public.plateforme_postes_tarifs_entreprise('a0000000-0000-0000-0000-000000000001')$$, '42501', null, 'tarifs plateforme refusés à un membre de tenant : chef d''équipe A');
select throws_ok($$select public.plateforme_applications_compteurs()$$, '42501', null, 'compteurs plateforme refusés à un membre de tenant : chef d''équipe A');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}', true) is not null as profil;
select is(public.gp_depenses_synthese('a0000000-0000-0000-0000-000000000001', p_fournisseur_id => 'a9900000-0000-0000-0000-000000000001'),
  (select jsonb_build_object('nb', count(*), 'nb_actives', count(*) filter (where statut is distinct from 'annulee'),
     'total_ht', coalesce(sum(montant_ht) filter (where statut is distinct from 'annulee'), 0),
     'total_ttc', coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0), 'total_regle', coalesce(sum(montant_regle), 0))
   from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and fournisseur_id = 'a9900000-0000-0000-0000-000000000001'),
  'parité RLS dépenses sous-traitant : conducteur A');
select is(public.gp_depenses_synthese('a0000000-0000-0000-0000-000000000001', p_vehicule_id => 'a9910000-0000-0000-0000-000000000001'),
  (select jsonb_build_object('nb', count(*), 'nb_actives', count(*) filter (where statut is distinct from 'annulee'),
     'total_ht', coalesce(sum(montant_ht) filter (where statut is distinct from 'annulee'), 0),
     'total_ttc', coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0), 'total_regle', coalesce(sum(montant_regle), 0))
   from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and vehicule_id = 'a9910000-0000-0000-0000-000000000001'),
  'parité RLS dépenses véhicule : conducteur A');
select is(public.gp_depenses_synthese('a0000000-0000-0000-0000-000000000001', p_outil_id => 'a9920000-0000-0000-0000-000000000001'),
  (select jsonb_build_object('nb', count(*), 'nb_actives', count(*) filter (where statut is distinct from 'annulee'),
     'total_ht', coalesce(sum(montant_ht) filter (where statut is distinct from 'annulee'), 0),
     'total_ttc', coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0), 'total_regle', coalesce(sum(montant_regle), 0))
   from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and outil_id = 'a9920000-0000-0000-0000-000000000001'),
  'parité RLS dépenses outil : conducteur A');
select is(public.gp_client_synthese('a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001'),
  jsonb_build_object(
    'factures', (select jsonb_build_object('nb', count(*), 'total_facture', coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0), 'total_paye', coalesce(sum(montant_paye), 0)) from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and client_id = 'a3000000-0000-0000-0000-000000000001'),
    'devis', (select jsonb_build_object('nb', count(*)) from public.devis where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and client_id = 'a3000000-0000-0000-0000-000000000001')),
  'parité RLS fiche client : conducteur A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.gp_client_chantiers_page('a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 200)->'lignes') with ordinality t(x, n)),
  (select array_agg(id order by created_at desc nulls last, id desc) from (select id, created_at from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and client_id = 'a3000000-0000-0000-0000-000000000001' order by created_at desc nulls last, id desc limit 200) c),
  'parité RLS chantiers du client (première page) : conducteur A');
select is(public.gp_sous_traitant_missions_synthese('a0000000-0000-0000-0000-000000000001', 'a9900000-0000-0000-0000-000000000001'),
  (select jsonb_build_object('nb', count(*), 'nb_actives', count(*) filter (where statut in ('prevue','en_cours')), 'previsionnel_ht', coalesce(sum(montant_previsionnel_ht) filter (where statut is distinct from 'annulee'), 0))
   from public.sous_traitants_chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and fournisseur_id = 'a9900000-0000-0000-0000-000000000001'),
  'parité RLS missions sous-traitant : conducteur A');
select is((public.gp_chantier_documents_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 60)->>'total')::bigint,
  (select count(*) from public.documents_chantier where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
  'parité RLS nombre de documents (chantier assigné) : conducteur A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.gp_chantier_documents_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 60)->'lignes') with ordinality t(x, n)),
  (select array_agg(id order by created_at desc nulls last, id desc) from (select id, created_at from public.documents_chantier where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001' order by created_at desc nulls last, id desc limit 60) d),
  'parité RLS première page de documents (chantier assigné) : conducteur A');
select is((public.gp_chantier_documents_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002', 60)->>'total')::bigint,
  (select count(*) from public.documents_chantier where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000002'),
  'parité RLS nombre de documents (chantier non assigné) : conducteur A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.gp_chantier_documents_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002', 60)->'lignes') with ordinality t(x, n)),
  (select array_agg(id order by created_at desc nulls last, id desc) from (select id, created_at from public.documents_chantier where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000002' order by created_at desc nulls last, id desc limit 60) d),
  'parité RLS première page de documents (chantier non assigné) : conducteur A');
select is(
  (select jsonb_build_object('f', s->'factures'->'nb', 'ft', s->'factures'->'total_facture', 'fp', s->'factures'->'total_paye',
                             'd', s->'factures_fournisseurs'->'nb', 'dt', s->'factures_fournisseurs'->'total_ttc', 'dr', s->'factures_fournisseurs'->'total_regle',
                             'n', s->'notes_frais'->'nb', 'nv', s->'notes_frais'->'total_validees', 'nc', s->'notes_frais'->'total_en_cours')
   from (select public.chantier_synthese_chiffree('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001') s) x),
  (select jsonb_build_object(
     'f', (select count(*) from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'ft', (select coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0) from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'fp', (select coalesce(sum(montant_paye), 0) from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'd', (select count(*) from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'dt', (select coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0) from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'dr', (select coalesce(sum(montant_regle), 0) from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'n', (select count(*) from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'nv', (select coalesce(sum(montant_ttc) filter (where statut in ('valide','exporte_comptabilite','verrouille','archive','validee','remboursee')), 0) from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'nc', (select coalesce(sum(montant_ttc) filter (where statut not in ('valide','exporte_comptabilite','verrouille','archive','validee','remboursee') and statut not in ('refuse','refusee')), 0) from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'))),
  'parité RLS synthèse fiche chantier : conducteur A');
select case when public.peut_consulter_chantier('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001') then
  is((select jsonb_build_object('docs', jsonb_array_length(c->'documents'), 'articles', jsonb_array_length(c->'article_ids'), 'fiches', jsonb_array_length(c->'fiches_techniques')) from (select public.gp_doe_contenu('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001') c) x),
     jsonb_build_object(
       'docs', (select count(*) from public.documents_chantier where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
       'articles', (select count(distinct article_id) from public.mouvements_stock where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001' and type = 'sortie' and article_id is not null),
       'fiches', (select count(*) from public.fiches_techniques_articles where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and article_id in (select article_id from public.mouvements_stock where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001' and type = 'sortie'))),
     'parité RLS contenu DOE : conducteur A')
  else throws_ok($$select public.gp_doe_contenu('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001')$$, '42501', null, 'DOE refusé hors chantier visible : conducteur A') end;
select is(
  (select s - 'nb_anomalies' from (select public.paie_periode_synthese('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001') s) x),
  (select jsonb_build_object('nb', count(*), 'total_paniers', coalesce(sum(d.total_paniers), 0), 'total_trajets', coalesce(sum(d.total_trajets), 0),
     'total_transports', coalesce(sum(d.total_transports), 0), 'total_grands_deplacements', coalesce(sum(d.total_grands_deplacements), 0),
     'total_primes', coalesce(sum(d.total_primes), 0), 'total_acomptes', coalesce(sum(d.total_acomptes), 0), 'total_notes_frais', coalesce(sum(d.total_notes_frais), 0))
   from public.dossiers_paie_salaries d join public.employes e on e.id = d.employe_id where d.entreprise_id = 'a0000000-0000-0000-0000-000000000001' and d.periode_id = 'a9930000-0000-0000-0000-000000000001'),
  'parité RLS indicateurs de paie : conducteur A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.paie_periode_dossiers_page('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001', p_limite => 500)->'lignes') with ordinality t(x, n)),
  (select array_agg(d.id order by e.nom, e.prenom, d.id) from public.dossiers_paie_salaries d join public.employes e on e.id = d.employe_id where d.entreprise_id = 'a0000000-0000-0000-0000-000000000001' and d.periode_id = 'a9930000-0000-0000-0000-000000000001'),
  'parité RLS page de dossiers de paie : conducteur A');
select is(
  (select jsonb_build_object('d', (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(c->'dossiers') with ordinality t(x, n)),
                             'p', (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(c->'pieces') with ordinality t(x, n)))
   from (select public.paie_export_contenu('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001') c) z),
  jsonb_build_object('d', (select array_agg(id order by employe_id, id) from public.dossiers_paie_salaries where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and periode_id = 'a9930000-0000-0000-0000-000000000001'),
                     'p', (select array_agg(p.id order by p.id) from public.pieces_jointes_paie p where p.dossier_id in (select id from public.dossiers_paie_salaries where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and periode_id = 'a9930000-0000-0000-0000-000000000001'))),
  'parité RLS contenu d''export de paie (dossiers et pièces) : conducteur A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.paie_anomalies_page('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001', null, 2000)) with ordinality t(x, n)),
  (select array_agg(id order by niveau, created_at, id) from public.anomalies_paie where periode_id = 'a9930000-0000-0000-0000-000000000001' and corrigee_at is null),
  'parité RLS liste des anomalies de paie : conducteur A');
select is((public.paie_periode_synthese('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001')->>'nb_anomalies')::bigint,
  (select count(*) from public.anomalies_paie where periode_id = 'a9930000-0000-0000-0000-000000000001' and corrigee_at is null),
  'parité RLS anomalies de paie : conducteur A');
select is(
  (select jsonb_agg(jsonb_build_object('e', x->>'employe_id', 'nb', x->'nb', 't', x->'total', 'a', x->'a_verifier') order by x->>'employe_id') from jsonb_array_elements(public.notes_frais_synthese_employes('a0000000-0000-0000-0000-000000000001')) x),
  (select jsonb_agg(jsonb_build_object('e', employe_id::text, 'nb', nb, 't', total, 'a', av) order by employe_id::text) from
     (select employe_id, count(*) nb, coalesce(sum(montant_ttc), 0) total, count(*) filter (where statut in ('soumis','en_verification','correction_demandee')) av
      from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' group by employe_id) g),
  'parité RLS notes de frais par salarié : conducteur A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.notes_frais_page('a0000000-0000-0000-0000-000000000001', p_limite => 300)->'lignes') with ordinality t(x, n)),
  (select array_agg(id order by date_frais desc, id desc) from (select id, date_frais from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' order by date_frais desc, id desc limit 300) n),
  'parité RLS première page de notes de frais : conducteur A');
select is(public.gp_crm_synthese('a0000000-0000-0000-0000-000000000001'),
  (select jsonb_build_object('nb_a_relancer', count(*), 'reste_a_encaisser', coalesce(sum(montant_ttc - montant_paye), 0)) from public.factures
    where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut in ('envoyee','payee_partiel','en_retard') and montant_ttc > montant_paye)
  || jsonb_build_object('rappels_ouverts', (select count(*) from public.appels_contacts where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and not coalesce(termine, false) and a_rappeler_at is not null)),
  'parité RLS CRM : conducteur A');
select is(
  (select jsonb_build_object('s', s->'par_statut', 'a', s->'nb_actifs', 'r', s->'nb_en_retard') from (select public.gp_dashboard_chantiers('a0000000-0000-0000-0000-000000000001', current_date) s) x),
  jsonb_build_object(
    's', coalesce((select jsonb_agg(jsonb_build_object('statut', statut, 'nb', nb) order by statut) from (select statut, count(*) nb from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' group by statut) g), '[]'::jsonb),
    'a', (select count(*) from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut in ('accepte','a_preparer','en_attente_validation','en_commande_materiel','en_cours','en_pause')),
    'r', (select count(*) from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut in ('accepte','a_preparer','en_attente_validation','en_commande_materiel','en_cours','en_pause') and date_fin_prevue < current_date)),
  'parité RLS tableau de bord chantiers : conducteur A');
select is((public.gp_alertes_stock('a0000000-0000-0000-0000-000000000001')->>'nb')::bigint,
  (select count(*) from public.articles_stock where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and actif and quantite_stock <= seuil_alerte),
  'parité RLS alertes de stock : conducteur A');
select is(
  (select array_agg((x->>'id')::uuid order by x->>'id') from jsonb_array_elements(public.gp_options_chantiers('a0000000-0000-0000-0000-000000000001')) x),
  (select array_agg(id order by id::text) from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut not in ('archive','annule')),
  'parité RLS options chantiers : conducteur A');
select is(
  (select array_agg((x->>'id')::uuid order by x->>'id') from jsonb_array_elements(public.gp_options_employes('a0000000-0000-0000-0000-000000000001')) x),
  (select array_agg(id order by id::text) from public.employes where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut = 'actif'),
  'parité RLS options salariés : conducteur A');
select is(
  (select array_agg((x->>'id')::uuid order by x->>'id') from jsonb_array_elements(public.gp_options_clients('a0000000-0000-0000-0000-000000000001')) x),
  (select array_agg(id order by id::text) from public.clients where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
  'parité RLS options clients : conducteur A');
select is(public.gp_parc_synthese('a0000000-0000-0000-0000-000000000001', current_date),
  jsonb_build_object(
    'vehicules', (select jsonb_build_object('nb', count(*), 'alertes', count(*) filter (where controle_technique_echeance <= current_date or assurance_echeance <= current_date or prochain_entretien_date <= current_date)) from public.vehicules where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
    'outils', (select jsonb_build_object('nb', count(*), 'alertes', count(*) filter (where prochaine_verification <= current_date), 'hors_service', count(*) filter (where statut = 'hors_service')) from public.outils where entreprise_id = 'a0000000-0000-0000-0000-000000000001')),
  'parité RLS compteurs du parc : conducteur A');
select is(
  (select jsonb_build_object('v', p->'nb_vehicules', 'o', p->'nb_outils') from (select public.gp_alertes_parc('a0000000-0000-0000-0000-000000000001', current_date) p) x),
  jsonb_build_object(
    'v', (select count(*) from public.vehicules where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut in ('actif','maintenance') and (controle_technique_echeance <= current_date + 30 or assurance_echeance <= current_date + 30 or prochain_entretien_date <= current_date + 30 or (prochain_entretien_km is not null and kilometrage >= prochain_entretien_km))),
    'o', (select count(*) from public.outils where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut not in ('hors_service','perdu') and prochaine_verification <= current_date + 30)),
  'parité RLS alertes du parc : conducteur A');
select is(public.gp_effectif_actif('a0000000-0000-0000-0000-000000000001'), (select count(*) from public.employes where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut = 'actif'), 'parité RLS effectif actif : conducteur A');
select throws_ok($$select public.gp_client_synthese('b0000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001')$$, '42501', null, 'cross-tenant refusé (client B) : conducteur A');
select throws_ok($$select public.plateforme_postes_tarifs_entreprise('a0000000-0000-0000-0000-000000000001')$$, '42501', null, 'tarifs plateforme refusés à un membre de tenant : conducteur A');
select throws_ok($$select public.plateforme_applications_compteurs()$$, '42501', null, 'compteurs plateforme refusés à un membre de tenant : conducteur A');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}', true) is not null as profil;
select is(public.gp_depenses_synthese('a0000000-0000-0000-0000-000000000001', p_fournisseur_id => 'a9900000-0000-0000-0000-000000000001'),
  (select jsonb_build_object('nb', count(*), 'nb_actives', count(*) filter (where statut is distinct from 'annulee'),
     'total_ht', coalesce(sum(montant_ht) filter (where statut is distinct from 'annulee'), 0),
     'total_ttc', coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0), 'total_regle', coalesce(sum(montant_regle), 0))
   from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and fournisseur_id = 'a9900000-0000-0000-0000-000000000001'),
  'parité RLS dépenses sous-traitant : comptable A');
select is(public.gp_depenses_synthese('a0000000-0000-0000-0000-000000000001', p_vehicule_id => 'a9910000-0000-0000-0000-000000000001'),
  (select jsonb_build_object('nb', count(*), 'nb_actives', count(*) filter (where statut is distinct from 'annulee'),
     'total_ht', coalesce(sum(montant_ht) filter (where statut is distinct from 'annulee'), 0),
     'total_ttc', coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0), 'total_regle', coalesce(sum(montant_regle), 0))
   from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and vehicule_id = 'a9910000-0000-0000-0000-000000000001'),
  'parité RLS dépenses véhicule : comptable A');
select is(public.gp_depenses_synthese('a0000000-0000-0000-0000-000000000001', p_outil_id => 'a9920000-0000-0000-0000-000000000001'),
  (select jsonb_build_object('nb', count(*), 'nb_actives', count(*) filter (where statut is distinct from 'annulee'),
     'total_ht', coalesce(sum(montant_ht) filter (where statut is distinct from 'annulee'), 0),
     'total_ttc', coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0), 'total_regle', coalesce(sum(montant_regle), 0))
   from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and outil_id = 'a9920000-0000-0000-0000-000000000001'),
  'parité RLS dépenses outil : comptable A');
select is(public.gp_client_synthese('a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001'),
  jsonb_build_object(
    'factures', (select jsonb_build_object('nb', count(*), 'total_facture', coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0), 'total_paye', coalesce(sum(montant_paye), 0)) from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and client_id = 'a3000000-0000-0000-0000-000000000001'),
    'devis', (select jsonb_build_object('nb', count(*)) from public.devis where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and client_id = 'a3000000-0000-0000-0000-000000000001')),
  'parité RLS fiche client : comptable A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.gp_client_chantiers_page('a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 200)->'lignes') with ordinality t(x, n)),
  (select array_agg(id order by created_at desc nulls last, id desc) from (select id, created_at from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and client_id = 'a3000000-0000-0000-0000-000000000001' order by created_at desc nulls last, id desc limit 200) c),
  'parité RLS chantiers du client (première page) : comptable A');
select is(public.gp_sous_traitant_missions_synthese('a0000000-0000-0000-0000-000000000001', 'a9900000-0000-0000-0000-000000000001'),
  (select jsonb_build_object('nb', count(*), 'nb_actives', count(*) filter (where statut in ('prevue','en_cours')), 'previsionnel_ht', coalesce(sum(montant_previsionnel_ht) filter (where statut is distinct from 'annulee'), 0))
   from public.sous_traitants_chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and fournisseur_id = 'a9900000-0000-0000-0000-000000000001'),
  'parité RLS missions sous-traitant : comptable A');
select is((public.gp_chantier_documents_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 60)->>'total')::bigint,
  (select count(*) from public.documents_chantier where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
  'parité RLS nombre de documents (chantier assigné) : comptable A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.gp_chantier_documents_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 60)->'lignes') with ordinality t(x, n)),
  (select array_agg(id order by created_at desc nulls last, id desc) from (select id, created_at from public.documents_chantier where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001' order by created_at desc nulls last, id desc limit 60) d),
  'parité RLS première page de documents (chantier assigné) : comptable A');
select is((public.gp_chantier_documents_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002', 60)->>'total')::bigint,
  (select count(*) from public.documents_chantier where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000002'),
  'parité RLS nombre de documents (chantier non assigné) : comptable A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.gp_chantier_documents_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002', 60)->'lignes') with ordinality t(x, n)),
  (select array_agg(id order by created_at desc nulls last, id desc) from (select id, created_at from public.documents_chantier where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000002' order by created_at desc nulls last, id desc limit 60) d),
  'parité RLS première page de documents (chantier non assigné) : comptable A');
select is(
  (select jsonb_build_object('f', s->'factures'->'nb', 'ft', s->'factures'->'total_facture', 'fp', s->'factures'->'total_paye',
                             'd', s->'factures_fournisseurs'->'nb', 'dt', s->'factures_fournisseurs'->'total_ttc', 'dr', s->'factures_fournisseurs'->'total_regle',
                             'n', s->'notes_frais'->'nb', 'nv', s->'notes_frais'->'total_validees', 'nc', s->'notes_frais'->'total_en_cours')
   from (select public.chantier_synthese_chiffree('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001') s) x),
  (select jsonb_build_object(
     'f', (select count(*) from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'ft', (select coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0) from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'fp', (select coalesce(sum(montant_paye), 0) from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'd', (select count(*) from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'dt', (select coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0) from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'dr', (select coalesce(sum(montant_regle), 0) from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'n', (select count(*) from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'nv', (select coalesce(sum(montant_ttc) filter (where statut in ('valide','exporte_comptabilite','verrouille','archive','validee','remboursee')), 0) from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'nc', (select coalesce(sum(montant_ttc) filter (where statut not in ('valide','exporte_comptabilite','verrouille','archive','validee','remboursee') and statut not in ('refuse','refusee')), 0) from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'))),
  'parité RLS synthèse fiche chantier : comptable A');
select case when public.peut_consulter_chantier('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001') then
  is((select jsonb_build_object('docs', jsonb_array_length(c->'documents'), 'articles', jsonb_array_length(c->'article_ids'), 'fiches', jsonb_array_length(c->'fiches_techniques')) from (select public.gp_doe_contenu('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001') c) x),
     jsonb_build_object(
       'docs', (select count(*) from public.documents_chantier where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
       'articles', (select count(distinct article_id) from public.mouvements_stock where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001' and type = 'sortie' and article_id is not null),
       'fiches', (select count(*) from public.fiches_techniques_articles where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and article_id in (select article_id from public.mouvements_stock where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001' and type = 'sortie'))),
     'parité RLS contenu DOE : comptable A')
  else throws_ok($$select public.gp_doe_contenu('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001')$$, '42501', null, 'DOE refusé hors chantier visible : comptable A') end;
select is(
  (select s - 'nb_anomalies' from (select public.paie_periode_synthese('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001') s) x),
  (select jsonb_build_object('nb', count(*), 'total_paniers', coalesce(sum(d.total_paniers), 0), 'total_trajets', coalesce(sum(d.total_trajets), 0),
     'total_transports', coalesce(sum(d.total_transports), 0), 'total_grands_deplacements', coalesce(sum(d.total_grands_deplacements), 0),
     'total_primes', coalesce(sum(d.total_primes), 0), 'total_acomptes', coalesce(sum(d.total_acomptes), 0), 'total_notes_frais', coalesce(sum(d.total_notes_frais), 0))
   from public.dossiers_paie_salaries d join public.employes e on e.id = d.employe_id where d.entreprise_id = 'a0000000-0000-0000-0000-000000000001' and d.periode_id = 'a9930000-0000-0000-0000-000000000001'),
  'parité RLS indicateurs de paie : comptable A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.paie_periode_dossiers_page('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001', p_limite => 500)->'lignes') with ordinality t(x, n)),
  (select array_agg(d.id order by e.nom, e.prenom, d.id) from public.dossiers_paie_salaries d join public.employes e on e.id = d.employe_id where d.entreprise_id = 'a0000000-0000-0000-0000-000000000001' and d.periode_id = 'a9930000-0000-0000-0000-000000000001'),
  'parité RLS page de dossiers de paie : comptable A');
select is(
  (select jsonb_build_object('d', (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(c->'dossiers') with ordinality t(x, n)),
                             'p', (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(c->'pieces') with ordinality t(x, n)))
   from (select public.paie_export_contenu('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001') c) z),
  jsonb_build_object('d', (select array_agg(id order by employe_id, id) from public.dossiers_paie_salaries where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and periode_id = 'a9930000-0000-0000-0000-000000000001'),
                     'p', (select array_agg(p.id order by p.id) from public.pieces_jointes_paie p where p.dossier_id in (select id from public.dossiers_paie_salaries where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and periode_id = 'a9930000-0000-0000-0000-000000000001'))),
  'parité RLS contenu d''export de paie (dossiers et pièces) : comptable A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.paie_anomalies_page('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001', null, 2000)) with ordinality t(x, n)),
  (select array_agg(id order by niveau, created_at, id) from public.anomalies_paie where periode_id = 'a9930000-0000-0000-0000-000000000001' and corrigee_at is null),
  'parité RLS liste des anomalies de paie : comptable A');
select is((public.paie_periode_synthese('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001')->>'nb_anomalies')::bigint,
  (select count(*) from public.anomalies_paie where periode_id = 'a9930000-0000-0000-0000-000000000001' and corrigee_at is null),
  'parité RLS anomalies de paie : comptable A');
select is(
  (select jsonb_agg(jsonb_build_object('e', x->>'employe_id', 'nb', x->'nb', 't', x->'total', 'a', x->'a_verifier') order by x->>'employe_id') from jsonb_array_elements(public.notes_frais_synthese_employes('a0000000-0000-0000-0000-000000000001')) x),
  (select jsonb_agg(jsonb_build_object('e', employe_id::text, 'nb', nb, 't', total, 'a', av) order by employe_id::text) from
     (select employe_id, count(*) nb, coalesce(sum(montant_ttc), 0) total, count(*) filter (where statut in ('soumis','en_verification','correction_demandee')) av
      from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' group by employe_id) g),
  'parité RLS notes de frais par salarié : comptable A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.notes_frais_page('a0000000-0000-0000-0000-000000000001', p_limite => 300)->'lignes') with ordinality t(x, n)),
  (select array_agg(id order by date_frais desc, id desc) from (select id, date_frais from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' order by date_frais desc, id desc limit 300) n),
  'parité RLS première page de notes de frais : comptable A');
select is(public.gp_crm_synthese('a0000000-0000-0000-0000-000000000001'),
  (select jsonb_build_object('nb_a_relancer', count(*), 'reste_a_encaisser', coalesce(sum(montant_ttc - montant_paye), 0)) from public.factures
    where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut in ('envoyee','payee_partiel','en_retard') and montant_ttc > montant_paye)
  || jsonb_build_object('rappels_ouverts', (select count(*) from public.appels_contacts where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and not coalesce(termine, false) and a_rappeler_at is not null)),
  'parité RLS CRM : comptable A');
select is(
  (select jsonb_build_object('s', s->'par_statut', 'a', s->'nb_actifs', 'r', s->'nb_en_retard') from (select public.gp_dashboard_chantiers('a0000000-0000-0000-0000-000000000001', current_date) s) x),
  jsonb_build_object(
    's', coalesce((select jsonb_agg(jsonb_build_object('statut', statut, 'nb', nb) order by statut) from (select statut, count(*) nb from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' group by statut) g), '[]'::jsonb),
    'a', (select count(*) from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut in ('accepte','a_preparer','en_attente_validation','en_commande_materiel','en_cours','en_pause')),
    'r', (select count(*) from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut in ('accepte','a_preparer','en_attente_validation','en_commande_materiel','en_cours','en_pause') and date_fin_prevue < current_date)),
  'parité RLS tableau de bord chantiers : comptable A');
select is((public.gp_alertes_stock('a0000000-0000-0000-0000-000000000001')->>'nb')::bigint,
  (select count(*) from public.articles_stock where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and actif and quantite_stock <= seuil_alerte),
  'parité RLS alertes de stock : comptable A');
select is(
  (select array_agg((x->>'id')::uuid order by x->>'id') from jsonb_array_elements(public.gp_options_chantiers('a0000000-0000-0000-0000-000000000001')) x),
  (select array_agg(id order by id::text) from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut not in ('archive','annule')),
  'parité RLS options chantiers : comptable A');
select is(
  (select array_agg((x->>'id')::uuid order by x->>'id') from jsonb_array_elements(public.gp_options_employes('a0000000-0000-0000-0000-000000000001')) x),
  (select array_agg(id order by id::text) from public.employes where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut = 'actif'),
  'parité RLS options salariés : comptable A');
select is(
  (select array_agg((x->>'id')::uuid order by x->>'id') from jsonb_array_elements(public.gp_options_clients('a0000000-0000-0000-0000-000000000001')) x),
  (select array_agg(id order by id::text) from public.clients where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
  'parité RLS options clients : comptable A');
select is(public.gp_parc_synthese('a0000000-0000-0000-0000-000000000001', current_date),
  jsonb_build_object(
    'vehicules', (select jsonb_build_object('nb', count(*), 'alertes', count(*) filter (where controle_technique_echeance <= current_date or assurance_echeance <= current_date or prochain_entretien_date <= current_date)) from public.vehicules where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
    'outils', (select jsonb_build_object('nb', count(*), 'alertes', count(*) filter (where prochaine_verification <= current_date), 'hors_service', count(*) filter (where statut = 'hors_service')) from public.outils where entreprise_id = 'a0000000-0000-0000-0000-000000000001')),
  'parité RLS compteurs du parc : comptable A');
select is(
  (select jsonb_build_object('v', p->'nb_vehicules', 'o', p->'nb_outils') from (select public.gp_alertes_parc('a0000000-0000-0000-0000-000000000001', current_date) p) x),
  jsonb_build_object(
    'v', (select count(*) from public.vehicules where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut in ('actif','maintenance') and (controle_technique_echeance <= current_date + 30 or assurance_echeance <= current_date + 30 or prochain_entretien_date <= current_date + 30 or (prochain_entretien_km is not null and kilometrage >= prochain_entretien_km))),
    'o', (select count(*) from public.outils where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut not in ('hors_service','perdu') and prochaine_verification <= current_date + 30)),
  'parité RLS alertes du parc : comptable A');
select is(public.gp_effectif_actif('a0000000-0000-0000-0000-000000000001'), (select count(*) from public.employes where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut = 'actif'), 'parité RLS effectif actif : comptable A');
select throws_ok($$select public.gp_client_synthese('b0000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001')$$, '42501', null, 'cross-tenant refusé (client B) : comptable A');
select throws_ok($$select public.plateforme_postes_tarifs_entreprise('a0000000-0000-0000-0000-000000000001')$$, '42501', null, 'tarifs plateforme refusés à un membre de tenant : comptable A');
select throws_ok($$select public.plateforme_applications_compteurs()$$, '42501', null, 'compteurs plateforme refusés à un membre de tenant : comptable A');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true) is not null as profil;
select is(public.gp_depenses_synthese('a0000000-0000-0000-0000-000000000001', p_fournisseur_id => 'a9900000-0000-0000-0000-000000000001'),
  (select jsonb_build_object('nb', count(*), 'nb_actives', count(*) filter (where statut is distinct from 'annulee'),
     'total_ht', coalesce(sum(montant_ht) filter (where statut is distinct from 'annulee'), 0),
     'total_ttc', coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0), 'total_regle', coalesce(sum(montant_regle), 0))
   from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and fournisseur_id = 'a9900000-0000-0000-0000-000000000001'),
  'parité RLS dépenses sous-traitant : dirigeant A');
select is(public.gp_depenses_synthese('a0000000-0000-0000-0000-000000000001', p_vehicule_id => 'a9910000-0000-0000-0000-000000000001'),
  (select jsonb_build_object('nb', count(*), 'nb_actives', count(*) filter (where statut is distinct from 'annulee'),
     'total_ht', coalesce(sum(montant_ht) filter (where statut is distinct from 'annulee'), 0),
     'total_ttc', coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0), 'total_regle', coalesce(sum(montant_regle), 0))
   from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and vehicule_id = 'a9910000-0000-0000-0000-000000000001'),
  'parité RLS dépenses véhicule : dirigeant A');
select is(public.gp_depenses_synthese('a0000000-0000-0000-0000-000000000001', p_outil_id => 'a9920000-0000-0000-0000-000000000001'),
  (select jsonb_build_object('nb', count(*), 'nb_actives', count(*) filter (where statut is distinct from 'annulee'),
     'total_ht', coalesce(sum(montant_ht) filter (where statut is distinct from 'annulee'), 0),
     'total_ttc', coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0), 'total_regle', coalesce(sum(montant_regle), 0))
   from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and outil_id = 'a9920000-0000-0000-0000-000000000001'),
  'parité RLS dépenses outil : dirigeant A');
select is(public.gp_client_synthese('a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001'),
  jsonb_build_object(
    'factures', (select jsonb_build_object('nb', count(*), 'total_facture', coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0), 'total_paye', coalesce(sum(montant_paye), 0)) from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and client_id = 'a3000000-0000-0000-0000-000000000001'),
    'devis', (select jsonb_build_object('nb', count(*)) from public.devis where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and client_id = 'a3000000-0000-0000-0000-000000000001')),
  'parité RLS fiche client : dirigeant A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.gp_client_chantiers_page('a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 200)->'lignes') with ordinality t(x, n)),
  (select array_agg(id order by created_at desc nulls last, id desc) from (select id, created_at from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and client_id = 'a3000000-0000-0000-0000-000000000001' order by created_at desc nulls last, id desc limit 200) c),
  'parité RLS chantiers du client (première page) : dirigeant A');
select is(public.gp_sous_traitant_missions_synthese('a0000000-0000-0000-0000-000000000001', 'a9900000-0000-0000-0000-000000000001'),
  (select jsonb_build_object('nb', count(*), 'nb_actives', count(*) filter (where statut in ('prevue','en_cours')), 'previsionnel_ht', coalesce(sum(montant_previsionnel_ht) filter (where statut is distinct from 'annulee'), 0))
   from public.sous_traitants_chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and fournisseur_id = 'a9900000-0000-0000-0000-000000000001'),
  'parité RLS missions sous-traitant : dirigeant A');
select is((public.gp_chantier_documents_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 60)->>'total')::bigint,
  (select count(*) from public.documents_chantier where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
  'parité RLS nombre de documents (chantier assigné) : dirigeant A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.gp_chantier_documents_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 60)->'lignes') with ordinality t(x, n)),
  (select array_agg(id order by created_at desc nulls last, id desc) from (select id, created_at from public.documents_chantier where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001' order by created_at desc nulls last, id desc limit 60) d),
  'parité RLS première page de documents (chantier assigné) : dirigeant A');
select is((public.gp_chantier_documents_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002', 60)->>'total')::bigint,
  (select count(*) from public.documents_chantier where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000002'),
  'parité RLS nombre de documents (chantier non assigné) : dirigeant A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.gp_chantier_documents_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002', 60)->'lignes') with ordinality t(x, n)),
  (select array_agg(id order by created_at desc nulls last, id desc) from (select id, created_at from public.documents_chantier where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000002' order by created_at desc nulls last, id desc limit 60) d),
  'parité RLS première page de documents (chantier non assigné) : dirigeant A');
select is(
  (select jsonb_build_object('f', s->'factures'->'nb', 'ft', s->'factures'->'total_facture', 'fp', s->'factures'->'total_paye',
                             'd', s->'factures_fournisseurs'->'nb', 'dt', s->'factures_fournisseurs'->'total_ttc', 'dr', s->'factures_fournisseurs'->'total_regle',
                             'n', s->'notes_frais'->'nb', 'nv', s->'notes_frais'->'total_validees', 'nc', s->'notes_frais'->'total_en_cours')
   from (select public.chantier_synthese_chiffree('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001') s) x),
  (select jsonb_build_object(
     'f', (select count(*) from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'ft', (select coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0) from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'fp', (select coalesce(sum(montant_paye), 0) from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'd', (select count(*) from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'dt', (select coalesce(sum(montant_ttc) filter (where statut is distinct from 'annulee'), 0) from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'dr', (select coalesce(sum(montant_regle), 0) from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'n', (select count(*) from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'nv', (select coalesce(sum(montant_ttc) filter (where statut in ('valide','exporte_comptabilite','verrouille','archive','validee','remboursee')), 0) from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
     'nc', (select coalesce(sum(montant_ttc) filter (where statut not in ('valide','exporte_comptabilite','verrouille','archive','validee','remboursee') and statut not in ('refuse','refusee')), 0) from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'))),
  'parité RLS synthèse fiche chantier : dirigeant A');
select case when public.peut_consulter_chantier('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001') then
  is((select jsonb_build_object('docs', jsonb_array_length(c->'documents'), 'articles', jsonb_array_length(c->'article_ids'), 'fiches', jsonb_array_length(c->'fiches_techniques')) from (select public.gp_doe_contenu('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001') c) x),
     jsonb_build_object(
       'docs', (select count(*) from public.documents_chantier where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001'),
       'articles', (select count(distinct article_id) from public.mouvements_stock where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001' and type = 'sortie' and article_id is not null),
       'fiches', (select count(*) from public.fiches_techniques_articles where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and article_id in (select article_id from public.mouvements_stock where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and chantier_id = 'a4000000-0000-0000-0000-000000000001' and type = 'sortie'))),
     'parité RLS contenu DOE : dirigeant A')
  else throws_ok($$select public.gp_doe_contenu('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001')$$, '42501', null, 'DOE refusé hors chantier visible : dirigeant A') end;
select is(
  (select s - 'nb_anomalies' from (select public.paie_periode_synthese('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001') s) x),
  (select jsonb_build_object('nb', count(*), 'total_paniers', coalesce(sum(d.total_paniers), 0), 'total_trajets', coalesce(sum(d.total_trajets), 0),
     'total_transports', coalesce(sum(d.total_transports), 0), 'total_grands_deplacements', coalesce(sum(d.total_grands_deplacements), 0),
     'total_primes', coalesce(sum(d.total_primes), 0), 'total_acomptes', coalesce(sum(d.total_acomptes), 0), 'total_notes_frais', coalesce(sum(d.total_notes_frais), 0))
   from public.dossiers_paie_salaries d join public.employes e on e.id = d.employe_id where d.entreprise_id = 'a0000000-0000-0000-0000-000000000001' and d.periode_id = 'a9930000-0000-0000-0000-000000000001'),
  'parité RLS indicateurs de paie : dirigeant A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.paie_periode_dossiers_page('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001', p_limite => 500)->'lignes') with ordinality t(x, n)),
  (select array_agg(d.id order by e.nom, e.prenom, d.id) from public.dossiers_paie_salaries d join public.employes e on e.id = d.employe_id where d.entreprise_id = 'a0000000-0000-0000-0000-000000000001' and d.periode_id = 'a9930000-0000-0000-0000-000000000001'),
  'parité RLS page de dossiers de paie : dirigeant A');
select is(
  (select jsonb_build_object('d', (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(c->'dossiers') with ordinality t(x, n)),
                             'p', (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(c->'pieces') with ordinality t(x, n)))
   from (select public.paie_export_contenu('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001') c) z),
  jsonb_build_object('d', (select array_agg(id order by employe_id, id) from public.dossiers_paie_salaries where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and periode_id = 'a9930000-0000-0000-0000-000000000001'),
                     'p', (select array_agg(p.id order by p.id) from public.pieces_jointes_paie p where p.dossier_id in (select id from public.dossiers_paie_salaries where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and periode_id = 'a9930000-0000-0000-0000-000000000001'))),
  'parité RLS contenu d''export de paie (dossiers et pièces) : dirigeant A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.paie_anomalies_page('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001', null, 2000)) with ordinality t(x, n)),
  (select array_agg(id order by niveau, created_at, id) from public.anomalies_paie where periode_id = 'a9930000-0000-0000-0000-000000000001' and corrigee_at is null),
  'parité RLS liste des anomalies de paie : dirigeant A');
select is((public.paie_periode_synthese('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001')->>'nb_anomalies')::bigint,
  (select count(*) from public.anomalies_paie where periode_id = 'a9930000-0000-0000-0000-000000000001' and corrigee_at is null),
  'parité RLS anomalies de paie : dirigeant A');
select is(
  (select jsonb_agg(jsonb_build_object('e', x->>'employe_id', 'nb', x->'nb', 't', x->'total', 'a', x->'a_verifier') order by x->>'employe_id') from jsonb_array_elements(public.notes_frais_synthese_employes('a0000000-0000-0000-0000-000000000001')) x),
  (select jsonb_agg(jsonb_build_object('e', employe_id::text, 'nb', nb, 't', total, 'a', av) order by employe_id::text) from
     (select employe_id, count(*) nb, coalesce(sum(montant_ttc), 0) total, count(*) filter (where statut in ('soumis','en_verification','correction_demandee')) av
      from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' group by employe_id) g),
  'parité RLS notes de frais par salarié : dirigeant A');
select is(
  (select array_agg((x->>'id')::uuid order by n) from jsonb_array_elements(public.notes_frais_page('a0000000-0000-0000-0000-000000000001', p_limite => 300)->'lignes') with ordinality t(x, n)),
  (select array_agg(id order by date_frais desc, id desc) from (select id, date_frais from public.notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' order by date_frais desc, id desc limit 300) n),
  'parité RLS première page de notes de frais : dirigeant A');
select is(public.gp_crm_synthese('a0000000-0000-0000-0000-000000000001'),
  (select jsonb_build_object('nb_a_relancer', count(*), 'reste_a_encaisser', coalesce(sum(montant_ttc - montant_paye), 0)) from public.factures
    where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut in ('envoyee','payee_partiel','en_retard') and montant_ttc > montant_paye)
  || jsonb_build_object('rappels_ouverts', (select count(*) from public.appels_contacts where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and not coalesce(termine, false) and a_rappeler_at is not null)),
  'parité RLS CRM : dirigeant A');
select is(
  (select jsonb_build_object('s', s->'par_statut', 'a', s->'nb_actifs', 'r', s->'nb_en_retard') from (select public.gp_dashboard_chantiers('a0000000-0000-0000-0000-000000000001', current_date) s) x),
  jsonb_build_object(
    's', coalesce((select jsonb_agg(jsonb_build_object('statut', statut, 'nb', nb) order by statut) from (select statut, count(*) nb from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' group by statut) g), '[]'::jsonb),
    'a', (select count(*) from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut in ('accepte','a_preparer','en_attente_validation','en_commande_materiel','en_cours','en_pause')),
    'r', (select count(*) from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut in ('accepte','a_preparer','en_attente_validation','en_commande_materiel','en_cours','en_pause') and date_fin_prevue < current_date)),
  'parité RLS tableau de bord chantiers : dirigeant A');
select is((public.gp_alertes_stock('a0000000-0000-0000-0000-000000000001')->>'nb')::bigint,
  (select count(*) from public.articles_stock where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and actif and quantite_stock <= seuil_alerte),
  'parité RLS alertes de stock : dirigeant A');
select is(
  (select array_agg((x->>'id')::uuid order by x->>'id') from jsonb_array_elements(public.gp_options_chantiers('a0000000-0000-0000-0000-000000000001')) x),
  (select array_agg(id order by id::text) from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut not in ('archive','annule')),
  'parité RLS options chantiers : dirigeant A');
select is(
  (select array_agg((x->>'id')::uuid order by x->>'id') from jsonb_array_elements(public.gp_options_employes('a0000000-0000-0000-0000-000000000001')) x),
  (select array_agg(id order by id::text) from public.employes where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut = 'actif'),
  'parité RLS options salariés : dirigeant A');
select is(
  (select array_agg((x->>'id')::uuid order by x->>'id') from jsonb_array_elements(public.gp_options_clients('a0000000-0000-0000-0000-000000000001')) x),
  (select array_agg(id order by id::text) from public.clients where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
  'parité RLS options clients : dirigeant A');
select is(public.gp_parc_synthese('a0000000-0000-0000-0000-000000000001', current_date),
  jsonb_build_object(
    'vehicules', (select jsonb_build_object('nb', count(*), 'alertes', count(*) filter (where controle_technique_echeance <= current_date or assurance_echeance <= current_date or prochain_entretien_date <= current_date)) from public.vehicules where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
    'outils', (select jsonb_build_object('nb', count(*), 'alertes', count(*) filter (where prochaine_verification <= current_date), 'hors_service', count(*) filter (where statut = 'hors_service')) from public.outils where entreprise_id = 'a0000000-0000-0000-0000-000000000001')),
  'parité RLS compteurs du parc : dirigeant A');
select is(
  (select jsonb_build_object('v', p->'nb_vehicules', 'o', p->'nb_outils') from (select public.gp_alertes_parc('a0000000-0000-0000-0000-000000000001', current_date) p) x),
  jsonb_build_object(
    'v', (select count(*) from public.vehicules where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut in ('actif','maintenance') and (controle_technique_echeance <= current_date + 30 or assurance_echeance <= current_date + 30 or prochain_entretien_date <= current_date + 30 or (prochain_entretien_km is not null and kilometrage >= prochain_entretien_km))),
    'o', (select count(*) from public.outils where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut not in ('hors_service','perdu') and prochaine_verification <= current_date + 30)),
  'parité RLS alertes du parc : dirigeant A');
select is(public.gp_effectif_actif('a0000000-0000-0000-0000-000000000001'), (select count(*) from public.employes where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut = 'actif'), 'parité RLS effectif actif : dirigeant A');
select throws_ok($$select public.gp_client_synthese('b0000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001')$$, '42501', null, 'cross-tenant refusé (client B) : dirigeant A');
select throws_ok($$select public.plateforme_postes_tarifs_entreprise('a0000000-0000-0000-0000-000000000001')$$, '42501', null, 'tarifs plateforme refusés à un membre de tenant : dirigeant A');
select throws_ok($$select public.plateforme_applications_compteurs()$$, '42501', null, 'compteurs plateforme refusés à un membre de tenant : dirigeant A');
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}', true) is not null as profil;
select throws_ok($$select public.gp_depenses_synthese('a0000000-0000-0000-0000-000000000001', p_vehicule_id => 'a9910000-0000-0000-0000-000000000001')$$, '42501', null, 'admin B refusé sur A (dépenses)');
select throws_ok($$select public.gp_chantier_documents_page('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001')$$, '42501', null, 'admin B refusé sur A (documents)');
select throws_ok($$select public.paie_periode_synthese('a0000000-0000-0000-0000-000000000001', 'a9930000-0000-0000-0000-000000000001')$$, '42501', null, 'admin B refusé sur A (paie)');
select throws_ok($$select public.notes_frais_synthese_employes('a0000000-0000-0000-0000-000000000001')$$, '42501', null, 'admin B refusé sur A (notes)');
select throws_ok($$select public.gp_doe_contenu('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001')$$, '42501', null, 'admin B refusé sur A (DOE)');
select throws_ok($$select public.gp_client_chantiers_page('a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001')$$, '42501', null, 'admin B refusé sur A (chantiers client)');
select throws_ok($$select public.gp_dashboard_chantiers('a0000000-0000-0000-0000-000000000001', current_date)$$, '42501', null, 'admin B refusé sur A (tableau de bord)');
select throws_ok($$select public.gp_alertes_stock('a0000000-0000-0000-0000-000000000001')$$, '42501', null, 'admin B refusé sur A (stock)');
select throws_ok($$select public.gp_crm_synthese('a0000000-0000-0000-0000-000000000001')$$, '42501', null, 'admin B refusé sur A (CRM)');
select throws_ok($$select public.chantier_synthese_chiffree('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001')$$, '42501', null, 'admin B refusé sur A (synthèse chantier)');
select throws_ok($$select public.gp_sous_traitant_missions_synthese('a0000000-0000-0000-0000-000000000001', 'a9900000-0000-0000-0000-000000000001')$$, '42501', null, 'admin B refusé sur A (missions)');
select throws_ok($$select public.gp_options_chantiers('a0000000-0000-0000-0000-000000000001')$$, '42501', null, 'admin B refusé sur A (options chantiers)');
select throws_ok($$select public.gp_options_employes('a0000000-0000-0000-0000-000000000001')$$, '42501', null, 'admin B refusé sur A (options salariés)');
select throws_ok($$select public.gp_options_clients('a0000000-0000-0000-0000-000000000001')$$, '42501', null, 'admin B refusé sur A (options clients)');
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true) is not null as profil;
select throws_ok($$select public.gp_depenses_synthese('a0000000-0000-0000-0000-000000000001')$$, '22023', null, 'dépenses : au moins un axe exigé');
select throws_ok($$select public.gp_client_synthese('a0000000-0000-0000-0000-000000000001', null)$$, '22023', null, 'client : identifiant exigé');
select set_config('request.jwt.claims', '', true) is not null as anonyme;
select throws_ok($$select public.gp_client_synthese('a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001')$$, '42501', null, 'sans identité : refus');
select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}', true) is not null as profil;
select results_eq($$select poste_id, nom, nb_comptes_facturables from public.plateforme_postes_tarifs_entreprise('a0000000-0000-0000-0000-000000000001') order by nom, poste_id$$,
  $$select poste_id, nom, nb_comptes_facturables from public.plateforme_postes_tarifs() where entreprise_id = 'a0000000-0000-0000-0000-000000000001' order by nom, poste_id$$,
  'plateforme : tarifs par poste du tenant = ancienne RPC filtrée');
select is((select count(*)::int from public.plateforme_postes_tarifs_entreprise('a0000000-0000-0000-0000-000000000001') where entreprise_id <> 'a0000000-0000-0000-0000-000000000001'), 0, 'plateforme : aucun poste d''un autre tenant');
select is(public.plateforme_applications_compteurs(),
  (select coalesce(jsonb_object_agg(a.code, jsonb_build_object(
     'entreprises', (select count(*) from public.acces_applications_entreprises x where x.application_code = a.code and x.autorise and (x.valide_du is null or x.valide_du <= now()) and (x.valide_jusqu_au is null or x.valide_jusqu_au > now())),
     'utilisateurs', (select count(*) from public.habilitations_applications_utilisateurs h where h.application_code = a.code and h.autorise and (h.valide_du is null or h.valide_du <= now()) and (h.valide_jusqu_au is null or h.valide_jusqu_au > now())))), '{}'::jsonb)
   from public.applications_elsatia a),
  'plateforme : compteurs d''applications = lecture RLS de l''administrateur');

select * from finish();
rollback;
