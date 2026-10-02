-- ELSATIA-GP-RESIDUAL-DATA-CORRECTNESS-V1 — jeu volumétrique local.
-- Cinq entreprises R<V> (V = 500, 1000, 1462, 5000, 20000) et un tenant témoin
-- (300). Chaque entreprise porte V lignes sur CHAQUE chemin résiduel audité :
--   fiche client       : V factures, V devis, V chantiers du client 1
--   fiche sous-traitant: V factures (depenses_fournisseurs) et V missions
--   fiche véhicule     : V factures, V relevés kilométriques
--   fiche outil        : V factures, V mouvements
--   fiche chantier     : V documents (chantier 1), plus les V factures
--                        fournisseurs ci-dessus rattachées au chantier 1
-- Parties 2 et 3 (plus bas) : parc (outils, véhicules), paie, notes de frais, CRM, tableau de bord, DOE,
-- messagerie, interventions, appels d'offres, commandes, droits par poste.
-- Utilisateurs : administrateur (toutes permissions) r<V>…a1, ouvrier sans
-- droit finance r<V>…a2.
-- Chargement superutilisateur, triggers métier neutralisés
-- (session_replication_role = replica). Les RLS restent actives à la lecture.
\set ON_ERROR_STOP 1
set session_replication_role = replica;
set elsatia.capacite_personnes_bypass = 'on';

create or replace function pg_temp.u(p_prefixe text, p_n bigint) returns uuid language sql immutable as
$$ select (p_prefixe || lpad(to_hex(p_n), 32 - length(p_prefixe), '0'))::uuid $$;

do $$
declare
  v int; e uuid; pfx text; adm uuid; ouv uuid; poste_adm uuid; poste_ouv uuid;
  cli uuid; st uuid; frn uuid; veh uuid; outil uuid; ch1 uuid;
  volumes int[] := array[500, 1000, 1462, 5000, 20000, 300];
  prefixes text[] := array['a0500', 'a1000', 'a1462', 'a5000', 'a2000', 'ae000'];
begin
  for k in 1 .. array_length(volumes, 1) loop
    v := volumes[k]; pfx := prefixes[k];
    e := pg_temp.u(pfx || 'e', 1);
    adm := pg_temp.u(pfx || 'a', 1); ouv := pg_temp.u(pfx || 'a', 2);
    poste_adm := pg_temp.u(pfx || 'b', 1); poste_ouv := pg_temp.u(pfx || 'b', 2);
    cli := pg_temp.u(pfx || 'c', 1); st := pg_temp.u(pfx || 'd', 1); frn := pg_temp.u(pfx || 'd', 2);
    veh := pg_temp.u(pfx || 'f', 1); outil := pg_temp.u(pfx || 'f', 2); ch1 := pg_temp.u(pfx || 'ca', 1);

    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
      ('00000000-0000-0000-0000-000000000000', adm, 'authenticated', 'authenticated', pfx || '-admin@invalid.local', 'x', now(), now(), now()),
      ('00000000-0000-0000-0000-000000000000', ouv, 'authenticated', 'authenticated', pfx || '-ouvrier@invalid.local', 'x', now(), now(), now());
    insert into public.utilisateurs (id, prenom, nom) values (adm, 'Admin', pfx), (ouv, 'Ouvrier', pfx);
    insert into public.entreprises (id, nom, code_adhesion, abonnement_statut, abonnement_essai_debut, abonnement_essai_fin)
      values (e, 'Residuel ' || pfx, upper(pfx) || 'R', 'actif', current_date, current_date + 30);
    insert into public.postes (id, entreprise_id, nom) values (poste_adm, e, 'Administrateur'), (poste_ouv, e, 'Ouvrier');
    insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut) values (adm, e, poste_adm, 'actif'), (ouv, e, poste_ouv, 'actif');
    insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
      select e, poste_adm, d.cle, true from public.permissions_disponibles d where d.cle <> 'mode_compte_depot';
    insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
      select e, poste_ouv, d.cle, true from public.permissions_disponibles d where d.cle in ('voir_chantiers_assignes', 'acces_pointage', 'saisir_son_pointage', 'acces_flotte', 'acces_outillage');

    insert into public.clients (id, entreprise_id, nom, prenom, reference_interne)
      select pg_temp.u(pfx || 'c', i), e, 'Client ' || i, 'P' || i, 'CLI-' || i from generate_series(1, 5) i;
    insert into public.fournisseurs (id, entreprise_id, reference, nom, type_tiers)
      values (st, e, 'ST-1', 'Sous-traitant 1', 'sous_traitant'), (frn, e, 'FRN-2', 'Fournisseur 2', 'fournisseur');
    -- V chantiers du client 1 (le chantier 1 porte les documents) + 1 chantier d'un autre client.
    insert into public.chantiers (id, entreprise_id, client_id, nom, reference_interne, statut, created_at)
      select pg_temp.u(pfx || 'ca', i), e, cli, 'Chantier ' || lpad(i::text, 6, '0'), 'CH-' || i, 'en_cours', timestamptz '2025-01-01' + i * interval '1 minute'
      from generate_series(1, v) i;
    insert into public.chantiers (id, entreprise_id, client_id, nom, reference_interne, statut)
      values (pg_temp.u(pfx || 'cb', 1), e, pg_temp.u(pfx || 'c', 2), 'Chantier autre client', 'CH-X', 'en_cours');

    -- Fiche client : V factures et V devis du client 1, montants non ronds,
    -- 1 sur 33 annulée, encaissements partiels ; 7 factures d'un autre client.
    insert into public.factures (id, entreprise_id, numero, client_id, chantier_id, type, statut, date_emission, date_echeance,
                                 montant_ht, montant_tva, montant_ttc, montant_paye, created_at)
      select pg_temp.u(pfx || 'fa', i), e, 'F-' || lpad(i::text, 6, '0'), cli, pg_temp.u(pfx || 'ca', 1 + i % v),
             'simple', case when i % 33 = 0 then 'annulee' when i % 4 = 0 then 'payee' when i % 4 = 1 then 'payee_partiel' else 'envoyee' end,
             date '2025-01-01' + (i % 500), date '2025-01-01' + (i % 500) + 30,
             x.ht, round(x.ht * 0.2, 2), x.ht + round(x.ht * 0.2, 2),
             case when i % 4 = 0 then x.ht + round(x.ht * 0.2, 2) when i % 4 = 1 then round((x.ht + round(x.ht * 0.2, 2)) / 3, 2) else 0 end,
             timestamptz '2025-01-01' + i * interval '1 minute'
      from generate_series(1, v) i
      cross join lateral (select round((((i * 37) % 997) + 1) * 3.07, 2) as ht) x;
    insert into public.factures (id, entreprise_id, numero, client_id, type, statut, date_emission, montant_ht, montant_tva, montant_ttc, montant_paye)
      select pg_temp.u(pfx || 'fb', i), e, 'FX-' || i, pg_temp.u(pfx || 'c', 2), 'simple', 'envoyee', date '2025-06-01', 100, 20, 120, 0 from generate_series(1, 7) i;
    insert into public.devis (id, entreprise_id, numero, client_id, statut, date_emission, montant_ht, montant_tva, montant_ttc, created_at)
      select pg_temp.u(pfx || 'de', i), e, 'D-' || lpad(i::text, 6, '0'), cli, case when i % 3 = 0 then 'accepte' else 'envoye' end,
             date '2025-01-01' + (i % 500), round(((i * 41) % 900) + 10.11, 2), round((((i * 41) % 900) + 10.11) * 0.2, 2),
             round(((i * 41) % 900) + 10.11, 2) + round((((i * 41) % 900) + 10.11) * 0.2, 2), timestamptz '2025-01-01' + i * interval '1 minute'
      from generate_series(1, v) i;

    -- Véhicule et outil de l'entreprise.
    insert into public.vehicules (id, entreprise_id, immatriculation, marque, modele, type, statut, kilometrage)
      values (veh, e, 'AA-' || k || '00-AA', 'Renault', 'Master', 'utilitaire', 'actif', 10000);
    insert into public.outils (id, entreprise_id, reference, designation, categorie, statut, etat)
      values (outil, e, 'OUT-1', 'Perforateur', 'electroportatif', 'disponible', 'bon');

    -- Factures fournisseurs : V par axe (sous-traitant, véhicule, outil), toutes
    -- rattachées au chantier 1 pour l'axe sous-traitant. 1 sur 29 annulée.
    insert into public.depenses_fournisseurs (id, entreprise_id, fournisseur_id, chantier_id, vehicule_id, outil_id, numero_piece, categorie,
                                              date_piece, statut, montant_ht, taux_tva, montant_tva, montant_regle)
      select pg_temp.u(pfx || 'd' || a.n, i), e, case a.n when 1 then st else frn end,
             case a.n when 1 then ch1 else null end,
             case a.n when 2 then veh else null end,
             case a.n when 3 then outil else null end,
             a.p || '-' || lpad(i::text, 6, '0'), case a.n when 1 then 'sous_traitance' when 2 then 'transport' else 'location' end,
             date '2025-01-01' + (i % 500),
             case when i % 29 = 0 then 'annulee' when i % 3 = 0 then 'payee' when i % 3 = 1 then 'payee_partiel' else 'a_payer' end,
             y.ht, 20, round(y.ht * 0.2, 2),
             case when i % 3 = 0 then y.ht + round(y.ht * 0.2, 2) when i % 3 = 1 then round(y.ht / 2, 2) else 0 end
      from generate_series(1, v) i
      cross join (values (1, 'ST'), (2, 'VE'), (3, 'OU')) a(n, p)
      cross join lateral (select round(((i * 53) % 1999) + 5.13 + a.n, 2) as ht) y;

    -- Missions du sous-traitant : V, une par chantier, 1 sur 17 annulée.
    insert into public.sous_traitants_chantiers (id, entreprise_id, fournisseur_id, chantier_id, mission, montant_previsionnel_ht, statut, created_at)
      select pg_temp.u(pfx || 'e1', i), e, st, pg_temp.u(pfx || 'ca', i), 'Mission ' || i, round(((i * 31) % 700) + 0.37, 2),
             case when i % 17 = 0 then 'annulee' when i % 3 = 0 then 'en_cours' when i % 3 = 1 then 'prevue' else 'terminee' end,
             timestamptz '2025-01-01' + i * interval '1 minute'
      from generate_series(1, v) i;

    -- Historiques : V relevés kilométriques, V mouvements d'outil.
    insert into public.releves_kilometrage (id, entreprise_id, vehicule_id, date_releve, kilometrage, created_at)
      select pg_temp.u(pfx || 'e2', i), e, veh, date '2020-01-01' + i, 10000 + i * 10, timestamptz '2020-01-01' + i * interval '1 day'
      from generate_series(1, v) i;
    insert into public.mouvements_outillage (id, entreprise_id, outil_id, type, statut_avant, statut_apres, etat, date_mouvement, created_at)
      select pg_temp.u(pfx || 'e3', i), e, outil, case when i % 2 = 0 then 'retour' else 'affectation' end,
             case when i % 2 = 0 then 'affecte' else 'disponible' end, case when i % 2 = 0 then 'disponible' else 'affecte' end, 'bon',
             date '2020-01-01' + i, timestamptz '2020-01-01' + i * interval '1 hour'
      from generate_series(1, v) i;

    -- Fiche chantier 1 : V documents (photos).
    insert into public.documents_chantier (id, entreprise_id, chantier_id, nom, categorie, storage_path, mime_type, taille_octets, audience, created_at)
      select pg_temp.u(pfx || 'e4', i), e, ch1, 'Photo ' || i || '.jpg', 'photo_pendant', 'companies/' || e || '/chantiers/' || ch1 || '/' || i || '.jpg',
             'image/jpeg', 1000 + i, 'tous_affectes', timestamptz '2025-01-01' + i * interval '1 minute'
      from generate_series(1, v) i;
  end loop;
end $$;

-- Partie 2 : paie, notes de frais, CRM, tableau de bord, DOE, messagerie,
-- interventions, appels d'offres, commandes, droits par poste.
do $$
declare
  v int; e uuid; pfx text; adm uuid; ouv uuid; poste_adm uuid; cli uuid; frn uuid; ch1 uuid; per uuid; conv uuid;
  volumes int[] := array[500, 1000, 1462, 5000, 20000, 300];
  prefixes text[] := array['a0500', 'a1000', 'a1462', 'a5000', 'a2000', 'ae000'];
begin
  for k in 1 .. array_length(volumes, 1) loop
    v := volumes[k]; pfx := prefixes[k];
    e := pg_temp.u(pfx || 'e', 1); adm := pg_temp.u(pfx || 'a', 1); ouv := pg_temp.u(pfx || 'a', 2);
    poste_adm := pg_temp.u(pfx || 'b', 1); cli := pg_temp.u(pfx || 'c', 1); frn := pg_temp.u(pfx || 'd', 2);
    ch1 := pg_temp.u(pfx || 'ca', 1); per := pg_temp.u(pfx || 'e5', 1); conv := pg_temp.u(pfx || 'e6', 1);

    -- V salariés ; l'administrateur et l'ouvrier ont chacun leur fiche.
    insert into public.employes (id, entreprise_id, prenom, nom, numero_inscription, identifiant_interne, reference_interne, statut, utilisateur_id)
      select pg_temp.u(pfx || '7e', i), e, 'Prénom' || i, 'Salarié' || lpad(i::text, 6, '0'), 'INS-' || pfx || '-' || i, pfx || '-' || i, 'EMP-' || i, 'actif',
             case i when 1 then adm when 2 then ouv else null end
      from generate_series(1, v) i;

    -- Statuts et échéances de chantiers variés (tableau de bord).
    update public.chantiers set
      statut = (array['en_cours', 'accepte', 'termine', 'a_preparer', 'en_pause', 'archive', 'annule'])[1 + (('x' || substr(md5(id::text), 1, 8))::bit(32)::int & 2147483647) % 7],
      date_fin_prevue = date '2026-01-01' + ((('x' || substr(md5(id::text), 9, 8))::bit(32)::int & 2147483647) % 730),
      updated_at = created_at
    where entreprise_id = e and id <> ch1;

    -- Paie : une période de V dossiers (un par salarié), V anomalies, V pièces.
    insert into public.periodes_paie (id, entreprise_id, mois, date_debut, date_fin, statut, cree_par)
      values (per, e, date '2026-03-01', date '2026-03-01', date '2026-03-31', 'saisie_en_cours', adm);
    insert into public.dossiers_paie_salaries (id, entreprise_id, periode_id, employe_id, statut, total_paniers, total_trajets, total_transports,
                                               total_grands_deplacements, total_primes, total_acomptes, total_notes_frais)
      select pg_temp.u(pfx || 'e7', i), e, per, pg_temp.u(pfx || '7e', i),
             case when i % 3 = 0 then 'a_controler' else 'saisie_en_cours' end,
             round((i % 23) * 10.5, 2), round((i % 7) * 3.25, 2), round((i % 5) * 7.1, 2), round((i % 11) * 31.3, 2),
             round((i % 13) * 50.05, 2), round((i % 4) * 100, 2), round((i % 9) * 12.34, 2)
      from generate_series(1, v) i;
    insert into public.anomalies_paie (id, entreprise_id, periode_id, dossier_id, niveau, code, description)
      select pg_temp.u(pfx || 'e8', i), e, per, pg_temp.u(pfx || 'e7', i), (array['information', 'attention', 'bloquant'])[1 + i % 3], 'CTRL', 'Contrôle ' || i
      from generate_series(1, v) i;
    insert into public.pieces_jointes_paie (id, entreprise_id, employe_id, dossier_id, type_document, nom_original, storage_path, mime_type, taille_octets, importe_par)
      select pg_temp.u(pfx || 'e9', i), e, pg_temp.u(pfx || '7e', i), pg_temp.u(pfx || 'e7', i), 'justificatif', 'piece-' || i || '.pdf',
             'companies/' || e || '/paie/' || i || '.pdf', 'application/pdf', 100 + i, adm
      from generate_series(1, v) i;

    -- Notes de frais : V sur le chantier 1, 60 salariés, statuts variés.
    insert into public.notes_frais (id, entreprise_id, employe_id, reference, date_frais, montant_ttc, categorie, fournisseur, statut, chantier_id, cree_par_utilisateur_id)
      select pg_temp.u(pfx || 'ea', i), e, pg_temp.u(pfx || '7e', 1 + i % 60), 'NF-' || lpad(i::text, 6, '0'), date '2025-01-01' + (i % 500),
             round(((i * 17) % 300) + 4.99, 2), 'repas', 'Restaurant ' || (i % 40),
             (array['brouillon', 'soumis', 'en_verification', 'correction_demandee', 'valide', 'refuse', 'exporte_comptabilite', 'verrouille'])[1 + i % 8],
             ch1, adm
      from generate_series(1, v) i;

    -- CRM : V communications dont 1 sur 3 avec rappel ouvert.
    insert into public.appels_contacts (id, entreprise_id, client_id, type, sens, objet, a_rappeler_at, termine, created_at)
      select pg_temp.u(pfx || 'eb', i), e, cli, 'appel', 'sortant', 'Appel ' || i,
             case when i % 3 = 0 then now() + (i % 30) * interval '1 day' end, i % 6 = 0, timestamptz '2025-01-01' + i * interval '1 minute'
      from generate_series(1, v) i;

    -- Stock / DOE : V articles (1 sur 7 sous le seuil), V sorties vers le
    -- chantier 1 (une par article), une fiche technique par article pair.
    insert into public.articles_stock (id, entreprise_id, reference, designation, unite, quantite_stock, seuil_alerte, actif)
      select pg_temp.u(pfx || 'ec', i), e, 'ART-' || lpad(i::text, 6, '0'), 'Article ' || lpad(i::text, 6, '0'), 'u',
             case when i % 7 = 0 then i % 3 else 10 + i % 90 end, 5, true
      from generate_series(1, v) i;
    insert into public.mouvements_stock (id, entreprise_id, article_id, chantier_id, type, quantite, date)
      select pg_temp.u(pfx || 'ed', i), e, pg_temp.u(pfx || 'ec', i), ch1, 'sortie', 1 + i % 4, date '2025-01-01' + (i % 500)
      from generate_series(1, v) i;
    insert into public.fiches_techniques_articles (id, entreprise_id, article_id, titre, type_document, storage_path, nom_original, mime_type, taille_octets, origine)
      select pg_temp.u(pfx || 'ee', i), e, pg_temp.u(pfx || 'ec', i), 'Fiche ' || i, 'fiche_technique', 'companies/' || e || '/fiches/' || i || '.pdf',
             'fiche-' || i || '.pdf', 'application/pdf', 100 + i, 'import_manuel'
      from generate_series(1, v) i where i % 2 = 0;

    -- Messagerie : une conversation de chantier de V messages.
    insert into public.conversations_internes (id, entreprise_id, type, titre, chantier_id, cree_par_employe_id, derniere_activite_at)
      values (conv, e, 'chantier', 'Chantier 1', ch1, pg_temp.u(pfx || '7e', 1), now());
    insert into public.messages_internes (id, entreprise_id, conversation_id, auteur_employe_id, contenu, created_at)
      select pg_temp.u(pfx || 'ef', i), e, conv, pg_temp.u(pfx || '7e', 1 + i % 2), 'Message ' || i, timestamptz '2025-01-01' + i * interval '1 minute'
      from generate_series(1, v) i;

    -- Interventions, appels d'offres, commandes : V chacun, statuts variés.
    insert into public.interventions (id, entreprise_id, numero, client_id, statut, objet, date_prevue)
      select pg_temp.u(pfx || 'f1', i), e, 'INT-' || lpad(i::text, 6, '0'), cli,
             (array['a_planifier', 'planifiee', 'en_cours', 'terminee', 'facturee', 'annulee'])[1 + i % 6], 'Intervention ' || i, date '2024-01-01' + (i % 1200)
      from generate_series(1, v) i;
    insert into public.appels_offres (id, entreprise_id, reference, titre, statut, date_limite)
      select pg_temp.u(pfx || 'f2', i), e, 'AO-' || lpad(i::text, 6, '0'), 'Appel ' || i,
             (array['a_etudier', 'en_preparation', 'depose', 'gagne', 'perdu', 'abandonne'])[1 + i % 6], date '2024-01-01' + (i % 1200)
      from generate_series(1, v) i;
    insert into public.commandes_fournisseurs (id, entreprise_id, numero, fournisseur_id, statut, date_commande, montant_ht, montant_tva, montant_ttc)
      select pg_temp.u(pfx || 'f3', i), e, 'CMD-' || lpad(i::text, 6, '0'), frn, 'brouillon', date '2024-01-01' + (i % 1200), 100, 20, 120
      from generate_series(1, v) i;

    -- Droits : 12 postes supplémentaires à 100 droits chacun (> 1 000 lignes).
    insert into public.postes (id, entreprise_id, nom) select pg_temp.u(pfx || 'f4', i), e, 'Poste ' || i from generate_series(1, 12) i;
    insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
      select e, pg_temp.u(pfx || 'f4', i), d.cle, true from generate_series(1, 12) i cross join public.permissions_disponibles d;
  end loop;
end $$;

-- Partie 3 : parc (pages /flotte et /outillage) — V outils et V véhicules de
-- plus, échéances variées (un tiers échues), 1 outil sur 9 hors service.
do $$
declare
  v int; e uuid; pfx text;
  volumes int[] := array[500, 1000, 1462, 5000, 20000, 300];
  prefixes text[] := array['a0500', 'a1000', 'a1462', 'a5000', 'a2000', 'ae000'];
begin
  for k in 1 .. array_length(volumes, 1) loop
    v := volumes[k]; pfx := prefixes[k]; e := pg_temp.u(pfx || 'e', 1);
    insert into public.outils (id, entreprise_id, reference, designation, categorie, statut, etat, prochaine_verification)
      select pg_temp.u(pfx || 'f5', i), e, 'OUT-P-' || lpad(i::text, 6, '0'), 'Outil ' || i, 'manuel',
             case when i % 9 = 0 then 'hors_service' else 'disponible' end, 'bon', date '2026-10-01' + ((i % 3) - 1) * 200
      from generate_series(1, v) i;
    insert into public.vehicules (id, entreprise_id, immatriculation, marque, modele, type, statut, kilometrage, controle_technique_echeance)
      select pg_temp.u(pfx || 'f6', i), e, 'PV-' || lpad(i::text, 6, '0'), 'Renault', 'Kangoo', 'utilitaire', 'actif', 1000, date '2026-10-01' + ((i % 3) - 1) * 200
      from generate_series(1, v) i;
  end loop;
end $$;

reset session_replication_role;
analyze;
