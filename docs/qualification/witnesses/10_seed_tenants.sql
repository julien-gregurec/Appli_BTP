-- Seed two isolated tenants (A, B) with real auth.users + membership + postes/permissions,
-- used as the fixture for every negative/positive witness below.
begin;

insert into public.entreprises (id, nom, abonnement_statut)
values
  ('a0000000-0000-0000-0000-000000000001', 'Entreprise A (qualif)', 'actif'),
  ('b0000000-0000-0000-0000-000000000002', 'Entreprise B (qualif)', 'actif');

-- auth.users
insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'membre-a@qualif.invalid', 'x', now(), now(), now(), 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'membre-b@qualif.invalid', 'x', now(), now(), now(), 'authenticated', 'authenticated'),
  ('cccccccc-0000-0000-0000-000000000003', 'lecture-a@qualif.invalid', 'x', now(), now(), now(), 'authenticated', 'authenticated'),
  ('dddddddd-0000-0000-0000-000000000004', 'paie-mgr-a@qualif.invalid', 'x', now(), now(), now(), 'authenticated', 'authenticated'),
  ('eeeeeeee-0000-0000-0000-000000000005', 'employe-a@qualif.invalid', 'x', now(), now(), now(), 'authenticated', 'authenticated'),
  ('ffffffff-0000-0000-0000-000000000006', 'autre-employe-a@qualif.invalid', 'x', now(), now(), now(), 'authenticated', 'authenticated');

-- public.utilisateurs rows are auto-created by the auth.users insert trigger
-- (trigger_profil_utilisateur, migration 20260710000002).

-- postes: full-rights poste in A, no-rights poste in A, full-rights poste in B
insert into public.postes (id, entreprise_id, nom)
values
  ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Gérant A'),
  ('10000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Lecture A'),
  ('10000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'RH-paie A'),
  ('20000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'Gérant B');

insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
select 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', cle, true
from public.permissions_disponibles;

insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
values
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','gerer_paie', true),
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','voir_paie_confidentielle', true);

insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
select 'b0000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', cle, true
from public.permissions_disponibles;

-- memberships
insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'actif'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'actif'),
  ('cccccccc-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'actif'),
  ('dddddddd-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'actif'),
  ('eeeeeeee-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'actif'),
  ('ffffffff-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'actif');

-- clients (one per tenant)
insert into public.clients (id, entreprise_id, type, nom)
values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'particulier', 'Client A'),
  ('c0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000002', 'particulier', 'Client B');

-- employes rows linking to A's users, for the documents-employes sensitive-doc test
insert into public.employes (id, entreprise_id, poste_id, utilisateur_id, nom, prenom, carte_btp_storage_path, signature_storage_path, photo_storage_path)
values
  ('e0000000-0000-0000-0000-00000000000e', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000005',
   'Employe', 'A', 'a0000000-0000-0000-0000-000000000001/carte-eeeeeeee.pdf', 'a0000000-0000-0000-0000-000000000001/signature-eeeeeeee.png', 'a0000000-0000-0000-0000-000000000001/photo-eeeeeeee.jpg');

-- a piece jointe paie owned by the employe above
insert into public.pieces_jointes_paie (id, entreprise_id, employe_id, type_document, nom_original, storage_path, mime_type, taille_octets, importe_par)
values
  ('f0000000-0000-0000-0000-00000000000f', 'a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000e',
   'bulletin', 'bulletin-08-2026.pdf', 'a0000000-0000-0000-0000-000000000001/bulletin-eeeeeeee-08-2026.pdf', 'application/pdf', 1024,
   'dddddddd-0000-0000-0000-000000000004');

commit;
