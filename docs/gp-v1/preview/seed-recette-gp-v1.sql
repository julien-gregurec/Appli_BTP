-- Jeu de données de RECETTE GP V1 (preview uniquement — jamais en Production).
-- Rejouable (identifiants fixes, `on conflict do nothing`). Le mot de passe du compte n'est pas dans ce
-- fichier : il est passé à psql par la variable :'mdp' (ex. psql -v mdp='…' -f seed-recette-gp-v1.sql).
--
-- Entreprise « ELSATIA Recette V2 » sur l'offre Pro (bibliothèque d'ouvrages incluse), un Dirigeant avec
-- tous les droits sauf le mode compte dépôt, un Conducteur (voit les devis sans les coûts), des salariés,
-- clients, chantiers, articles avec coûts d'achat, une équipe, des ressources et une semaine de planning.
begin;
set local elsatia.capacite_personnes_bypass = 'on';

-- Comptes -------------------------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'dirigeant.recette@elsatia-preview.invalid', crypt(:'mdp', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'conducteur.recette@elsatia-preview.invalid', crypt(:'mdp', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{}', '', '', '', '')
on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
from auth.users u where u.id in ('e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002')
  and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');
insert into public.utilisateurs (id, prenom, nom) values
  ('e1000000-0000-4000-8000-000000000001', 'Julien', 'Recette'),
  ('e1000000-0000-4000-8000-000000000002', 'Camille', 'Conducteur')
on conflict (id) do update set prenom = excluded.prenom, nom = excluded.nom;

-- Entreprise sur l'offre Pro ---------------------------------------------------------------------------
insert into public.entreprises (id, nom, raison_sociale, siret, adresse, code_postal, ville, code_adhesion,
                                abonnement_offre, abonnement_statut, abonnement_echeance, assurance_decennale_numero, assurance_decennale_assureur)
values ('e0000000-0000-4000-8000-000000000001', 'ELSATIA Recette V2', 'ELSATIA Recette V2 SARL', '000 000 000 00000',
        '12 rue de la Recette', '67000', 'Strasbourg', 'RECETTE1', 'pro', 'actif', now() + interval '1 year',
        'DEC-RECETTE-0001', 'Assureur fictif')
on conflict (id) do nothing;
update public.entreprises set abonnement_offre = 'pro', abonnement_statut = 'actif' where id = 'e0000000-0000-4000-8000-000000000001';
update public.utilisateurs set entreprise_active_id = 'e0000000-0000-4000-8000-000000000001'
 where id in ('e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002');

insert into public.postes (id, entreprise_id, nom) values
  ('e2000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'Dirigeant'),
  ('e2000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'Conducteur de travaux'),
  ('e2000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001', 'Ouvrier')
on conflict (id) do nothing;
-- Dirigeant : tout, sauf le mode compte dépôt (rôle de borne, pas un droit d'administration).
insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
select 'e0000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', d.cle, true
from public.permissions_disponibles d where d.cle <> 'mode_compte_depot'
on conflict do nothing;
-- Conducteur : devis et planning sans les coûts ni les remises (profil « prix masqués »).
insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
select 'e0000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000002', d.cle, true
from public.permissions_disponibles d
where d.cle in ('acces_dashboard','acces_messagerie','acces_clients','gerer_clients','acces_chantiers','gerer_chantiers','acces_devis','gerer_devis',
                'acces_planning','gerer_planning','acces_pointage','gerer_pointage','acces_ouvrages','acces_employes')
on conflict do nothing;
insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
select 'e0000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000003', d.cle, true
from public.permissions_disponibles d
where d.cle in ('voir_chantiers_assignes','acces_pointage','saisir_son_pointage','acces_planning','demander_ses_conges','saisir_ses_notes_frais')
on conflict do nothing;
insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut) values
  ('e1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'actif'),
  ('e1000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000002', 'actif')
on conflict do nothing;

-- Salariés -------------------------------------------------------------------------------------------
insert into public.employes (id, entreprise_id, utilisateur_id, prenom, nom, numero_inscription, identifiant_interne, poste, type_contrat, statut, poste_id) values
  ('e3000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'Julien', 'Recette', 'REC-0001', 'R0001', 'Dirigeant', 'cdi', 'actif', 'e2000000-0000-4000-8000-000000000001'),
  ('e3000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', 'Camille', 'Conducteur', 'REC-0002', 'R0002', 'Conducteur de travaux', 'cdi', 'actif', 'e2000000-0000-4000-8000-000000000002'),
  ('e3000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001', null, 'Ali', 'Poseur', 'REC-0003', 'R0003', 'Poseur', 'cdi', 'actif', 'e2000000-0000-4000-8000-000000000003'),
  ('e3000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000001', null, 'Bea', 'Chef d’équipe', 'REC-0004', 'R0004', 'Chef d’équipe', 'cdi', 'actif', 'e2000000-0000-4000-8000-000000000003'),
  ('e3000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000001', null, 'Chris', 'Plaquiste', 'REC-0005', 'R0005', 'Plaquiste', 'cdd', 'actif', 'e2000000-0000-4000-8000-000000000003'),
  ('e3000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-000000000001', null, 'Dan', 'Électricien', 'REC-0006', 'R0006', 'Électricien', 'cdi', 'actif', 'e2000000-0000-4000-8000-000000000003'),
  ('e3000000-0000-4000-8000-000000000007', 'e0000000-0000-4000-8000-000000000001', null, 'Emma', 'Peintre', 'REC-0007', 'R0007', 'Peintre', 'interim', 'actif', 'e2000000-0000-4000-8000-000000000003'),
  ('e3000000-0000-4000-8000-000000000008', 'e0000000-0000-4000-8000-000000000001', null, 'Farid', 'Menuisier', 'REC-0008', 'R0008', 'Menuisier', 'cdi', 'actif', 'e2000000-0000-4000-8000-000000000003')
on conflict (id) do nothing;

-- Clients et chantiers -------------------------------------------------------------------------------
insert into public.clients (id, entreprise_id, reference_interne, nom, prenom, societe, type, statut, adresse_facturation, code_postal, ville, email, telephone) values
  ('e4000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'CLI-0001', 'Dupont', 'Marie', null, 'particulier', 'actif', '3 rue des Lilas', '67000', 'Strasbourg', 'marie.dupont@client.invalid', '06 00 00 00 01'),
  ('e4000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'CLI-0002', 'Martin', 'Paul', 'Martin & Fils SAS', 'professionnel', 'actif', '8 avenue du Port', '67100', 'Strasbourg', 'contact@martin-fils.invalid', '03 88 00 00 02'),
  ('e4000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001', 'CLI-0003', 'Syndic Les Tilleuls', null, 'Syndic Les Tilleuls', 'syndic', 'actif', '1 place des Tilleuls', '67200', 'Strasbourg', 'syndic@tilleuls.invalid', '03 88 00 00 03'),
  ('e4000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000001', 'CLI-0004', 'Nguyen', 'Linh', 'Bureaux Nguyen Conseil', 'professionnel', 'prospect', '22 rue du Commerce', '67000', 'Strasbourg', 'linh@nguyen-conseil.invalid', '06 00 00 00 04')
on conflict (id) do nothing;
insert into public.chantiers (id, entreprise_id, reference_interne, client_id, nom, adresse, code_postal, ville, statut) values
  ('e5000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'CH-0001', 'e4000000-0000-4000-8000-000000000001', 'Rénovation cuisine Dupont', '3 rue des Lilas', '67000', 'Strasbourg', 'en_cours'),
  ('e5000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'CH-0002', 'e4000000-0000-4000-8000-000000000002', 'Aménagement bureaux Martin', '8 avenue du Port', '67100', 'Strasbourg', 'en_cours'),
  ('e5000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001', 'CH-0003', 'e4000000-0000-4000-8000-000000000003', 'Ravalement Les Tilleuls', '1 place des Tilleuls', '67200', 'Strasbourg', 'en_cours'),
  ('e5000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000001', 'CH-0004', 'e4000000-0000-4000-8000-000000000004', 'Cloisons vitrées Nguyen', '22 rue du Commerce', '67000', 'Strasbourg', 'en_cours')
on conflict (id) do nothing;

-- Bibliothèque d'articles (références, fabricants, coûts d'achat, coefficients) --------------------------
insert into public.catalogue_familles (id, entreprise_id, parent_id, nom, ordre) values
  ('e6000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', null, 'Plâtrerie', 1),
  ('e6000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001', 'Plaques', 1),
  ('e6000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001', 'Ossature', 2),
  ('e6000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000001', null, 'Menuiserie', 2),
  ('e6000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000001', null, 'Main-d’œuvre', 3)
on conflict (id) do nothing;
insert into public.prestations_catalogue (id, entreprise_id, reference_interne, reference_fabricant, fabricant, designation, description, type, unite, prix_unitaire_ht, taux_tva, famille_id) values
  ('e7000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'ART-0001', 'BA13-STD', 'Placo', 'Plaque de plâtre BA13 standard', '2 500 × 1 200 mm, bords amincis', 'fourniture', 'm²', 9.80, 20, 'e6000000-0000-4000-8000-000000000002'),
  ('e7000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'ART-0002', 'BA13-HYDRO', 'Placo', 'Plaque de plâtre BA13 hydrofuge', 'Pièces humides', 'fourniture', 'm²', 13.50, 20, 'e6000000-0000-4000-8000-000000000002'),
  ('e7000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001', 'ART-0003', 'R48', 'Knauf', 'Rail métallique 48 mm', 'Longueur 3 m', 'fourniture', 'ml', 2.90, 20, 'e6000000-0000-4000-8000-000000000003'),
  ('e7000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000001', 'ART-0004', 'M48', 'Knauf', 'Montant métallique 48 mm', 'Longueur 2,50 m', 'fourniture', 'ml', 3.40, 20, 'e6000000-0000-4000-8000-000000000003'),
  ('e7000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000001', 'ART-0005', 'LDV-45', 'Isover', 'Laine de verre 45 mm', 'Rouleau, λ 0,032', 'fourniture', 'm²', 6.20, 20, 'e6000000-0000-4000-8000-000000000001'),
  ('e7000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-000000000001', 'ART-0006', 'VIT-CLR-10', 'Saint-Gobain', 'Vitrage clair trempé 10 mm', 'Cloison vitrée, sur mesure', 'fourniture', 'm²', 145.00, 20, 'e6000000-0000-4000-8000-000000000004'),
  ('e7000000-0000-4000-8000-000000000007', 'e0000000-0000-4000-8000-000000000001', 'ART-0007', 'PROF-ALU-CV', 'Technal', 'Profilé aluminium pour cloison vitrée', 'Laqué blanc', 'fourniture', 'ml', 38.00, 20, 'e6000000-0000-4000-8000-000000000004'),
  ('e7000000-0000-4000-8000-000000000008', 'e0000000-0000-4000-8000-000000000001', 'ART-0008', 'PI-83', null, 'Porte isoplane 83 cm', 'Bloc-porte prépeint', 'fourniture', 'u', 96.00, 20, 'e6000000-0000-4000-8000-000000000004'),
  ('e7000000-0000-4000-8000-000000000009', 'e0000000-0000-4000-8000-000000000001', 'MO-0001', null, null, 'Main-d’œuvre plaquiste', 'Heure de pose', 'main_oeuvre', 'h', 42.00, 20, 'e6000000-0000-4000-8000-000000000005'),
  ('e7000000-0000-4000-8000-000000000010', 'e0000000-0000-4000-8000-000000000001', 'MO-0002', null, null, 'Main-d’œuvre menuisier', 'Heure de pose', 'main_oeuvre', 'h', 48.00, 20, 'e6000000-0000-4000-8000-000000000005'),
  ('e7000000-0000-4000-8000-000000000011', 'e0000000-0000-4000-8000-000000000001', 'PRS-0001', null, null, 'Dépose et évacuation', 'Forfait par pièce, gravats compris', 'forfait', 'u', 180.00, 20, null),
  ('e7000000-0000-4000-8000-000000000012', 'e0000000-0000-4000-8000-000000000001', 'DEP-0001', null, null, 'Déplacement', 'Forfait aller-retour', 'deplacement', 'u', 35.00, 20, null)
on conflict (id) do nothing;
insert into public.prestations_catalogue_couts (prestation_id, entreprise_id, prix_achat_ht, coefficient, mode_prix) values
  ('e7000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 6.10, 1.6, 'calcule'),
  ('e7000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 8.40, 1.6, 'calcule'),
  ('e7000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001', 1.80, 1.6, 'calcule'),
  ('e7000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000001', 2.10, 1.6, 'calcule'),
  ('e7000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000001', 3.90, 1.6, 'calcule'),
  ('e7000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-000000000001', 98.00, 1.48, 'calcule'),
  ('e7000000-0000-4000-8000-000000000007', 'e0000000-0000-4000-8000-000000000001', 24.00, 1.58, 'calcule'),
  ('e7000000-0000-4000-8000-000000000008', 'e0000000-0000-4000-8000-000000000001', 61.00, 1.57, 'calcule'),
  ('e7000000-0000-4000-8000-000000000009', 'e0000000-0000-4000-8000-000000000001', 28.00, 1.5, 'calcule'),
  ('e7000000-0000-4000-8000-000000000010', 'e0000000-0000-4000-8000-000000000001', 31.00, 1.55, 'calcule')
on conflict do nothing;

-- Planning : équipe, ressources, une semaine d'évènements (lundi de la semaine courante) --------------------
insert into public.equipes (id, entreprise_id, nom, couleur) values
  ('e8000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'Équipe plâtrerie', '#0e7490')
on conflict (id) do nothing;
insert into public.equipes_membres (equipe_id, employe_id, entreprise_id) values
  ('e8000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001'),
  ('e8000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.planning_ressources (id, entreprise_id, type, nom) values
  ('e9000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'nacelle', 'Nacelle 12 m'),
  ('e9000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'vehicule', 'Camion benne'),
  ('e9000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001', 'machine', 'Mini-pelle')
on conflict (id) do nothing;
do $$
declare
  lundi date := date_trunc('week', current_date)::date;
  e uuid := 'e0000000-0000-4000-8000-000000000001';
  ev uuid;
  paris constant text := 'Europe/Paris';
  i int;
begin
  -- Une affectation = exactement un salarié OU une équipe OU une ressource (contrainte planning_affectations_check).
  for i in 1..10 loop
    ev := ('ea000000-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid;
    insert into public.planning_evenements (id, entreprise_id, chantier_id, client_id, titre, type, statut, debut, fin, adresse, couleur)
    select ev, e, c.id, c.client_id, t.titre, t.type, 'planifie',
           ((lundi + t.jour)::timestamp + make_interval(hours => t.h1)) at time zone paris,
           ((lundi + t.jour)::timestamp + make_interval(hours => t.h2)) at time zone paris,
           c.adresse || ', ' || c.ville, t.couleur
    from (values
      (1, 'Pose cloisons cuisine', 'chantier', 'CH-0001', 0, 8, 12, '#2563eb'),
      (2, 'Carrelage salle de bains', 'chantier', 'CH-0001', 0, 13, 17, '#2563eb'),
      (3, 'Livraison plaques', 'livraison', 'CH-0002', 1, 7, 8, '#d97706'),
      (4, 'Cloisons vitrées R+1', 'chantier', 'CH-0004', 1, 8, 17, '#0e7490'),
      (5, 'Dépannage électrique', 'intervention', 'CH-0003', 2, 10, 12, '#7c3aed'),
      (6, 'Ravalement façade sud (nacelle)', 'chantier', 'CH-0003', 2, 8, 16, '#059669'),
      (7, 'Réunion de chantier Martin', 'rendez_vous', 'CH-0002', 3, 14, 15, '#9333ea'),
      (8, 'Peinture bureaux', 'chantier', 'CH-0002', 3, 8, 17, '#2563eb'),
      (9, 'Formation habilitation électrique', 'formation', 'CH-0003', 4, 8, 17, '#475569'),
      (10, 'Pose portes', 'chantier', 'CH-0002', 4, 8, 12, '#2563eb')
    ) as t(n, titre, type, ref, jour, h1, h2, couleur)
    join public.chantiers c on c.entreprise_id = e and c.reference_interne = t.ref
    where t.n = i
    on conflict (id) do nothing;
  end loop;
  insert into public.planning_affectations (evenement_id, entreprise_id, employe_id, equipe_id, ressource_id) values
    ('ea000000-0000-4000-8000-000000000001', e, 'e3000000-0000-4000-8000-000000000003', null, null),
    ('ea000000-0000-4000-8000-000000000001', e, 'e3000000-0000-4000-8000-000000000004', null, null),
    ('ea000000-0000-4000-8000-000000000002', e, 'e3000000-0000-4000-8000-000000000003', null, null),
    ('ea000000-0000-4000-8000-000000000003', e, 'e3000000-0000-4000-8000-000000000005', null, null),
    ('ea000000-0000-4000-8000-000000000003', e, null, null, 'e9000000-0000-4000-8000-000000000002'),
    ('ea000000-0000-4000-8000-000000000004', e, null, 'e8000000-0000-4000-8000-000000000001', null),
    ('ea000000-0000-4000-8000-000000000004', e, 'e3000000-0000-4000-8000-000000000008', null, null),
    ('ea000000-0000-4000-8000-000000000005', e, 'e3000000-0000-4000-8000-000000000006', null, null),
    ('ea000000-0000-4000-8000-000000000006', e, 'e3000000-0000-4000-8000-000000000007', null, null),
    ('ea000000-0000-4000-8000-000000000006', e, null, null, 'e9000000-0000-4000-8000-000000000001'),
    ('ea000000-0000-4000-8000-000000000007', e, 'e3000000-0000-4000-8000-000000000002', null, null),
    ('ea000000-0000-4000-8000-000000000007', e, 'e3000000-0000-4000-8000-000000000004', null, null),
    ('ea000000-0000-4000-8000-000000000008', e, 'e3000000-0000-4000-8000-000000000007', null, null),
    ('ea000000-0000-4000-8000-000000000009', e, 'e3000000-0000-4000-8000-000000000006', null, null),
    ('ea000000-0000-4000-8000-000000000010', e, 'e3000000-0000-4000-8000-000000000008', null, null)
  on conflict do nothing;
end $$;

-- Bibliothèque d'ouvrages (offre Pro) : composition sans prix d'achat dans le JSON, coûts à part ------------------
insert into public.ouvrages (id, entreprise_id, reference_interne, nom, categorie, unite_principale, statut, version_courante, famille_id) values
  ('eb000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'OUV-0001', 'Cloison vitrée toute hauteur', 'Menuiserie', 'm²', 'actif', 1, 'e6000000-0000-4000-8000-000000000004'),
  ('eb000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'OUV-0002', 'Cloison plaques de plâtre 72/48', 'Plâtrerie', 'm²', 'actif', 1, 'e6000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;
insert into public.ouvrages_versions (id, ouvrage_id, entreprise_id, version, reference_interne, nom, description_interne, description_client, categorie, unite_principale, quantite_principale, composants) values
  ('ec000000-0000-4000-8000-000000000001', 'eb000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 1, 'OUV-0001', 'Cloison vitrée toute hauteur',
   'Vitrage trempé 10 mm sur profilés alu laqués ; pose comprise.', 'Fourniture et pose d’une cloison vitrée toute hauteur, vitrage trempé 10 mm sur ossature aluminium laquée blanc.',
   'Menuiserie', 'm²', 1,
   '[{"cle":"vitrage","ordre":1,"nature":"article","designation":"Vitrage clair trempé 10 mm","unite":"m²","coefficient":1,"base":{"type":"principale"},"quantiteFixe":null,"saisieRequise":false,"pertePct":5,"arrondi":{"mode":"aucun"},"quantiteMin":null,"condition":{"type":"toujours"},"source":{"catalogue":"prestation","id":"e7000000-0000-4000-8000-000000000006"},"referenceInterne":"ART-0006","referenceFabricant":"VIT-CLR-10","fabricant":"Saint-Gobain","fournisseur":null,"descriptionClient":null,"prixVenteHt":145,"tauxTva":20,"visibleClient":true},
     {"cle":"profile","ordre":2,"nature":"article","designation":"Profilé aluminium pour cloison vitrée","unite":"ml","coefficient":1.2,"base":{"type":"principale"},"quantiteFixe":null,"saisieRequise":false,"pertePct":0,"arrondi":{"mode":"superieur","pas":0.5},"quantiteMin":null,"condition":{"type":"toujours"},"source":{"catalogue":"prestation","id":"e7000000-0000-4000-8000-000000000007"},"referenceInterne":"ART-0007","referenceFabricant":"PROF-ALU-CV","fabricant":"Technal","fournisseur":null,"descriptionClient":null,"prixVenteHt":38,"tauxTva":20,"visibleClient":true},
     {"cle":"pose","ordre":3,"nature":"main_oeuvre","designation":"Main-d’œuvre menuisier","unite":"h","coefficient":0.8,"base":{"type":"principale"},"quantiteFixe":null,"saisieRequise":false,"pertePct":0,"arrondi":{"mode":"proche","pas":0.25},"quantiteMin":1,"condition":{"type":"toujours"},"source":{"catalogue":"prestation","id":"e7000000-0000-4000-8000-000000000010"},"referenceInterne":"MO-0002","referenceFabricant":null,"fabricant":null,"fournisseur":null,"descriptionClient":null,"prixVenteHt":48,"tauxTva":20,"visibleClient":false}]'::jsonb),
  ('ec000000-0000-4000-8000-000000000002', 'eb000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 1, 'OUV-0002', 'Cloison plaques de plâtre 72/48',
   'Une plaque BA13 par face, rails et montants 48, laine 45 mm.', 'Cloison de distribution 72/48 : ossature métallique, isolant laine de verre 45 mm, une plaque BA13 par face.',
   'Plâtrerie', 'm²', 1,
   '[{"cle":"plaque","ordre":1,"nature":"article","designation":"Plaque de plâtre BA13 standard","unite":"m²","coefficient":2,"base":{"type":"principale"},"quantiteFixe":null,"saisieRequise":false,"pertePct":10,"arrondi":{"mode":"superieur","pas":3},"quantiteMin":null,"condition":{"type":"toujours"},"source":{"catalogue":"prestation","id":"e7000000-0000-4000-8000-000000000001"},"referenceInterne":"ART-0001","referenceFabricant":"BA13-STD","fabricant":"Placo","fournisseur":null,"descriptionClient":null,"prixVenteHt":9.8,"tauxTva":20,"visibleClient":true},
     {"cle":"rail","ordre":2,"nature":"article","designation":"Rail métallique 48 mm","unite":"ml","coefficient":0.8,"base":{"type":"principale"},"quantiteFixe":null,"saisieRequise":false,"pertePct":0,"arrondi":{"mode":"superieur","pas":3},"quantiteMin":null,"condition":{"type":"toujours"},"source":{"catalogue":"prestation","id":"e7000000-0000-4000-8000-000000000003"},"referenceInterne":"ART-0003","referenceFabricant":"R48","fabricant":"Knauf","fournisseur":null,"descriptionClient":null,"prixVenteHt":2.9,"tauxTva":20,"visibleClient":true},
     {"cle":"montant","ordre":3,"nature":"article","designation":"Montant métallique 48 mm","unite":"ml","coefficient":1.7,"base":{"type":"principale"},"quantiteFixe":null,"saisieRequise":false,"pertePct":0,"arrondi":{"mode":"superieur","pas":2.5},"quantiteMin":null,"condition":{"type":"toujours"},"source":{"catalogue":"prestation","id":"e7000000-0000-4000-8000-000000000004"},"referenceInterne":"ART-0004","referenceFabricant":"M48","fabricant":"Knauf","fournisseur":null,"descriptionClient":null,"prixVenteHt":3.4,"tauxTva":20,"visibleClient":true},
     {"cle":"laine","ordre":4,"nature":"article","designation":"Laine de verre 45 mm","unite":"m²","coefficient":1,"base":{"type":"principale"},"quantiteFixe":null,"saisieRequise":false,"pertePct":5,"arrondi":{"mode":"aucun"},"quantiteMin":null,"condition":{"type":"toujours"},"source":{"catalogue":"prestation","id":"e7000000-0000-4000-8000-000000000005"},"referenceInterne":"ART-0005","referenceFabricant":"LDV-45","fabricant":"Isover","fournisseur":null,"descriptionClient":null,"prixVenteHt":6.2,"tauxTva":20,"visibleClient":true},
     {"cle":"pose","ordre":5,"nature":"main_oeuvre","designation":"Main-d’œuvre plaquiste","unite":"h","coefficient":0.6,"base":{"type":"principale"},"quantiteFixe":null,"saisieRequise":false,"pertePct":0,"arrondi":{"mode":"proche","pas":0.25},"quantiteMin":1,"condition":{"type":"toujours"},"source":{"catalogue":"prestation","id":"e7000000-0000-4000-8000-000000000009"},"referenceInterne":"MO-0001","referenceFabricant":null,"fabricant":null,"fournisseur":null,"descriptionClient":null,"prixVenteHt":42,"tauxTva":20,"visibleClient":false}]'::jsonb)
on conflict (id) do nothing;
insert into public.ouvrages_composants_couts (version_id, cle_composant, entreprise_id, prix_achat_ht) values
  ('ec000000-0000-4000-8000-000000000001', 'vitrage', 'e0000000-0000-4000-8000-000000000001', 98.00),
  ('ec000000-0000-4000-8000-000000000001', 'profile', 'e0000000-0000-4000-8000-000000000001', 24.00),
  ('ec000000-0000-4000-8000-000000000001', 'pose', 'e0000000-0000-4000-8000-000000000001', 31.00),
  ('ec000000-0000-4000-8000-000000000002', 'plaque', 'e0000000-0000-4000-8000-000000000001', 6.10),
  ('ec000000-0000-4000-8000-000000000002', 'rail', 'e0000000-0000-4000-8000-000000000001', 1.80),
  ('ec000000-0000-4000-8000-000000000002', 'montant', 'e0000000-0000-4000-8000-000000000001', 2.10),
  ('ec000000-0000-4000-8000-000000000002', 'laine', 'e0000000-0000-4000-8000-000000000001', 3.90),
  ('ec000000-0000-4000-8000-000000000002', 'pose', 'e0000000-0000-4000-8000-000000000001', 28.00)
on conflict do nothing;
commit;
