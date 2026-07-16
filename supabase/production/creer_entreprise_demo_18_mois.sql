-- Entreprise de demonstration Liria Gestion Pro - 18 mois d'activite.
-- Script idempotent reserve au projet de demonstration. Ne modifie aucune entreprise cliente.
-- Les cartes BTP sont des references fictives et l'interface rappelle qu'elles ne remplacent pas l'original CIBTP.

set statement_timeout='15min';

create temp table if not exists demo_18m_resultat(entreprise_id uuid,entreprise text,code text,resume jsonb);
truncate table demo_18m_resultat;

do $demo$
declare
  v_entreprise uuid;v_poste uuid;v_client uuid;v_chantier uuid;v_employe uuid;v_devis uuid;v_facture uuid;
  v_clients uuid[];v_chantiers uuid[];v_employes uuid[];v_fournisseurs uuid[];v_date date;v_total numeric;
  v_i integer;v_mois integer;v_jour integer;v_semaine integer;v_index integer:=0;v_affectation uuid;v_statut text;
  v_roles text[][]:=array[
    array['Administrateur','tous'],
    array['Conducteur de travaux','acces_clients,gerer_clients,acces_chantiers,gerer_chantiers,acces_devis,gerer_devis,acces_factures,acces_planning,gerer_planning,acces_employes,acces_pointage,gerer_pointage,valider_pointages,voir_heures_chantiers,voir_indicateurs_financiers,acces_achats,acces_stock,acces_flotte,acces_outillage,acces_rentabilite'],
    array['Chef de chantier','acces_chantiers,gerer_chantiers,acces_planning,gerer_planning,acces_employes,acces_pointage,gerer_pointage,valider_pointages,voir_heures_chantiers,acces_stock,acces_outillage,acces_flotte'],
    array['Chef d''equipe','acces_chantiers,acces_planning,acces_pointage,saisir_son_pointage,valider_pointages,voir_heures_chantiers,acces_stock,acces_outillage,utiliser_borne_stock,effectuer_entree_stock,effectuer_sortie_stock'],
    array['Ouvrier','acces_chantiers,acces_planning,acces_pointage,saisir_son_pointage,saisir_ses_notes_frais,demander_ses_conges,acces_stock,acces_outillage,utiliser_borne_stock,effectuer_sortie_stock'],
    array['Comptable','acces_clients,acces_devis,acces_factures,gerer_factures,acces_achats,gerer_achats,acces_notes_frais,gerer_notes_frais,verifier_notes_frais,acces_rentabilite,voir_indicateurs_financiers,acces_exports,gerer_exports'],
    array['Responsable RH','acces_employes,gerer_employes,acces_planning,acces_pointage,valider_pointages,gerer_conges,voir_heures_chantiers']
  ];
  v_prenoms text[]:=array['Lucas','Emma','Hugo','Lea','Nathan','Ines','Louis','Chloe','Arthur','Sarah','Theo','Manon'];
  v_noms text[]:=array['Morel','Bernard','Petit','Durand','Robert','Simon','Laurent','Michel','Garcia','Leroy','Roux','Fournier'];
  v_postes text[]:=array['Administrateur','Conducteur de travaux','Chef de chantier','Chef d''equipe','Ouvrier','Ouvrier','Ouvrier','Ouvrier','Comptable','Responsable RH','Chef d''equipe','Ouvrier'];
begin
  select id into v_entreprise from public.entreprises where reference_interne='DEMO-18M' limit 1;
  if v_entreprise is null then
    insert into public.entreprises(
      reference_interne,nom,raison_sociale,siret,adresse,code_postal,ville,abonnement_statut,
      abonnement_echeance,abonnement_note,created_at,updated_at
    ) values(
      'DEMO-18M','Liria Gestion Pro - Entreprise Demo','LGP Demonstration SAS','99999999999999',
      '18 avenue des Artisans','69000','Lyon','actif',current_date+365,
      'Entreprise fictive - 18 mois d historique pour tester tous les roles',now()-interval '18 months',now()
    ) returning id into v_entreprise;
  else
    update public.entreprises set abonnement_statut='actif',abonnement_echeance=current_date+365,
      abonnement_note='Entreprise fictive - 18 mois d historique pour tester tous les roles',updated_at=now()
    where id=v_entreprise;
  end if;

  -- Profils d'acces clairement distincts.
  for v_i in 1..array_length(v_roles,1) loop
    insert into public.postes(entreprise_id,nom,code_offre,tarif_compte_mensuel)
    values(v_entreprise,v_roles[v_i][1],case when v_roles[v_i][1] in ('Administrateur','Conducteur de travaux') then 'premium' else 'standard' end,
      case when v_roles[v_i][1]='Administrateur' then 35 when v_roles[v_i][1]='Conducteur de travaux' then 25 else 12 end)
    on conflict(entreprise_id,nom) do update set code_offre=excluded.code_offre,tarif_compte_mensuel=excluded.tarif_compte_mensuel;
    select id into v_poste from public.postes where entreprise_id=v_entreprise and nom=v_roles[v_i][1];
    if v_roles[v_i][2]='tous' then
      insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
      select v_entreprise,v_poste,cle,true from public.permissions_disponibles
      on conflict(entreprise_id,poste_id,cle_permission) do update set autorise=true;
    else
      insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
      select v_entreprise,v_poste,p.cle,p.cle=any(string_to_array(v_roles[v_i][2],','))
      from public.permissions_disponibles p
      on conflict(entreprise_id,poste_id,cle_permission) do update set autorise=excluded.autorise;
    end if;
  end loop;

  -- Equipe fictive avec portraits synthetiques, Carte BTP et profils applicatifs.
  for v_i in 1..12 loop
    select id into v_poste from public.postes where entreprise_id=v_entreprise and nom=v_postes[v_i];
    insert into public.employes(
      entreprise_id,reference_interne,prenom,nom,email,telephone,poste,poste_id,type_contrat,date_entree,
      taux_horaire,cout_horaire,statut,notes,carte_btp_numero,carte_btp_expiration,photo_url,created_at
    ) values(
      v_entreprise,'DEMO-EMP-'||lpad(v_i::text,3,'0'),v_prenoms[v_i],v_noms[v_i],
      'demo.'||v_i||'@example.test','060100'||lpad(v_i::text,4,'0'),v_postes[v_i],v_poste,
      case when v_i in(6,12) then 'apprenti' else 'cdi' end,current_date-(560+v_i*19),
      48+v_i,24+v_i*1.4,'actif','[DEMO 18M] Salarie fictif - aucune donnee personnelle reelle',
      'BTP-DEMO-'||to_char(current_date,'YYYY')||'-'||lpad(v_i::text,5,'0'),current_date+365+(v_i*17),
      '/demo/employes/portrait-'||lpad((((v_i-1)%6)+1)::text,2,'0')||'.png',now()-interval '18 months'
    ) on conflict(entreprise_id,reference_interne) do update set
      poste=excluded.poste,poste_id=excluded.poste_id,carte_btp_numero=excluded.carte_btp_numero,
      carte_btp_expiration=excluded.carte_btp_expiration,photo_url=excluded.photo_url,statut='actif',updated_at=now();
  end loop;
  select array_agg(id order by reference_interne) into v_employes from public.employes where entreprise_id=v_entreprise and reference_interne like 'DEMO-EMP-%';
  delete from public.habilitations_employe where entreprise_id=v_entreprise and employe_id=any(v_employes);
  for v_i in 1..array_length(v_employes,1) loop
    insert into public.habilitations_employe(entreprise_id,employe_id,type,libelle,date_obtention,date_expiration)
    values(v_entreprise,v_employes[v_i],'caces',case when v_i%3=0 then 'CACES R486 - PEMP' when v_i%3=1 then 'CACES R489 - Chariot elevateur' else 'CACES R482 - Engins de chantier' end,current_date-500,current_date+230+(v_i*13));
    if v_i%2=0 then insert into public.habilitations_employe(entreprise_id,employe_id,type,libelle,date_obtention,date_expiration) values(v_entreprise,v_employes[v_i],'travail_hauteur','Travail en hauteur et port du harnais',current_date-420,current_date+310);end if;
    if v_i in(2,3,4,11) then insert into public.habilitations_employe(entreprise_id,employe_id,type,libelle,date_obtention,date_expiration) values(v_entreprise,v_employes[v_i],'sst','Sauveteur secouriste du travail',current_date-300,current_date+430);end if;
    if v_i in(2,3) then insert into public.habilitations_employe(entreprise_id,employe_id,type,libelle,date_obtention,date_expiration) values(v_entreprise,v_employes[v_i],'habilitation_electrique','Habilitation BS BE Manoeuvre',current_date-260,current_date+470);end if;
  end loop;

  -- Clients et chantiers etales sur 18 mois.
  for v_i in 1..30 loop
    insert into public.clients(entreprise_id,reference_interne,type,nom,prenom,societe,raison_sociale,adresse_facturation,code_postal,ville,telephone,email,conditions_paiement,statut,notes,created_at)
    values(v_entreprise,'DEMO-CLI-'||lpad(v_i::text,3,'0'),case when v_i%3=0 then 'professionnel' else 'particulier' end,
      case when v_i%3=0 then null else (array['Martin','Bernard','Dubois','Thomas','Robert','Richard','Petit','Durand','Leroy','Moreau'])[1+((v_i-1)%10)] end,
      case when v_i%3=0 then null else (array['Camille','Thomas','Julie','Nicolas','Sophie','Alexandre','Emilie','Maxime','Laura','Julien'])[1+((v_i-1)%10)] end,
      case when v_i%3=0 then 'Societe Demo '||v_i else null end,case when v_i%3=0 then 'Societe Demo '||v_i else null end,
      (10+v_i)||' rue de la Construction','69'||lpad((100+v_i)::text,3,'0'),'Lyon','047800'||lpad(v_i::text,4,'0'),'client.'||v_i||'@example.test','30 jours','actif','[DEMO 18M] Client fictif',now()-interval '18 months')
    on conflict(entreprise_id,reference_interne) do nothing;
  end loop;
  select array_agg(id order by reference_interne) into v_clients from public.clients where entreprise_id=v_entreprise and reference_interne like 'DEMO-CLI-%';
  for v_i in 1..30 loop
    insert into public.chantiers(entreprise_id,reference_interne,client_id,nom,adresse,code_postal,ville,statut,date_debut_prevue,date_fin_prevue,date_debut_reelle,date_fin_reelle,budget_previsionnel,created_at)
    values(v_entreprise,'DEMO-CHA-'||lpad(v_i::text,3,'0'),v_clients[v_i],
      (array['Amenagement bureaux','Cloisons amovibles','Cabines sanitaires','Renovation accueil','Panneaux decoratifs','Sol stratifie'])[1+((v_i-1)%6)]||' - Projet '||v_i,
      (40+v_i)||' avenue du Batiment','69'||lpad((200+v_i)::text,3,'0'),'Lyon',
      case when v_i<=18 then 'facture' when v_i<=23 then 'termine' when v_i<=27 then 'en_cours' else 'accepte' end,
      (date_trunc('month',current_date)-interval '17 months')::date+(v_i-1)*17,
      (date_trunc('month',current_date)-interval '17 months')::date+(v_i-1)*17+45,
      (date_trunc('month',current_date)-interval '17 months')::date+(v_i-1)*17,
      case when v_i<=23 then (date_trunc('month',current_date)-interval '17 months')::date+(v_i-1)*17+42 else null end,
      8500+v_i*1350,now()-interval '18 months')
    on conflict(entreprise_id,reference_interne) do update set statut=excluded.statut,budget_previsionnel=excluded.budget_previsionnel;
  end loop;
  select array_agg(id order by reference_interne) into v_chantiers from public.chantiers where entreprise_id=v_entreprise and reference_interne like 'DEMO-CHA-%';

  -- Equipes permanentes de chantier.
  delete from public.equipes_chantiers where entreprise_id=v_entreprise;
  for v_i in 1..array_length(v_chantiers,1) loop
    insert into public.equipes_chantiers(entreprise_id,chantier_id,employe_id,role_chantier,date_debut,note)
    values(v_entreprise,v_chantiers[v_i],v_employes[2],'conducteur_travaux',current_date-540,'[DEMO 18M] Encadrement'),
      (v_entreprise,v_chantiers[v_i],v_employes[3+(v_i%2)],case when v_i%2=0 then 'chef_chantier' else 'chef_equipe' end,current_date-540,'[DEMO 18M] Responsable terrain'),
      (v_entreprise,v_chantiers[v_i],v_employes[5+((v_i-1)%4)],'ouvrier',current_date-540,'[DEMO 18M] Equipe de pose');
  end loop;

  -- 108 devis, factures et paiements sur 18 mois.
  for v_mois in 0..17 loop
    for v_jour in 1..6 loop
      v_index:=v_index+1;v_date:=(date_trunc('month',current_date)-interval '17 months'+make_interval(months=>v_mois))::date+(v_jour-1)*4+1;
      v_chantier:=v_chantiers[1+((v_index-1)%array_length(v_chantiers,1))];
      v_statut:=case when v_jour<=4 then 'accepte' when v_jour=5 then 'envoye' else 'refuse' end;
      if not exists(select 1 from public.devis where entreprise_id=v_entreprise and numero='DEV-DEMO-'||to_char(v_date,'YYYYMM')||'-'||lpad(v_index::text,3,'0')) then
        insert into public.devis(entreprise_id,numero,client_id,chantier_id,statut,date_emission,date_validite,conditions,notes_client,notes_internes,created_at)
        select v_entreprise,'DEV-DEMO-'||to_char(v_date,'YYYYMM')||'-'||lpad(v_index::text,3,'0'),c.client_id,v_chantier,v_statut,v_date,v_date+30,'Validite 30 jours - acompte 30 %','Merci pour votre confiance.','[DEMO 18M] Historique fictif',v_date::timestamptz+interval '9 hours' from public.chantiers c where c.id=v_chantier returning id into v_devis;
        insert into public.lignes_devis(devis_id,designation,description,type,quantite,unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre) values
          (v_devis,'Pose et main d oeuvre','Preparation, implantation et pose','main_oeuvre',24+(v_index%18),'h',55,0,20,1),
          (v_devis,'Fournitures chantier','Profiles, panneaux, fixations','fourniture',12+(v_index%12),'u',115,0,20,2),
          (v_devis,'Protection et nettoyage','Forfait chantier','forfait',1,'forfait',350,0,20,3);
        if v_statut='accepte' then
          insert into public.factures(entreprise_id,numero,client_id,chantier_id,devis_origine_id,type,statut,date_emission,date_echeance,notes_client,notes_internes,created_at)
          select v_entreprise,'FAC-DEMO-'||to_char(v_date+7,'YYYYMM')||'-'||lpad(v_index::text,3,'0'),d.client_id,d.chantier_id,d.id,case when v_index%6=0 then 'acompte' else 'simple' end,'envoyee',v_date+7,v_date+37,'Paiement par virement ou carte en ligne.','[DEMO 18M] Facture fictive',(v_date+7)::timestamptz+interval '10 hours' from public.devis d where d.id=v_devis returning id into v_facture;
          insert into public.lignes_factures(facture_id,designation,description,type,quantite,unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre)
          select v_facture,designation,description,type,quantite,unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre from public.lignes_devis where devis_id=v_devis;
          select montant_ttc into v_total from public.factures where id=v_facture;
          if v_index%5<>0 then insert into public.paiements(facture_id,montant,date,mode,reference,created_at) values(v_facture,case when v_index%7=0 then round(v_total*.4,2) else v_total end,v_date+18,case when v_index%4=0 then 'carte_en_ligne' when v_index%4=1 then 'cb' else 'virement' end,'DEMO-REG-'||lpad(v_index::text,4,'0'),(v_date+18)::timestamptz+interval '12 hours');end if;
        end if;
      end if;
    end loop;
  end loop;

  -- Planning et pointages valides sur 78 semaines.
  if not exists(select 1 from public.affectations where entreprise_id=v_entreprise and tache like '[DEMO 18M]%') then
    for v_semaine in 0..77 loop for v_jour in 0..4 loop
      v_date:=date_trunc('week',current_date)::date-78*7+v_semaine*7+v_jour;
      for v_i in 3..8 loop
        v_employe:=v_employes[v_i];v_chantier:=v_chantiers[1+((v_semaine+v_jour+v_i-1)%array_length(v_chantiers,1))];
        insert into public.affectations(entreprise_id,chantier_id,employe_id,date,heures,tache,notes,type_activite,created_at)
        values(v_entreprise,v_chantier,v_employe,v_date,case when v_jour=4 then 7 else 8 end,'[DEMO 18M] Pose et finitions','Planning fictif','chantier',v_date::timestamptz+interval '6 hours') returning id into v_affectation;
        insert into public.pointages(entreprise_id,employe_id,chantier_id,date,heures_normales,heures_supplementaires,pause_minutes,tache,commentaire,latitude,longitude,precision_metres,verification_statut,verification_at,affectation_id,heures_attendues,origine_pointage,created_at,updated_at)
        values(v_entreprise,v_employe,v_chantier,v_date,case when v_jour=4 then 7 else 8 end,case when (v_i+v_semaine)%11=0 then .5 else 0 end,45,'[DEMO 18M] Travail realise','Historique GPS fictif',45.764+(v_i::numeric/10000),4.8357+(v_jour::numeric/10000),10+(v_i%6),'valide',v_date::timestamptz+interval '18 hours',v_affectation,case when v_jour=4 then 7 else 8 end,'gps_complet',v_date::timestamptz+interval '18 hours',v_date::timestamptz+interval '18 hours');
      end loop;
    end loop;end loop;
  end if;

  -- Fournisseurs, stock, vehicules et outillage.
  for v_i in 1..8 loop
    insert into public.fournisseurs(entreprise_id,reference,nom,contact_nom,email,telephone,adresse,code_postal,ville,notes,actif)
    values(v_entreprise,'DEMO-FRN-'||lpad(v_i::text,3,'0'),(array['Wurth','Foussier','SIEHR','Espace Aubade','PROVITRAGE','Rexel','Point.P','Kiloutou'])[v_i],'Service professionnel','demo-fournisseur-'||v_i||'@example.test','040000'||lpad(v_i::text,4,'0'),v_i||' rue des Fournisseurs','69000','Lyon','[DEMO 18M] Compte fournisseur fictif',true)
    on conflict(entreprise_id,reference) do update set nom=excluded.nom,actif=true;
  end loop;
  select array_agg(id order by reference) into v_fournisseurs from public.fournisseurs where entreprise_id=v_entreprise and reference like 'DEMO-FRN-%';
  for v_i in 1..30 loop
    insert into public.articles_stock(entreprise_id,reference,designation,unite,quantite_stock,seuil_alerte,prix_achat_ht,prix_vente_ht,emplacement,actif)
    values(v_entreprise,'DEMO-STK-'||lpad(v_i::text,3,'0'),(array['Plaque BA13','Rail 48','Montant 48','Vis placo','Bande a joint','Enduit','Laine minerale','Profile aluminium','Panneau stratifie','Silicone'])[1+((v_i-1)%10)]||' '||v_i,case when v_i%3=0 then 'ml' else 'u' end,40+(v_i%7)*10,12,5+v_i*1.7,9+v_i*2.4,'Depot - Zone '||chr(65+((v_i-1)%5)),true)
    on conflict(entreprise_id,reference) do update set quantite_stock=excluded.quantite_stock,prix_achat_ht=excluded.prix_achat_ht,prix_vente_ht=excluded.prix_vente_ht,actif=true;
  end loop;
  for v_i in 1..8 loop
    insert into public.vehicules(entreprise_id,immatriculation,marque,modele,type,statut,date_mise_circulation,kilometrage,controle_technique_echeance,assurance_echeance,prochain_entretien_date,notes,created_at)
    values(v_entreprise,'DE-'||lpad((100+v_i)::text,3,'0')||'-MO','Renault',case when v_i%2=0 then 'Master' else 'Trafic' end,'utilitaire','actif',current_date-(900+v_i*80),28000+v_i*7300,current_date+120+v_i*10,current_date+200,current_date+60+v_i*8,'[DEMO 18M] Vehicule fictif',now()-interval '18 months')
    on conflict(entreprise_id,immatriculation) do update set kilometrage=excluded.kilometrage,statut='actif';
  end loop;
  for v_i in 1..24 loop
    insert into public.outils(entreprise_id,reference,designation,categorie,marque,modele,numero_serie,statut,etat,employe_id,date_achat,prix_achat_ht,prochaine_verification,notes,created_at)
    values(v_entreprise,'DEMO-OUT-'||lpad(v_i::text,3,'0'),(array['Perforateur','Visseuse','Laser','Scie circulaire','Aspirateur chantier','Meuleuse'])[1+((v_i-1)%6)],case when v_i%6=3 then 'mesure' else 'electroportatif' end,(array['Bosch Pro','Makita','Hilti','DeWalt'])[1+((v_i-1)%4)],'Modele '||v_i,'DEMOSN'||lpad(v_i::text,5,'0'),'affecte',case when v_i%5=0 then 'usage' else 'bon' end,v_employes[3+((v_i-1)%6)],current_date-(400+v_i*7),180+v_i*22,current_date+90+v_i*5,'[DEMO 18M] Outil fictif',now()-interval '18 months')
    on conflict(entreprise_id,reference) do update set employe_id=excluded.employe_id,statut='affecte',etat=excluded.etat;
  end loop;

  insert into demo_18m_resultat
  select v_entreprise,e.nom,e.code_adhesion,jsonb_build_object(
    'anciennete_mois',18,'roles',(select count(*) from public.postes where entreprise_id=v_entreprise),
    'employes',(select count(*) from public.employes where entreprise_id=v_entreprise),
    'habilitations',(select count(*) from public.habilitations_employe where entreprise_id=v_entreprise),
    'clients',(select count(*) from public.clients where entreprise_id=v_entreprise),
    'chantiers',(select count(*) from public.chantiers where entreprise_id=v_entreprise),
    'devis',(select count(*) from public.devis where entreprise_id=v_entreprise),
    'factures',(select count(*) from public.factures where entreprise_id=v_entreprise),
    'pointages',(select count(*) from public.pointages where entreprise_id=v_entreprise),
    'articles_stock',(select count(*) from public.articles_stock where entreprise_id=v_entreprise),
    'vehicules',(select count(*) from public.vehicules where entreprise_id=v_entreprise),
    'outils',(select count(*) from public.outils where entreprise_id=v_entreprise)
  ) from public.entreprises e where e.id=v_entreprise;
end;$demo$;

select entreprise_id as "ID entreprise",entreprise as "Entreprise test",code as "Code entreprise",resume as "Donnees creees" from demo_18m_resultat;
