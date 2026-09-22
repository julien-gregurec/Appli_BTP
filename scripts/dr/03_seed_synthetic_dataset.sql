-- Jeu de données synthétique multi-tenant pour le drill DR (mission
-- DR EXACT-TIP V2 §3). AUCUNE donnée réelle : tout est fictif, généré pour
-- ce drill, et vit uniquement sur la base locale jetable elsatia_dr_drill.
--
-- Couvre : 2 tenants (entreprises), utilisateurs, salariés (employés),
-- clients, chantiers, devis, factures, paiements, planning, pointage,
-- stock (articles/mouvements/fournisseurs/commandes), réserves, et
-- métadonnées de fichiers (documents/photos/signatures) y compris leur
-- pendant storage.objects.
--
-- Conçu pour être joué UNE FOIS sur une base tout juste migrée. Refuse de
-- s'exécuter si les tenants DR existent déjà (garde-fou anti double-seed :
-- la plupart des inserts ci-dessous n'ont pas de ON CONFLICT, un deuxième
-- passage échouerait au milieu d'une transaction dans un état incohérent).
begin;

do $seed$
declare
  -- Deux tenants
  ent_a uuid; ent_b uuid;
  -- variables de travail réutilisées pour chaque tenant dans la boucle
  ent uuid;
  suffixe text;
  poste_chef uuid; poste_ouvrier uuid;
  user1 uuid; user2 uuid;
  emp1 uuid; emp2 uuid; emp3 uuid;
  cli1 uuid; cli2 uuid; cli3 uuid;
  cha1 uuid; cha2 uuid; cha3 uuid;
  dev1 uuid; dev2 uuid; dev3 uuid;
  fac1 uuid; fac2 uuid;
  fourn1 uuid; fourn2 uuid;
  art1 uuid; art2 uuid; art3 uuid; art4 uuid;
  cmd1 uuid; cmd2 uuid;
  res_cha uuid; res_int uuid;
  i int;
begin
  if exists (select 1 from public.entreprises where reference_interne like 'DR-TENANT-%') then
    raise exception 'Jeu de données DR déjà présent (entreprises DR-TENANT-%%). Repartez d''une base --fresh.';
  end if;

  for i in 1..2 loop
    suffixe := case i when 1 then 'A' else 'B' end;

    insert into public.entreprises (reference_interne, nom, raison_sociale, siret, adresse, code_postal, ville)
    values ('DR-TENANT-' || suffixe, 'ELSATIA DR Tenant ' || suffixe, 'SARL DR TENANT ' || suffixe, '123456789000' || i, '1 rue du Drill', '67000', 'Strasbourg')
    on conflict (reference_interne) do update set nom = excluded.nom
    returning id into ent;

    if i = 1 then ent_a := ent; else ent_b := ent; end if;

    -- Postes
    insert into public.postes (entreprise_id, nom, tarif_compte_mensuel)
      values (ent, 'Chef d''équipe DR', 15) on conflict (entreprise_id, nom) do update set nom = excluded.nom
      returning id into poste_chef;
    insert into public.postes (entreprise_id, nom, tarif_compte_mensuel)
      values (ent, 'Ouvrier DR', 10) on conflict (entreprise_id, nom) do update set nom = excluded.nom
      returning id into poste_ouvrier;

    -- Utilisateurs (auth.users stub + profil applicatif)
    -- Note: l'insertion dans auth.users déclenche on_auth_user_created
    -- (supabase/migrations/20260710000002), qui crée déjà la ligne
    -- public.utilisateurs correspondante depuis raw_user_meta_data. On la
    -- complète donc par UPDATE plutôt que par un second INSERT.
    insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at)
      values (gen_random_uuid(), 'admin.dr.' || lower(suffixe) || '@dr-drill.invalid', jsonb_build_object('nom','Admin','prenom','Tenant'||suffixe), now())
      returning id into user1;
    update public.utilisateurs set entreprise_active_id = ent where id = user1;
    insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut)
      values (user1, ent, poste_chef, 'actif');

    insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at)
      values (gen_random_uuid(), 'ouvrier.dr.' || lower(suffixe) || '@dr-drill.invalid', jsonb_build_object('nom','Ouvrier','prenom','Un'), now())
      returning id into user2;
    update public.utilisateurs set entreprise_active_id = ent where id = user2;
    insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut)
      values (user2, ent, poste_ouvrier, 'actif');

    -- Salariés (employés)
    insert into public.employes (entreprise_id, prenom, nom, email, poste_id, poste, type_contrat, date_entree, taux_horaire, numero_inscription, utilisateur_id)
      values (ent, 'Marc', 'Muller', 'marc.muller.dr'||lower(suffixe)||'@dr-drill.invalid', poste_chef, 'Chef d''équipe', 'cdi', '2024-01-15', 22.5, 'DR-'||suffixe||'-EMP-001', user2)
      returning id into emp1;
    insert into public.employes (entreprise_id, prenom, nom, email, poste_id, poste, type_contrat, date_entree, taux_horaire, numero_inscription)
      values (ent, 'Julie', 'Klein', 'julie.klein.dr'||lower(suffixe)||'@dr-drill.invalid', poste_ouvrier, 'Ouvrier', 'cdi', '2024-03-01', 16.0, 'DR-'||suffixe||'-EMP-002')
      returning id into emp2;
    insert into public.employes (entreprise_id, prenom, nom, email, poste_id, poste, type_contrat, date_entree, taux_horaire, numero_inscription)
      values (ent, 'Ahmed', 'Bensaid', 'ahmed.bensaid.dr'||lower(suffixe)||'@dr-drill.invalid', poste_ouvrier, 'Ouvrier', 'interim', '2025-06-01', 15.0, 'DR-'||suffixe||'-EMP-003')
      returning id into emp3;

    -- Clients
    insert into public.clients (entreprise_id, reference_interne, type, nom, prenom, adresse_facturation, code_postal, ville, email, telephone, statut)
      values (ent, 'DR-'||suffixe||'-CLI-001', 'particulier', 'Durand', 'Paul', '5 rue des Lilas', '67100', 'Strasbourg', 'paul.durand.dr'||lower(suffixe)||'@dr-drill.invalid', '0600000001', 'actif')
      returning id into cli1;
    insert into public.clients (entreprise_id, reference_interne, type, societe, raison_sociale, adresse_facturation, code_postal, ville, email, telephone, statut)
      values (ent, 'DR-'||suffixe||'-CLI-002', 'professionnel', 'SCI Les Tilleuls', 'SCI Les Tilleuls', '10 avenue de la Gare', '67200', 'Strasbourg', 'contact.tilleuls.dr'||lower(suffixe)||'@dr-drill.invalid', '0600000002', 'actif')
      returning id into cli2;
    insert into public.clients (entreprise_id, reference_interne, type, nom, prenom, adresse_facturation, code_postal, ville, email, telephone, statut)
      values (ent, 'DR-'||suffixe||'-CLI-003', 'particulier', 'Leroy', 'Sophie', '2 impasse du Chantier', '67300', 'Schiltigheim', 'sophie.leroy.dr'||lower(suffixe)||'@dr-drill.invalid', '0600000003', 'prospect')
      returning id into cli3;

    -- Chantiers
    insert into public.chantiers (entreprise_id, reference_interne, client_id, nom, adresse, code_postal, ville, statut, date_debut_prevue, date_fin_prevue, budget_previsionnel, responsable_id)
      values (ent, 'DR-'||suffixe||'-CHA-001', cli1, 'Rénovation toiture Durand', '5 rue des Lilas', '67100', 'Strasbourg', 'en_cours', '2026-08-01', '2026-10-15', 18000, emp1)
      returning id into cha1;
    insert into public.chantiers (entreprise_id, reference_interne, client_id, nom, adresse, code_postal, ville, statut, date_debut_prevue, date_fin_prevue, budget_previsionnel, responsable_id)
      values (ent, 'DR-'||suffixe||'-CHA-002', cli2, 'Extension bureaux Tilleuls', '10 avenue de la Gare', '67200', 'Strasbourg', 'accepte', '2026-11-01', '2027-02-28', 65000, emp1)
      returning id into cha2;
    insert into public.chantiers (entreprise_id, reference_interne, client_id, nom, adresse, code_postal, ville, statut, date_debut_prevue, budget_previsionnel, responsable_id)
      values (ent, 'DR-'||suffixe||'-CHA-003', cli3, 'Devis étude Leroy', '2 impasse du Chantier', '67300', 'Schiltigheim', 'prospect', '2026-12-01', 4200, emp1)
      returning id into cha3;

    -- Devis (+ lignes). Un trigger (verrouiller_devis_accepte) interdit de
    -- modifier les lignes d'un devis déjà 'accepte' : on crée donc en
    -- 'brouillon', on ajoute les lignes, puis on bascule le statut ensuite.
    insert into public.devis (entreprise_id, numero, client_id, chantier_id, statut, date_emission, date_validite, montant_ht, montant_tva, montant_ttc)
      values (ent, 'DR-'||suffixe||'-DEV-0001', cli1, cha1, 'brouillon', '2026-07-20', '2026-08-20', 15000, 3000, 18000)
      returning id into dev1;
    insert into public.lignes_devis (devis_id, entreprise_id, designation, type, quantite, unite, prix_unitaire_ht, taux_tva, ordre) values
      (dev1, ent, 'Dépose ancienne toiture', 'main_oeuvre', 1, 'forfait', 4000, 20, 1),
      (dev1, ent, 'Fourniture tuiles', 'fourniture', 500, 'u', 8, 20, 2),
      (dev1, ent, 'Pose et finitions', 'main_oeuvre', 40, 'h', 275, 20, 3);
    update public.devis set statut = 'accepte' where id = dev1;

    insert into public.devis (entreprise_id, numero, client_id, chantier_id, statut, date_emission, date_validite, montant_ht, montant_tva, montant_ttc)
      values (ent, 'DR-'||suffixe||'-DEV-0002', cli2, cha2, 'envoye', '2026-09-01', '2026-10-01', 54166.67, 10833.33, 65000)
      returning id into dev2;
    insert into public.lignes_devis (devis_id, entreprise_id, designation, type, quantite, unite, prix_unitaire_ht, taux_tva, ordre) values
      (dev2, ent, 'Gros oeuvre extension', 'sous_traitance', 1, 'forfait', 40000, 20, 1),
      (dev2, ent, 'Second oeuvre', 'main_oeuvre', 1, 'forfait', 14166.67, 20, 2);

    insert into public.devis (entreprise_id, numero, client_id, chantier_id, statut, date_emission, date_validite, montant_ht, montant_tva, montant_ttc)
      values (ent, 'DR-'||suffixe||'-DEV-0003', cli3, cha3, 'brouillon', '2026-09-18', '2026-10-18', 3500, 700, 4200)
      returning id into dev3;
    insert into public.lignes_devis (devis_id, entreprise_id, designation, type, quantite, unite, prix_unitaire_ht, taux_tva, ordre) values
      (dev3, ent, 'Étude de faisabilité', 'forfait', 1, 'forfait', 3500, 20, 1);

    -- Factures (+ lignes + paiements). Même principe que pour les devis :
    -- trg_lignes_factures_brouillon_only interdit de toucher aux lignes
    -- d'une facture déjà émise, donc on crée en 'brouillon' d'abord.
    insert into public.factures (entreprise_id, numero, client_id, chantier_id, devis_origine_id, type, statut, date_emission, date_echeance, montant_ht, montant_tva, montant_ttc, montant_paye)
      values (ent, 'DR-'||suffixe||'-FAC-0001', cli1, cha1, dev1, 'acompte', 'brouillon', '2026-08-05', '2026-09-05', 7500, 1500, 9000, 0)
      returning id into fac1;
    insert into public.lignes_factures (facture_id, entreprise_id, designation, type, quantite, unite, prix_unitaire_ht, taux_tva, ordre) values
      (fac1, ent, 'Acompte 50% - Rénovation toiture', 'forfait', 1, 'forfait', 7500, 20, 1);
    update public.factures set statut = 'payee', montant_paye = 9000 where id = fac1;
    insert into public.paiements (facture_id, montant, date, mode, reference)
      values (fac1, 9000, '2026-08-10', 'virement', 'VIR-DR-'||suffixe||'-0001');

    insert into public.factures (entreprise_id, numero, client_id, chantier_id, type, statut, date_emission, date_echeance, montant_ht, montant_tva, montant_ttc, montant_paye)
      values (ent, 'DR-'||suffixe||'-FAC-0002', cli2, cha2, 'simple', 'brouillon', '2026-09-10', '2026-10-10', 5000, 1000, 6000, 0)
      returning id into fac2;
    insert into public.lignes_factures (facture_id, entreprise_id, designation, type, quantite, unite, prix_unitaire_ht, taux_tva, ordre) values
      (fac2, ent, 'Étude et préparation chantier', 'forfait', 1, 'forfait', 5000, 20, 1);
    update public.factures set statut = 'envoyee' where id = fac2;

    -- Planning
    insert into public.planning_evenements (entreprise_id, chantier_id, titre, type, statut, debut, fin) values
      (ent, cha1, 'Pose toiture - semaine 1', 'intervention', 'confirme', '2026-08-04 08:00+02', '2026-08-04 17:00+02'),
      (ent, cha1, 'Réception chantier', 'controle', 'planifie', '2026-10-14 09:00+02', '2026-10-14 11:00+02'),
      (ent, cha2, 'RDV client cadrage', 'rdv_client', 'planifie', '2026-10-05 10:00+02', '2026-10-05 11:00+02'),
      (ent, cha3, 'Visite technique', 'intervention', 'planifie', '2026-09-25 14:00+02', '2026-09-25 16:00+02');

    -- Pointage
    insert into public.pointages (entreprise_id, employe_id, chantier_id, date, heures_normales, heures_supplementaires, tache) values
      (ent, emp1, cha1, '2026-08-04', 8, 1, 'Pose toiture'),
      (ent, emp2, cha1, '2026-08-04', 7, 0, 'Manutention'),
      (ent, emp1, cha1, '2026-08-05', 8, 0, 'Pose toiture'),
      (ent, emp3, cha2, '2026-09-02', 7, 0, 'Préparation terrain'),
      (ent, emp2, cha2, '2026-09-02', 7, 0, 'Préparation terrain');

    -- Fournisseurs, stock, mouvements, commandes
    insert into public.fournisseurs (entreprise_id, reference, nom, contact_nom, email, telephone, ville, type_tiers)
      values (ent, 'DR-'||suffixe||'-FRS-001', 'Matériaux Est SARL', 'Nadia Petit', 'contact.materiaux.dr'||lower(suffixe)||'@dr-drill.invalid', '0388000001', 'Strasbourg', 'fournisseur')
      returning id into fourn1;
    insert into public.fournisseurs (entreprise_id, reference, nom, contact_nom, email, telephone, ville, type_tiers)
      values (ent, 'DR-'||suffixe||'-FRS-002', 'Toitures Alsace', 'Karim Belkacem', 'contact.toitures.dr'||lower(suffixe)||'@dr-drill.invalid', '0388000002', 'Strasbourg', 'sous_traitant')
      returning id into fourn2;

    insert into public.articles_stock (entreprise_id, reference, designation, unite, quantite_stock, seuil_alerte, prix_achat_ht, prix_vente_ht) values
      (ent, 'DR-'||suffixe||'-ART-001', 'Tuile terre cuite', 'u', 1200, 200, 6.5, 8.0) returning id into art1;
    insert into public.articles_stock (entreprise_id, reference, designation, unite, quantite_stock, seuil_alerte, prix_achat_ht, prix_vente_ht) values
      (ent, 'DR-'||suffixe||'-ART-002', 'Chevron sapin 63x175', 'ml', 300, 50, 3.2, 4.5) returning id into art2;
    insert into public.articles_stock (entreprise_id, reference, designation, unite, quantite_stock, seuil_alerte, prix_achat_ht, prix_vente_ht) values
      (ent, 'DR-'||suffixe||'-ART-003', 'Isolant laine de bois 100mm', 'm2', 80, 20, 12.0, 16.0) returning id into art3;
    insert into public.articles_stock (entreprise_id, reference, designation, unite, quantite_stock, seuil_alerte, prix_achat_ht, prix_vente_ht) values
      (ent, 'DR-'||suffixe||'-ART-004', 'Vis charpente 8x200', 'boite', 40, 10, 22.0, 28.0) returning id into art4;

    insert into public.mouvements_stock (entreprise_id, article_id, chantier_id, type, quantite, date, motif, employe_id) values
      (ent, art1, cha1, 'sortie', 500, '2026-08-03', 'Pose toiture Durand', emp1),
      (ent, art2, cha1, 'sortie', 60, '2026-08-02', 'Charpente toiture Durand', emp1),
      (ent, art1, null, 'entree', 1000, '2026-07-28', 'Réassort fournisseur', null);

    insert into public.commandes_fournisseurs (entreprise_id, numero, fournisseur_id, chantier_id, statut, date_commande, date_livraison_prevue, montant_ht, montant_tva, montant_ttc, cree_par_utilisateur_id)
      values (ent, 'DR-'||suffixe||'-CMD-0001', fourn1, cha1, 'recue', '2026-07-25', '2026-07-30', 3900, 780, 4680, user1)
      returning id into cmd1;
    insert into public.lignes_commande (entreprise_id, commande_id, designation, quantite, unite, prix_unitaire_ht, taux_tva, quantite_recue, article_id) values
      (ent, cmd1, 'Tuile terre cuite', 1000, 'u', 6.5, 20, 1000, art1),
      (ent, cmd1, 'Chevron sapin 63x175', 300, 'ml', 3.2, 20, 300, art2);

    insert into public.commandes_fournisseurs (entreprise_id, numero, fournisseur_id, chantier_id, statut, date_commande, date_livraison_prevue, montant_ht, montant_tva, montant_ttc, cree_par_utilisateur_id)
      values (ent, 'DR-'||suffixe||'-CMD-0002', fourn2, cha2, 'envoyee', '2026-09-15', '2026-09-30', 8000, 1600, 9600, user1)
      returning id into cmd2;
    insert into public.lignes_commande (entreprise_id, commande_id, designation, quantite, unite, prix_unitaire_ht, taux_tva, article_id) values
      (ent, cmd2, 'Isolant laine de bois 100mm', 250, 'm2', 12.0, 20, art3);

    -- Réserves : module séparé avec ses propres chantiers/intervenants
    -- (public.reserves_chantiers / reserves_intervenants), reliés au vrai
    -- chantier GP via chantier_gp_id. public.reserves.chantier_id référence
    -- reserves_chantiers(id), pas chantiers(id) directement.
    insert into public.reserves_chantiers (entreprise_id, nom, reference, source, chantier_gp_id, created_by)
      values (ent, 'Rénovation toiture Durand', 'DR-'||suffixe||'-RES-CHA-001', 'gestion_pro', cha1, user1)
      returning id into res_cha;
    insert into public.reserves_intervenants (entreprise_id, chantier_id, nom, corps_etat, created_by)
      values (ent, res_cha, 'Marc Muller', 'Couverture', user1)
      returning id into res_int;

    insert into public.reserves (entreprise_id, chantier_id, numero, titre, description, statut, priorite, intervenant_id, cree_par, echeance) values
      (ent, res_cha, 1, 'Solin mal ajusté côté nord', 'Infiltration possible au niveau du solin', 'assignee', 'haute', res_int, user1, '2026-10-01'),
      (ent, res_cha, 2, 'Gouttière à fixer', 'Gouttière déboîtée côté rue', 'emise', 'normale', null, user1, '2026-10-10');

    insert into storage.buckets (id, name, public) values ('dr-drill-bucket', 'dr-drill-bucket', false) on conflict (id) do nothing;

    insert into storage.objects (bucket_id, name, owner, metadata) values
      ('chantier-documents', ent::text || '/' || cha1::text || '/plan-toiture.pdf', user1,
       jsonb_build_object('mimetype','application/pdf','size',245678))
      ;
    insert into public.documents_chantier (entreprise_id, chantier_id, nom, categorie, storage_path, mime_type, taille_octets, audience) values
      (ent, cha1, 'Plan toiture.pdf', 'plan', ent::text || '/' || cha1::text || '/plan-toiture.pdf', 'application/pdf', 245678, 'gestionnaires');

    insert into storage.objects (bucket_id, name, owner, metadata) values
      ('chantier-documents', ent::text || '/' || cha1::text || '/photo-avant.jpg', user1,
       jsonb_build_object('mimetype','image/jpeg','size',88210));
    insert into public.documents_chantier (entreprise_id, chantier_id, nom, categorie, storage_path, mime_type, taille_octets, audience) values
      (ent, cha1, 'Photo avant travaux.jpg', 'photo_avant', ent::text || '/' || cha1::text || '/photo-avant.jpg', 'image/jpeg', 88210, 'tous_affectes');

    insert into storage.objects (bucket_id, name, owner, metadata) values
      ('reserves-photos', ent::text || '/reserve-solin.jpg', user1, jsonb_build_object('mimetype','image/jpeg','size',54012));
    insert into public.reserves_photos (entreprise_id, reserve_id, storage_path, usage, mime_type, taille_octets, ajoutee_par, ajoutee_par_entreprise_id, nom_fichier)
      select ent, r.id, ent::text || '/reserve-solin.jpg', 'constat', 'image/jpeg', 54012, user1, ent, 'reserve-solin.jpg'
      from public.reserves r where r.entreprise_id = ent and r.numero = 1;

    insert into storage.objects (bucket_id, name, owner, metadata) values
      ('devis-medias', ent::text || '/' || dev1::text || '/devis-signe.pdf', user1, jsonb_build_object('mimetype','application/pdf','size',132456));
    insert into public.signatures_documents (entreprise_id, employe_id, type_document, document_id, signature_storage_path, signature_sha256, document_sha256, nom_signataire, created_by)
      values (ent, emp1, 'devis', dev1, ent::text || '/' || dev1::text || '/signature.png',
              encode(extensions.digest('signature-'||dev1::text, 'sha256'), 'hex'),
              encode(extensions.digest('document-'||dev1::text, 'sha256'), 'hex'),
              'Marc Muller', user1);

    -- Permissions du poste "Chef d'équipe" : toutes accordées, pour que les
    -- policies RLS RESTRICTIVE basées sur a_permission() (ex: lecture des
    -- clients/devis/factures) laissent réellement passer les requêtes lors
    -- des vérifications fonctionnelles post-restauration (mission §6). Le
    -- poste "Ouvrier" reste volontairement sans permission (comportement
    -- par défaut réaliste).
    insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
      select ent, poste_chef, pd.cle, true from public.permissions_disponibles pd
      on conflict (entreprise_id, poste_id, cle_permission) do update set autorise = true;

  end loop;
end;
$seed$;

commit;

select 'seed_dr_dataset_termine' as etat,
  (select count(*) from public.entreprises where reference_interne like 'DR-TENANT-%') as tenants,
  (select count(*) from public.utilisateurs u join public.utilisateurs_entreprises ue on ue.utilisateur_id=u.id
     join public.entreprises e on e.id=ue.entreprise_id where e.reference_interne like 'DR-TENANT-%') as utilisateurs,
  (select count(*) from public.employes em join public.entreprises e on e.id=em.entreprise_id where e.reference_interne like 'DR-TENANT-%') as employes,
  (select count(*) from public.clients c join public.entreprises e on e.id=c.entreprise_id where e.reference_interne like 'DR-TENANT-%') as clients,
  (select count(*) from public.chantiers c join public.entreprises e on e.id=c.entreprise_id where e.reference_interne like 'DR-TENANT-%') as chantiers,
  (select count(*) from public.devis d join public.entreprises e on e.id=d.entreprise_id where e.reference_interne like 'DR-TENANT-%') as devis,
  (select count(*) from public.factures f join public.entreprises e on e.id=f.entreprise_id where e.reference_interne like 'DR-TENANT-%') as factures,
  (select count(*) from public.reserves r join public.entreprises e on e.id=r.entreprise_id where e.reference_interne like 'DR-TENANT-%') as reserves;
