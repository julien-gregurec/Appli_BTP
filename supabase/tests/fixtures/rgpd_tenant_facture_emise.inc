-- Tenant réaliste pour la réconciliation RGPD × facture émise (V1). À inclure APRÈS
-- fixtures/isolation_multitenant.inc (entreprises A/B, admin-a, postes, permissions).
--
-- Tout le cycle de vie passe par les chemins applicatifs réels, sous l'identité de
-- l'administrateur du tenant A (auth.uid() = admin-a) : client avec données
-- personnelles, chantier géolocalisé, devis envoyé puis accepté, avenant accepté,
-- acompte 30 % et
-- facture finale 70 % via creer_facture_avancee, émission, paiements via
-- enregistrer_paiement_facture, avoir sur la finale, note de frais rattachée au
-- chantier, document de chantier et logo réellement présents dans Storage.
--
-- Identifiants fixes (préfixe c...) pour des diagnostics reproductibles.
set local elsatia.capacite_personnes_bypass = 'on';

-- Logo de l'entreprise A (bucket public, URL publique comme getPublicUrl()).
insert into storage.buckets (id, name, public) values ('logos', 'logos', true) on conflict (id) do nothing;
insert into storage.objects (id, bucket_id, name, metadata) values
  ('c8000000-0000-0000-0000-000000000001', 'logos', 'a0000000-0000-0000-0000-000000000001/logo.png', '{"mimetype":"image/png"}'),
  ('c8000000-0000-0000-0000-000000000002', 'chantier-documents', 'a0000000-0000-0000-0000-000000000001/c2000000-0000-0000-0000-000000000001/photo-avant.jpg', '{"mimetype":"image/jpeg"}')
on conflict (id) do nothing;
update public.entreprises
   set raison_sociale = 'Isolation A Bâtiment SARL', siret = '12345678900011',
       adresse = '10 rue du Chantier', code_postal = '67000', ville = 'Strasbourg',
       logo_url = 'http://localhost/storage/v1/object/public/logos/a0000000-0000-0000-0000-000000000001/logo.png',
       assurance_decennale_numero = 'DEC-2026-001', assurance_decennale_assureur = 'Assureur Test'
 where id = 'a0000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

insert into public.clients (id, entreprise_id, type, nom, prenom, adresse_facturation, code_postal, ville, telephone, email, statut)
values ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'particulier',
        'Lefèvre', 'Marc', '3 impasse des Lilas', '67100', 'Strasbourg', '0611223344', 'marc.lefevre@example.test', 'actif');

insert into public.chantiers (id, entreprise_id, client_id, nom, adresse, code_postal, ville, statut, latitude, longitude)
values ('c2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
        'Rénovation maison Lefèvre', '3 impasse des Lilas', '67100', 'Strasbourg', 'en_cours', 48.5734, 7.7521);

insert into public.devis (id, entreprise_id, client_id, chantier_id, statut, date_emission)
values ('c3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
        'c2000000-0000-0000-0000-000000000001', 'brouillon', current_date - 60);
insert into public.lignes_devis (id, devis_id, designation, type, quantite, unite, prix_unitaire_ht, taux_tva, ordre) values
  ('c3100000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'Dépose cloisons', 'main_oeuvre', 1, 'forfait', 1200.00, 10, 1),
  ('c3100000-0000-0000-0000-000000000002', 'c3000000-0000-0000-0000-000000000001', 'Placo + isolation', 'fourniture', 40, 'm2', 30.00, 10, 2),
  ('c3100000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000001', 'Peinture', 'main_oeuvre', 40, 'm2', 20.00, 20, 3);
update public.devis set statut = 'envoye' where id = 'c3000000-0000-0000-0000-000000000001';
update public.devis set statut = 'accepte' where id = 'c3000000-0000-0000-0000-000000000001';

-- Avenant accepté (travaux supplémentaires), inclus dans le montant contractuel.
select set_config('rgpd.fx_avenant', public.creer_avenant(
  'a0000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'Travaux supplémentaires', null,
  '[{"designation":"Prise supplémentaire","type":"main_oeuvre","quantite":2,"unite":"u","prix_unitaire_ht":80,"taux_tva":10}]'::jsonb)::text, true);
update public.avenants set statut = 'envoye' where id = current_setting('rgpd.fx_avenant')::uuid;
update public.avenants set statut = 'accepte' where id = current_setting('rgpd.fx_avenant')::uuid;

-- Acompte 30 % puis facture finale 70 %, émises (sans passer d'identité émettrice :
-- la capture en base, R4, doit la figer).
select set_config('rgpd.fx_acompte', public.creer_facture_avancee(
  'a0000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'acompte', 30, false, null)::text, true);
update public.factures set statut = 'envoyee' where id = current_setting('rgpd.fx_acompte')::uuid;
select set_config('rgpd.fx_finale', public.creer_facture_avancee(
  'a0000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'finale', 70, true, null)::text, true);
update public.factures set statut = 'envoyee' where id = current_setting('rgpd.fx_finale')::uuid;

-- Paiements : acompte soldé, finale réglée en partie.
select public.enregistrer_paiement_facture('a0000000-0000-0000-0000-000000000001', current_setting('rgpd.fx_acompte')::uuid,
  (select montant_ttc from public.factures where id = current_setting('rgpd.fx_acompte')::uuid), current_date - 20, 'virement', 'VIR-ACOMPTE');
select public.enregistrer_paiement_facture('a0000000-0000-0000-0000-000000000001', current_setting('rgpd.fx_finale')::uuid,
  500, current_date - 5, 'cheque', 'CHQ-0001');

-- Avoir de 10 % sur la finale, émis.
select set_config('rgpd.fx_avoir', public.creer_facture_avancee(
  'a0000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'avoir', 10, false, current_setting('rgpd.fx_finale')::uuid)::text, true);
update public.factures set statut = 'envoyee' where id = current_setting('rgpd.fx_avoir')::uuid;

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.email', '', true);
select set_config('request.jwt.claims', '', true);

-- Données opérationnelles annexes (saisies ici en fixture, hors RLS : seul leur
-- rattachement au chantier compte pour la purge).
insert into public.notes_frais (id, entreprise_id, employe_id, chantier_id, reference, montant_ttc, statut)
values ('c4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002',
        'c2000000-0000-0000-0000-000000000001', 'NDF-LEFEVRE-1', 42.50, 'brouillon');
insert into public.documents_chantier (id, entreprise_id, chantier_id, nom, storage_path, mime_type, taille_octets, audience)
values ('c5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001',
        'Photo avant travaux', 'a0000000-0000-0000-0000-000000000001/c2000000-0000-0000-0000-000000000001/photo-avant.jpg', 'image/jpeg', 10, 'gestionnaires');

