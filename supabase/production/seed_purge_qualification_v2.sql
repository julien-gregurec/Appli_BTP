-- ═══════════════════════════════════════════════════════════════════════
-- Jeu de données de qualification RGPD — architecture de purge V2
-- (supabase/migrations/20260923000331_purge_entreprise_architecture_v2.sql)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Deux entreprises fixes, à référencer par les phases suivantes de la
-- qualification (purge réelle, vérification post-purge) :
--
--   Tenant A « Entreprise Purge Qualification V2 »
--     id = aaaaaaaa-0000-0000-0000-000000000001
--     Locataire multi-domaines à purger : clients, fournisseurs, employés
--     (avec photo/signature/carte BTP réellement stockées), devis, chantiers,
--     factures (dont un avoir et une facture chantier+devis pour le
--     mécanisme d'instantané F8), paiements, notes de frais (dont une
--     verrouillée par un virement, pour vérifier le correctif F3), lots et
--     ordres de virement, préparation de paie (périodes/dossiers/journal
--     d'audit immuable), signatures de documents (immuables), pointages et
--     sessions de pointage (avec GPS et photos), journal d'activité.
--
--   Tenant B « Entreprise Controle B »
--     id = aaaaaaaa-0000-0000-0000-000000000002
--     Locataire témoin, non purgé, pour prouver l'étanchéité entre
--     entreprises (aucune ligne du Tenant B ne doit changer après la purge
--     du Tenant A).
--
-- Remarque de périmètre : aucune table du schéma public ne correspond à des
-- « réserves » de chantier (défauts/levées de réserve) dans cette base — le
-- seul résultat pour "reserve" dans les migrations est le mot français
-- « réservé » dans un message d'erreur. Rien n'est donc semé pour ce point
-- de la mission ; il n'existe simplement pas de table à peupler.
--
-- Idempotence : toutes les lignes utilisent des UUID fixes et des
-- INSERT ... ON CONFLICT (id) DO NOTHING. Les blocs qui doivent respecter le
-- déclencheur "brouillon uniquement" de lignes_factures (trg_lignes_factures_
-- brouillon_only) sont protégés par un test d'existence (DO $$ ... $$) pour
-- rester rejouables sans lever d'exception sur une base déjà semée.
--
-- Volumétrie volontairement compacte (5-20 lignes par table), suffisante
-- pour exercer chaque branche de rapport_purge_entreprise() / verifier_
-- storage_entreprise() sans viser un volume réaliste de production.

begin;

set statement_timeout = '5min';

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Entreprises
-- ═══════════════════════════════════════════════════════════════════════

insert into public.entreprises (id, nom, raison_sociale, siret, adresse, code_postal, ville, forme_juridique)
values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Entreprise Purge Qualification V2',
  'Entreprise Purge Qualification V2 SARL',
  '123 456 789 00012',
  '12 Rue de la Qualification',
  '75010',
  'Paris',
  'SARL'
)
on conflict (id) do nothing;

insert into public.entreprises (id, nom, raison_sociale, siret, adresse, code_postal, ville, forme_juridique)
values (
  'aaaaaaaa-0000-0000-0000-000000000002',
  'Entreprise Controle B',
  'Entreprise Controle B SAS',
  '987 654 321 00099',
  '5 Avenue Temoin',
  '69000',
  'Lyon',
  'SAS'
)
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Postes + utilisateur admin (auth.users déclenche la création de
--    public.utilisateurs via le trigger on_auth_user_created)
-- ═══════════════════════════════════════════════════════════════════════

insert into public.postes (id, entreprise_id, nom)
values ('aaaaaaaa-a000-0001-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Admin/Gérant')
on conflict (id) do nothing;

insert into public.postes (id, entreprise_id, nom)
values ('bbbbbbbb-b000-0001-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'Admin/Gérant')
on conflict (id) do nothing;

insert into auth.users (id, email, raw_user_meta_data)
values (
  'aaaaaaaa-a000-0002-0000-000000000001',
  'admin.qualification-v2@example.test',
  jsonb_build_object('nom', 'Admin', 'prenom', 'QualifV2')
)
on conflict (id) do nothing;

insert into auth.users (id, email, raw_user_meta_data)
values (
  'bbbbbbbb-b000-0002-0000-000000000001',
  'admin.controle-b@example.test',
  jsonb_build_object('nom', 'Admin', 'prenom', 'ControleB')
)
on conflict (id) do nothing;

insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut)
values ('aaaaaaaa-a000-0002-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0001-0000-000000000001', 'actif')
on conflict do nothing;

insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut)
values ('bbbbbbbb-b000-0002-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'bbbbbbbb-b000-0001-0000-000000000001', 'actif')
on conflict do nothing;

update public.utilisateurs set entreprise_active_id = 'aaaaaaaa-0000-0000-0000-000000000001'
where id = 'aaaaaaaa-a000-0002-0000-000000000001' and entreprise_active_id is null;

update public.utilisateurs set entreprise_active_id = 'aaaaaaaa-0000-0000-0000-000000000002'
where id = 'bbbbbbbb-b000-0002-0000-000000000001' and entreprise_active_id is null;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Tenant A — clients (données personnelles : email/telephone/adresse)
-- ═══════════════════════════════════════════════════════════════════════

insert into public.clients
  (id, entreprise_id, type, nom, prenom, societe, raison_sociale, siret, adresse_facturation, code_postal, ville, telephone, email, statut)
values
  ('aaaaaaaa-a000-0003-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'particulier', 'Lefevre', 'Marc', null, null, null, '3 Impasse des Lilas', '75011', 'Paris', '0611223344', 'marc.lefevre@example.test', 'actif'),
  ('aaaaaaaa-a000-0003-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'professionnel', null, null, 'Bati Concept SARL', 'Bati Concept SARL', '111 222 333 00045', '18 Rue de l''Industrie', '75012', 'Paris', '0142000000', 'contact@baticoncept.test', 'actif'),
  ('aaaaaaaa-a000-0003-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'syndic', null, null, 'Syndic Haussmann', 'Syndic Haussmann SA', '222 333 444 00056', '9 Boulevard Haussmann', '75009', 'Paris', '0145670000', 'gestion@syndic-haussmann.test', 'actif'),
  ('aaaaaaaa-a000-0003-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'promoteur', null, null, 'Promotion Rive Gauche', 'Promotion Rive Gauche SAS', '333 444 555 00067', '2 Quai Voltaire', '75007', 'Paris', '0148900000', 'contact@promotion-rg.test', 'prospect'),
  ('aaaaaaaa-a000-0003-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'collectivite', null, null, 'Mairie de Testville', 'Mairie de Testville', null, '1 Place de la Mairie', '69100', 'Testville', '0472000000', 'services-techniques@testville.test', 'actif')
on conflict (id) do nothing;

-- Fournisseurs
insert into public.fournisseurs
  (id, entreprise_id, reference, nom, contact_nom, email, telephone, adresse, code_postal, ville, siret, type_tiers)
values
  ('aaaaaaaa-a000-0004-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'FRN-001', 'Materiaux du Nord', 'Bernard Dubois', 'commandes@materiaux-nord.test', '0320000001', '4 Route de Lille', '59000', 'Lille', '444 555 666 00078', 'fournisseur'),
  ('aaaaaaaa-a000-0004-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'FRN-002', 'SousTraitance Elec Pro', 'Sami Kader', 'contact@elecpro.test', '0620000002', '7 Rue Ampère', '93000', 'Bobigny', '555 666 777 00089', 'sous_traitant'),
  ('aaaaaaaa-a000-0004-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'FRN-003', 'Location BTP Services', 'Claire Petit', 'location@btpservices.test', '0130000003', '15 Zone Industrielle', '78000', 'Versailles', '666 777 888 00090', 'fournisseur'),
  ('aaaaaaaa-a000-0004-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'FRN-004', 'Peinture Finitions SARL', 'Yasmine Lopez', 'devis@peinture-finitions.test', '0140000004', '22 Avenue des Arts', '94000', 'Créteil', '777 888 999 00101', 'fournisseur')
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Tenant A — employés, avec pièces stockées réelles (photo, signature,
--    carte BTP) pour E1 et E2, photo seule pour E3 (vérifie verifier_
--    storage_entreprise sur un mix de colonnes *_storage_path renseignées).
-- ═══════════════════════════════════════════════════════════════════════

insert into public.employes
  (id, entreprise_id, prenom, nom, email, telephone, poste, type_contrat, date_entree, statut,
   photo_storage_path, photo_nom, photo_mime_type,
   signature_storage_path,
   carte_btp_storage_path, carte_btp_nom, carte_btp_mime_type, carte_btp_numero, carte_btp_expiration)
values
  ('aaaaaaaa-a000-0005-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Julien', 'Moreau', 'julien.moreau@example.test', '0611110001', 'Chef de chantier', 'cdi', '2019-03-01', 'actif',
   'aaaaaaaa-0000-0000-0000-000000000001/employes/aaaaaaaa-a000-0005-0000-000000000001/photo.jpg', 'photo.jpg', 'image/jpeg',
   'aaaaaaaa-0000-0000-0000-000000000001/employes/aaaaaaaa-a000-0005-0000-000000000001/signature.png',
   'aaaaaaaa-0000-0000-0000-000000000001/employes/aaaaaaaa-a000-0005-0000-000000000001/carte-btp.jpg', 'carte-btp.jpg', 'image/jpeg', 'BTP2026000001', '2027-06-30'),
  ('aaaaaaaa-a000-0005-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Karim', 'Belkacem', 'karim.belkacem@example.test', '0611110002', 'Maçon', 'cdi', '2020-09-15', 'actif',
   'aaaaaaaa-0000-0000-0000-000000000001/employes/aaaaaaaa-a000-0005-0000-000000000002/photo.jpg', 'photo.jpg', 'image/jpeg',
   null,
   'aaaaaaaa-0000-0000-0000-000000000001/employes/aaaaaaaa-a000-0005-0000-000000000002/carte-btp.jpg', 'carte-btp.jpg', 'image/jpeg', 'BTP2026000002', '2027-01-31'),
  ('aaaaaaaa-a000-0005-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Sophie', 'Nguyen', 'sophie.nguyen@example.test', '0611110003', 'Comptable paie', 'cdi', '2021-01-10', 'actif',
   'aaaaaaaa-0000-0000-0000-000000000001/employes/aaaaaaaa-a000-0005-0000-000000000003/photo.jpg', 'photo.jpg', 'image/jpeg',
   null, null, null, null, null, null),
  ('aaaaaaaa-a000-0005-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'Thomas', 'Petit', 'thomas.petit@example.test', '0611110004', 'Electricien', 'cdd', '2024-04-01', 'actif',
   null, null, null, null, null, null, null, null, null),
  ('aaaaaaaa-a000-0005-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'Amine', 'Cherif', 'amine.cherif@example.test', '0611110005', 'Apprenti', 'apprenti', '2025-09-01', 'actif',
   null, null, null, null, null, null, null, null, null)
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Tenant A — chantiers
-- ═══════════════════════════════════════════════════════════════════════

insert into public.chantiers
  (id, entreprise_id, client_id, nom, adresse, code_postal, ville, statut, responsable_id, date_debut_prevue, latitude, longitude)
values
  ('aaaaaaaa-a000-0006-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0003-0000-000000000001', 'Renovation appartement Lefevre', '3 Impasse des Lilas', '75011', 'Paris', 'en_cours', 'aaaaaaaa-a000-0005-0000-000000000001', '2026-07-01', 48.856600, 2.352200),
  ('aaaaaaaa-a000-0006-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0003-0000-000000000002', 'Extension local commercial Bati Concept', '18 Rue de l''Industrie', '75012', 'Paris', 'termine', null, '2026-02-01', 48.840500, 2.378900),
  ('aaaaaaaa-a000-0006-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0003-0000-000000000003', 'Ravalement facade Syndic Haussmann', '9 Boulevard Haussmann', '75009', 'Paris', 'accepte', null, '2026-09-15', 48.874500, 2.331200),
  ('aaaaaaaa-a000-0006-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0003-0000-000000000004', 'Programme neuf Rive Gauche', '2 Quai Voltaire', '75007', 'Paris', 'prospect', null, null, null, null)
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════
-- 6. Tenant A — devis + lignes de devis
-- ═══════════════════════════════════════════════════════════════════════

insert into public.devis (id, entreprise_id, client_id, chantier_id, statut, date_emission)
values
  ('aaaaaaaa-a000-0007-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0003-0000-000000000001', 'aaaaaaaa-a000-0006-0000-000000000001', 'accepte', '2026-06-15'),
  ('aaaaaaaa-a000-0007-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0003-0000-000000000002', 'aaaaaaaa-a000-0006-0000-000000000002', 'envoye', '2026-01-20'),
  ('aaaaaaaa-a000-0007-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0003-0000-000000000003', 'aaaaaaaa-a000-0006-0000-000000000003', 'brouillon', '2026-08-20'),
  ('aaaaaaaa-a000-0007-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0003-0000-000000000004', null, 'refuse', '2026-05-05')
on conflict (id) do nothing;

insert into public.lignes_devis (id, devis_id, designation, type, quantite, unite, prix_unitaire_ht, taux_tva, ordre)
values
  ('aaaaaaaa-a000-0008-0000-000000000001', 'aaaaaaaa-a000-0007-0000-000000000001', 'Depose cloisons existantes', 'main_oeuvre', 1, 'forfait', 1200.00, 10, 1),
  ('aaaaaaaa-a000-0008-0000-000000000002', 'aaaaaaaa-a000-0007-0000-000000000001', 'Fourniture placo + isolation', 'fourniture', 45, 'm2', 28.50, 10, 2),
  ('aaaaaaaa-a000-0008-0000-000000000003', 'aaaaaaaa-a000-0007-0000-000000000001', 'Peinture 2 couches', 'main_oeuvre', 45, 'm2', 22.00, 10, 3),
  ('aaaaaaaa-a000-0008-0000-000000000004', 'aaaaaaaa-a000-0007-0000-000000000002', 'Structure metallique extension', 'sous_traitance', 1, 'forfait', 8500.00, 20, 1),
  ('aaaaaaaa-a000-0008-0000-000000000005', 'aaaaaaaa-a000-0007-0000-000000000002', 'Bardage exterieur', 'fourniture', 60, 'm2', 65.00, 20, 2),
  ('aaaaaaaa-a000-0008-0000-000000000006', 'aaaaaaaa-a000-0007-0000-000000000003', 'Ravalement facade', 'main_oeuvre', 220, 'm2', 45.00, 10, 1),
  ('aaaaaaaa-a000-0008-0000-000000000007', 'aaaaaaaa-a000-0007-0000-000000000004', 'Etude de faisabilite', 'forfait', 1, 'forfait', 3500.00, 20, 1)
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════
-- 7. Tenant A — factures (créées en 'brouillon', lignes ajoutées puis
--    statut mis à jour, à cause du trigger trg_lignes_factures_brouillon_
--    only). FA1 porte chantier_id ET devis_origine_id non nuls (F8). FA2
--    est un avoir qui crédite FA1 (facture_origine_id). Chaque bloc est
--    protégé par un test d'existence des lignes pour rester rejouable.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.factures (id, entreprise_id, client_id, chantier_id, devis_origine_id, type, statut, date_emission, date_echeance)
values ('aaaaaaaa-a000-0009-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0003-0000-000000000001', 'aaaaaaaa-a000-0006-0000-000000000001', 'aaaaaaaa-a000-0007-0000-000000000001', 'finale', 'brouillon', '2026-08-01', '2026-08-31')
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from public.lignes_factures where facture_id = 'aaaaaaaa-a000-0009-0000-000000000001') then
    insert into public.lignes_factures (id, facture_id, designation, type, quantite, unite, prix_unitaire_ht, taux_tva, ordre)
    values
      ('aaaaaaaa-a000-000a-0000-000000000001', 'aaaaaaaa-a000-0009-0000-000000000001', 'Depose cloisons existantes', 'main_oeuvre', 1, 'forfait', 1200.00, 10, 1),
      ('aaaaaaaa-a000-000a-0000-000000000002', 'aaaaaaaa-a000-0009-0000-000000000001', 'Fourniture placo + isolation', 'fourniture', 45, 'm2', 28.50, 10, 2),
      ('aaaaaaaa-a000-000a-0000-000000000003', 'aaaaaaaa-a000-0009-0000-000000000001', 'Peinture 2 couches', 'main_oeuvre', 45, 'm2', 22.00, 10, 3);
    update public.factures set statut = 'envoyee' where id = 'aaaaaaaa-a000-0009-0000-000000000001';
  end if;
end $$;

-- FA2 : avoir credit note sur FA1 (chantier + devis repris, lignes negatives).
insert into public.factures (id, entreprise_id, client_id, chantier_id, devis_origine_id, facture_origine_id, type, statut, date_emission)
values ('aaaaaaaa-a000-0009-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0003-0000-000000000001', 'aaaaaaaa-a000-0006-0000-000000000001', 'aaaaaaaa-a000-0007-0000-000000000001', 'aaaaaaaa-a000-0009-0000-000000000001', 'avoir', 'brouillon', '2026-08-20')
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from public.lignes_factures where facture_id = 'aaaaaaaa-a000-0009-0000-000000000002') then
    insert into public.lignes_factures (id, facture_id, designation, type, quantite, unite, prix_unitaire_ht, taux_tva, ordre)
    values ('aaaaaaaa-a000-000a-0000-000000000004', 'aaaaaaaa-a000-0009-0000-000000000002', 'Avoir : moins-value peinture (surface revue)', 'main_oeuvre', -10, 'm2', 22.00, 10, 1);
    update public.factures set statut = 'envoyee' where id = 'aaaaaaaa-a000-0009-0000-000000000002';
  end if;
end $$;

-- FA3 : simple, chantier sans devis, impayee et en retard.
insert into public.factures (id, entreprise_id, client_id, chantier_id, type, statut, date_emission, date_echeance)
values ('aaaaaaaa-a000-0009-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0003-0000-000000000002', 'aaaaaaaa-a000-0006-0000-000000000002', 'simple', 'brouillon', '2026-03-01', '2026-03-31')
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from public.lignes_factures where facture_id = 'aaaaaaaa-a000-0009-0000-000000000003') then
    insert into public.lignes_factures (id, facture_id, designation, type, quantite, unite, prix_unitaire_ht, taux_tva, ordre)
    values
      ('aaaaaaaa-a000-000a-0000-000000000005', 'aaaaaaaa-a000-0009-0000-000000000003', 'Structure metallique extension', 'sous_traitance', 1, 'forfait', 8500.00, 20, 1),
      ('aaaaaaaa-a000-000a-0000-000000000006', 'aaaaaaaa-a000-0009-0000-000000000003', 'Bardage exterieur', 'fourniture', 60, 'm2', 65.00, 20, 2);
    update public.factures set statut = 'en_retard' where id = 'aaaaaaaa-a000-0009-0000-000000000003';
  end if;
end $$;

-- FA4 : reste en brouillon (jamais envoyee).
insert into public.factures (id, entreprise_id, client_id, type, statut, date_emission)
values ('aaaaaaaa-a000-0009-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0003-0000-000000000003', 'simple', 'brouillon', '2026-09-10')
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from public.lignes_factures where facture_id = 'aaaaaaaa-a000-0009-0000-000000000004') then
    insert into public.lignes_factures (id, facture_id, designation, type, quantite, unite, prix_unitaire_ht, taux_tva, ordre)
    values ('aaaaaaaa-a000-000a-0000-000000000007', 'aaaaaaaa-a000-0009-0000-000000000004', 'Diagnostic facade (a chiffrer)', 'forfait', 1, 'forfait', 600.00, 20, 1);
  end if;
end $$;

-- FA5 : acompte partiellement payee.
insert into public.factures (id, entreprise_id, client_id, type, statut, date_emission, date_echeance)
values ('aaaaaaaa-a000-0009-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0003-0000-000000000004', 'acompte', 'brouillon', '2026-06-01', '2026-06-30')
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from public.lignes_factures where facture_id = 'aaaaaaaa-a000-0009-0000-000000000005') then
    insert into public.lignes_factures (id, facture_id, designation, type, quantite, unite, prix_unitaire_ht, taux_tva, ordre)
    values ('aaaaaaaa-a000-000a-0000-000000000008', 'aaaaaaaa-a000-0009-0000-000000000005', 'Acompte etude de faisabilite', 'forfait', 1, 'forfait', 3500.00, 20, 1);
    update public.factures set statut = 'envoyee' where id = 'aaaaaaaa-a000-0009-0000-000000000005';
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 8. Tenant A — paiements (le montant de FA1 est repris par sous-requête,
--    le trigger recalc_paiements_facture ajuste ensuite montant_paye/statut)
-- ═══════════════════════════════════════════════════════════════════════

insert into public.paiements (id, facture_id, montant, date, mode, reference)
select 'aaaaaaaa-a000-000b-0000-000000000001', 'aaaaaaaa-a000-0009-0000-000000000001', montant_ttc, '2026-08-10', 'virement', 'VIR-2026-0001'
from public.factures where id = 'aaaaaaaa-a000-0009-0000-000000000001'
on conflict (id) do nothing;

insert into public.paiements (id, facture_id, montant, date, mode, reference)
select 'aaaaaaaa-a000-000b-0000-000000000002', 'aaaaaaaa-a000-0009-0000-000000000005', round(montant_ttc * 0.4, 2), '2026-06-05', 'carte_en_ligne', 'CB-2026-0002'
from public.factures where id = 'aaaaaaaa-a000-0009-0000-000000000005'
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════
-- 9. Tenant A — notes de frais (justificatif stocké pour NF1 et NF5, toutes
--    deux remboursées ensuite par virement pour verrouiller structurellement
--    la ligne via ordres_virements RESTRICT — c'est le correctif F3).
-- ═══════════════════════════════════════════════════════════════════════

insert into public.notes_frais
  (id, entreprise_id, employe_id, chantier_id, lieu_hors_chantier, date_frais, montant_ttc, categorie, statut, justificatif_storage_path, justificatif_nom, justificatif_mime_type)
values
  ('aaaaaaaa-a000-000c-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0005-0000-000000000001', 'aaaaaaaa-a000-0006-0000-000000000001', null, '2026-08-03', 45.00, 'restauration', 'remboursee',
   'aaaaaaaa-0000-0000-0000-000000000001/notes-frais/aaaaaaaa-a000-000c-0000-000000000001/justificatif.pdf', 'justificatif.pdf', 'application/pdf'),
  ('aaaaaaaa-a000-000c-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0005-0000-000000000002', null, 'bureau', '2026-08-05', 89.90, 'fournitures', 'valide', null, null, null),
  ('aaaaaaaa-a000-000c-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0005-0000-000000000003', null, 'sans_chantier', '2026-08-12', 32.10, 'deplacement', 'soumise', null, null, null),
  ('aaaaaaaa-a000-000c-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0005-0000-000000000001', 'aaaaaaaa-a000-0006-0000-000000000002', null, '2026-02-20', 60.00, 'restauration', 'refusee', null, null, null),
  ('aaaaaaaa-a000-000c-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0005-0000-000000000002', null, 'depot', '2026-08-15', 120.00, 'materiel', 'remboursee',
   'aaaaaaaa-0000-0000-0000-000000000001/notes-frais/aaaaaaaa-a000-000c-0000-000000000005/justificatif.pdf', 'justificatif.pdf', 'application/pdf')
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════
-- 10. Tenant A — lot de virements + ordres (rembourse NF1 et NF5 : prouve
--     que ordres_virements→notes_frais RESTRICT verrouille bien la ligne)
-- ═══════════════════════════════════════════════════════════════════════

insert into public.lots_virements (id, entreprise_id, numero, type_lot, statut, date_execution, nombre_ordres, montant_total, cree_par, valide_par, transmis_par, execute_at)
values ('aaaaaaaa-a000-000d-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'LOT-NF-2026-001', 'notes_frais', 'execute', '2026-08-20', 2, 165.00,
        'aaaaaaaa-a000-0002-0000-000000000001', 'aaaaaaaa-a000-0002-0000-000000000001', 'aaaaaaaa-a000-0002-0000-000000000001', '2026-08-20 10:00:00+02')
on conflict (id) do nothing;

insert into public.ordres_virements
  (id, entreprise_id, lot_id, type_beneficiaire, employe_id, note_frais_id, titulaire, iban_chiffre, iban_quatre_derniers, montant, libelle, statut)
values
  ('aaaaaaaa-a000-000e-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-000d-0000-000000000001', 'employe', 'aaaaaaaa-a000-0005-0000-000000000001', 'aaaaaaaa-a000-000c-0000-000000000001', 'Julien Moreau', 'CHIFFRE:FR76-XXXX-XXXX-XXXX-0189', '0189', 45.00, 'Remboursement note de frais EXP restaurant', 'execute'),
  ('aaaaaaaa-a000-000e-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-000d-0000-000000000001', 'employe', 'aaaaaaaa-a000-0005-0000-000000000002', 'aaaaaaaa-a000-000c-0000-000000000005', 'Karim Belkacem', 'CHIFFRE:FR76-XXXX-XXXX-XXXX-4455', '4455', 120.00, 'Remboursement note de frais EXP materiel', 'execute')
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════
-- 11. Tenant A — préparation de paie (périodes, dossiers salariés, journal
--     d'audit immuable — voir supabase/migrations/20260723000141_
--     preparation_paie.sql)
-- ═══════════════════════════════════════════════════════════════════════

insert into public.periodes_paie (id, entreprise_id, mois, date_debut, date_fin, statut, cree_par, date_validation)
values ('aaaaaaaa-a000-000f-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '2026-08-01', '2026-08-01', '2026-08-31', 'validee', 'aaaaaaaa-a000-0002-0000-000000000001', '2026-09-02 09:00:00+02')
on conflict (id) do nothing;

insert into public.dossiers_paie_salaries (id, entreprise_id, periode_id, employe_id, statut, heures_normales, valide_par, valide_at)
values
  ('aaaaaaaa-a000-0010-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-000f-0000-000000000001', 'aaaaaaaa-a000-0005-0000-000000000001', 'valide', 151.67, 'aaaaaaaa-a000-0002-0000-000000000001', '2026-09-02 09:05:00+02'),
  ('aaaaaaaa-a000-0010-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-000f-0000-000000000001', 'aaaaaaaa-a000-0005-0000-000000000002', 'a_controler', 151.67, null, null),
  ('aaaaaaaa-a000-0010-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-000f-0000-000000000001', 'aaaaaaaa-a000-0005-0000-000000000003', 'brouillon', 0, null, null)
on conflict (id) do nothing;

insert into public.journal_audit_paie (id, entreprise_id, periode_id, dossier_id, utilisateur_id, action, ressource_type, ressource_id, ancienne_valeur, nouvelle_valeur)
values
  ('aaaaaaaa-a000-0011-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-000f-0000-000000000001', 'aaaaaaaa-a000-0010-0000-000000000001', 'aaaaaaaa-a000-0002-0000-000000000001', 'creation', 'dossier_paie', 'aaaaaaaa-a000-0010-0000-000000000001', null, jsonb_build_object('statut', 'brouillon')),
  ('aaaaaaaa-a000-0011-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-000f-0000-000000000001', 'aaaaaaaa-a000-0010-0000-000000000001', 'aaaaaaaa-a000-0002-0000-000000000001', 'validation', 'dossier_paie', 'aaaaaaaa-a000-0010-0000-000000000001', jsonb_build_object('statut', 'a_controler'), jsonb_build_object('statut', 'valide')),
  ('aaaaaaaa-a000-0011-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-000f-0000-000000000001', 'aaaaaaaa-a000-0010-0000-000000000002', 'aaaaaaaa-a000-0002-0000-000000000001', 'modification', 'dossier_paie', 'aaaaaaaa-a000-0010-0000-000000000002', null, jsonb_build_object('heures_normales', 151.67))
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════
-- 12. Tenant A — signature de document métier (immuable après insertion :
--     ne pas UPDATE/DELETE cette ligne ensuite, cf. proteger_signature_
--     document())
-- ═══════════════════════════════════════════════════════════════════════

insert into public.signatures_documents
  (id, entreprise_id, employe_id, type_document, document_id, signature_storage_path, signature_sha256, document_sha256, nom_signataire, fonction_signataire, created_by)
values (
  'aaaaaaaa-a000-0012-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0005-0000-000000000001', 'devis', 'aaaaaaaa-a000-0007-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001/signatures/aaaaaaaa-a000-0012-0000-000000000001/signature.png',
  '3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1a',
  '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  'Julien Moreau', 'Chef de chantier', 'aaaaaaaa-a000-0002-0000-000000000001'
)
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════
-- 13. Tenant A — pointages (avec GPS + photo pour certains) et sessions de
--     pointage (arrivée/départ GPS + photos)
-- ═══════════════════════════════════════════════════════════════════════

insert into public.pointages
  (id, entreprise_id, employe_id, chantier_id, date, heures_normales, heures_supplementaires, latitude, longitude, precision_metres, photo_storage_path, verification_statut, origine_pointage)
values
  ('aaaaaaaa-a000-0013-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0005-0000-000000000002', 'aaaaaaaa-a000-0006-0000-000000000001', '2026-08-03', 7, 0, 48.856600, 2.352200, 12, 'aaaaaaaa-0000-0000-0000-000000000001/pointages/aaaaaaaa-a000-0013-0000-000000000001/photo.jpg', 'valide', 'gps_complet'),
  ('aaaaaaaa-a000-0013-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0005-0000-000000000004', 'aaaaaaaa-a000-0006-0000-000000000001', '2026-08-04', 7.5, 0, null, null, null, null, 'sans_preuve', 'regularisation_responsable'),
  ('aaaaaaaa-a000-0013-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0005-0000-000000000001', 'aaaaaaaa-a000-0006-0000-000000000002', '2026-08-05', 8, 0, 48.840500, 2.378900, 8, null, 'a_verifier', 'gps_complet'),
  ('aaaaaaaa-a000-0013-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0005-0000-000000000005', 'aaaaaaaa-a000-0006-0000-000000000001', '2026-08-06', 7, 0, null, null, null, null, 'sans_preuve', 'gps_complet'),
  ('aaaaaaaa-a000-0013-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0005-0000-000000000002', 'aaaaaaaa-a000-0006-0000-000000000003', '2026-08-07', 6, 1, 48.874500, 2.331200, 15, null, 'valide', 'gps_complet')
on conflict (id) do nothing;

insert into public.sessions_pointage
  (id, entreprise_id, employe_id, chantier_id, arrivee_at, depart_at, latitude_arrivee, longitude_arrivee, precision_arrivee_metres, latitude_depart, longitude_depart, precision_depart_metres, photo_arrivee_storage_path, photo_depart_storage_path)
values
  ('aaaaaaaa-a000-0014-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0005-0000-000000000001', 'aaaaaaaa-a000-0006-0000-000000000001', '2026-08-03 07:55:00+02', '2026-08-03 16:10:00+02',
   48.856600, 2.352200, 10, 48.856700, 2.352300, 11,
   'aaaaaaaa-0000-0000-0000-000000000001/pointages/aaaaaaaa-a000-0014-0000-000000000001/arrivee.jpg',
   'aaaaaaaa-0000-0000-0000-000000000001/pointages/aaaaaaaa-a000-0014-0000-000000000001/depart.jpg'),
  ('aaaaaaaa-a000-0014-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0005-0000-000000000003', 'aaaaaaaa-a000-0006-0000-000000000003', '2026-08-07 08:05:00+02', null,
   48.874500, 2.331200, 9, null, null, null, null, null),
  ('aaaaaaaa-a000-0014-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0005-0000-000000000004', 'aaaaaaaa-a000-0006-0000-000000000002', '2026-08-05 08:00:00+02', '2026-08-05 17:00:00+02',
   null, null, null, null, null, null, null, null)
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════
-- 14. Tenant A — journal d'activité (table RETAIN par défaut)
-- ═══════════════════════════════════════════════════════════════════════

insert into public.journal_activite (id, entreprise_id, utilisateur_id, action, ressource, ressource_id, description, metadata)
values
  ('aaaaaaaa-a000-0015-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0002-0000-000000000001', 'creation', 'client', 'aaaaaaaa-a000-0003-0000-000000000001', 'Création du client Marc Lefevre', '{}'),
  ('aaaaaaaa-a000-0015-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0002-0000-000000000001', 'creation', 'devis', 'aaaaaaaa-a000-0007-0000-000000000001', 'Création du devis DEV-001', '{}'),
  ('aaaaaaaa-a000-0015-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0002-0000-000000000001', 'envoi', 'facture', 'aaaaaaaa-a000-0009-0000-000000000001', 'Envoi de la facture au client', '{}'),
  ('aaaaaaaa-a000-0015-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0002-0000-000000000001', 'validation', 'note_frais', 'aaaaaaaa-a000-000c-0000-000000000001', 'Validation de la note de frais EXP-000001', '{}'),
  ('aaaaaaaa-a000-0015-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-a000-0002-0000-000000000001', 'execution', 'lot_virement', 'aaaaaaaa-a000-000d-0000-000000000001', 'Exécution du lot de virements LOT-NF-2026-001', '{}')
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════
-- 15. Tenant A — objets Storage réels, tous cloisonnés sous le premier
--     segment = entreprise_id (storage.foldername()[1]). Un fichier
--     orphelin (non référencé) est ajouté pour vérifier la classification
--     ORPHELIN de verifier_storage_entreprise().
-- ═══════════════════════════════════════════════════════════════════════

insert into storage.objects (id, bucket_id, name, metadata)
values
  ('aaaaaaaa-a000-0016-0000-000000000001', 'documents-employes', 'aaaaaaaa-0000-0000-0000-000000000001/employes/aaaaaaaa-a000-0005-0000-000000000001/photo.jpg', jsonb_build_object('mimetype', 'image/jpeg', 'size', 45210)),
  ('aaaaaaaa-a000-0016-0000-000000000002', 'documents-employes', 'aaaaaaaa-0000-0000-0000-000000000001/employes/aaaaaaaa-a000-0005-0000-000000000001/signature.png', jsonb_build_object('mimetype', 'image/png', 'size', 8120)),
  ('aaaaaaaa-a000-0016-0000-000000000003', 'documents-employes', 'aaaaaaaa-0000-0000-0000-000000000001/employes/aaaaaaaa-a000-0005-0000-000000000001/carte-btp.jpg', jsonb_build_object('mimetype', 'image/jpeg', 'size', 62330)),
  ('aaaaaaaa-a000-0016-0000-000000000004', 'documents-employes', 'aaaaaaaa-0000-0000-0000-000000000001/employes/aaaaaaaa-a000-0005-0000-000000000002/photo.jpg', jsonb_build_object('mimetype', 'image/jpeg', 'size', 41008)),
  ('aaaaaaaa-a000-0016-0000-000000000005', 'documents-employes', 'aaaaaaaa-0000-0000-0000-000000000001/employes/aaaaaaaa-a000-0005-0000-000000000002/carte-btp.jpg', jsonb_build_object('mimetype', 'image/jpeg', 'size', 59870)),
  ('aaaaaaaa-a000-0016-0000-000000000006', 'documents-employes', 'aaaaaaaa-0000-0000-0000-000000000001/employes/aaaaaaaa-a000-0005-0000-000000000003/photo.jpg', jsonb_build_object('mimetype', 'image/jpeg', 'size', 39012)),
  ('aaaaaaaa-a000-0016-0000-000000000007', 'documents-employes', 'aaaaaaaa-0000-0000-0000-000000000001/signatures/aaaaaaaa-a000-0012-0000-000000000001/signature.png', jsonb_build_object('mimetype', 'image/png', 'size', 8120)),
  ('aaaaaaaa-a000-0016-0000-000000000008', 'notes-frais', 'aaaaaaaa-0000-0000-0000-000000000001/notes-frais/aaaaaaaa-a000-000c-0000-000000000001/justificatif.pdf', jsonb_build_object('mimetype', 'application/pdf', 'size', 102450)),
  ('aaaaaaaa-a000-0016-0000-000000000009', 'notes-frais', 'aaaaaaaa-0000-0000-0000-000000000001/notes-frais/aaaaaaaa-a000-000c-0000-000000000005/justificatif.pdf', jsonb_build_object('mimetype', 'application/pdf', 'size', 88210)),
  ('aaaaaaaa-a000-0016-0000-00000000000a', 'pointage-preuves', 'aaaaaaaa-0000-0000-0000-000000000001/pointages/aaaaaaaa-a000-0013-0000-000000000001/photo.jpg', jsonb_build_object('mimetype', 'image/jpeg', 'size', 71230)),
  ('aaaaaaaa-a000-0016-0000-00000000000b', 'pointage-preuves', 'aaaaaaaa-0000-0000-0000-000000000001/pointages/aaaaaaaa-a000-0014-0000-000000000001/arrivee.jpg', jsonb_build_object('mimetype', 'image/jpeg', 'size', 68120)),
  ('aaaaaaaa-a000-0016-0000-00000000000c', 'pointage-preuves', 'aaaaaaaa-0000-0000-0000-000000000001/pointages/aaaaaaaa-a000-0014-0000-000000000001/depart.jpg', jsonb_build_object('mimetype', 'image/jpeg', 'size', 69340)),
  ('aaaaaaaa-a000-0016-0000-00000000000d', 'documents-employes', 'aaaaaaaa-0000-0000-0000-000000000001/employes/orphelin/ancien-document.pdf', jsonb_build_object('mimetype', 'application/pdf', 'size', 15330))
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════
-- 16. Tenant B « Entreprise Controle B » — locataire témoin, non purgé
-- ═══════════════════════════════════════════════════════════════════════

insert into public.clients (id, entreprise_id, type, nom, prenom, societe, telephone, email, statut)
values
  ('bbbbbbbb-b000-0003-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'particulier', 'Girard', 'Anne', null, '0622334455', 'anne.girard@example.test', 'actif'),
  ('bbbbbbbb-b000-0003-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'professionnel', null, null, 'Temoin Batiment SAS', '0472110022', 'contact@temoin-batiment.test', 'actif'),
  ('bbbbbbbb-b000-0003-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000002', 'syndic', null, null, 'Syndic Controle B', '0472110033', 'gestion@syndic-controleb.test', 'actif')
on conflict (id) do nothing;

insert into public.employes (id, entreprise_id, prenom, nom, email, telephone, poste, type_contrat, date_entree, statut)
values
  ('bbbbbbbb-b000-0005-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'Nina', 'Faure', 'nina.faure@example.test', '0699990001', 'Chef de chantier', 'cdi', '2022-01-10', 'actif'),
  ('bbbbbbbb-b000-0005-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'Paul', 'Simon', 'paul.simon@example.test', '0699990002', 'Maçon', 'cdi', '2023-03-01', 'actif')
on conflict (id) do nothing;

insert into public.chantiers (id, entreprise_id, client_id, nom, adresse, code_postal, ville, statut, responsable_id)
values
  ('bbbbbbbb-b000-0006-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'bbbbbbbb-b000-0003-0000-000000000001', 'Renovation cuisine Girard', '10 Rue Temoin', '69000', 'Lyon', 'en_cours', 'bbbbbbbb-b000-0005-0000-000000000001'),
  ('bbbbbbbb-b000-0006-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'bbbbbbbb-b000-0003-0000-000000000002', 'Extension bureau Temoin SAS', '20 Avenue Controle', '69000', 'Lyon', 'accepte', null)
on conflict (id) do nothing;

insert into public.devis (id, entreprise_id, client_id, chantier_id, statut, date_emission)
values ('bbbbbbbb-b000-0007-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'bbbbbbbb-b000-0003-0000-000000000001', 'bbbbbbbb-b000-0006-0000-000000000001', 'accepte', '2026-05-01')
on conflict (id) do nothing;

insert into public.lignes_devis (id, devis_id, designation, type, quantite, unite, prix_unitaire_ht, taux_tva, ordre)
values
  ('bbbbbbbb-b000-0008-0000-000000000001', 'bbbbbbbb-b000-0007-0000-000000000001', 'Depose ancienne cuisine', 'main_oeuvre', 1, 'forfait', 450.00, 10, 1),
  ('bbbbbbbb-b000-0008-0000-000000000002', 'bbbbbbbb-b000-0007-0000-000000000001', 'Fourniture cuisine equipee', 'fourniture', 1, 'forfait', 6200.00, 10, 2)
on conflict (id) do nothing;

insert into public.factures (id, entreprise_id, client_id, chantier_id, devis_origine_id, type, statut, date_emission, date_echeance)
values ('bbbbbbbb-b000-0009-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'bbbbbbbb-b000-0003-0000-000000000001', 'bbbbbbbb-b000-0006-0000-000000000001', 'bbbbbbbb-b000-0007-0000-000000000001', 'finale', 'brouillon', '2026-05-20', '2026-06-19')
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from public.lignes_factures where facture_id = 'bbbbbbbb-b000-0009-0000-000000000001') then
    insert into public.lignes_factures (id, facture_id, designation, type, quantite, unite, prix_unitaire_ht, taux_tva, ordre)
    values
      ('bbbbbbbb-b000-000a-0000-000000000001', 'bbbbbbbb-b000-0009-0000-000000000001', 'Depose ancienne cuisine', 'main_oeuvre', 1, 'forfait', 450.00, 10, 1),
      ('bbbbbbbb-b000-000a-0000-000000000002', 'bbbbbbbb-b000-0009-0000-000000000001', 'Fourniture cuisine equipee', 'fourniture', 1, 'forfait', 6200.00, 10, 2);
    update public.factures set statut = 'envoyee' where id = 'bbbbbbbb-b000-0009-0000-000000000001';
  end if;
end $$;

commit;
