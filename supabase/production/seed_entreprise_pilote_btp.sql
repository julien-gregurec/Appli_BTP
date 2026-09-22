-- Entreprise PILOTE BTP synthétique — fixture de recette pour le premier pilote externe accompagné
-- de Gestion Pro (voir docs/qualification/ELSATIA_EXTERNAL_PILOT_ACCEPTANCE_PACK_V1.md).
--
-- Toutes les données ci-dessous sont FICTIVES : nom d'entreprise, SIRET, salariés, clients,
-- chantiers, montants. Aucune donnée réelle. Domaines e-mail en @example.test (RFC 2606,
-- ne délivre jamais réellement). Script idempotent (upsert par reference_interne / numéro),
-- réservé au projet Preview — voir supabase/production/README.md, exécution obligatoire via
-- `node scripts/executer-script-production.mjs seed_entreprise_pilote_btp.sql`.
--
-- Objectif : couvrir en une seule entreprise les 5 profils demandés pour la recette pilote
-- (gérant, administratif, chef de chantier, chef d'équipe, ouvriers) et les modules métier
-- (clients, chantiers, devis, factures, planning, pointages, dépenses, commandes,
-- fournisseurs, stock) avec un historique court et réaliste (~6 semaines), volontairement
-- plus modeste que les jeux de recette existants (creer_entreprise_demo_18_mois.sql,
-- seed_entreprise_test_5_ans.sql) car destiné à une démonstration/recette pilote, pas à un
-- test de volumétrie.
--
-- NON EXÉCUTÉ au moment de l'écriture (aucun Docker/CLI Supabase disponible dans
-- l'environnement de rédaction — voir le rapport). À exécuter et vérifier sur Preview avant
-- tout usage réel en recette pilote.

set statement_timeout='10min';

create temp table if not exists pilote_btp_resultat(entreprise_id uuid,entreprise text,resume jsonb);
truncate table pilote_btp_resultat;

do $pilote$
declare
  v_entreprise uuid;
  v_poste_gerant uuid;v_poste_admin uuid;v_poste_chef_chantier uuid;v_poste_chef_equipe uuid;v_poste_ouvrier uuid;
  v_employes uuid[]:=array[]::uuid[];
  v_clients uuid[]:=array[]::uuid[];
  v_chantiers uuid[]:=array[]::uuid[];
  v_chantiers_actifs uuid[];
  v_fournisseurs uuid[]:=array[]::uuid[];
  v_articles uuid[]:=array[]::uuid[];
  v_i integer;v_semaine integer;v_jour integer;v_date date;v_employe uuid;v_chantier uuid;v_client uuid;
  v_devis uuid;v_facture uuid;v_commande uuid;v_depense uuid;v_total numeric;v_affectation uuid;
  v_poste uuid;
  -- Mêmes 5 profils et permissions que le catalogue canonique
  -- (supabase/migrations/20260718000104_roles_predefinis.sql, table modeles_roles_predefinis) :
  -- reproduits ici en dur (et non via le RPC installer_roles_predefinis) car ce RPC exige un
  -- appelant authentifié avec le droit gerer_utilisateurs (peut_gerer_acces -> auth.uid()),
  -- absent d'une exécution SQL directe hors session applicative.
  v_roles text[][]:=array[
    array['Gérant','tous'],
    array['Administration','acces_clients,gerer_clients,acces_chantiers,acces_devis,gerer_devis,acces_factures,gerer_factures,acces_facturation_avancee,gerer_facturation_avancee,acces_achats,gerer_achats,acces_planning,acces_pointage,saisir_son_pointage,acces_employes,saisir_ses_notes_frais,gerer_notes_frais,demander_ses_conges,gerer_conges,utiliser_borne_stock,acces_stock,acces_flotte,acces_outillage,acces_exports,acces_crm,gerer_crm,acces_connecteurs,gerer_connecteurs,acces_messagerie,gerer_messagerie,acces_parametres,gerer_parametres,gerer_utilisateurs'],
    array['Chef de chantier','acces_clients,acces_chantiers,gerer_chantiers,voir_devis_chantier_sans_prix,voir_heures_chantiers,acces_planning,gerer_planning,acces_pointage,gerer_pointage,valider_pointages,saisir_son_pointage,acces_employes,saisir_ses_notes_frais,demander_ses_conges,utiliser_borne_stock,effectuer_entree_stock,effectuer_sortie_stock,acces_stock,gerer_stock,acces_flotte,acces_outillage,gerer_outillage,acces_interventions,gerer_interventions,acces_achats,acces_messagerie,gerer_messagerie,gerer_doe'],
    array['Chef d''équipe','acces_chantiers,voir_devis_chantier_sans_prix,voir_heures_chantiers,acces_planning,acces_pointage,saisir_son_pointage,saisir_ses_notes_frais,demander_ses_conges,utiliser_borne_stock,effectuer_entree_stock,effectuer_sortie_stock,acces_stock,acces_flotte,acces_outillage,acces_interventions,acces_messagerie'],
    array['Ouvrier','acces_chantiers,voir_devis_chantier_sans_prix,acces_planning,acces_pointage,saisir_son_pointage,saisir_ses_notes_frais,demander_ses_conges,utiliser_borne_stock,effectuer_entree_stock,effectuer_sortie_stock,acces_messagerie']
  ];
  v_role_cle text[]:=array[
    'gerant',
    'administration','administration',
    'chef_chantier','chef_chantier','chef_chantier',
    'chef_equipe','chef_equipe','chef_equipe','chef_equipe',
    'ouvrier','ouvrier','ouvrier','ouvrier','ouvrier','ouvrier','ouvrier','ouvrier','ouvrier',
    'ouvrier','ouvrier','ouvrier','ouvrier','ouvrier','ouvrier','ouvrier','ouvrier','ouvrier'
  ];
  v_prenoms text[]:=array[
    'Karim','Nadia','Yasmine','Bruno','Farid','Olivier','Kevin','Rachid','Antoine','Steven',
    'Mohamed','Julien','Anthony','Youssef','Maxime','Sofiane','Damien','Bilal','Thibault','Ismael',
    'Cedric','Amine','Florian','Hakim','Nicolas','Adrien','Karim','Vincent'
  ];
  v_noms text[]:=array[
    'Haddad','Ferreira','Roy','Castellani','Amrani','Ngoma','Lefebvre','Belkacem','Girard','Duval',
    'Cisse','Berthier','Faivre','Benali','Colin','Ait Ali','Roussel','Kader','Marchand','Toure',
    'Gauthier','Zeroual','Le Gall','Bouzid','Perrin','Fontaine','Belaid','Aubert'
  ];
  v_metiers text[]:=array[
    'Gerant','Assistante de gestion','Comptable',
    'Chef de chantier','Chef de chantier','Chef de chantier',
    'Chef d''equipe macon','Chef d''equipe second oeuvre','Chef d''equipe electricite','Chef d''equipe plomberie',
    'Macon','Coffreur bancheur','Electricien','Plaquiste','Peintre','Carreleur','Charpentier','Couvreur',
    'Plombier','Macon','Coffreur bancheur','Electricien','Plaquiste','Peintre','Carreleur','Menuisier',
    'Conducteur d''engins','Macon'
  ];
begin
  -- 1) Entreprise pilote : abonnement en essai (facturation pilote manuelle/offline, voir §9 du pack).
  select id into v_entreprise from public.entreprises where reference_interne='PILOTE-BTP-V1' limit 1;
  if v_entreprise is null then
    insert into public.entreprises(
      reference_interne,nom,raison_sociale,siret,adresse,code_postal,ville,abonnement_statut,
      abonnement_echeance,abonnement_note,created_at,updated_at
    ) values(
      'PILOTE-BTP-V1','SARL Bati-Rhone Construction','SARL Bati-Rhone Construction','90123456700018',
      '12 rue des Artisans','69200','Venissieux','essai',current_date+45,
      '[PILOTE] Entreprise BTP fictive - fixture de recette pilote externe accompagne, aucune donnee reelle',
      now()-interval '2 months',now()
    ) returning id into v_entreprise;
  else
    update public.entreprises set abonnement_statut='essai',abonnement_echeance=current_date+45,
      abonnement_note='[PILOTE] Entreprise BTP fictive - fixture de recette pilote externe accompagne, aucune donnee reelle',
      updated_at=now()
    where id=v_entreprise;
  end if;

  -- Capacité de personnes : une entreprise en essai est limitée à 3 comptes actifs
  -- (trigger trg_capacite_personnes_actives, migration 20260903000256) ; 28 salariés
  -- la dépasseraient. En conditions réelles, ce geste est fait par un opérateur
  -- plateforme via la RPC plateforme_definir_capacite_personnes_supplementaire
  -- (voir docs/organisation/ELSATIA_GP_TRIAL_SOCLE_ACCESS_V1.md §5) — RPC elle-même
  -- gardée par est_plateforme_admin()/AAL2, donc inappelable depuis ce script (même
  -- limite qu'installer_roles_predefinis, cf. §2). On reproduit ici uniquement son
  -- effet (mêmes colonnes, même ligne d'historique tracée) plutôt que le contournement
  -- générique elsatia.capacite_personnes_bypass, pour rester fidèle au geste réel
  -- qu'un opérateur pilote devra de toute façon faire le jour 1 (§9 du pack).
  update public.entreprises set
    capacite_personnes_supplementaire=30,capacite_personnes_source='systeme',
    capacite_personnes_reference_externe='PILOTE-BTP-V1 - fixture de recette',
    capacite_personnes_maj_at=now()
  where id=v_entreprise;
  insert into public.historique_capacite_personnes(entreprise_id,action,ancien,nouveau,source,reference_externe,motif)
  values(v_entreprise,'capacite_supplementaire_definie','{"capacite_personnes_supplementaire":0}'::jsonb,
    '{"capacite_personnes_supplementaire":30}'::jsonb,'systeme','PILOTE-BTP-V1 - fixture de recette',
    '[PILOTE] Capacite etendue pour permettre les 28 salaries de la fixture de recette pilote');

  -- 2) Les 5 profils demandés pour la recette pilote (mêmes intitulés et permissions que le
  --    catalogue canonique des 9 rôles prédéfinis, cf. déclaration de v_roles ci-dessus).
  for v_i in 1..array_length(v_roles,1) loop
    insert into public.postes(entreprise_id,nom) values(v_entreprise,v_roles[v_i][1])
    on conflict(entreprise_id,nom) do nothing;
    select id into v_poste from public.postes where entreprise_id=v_entreprise and nom=v_roles[v_i][1];
    if v_roles[v_i][2]='tous' then
      insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
      select v_entreprise,v_poste,cle,cle<>'mode_compte_depot' from public.permissions_disponibles
      on conflict(entreprise_id,poste_id,cle_permission) do update set autorise=excluded.autorise;
    else
      insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
      select v_entreprise,v_poste,p.cle,p.cle=any(string_to_array(v_roles[v_i][2],','))
      from public.permissions_disponibles p
      on conflict(entreprise_id,poste_id,cle_permission) do update set autorise=excluded.autorise;
    end if;
  end loop;
  select id into v_poste_gerant from public.postes where entreprise_id=v_entreprise and nom='Gérant';
  select id into v_poste_admin from public.postes where entreprise_id=v_entreprise and nom='Administration';
  select id into v_poste_chef_chantier from public.postes where entreprise_id=v_entreprise and nom='Chef de chantier';
  select id into v_poste_chef_equipe from public.postes where entreprise_id=v_entreprise and nom='Chef d''équipe';
  select id into v_poste_ouvrier from public.postes where entreprise_id=v_entreprise and nom='Ouvrier';

  -- 3) 28 salaries fictifs repartis sur les 5 profils demandes pour la recette pilote.
  for v_i in 1..array_length(v_prenoms,1) loop
    insert into public.employes(
      entreprise_id,reference_interne,prenom,nom,email,telephone,poste,poste_id,type_contrat,date_entree,
      statut,notes,carte_btp_numero,carte_btp_expiration,created_at
    ) values(
      v_entreprise,'PILOTE-EMP-'||lpad(v_i::text,3,'0'),v_prenoms[v_i],v_noms[v_i],
      'pilote.'||lower(v_prenoms[v_i])||'.'||lower(replace(v_noms[v_i],' ',''))||'@example.test',
      '06'||lpad((10000000+v_i*137)::text,8,'0'),v_metiers[v_i],
      case v_role_cle[v_i]
        when 'gerant' then v_poste_gerant when 'administration' then v_poste_admin
        when 'chef_chantier' then v_poste_chef_chantier when 'chef_equipe' then v_poste_chef_equipe
        else v_poste_ouvrier end,
      case when v_i=28 then 'apprenti' else 'cdi' end,
      current_date-(200+v_i*23),
      'actif','[PILOTE] Salarie fictif - fixture de recette, aucune donnee personnelle reelle',
      case when v_role_cle[v_i] in('ouvrier','chef_equipe','chef_chantier') then 'BTP-PILOTE-'||to_char(current_date,'YYYY')||'-'||lpad(v_i::text,5,'0') else null end,
      case when v_role_cle[v_i] in('ouvrier','chef_equipe','chef_chantier') then current_date+250+(v_i*11) else null end,
      now()-interval '2 months'
    ) on conflict(entreprise_id,reference_interne) do update set
      poste=excluded.poste,poste_id=excluded.poste_id,statut='actif',updated_at=now();
  end loop;
  select array_agg(id order by reference_interne) into v_employes from public.employes where entreprise_id=v_entreprise and reference_interne like 'PILOTE-EMP-%';

  -- Cout horaire interne : colonne separee de la fiche employe depuis un
  -- schema plus recent que le gabarit dont ce script s'inspire
  -- (creer_entreprise_demo_18_mois.sql insere encore cout_horaire directement
  -- sur employes ; ce n'est plus la structure reelle, corrige ici apres
  -- detection par dry-run local, voir ELSATIA_PILOT_FIXTURE_INDEPENDENT_REVIEW_V1.md).
  for v_i in 1..array_length(v_employes,1) loop
    insert into public.employes_cout_horaire(entreprise_id,employe_id,cout_horaire) values(
      v_entreprise,v_employes[v_i],
      case v_role_cle[v_i] when 'gerant' then null when 'administration' then 24+v_i*0.3
        when 'chef_chantier' then 31+v_i*0.3 when 'chef_equipe' then 26+v_i*0.3 else 19+(v_i%6) end
    ) on conflict(employe_id) do update set cout_horaire=excluded.cout_horaire,updated_at=now();
  end loop;

  -- Taux horaire facture : meme correction que le cout horaire interne
  -- ci-dessus, pour la meme raison (colonne separee de la fiche employe
  -- depuis 20260922000323_securiser_taux_horaire_facture_employe.sql,
  -- detectee par dry-run local lors de ELSATIA_EXTERNAL_PILOT_FULL_REHEARSAL_V2).
  for v_i in 1..array_length(v_employes,1) loop
    insert into public.employes_taux_facture(entreprise_id,employe_id,taux_horaire) values(
      v_entreprise,v_employes[v_i],
      case v_role_cle[v_i] when 'gerant' then null when 'administration' then 17+v_i*0.2
        when 'chef_chantier' then 22+v_i*0.2 when 'chef_equipe' then 18+v_i*0.2 else 13+(v_i%5) end
    ) on conflict(employe_id) do update set taux_horaire=excluded.taux_horaire,updated_at=now();
  end loop;

  -- Comptes utilisateurs actives (auth.users + public.utilisateurs + utilisateurs_entreprises,
  -- la table qui porte reellement les droits, separee de la fiche employe RH). Reutilise le
  -- meme UUID que la fiche employe correspondante (espaces de cles independants, aucune
  -- contrainte ne l'interdit) pour simplifier le script. Necessaire des la premiere execution :
  -- demandes_conges.created_by et bulletins/mouvements optionnels referencent utilisateurs, pas
  -- employes (detecte par dry-run local). Represente un pilote actif depuis ~2 mois ou toute
  -- l'equipe a active son compte ; le parcours d'activation lui-meme (numero d'inscription) est
  -- testé sur une entreprise neuve via l'onboarding reel, §2 du pack, pas reproduit ici.
  for v_i in 1..array_length(v_employes,1) loop
    insert into auth.users(id,email,created_at) values(
      v_employes[v_i],
      'pilote.'||lower(v_prenoms[v_i])||'.'||lower(replace(v_noms[v_i],' ',''))||'@example.test',
      now()-interval '2 months'
    ) on conflict(id) do nothing;
    insert into public.utilisateurs(id,nom,prenom,entreprise_active_id,created_at) values(
      v_employes[v_i],v_noms[v_i],v_prenoms[v_i],v_entreprise,now()-interval '2 months'
    ) on conflict(id) do update set entreprise_active_id=excluded.entreprise_active_id;
    insert into public.utilisateurs_entreprises(utilisateur_id,entreprise_id,poste_id,statut,pointage_personnel_actif) values(
      v_employes[v_i],v_entreprise,
      case v_role_cle[v_i] when 'gerant' then v_poste_gerant when 'administration' then v_poste_admin
        when 'chef_chantier' then v_poste_chef_chantier when 'chef_equipe' then v_poste_chef_equipe
        else v_poste_ouvrier end,
      'actif',true
    ) on conflict(utilisateur_id,entreprise_id) do update set poste_id=excluded.poste_id,statut='actif';
    update public.employes set utilisateur_id=v_employes[v_i],compte_active_at=now()-interval '2 months',
      compte_application_statut='actif' where id=v_employes[v_i];
  end loop;

  -- Habilitations pour une partie de l'equipe terrain (CACES, SST, travail en hauteur).
  delete from public.habilitations_employe where entreprise_id=v_entreprise and libelle like '[PILOTE]%';
  for v_i in 4..array_length(v_employes,1) loop
    if v_i%3=0 then
      insert into public.habilitations_employe(entreprise_id,employe_id,type,libelle,date_obtention,date_expiration)
      values(v_entreprise,v_employes[v_i],'caces','[PILOTE] CACES R482 - Engins de chantier',current_date-300,current_date+400);
    end if;
    if v_i%4=0 then
      insert into public.habilitations_employe(entreprise_id,employe_id,type,libelle,date_obtention,date_expiration)
      values(v_entreprise,v_employes[v_i],'sst','[PILOTE] Sauveteur secouriste du travail',current_date-200,current_date+520);
    end if;
    if v_i in(17,18,26) then
      insert into public.habilitations_employe(entreprise_id,employe_id,type,libelle,date_obtention,date_expiration)
      values(v_entreprise,v_employes[v_i],'travail_hauteur','[PILOTE] Travail en hauteur et port du harnais',current_date-180,current_date+300);
    end if;
  end loop;

  -- 4) 8 clients : 5 particuliers, 1 syndic, 1 collectivite, 1 professionnel.
  insert into public.clients(entreprise_id,reference_interne,type,nom,prenom,adresse_facturation,code_postal,ville,telephone,email,conditions_paiement,statut,notes,created_at) values
    (v_entreprise,'PILOTE-CLI-001','particulier','Lefort','Marc','4 impasse des Cerisiers','69200','Venissieux','0601020304','pilote.client1@example.test','A reception','actif','[PILOTE] Client fictif',now()-interval '2 months'),
    (v_entreprise,'PILOTE-CLI-002','particulier','Rambert','Antoine','9 rue Victor Hugo','69003','Lyon','0601020305','pilote.client2@example.test','30 jours','actif','[PILOTE] Client fictif',now()-interval '2 months'),
    (v_entreprise,'PILOTE-CLI-003','particulier','Vidal','Carole','21 avenue Jean Jaures','69007','Lyon','0601020306','pilote.client3@example.test','A reception','actif','[PILOTE] Client fictif',now()-interval '6 weeks'),
    (v_entreprise,'PILOTE-CLI-006','particulier','Faye','Amadou','3 chemin des Vignes','69800','Saint-Priest','0601020309','pilote.client6@example.test','30 jours','prospect','[PILOTE] Client fictif',now()-interval '3 weeks'),
    (v_entreprise,'PILOTE-CLI-008','particulier','Blanchard','Isabelle','15 rue des Ecoles','69200','Venissieux','0601020311','pilote.client8@example.test','30 jours','prospect','[PILOTE] Client fictif - pas encore de chantier',now()-interval '1 week')
  on conflict(entreprise_id,reference_interne) do nothing;
  insert into public.clients(entreprise_id,reference_interne,type,societe,raison_sociale,adresse_facturation,code_postal,ville,telephone,email,conditions_paiement,statut,notes,created_at) values
    (v_entreprise,'PILOTE-CLI-004','promoteur','SCI Les Tilleuls','SCI Les Tilleuls','2 place de la Mairie','69200','Venissieux','0472000001','pilote.client4@example.test','45 jours','actif','[PILOTE] Client fictif',now()-interval '2 months'),
    (v_entreprise,'PILOTE-CLI-005','syndic','Syndic Immo Rhone','Syndic Immo Rhone SAS','18 cours Gambetta','69007','Lyon','0472000002','pilote.client5@example.test','30 jours','actif','[PILOTE] Client fictif',now()-interval '2 months'),
    (v_entreprise,'PILOTE-CLI-007','professionnel','Dumont Logistique','Dumont Logistique SARL','5 rue de l''Industrie','69800','Saint-Priest','0472000003','pilote.client7@example.test','60 jours','actif','[PILOTE] Client fictif',now()-interval '1 month')
  on conflict(entreprise_id,reference_interne) do nothing;
  select array_agg(id order by reference_interne) into v_clients from public.clients where entreprise_id=v_entreprise and reference_interne like 'PILOTE-CLI-%';
  -- Ordre : 1 Lefort,2 Rambert,3 Vidal,4 Les Tilleuls,5 Immo Rhone,6 Faye,7 Dumont,8 Blanchard.

  -- 5) 7 chantiers, statuts varies (prospect -> termine).
  insert into public.chantiers(entreprise_id,reference_interne,client_id,nom,adresse,code_postal,ville,statut,date_debut_prevue,date_fin_prevue,date_debut_reelle,date_fin_reelle,budget_previsionnel,created_at) values
    (v_entreprise,'PILOTE-CHA-001',v_clients[1],'Extension maison - Lefort','4 impasse des Cerisiers','69200','Venissieux','termine',current_date-70,current_date-25,current_date-68,current_date-27,38500,now()-interval '2 months'),
    (v_entreprise,'PILOTE-CHA-002',v_clients[2],'Renovation salle de bain - Rambert','9 rue Victor Hugo','69003','Lyon','facture',current_date-55,current_date-20,current_date-53,current_date-22,9800,now()-interval '2 months'),
    (v_entreprise,'PILOTE-CHA-003',v_clients[3],'Ravalement facade - Vidal','21 avenue Jean Jaures','69007','Lyon','en_cours',current_date-30,current_date+15,current_date-28,null,21400,now()-interval '6 weeks'),
    (v_entreprise,'PILOTE-CHA-004',v_clients[4],'Construction 6 logements - Les Tilleuls','2 place de la Mairie','69200','Venissieux','en_cours',current_date-40,current_date+140,current_date-38,null,412000,now()-interval '2 months'),
    (v_entreprise,'PILOTE-CHA-005',v_clients[5],'Refection toiture copropriete - Immo Rhone','18 cours Gambetta','69007','Lyon','en_cours',current_date-21,current_date+21,current_date-19,null,64500,now()-interval '5 weeks'),
    (v_entreprise,'PILOTE-CHA-006',v_clients[6],'Renovation ecole primaire - Saint-Priest','3 chemin des Vignes','69800','Saint-Priest','accepte',current_date+10,current_date+90,null,null,156000,now()-interval '3 weeks'),
    (v_entreprise,'PILOTE-CHA-007',v_clients[7],'Extension entrepot - Dumont Logistique','5 rue de l''Industrie','69800','Saint-Priest','devis_envoye',current_date+30,current_date+120,null,null,98000,now()-interval '1 month')
  on conflict(entreprise_id,reference_interne) do update set statut=excluded.statut;
  select array_agg(id order by reference_interne) into v_chantiers from public.chantiers where entreprise_id=v_entreprise and reference_interne like 'PILOTE-CHA-%';
  v_chantiers_actifs:=array[v_chantiers[3],v_chantiers[4],v_chantiers[5]]; -- les 3 chantiers en_cours

  -- Equipes permanentes sur les chantiers en cours : 1 chef de chantier + 1 chef d'equipe + 3 ouvriers chacun.
  delete from public.equipes_chantiers where entreprise_id=v_entreprise and note like '[PILOTE]%';
  insert into public.equipes_chantiers(entreprise_id,chantier_id,employe_id,role_chantier,date_debut,note) values
    (v_entreprise,v_chantiers[3],v_employes[4],'chef_chantier',current_date-28,'[PILOTE] Encadrement'),
    (v_entreprise,v_chantiers[3],v_employes[7],'chef_equipe',current_date-28,'[PILOTE] Equipe'),
    (v_entreprise,v_chantiers[3],v_employes[11],'ouvrier',current_date-28,'[PILOTE] Equipe'),
    (v_entreprise,v_chantiers[3],v_employes[12],'ouvrier',current_date-28,'[PILOTE] Equipe'),
    (v_entreprise,v_chantiers[3],v_employes[13],'ouvrier',current_date-28,'[PILOTE] Equipe'),
    (v_entreprise,v_chantiers[4],v_employes[5],'chef_chantier',current_date-38,'[PILOTE] Encadrement'),
    (v_entreprise,v_chantiers[4],v_employes[8],'chef_equipe',current_date-38,'[PILOTE] Equipe'),
    (v_entreprise,v_chantiers[4],v_employes[14],'ouvrier',current_date-38,'[PILOTE] Equipe'),
    (v_entreprise,v_chantiers[4],v_employes[15],'ouvrier',current_date-38,'[PILOTE] Equipe'),
    (v_entreprise,v_chantiers[4],v_employes[16],'ouvrier',current_date-38,'[PILOTE] Equipe'),
    (v_entreprise,v_chantiers[5],v_employes[6],'chef_chantier',current_date-19,'[PILOTE] Encadrement'),
    (v_entreprise,v_chantiers[5],v_employes[9],'chef_equipe',current_date-19,'[PILOTE] Equipe'),
    (v_entreprise,v_chantiers[5],v_employes[17],'ouvrier',current_date-19,'[PILOTE] Equipe'),
    (v_entreprise,v_chantiers[5],v_employes[18],'ouvrier',current_date-19,'[PILOTE] Equipe'),
    (v_entreprise,v_chantiers[5],v_employes[19],'ouvrier',current_date-19,'[PILOTE] Equipe');

  -- 6) Devis : un par chantier (statut coherent avec le chantier), + un envoye et un refuse pour le
  --    prospect Dumont Logistique, + un brouillon pour la cliente sans chantier (Blanchard).
  --    Chaque devis est cree en 'brouillon', ses lignes inserees, puis son statut cible
  --    applique par un UPDATE separe : un devis accepte est verrouille en ecriture par le
  --    trigger verrouiller_devis_accepte() (montants/numero/dates figes), qui bloquerait le
  --    recalcul automatique des montants (trg_recalc_devis) si les lignes etaient inserees
  --    apres coup — detecte par dry-run local (voir
  --    ELSATIA_PILOT_FIXTURE_INDEPENDENT_REVIEW_V1.md), meme precaution que pour les factures.
  if not exists(select 1 from public.devis where entreprise_id=v_entreprise and numero like 'DEV-PILOTE-%') then
    insert into public.devis(entreprise_id,numero,client_id,chantier_id,statut,date_emission,date_validite,conditions,notes_client,notes_internes,created_at)
      values(v_entreprise,'DEV-PILOTE-001',v_clients[1],v_chantiers[1],'brouillon',current_date-75,current_date-45,'Acompte 30% a la signature','Merci pour votre confiance.','[PILOTE] Fixture',(current_date-75)::timestamptz+interval '9 hours') returning id into v_devis;
    insert into public.lignes_devis(devis_id,designation,description,type,quantite,unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre) values
      (v_devis,'Extension 20m2 - gros oeuvre','Fondations, elevation murs','main_oeuvre',120,'h',48,0,20,1),
      (v_devis,'Fournitures maconnerie','Parpaings, ciment, armatures','fourniture',1,'forfait',9800,0,20,2),
      (v_devis,'Toiture extension','Charpente et couverture','forfait',1,'forfait',12500,0,10,3);
    update public.devis set statut='accepte' where id=v_devis;

    insert into public.devis(entreprise_id,numero,client_id,chantier_id,statut,date_emission,date_validite,conditions,notes_client,notes_internes,created_at)
      values(v_entreprise,'DEV-PILOTE-002',v_clients[2],v_chantiers[2],'brouillon',current_date-58,current_date-28,'Acompte 30% a la signature','Merci pour votre confiance.','[PILOTE] Fixture',(current_date-58)::timestamptz+interval '9 hours') returning id into v_devis;
    insert into public.lignes_devis(devis_id,designation,description,type,quantite,unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre) values
      (v_devis,'Renovation salle de bain','Depose, plomberie, carrelage','forfait',1,'forfait',9800,0,10,1);
    update public.devis set statut='accepte' where id=v_devis;

    insert into public.devis(entreprise_id,numero,client_id,chantier_id,statut,date_emission,date_validite,conditions,notes_client,notes_internes,created_at)
      values(v_entreprise,'DEV-PILOTE-003',v_clients[3],v_chantiers[3],'brouillon',current_date-33,current_date-3,'Situations mensuelles','Merci pour votre confiance.','[PILOTE] Fixture',(current_date-33)::timestamptz+interval '9 hours') returning id into v_devis;
    insert into public.lignes_devis(devis_id,designation,description,type,quantite,unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre) values
      (v_devis,'Ravalement facade','Nettoyage, enduit, peinture','main_oeuvre',280,'h',42,0,10,1),
      (v_devis,'Echafaudage','Location et montage','forfait',1,'forfait',3200,0,20,2);
    update public.devis set statut='accepte' where id=v_devis;

    insert into public.devis(entreprise_id,numero,client_id,chantier_id,statut,date_emission,date_validite,conditions,notes_client,notes_internes,created_at)
      values(v_entreprise,'DEV-PILOTE-004',v_clients[4],v_chantiers[4],'brouillon',current_date-43,current_date-13,'Acompte 20%, situations mensuelles, solde a livraison','Devis initial - 6 logements collectifs.','[PILOTE] Fixture - marche important',(current_date-43)::timestamptz+interval '9 hours') returning id into v_devis;
    insert into public.lignes_devis(devis_id,designation,description,type,quantite,unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre) values
      (v_devis,'Gros oeuvre 6 logements','Fondations, elevation, dalles','main_oeuvre',1800,'h',45,0,20,1),
      (v_devis,'Fournitures gros oeuvre','Beton, acier, blocs','fourniture',1,'forfait',185000,0,20,2),
      (v_devis,'Second oeuvre','Cloisons, electricite, plomberie','forfait',1,'forfait',95000,5,20,3);
    update public.devis set statut='accepte' where id=v_devis;

    insert into public.devis(entreprise_id,numero,client_id,chantier_id,statut,date_emission,date_validite,conditions,notes_client,notes_internes,created_at)
      values(v_entreprise,'DEV-PILOTE-005',v_clients[5],v_chantiers[5],'brouillon',current_date-24,current_date+6,'Acompte 30% a la signature','Merci pour votre confiance.','[PILOTE] Fixture',(current_date-24)::timestamptz+interval '9 hours') returning id into v_devis;
    insert into public.lignes_devis(devis_id,designation,description,type,quantite,unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre) values
      (v_devis,'Refection toiture copropriete','Depose, charpente, couverture','forfait',1,'forfait',64500,0,10,1);
    update public.devis set statut='accepte' where id=v_devis;

    insert into public.devis(entreprise_id,numero,client_id,chantier_id,statut,date_emission,date_validite,conditions,notes_client,notes_internes,created_at)
      values(v_entreprise,'DEV-PILOTE-006',v_clients[6],v_chantiers[6],'brouillon',current_date-18,current_date+12,'Acompte 20% a la signature','Marche public - ecole primaire.','[PILOTE] Fixture',(current_date-18)::timestamptz+interval '9 hours') returning id into v_devis;
    insert into public.lignes_devis(devis_id,designation,description,type,quantite,unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre) values
      (v_devis,'Renovation ecole primaire','Menuiseries, peinture, sols','forfait',1,'forfait',156000,0,20,1);
    update public.devis set statut='accepte' where id=v_devis;

    insert into public.devis(entreprise_id,numero,client_id,chantier_id,statut,date_emission,date_validite,conditions,notes_client,notes_internes,created_at)
      values(v_entreprise,'DEV-PILOTE-007',v_clients[7],v_chantiers[7],'brouillon',current_date-6,current_date+24,'Acompte 30% a la signature','En attente de votre retour.','[PILOTE] Fixture - devis en cours de negociation',(current_date-6)::timestamptz+interval '9 hours') returning id into v_devis;
    insert into public.lignes_devis(devis_id,designation,description,type,quantite,unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre) values
      (v_devis,'Extension entrepot 200m2','Structure metallique et bardage','forfait',1,'forfait',98000,0,20,1);
    update public.devis set statut='envoye' where id=v_devis;

    insert into public.devis(entreprise_id,numero,client_id,chantier_id,statut,date_emission,date_validite,conditions,notes_client,notes_internes,created_at)
      values(v_entreprise,'DEV-PILOTE-008',v_clients[7],v_chantiers[7],'brouillon',current_date-9,current_date+21,'Acompte 30% a la signature','Variante non retenue par le client.','[PILOTE] Fixture - variante refusee',(current_date-9)::timestamptz+interval '9 hours') returning id into v_devis;
    insert into public.lignes_devis(devis_id,designation,description,type,quantite,unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre) values
      (v_devis,'Extension entrepot 200m2 - variante bois','Structure bois et bardage','forfait',1,'forfait',118000,0,20,1);
    update public.devis set statut='refuse' where id=v_devis;

    insert into public.devis(entreprise_id,numero,client_id,chantier_id,statut,date_emission,date_validite,conditions,notes_client,notes_internes,created_at)
      values(v_entreprise,'DEV-PILOTE-009',v_clients[8],null,'brouillon',current_date-2,current_date+28,'A finaliser','','[PILOTE] Fixture - devis pas encore envoye, sans chantier',(current_date-2)::timestamptz+interval '9 hours') returning id into v_devis;
    insert into public.lignes_devis(devis_id,designation,description,type,quantite,unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre) values
      (v_devis,'Amenagement combles','Isolation, cloisons, electricite','forfait',1,'forfait',18500,0,10,1);
  end if;

  -- 7) Factures : soldee, en retard (test relance), 2 situations sur le gros chantier, acomptes.
  if not exists(select 1 from public.factures where entreprise_id=v_entreprise and numero like 'FAC-PILOTE-%') then
    -- Chantier 1 (termine) : facture simple entierement payee.
    insert into public.factures(entreprise_id,numero,client_id,chantier_id,devis_origine_id,type,statut,date_emission,date_echeance,notes_client,notes_internes,created_at)
    select v_entreprise,'FAC-PILOTE-001',v_clients[1],v_chantiers[1],d.id,'simple','brouillon',current_date-25,current_date-10,'Paiement par virement.','[PILOTE] Fixture',(current_date-25)::timestamptz+interval '10 hours'
    from public.devis d where d.entreprise_id=v_entreprise and d.numero='DEV-PILOTE-001' returning id into v_facture;
    insert into public.lignes_factures(facture_id,designation,description,type,quantite,unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre)
    select v_facture,designation,description,type,quantite,unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre from public.lignes_devis dl join public.devis d on d.id=dl.devis_id where d.numero='DEV-PILOTE-001';
    update public.factures set statut='envoyee' where id=v_facture;
    select montant_ttc into v_total from public.factures where id=v_facture;
    insert into public.paiements(facture_id,montant,date,mode,reference,created_at) values(v_facture,v_total,current_date-16,'virement','PILOTE-REG-001',(current_date-16)::timestamptz+interval '11 hours');
    update public.factures set statut='payee' where id=v_facture;

    -- Chantier 2 (facture) : impayee, echeance depassee -> tester la relance manuelle/auto.
    insert into public.factures(entreprise_id,numero,client_id,chantier_id,devis_origine_id,type,statut,date_emission,date_echeance,notes_client,notes_internes,created_at)
    select v_entreprise,'FAC-PILOTE-002',v_clients[2],v_chantiers[2],d.id,'simple','brouillon',current_date-20,current_date-5,'Paiement par virement ou carte en ligne.','[PILOTE] Fixture - impayee volontairement pour tester la relance',(current_date-20)::timestamptz+interval '10 hours'
    from public.devis d where d.entreprise_id=v_entreprise and d.numero='DEV-PILOTE-002' returning id into v_facture;
    insert into public.lignes_factures(facture_id,designation,description,type,quantite,unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre)
    select v_facture,designation,description,type,quantite,unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre from public.lignes_devis dl join public.devis d on d.id=dl.devis_id where d.numero='DEV-PILOTE-002';
    update public.factures set statut='envoyee' where id=v_facture;
    update public.factures set statut='en_retard' where id=v_facture and date_echeance<current_date;

    -- Chantier 3 : acompte paye + situation en cours (facturation d'avancement).
    insert into public.factures(entreprise_id,numero,client_id,chantier_id,devis_origine_id,type,statut,date_emission,date_echeance,notes_client,notes_internes,created_at)
    select v_entreprise,'FAC-PILOTE-003',v_clients[3],v_chantiers[3],d.id,'acompte','brouillon',current_date-28,current_date-13,'Acompte 30% a la signature.','[PILOTE] Fixture',(current_date-28)::timestamptz+interval '10 hours'
    from public.devis d where d.entreprise_id=v_entreprise and d.numero='DEV-PILOTE-003' returning id into v_facture;
    insert into public.lignes_factures(facture_id,designation,description,type,quantite,unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre) values
      (v_facture,'Acompte 30%','Acompte a la signature','forfait',1,'forfait',7392,0,15,1);
    update public.factures set statut='envoyee' where id=v_facture;
    select montant_ttc into v_total from public.factures where id=v_facture;
    insert into public.paiements(facture_id,montant,date,mode,reference,created_at) values(v_facture,v_total,current_date-20,'cb','PILOTE-REG-002',(current_date-20)::timestamptz+interval '11 hours');
    update public.factures set statut='payee' where id=v_facture;

    insert into public.factures(entreprise_id,numero,client_id,chantier_id,devis_origine_id,type,statut,date_emission,date_echeance,notes_client,notes_internes,created_at)
    select v_entreprise,'FAC-PILOTE-004',v_clients[3],v_chantiers[3],d.id,'situation','brouillon',current_date-3,current_date+27,'Situation n1 - avancement travaux.','[PILOTE] Fixture - facture recente, en attente de paiement',(current_date-3)::timestamptz+interval '10 hours'
    from public.devis d where d.entreprise_id=v_entreprise and d.numero='DEV-PILOTE-003' returning id into v_facture;
    insert into public.lignes_factures(facture_id,designation,description,type,quantite,unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre) values
      (v_facture,'Situation n1 - 50% avancement','Ravalement facade - avancement au '||to_char(current_date-3,'DD/MM/YYYY'),'forfait',1,'forfait',12480,0,10,1);
    update public.factures set statut='envoyee' where id=v_facture;

    -- Chantier 4 (gros marche) : acompte paye + situation envoyee.
    insert into public.factures(entreprise_id,numero,client_id,chantier_id,devis_origine_id,type,statut,date_emission,date_echeance,notes_client,notes_internes,created_at)
    select v_entreprise,'FAC-PILOTE-005',v_clients[4],v_chantiers[4],d.id,'acompte','brouillon',current_date-40,current_date-25,'Acompte 20% a la signature.','[PILOTE] Fixture',(current_date-40)::timestamptz+interval '10 hours'
    from public.devis d where d.entreprise_id=v_entreprise and d.numero='DEV-PILOTE-004' returning id into v_facture;
    insert into public.lignes_factures(facture_id,designation,description,type,quantite,unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre) values
      (v_facture,'Acompte 20%','Acompte a la signature','forfait',1,'forfait',77140,0,20,1);
    update public.factures set statut='envoyee' where id=v_facture;
    select montant_ttc into v_total from public.factures where id=v_facture;
    insert into public.paiements(facture_id,montant,date,mode,reference,created_at) values(v_facture,v_total,current_date-32,'virement','PILOTE-REG-003',(current_date-32)::timestamptz+interval '11 hours');
    update public.factures set statut='payee' where id=v_facture;

    insert into public.factures(entreprise_id,numero,client_id,chantier_id,devis_origine_id,type,statut,date_emission,date_echeance,notes_client,notes_internes,created_at)
    select v_entreprise,'FAC-PILOTE-006',v_clients[4],v_chantiers[4],d.id,'situation','brouillon',current_date-2,current_date+43,'Situation n1 - fondations et elevation RDC.','[PILOTE] Fixture',(current_date-2)::timestamptz+interval '10 hours'
    from public.devis d where d.entreprise_id=v_entreprise and d.numero='DEV-PILOTE-004' returning id into v_facture;
    insert into public.lignes_factures(facture_id,designation,description,type,quantite,unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre) values
      (v_facture,'Situation n1 - fondations + elevation RDC','Avancement au '||to_char(current_date-2,'DD/MM/YYYY'),'forfait',1,'forfait',96000,0,20,1);
    update public.factures set statut='envoyee' where id=v_facture;

    -- Chantier 5 : acompte paye.
    insert into public.factures(entreprise_id,numero,client_id,chantier_id,devis_origine_id,type,statut,date_emission,date_echeance,notes_client,notes_internes,created_at)
    select v_entreprise,'FAC-PILOTE-007',v_clients[5],v_chantiers[5],d.id,'acompte','brouillon',current_date-22,current_date-7,'Acompte 30% a la signature.','[PILOTE] Fixture',(current_date-22)::timestamptz+interval '10 hours'
    from public.devis d where d.entreprise_id=v_entreprise and d.numero='DEV-PILOTE-005' returning id into v_facture;
    insert into public.lignes_factures(facture_id,designation,description,type,quantite,unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre) values
      (v_facture,'Acompte 30%','Acompte a la signature','forfait',1,'forfait',19350,0,10,1);
    update public.factures set statut='envoyee' where id=v_facture;
    select montant_ttc into v_total from public.factures where id=v_facture;
    insert into public.paiements(facture_id,montant,date,mode,reference,created_at) values(v_facture,v_total,current_date-14,'virement','PILOTE-REG-004',(current_date-14)::timestamptz+interval '11 hours');
    update public.factures set statut='payee' where id=v_facture;
  end if;

  -- 8) Planning et pointages : 4 semaines (20 jours ouvres) sur les 3 chantiers en_cours,
  --    avec 2 pointages laisses "a_verifier" (validation en attente par le chef de chantier)
  --    et 1 pointage "arrivee oubliee" (regularisation).
  if not exists(select 1 from public.affectations where entreprise_id=v_entreprise and tache like '[PILOTE]%') then
    for v_semaine in 0..3 loop
      for v_jour in 0..4 loop
        v_date:=date_trunc('week',current_date)::date-28+v_semaine*7+v_jour;
        for v_i in 1..15 loop
          -- Pool de 15 : les 3 chefs de chantier (4,5,6), les 4 chefs d'equipe (7-10) et 8 ouvriers (11-18).
          v_employe:=(array[v_employes[4],v_employes[5],v_employes[6],v_employes[7],v_employes[8],v_employes[9],v_employes[10],
                             v_employes[11],v_employes[12],v_employes[13],v_employes[14],v_employes[15],v_employes[16],v_employes[17],v_employes[18]])[v_i];
          v_chantier:=v_chantiers_actifs[1+((v_semaine+v_jour+v_i-1)%3)];
          insert into public.affectations(entreprise_id,chantier_id,employe_id,date,heures,tache,notes,type_activite,created_at)
          values(v_entreprise,v_chantier,v_employe,v_date,case when v_jour=4 then 7 else 8 end,'[PILOTE] Travaux planifies','Fixture de recette pilote','chantier',v_date::timestamptz+interval '6 hours')
          returning id into v_affectation;
          insert into public.pointages(
            entreprise_id,employe_id,chantier_id,date,heures_normales,heures_supplementaires,pause_minutes,tache,commentaire,
            latitude,longitude,precision_metres,verification_statut,verification_at,affectation_id,heures_attendues,origine_pointage,created_at,updated_at
          ) values(
            v_entreprise,v_employe,v_chantier,v_date,case when v_jour=4 then 7 else 8 end,
            case when (v_i+v_semaine)%9=0 then .5 else 0 end,45,'[PILOTE] Travaux realises','Fixture de recette pilote',
            45.699+(v_i::numeric/10000),4.881+(v_jour::numeric/10000),8+(v_i%5),
            case when (v_semaine=3 and v_jour=2 and v_i in(1,5)) then 'a_verifier' else 'valide' end,
            case when (v_semaine=3 and v_jour=2 and v_i in(1,5)) then null else v_date::timestamptz+interval '18 hours' end,
            v_affectation,case when v_jour=4 then 7 else 8 end,
            case when (v_semaine=2 and v_jour=3 and v_i=2) then 'arrivee_oubliee' else 'gps_complet' end,
            v_date::timestamptz+interval '18 hours',v_date::timestamptz+interval '18 hours'
          );
        end loop;
      end loop;
    end loop;
  end if;

  -- 9) Fournisseurs, stock et mouvements.
  insert into public.fournisseurs(entreprise_id,reference,nom,contact_nom,email,telephone,adresse,code_postal,ville,notes,actif) values
    (v_entreprise,'PILOTE-FRN-001','Point.P','Service pro','pilote.pointp@example.test','0472100001','1 rue du Negoce','69200','Venissieux','[PILOTE] Fournisseur fictif',true),
    (v_entreprise,'PILOTE-FRN-002','Rexel','Service pro','pilote.rexel@example.test','0472100002','2 rue du Negoce','69200','Venissieux','[PILOTE] Fournisseur fictif',true),
    (v_entreprise,'PILOTE-FRN-003','Kiloutou','Agence location','pilote.kiloutou@example.test','0472100003','3 rue du Negoce','69200','Venissieux','[PILOTE] Fournisseur fictif',true),
    (v_entreprise,'PILOTE-FRN-004','Gedimat','Service pro','pilote.gedimat@example.test','0472100004','4 rue du Negoce','69200','Venissieux','[PILOTE] Fournisseur fictif',true),
    (v_entreprise,'PILOTE-FRN-005','Wurth','Service pro','pilote.wurth@example.test','0472100005','5 rue du Negoce','69200','Venissieux','[PILOTE] Fournisseur fictif',true)
  on conflict(entreprise_id,reference) do update set nom=excluded.nom,actif=true;
  select array_agg(id order by reference) into v_fournisseurs from public.fournisseurs where entreprise_id=v_entreprise and reference like 'PILOTE-FRN-%';

  insert into public.articles_stock(entreprise_id,reference,designation,unite,quantite_stock,seuil_alerte,prix_achat_ht,prix_vente_ht,emplacement,actif) values
    (v_entreprise,'PILOTE-STK-001','Plaque BA13','u',85,20,6.9,11.5,'Depot - Zone A',true),
    (v_entreprise,'PILOTE-STK-002','Sac de ciment 35kg','u',40,15,7.2,11.9,'Depot - Zone A',true),
    (v_entreprise,'PILOTE-STK-003','Parpaing 20cm','u',600,150,1.4,2.3,'Depot - Zone B',true),
    (v_entreprise,'PILOTE-STK-004','Cable electrique 3G2.5mm','ml',320,80,1.1,1.8,'Depot - Zone C',true),
    (v_entreprise,'PILOTE-STK-005','Disjoncteur 20A','u',18,10,9.5,15.6,'Depot - Zone C',true),
    (v_entreprise,'PILOTE-STK-006','Peinture acrylique blanche 10L','u',12,5,42,67.2,'Depot - Zone D',true),
    (v_entreprise,'PILOTE-STK-007','Rouleau laine de verre','u',9,10,28,44.8,'Depot - Zone D',true),
    (v_entreprise,'PILOTE-STK-008','Vis autoforantes boite 250','u',22,10,14,22.4,'Depot - Zone E',true),
    (v_entreprise,'PILOTE-STK-009','Silicone sanitaire','u',30,15,4.8,7.9,'Depot - Zone E',true),
    (v_entreprise,'PILOTE-STK-010','Carrelage gres cerame 60x60','m2',140,40,18.5,29.6,'Depot - Zone B',true),
    (v_entreprise,'PILOTE-STK-011','Casque de chantier (EPI)','u',25,8,12,19.2,'Depot - EPI',true),
    (v_entreprise,'PILOTE-STK-012','Gants de manutention (EPI)','paire',60,20,3.2,5.3,'Depot - EPI',true),
    (v_entreprise,'PILOTE-STK-013','Gasoil non routier (GNR)','L',400,100,1.35,1.35,'Depot - Cuve',true),
    (v_entreprise,'PILOTE-STK-014','Mortier-colle sac 25kg','u',35,15,9.8,15.9,'Depot - Zone A',true),
    (v_entreprise,'PILOTE-STK-015','Tuile mecanique terre cuite','u',900,200,1.9,3.1,'Depot - Zone B',true)
  on conflict(entreprise_id,reference) do update set quantite_stock=excluded.quantite_stock,prix_achat_ht=excluded.prix_achat_ht,prix_vente_ht=excluded.prix_vente_ht,actif=true;
  select array_agg(id order by reference) into v_articles from public.articles_stock where entreprise_id=v_entreprise and reference like 'PILOTE-STK-%';

  delete from public.mouvements_stock where entreprise_id=v_entreprise and motif like '[PILOTE]%';
  for v_i in 1..array_length(v_articles,1) loop
    insert into public.mouvements_stock(entreprise_id,article_id,type,quantite,date,motif)
    values(v_entreprise,v_articles[v_i],'entree',50+(v_i%6)*15,current_date-45,'[PILOTE] Stock initial');
    for v_semaine in 0..3 loop
      insert into public.mouvements_stock(entreprise_id,article_id,chantier_id,type,quantite,date,motif)
      values(v_entreprise,v_articles[v_i],v_chantiers_actifs[1+((v_i+v_semaine-1)%3)],'sortie',
        1+((v_i+v_semaine)%4),current_date-28+v_semaine*7+2,'[PILOTE] Consommation chantier');
    end loop;
  end loop;

  -- 10) Commandes fournisseurs : brouillon, confirmee, recue_partiel, recue.
  if not exists(select 1 from public.commandes_fournisseurs where entreprise_id=v_entreprise and numero like 'CMD-PILOTE-%') then
    insert into public.commandes_fournisseurs(entreprise_id,numero,fournisseur_id,chantier_id,statut,date_commande,date_livraison_prevue,notes,created_at)
    values(v_entreprise,'CMD-PILOTE-001',v_fournisseurs[1],v_chantiers[4],'recue',current_date-35,current_date-28,'[PILOTE] Approvisionnement gros oeuvre',(current_date-35)::timestamptz+interval '8 hours') returning id into v_commande;
    insert into public.lignes_commande(entreprise_id,commande_id,designation,description,quantite,unite,prix_unitaire_ht,taux_tva,quantite_recue,ordre) values
      (v_entreprise,v_commande,'Parpaing 20cm','Livraison chantier',2000,'u',1.35,20,2000,1),
      (v_entreprise,v_commande,'Sac de ciment 35kg','Livraison chantier',150,'u',7.2,20,150,2);

    insert into public.commandes_fournisseurs(entreprise_id,numero,fournisseur_id,chantier_id,statut,date_commande,date_livraison_prevue,notes,created_at)
    values(v_entreprise,'CMD-PILOTE-002',v_fournisseurs[2],v_chantiers[3],'recue_partiel',current_date-10,current_date-3,'[PILOTE] Materiel electrique',(current_date-10)::timestamptz+interval '8 hours') returning id into v_commande;
    insert into public.lignes_commande(entreprise_id,commande_id,designation,description,quantite,unite,prix_unitaire_ht,taux_tva,quantite_recue,ordre) values
      (v_entreprise,v_commande,'Cable electrique 3G2.5mm','Livraison partielle',500,'ml',1.1,20,300,1),
      (v_entreprise,v_commande,'Disjoncteur 20A','Livraison partielle',15,'u',9.5,20,10,2);

    insert into public.commandes_fournisseurs(entreprise_id,numero,fournisseur_id,chantier_id,statut,date_commande,date_livraison_prevue,notes,created_at)
    values(v_entreprise,'CMD-PILOTE-003',v_fournisseurs[3],v_chantiers[5],'confirmee',current_date-4,current_date+3,'[PILOTE] Location echafaudage toiture',(current_date-4)::timestamptz+interval '8 hours') returning id into v_commande;
    insert into public.lignes_commande(entreprise_id,commande_id,designation,description,quantite,unite,prix_unitaire_ht,taux_tva,quantite_recue,ordre) values
      (v_entreprise,v_commande,'Location echafaudage 3 semaines','Toiture copropriete',1,'forfait',2400,20,0,1);

    insert into public.commandes_fournisseurs(entreprise_id,numero,fournisseur_id,chantier_id,statut,date_commande,date_livraison_prevue,notes,created_at)
    values(v_entreprise,'CMD-PILOTE-004',v_fournisseurs[5],null,'brouillon',current_date-1,current_date+7,'[PILOTE] Reappro depot - pas encore envoyee',(current_date-1)::timestamptz+interval '8 hours') returning id into v_commande;
    insert into public.lignes_commande(entreprise_id,commande_id,designation,description,quantite,unite,prix_unitaire_ht,taux_tva,quantite_recue,ordre) values
      (v_entreprise,v_commande,'Vis autoforantes boite 250','Reappro depot',30,'u',14,20,0,1);
  end if;

  -- Depenses fournisseurs + reglements pour les commandes recues.
  if not exists(select 1 from public.depenses_fournisseurs where entreprise_id=v_entreprise and notes like '[PILOTE]%') then
    insert into public.depenses_fournisseurs(entreprise_id,fournisseur_id,chantier_id,commande_id,numero_piece,categorie,date_piece,date_echeance,montant_ht,montant_tva,notes,created_at)
    select v_entreprise,v_fournisseurs[1],v_chantiers[4],c.id,'ACH-PILOTE-001','materiaux',current_date-27,current_date-12,4770,954,'[PILOTE] Facture fournisseur liee a la commande',(current_date-27)::timestamptz+interval '9 hours'
    from public.commandes_fournisseurs c where c.numero='CMD-PILOTE-001' returning id into v_depense;
    select montant_ttc into v_total from public.depenses_fournisseurs where id=v_depense;
    insert into public.reglements_fournisseurs(entreprise_id,depense_id,montant,date,mode,reference,created_at)
    values(v_entreprise,v_depense,v_total,current_date-5,'virement','PILOTE-RF-001',(current_date-5)::timestamptz+interval '10 hours');

    insert into public.depenses_fournisseurs(entreprise_id,fournisseur_id,chantier_id,commande_id,numero_piece,categorie,date_piece,date_echeance,montant_ht,montant_tva,notes,created_at)
    select v_entreprise,v_fournisseurs[2],v_chantiers[3],c.id,'ACH-PILOTE-002','materiaux',current_date-2,current_date+28,588,117.6,'[PILOTE] Facture fournisseur liee a la commande (livraison partielle)',(current_date-2)::timestamptz+interval '9 hours'
    from public.commandes_fournisseurs c where c.numero='CMD-PILOTE-002' returning id into v_depense;
    -- Reglement volontairement absent : facture fournisseur non echue, teste l'affichage "a payer".
  end if;

  -- 11) Notes de frais salariees : soumise, validee, refusee, remboursee.
  --     valide_par reference public.utilisateurs (un compte connecte), pas employes -
  --     fonctionne car la boucle de comptes ci-dessus reutilise le meme UUID.
  if not exists(select 1 from public.notes_frais where entreprise_id=v_entreprise and commentaire_salarie like '[PILOTE]%') then
    insert into public.notes_frais(entreprise_id,employe_id,chantier_id,date_frais,montant_ttc,categorie,description,statut,montant_ht,montant_tva,taux_tva,devise,moyen_paiement,commentaire_salarie,soumis_at,valide_at,valide_par,created_at,updated_at) values
      (v_entreprise,v_employes[7],v_chantiers[3],current_date-8,42.5,'repas','Repas chantier equipe','validee',38.64,3.86,10,'EUR','carte_personnelle','[PILOTE] Fixture',current_date::timestamptz-interval '7 days',current_date::timestamptz-interval '6 days',v_employes[4],now()-interval '8 days',now()-interval '6 days'),
      (v_entreprise,v_employes[8],v_chantiers[4],current_date-6,65,'carburant','Plein vehicule chantier','validee',54.17,10.83,20,'EUR','carte_personnelle','[PILOTE] Fixture',current_date::timestamptz-interval '5 days',current_date::timestamptz-interval '4 days',v_employes[5],now()-interval '6 days',now()-interval '4 days'),
      (v_entreprise,v_employes[11],v_chantiers[3],current_date-5,12.3,'peage','Peage A7','remboursee',10.25,2.05,20,'EUR','carte_personnelle','[PILOTE] Fixture',current_date::timestamptz-interval '4 days',current_date::timestamptz-interval '3 days',v_employes[4],now()-interval '5 days',now()-interval '2 days'),
      (v_entreprise,v_employes[14],v_chantiers[4],current_date-4,89,'petit_materiel','Achat consommables urgents','soumise',74.17,14.83,20,'EUR','carte_personnelle','[PILOTE] Fixture - en attente de validation',current_date::timestamptz-interval '3 days',null,null,now()-interval '4 days',now()-interval '3 days'),
      (v_entreprise,v_employes[17],v_chantiers[5],current_date-3,18,'stationnement','Parking chantier centre-ville','soumise',15,3,20,'EUR','carte_personnelle','[PILOTE] Fixture - en attente de validation',current_date::timestamptz-interval '2 days',null,null,now()-interval '3 days',now()-interval '2 days'),
      (v_entreprise,v_employes[9],v_chantiers[5],current_date-15,140,'achat_chantier','Achat non budgete hors procedure','refusee',116.67,23.33,20,'EUR','carte_personnelle','[PILOTE] Fixture - refusee (hors procedure achats)',current_date::timestamptz-interval '14 days',current_date::timestamptz-interval '12 days',v_employes[1],now()-interval '15 days',now()-interval '12 days');
  end if;

  -- 12) Conges : approuves, refuse, soumis (en attente).
  if not exists(select 1 from public.demandes_conges where entreprise_id=v_entreprise and commentaire like '[PILOTE]%') then
    insert into public.demandes_conges(entreprise_id,employe_id,type_conge,date_debut,date_fin,commentaire,statut,motif_decision,decide_par,decide_at,soumis_at,created_by,created_at,updated_at) values
      (v_entreprise,v_employes[12],'conges_payes',current_date+20,current_date+27,'[PILOTE] Fixture','approuvee','Accorde',v_employes[4],now()-interval '3 days',now()-interval '5 days',v_employes[12],now()-interval '5 days',now()-interval '3 days'),
      (v_entreprise,v_employes[15],'rtt',current_date+5,current_date+5,'[PILOTE] Fixture','approuvee','Accorde',v_employes[5],now()-interval '2 days',now()-interval '4 days',v_employes[15],now()-interval '4 days',now()-interval '2 days'),
      (v_entreprise,v_employes[18],'conges_payes',current_date+15,current_date+15,'[PILOTE] Fixture - periode chargee','refusee','Periode deja complete sur le chantier',v_employes[6],now()-interval '1 days',now()-interval '3 days',v_employes[18],now()-interval '3 days',now()-interval '1 days'),
      (v_entreprise,v_employes[19],'sans_solde',current_date+40,current_date+44,'[PILOTE] Fixture - en attente de decision','soumise',null,null,null,now()-interval '1 days',v_employes[19],now()-interval '1 days',now()-interval '1 days');
  end if;

  -- Resume.
  insert into pilote_btp_resultat
  select v_entreprise,e.nom,jsonb_build_object(
    'roles',(select count(*) from public.postes where entreprise_id=v_entreprise),
    'employes',(select count(*) from public.employes where entreprise_id=v_entreprise),
    'clients',(select count(*) from public.clients where entreprise_id=v_entreprise),
    'chantiers',(select count(*) from public.chantiers where entreprise_id=v_entreprise),
    'devis',(select count(*) from public.devis where entreprise_id=v_entreprise),
    'factures',(select count(*) from public.factures where entreprise_id=v_entreprise),
    'affectations',(select count(*) from public.affectations where entreprise_id=v_entreprise),
    'pointages',(select count(*) from public.pointages where entreprise_id=v_entreprise),
    'fournisseurs',(select count(*) from public.fournisseurs where entreprise_id=v_entreprise),
    'articles_stock',(select count(*) from public.articles_stock where entreprise_id=v_entreprise),
    'commandes',(select count(*) from public.commandes_fournisseurs where entreprise_id=v_entreprise),
    'notes_frais',(select count(*) from public.notes_frais where entreprise_id=v_entreprise),
    'demandes_conges',(select count(*) from public.demandes_conges where entreprise_id=v_entreprise)
  ) from public.entreprises e where e.id=v_entreprise;
end;$pilote$;

select entreprise_id as "ID entreprise",entreprise as "Entreprise pilote",resume as "Donnees creees" from pilote_btp_resultat;
