-- ELSATIA-FINANCE-AGGREGATES-DATA-CORRECTNESS-V1 — jeu volumétrique local.
-- Cinq entreprises F<V> (V = 500, 1000, 1462, 5000, 20000) portant chacune V
-- lignes par table financière sur la période 2026-01-01 → 2026-06-30, plus une
-- entreprise témoin T (autre tenant) avec 300 lignes par table dans la même
-- période, pour prouver l'isolation. Chaque entreprise a :
--   - un administrateur  (toutes permissions)       : f<V>…001
--   - un ouvrier          (aucune permission finance) : f<V>…002
-- Chargement superutilisateur, triggers métier neutralisés
-- (session_replication_role = replica) : on fabrique des documents déjà émis
-- sans rejouer le cycle de vie. Les RLS, elles, restent actives à la lecture.
\set ON_ERROR_STOP 1
set session_replication_role = replica;
set elsatia.capacite_personnes_bypass = 'on';

create or replace function pg_temp.u(p_prefixe text, p_n bigint) returns uuid language sql immutable as
$$ select (p_prefixe || lpad(to_hex(p_n), 32 - length(p_prefixe), '0'))::uuid $$;

do $$
declare
  v int; e uuid; pfx text; adm uuid; ouv uuid; poste_adm uuid; poste_ouv uuid;
  volumes int[] := array[500, 1000, 1462, 5000, 20000, 300];
  prefixes text[] := array['f0500', 'f1000', 'f1462', 'f5000', 'f2000', 'fe000'];
begin
  for k in 1 .. array_length(volumes, 1) loop
    v := volumes[k]; pfx := prefixes[k];
    e := pg_temp.u(pfx || 'e', 1);
    adm := pg_temp.u(pfx || 'a', 1); ouv := pg_temp.u(pfx || 'a', 2);
    poste_adm := pg_temp.u(pfx || 'b', 1); poste_ouv := pg_temp.u(pfx || 'b', 2);

    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
      ('00000000-0000-0000-0000-000000000000', adm, 'authenticated', 'authenticated', pfx || '-admin@invalid.local', 'x', now(), now(), now()),
      ('00000000-0000-0000-0000-000000000000', ouv, 'authenticated', 'authenticated', pfx || '-ouvrier@invalid.local', 'x', now(), now(), now());
    insert into public.utilisateurs (id, prenom, nom) values (adm, 'Admin', pfx), (ouv, 'Ouvrier', pfx);
    insert into public.entreprises (id, nom, code_adhesion, abonnement_statut, abonnement_essai_debut, abonnement_essai_fin) values (e, 'Bench ' || pfx, upper(pfx) || 'X', 'actif', current_date, current_date + 30);
    insert into public.postes (id, entreprise_id, nom) values (poste_adm, e, 'Administrateur'), (poste_ouv, e, 'Ouvrier');
    insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut) values (adm, e, poste_adm, 'actif'), (ouv, e, poste_ouv, 'actif');
    insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
      select e, poste_adm, d.cle, true from public.permissions_disponibles d;
    insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
      select e, poste_ouv, d.cle, true from public.permissions_disponibles d where d.cle in ('voir_chantiers_assignes', 'acces_pointage', 'saisir_son_pointage');

    insert into public.clients (id, entreprise_id, nom, prenom, reference_interne)
      select pg_temp.u(pfx || 'c', i), e, 'Client ' || i, 'P' || i, 'CLI-' || i from generate_series(1, 50) i;
    insert into public.fournisseurs (id, entreprise_id, reference, nom)
      select pg_temp.u(pfx || 'd', i), e, 'FRN-' || i, 'Fournisseur ' || i from generate_series(1, 30) i;
    insert into public.chantiers (id, entreprise_id, client_id, nom, reference_interne)
      select pg_temp.u(pfx || 'ca', i), e, pg_temp.u(pfx || 'c', 1 + i % 50), 'Chantier ' || i, 'CH-' || i from generate_series(1, 20) i;

    -- Factures : V pièces numérotées, 1 ligne chacune ; 1 sur 20 est un avoir,
    -- 1 sur 33 est annulée. Montants non ronds pour exercer les décimales.
    insert into public.factures (id, entreprise_id, numero, client_id, chantier_id, type, statut, date_emission, date_echeance,
                                 montant_ht, montant_tva, montant_ttc, montant_paye)
      select pg_temp.u(pfx || 'fa', i), e, 'F-' || lpad(i::text, 6, '0'), pg_temp.u(pfx || 'c', 1 + i % 50), pg_temp.u(pfx || 'ca', 1 + i % 20),
             case when i % 20 = 0 then 'avoir' else 'simple' end,
             case when i % 33 = 0 then 'annulee' when i % 4 = 0 then 'payee' when i % 4 = 1 then 'payee_partiel' when i % 4 = 2 then 'en_retard' else 'envoyee' end,
             date '2026-01-01' + (i % 181), date '2026-01-01' + (i % 181) + 30,
             x.ht, round(x.ht * x.taux / 100, 2), x.ht + round(x.ht * x.taux / 100, 2),
             case when i % 4 = 0 then x.ht + round(x.ht * x.taux / 100, 2) when i % 4 = 1 then round((x.ht + round(x.ht * x.taux / 100, 2)) / 3, 2) else 0 end
      from generate_series(1, v) i
      cross join lateral (select round((((i * 37) % 997) + 1) * 3 * (1 - ((i % 5) * 2.5) / 100) * 1.07, 2) as ht,
                                 (array[20, 10, 5.5, 20, 0])[1 + i % 5]::numeric as taux) x;
    -- Chaque avoir est rattaché à la facture précédente (jamais un avoir).
    update public.factures set facture_origine_id = pg_temp.u(pfx || 'fa', ('x' || lpad(right(id::text, 12), 16, '0'))::bit(64)::bigint - 1)
      where entreprise_id = e and type = 'avoir';
    insert into public.lignes_factures (id, facture_id, entreprise_id, designation, quantite, prix_unitaire_ht, remise_ligne, taux_tva, ordre)
      select pg_temp.u(pfx || '1f', i), pg_temp.u(pfx || 'fa', i), e, 'Prestation ' || i, 3, (((i * 37) % 997) + 1) * 1.07,
             (i % 5) * 2.5, (array[20, 10, 5.5, 20, 0])[1 + i % 5], 1
      from generate_series(1, v) i;
    insert into public.paiements (id, facture_id, montant, date, mode, reference)
      select pg_temp.u(pfx || '9a', i), pg_temp.u(pfx || 'fa', i), round(((i * 13) % 900) + 10.37, 2), date '2026-01-01' + (i % 181), 'virement', 'VIR-' || i
      from generate_series(1, v) i;

    insert into public.depenses_fournisseurs (id, entreprise_id, fournisseur_id, chantier_id, numero_piece, categorie, date_piece, date_echeance,
                                              statut, montant_ht, taux_tva, montant_tva, montant_regle)
      select pg_temp.u(pfx || 'df', i), e, pg_temp.u(pfx || 'd', 1 + i % 30), case when i % 3 = 0 then null else pg_temp.u(pfx || 'ca', 1 + i % 20) end,
             'FF-' || lpad(i::text, 6, '0'), (array['materiaux', 'sous_traitance', 'location', 'transport', 'autre'])[1 + i % 5],
             date '2026-01-01' + (i % 181), date '2026-01-01' + (i % 181) + 45,
             case when i % 29 = 0 then 'annulee' when i % 3 = 0 then 'payee' when i % 3 = 1 then 'payee_partiel' else 'a_payer' end,
             y.ht, y.taux, round(y.ht * y.taux / 100, 2),
             case when i % 3 = 0 then y.ht + round(y.ht * y.taux / 100, 2) when i % 3 = 1 then round(y.ht / 2, 2) else 0 end
      from generate_series(1, v) i
      cross join lateral (select round(((i * 53) % 1999) + 5.13, 2) as ht, (array[20, 10, 5.5, 2.1, 0])[1 + i % 5]::numeric as taux) y;
    insert into public.reglements_fournisseurs (id, entreprise_id, depense_id, montant, date, mode)
      select pg_temp.u(pfx || 'af', i), e, pg_temp.u(pfx || 'df', i), round(((i * 7) % 500) + 1.11, 2), date '2026-01-01' + (i % 181), 'virement'
      from generate_series(1, v) i;

    -- Notes de frais validées (V), un justificatif par note, trois fichiers
    -- par justificatif (original / consultation / archive figée), trois
    -- validations par note : l'export ZIP lit 3 V versions et 3 V validations.
    insert into public.notes_frais (id, entreprise_id, reference, date_frais, montant_ttc, montant_ht, montant_tva, taux_tva, categorie,
                                    fournisseur, statut, chantier_id, valide_at)
      select pg_temp.u(pfx || '0f', i), e, 'NF-' || lpad(i::text, 6, '0'), date '2026-01-01' + (i % 181),
             round(((i * 17) % 300) + 4.99, 2), round((((i * 17) % 300) + 4.99) / 1.2, 2), round(((i * 17) % 300) + 4.99, 2) - round((((i * 17) % 300) + 4.99) / 1.2, 2), 20,
             'repas', 'Restaurant ' || (i % 40), 'valide', pg_temp.u(pfx || 'ca', 1 + i % 20), now()
      from generate_series(1, v) i;
    insert into public.documents_notes_frais (id, entreprise_id, note_frais_id, type_document, nombre_pages)
      select pg_temp.u(pfx || '0d', i), e, pg_temp.u(pfx || '0f', i), 'ticket_caisse', 1 from generate_series(1, v) i;
    insert into public.versions_documents_notes_frais (id, entreprise_id, document_id, numero_version, numero_page, role_fichier, storage_path,
                                                       nom_fichier_original, type_mime_detecte, taille_octets, empreinte_sha256)
      select pg_temp.u(pfx || '0e' || r.n, i), e, pg_temp.u(pfx || '0d', i), 1, 1, r.role,
             'companies/' || e || '/notes/' || i || '/' || r.role || '.jpg', 'ticket-' || i || '.jpg', 'image/jpeg', 1000 + i,
             encode(extensions.digest(i::text || r.role, 'sha256'), 'hex')
      from generate_series(1, v) i
      cross join (values (1, 'original'), (2, 'consultation'), (3, 'archive_figee')) r(n, role);
    insert into public.validations_notes_frais (id, entreprise_id, note_frais_id, action, ancien_statut, nouveau_statut, created_at)
      select pg_temp.u(pfx || '0a' || a.n, i), e, pg_temp.u(pfx || '0f', i), a.action, a.ancien, a.nouveau, timestamptz '2026-01-01' + (i % 181) * interval '1 day' + a.n * interval '1 hour'
      from generate_series(1, v) i
      cross join (values (1, 'soumission', 'brouillon', 'soumis'), (2, 'prise_en_charge', 'soumis', 'en_verification'), (3, 'validation', 'en_verification', 'valide')) a(n, action, ancien, nouveau);

    -- Stock : V articles actifs (1 sur 7 sous le seuil), un inventaire validé
    -- de V lignes, V sorties de stock vers les chantiers.
    insert into public.articles_stock (id, entreprise_id, reference, designation, unite, quantite_stock, seuil_alerte, prix_achat_ht, actif)
      select pg_temp.u(pfx || '5a', i), e, 'ART-' || lpad(i::text, 6, '0'), 'Article ' || lpad(i::text, 6, '0'), 'u',
             case when i % 7 = 0 then 1 else 10 + i % 90 end, 5, round(((i * 29) % 400) + 0.73, 2), true
      from generate_series(1, v) i;
    insert into public.inventaires (id, entreprise_id, numero, date_inventaire, statut, valide_at)
      values (pg_temp.u(pfx || '5b', 1), e, 'INV-' || pfx, date '2026-06-30', 'valide', now());
    insert into public.lignes_inventaire (id, entreprise_id, inventaire_id, article_id, quantite_theorique, quantite_comptee, prix_achat_ht_snapshot, created_at)
      select pg_temp.u(pfx || '5c', i), e, pg_temp.u(pfx || '5b', 1), pg_temp.u(pfx || '5a', i),
             case when i % 7 = 0 then 1 else 10 + i % 90 end, case when i % 11 = 0 then 9 + i % 90 else case when i % 7 = 0 then 1 else 10 + i % 90 end end,
             round(((i * 29) % 400) + 0.73, 2), timestamptz '2026-06-30 08:00' + (i % 50) * interval '1 second'
      from generate_series(1, v) i;
    insert into public.mouvements_stock (id, entreprise_id, article_id, chantier_id, type, quantite, date)
      select pg_temp.u(pfx || '5d', i), e, pg_temp.u(pfx || '5a', i), pg_temp.u(pfx || 'ca', 1 + i % 20), 'sortie', 1 + i % 4, date '2026-01-01' + (i % 181)
      from generate_series(1, v) i;

    -- Pointage : 60 salariés ; V pointages validés / à vérifier, V sessions et
    -- V contrôles GPS en mars 2026 ; V affectations sur la semaine du
    -- 2 au 8 mars 2026 (planning).
    insert into public.employes (id, entreprise_id, prenom, nom, numero_inscription, identifiant_interne, reference_interne, statut)
      select pg_temp.u(pfx || '7e', i), e, 'Prénom' || i, 'Salarié' || lpad(i::text, 3, '0'), 'INS-' || pfx || '-' || i, pfx || '-' || i, 'EMP-' || i, 'actif'
      from generate_series(1, 60) i;
    insert into public.pointages (id, entreprise_id, employe_id, chantier_id, date, heures_normales, heures_supplementaires, verification_statut, origine_pointage)
      select pg_temp.u(pfx || '7a', i), e, pg_temp.u(pfx || '7e', 1 + i % 60), pg_temp.u(pfx || 'ca', 1 + i % 20), date '2026-03-01' + (i % 31),
             round(1 + (i % 13) * 0.5, 2), round((i % 4) * 0.25, 2), case when i % 5 = 0 then 'a_verifier' else 'valide' end, 'gps_complet'
      from generate_series(1, v) i;
    insert into public.sessions_pointage (id, entreprise_id, employe_id, chantier_id, arrivee_at, depart_at, pause_minutes, latitude_arrivee, longitude_arrivee, pointage_id)
      select pg_temp.u(pfx || '7b', i), e, pg_temp.u(pfx || '7e', 1 + i % 60), pg_temp.u(pfx || 'ca', 1 + i % 20),
             timestamptz '2026-03-01 07:00+01' + (i % 31) * interval '1 day' + (i % 120) * interval '1 second',
             timestamptz '2026-03-01 16:00+01' + (i % 31) * interval '1 day' + (i % 120) * interval '1 second', 60, 48.85, 2.35, pg_temp.u(pfx || '7a', i)
      from generate_series(1, v) i;
    insert into public.verifications_zone_pointage (id, entreprise_id, session_id, employe_id, chantier_id, latitude, longitude, distance_metres, dans_zone, created_at)
      select pg_temp.u(pfx || '7c', i), e, pg_temp.u(pfx || '7b', i), pg_temp.u(pfx || '7e', 1 + i % 60), pg_temp.u(pfx || 'ca', 1 + i % 20), 48.85, 2.35, i % 300, i % 9 <> 0,
             timestamptz '2026-03-01 10:00+01' + (i % 31) * interval '1 day' + (i % 120) * interval '1 second'
      from generate_series(1, v) i;
    insert into public.affectations (id, entreprise_id, chantier_id, employe_id, date, heures, type_activite, tache)
      select pg_temp.u(pfx || '7d', i), e, pg_temp.u(pfx || 'ca', 1 + i % 20), pg_temp.u(pfx || '7e', 1 + i % 60), date '2026-03-02' + (i % 7), round(0.5 + (i % 15) * 0.5, 2), 'chantier', 'Tâche ' || i
      from generate_series(1, v) i;
  end loop;
end $$;

reset session_replication_role;
analyze;
