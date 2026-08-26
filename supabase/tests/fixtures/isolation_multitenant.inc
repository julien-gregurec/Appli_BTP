-- Jeu de données strictement local pour les tests d'isolation multitenant.
-- Les UUID fixes rendent les diagnostics reproductibles.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'admin-a@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ouvrier-a@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'chef-equipe-a@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'conducteur-a@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'comptable-a@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'dirigeant-a@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'admin-b@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ouvrier-b@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'chef-equipe-b@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'conducteur-b@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'comptable-b@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'dirigeant-b@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'plateforme@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now())
on conflict (id) do nothing;

insert into public.utilisateurs (id, prenom, nom) values
  ('10000000-0000-0000-0000-000000000001', 'Admin', 'A'),
  ('10000000-0000-0000-0000-000000000002', 'Ouvrier', 'A'),
  ('10000000-0000-0000-0000-000000000003', 'Chef équipe', 'A'),
  ('10000000-0000-0000-0000-000000000004', 'Conducteur', 'A'),
  ('10000000-0000-0000-0000-000000000005', 'Comptable', 'A'),
  ('10000000-0000-0000-0000-000000000006', 'Dirigeant', 'A'),
  ('20000000-0000-0000-0000-000000000001', 'Admin', 'B'),
  ('20000000-0000-0000-0000-000000000002', 'Ouvrier', 'B'),
  ('20000000-0000-0000-0000-000000000003', 'Chef équipe', 'B'),
  ('20000000-0000-0000-0000-000000000004', 'Conducteur', 'B'),
  ('20000000-0000-0000-0000-000000000005', 'Comptable', 'B'),
  ('20000000-0000-0000-0000-000000000006', 'Dirigeant', 'B'),
  ('30000000-0000-0000-0000-000000000001', 'Admin', 'plateforme')
on conflict (id) do update set prenom = excluded.prenom, nom = excluded.nom;

insert into public.entreprises (id, nom, code_adhesion) values
  ('a0000000-0000-0000-0000-000000000001', 'Entreprise Isolation A', 'ISOA0001'),
  ('b0000000-0000-0000-0000-000000000001', 'Entreprise Isolation B', 'ISOB0001')
on conflict (id) do nothing;

insert into public.postes (id, entreprise_id, nom) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Administrateur A'),
  ('a1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Ouvrier A'),
  ('a1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Chef équipe A'),
  ('a1000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Conducteur travaux A'),
  ('a1000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'Comptable A'),
  ('a1000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'Dirigeant A'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Administrateur B'),
  ('b1000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Ouvrier B'),
  ('b1000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'Chef équipe B'),
  ('b1000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 'Conducteur travaux B'),
  ('b1000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000001', 'Comptable B'),
  ('b1000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000001', 'Dirigeant B')
on conflict (id) do nothing;

insert into public.utilisateurs_entreprises (
  utilisateur_id, entreprise_id, poste_id, statut
) values
  ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'actif'),
  ('10000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'actif'),
  ('10000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'actif'),
  ('10000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000004', 'actif'),
  ('10000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000005', 'actif'),
  ('10000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000006', 'actif'),
  ('20000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'actif'),
  ('20000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'actif'),
  ('20000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'actif'),
  ('20000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000004', 'actif'),
  ('20000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000005', 'actif'),
  ('20000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000006', 'actif')
on conflict do nothing;

insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
select p.entreprise_id, p.id, d.cle, true
from public.postes p
cross join public.permissions_disponibles d
where p.id in (
  'a1000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001'
)
on conflict do nothing;

insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
select p.entreprise_id, p.id, d.cle, true
from public.postes p
join public.permissions_disponibles d
  on d.cle in ('voir_chantiers_assignes', 'saisir_ses_notes_frais', 'acces_pointage', 'saisir_son_pointage')
where p.id in (
  'a1000000-0000-0000-0000-000000000002',
  'b1000000-0000-0000-0000-000000000002'
)
on conflict do nothing;

insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
select p.entreprise_id, p.id, d.cle, true
from public.postes p
join public.permissions_disponibles d on d.cle in (
  'voir_chantiers_assignes', 'acces_planning', 'acces_pointage',
  'gerer_pointage', 'valider_pointages', 'acces_messagerie'
)
where p.id in (
  'a1000000-0000-0000-0000-000000000003',
  'b1000000-0000-0000-0000-000000000003'
)
on conflict do nothing;

insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
select p.entreprise_id, p.id, d.cle, true
from public.postes p
join public.permissions_disponibles d on d.cle in (
  'acces_clients', 'gerer_clients', 'acces_chantiers', 'gerer_chantiers',
  'acces_devis', 'gerer_devis', 'acces_planning', 'gerer_planning',
  'acces_pointage', 'gerer_pointage', 'valider_pointages',
  'acces_messagerie', 'gerer_messagerie'
)
where p.id in (
  'a1000000-0000-0000-0000-000000000004',
  'b1000000-0000-0000-0000-000000000004'
)
on conflict do nothing;

insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
select p.entreprise_id, p.id, d.cle, true
from public.postes p
join public.permissions_disponibles d on d.cle in (
  'acces_factures', 'gerer_factures', 'acces_achats', 'gerer_achats',
  'acces_exports', 'acces_rentabilite', 'voir_rentabilite'
)
where p.id in (
  'a1000000-0000-0000-0000-000000000005',
  'b1000000-0000-0000-0000-000000000005'
)
on conflict do nothing;

insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
select p.entreprise_id, p.id, d.cle, true
from public.postes p
cross join public.permissions_disponibles d
where p.id in (
  'a1000000-0000-0000-0000-000000000006',
  'b1000000-0000-0000-0000-000000000006'
)
on conflict do nothing;

insert into public.employes (
  id, entreprise_id, utilisateur_id, prenom, nom,
  numero_inscription, identifiant_interne
) values
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Admin', 'A', 'ISO-A-0001', 'A0001'),
  ('a2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'Ouvrier', 'A', 'ISO-A-0002', 'A0002'),
  ('a2000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'Chef équipe', 'A', 'ISO-A-0003', 'A0003'),
  ('a2000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'Conducteur', 'A', 'ISO-A-0004', 'A0004'),
  ('b2000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Admin', 'B', 'ISO-B-0001', 'B0001'),
  ('b2000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'Ouvrier', 'B', 'ISO-B-0002', 'B0002'),
  ('b2000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'Chef équipe', 'B', 'ISO-B-0003', 'B0003'),
  ('b2000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', 'Conducteur', 'B', 'ISO-B-0004', 'B0004')
on conflict (id) do nothing;

insert into public.clients (id, entreprise_id, reference_interne, nom, type, statut) values
  ('a3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'TEST_A_CLI_001', 'TEST_A_Client secret', 'particulier', 'actif'),
  ('a3000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'TEST_A_PRO_001', 'TEST_A_Prospect', 'particulier', 'prospect'),
  ('a3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'TEST_A_CLI_002', 'TEST_A_Second client', 'professionnel', 'actif'),
  ('b3000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'TEST_B_CLI_001', 'TEST_B_Client secret', 'particulier', 'actif'),
  ('b3000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'TEST_B_PRO_001', 'TEST_B_Prospect', 'particulier', 'prospect'),
  ('b3000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'TEST_B_CLI_002', 'TEST_B_Second client', 'professionnel', 'actif')
on conflict (id) do nothing;

insert into public.chantiers (id, entreprise_id, client_id, nom, statut) values
  ('a4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'TEST_A_Chantier assigné', 'en_cours'),
  ('a4000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'TEST_A_Chantier non assigné', 'en_cours'),
  ('b4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', 'TEST_B_Chantier assigné', 'en_cours'),
  ('b4000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', 'TEST_B_Chantier non assigné', 'en_cours')
on conflict (id) do nothing;

insert into public.equipes_chantiers (
  entreprise_id, chantier_id, employe_id, role_chantier
) values
  ('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'ouvrier'),
  ('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000003', 'chef_equipe'),
  ('b0000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002', 'ouvrier')
  ,('b0000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000003', 'chef_equipe')
on conflict do nothing;

insert into public.pointages (
  id, entreprise_id, employe_id, chantier_id, date,
  heures_normales, heures_supplementaires, verification_statut
) values
  ('a5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000001', current_date, 7, 0, 'valide'),
  ('a5000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002', current_date, 7, 0, 'valide'),
  ('b5000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002', 'b4000000-0000-0000-0000-000000000001', current_date, 7, 0, 'valide')
on conflict (id) do nothing;

insert into public.notes_frais (
  id, entreprise_id, employe_id, reference, montant_ttc, statut
) values
  ('a6000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'NDF-ISO-A', 12.34, 'brouillon'),
  ('b6000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002', 'NDF-ISO-B', 56.78, 'brouillon')
on conflict (id) do nothing;

insert into public.documents_chantier (
  id, entreprise_id, chantier_id, nom, storage_path, mime_type, taille_octets,
  audience
) values
  ('a7000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'Plan visible A', 'a0000000-0000-0000-0000-000000000001/a4000000-0000-0000-0000-000000000001/plan.pdf', 'application/pdf', 10, 'tous_affectes'),
  ('a7000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002', 'Plan privé A', 'a0000000-0000-0000-0000-000000000001/a4000000-0000-0000-0000-000000000002/secret.pdf', 'application/pdf', 10, 'gestionnaires'),
  ('b7000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 'Plan visible B', 'b0000000-0000-0000-0000-000000000001/b4000000-0000-0000-0000-000000000001/plan.pdf', 'application/pdf', 10, 'tous_affectes')
on conflict (id) do nothing;

insert into storage.objects (id, bucket_id, name, metadata) values
  ('a8000000-0000-0000-0000-000000000001', 'chantier-documents', 'a0000000-0000-0000-0000-000000000001/a4000000-0000-0000-0000-000000000001/plan.pdf', '{"mimetype":"application/pdf"}'),
  ('a8000000-0000-0000-0000-000000000002', 'chantier-documents', 'a0000000-0000-0000-0000-000000000001/a4000000-0000-0000-0000-000000000002/secret.pdf', '{"mimetype":"application/pdf"}'),
  ('b8000000-0000-0000-0000-000000000001', 'chantier-documents', 'b0000000-0000-0000-0000-000000000001/b4000000-0000-0000-0000-000000000001/plan.pdf', '{"mimetype":"application/pdf"}')
on conflict (id) do nothing;

insert into public.plateforme_admins (
  email, role, utilisateur_id, actif, statut_identite, activation_at
)
values (
  'plateforme@invalid.local', 'total', '30000000-0000-0000-0000-000000000001',
  true, 'active', now()
)
on conflict (email) do update
set utilisateur_id = excluded.utilisateur_id,
    actif = excluded.actif,
    statut_identite = excluded.statut_identite,
    activation_at = excluded.activation_at;

insert into public.devis (
  id, entreprise_id, numero, client_id, chantier_id, statut,
  montant_ht, montant_tva, montant_ttc
) values
  ('a9000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'TEST_A_DEV_001', 'a3000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'accepte', 100, 20, 120),
  ('b9000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'TEST_B_DEV_001', 'b3000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 'accepte', 200, 40, 240)
on conflict (id) do nothing;

insert into public.factures (
  id, entreprise_id, numero, client_id, chantier_id, devis_origine_id,
  statut, montant_ht, montant_tva, montant_ttc
) values
  ('aa000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'TEST_A_FAC_001', 'a3000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000001', 'envoyee', 100, 20, 120),
  ('ba000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'TEST_B_FAC_001', 'b3000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 'b9000000-0000-0000-0000-000000000001', 'envoyee', 200, 40, 240)
on conflict (id) do nothing;

insert into public.fournisseurs (id, entreprise_id, reference, nom) values
  ('ab000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'TEST_A_FOU_001', 'TEST_A_Fournisseur'),
  ('bb000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'TEST_B_FOU_001', 'TEST_B_Fournisseur')
on conflict (id) do nothing;

insert into public.commandes_fournisseurs (
  id, entreprise_id, numero, fournisseur_id, chantier_id, montant_ht, montant_tva, montant_ttc
) values
  ('ac000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'TEST_A_CMD_001', 'ab000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 50, 10, 60),
  ('bc000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'TEST_B_CMD_001', 'bb000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 75, 15, 90)
on conflict (id) do nothing;

insert into public.articles_stock (
  id, entreprise_id, reference, designation, quantite_stock, prix_achat_ht, prix_vente_ht
) values
  ('ad000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'TEST_A_STK_001', 'TEST_A_Article', 10, 5, 8),
  ('bd000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'TEST_B_STK_001', 'TEST_B_Article', 20, 6, 9)
on conflict (id) do nothing;

insert into public.mouvements_stock (
  id, entreprise_id, article_id, chantier_id, type, quantite, motif
) values
  ('ae000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'ad000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'sortie', 1, 'TEST_A_Mouvement'),
  ('be000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'bd000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 'sortie', 1, 'TEST_B_Mouvement')
on conflict (id) do nothing;

insert into public.conversations_internes (
  id, entreprise_id, type, titre, chantier_id, cree_par_employe_id
) values
  ('af000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'chantier', 'TEST_A_Conversation', 'a4000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001'),
  ('bf000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'chantier', 'TEST_B_Conversation', 'b4000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into public.messages_internes (
  id, entreprise_id, conversation_id, auteur_employe_id, contenu
) values
  ('a9100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'af000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'TEST_A_Message'),
  ('b9100000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'bf000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'TEST_B_Message')
on conflict (id) do nothing;

insert into public.pieces_jointes_messages (
  id, entreprise_id, conversation_id, message_id, chantier_id,
  storage_path, nom_original, mime_type, type_media, taille_octets
) values
  ('a9200000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'af000000-0000-0000-0000-000000000001', 'a9100000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001/af000000-0000-0000-0000-000000000001/test-a.jpg', 'TEST_A_Media.jpg', 'image/jpeg', 'image', 10),
  ('b9200000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'bf000000-0000-0000-0000-000000000001', 'b9100000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001/bf000000-0000-0000-0000-000000000001/test-b.jpg', 'TEST_B_Media.jpg', 'image/jpeg', 'image', 10)
on conflict (id) do nothing;

insert into storage.objects (id, bucket_id, name, metadata) values
  ('a9300000-0000-0000-0000-000000000001', 'messagerie-medias', 'a0000000-0000-0000-0000-000000000001/af000000-0000-0000-0000-000000000001/test-a.jpg', '{"mimetype":"image/jpeg"}'),
  ('b9300000-0000-0000-0000-000000000001', 'messagerie-medias', 'b0000000-0000-0000-0000-000000000001/bf000000-0000-0000-0000-000000000001/test-b.jpg', '{"mimetype":"image/jpeg"}')
on conflict (id) do nothing;

insert into public.journal_ia (
  id, entreprise_id, utilisateur_id, fonctionnalite, statut,
  fournisseur, modele, operation_id
) values
  ('a9400000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'TEST_A_Assistant chantier', 'succes', 'test-local', 'modele-test', 'TEST_A_IA_001'),
  ('b9400000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'TEST_B_Assistant chantier', 'succes', 'test-local', 'modele-test', 'TEST_B_IA_001')
on conflict (id) do nothing;
