-- Jeu de données de DÉMONSTRATION COMPLÈTE pour le compte de recette GP V1 (preview uniquement — jamais en
-- Production). À jouer APRÈS `seed-recette-gp-v1.sql` (mêmes identifiants fixes, mêmes comptes).
-- Rejouable : `on conflict do nothing` / `where not exists` partout ; aucune suppression de données réelles.
--
-- Entreprise « ELSATIA Recette V2 » (offre Pro, abonnement actif jusqu'au 31/01/2028) :
--   16 clients avec contacts, 12 chantiers, 6 fournisseurs, 60 articles (10 familles, coûts d'achat),
--   10 ouvrages, 12 salariés, 9 devis (brouillon / envoyé / accepté / refusé), 3 factures, planning de la
--   semaine courante (18 évènements). Julien doit pouvoir tout tester sans rien créer.
begin;
set local elsatia.capacite_personnes_bypass = 'on';

-- Abonnement stable : jamais bloqué pendant la validation ---------------------------------------------------
update public.entreprises
   set abonnement_offre = 'pro', abonnement_statut = 'actif', abonnement_echeance = '2028-01-31'
 where id = 'e0000000-0000-4000-8000-000000000001';

-- Clients (12 de plus) et contacts ---------------------------------------------------------------------------
insert into public.clients (id, entreprise_id, reference_interne, nom, prenom, societe, type, statut, adresse_facturation, code_postal, ville, email, telephone, siret, delai_paiement_jours) values
  ('e4000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000001', 'CLI-0005', 'Lefebvre', 'Claire', null, 'particulier', 'actif', '14 rue des Vignes', '67200', 'Strasbourg', 'claire.lefebvre@exemple.invalid', '06 11 22 33 44', null, 30),
  ('e4000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-000000000001', 'CLI-0006', 'Bernard', 'Thomas', 'Bernard Immobilier', 'professionnel', 'actif', '5 quai des Bateliers', '67000', 'Strasbourg', 'contact@bernard-immo.invalid', '03 88 11 22 33', '123 456 789 00012', 45),
  ('e4000000-0000-4000-8000-000000000007', 'e0000000-0000-4000-8000-000000000001', 'CLI-0007', 'Mairie de Schiltigheim', null, 'Mairie de Schiltigheim', 'collectivite', 'actif', '110 route de Bischwiller', '67300', 'Schiltigheim', 'services-techniques@schiltigheim.invalid', '03 88 83 90 00', '216 703 000 00010', 30),
  ('e4000000-0000-4000-8000-000000000008', 'e0000000-0000-4000-8000-000000000001', 'CLI-0008', 'Promo Rhin', null, 'Promo Rhin SAS', 'promoteur', 'actif', '3 avenue de l’Europe', '67000', 'Strasbourg', 'chantiers@promorhin.invalid', '03 88 44 55 66', '987 654 321 00021', 60),
  ('e4000000-0000-4000-8000-000000000009', 'e0000000-0000-4000-8000-000000000001', 'CLI-0009', 'Meyer', 'Sophie', null, 'particulier', 'actif', '27 rue de la Forêt', '67400', 'Illkirch-Graffenstaden', 'sophie.meyer@exemple.invalid', '06 55 66 77 88', null, 30),
  ('e4000000-0000-4000-8000-000000000010', 'e0000000-0000-4000-8000-000000000001', 'CLI-0010', 'Boulangerie Kuhn', null, 'Boulangerie Kuhn', 'professionnel', 'actif', '18 rue du Marché', '67500', 'Haguenau', 'kuhn@exemple.invalid', '03 88 73 00 00', '456 789 123 00034', 30),
  ('e4000000-0000-4000-8000-000000000011', 'e0000000-0000-4000-8000-000000000001', 'CLI-0011', 'Syndic Rive Gauche', null, 'Syndic Rive Gauche', 'syndic', 'actif', '9 rue du Faubourg National', '67000', 'Strasbourg', 'gestion@rivegauche.invalid', '03 88 22 33 44', '321 654 987 00045', 45),
  ('e4000000-0000-4000-8000-000000000012', 'e0000000-0000-4000-8000-000000000001', 'CLI-0012', 'Schmitt', 'Antoine', null, 'particulier', 'prospect', '2 impasse des Cerisiers', '67800', 'Hœnheim', 'antoine.schmitt@exemple.invalid', '06 99 88 77 66', null, 30),
  ('e4000000-0000-4000-8000-000000000013', 'e0000000-0000-4000-8000-000000000001', 'CLI-0013', 'Cabinet Weber', null, 'Cabinet Weber Architectes', 'professionnel', 'actif', '41 rue du 22 Novembre', '67000', 'Strasbourg', 'agence@weber-archi.invalid', '03 88 55 66 77', '654 321 987 00056', 30),
  ('e4000000-0000-4000-8000-000000000014', 'e0000000-0000-4000-8000-000000000001', 'CLI-0014', 'Hôtel du Parc', null, 'Hôtel du Parc', 'professionnel', 'actif', '6 avenue du Parc', '67600', 'Sélestat', 'direction@hotelduparc.invalid', '03 88 92 00 00', '789 123 456 00067', 30),
  ('e4000000-0000-4000-8000-000000000015', 'e0000000-0000-4000-8000-000000000001', 'CLI-0015', 'Roth', 'Isabelle', null, 'particulier', 'inactif', '33 rue des Roses', '67100', 'Strasbourg', 'isabelle.roth@exemple.invalid', '06 12 34 56 78', null, 30),
  ('e4000000-0000-4000-8000-000000000016', 'e0000000-0000-4000-8000-000000000001', 'CLI-0016', 'Garage Muller', null, 'Garage Muller SARL', 'professionnel', 'actif', '77 route de Colmar', '67100', 'Strasbourg', 'atelier@garage-muller.invalid', '03 88 39 00 00', '147 258 369 00078', 30)
on conflict (id) do nothing;
insert into public.contacts_clients (id, client_id, nom, fonction, telephone, email, principal)
select ('e4c00000-0000-4000-8000-0000000000' || lpad(t.n::text, 2, '0'))::uuid, t.client, t.nom, t.fonction, t.tel, t.mail, t.principal
from (values
  (1, 'e4000000-0000-4000-8000-000000000002'::uuid, 'Paul Martin', 'Gérant', '06 20 30 40 50', 'paul@martin-fils.invalid', true),
  (2, 'e4000000-0000-4000-8000-000000000002'::uuid, 'Lucie Martin', 'Comptabilité', '03 88 60 61 62', 'compta@martin-fils.invalid', false),
  (3, 'e4000000-0000-4000-8000-000000000003'::uuid, 'M. Ferrand', 'Président du conseil syndical', '06 45 45 45 45', 'ferrand@tilleuls.invalid', true),
  (4, 'e4000000-0000-4000-8000-000000000004'::uuid, 'Linh Nguyen', 'Dirigeante', '06 70 80 90 10', 'linh@nguyen-conseil.invalid', true),
  (5, 'e4000000-0000-4000-8000-000000000006'::uuid, 'Thomas Bernard', 'Gérant', '06 31 32 33 34', 'thomas@bernard-immo.invalid', true),
  (6, 'e4000000-0000-4000-8000-000000000006'::uuid, 'Nadia Klein', 'Gestionnaire technique', '03 88 11 22 34', 'nadia@bernard-immo.invalid', false),
  (7, 'e4000000-0000-4000-8000-000000000007'::uuid, 'Service bâtiments', 'Responsable technique', '03 88 83 90 12', 'batiments@schiltigheim.invalid', true),
  (8, 'e4000000-0000-4000-8000-000000000008'::uuid, 'Marc Holtz', 'Conducteur d’opérations', '06 12 12 12 12', 'm.holtz@promorhin.invalid', true),
  (9, 'e4000000-0000-4000-8000-000000000010'::uuid, 'Jean Kuhn', 'Artisan', '03 88 73 00 01', null, true),
  (10, 'e4000000-0000-4000-8000-000000000011'::uuid, 'Anne Riedinger', 'Gestionnaire', '03 88 22 33 45', 'a.riedinger@rivegauche.invalid', true),
  (11, 'e4000000-0000-4000-8000-000000000013'::uuid, 'Élise Weber', 'Architecte', '06 78 78 78 78', 'e.weber@weber-archi.invalid', true),
  (12, 'e4000000-0000-4000-8000-000000000014'::uuid, 'Directeur', 'Direction', '03 88 92 00 01', 'direction@hotelduparc.invalid', true),
  (13, 'e4000000-0000-4000-8000-000000000016'::uuid, 'Karl Muller', 'Gérant', '06 44 44 44 44', 'karl@garage-muller.invalid', true)
) as t(n, client, nom, fonction, tel, mail, principal)
where not exists (select 1 from public.contacts_clients c where c.client_id = t.client and c.nom = t.nom);

-- Chantiers (8 de plus) --------------------------------------------------------------------------------------
insert into public.chantiers (id, entreprise_id, reference_interne, client_id, nom, adresse, code_postal, ville, statut, date_debut_prevue, date_fin_prevue, budget_previsionnel) values
  ('e5000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000001', 'CH-0005', 'e4000000-0000-4000-8000-000000000005', 'Rénovation appartement Lefebvre', '14 rue des Vignes', '67200', 'Strasbourg', 'en_cours', current_date - 20, current_date + 25, 24000),
  ('e5000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-000000000001', 'CH-0006', 'e4000000-0000-4000-8000-000000000006', 'Réhabilitation immeuble Bateliers', '5 quai des Bateliers', '67000', 'Strasbourg', 'en_cours', current_date - 60, current_date + 90, 180000),
  ('e5000000-0000-4000-8000-000000000007', 'e0000000-0000-4000-8000-000000000001', 'CH-0007', 'e4000000-0000-4000-8000-000000000007', 'École élémentaire — cloisons et peinture', '12 rue des Écoles', '67300', 'Schiltigheim', 'prospect', current_date + 40, current_date + 70, 65000),
  ('e5000000-0000-4000-8000-000000000008', 'e0000000-0000-4000-8000-000000000001', 'CH-0008', 'e4000000-0000-4000-8000-000000000008', 'Résidence Les Terrasses — lot plâtrerie', 'Rue des Terrasses', '67000', 'Strasbourg', 'en_cours', current_date - 10, current_date + 120, 260000),
  ('e5000000-0000-4000-8000-000000000009', 'e0000000-0000-4000-8000-000000000001', 'CH-0009', 'e4000000-0000-4000-8000-000000000009', 'Salle de bains Meyer', '27 rue de la Forêt', '67400', 'Illkirch-Graffenstaden', 'termine', current_date - 50, current_date - 30, 9500),
  ('e5000000-0000-4000-8000-000000000010', 'e0000000-0000-4000-8000-000000000001', 'CH-0010', 'e4000000-0000-4000-8000-000000000010', 'Fournil Kuhn — cloison coupe-feu', '18 rue du Marché', '67500', 'Haguenau', 'prospect', current_date + 12, current_date + 20, 7800),
  ('e5000000-0000-4000-8000-000000000011', 'e0000000-0000-4000-8000-000000000001', 'CH-0011', 'e4000000-0000-4000-8000-000000000014', 'Hôtel du Parc — 12 chambres', '6 avenue du Parc', '67600', 'Sélestat', 'en_cours', current_date - 5, current_date + 60, 88000),
  ('e5000000-0000-4000-8000-000000000012', 'e0000000-0000-4000-8000-000000000001', 'CH-0012', 'e4000000-0000-4000-8000-000000000016', 'Garage Muller — bureaux', '77 route de Colmar', '67100', 'Strasbourg', 'prospect', current_date + 30, current_date + 45, 15000)
on conflict (id) do nothing;

-- Fournisseurs ------------------------------------------------------------------------------------------------
insert into public.fournisseurs (id, entreprise_id, reference, nom, contact_nom, email, telephone, adresse, code_postal, ville, siret, delai_paiement_jours, type_tiers, specialite) values
  ('ed000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'FRN-0001', 'Point P Strasbourg', 'Comptoir pro', 'pro.strasbourg@pointp.invalid', '03 88 10 10 10', '30 rue du Rhin', '67000', 'Strasbourg', '552 100 000 00011', 30, 'fournisseur', 'Matériaux'),
  ('ed000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'FRN-0002', 'Rexel Alsace', 'Agence pro', 'alsace@rexel.invalid', '03 88 20 20 20', '4 rue de l’Industrie', '67800', 'Bischheim', '552 200 000 00022', 45, 'fournisseur', 'Électricité'),
  ('ed000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001', 'FRN-0003', 'Cedeo Plomberie', 'Comptoir', 'strasbourg@cedeo.invalid', '03 88 30 30 30', '9 rue des Artisans', '67200', 'Strasbourg', '552 300 000 00033', 30, 'fournisseur', 'Plomberie'),
  ('ed000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000001', 'FRN-0004', 'Peintures Zolpan', 'Magasin', 'strasbourg@zolpan.invalid', '03 88 40 40 40', '2 rue de la Peinture', '67100', 'Strasbourg', '552 400 000 00044', 30, 'fournisseur', 'Peinture'),
  ('ed000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000001', 'FRN-0005', 'Élec Services Rhin', 'Gérant', 'contact@elec-rhin.invalid', '06 50 50 50 50', '8 rue Basse', '67300', 'Schiltigheim', '552 500 000 00055', 30, 'sous_traitant', 'Électricité générale'),
  ('ed000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-000000000001', 'FRN-0006', 'Carrelages Fritz', 'Atelier', 'atelier@carrelages-fritz.invalid', '03 88 60 60 60', '15 rue Haute', '67400', 'Illkirch-Graffenstaden', '552 600 000 00066', 45, 'sous_traitant', 'Carrelage')
on conflict (id) do nothing;

-- Familles et articles (45 de plus : 57 au total) -------------------------------------------------------------
insert into public.catalogue_familles (id, entreprise_id, parent_id, nom, ordre) values
  ('e6000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-000000000001', null, 'Électricité', 4),
  ('e6000000-0000-4000-8000-000000000007', 'e0000000-0000-4000-8000-000000000001', null, 'Plomberie', 5),
  ('e6000000-0000-4000-8000-000000000008', 'e0000000-0000-4000-8000-000000000001', null, 'Peinture', 6),
  ('e6000000-0000-4000-8000-000000000009', 'e0000000-0000-4000-8000-000000000001', null, 'Carrelage', 7),
  ('e6000000-0000-4000-8000-000000000010', 'e0000000-0000-4000-8000-000000000001', null, 'Forfaits et prestations', 8)
on conflict (id) do nothing;
insert into public.prestations_catalogue (id, entreprise_id, reference_interne, reference_fabricant, fabricant, designation, description, type, unite, prix_unitaire_ht, taux_tva, famille_id, fournisseur_id)
select ('e7000000-0000-4000-8000-0000000000' || lpad((12 + t.n)::text, 2, '0'))::uuid, 'e0000000-0000-4000-8000-000000000001',
       t.ref, t.reffab, t.fab, t.designation, t.description, t.type, t.unite, t.prix, 20, t.famille, t.fournisseur
from (values
  -- Plâtrerie
  (1, 'ART-0009', 'BA13-FEU', 'Placo', 'Plaque de plâtre BA13 coupe-feu', 'Plaque rose, résistance au feu', 'fourniture', 'm²', 14.90, 'e6000000-0000-4000-8000-000000000002'::uuid, 'ed000000-0000-4000-8000-000000000001'::uuid),
  (2, 'ART-0010', 'BA18-PHON', 'Placo', 'Plaque de plâtre BA18 phonique', 'Isolation acoustique renforcée', 'fourniture', 'm²', 17.60, 'e6000000-0000-4000-8000-000000000002'::uuid, 'ed000000-0000-4000-8000-000000000001'::uuid),
  (3, 'ART-0011', 'R70', 'Knauf', 'Rail métallique 70 mm', 'Longueur 3 m', 'fourniture', 'ml', 3.60, 'e6000000-0000-4000-8000-000000000003'::uuid, 'ed000000-0000-4000-8000-000000000001'::uuid),
  (4, 'ART-0012', 'M70', 'Knauf', 'Montant métallique 70 mm', 'Longueur 2,50 m', 'fourniture', 'ml', 4.20, 'e6000000-0000-4000-8000-000000000003'::uuid, 'ed000000-0000-4000-8000-000000000001'::uuid),
  (5, 'ART-0013', 'BANDE-JOINT', 'Placo', 'Bande à joint papier', 'Rouleau 150 m', 'fourniture', 'rouleau', 6.50, 'e6000000-0000-4000-8000-000000000001'::uuid, 'ed000000-0000-4000-8000-000000000001'::uuid),
  (6, 'ART-0014', 'ENDUIT-25', 'Placo', 'Enduit à joint', 'Sac de 25 kg', 'fourniture', 'sac', 21.00, 'e6000000-0000-4000-8000-000000000001'::uuid, 'ed000000-0000-4000-8000-000000000001'::uuid),
  (7, 'ART-0015', 'LDV-100', 'Isover', 'Laine de verre 100 mm', 'Rouleau, λ 0,035', 'fourniture', 'm²', 8.90, 'e6000000-0000-4000-8000-000000000001'::uuid, 'ed000000-0000-4000-8000-000000000001'::uuid),
  (8, 'ART-0016', 'VIS-25', null, 'Vis à plaque 25 mm', 'Boîte de 1 000', 'fourniture', 'boîte', 12.00, 'e6000000-0000-4000-8000-000000000001'::uuid, 'ed000000-0000-4000-8000-000000000001'::uuid),
  (9, 'ART-0017', 'SUSP-600', 'Knauf', 'Suspente plafond', 'Pièce', 'fourniture', 'pièce', 0.95, 'e6000000-0000-4000-8000-000000000003'::uuid, 'ed000000-0000-4000-8000-000000000001'::uuid),
  (10, 'ART-0018', 'FOURRURE', 'Knauf', 'Fourrure plafond', 'Longueur 3 m', 'fourniture', 'ml', 1.90, 'e6000000-0000-4000-8000-000000000003'::uuid, 'ed000000-0000-4000-8000-000000000001'::uuid),
  -- Menuiserie
  (11, 'ART-0019', 'PI-73', null, 'Porte isoplane 73 cm', 'Bloc-porte prépeint', 'fourniture', 'u', 92.00, 'e6000000-0000-4000-8000-000000000004'::uuid, 'ed000000-0000-4000-8000-000000000001'::uuid),
  (12, 'ART-0020', 'PI-93', null, 'Porte isoplane 93 cm', 'Bloc-porte prépeint', 'fourniture', 'u', 104.00, 'e6000000-0000-4000-8000-000000000004'::uuid, 'ed000000-0000-4000-8000-000000000001'::uuid),
  (13, 'ART-0021', 'PORTE-VIT', 'Technal', 'Porte vitrée toute hauteur', 'Vitrage trempé, paumelles alu', 'fourniture', 'u', 890.00, 'e6000000-0000-4000-8000-000000000004'::uuid, null),
  (14, 'ART-0022', 'PLINTHE-MDF', null, 'Plinthe MDF 10 cm', 'Longueur 2,40 m', 'fourniture', 'ml', 3.20, 'e6000000-0000-4000-8000-000000000004'::uuid, 'ed000000-0000-4000-8000-000000000001'::uuid),
  (15, 'ART-0023', 'POIGNEE-INOX', null, 'Poignée de porte inox', 'Paire, sur rosace', 'fourniture', 'paire', 28.00, 'e6000000-0000-4000-8000-000000000004'::uuid, null),
  (16, 'ART-0024', 'PARQUET-CHENE', null, 'Parquet contrecollé chêne', 'Lame 14 mm, paquet de 2,2 m²', 'fourniture', 'm²', 46.00, 'e6000000-0000-4000-8000-000000000004'::uuid, 'ed000000-0000-4000-8000-000000000001'::uuid),
  -- Électricité
  (17, 'ART-0025', 'PRISE-2P+T', 'Legrand', 'Prise 2P+T encastrée', 'Série Mosaic, blanc', 'fourniture', 'u', 9.40, 'e6000000-0000-4000-8000-000000000006'::uuid, 'ed000000-0000-4000-8000-000000000002'::uuid),
  (18, 'ART-0026', 'INTER-VV', 'Legrand', 'Interrupteur va-et-vient', 'Série Mosaic, blanc', 'fourniture', 'u', 8.60, 'e6000000-0000-4000-8000-000000000006'::uuid, 'ed000000-0000-4000-8000-000000000002'::uuid),
  (19, 'ART-0027', 'CABLE-3G2.5', 'Nexans', 'Câble U-1000 R2V 3G2,5', 'Couronne 100 m', 'fourniture', 'm', 1.45, 'e6000000-0000-4000-8000-000000000006'::uuid, 'ed000000-0000-4000-8000-000000000002'::uuid),
  (20, 'ART-0028', 'CABLE-3G1.5', 'Nexans', 'Câble U-1000 R2V 3G1,5', 'Couronne 100 m', 'fourniture', 'm', 0.95, 'e6000000-0000-4000-8000-000000000006'::uuid, 'ed000000-0000-4000-8000-000000000002'::uuid),
  (21, 'ART-0029', 'DISJ-16A', 'Schneider', 'Disjoncteur 16 A', 'Courbe C', 'fourniture', 'u', 11.20, 'e6000000-0000-4000-8000-000000000006'::uuid, 'ed000000-0000-4000-8000-000000000002'::uuid),
  (22, 'ART-0030', 'TABLEAU-2R', 'Schneider', 'Tableau électrique 2 rangées', 'Résidentiel, 26 modules', 'fourniture', 'u', 68.00, 'e6000000-0000-4000-8000-000000000006'::uuid, 'ed000000-0000-4000-8000-000000000002'::uuid),
  (23, 'ART-0031', 'SPOT-LED', null, 'Spot LED encastré 7 W', 'Blanc chaud, orientable', 'fourniture', 'u', 14.50, 'e6000000-0000-4000-8000-000000000006'::uuid, 'ed000000-0000-4000-8000-000000000002'::uuid),
  (24, 'ART-0032', 'GAINE-20', null, 'Gaine ICTA 20 mm', 'Couronne 100 m', 'fourniture', 'm', 0.55, 'e6000000-0000-4000-8000-000000000006'::uuid, 'ed000000-0000-4000-8000-000000000002'::uuid),
  -- Plomberie
  (25, 'ART-0033', 'PER-16', null, 'Tube PER 16 mm', 'Couronne 50 m', 'fourniture', 'm', 1.20, 'e6000000-0000-4000-8000-000000000007'::uuid, 'ed000000-0000-4000-8000-000000000003'::uuid),
  (26, 'ART-0034', 'CUIVRE-14', null, 'Tube cuivre 14 mm', 'Barre 4 m', 'fourniture', 'm', 6.80, 'e6000000-0000-4000-8000-000000000007'::uuid, 'ed000000-0000-4000-8000-000000000003'::uuid),
  (27, 'ART-0035', 'MITIGEUR-LAV', 'Grohe', 'Mitigeur lavabo', 'Chromé, cartouche céramique', 'fourniture', 'u', 89.00, 'e6000000-0000-4000-8000-000000000007'::uuid, 'ed000000-0000-4000-8000-000000000003'::uuid),
  (28, 'ART-0036', 'WC-SUSP', 'Geberit', 'WC suspendu avec bâti-support', 'Cuvette, abattant, plaque', 'fourniture', 'ensemble', 420.00, 'e6000000-0000-4000-8000-000000000007'::uuid, 'ed000000-0000-4000-8000-000000000003'::uuid),
  (29, 'ART-0037', 'RECEVEUR-90', null, 'Receveur de douche 90 × 90', 'Extra-plat, blanc', 'fourniture', 'u', 175.00, 'e6000000-0000-4000-8000-000000000007'::uuid, 'ed000000-0000-4000-8000-000000000003'::uuid),
  (30, 'ART-0038', 'EVAC-40', null, 'Tube PVC évacuation 40 mm', 'Barre 4 m', 'fourniture', 'm', 2.30, 'e6000000-0000-4000-8000-000000000007'::uuid, 'ed000000-0000-4000-8000-000000000003'::uuid),
  -- Peinture
  (31, 'ART-0039', 'ACRYL-MAT', 'Zolpan', 'Peinture acrylique mate', 'Pot de 15 L, blanc', 'fourniture', 'litre', 4.60, 'e6000000-0000-4000-8000-000000000008'::uuid, 'ed000000-0000-4000-8000-000000000004'::uuid),
  (32, 'ART-0040', 'ACRYL-SATIN', 'Zolpan', 'Peinture acrylique satinée', 'Pot de 15 L, teinte au choix', 'fourniture', 'litre', 5.90, 'e6000000-0000-4000-8000-000000000008'::uuid, 'ed000000-0000-4000-8000-000000000004'::uuid),
  (33, 'ART-0041', 'IMPRESSION', 'Zolpan', 'Impression murale', 'Pot de 15 L', 'fourniture', 'litre', 3.80, 'e6000000-0000-4000-8000-000000000008'::uuid, 'ed000000-0000-4000-8000-000000000004'::uuid),
  (34, 'ART-0042', 'ENDUIT-LISS', null, 'Enduit de lissage', 'Sac de 25 kg', 'fourniture', 'sac', 19.00, 'e6000000-0000-4000-8000-000000000008'::uuid, 'ed000000-0000-4000-8000-000000000004'::uuid),
  (35, 'ART-0043', 'TOILE-VERRE', null, 'Toile de verre', 'Rouleau 50 m × 1 m', 'fourniture', 'rouleau', 62.00, 'e6000000-0000-4000-8000-000000000008'::uuid, 'ed000000-0000-4000-8000-000000000004'::uuid),
  -- Carrelage
  (36, 'ART-0044', 'GRES-60', null, 'Grès cérame 60 × 60', 'Rectifié, gris', 'fourniture', 'm²', 24.00, 'e6000000-0000-4000-8000-000000000009'::uuid, 'ed000000-0000-4000-8000-000000000001'::uuid),
  (37, 'ART-0045', 'FAIENCE-25', null, 'Faïence murale 25 × 40', 'Blanc brillant', 'fourniture', 'm²', 18.50, 'e6000000-0000-4000-8000-000000000009'::uuid, 'ed000000-0000-4000-8000-000000000001'::uuid),
  (38, 'ART-0046', 'COLLE-C2', null, 'Colle carrelage C2', 'Sac de 25 kg', 'fourniture', 'sac', 16.50, 'e6000000-0000-4000-8000-000000000009'::uuid, 'ed000000-0000-4000-8000-000000000001'::uuid),
  (39, 'ART-0047', 'JOINT-5', null, 'Joint de carrelage', 'Sac de 5 kg', 'fourniture', 'kg', 2.40, 'e6000000-0000-4000-8000-000000000009'::uuid, 'ed000000-0000-4000-8000-000000000001'::uuid),
  -- Main-d'œuvre
  (40, 'MO-0003', null, null, 'Main-d’œuvre électricien', 'Heure', 'main_oeuvre', 'h', 52.00, 'e6000000-0000-4000-8000-000000000005'::uuid, null),
  (41, 'MO-0004', null, null, 'Main-d’œuvre plombier', 'Heure', 'main_oeuvre', 'h', 54.00, 'e6000000-0000-4000-8000-000000000005'::uuid, null),
  (42, 'MO-0005', null, null, 'Main-d’œuvre peintre', 'Heure', 'main_oeuvre', 'h', 40.00, 'e6000000-0000-4000-8000-000000000005'::uuid, null),
  (43, 'MO-0006', null, null, 'Main-d’œuvre carreleur', 'Heure', 'main_oeuvre', 'h', 46.00, 'e6000000-0000-4000-8000-000000000005'::uuid, null),
  -- Forfaits et prestations
  (44, 'PRS-0002', null, null, 'Protection des sols et mobilier', 'Forfait par pièce', 'forfait', 'forfait', 65.00, 'e6000000-0000-4000-8000-000000000010'::uuid, null),
  (45, 'PRS-0003', null, null, 'Nettoyage de fin de chantier', 'Forfait', 'forfait', 'forfait', 240.00, 'e6000000-0000-4000-8000-000000000010'::uuid, null),
  (46, 'PRS-0004', null, null, 'Location benne 8 m³', 'Semaine, transport compris', 'sous_traitance', 'jour', 45.00, 'e6000000-0000-4000-8000-000000000010'::uuid, null),
  (47, 'PRS-0005', null, null, 'Diagnostic électrique', 'Rapport écrit', 'forfait', 'forfait', 150.00, 'e6000000-0000-4000-8000-000000000010'::uuid, null),
  (48, 'PRS-0006', null, null, 'Sous-traitance carrelage', 'Pose au m², fournitures non comprises', 'sous_traitance', 'm²', 38.00, 'e6000000-0000-4000-8000-000000000009'::uuid, 'ed000000-0000-4000-8000-000000000006'::uuid)
) as t(n, ref, reffab, fab, designation, description, type, unite, prix, famille, fournisseur)
on conflict (id) do nothing;
-- Coûts d'achat des fournitures (coefficient 1,55 à 1,7) — jamais visibles du Conducteur.
insert into public.prestations_catalogue_couts (prestation_id, entreprise_id, prix_achat_ht, coefficient, mode_prix)
select p.id, p.entreprise_id, round(p.prix_unitaire_ht / 1.6, 2), 1.6, 'calcule'
from public.prestations_catalogue p
where p.entreprise_id = 'e0000000-0000-4000-8000-000000000001' and p.type = 'fourniture'
  and not exists (select 1 from public.prestations_catalogue_couts c where c.prestation_id = p.id)
on conflict do nothing;

-- Ouvrages (8 de plus : 10 au total) --------------------------------------------------------------------------
do $$
declare
  ent constant uuid := 'e0000000-0000-4000-8000-000000000001';
  r record;
  ouv uuid; ver uuid;
  comps jsonb;
  c record;
begin
  for r in select * from (values
    (3, 'OUV-0003', 'Plafond suspendu BA13 sur ossature', 'Plâtrerie', 'm²', 'Plafond en plaques de plâtre BA13 sur fourrures et suspentes, bandes et enduit compris.',
      jsonb_build_array(
        jsonb_build_object('cle','plaque','ordre',1,'nature','article','designation','Plaque de plâtre BA13 standard','unite','m²','coefficient',1,'pertePct',10,'arrondi',jsonb_build_object('mode','superieur','pas',3),'quantiteMin',null,'source',jsonb_build_object('catalogue','prestation','id','e7000000-0000-4000-8000-000000000001'),'referenceInterne','ART-0001','prixVenteHt',9.80),
        jsonb_build_object('cle','fourrure','ordre',2,'nature','article','designation','Fourrure plafond','unite','ml','coefficient',2.2,'pertePct',0,'arrondi',jsonb_build_object('mode','superieur','pas',3),'quantiteMin',null,'source',jsonb_build_object('catalogue','prestation','id','e7000000-0000-4000-8000-000000000022'),'referenceInterne','ART-0018','prixVenteHt',1.90),
        jsonb_build_object('cle','suspente','ordre',3,'nature','article','designation','Suspente plafond','unite','pièce','coefficient',1.5,'pertePct',0,'arrondi',jsonb_build_object('mode','superieur','pas',1),'quantiteMin',null,'source',jsonb_build_object('catalogue','prestation','id','e7000000-0000-4000-8000-000000000021'),'referenceInterne','ART-0017','prixVenteHt',0.95),
        jsonb_build_object('cle','pose','ordre',4,'nature','main_oeuvre','designation','Main-d’œuvre plaquiste','unite','h','coefficient',0.7,'pertePct',0,'arrondi',jsonb_build_object('mode','proche','pas',0.25),'quantiteMin',1,'source',jsonb_build_object('catalogue','prestation','id','e7000000-0000-4000-8000-000000000009'),'referenceInterne','MO-0001','prixVenteHt',42))),
    (4, 'OUV-0004', 'Cloison coupe-feu 1 h', 'Plâtrerie', 'm²', 'Cloison coupe-feu EI 60 : ossature 70, laine minérale, deux plaques coupe-feu par face.',
      jsonb_build_array(
        jsonb_build_object('cle','plaque','ordre',1,'nature','article','designation','Plaque de plâtre BA13 coupe-feu','unite','m²','coefficient',4,'pertePct',10,'arrondi',jsonb_build_object('mode','superieur','pas',3),'quantiteMin',null,'source',jsonb_build_object('catalogue','prestation','id','e7000000-0000-4000-8000-000000000013'),'referenceInterne','ART-0009','prixVenteHt',14.90),
        jsonb_build_object('cle','rail','ordre',2,'nature','article','designation','Rail métallique 70 mm','unite','ml','coefficient',0.8,'pertePct',0,'arrondi',jsonb_build_object('mode','superieur','pas',3),'quantiteMin',null,'source',jsonb_build_object('catalogue','prestation','id','e7000000-0000-4000-8000-000000000015'),'referenceInterne','ART-0011','prixVenteHt',3.60),
        jsonb_build_object('cle','montant','ordre',3,'nature','article','designation','Montant métallique 70 mm','unite','ml','coefficient',1.7,'pertePct',0,'arrondi',jsonb_build_object('mode','superieur','pas',2.5),'quantiteMin',null,'source',jsonb_build_object('catalogue','prestation','id','e7000000-0000-4000-8000-000000000016'),'referenceInterne','ART-0012','prixVenteHt',4.20),
        jsonb_build_object('cle','laine','ordre',4,'nature','article','designation','Laine de verre 100 mm','unite','m²','coefficient',1,'pertePct',5,'arrondi',jsonb_build_object('mode','aucun'),'quantiteMin',null,'source',jsonb_build_object('catalogue','prestation','id','e7000000-0000-4000-8000-000000000019'),'referenceInterne','ART-0015','prixVenteHt',8.90),
        jsonb_build_object('cle','pose','ordre',5,'nature','main_oeuvre','designation','Main-d’œuvre plaquiste','unite','h','coefficient',1.1,'pertePct',0,'arrondi',jsonb_build_object('mode','proche','pas',0.25),'quantiteMin',1,'source',jsonb_build_object('catalogue','prestation','id','e7000000-0000-4000-8000-000000000009'),'referenceInterne','MO-0001','prixVenteHt',42))),
    (5, 'OUV-0005', 'Bloc-porte isoplane 83 posé', 'Menuiserie', 'u', 'Fourniture et pose d’un bloc-porte isoplane 83 cm, poignée inox, plinthes raccordées.',
      jsonb_build_array(
        jsonb_build_object('cle','porte','ordre',1,'nature','article','designation','Porte isoplane 83 cm','unite','u','coefficient',1,'pertePct',0,'arrondi',jsonb_build_object('mode','aucun'),'quantiteMin',null,'source',jsonb_build_object('catalogue','prestation','id','e7000000-0000-4000-8000-000000000008'),'referenceInterne','ART-0008','prixVenteHt',96),
        jsonb_build_object('cle','poignee','ordre',2,'nature','article','designation','Poignée de porte inox','unite','paire','coefficient',1,'pertePct',0,'arrondi',jsonb_build_object('mode','aucun'),'quantiteMin',null,'source',jsonb_build_object('catalogue','prestation','id','e7000000-0000-4000-8000-000000000027'),'referenceInterne','ART-0023','prixVenteHt',28),
        jsonb_build_object('cle','pose','ordre',3,'nature','main_oeuvre','designation','Main-d’œuvre menuisier','unite','h','coefficient',2,'pertePct',0,'arrondi',jsonb_build_object('mode','proche','pas',0.25),'quantiteMin',1,'source',jsonb_build_object('catalogue','prestation','id','e7000000-0000-4000-8000-000000000010'),'referenceInterne','MO-0002','prixVenteHt',48))),
    (6, 'OUV-0006', 'Point lumineux + interrupteur', 'Électricité', 'u', 'Création d’un point lumineux commandé par interrupteur va-et-vient, câblage sous gaine.',
      jsonb_build_array(
        jsonb_build_object('cle','inter','ordre',1,'nature','article','designation','Interrupteur va-et-vient','unite','u','coefficient',1,'pertePct',0,'arrondi',jsonb_build_object('mode','aucun'),'quantiteMin',null,'source',jsonb_build_object('catalogue','prestation','id','e7000000-0000-4000-8000-000000000030'),'referenceInterne','ART-0026','prixVenteHt',8.60),
        jsonb_build_object('cle','cable','ordre',2,'nature','article','designation','Câble U-1000 R2V 3G1,5','unite','m','coefficient',12,'pertePct',5,'arrondi',jsonb_build_object('mode','superieur','pas',1),'quantiteMin',null,'source',jsonb_build_object('catalogue','prestation','id','e7000000-0000-4000-8000-000000000032'),'referenceInterne','ART-0028','prixVenteHt',0.95),
        jsonb_build_object('cle','gaine','ordre',3,'nature','article','designation','Gaine ICTA 20 mm','unite','m','coefficient',12,'pertePct',5,'arrondi',jsonb_build_object('mode','superieur','pas',1),'quantiteMin',null,'source',jsonb_build_object('catalogue','prestation','id','e7000000-0000-4000-8000-000000000036'),'referenceInterne','ART-0032','prixVenteHt',0.55),
        jsonb_build_object('cle','pose','ordre',4,'nature','main_oeuvre','designation','Main-d’œuvre électricien','unite','h','coefficient',1.5,'pertePct',0,'arrondi',jsonb_build_object('mode','proche','pas',0.25),'quantiteMin',1,'source',jsonb_build_object('catalogue','prestation','id','e7000000-0000-4000-8000-000000000052'),'referenceInterne','MO-0003','prixVenteHt',52))),
    (7, 'OUV-0007', 'Prise 2P+T supplémentaire', 'Électricité', 'u', 'Création d’une prise 2P+T encastrée depuis le tableau, câblage 3G2,5 sous gaine.',
      jsonb_build_array(
        jsonb_build_object('cle','prise','ordre',1,'nature','article','designation','Prise 2P+T encastrée','unite','u','coefficient',1,'pertePct',0,'arrondi',jsonb_build_object('mode','aucun'),'quantiteMin',null,'source',jsonb_build_object('catalogue','prestation','id','e7000000-0000-4000-8000-000000000029'),'referenceInterne','ART-0025','prixVenteHt',9.40),
        jsonb_build_object('cle','cable','ordre',2,'nature','article','designation','Câble U-1000 R2V 3G2,5','unite','m','coefficient',15,'pertePct',5,'arrondi',jsonb_build_object('mode','superieur','pas',1),'quantiteMin',null,'source',jsonb_build_object('catalogue','prestation','id','e7000000-0000-4000-8000-000000000031'),'referenceInterne','ART-0027','prixVenteHt',1.45),
        jsonb_build_object('cle','pose','ordre',3,'nature','main_oeuvre','designation','Main-d’œuvre électricien','unite','h','coefficient',1.25,'pertePct',0,'arrondi',jsonb_build_object('mode','proche','pas',0.25),'quantiteMin',1,'source',jsonb_build_object('catalogue','prestation','id','e7000000-0000-4000-8000-000000000052'),'referenceInterne','MO-0003','prixVenteHt',52))),
    (8, 'OUV-0008', 'Douche à l’italienne 90 × 90', 'Plomberie', 'u', 'Receveur extra-plat 90 × 90, évacuation, alimentation PER, mitigeur ; faïence non comprise.',
      jsonb_build_array(
        jsonb_build_object('cle','receveur','ordre',1,'nature','article','designation','Receveur de douche 90 × 90','unite','u','coefficient',1,'pertePct',0,'arrondi',jsonb_build_object('mode','aucun'),'quantiteMin',null,'source',jsonb_build_object('catalogue','prestation','id','e7000000-0000-4000-8000-000000000041'),'referenceInterne','ART-0037','prixVenteHt',175),
        jsonb_build_object('cle','per','ordre',2,'nature','article','designation','Tube PER 16 mm','unite','m','coefficient',8,'pertePct',5,'arrondi',jsonb_build_object('mode','superieur','pas',1),'quantiteMin',null,'source',jsonb_build_object('catalogue','prestation','id','e7000000-0000-4000-8000-000000000037'),'referenceInterne','ART-0033','prixVenteHt',1.20),
        jsonb_build_object('cle','evac','ordre',3,'nature','article','designation','Tube PVC évacuation 40 mm','unite','m','coefficient',3,'pertePct',5,'arrondi',jsonb_build_object('mode','superieur','pas',1),'quantiteMin',null,'source',jsonb_build_object('catalogue','prestation','id','e7000000-0000-4000-8000-000000000042'),'referenceInterne','ART-0038','prixVenteHt',2.30),
        jsonb_build_object('cle','pose','ordre',4,'nature','main_oeuvre','designation','Main-d’œuvre plombier','unite','h','coefficient',6,'pertePct',0,'arrondi',jsonb_build_object('mode','proche','pas',0.5),'quantiteMin',1,'source',jsonb_build_object('catalogue','prestation','id','e7000000-0000-4000-8000-000000000053'),'referenceInterne','MO-0004','prixVenteHt',54))),
    (9, 'OUV-0009', 'Peinture murs et plafond (2 couches)', 'Peinture', 'm²', 'Préparation, impression et deux couches d’acrylique mate sur murs et plafond.',
      jsonb_build_array(
        jsonb_build_object('cle','impression','ordre',1,'nature','article','designation','Impression murale','unite','litre','coefficient',0.12,'pertePct',5,'arrondi',jsonb_build_object('mode','superieur','pas',1),'quantiteMin',null,'source',jsonb_build_object('catalogue','prestation','id','e7000000-0000-4000-8000-000000000045'),'referenceInterne','ART-0041','prixVenteHt',3.80),
        jsonb_build_object('cle','finition','ordre',2,'nature','article','designation','Peinture acrylique mate','unite','litre','coefficient',0.25,'pertePct',5,'arrondi',jsonb_build_object('mode','superieur','pas',1),'quantiteMin',null,'source',jsonb_build_object('catalogue','prestation','id','e7000000-0000-4000-8000-000000000043'),'referenceInterne','ART-0039','prixVenteHt',4.60),
        jsonb_build_object('cle','pose','ordre',3,'nature','main_oeuvre','designation','Main-d’œuvre peintre','unite','h','coefficient',0.35,'pertePct',0,'arrondi',jsonb_build_object('mode','proche','pas',0.25),'quantiteMin',1,'source',jsonb_build_object('catalogue','prestation','id','e7000000-0000-4000-8000-000000000054'),'referenceInterne','MO-0005','prixVenteHt',40))),
    (10, 'OUV-0010', 'Carrelage sol grès cérame 60 × 60', 'Carrelage', 'm²', 'Fourniture et pose collée de grès cérame 60 × 60 rectifié, joints compris.',
      jsonb_build_array(
        jsonb_build_object('cle','carreau','ordre',1,'nature','article','designation','Grès cérame 60 × 60','unite','m²','coefficient',1,'pertePct',8,'arrondi',jsonb_build_object('mode','superieur','pas',1.08),'quantiteMin',null,'source',jsonb_build_object('catalogue','prestation','id','e7000000-0000-4000-8000-000000000048'),'referenceInterne','ART-0044','prixVenteHt',24),
        jsonb_build_object('cle','colle','ordre',2,'nature','article','designation','Colle carrelage C2','unite','sac','coefficient',0.2,'pertePct',0,'arrondi',jsonb_build_object('mode','superieur','pas',1),'quantiteMin',null,'source',jsonb_build_object('catalogue','prestation','id','e7000000-0000-4000-8000-000000000050'),'referenceInterne','ART-0046','prixVenteHt',16.50),
        jsonb_build_object('cle','joint','ordre',3,'nature','article','designation','Joint de carrelage','unite','kg','coefficient',0.5,'pertePct',0,'arrondi',jsonb_build_object('mode','superieur','pas',1),'quantiteMin',null,'source',jsonb_build_object('catalogue','prestation','id','e7000000-0000-4000-8000-000000000051'),'referenceInterne','ART-0047','prixVenteHt',2.40),
        jsonb_build_object('cle','pose','ordre',4,'nature','main_oeuvre','designation','Main-d’œuvre carreleur','unite','h','coefficient',0.9,'pertePct',0,'arrondi',jsonb_build_object('mode','proche','pas',0.25),'quantiteMin',1,'source',jsonb_build_object('catalogue','prestation','id','e7000000-0000-4000-8000-000000000055'),'referenceInterne','MO-0006','prixVenteHt',46)))
  ) as t(n, ref, nom, categorie, unite, description_client, composants) loop
    ouv := ('eb000000-0000-4000-8000-0000000000' || lpad(r.n::text, 2, '0'))::uuid;
    ver := ('ec000000-0000-4000-8000-0000000000' || lpad(r.n::text, 2, '0'))::uuid;
    -- Clés communes à tous les composants (mêmes que les ouvrages du seed de base).
    select jsonb_agg(x.v || jsonb_build_object('base', jsonb_build_object('type', 'principale'), 'quantiteFixe', null, 'saisieRequise', false,
                                               'condition', jsonb_build_object('type', 'toujours'), 'referenceFabricant', null, 'fabricant', null,
                                               'fournisseur', null, 'descriptionClient', null, 'tauxTva', 20, 'visibleClient', (x.v ->> 'nature') = 'article')
                     order by (x.v ->> 'ordre')::int)
      into comps from jsonb_array_elements(r.composants) as x(v);
    insert into public.ouvrages (id, entreprise_id, reference_interne, nom, categorie, unite_principale, statut, version_courante)
    values (ouv, ent, r.ref, r.nom, r.categorie, r.unite, 'actif', 1) on conflict (id) do nothing;
    insert into public.ouvrages_versions (id, ouvrage_id, entreprise_id, version, reference_interne, nom, description_interne, description_client, categorie, unite_principale, quantite_principale, composants)
    values (ver, ouv, ent, 1, r.ref, r.nom, r.description_client, r.description_client, r.categorie, r.unite, 1, comps) on conflict (id) do nothing;
    -- Coûts d'achat des composants : prix d'achat du catalogue.
    for c in select (v ->> 'cle') as cle, (v -> 'source' ->> 'id')::uuid as prestation from jsonb_array_elements(comps) as v loop
      insert into public.ouvrages_composants_couts (version_id, cle_composant, entreprise_id, prix_achat_ht)
      select ver, c.cle, ent, pc.prix_achat_ht from public.prestations_catalogue_couts pc where pc.prestation_id = c.prestation
      on conflict do nothing;
    end loop;
  end loop;
end $$;

-- Salariés (4 de plus : 12 au total) --------------------------------------------------------------------------
insert into public.employes (id, entreprise_id, utilisateur_id, prenom, nom, numero_inscription, identifiant_interne, poste, type_contrat, statut, poste_id) values
  ('e3000000-0000-4000-8000-000000000009', 'e0000000-0000-4000-8000-000000000001', null, 'Gilles', 'Plombier', 'REC-0009', 'R0009', 'Plombier', 'cdi', 'actif', 'e2000000-0000-4000-8000-000000000003'),
  ('e3000000-0000-4000-8000-000000000010', 'e0000000-0000-4000-8000-000000000001', null, 'Hugo', 'Carreleur', 'REC-0010', 'R0010', 'Carreleur', 'cdi', 'actif', 'e2000000-0000-4000-8000-000000000003'),
  ('e3000000-0000-4000-8000-000000000011', 'e0000000-0000-4000-8000-000000000001', null, 'Inès', 'Apprentie', 'REC-0011', 'R0011', 'Apprentie plaquiste', 'apprenti', 'actif', 'e2000000-0000-4000-8000-000000000003'),
  ('e3000000-0000-4000-8000-000000000012', 'e0000000-0000-4000-8000-000000000001', null, 'Jules', 'Manœuvre', 'REC-0012', 'R0012', 'Manœuvre', 'cdd', 'actif', 'e2000000-0000-4000-8000-000000000003')
on conflict (id) do nothing;
insert into public.equipes (id, entreprise_id, nom, couleur) values
  ('e8000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'Équipe second œuvre', '#7c3aed')
on conflict (id) do nothing;
insert into public.equipes_membres (equipe_id, employe_id, entreprise_id) values
  ('e8000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-000000000001'),
  ('e8000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000009', 'e0000000-0000-4000-8000-000000000001'),
  ('e8000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000010', 'e0000000-0000-4000-8000-000000000001')
on conflict do nothing;

-- Devis dans les quatre états, avec lignes (titres, articles du catalogue, sous-totaux) ------------------------
do $$
declare
  ent constant uuid := 'e0000000-0000-4000-8000-000000000001';
  d record; l record;
  dev uuid; ord int;
begin
  for d in select * from (values
    (1, 'DEMO-2026-001', 'e4000000-0000-4000-8000-000000000005'::uuid, 'e5000000-0000-4000-8000-000000000005'::uuid, 'accepte', 35, 'Rénovation appartement — cloisons et peinture', 'Peinture', 'e6000000-0000-4000-8000-000000000008'::uuid),
    (2, 'DEMO-2026-002', 'e4000000-0000-4000-8000-000000000006'::uuid, 'e5000000-0000-4000-8000-000000000006'::uuid, 'accepte', 70, 'Réhabilitation Bateliers — lot cloisons', 'Plâtrerie', 'e6000000-0000-4000-8000-000000000001'::uuid),
    (3, 'DEMO-2026-003', 'e4000000-0000-4000-8000-000000000007'::uuid, 'e5000000-0000-4000-8000-000000000007'::uuid, 'envoye', 6, 'École élémentaire — cloisons, peinture', 'Plâtrerie', 'e6000000-0000-4000-8000-000000000001'::uuid),
    (4, 'DEMO-2026-004', 'e4000000-0000-4000-8000-000000000010'::uuid, 'e5000000-0000-4000-8000-000000000010'::uuid, 'envoye', 3, 'Cloison coupe-feu fournil', 'Plâtrerie', 'e6000000-0000-4000-8000-000000000001'::uuid),
    (5, 'DEMO-2026-005', 'e4000000-0000-4000-8000-000000000012'::uuid, null, 'refuse', 40, 'Aménagement combles Schmitt', 'Menuiserie', 'e6000000-0000-4000-8000-000000000004'::uuid),
    (6, 'DEMO-2026-006', 'e4000000-0000-4000-8000-000000000014'::uuid, 'e5000000-0000-4000-8000-000000000011'::uuid, 'brouillon', 1, 'Hôtel du Parc — 12 chambres, peinture et électricité', 'Électricité', 'e6000000-0000-4000-8000-000000000006'::uuid),
    (7, 'DEMO-2026-007', 'e4000000-0000-4000-8000-000000000016'::uuid, 'e5000000-0000-4000-8000-000000000012'::uuid, 'brouillon', 0, 'Bureaux Garage Muller — cloisons et électricité', 'Électricité', 'e6000000-0000-4000-8000-000000000006'::uuid),
    (8, 'DEMO-2026-008', 'e4000000-0000-4000-8000-000000000009'::uuid, 'e5000000-0000-4000-8000-000000000009'::uuid, 'accepte', 55, 'Salle de bains Meyer — douche et carrelage', 'Plomberie', 'e6000000-0000-4000-8000-000000000007'::uuid),
    (9, 'DEMO-2026-009', 'e4000000-0000-4000-8000-000000000013'::uuid, null, 'brouillon', 2, 'Cabinet Weber — cloisons vitrées', 'Menuiserie', 'e6000000-0000-4000-8000-000000000004'::uuid)
  ) as t(n, ref, client, chantier, statut, age_jours, objet, famille_nom, famille) loop
    dev := ('ee000000-0000-4000-8000-0000000000' || lpad(d.n::text, 2, '0'))::uuid;
    if exists (select 1 from public.devis where id = dev) then continue; end if;
    insert into public.devis (id, entreprise_id, client_id, chantier_id, statut, revision, reference_interne, date_emission, date_validite, remise_globale, moteur_presentation, conditions, notes_client)
    values (dev, ent, d.client, d.chantier, 'brouillon', 1, d.ref, current_date - d.age_jours, current_date - d.age_jours + 30, 0, 2,
            'Devis valable 30 jours. Acompte de 30 % à la commande, solde à réception de facture.', d.objet);
    ord := 0;
    -- Titre de section, puis 5 articles de la famille, puis un sous-total.
    ord := ord + 1000;
    insert into public.lignes_devis (devis_id, designation, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre, cle_ligne, origine_ligne, type_ligne)
    values (dev, d.famille_nom, 'fourniture', 0, 'u', 0, 0, 20, ord, gen_random_uuid()::text, 'saisie', 'titre');
    for l in select p.id, p.designation, p.description, p.type, p.unite, p.prix_unitaire_ht, p.reference_interne, p.reference_fabricant
             from public.prestations_catalogue p where p.entreprise_id = ent and (p.famille_id = d.famille or p.famille_id in (select id from public.catalogue_familles where parent_id = d.famille))
             order by p.reference_interne limit 5 loop
      ord := ord + 1000;
      insert into public.lignes_devis (devis_id, designation, description, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre, cle_ligne, origine_ligne, source_catalogue, source_id, reference_interne_instantane, reference_fabricant_instantane, type_ligne)
      values (dev, l.designation, l.description, l.type, 2 + (ord / 1000) * 3, l.unite, l.prix_unitaire_ht, case when ord = 3000 then 5 else 0 end, 20, ord, gen_random_uuid()::text, 'catalogue', 'prestation', l.id, l.reference_interne, l.reference_fabricant, 'article');
    end loop;
    ord := ord + 1000;
    insert into public.lignes_devis (devis_id, designation, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre, cle_ligne, origine_ligne, type_ligne)
    values (dev, 'Main-d’œuvre', 'main_oeuvre', 0, 'u', 0, 0, 20, ord, gen_random_uuid()::text, 'saisie', 'titre');
    ord := ord + 1000;
    insert into public.lignes_devis (devis_id, designation, description, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre, cle_ligne, origine_ligne, type_ligne)
    values (dev, 'Main-d’œuvre de pose', 'Pose et finitions, protection des existants', 'main_oeuvre', 16, 'h', 45, 0, 20, ord, gen_random_uuid()::text, 'saisie', 'libre');
    ord := ord + 1000;
    insert into public.lignes_devis (devis_id, designation, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre, cle_ligne, origine_ligne, type_ligne)
    values (dev, 'Sous-total', 'fourniture', 0, 'u', 0, 0, 20, ord, gen_random_uuid()::text, 'saisie', 'sous_total');
    -- Statut final (numéro attribué par le déclencheur à la sortie du brouillon ; envoyé avant accepté / refusé).
    if d.statut <> 'brouillon' then
      update public.devis set statut = 'envoye' where id = dev;
      if d.statut in ('accepte', 'refuse') then update public.devis set statut = d.statut where id = dev; end if;
    end if;
  end loop;
end $$;

-- Factures issues des devis acceptés (brouillon, envoyée, payée) -------------------------------------------------
do $$
declare
  ent constant uuid := 'e0000000-0000-4000-8000-000000000001';
  f record; l record;
  fac uuid;
begin
  for f in select * from (values
    (1, 'ee000000-0000-4000-8000-000000000001'::uuid, 'brouillon', 12, 0),
    (2, 'ee000000-0000-4000-8000-000000000002'::uuid, 'envoyee', 30, 0),
    (3, 'ee000000-0000-4000-8000-000000000008'::uuid, 'payee', 45, 100)
  ) as t(n, devis, statut, age_jours, paye_pct) loop
    fac := ('ef000000-0000-4000-8000-0000000000' || lpad(f.n::text, 2, '0'))::uuid;
    if exists (select 1 from public.factures where id = fac) then continue; end if;
    insert into public.factures (id, entreprise_id, client_id, chantier_id, devis_origine_id, type, statut, date_emission, date_echeance, notes_client)
    select fac, ent, d.client_id, d.chantier_id, d.id, 'simple', 'brouillon', current_date - f.age_jours, current_date - f.age_jours + 30, d.notes_client
    from public.devis d where d.id = f.devis;
    for l in select * from public.lignes_devis where devis_id = f.devis order by ordre loop
      insert into public.lignes_factures (facture_id, designation, description, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre, cle_ligne, origine_ligne, source_catalogue, source_id, reference_interne_instantane, reference_fabricant_instantane, type_ligne)
      values (fac, l.designation, l.description, l.type, l.quantite, l.unite, l.prix_unitaire_ht, l.remise_ligne, l.taux_tva, l.ordre, l.cle_ligne, l.origine_ligne, l.source_catalogue, l.source_id, l.reference_interne_instantane, l.reference_fabricant_instantane, l.type_ligne);
    end loop;
    if f.statut <> 'brouillon' then
      update public.factures set statut = 'envoyee' where id = fac;
      if f.statut = 'payee' then
        update public.factures set montant_paye = montant_ttc, statut = 'payee' where id = fac;
      end if;
    end if;
  end loop;
end $$;

-- Planning : 8 évènements de plus sur la semaine courante (salariés récents, équipe second œuvre, absence) --------
do $$
declare
  lundi date := date_trunc('week', current_date)::date;
  e uuid := 'e0000000-0000-4000-8000-000000000001';
  ev uuid; i int;
  paris constant text := 'Europe/Paris';
begin
  for i in 11..18 loop
    ev := ('ea000000-0000-4000-8000-0000000000' || lpad(i::text, 2, '0'))::uuid;
    insert into public.planning_evenements (id, entreprise_id, chantier_id, client_id, titre, type, statut, debut, fin, adresse, couleur)
    select ev, e, c.id, c.client_id, t.titre, t.type, t.statut,
           ((lundi + t.jour)::timestamp + make_interval(hours => t.h1)) at time zone paris,
           ((lundi + t.jour)::timestamp + make_interval(hours => t.h2)) at time zone paris,
           c.adresse || ', ' || c.ville, t.couleur
    from (values
      (11, 'Plomberie salle de bains Lefebvre', 'chantier', 'planifie', 'CH-0005', 0, 8, 17, '#0891b2'),
      (12, 'Carrelage chambres Hôtel du Parc', 'chantier', 'confirme', 'CH-0011', 1, 8, 17, '#b45309'),
      (13, 'Cloisons R+2 Bateliers', 'chantier', 'en_cours', 'CH-0006', 2, 8, 17, '#2563eb'),
      (14, 'Tableau électrique bureaux Muller', 'intervention', 'planifie', 'CH-0012', 3, 9, 12, '#7c3aed'),
      (15, 'Réception de chantier Meyer', 'rendez_vous', 'planifie', 'CH-0009', 3, 16, 17, '#9333ea'),
      (16, 'Livraison plaques Terrasses', 'livraison', 'planifie', 'CH-0008', 4, 7, 8, '#d97706'),
      (17, 'Plâtrerie Terrasses — bâtiment A', 'chantier', 'planifie', 'CH-0008', 4, 8, 17, '#2563eb'),
      (18, 'Congé', 'absence', 'confirme', 'CH-0005', 1, 8, 17, '#9ca3af')
    ) as t(n, titre, type, statut, ref, jour, h1, h2, couleur)
    join public.chantiers c on c.entreprise_id = e and c.reference_interne = t.ref
    where t.n = i
    on conflict (id) do nothing;
  end loop;
  insert into public.planning_affectations (evenement_id, entreprise_id, employe_id, equipe_id, ressource_id) values
    ('ea000000-0000-4000-8000-000000000011', e, 'e3000000-0000-4000-8000-000000000009', null, null),
    ('ea000000-0000-4000-8000-000000000012', e, 'e3000000-0000-4000-8000-000000000010', null, null),
    ('ea000000-0000-4000-8000-000000000013', e, null, 'e8000000-0000-4000-8000-000000000001', null),
    ('ea000000-0000-4000-8000-000000000013', e, 'e3000000-0000-4000-8000-000000000011', null, null),
    ('ea000000-0000-4000-8000-000000000014', e, 'e3000000-0000-4000-8000-000000000006', null, null),
    ('ea000000-0000-4000-8000-000000000015', e, 'e3000000-0000-4000-8000-000000000002', null, null),
    ('ea000000-0000-4000-8000-000000000016', e, 'e3000000-0000-4000-8000-000000000012', null, null),
    ('ea000000-0000-4000-8000-000000000016', e, null, null, 'e9000000-0000-4000-8000-000000000002'),
    ('ea000000-0000-4000-8000-000000000017', e, null, 'e8000000-0000-4000-8000-000000000002', null),
    ('ea000000-0000-4000-8000-000000000017', e, 'e3000000-0000-4000-8000-000000000012', null, null),
    ('ea000000-0000-4000-8000-000000000018', e, 'e3000000-0000-4000-8000-000000000007', null, null)
  on conflict do nothing;
end $$;
commit;
