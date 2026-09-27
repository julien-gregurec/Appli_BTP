-- Décor de la recette navigateur cross-app Gestion Pro ↔ ELSATIA Réserves
-- (tests/e2e/gp-reserves-integration.spec.ts). Strictement local, données fictives.
-- Se joue APRÈS supabase/tests/fixtures/isolation_multitenant.inc et AVANT
-- scripts/e2e/prepare-local-recipe.sql (qui complète la représentation Auth de tous les
-- comptes @invalid.local, y compris celui de l'entreprise C posé ici).
begin;
set local elsatia.capacite_personnes_bypass = 'on';

-- Entreprise C : tenant tiers, future entreprise intervenante invitée (compte gratuit).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000','c0000000-0000-0000-0000-0000000000a1','authenticated','authenticated',
   'intervenant-c@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now())
on conflict (id) do nothing;
insert into public.utilisateurs (id, prenom, nom, entreprise_active_id) values
  ('c0000000-0000-0000-0000-0000000000a1','Électricien','C', null)
on conflict (id) do nothing;
insert into public.entreprises (id, nom, code_adhesion) values
  ('c0000000-0000-0000-0000-000000000001','RECETTE_C_ELECTRICITE','ISOC0001')
on conflict (id) do nothing;
insert into public.postes (id, entreprise_id, nom) values
  ('c1000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','Gérant C')
on conflict (id) do nothing;
insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut) values
  ('c0000000-0000-0000-0000-0000000000a1','c0000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','actif')
on conflict do nothing;
update public.utilisateurs set entreprise_active_id = 'c0000000-0000-0000-0000-000000000001'
where id = 'c0000000-0000-0000-0000-0000000000a1';

-- Réserves : A et B abonnées. Rôles Réserves de A par profil GP :
--   admin-a (gérant)          → administrateur Réserves (manager)
--   conducteur-a              → responsable
--   chef-equipe-a (affecté)   → responsable (chef de chantier)
--   ouvrier-a (affecté)       → émetteur (simple salarié)
--   dirigeant-a               → AUCUN rôle Réserves
insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source) values
  ('a0000000-0000-0000-0000-000000000001','reserves', true, 'recette_gp_reserves'),
  ('b0000000-0000-0000-0000-000000000001','reserves', true, 'recette_gp_reserves')
on conflict (entreprise_id, application_code) do update set autorise = true;
insert into public.habilitations_applications_utilisateurs (entreprise_id, utilisateur_id, application_code, role_code) values
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','reserves','reserves_admin_organisation'),
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','reserves','reserves_responsable'),
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','reserves','reserves_responsable'),
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','reserves','reserves_emetteur'),
  ('b0000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','reserves','reserves_admin_organisation')
on conflict (entreprise_id, utilisateur_id, application_code) do update set role_code = excluded.role_code, autorise = true;

-- Chantier GP de A : adresse, client et contacts, sous-traitants, plans.
update public.chantiers set nom = 'RECETTE_A_Résidence des Tanneurs', reference_interne = 'CHA-REC-001',
  adresse = '12 rue des Tanneurs', code_postal = '68000', ville = 'Colmar',
  date_debut_prevue = current_date - 30, date_fin_prevue = current_date + 60
where id = 'a4000000-0000-0000-0000-000000000001';
update public.clients set email = 'client-a@invalid.local', telephone = '0389000001'
where id = 'a3000000-0000-0000-0000-000000000001';
insert into public.contacts_clients (id, client_id, nom, fonction, telephone, email) values
  ('a3100000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','Mme Syndic','Gestionnaire','0389000002','syndic-a@invalid.local')
on conflict (id) do nothing;
insert into public.fournisseurs (id, entreprise_id, reference, nom, type_tiers, specialite, contact_nom, email, telephone) values
  ('ab100000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','ST-REC-001','Électricité Rhin','sous_traitant','Électricité','Paul Volt','intervenant-c@invalid.local','0600000001'),
  ('ab100000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','ST-REC-002','Plomberie Ill','sous_traitant','Plomberie',null,null,'0600000002'),
  ('bb100000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','ST-REC-B01','RECETTE_B_Secret Maçonnerie','sous_traitant','Maçonnerie','Contact B','contact-b@invalid.local','0700000001')
on conflict (id) do nothing;
insert into public.sous_traitants_chantiers (entreprise_id, fournisseur_id, chantier_id, mission, statut) values
  ('a0000000-0000-0000-0000-000000000001','ab100000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001','Courants forts','en_cours'),
  ('a0000000-0000-0000-0000-000000000001','ab100000-0000-0000-0000-000000000002','a4000000-0000-0000-0000-000000000001','Sanitaires','prevue'),
  ('b0000000-0000-0000-0000-000000000001','bb100000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001','Gros œuvre','en_cours');
-- Les fichiers correspondants sont déposés par la spec (clé serveur, pile locale).
insert into public.documents_chantier (id, entreprise_id, chantier_id, nom, categorie, storage_path, mime_type, taille_octets, audience) values
  ('a7100000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001','Plan RDC','plan',
   'a0000000-0000-0000-0000-000000000001/a4000000-0000-0000-0000-000000000001/plan-rdc-v1.png','image/png',1000,'tous_affectes'),
  ('a7100000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001','Plan étage','plan',
   'a0000000-0000-0000-0000-000000000001/a4000000-0000-0000-0000-000000000001/plan-etage-v1.png','image/png',1000,'gestionnaires')
on conflict (id) do nothing;

commit;
