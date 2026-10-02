-- Jeu de données volumineux pour la qualification de l'export RGPD V1 (§15). Base de qualification
-- UNIQUEMENT (jamais une base partagée) ; requiert le jeu isolation_multitenant.inc déjà chargé.
-- Variables psql : ent (entreprise), emp (fiche employé du pointage), n (facteur, défaut 1).
-- Volume au facteur 1 : 5 000 clients, 3 000 chantiers, 2 000 devis, 3 000 lignes de devis,
-- 2 000 pointages, 300 documents (métadonnées ; octets déposés par le test) = 15 300 lignes.
\set ON_ERROR_STOP 1
begin;
set local elsatia.capacite_personnes_bypass = 'on';
insert into public.clients (entreprise_id, reference_interne, nom, type, statut, email, telephone, notes)
select :'ent', 'VOL-CLI-' || g, 'Client volumineux ' || g, 'particulier', 'actif', 'client' || g || '@exemple.invalid', '06' || lpad(g::text, 8, '0'),
       repeat('Note de suivi. ', 5)
  from generate_series(1, 5000 * :n) g;
insert into public.chantiers (entreprise_id, reference_interne, client_id, nom, statut, adresse, ville)
select :'ent', 'VOL-CH-' || g, (select id from public.clients where entreprise_id = :'ent' and reference_interne = 'VOL-CLI-' || g),
       'Chantier volumineux ' || g, 'en_cours', g || ' rue des Essais', 'Strasbourg'
  from generate_series(1, 3000 * :n) g;
insert into public.devis (entreprise_id, numero, client_id, chantier_id, statut, montant_ht, montant_tva, montant_ttc)
select :'ent', 'VOL-DEV-' || g, c.client_id, c.id, 'brouillon', 1000, 200, 1200
  from generate_series(1, 2000 * :n) g
  join public.chantiers c on c.entreprise_id = :'ent' and c.reference_interne = 'VOL-CH-' || g;
insert into public.lignes_devis (entreprise_id, devis_id, designation, type, quantite, unite, prix_unitaire_ht, taux_tva, ordre)
select :'ent', d.id, 'Prestation ' || g, 'main_oeuvre', 1 + (g % 5), 'u', 100, 20, g % 3
  from generate_series(1, 3000 * :n) g
  join public.devis d on d.entreprise_id = :'ent' and d.numero = 'VOL-DEV-' || (1 + (g % (2000 * :n)));
insert into public.pointages (entreprise_id, employe_id, chantier_id, date, heures_normales, heures_supplementaires, verification_statut)
select :'ent', :'emp', c.id, date '2024-01-01' + g, 7, 0, 'valide'
  from generate_series(1, 2000 * :n) g
  join public.chantiers c on c.entreprise_id = :'ent' and c.reference_interne = 'VOL-CH-' || (1 + (g % (3000 * :n)));
insert into public.documents_chantier (entreprise_id, chantier_id, nom, storage_path, mime_type, taille_octets, audience)
select :'ent', c.id, 'Photo ' || g || '.jpg', :'ent' || '/' || c.id || '/vol-' || g || '.jpg', 'image/jpeg', 4096, 'gestionnaires'
  from generate_series(1, 300 * :n) g
  join public.chantiers c on c.entreprise_id = :'ent' and c.reference_interne = 'VOL-CH-' || g;
insert into storage.objects (bucket_id, name, metadata)
select 'chantier-documents', d.storage_path, jsonb_build_object('size', 4096, 'mimetype', 'image/jpeg')
  from public.documents_chantier d where d.entreprise_id = :'ent' and d.nom like 'Photo %';
commit;
