-- Données de recette réservées à l'entreprise « Entreprise Test ».
--
-- Ce script :
--   1. réactive uniquement l'abonnement de l'entreprise de recette ;
--   2. conserve tous les comptes et mots de passe existants ;
--   3. ajoute cinq exercices cohérents de devis, factures, règlements, planning,
--      pointages, stock, commandes, achats, frais, congés, paie et kilométrages.
--
-- Il refuse de s'exécuter si l'entreprise ou un compte membre n'est pas trouvé.
-- Il ne modifie aucune autre entreprise. Les données qu'il crée portent le
-- marqueur [RECETTE 5A] et peuvent être régénérées sans doublon.

set statement_timeout = '10min';

create temp table if not exists entreprise_test_seed_resultat (
  entreprise text,
  email_connexion text,
  code_entreprise text,
  resume jsonb
);
truncate table entreprise_test_seed_resultat;

do $seed$
declare
  v_entreprise uuid;
  v_admin uuid;
  v_admin_poste uuid;
  v_email text;
  v_code text;
  v_clients uuid[];
  v_chantiers uuid[];
  v_employes uuid[];
  v_fournisseurs uuid[];
  v_vehicules uuid[];
  v_devis uuid;
  v_facture uuid;
  v_commande uuid;
  v_depense uuid;
  v_affectation uuid;
  v_date date;
  v_statut text;
  v_total numeric;
  v_mois integer;
  v_jour integer;
  v_i integer;
  v_index integer := 0;
  v_semaine integer;
  v_km integer;
  v_article uuid;
  v_fournisseur uuid;
  v_chantier uuid;
  v_employe uuid;
  v_vehicule uuid;
  v_resume jsonb;
  v_debut date;
  v_periode uuid;
  v_dossier uuid;
  v_contrat uuid;
  v_sous_traitants uuid[];
begin
  v_debut := (date_trunc('month', current_date) - interval '59 months')::date;
  select e.id, e.code_adhesion
  into v_entreprise, v_code
  from public.entreprises e
  where lower(btrim(e.nom)) = 'entreprise test'
     or lower(coalesce(e.raison_sociale,'')) = 'entreprise test'
  order by case when lower(btrim(e.nom)) = 'entreprise test' then 0 else 1 end, e.created_at
  limit 1;

  if v_entreprise is null then
    raise exception 'Entreprise de test « entreprise test » introuvable : aucune donnée n''a été modifiée';
  end if;

  select p.id into v_admin_poste
  from public.postes p
  where p.entreprise_id = v_entreprise
    and (lower(p.nom) like '%admin%' or lower(p.nom) like U&'%g\00E9rant%' or lower(p.nom) like '%gerant%')
  order by case when lower(p.nom) like '%admin%' then 0 else 1 end, p.created_at
  limit 1;

  select ue.utilisateur_id, au.email
  into v_admin, v_email
  from public.utilisateurs_entreprises ue
  join auth.users au on au.id = ue.utilisateur_id
  left join public.postes p on p.id = ue.poste_id
  where ue.entreprise_id = v_entreprise
  order by
    case when ue.poste_id = v_admin_poste then 0 else 1 end,
    case when lower(coalesce(au.email,'')) like '%entreprise test%' then 0 else 1 end,
    ue.created_at
  limit 1;

  if v_admin is null or v_email is null then
    raise exception 'Aucun compte de connexion existant n''est rattaché à entreprise test : aucune donnée n''a été modifiée';
  end if;

  -- Réactivation de l'entreprise de recette, sans modifier les identifiants.
  update public.entreprises
  set abonnement_statut = 'actif',
      abonnement_echeance = current_date + 365,
      abonnement_note = U&'Compte de recette Entreprise Test \2014 historique complet sur cinq exercices',
      created_at = least(created_at,v_debut::timestamptz-interval '6 months'),
      impaye_signale_at = null,
      suspension_prevue_at = null,
      impaye_message = null,
      dernier_reglement_at = now(),
      updated_at = now()
  where id = v_entreprise;

  update public.utilisateurs_entreprises
  set statut = 'actif', poste_id = coalesce(v_admin_poste, poste_id)
  where utilisateur_id = v_admin and entreprise_id = v_entreprise;

  update public.utilisateurs
  set entreprise_active_id = v_entreprise
  where id = v_admin;

  update public.employes
  set statut = case when statut in ('sorti','suspendu') then 'actif' else statut end,
      compte_application_statut = 'actif',
      compte_application_ouvert_at = coalesce(compte_application_ouvert_at, now()),
      compte_application_ferme_at = null,
      compte_active_at = coalesce(compte_active_at, now()),
      premiere_connexion_at = coalesce(premiere_connexion_at, v_debut::timestamptz),
      derniere_connexion_at = now(),
      application_installee_at = coalesce(application_installee_at, v_debut::timestamptz),
      updated_at = now()
  where entreprise_id = v_entreprise and utilisateur_id = v_admin;

  if v_admin_poste is not null then
    insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
    select v_entreprise,v_admin_poste,d.cle,true
    from public.permissions_disponibles d
    on conflict(entreprise_id,poste_id,cle_permission)
    do update set autorise = true;
  end if;

  -- Portefeuille de cinq années, sans toucher aux données déjà présentes.
  for v_i in 1..60 loop
    insert into public.clients(
      entreprise_id,reference_interne,type,nom,prenom,societe,raison_sociale,
      adresse_facturation,code_postal,ville,telephone,email,conditions_paiement,statut,notes,created_at
    ) values (
      v_entreprise,'TST5-CLI-'||lpad(v_i::text,3,'0'),
      case when v_i % 3 = 0 then 'professionnel' else 'particulier' end,
      case when v_i % 3 = 0 then null else (array['Martin','Bernard','Petit','Robert','Richard','Durand','Dubois','Moreau','Laurent','Simon'])[1+((v_i-1)%10)] end,
      case when v_i % 3 = 0 then null else (array['Camille','Thomas','Julie','Nicolas','Sophie','Alexandre',U&'\00C9milie','Maxime','Laura','Julien'])[1+((v_i-1)%10)] end,
      case when v_i % 3 = 0 then U&'Soci\00E9t\00E9 D\00E9mo '||v_i else null end,
      case when v_i % 3 = 0 then U&'Soci\00E9t\00E9 D\00E9mo '||v_i else null end,
      (10+v_i)||U&' rue de la R\00E9publique','69'||lpad((100+v_i)::text,3,'0'),'Lyon',
      '060000'||lpad(v_i::text,4,'0'),'client.'||v_i||'@example.test','30 jours','actif',U&'[RECETTE 5A] Client de recette',
      v_debut::timestamptz - interval '2 months' + make_interval(days=>v_i)
    ) on conflict(entreprise_id,reference_interne) do nothing;

    insert into public.chantiers(
      entreprise_id,reference_interne,client_id,nom,adresse,code_postal,ville,statut,
      date_debut_prevue,date_fin_prevue,date_debut_reelle,budget_previsionnel,created_at
    )
    select v_entreprise,'TST5-CHA-'||lpad(v_i::text,3,'0'),c.id,
      (array[U&'R\00E9novation bureaux','Cloisons amovibles','Cabines sanitaires','Agencement accueil',U&'Pose sol stratifi\00E9'])[1+((v_i-1)%5)]||U&' \2014 D\00E9mo '||v_i,
      (30+v_i)||' avenue des Artisans','69'||lpad((200+v_i)::text,3,'0'),'Lyon',
      case when v_i <= 38 then 'facture' when v_i <= 50 then 'en_cours' when v_i <= 56 then 'accepte' else 'prospect' end,
      v_debut + ((v_i-1)*30),
      v_debut + ((v_i-1)*30+45),
      case when v_i <= 50 then v_debut + ((v_i-1)*30) else null end,
      6500 + v_i*850, v_debut::timestamptz + make_interval(days=>((v_i-1)*30))
    from public.clients c
    where c.entreprise_id=v_entreprise and c.reference_interne='TST5-CLI-'||lpad(v_i::text,3,'0')
    on conflict(entreprise_id,reference_interne) do nothing;
  end loop;

  select array_agg(id order by created_at,id) into v_clients
  from public.clients where entreprise_id=v_entreprise;
  select array_agg(id order by created_at,id) into v_chantiers
  from public.chantiers where entreprise_id=v_entreprise;
  select array_agg(id order by created_at,id) into v_employes
  from public.employes where entreprise_id=v_entreprise and statut in ('actif','en_conge');

  if coalesce(array_length(v_clients,1),0)=0 or coalesce(array_length(v_chantiers,1),0)=0 then
    raise exception 'Le jeu clients/chantiers de entreprise test n''a pas pu être préparé';
  end if;
  if coalesce(array_length(v_employes,1),0)=0 then
    raise exception 'Aucun employé actif dans entreprise test : le seed a été annulé';
  end if;

  -- Nettoyage ciblé des données d'une éventuelle exécution précédente.
  delete from public.pointages where entreprise_id=v_entreprise and tache like '[RECETTE 5A]%';
  delete from public.affectations where entreprise_id=v_entreprise and tache like '[RECETTE 5A]%';
  delete from public.demandes_conges where entreprise_id=v_entreprise and commentaire like '[RECETTE 5A]%';
  delete from public.notes_frais where entreprise_id=v_entreprise and description like '[RECETTE 5A]%';
  delete from public.depenses_fournisseurs where entreprise_id=v_entreprise and notes like '[RECETTE 5A]%';
  delete from public.commandes_fournisseurs where entreprise_id=v_entreprise and notes like '[RECETTE 5A]%';
  delete from public.factures where entreprise_id=v_entreprise and notes_internes like '[RECETTE 5A]%';
  delete from public.devis where entreprise_id=v_entreprise and notes_internes like '[RECETTE 5A]%';
  delete from public.mouvements_stock where entreprise_id=v_entreprise and motif like '[RECETTE 5A]%';
  delete from public.interventions where entreprise_id=v_entreprise and description like '[RECETTE 5A]%';
  delete from public.contrats_entretien where entreprise_id=v_entreprise and description like '[RECETTE 5A]%';
  delete from public.sous_traitants_chantiers where entreprise_id=v_entreprise and notes like '[RECETTE 5A]%';
  delete from public.validations_paie where entreprise_id=v_entreprise and commentaire like '[RECETTE 5A]%';
  delete from public.temps_travail_paie where entreprise_id=v_entreprise and source_type='seed_entreprise_test_5_ans';
  delete from public.absences_paie where entreprise_id=v_entreprise and source_type='seed_entreprise_test_5_ans';
  delete from public.primes_paie where entreprise_id=v_entreprise and source_type='seed_entreprise_test_5_ans';
  delete from public.indemnites_deplacement_paie where entreprise_id=v_entreprise and source_type='seed_entreprise_test_5_ans';

  -- 300 devis sur cinq ans, dont 180 acceptés et facturés.
  v_index := 0;
  for v_mois in 0..59 loop
    for v_jour in 1..5 loop
      v_index := v_index + 1;
      v_date := (v_debut + make_interval(months=>v_mois))::date + (v_jour-1)*5 + 1;
      v_chantier := v_chantiers[1+((v_index-1)%array_length(v_chantiers,1))];
      v_statut := case when v_jour<=3 then 'accepte' when v_jour=4 then 'envoye' when v_index%2=0 then 'refuse' else 'brouillon' end;

      insert into public.devis(
        entreprise_id,numero,client_id,chantier_id,statut,date_emission,date_validite,
        conditions,notes_client,notes_internes,remise_globale,created_at
      )
      select v_entreprise,'DEV-TST5-'||to_char(v_date,'YYYYMM')||'-'||lpad(v_index::text,3,'0'),
        c.client_id,v_chantier,v_statut,v_date,v_date+30,U&'Validit\00E9 30 jours \2014 acompte de 30 % \00E0 la commande',
        'Merci pour votre confiance.',U&'[RECETTE 5A] Historique de d\00E9monstration',case when v_index%9=0 then 5 else 0 end,
        v_date::timestamptz + interval '9 hours'
      from public.chantiers c where c.id=v_chantier
      returning id into v_devis;

      insert into public.lignes_devis(devis_id,designation,description,type,quantite,unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre)
      values
        (v_devis,(array['Pose cloisons amovibles',U&'Agencement int\00E9rieur sur mesure',U&'Cr\00E9ation cabine sanitaire',U&'Pose panneaux d\00E9coratifs'])[1+((v_index-1)%4)],U&'Pr\00E9paration, implantation et pose compl\00E8te','main_oeuvre',24+(v_index%20),'h',52,0,20,1),
        (v_devis,'Fournitures et quincaillerie',U&'Profil\00E9s, panneaux, fixations et consommables','fourniture',12+(v_index%15),'u',95+(v_index%4)*18,0,20,2),
        (v_devis,U&'D\00E9placement et protection du chantier','Livraison, protections et nettoyage','forfait',1,'forfait',280+(v_index%5)*35,0,20,3);

      if v_statut='accepte' then
        insert into public.factures(
          entreprise_id,numero,client_id,chantier_id,devis_origine_id,type,statut,
          date_emission,date_echeance,notes_client,notes_internes,created_at
        )
        select v_entreprise,'FAC-TST5-'||to_char(v_date+7,'YYYYMM')||'-'||lpad(v_index::text,3,'0'),
          d.client_id,d.chantier_id,d.id,
          case when v_index%5=0 then 'acompte' else 'simple' end,
          'envoyee',v_date+7,v_date+37,U&'R\00E8glement par virement.',U&'[RECETTE 5A] Historique de d\00E9monstration',
          (v_date+7)::timestamptz + interval '10 hours'
        from public.devis d where d.id=v_devis
        returning id into v_facture;

        insert into public.lignes_factures(
          facture_id,designation,description,type,quantite,unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre
        )
        select v_facture,designation,description,type,quantite,unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre
        from public.lignes_devis where devis_id=v_devis order by ordre;

        select montant_ttc into v_total from public.factures where id=v_facture;
        if v_index % 6 in (0,1,2,3) then
          insert into public.paiements(facture_id,montant,date,mode,reference,created_at)
          values(v_facture,v_total,v_date+17,'virement','VIR-TST5-'||lpad(v_index::text,4,'0'),(v_date+17)::timestamptz+interval '11 hours');
        elsif v_index % 6=4 then
          insert into public.paiements(facture_id,montant,date,mode,reference,created_at)
          values(v_facture,round(v_total*0.4,2),v_date+17,'virement','ACP-TST5-'||lpad(v_index::text,4,'0'),(v_date+17)::timestamptz+interval '11 hours');
        else
          perform public.recalc_paiements_facture(v_facture);
        end if;
      end if;
    end loop;
  end loop;

  -- Planning et pointages validés : six salariés, cinq jours par semaine, cinq ans.
  for v_semaine in 0..259 loop
    for v_jour in 0..4 loop
      v_date := date_trunc('week',v_debut)::date + v_semaine*7 + v_jour;
      for v_i in 1..least(6,array_length(v_employes,1)) loop
        v_employe := v_employes[v_i];
        v_chantier := v_chantiers[1+((v_semaine+v_jour+v_i-1)%array_length(v_chantiers,1))];
        insert into public.affectations(
          entreprise_id,chantier_id,employe_id,date,heures,tache,notes,type_activite,created_at
        ) values (
          v_entreprise,v_chantier,v_employe,v_date,
          case when (v_jour+v_i)%5=0 then 8 else 7.5 end,
          '[RECETTE 5A] '||(array[U&'Pose et r\00E9glages',U&'Pr\00E9paration supports','Montage cloisons','Finitions',U&'Nettoyage et r\00E9ception'])[1+(v_jour%5)],
          U&'Planning historique de d\00E9monstration','chantier',v_date::timestamptz+interval '6 hours'
        ) returning id into v_affectation;

        insert into public.pointages(
          entreprise_id,employe_id,chantier_id,date,heures_normales,heures_supplementaires,
          pause_minutes,tache,commentaire,latitude,longitude,precision_metres,
          verification_statut,verification_at,verification_par,commentaire_verification,
          affectation_id,created_at,updated_at
        ) values (
          v_entreprise,v_employe,v_chantier,v_date,7.5,
          case when (v_jour+v_i)%5=0 then 0.5 else 0 end,
          45,U&'[RECETTE 5A] Travail r\00E9alis\00E9',U&'Pointage historique GPS de d\00E9monstration',
          45.764000 + (v_i::numeric/10000),4.835700 + (v_jour::numeric/10000),12+(v_i%8),
          'valide',v_date::timestamptz+interval '18 hours',v_admin,U&'Pointage contr\00F4l\00E9 et valid\00E9',
          v_affectation,v_date::timestamptz+interval '18 hours',v_date::timestamptz+interval '18 hours'
        );
      end loop;
    end loop;
  end loop;

  -- Stock : trente références, stock initial et consommations mensuelles.
  for v_i in 1..30 loop
    insert into public.articles_stock(
      entreprise_id,reference,designation,unite,quantite_stock,seuil_alerte,prix_achat_ht,emplacement,actif
    ) values (
      v_entreprise,'TST5-STK-'||lpad(v_i::text,3,'0'),
      (array['Plaque BA13',U&'Rail m\00E9tallique 48',U&'Montant m\00E9tallique 48','Vis placo 25 mm',U&'Bande \00E0 joint','Enduit de finition',U&'Laine min\00E9rale','Profil aluminium',U&'Panneau m\00E9lamin\00E9','Silicone sanitaire'])[1+((v_i-1)%10)]||' '||v_i,
      case when v_i%4=0 then 'boite' when v_i%3=0 then 'ml' else 'u' end,
      0,12+(v_i%8),4.5+v_i*2.15,U&'D\00E9p\00F4t \2014 Zone '||chr(65+((v_i-1)%5)),true
    ) on conflict(entreprise_id,reference) do update
      set designation=excluded.designation,seuil_alerte=excluded.seuil_alerte,
          prix_achat_ht=excluded.prix_achat_ht,emplacement=excluded.emplacement,actif=true;

    select id into v_article from public.articles_stock
    where entreprise_id=v_entreprise and reference='TST5-STK-'||lpad(v_i::text,3,'0');
    update public.articles_stock set quantite_stock=0 where id=v_article;
    insert into public.mouvements_stock(entreprise_id,article_id,type,quantite,date,motif)
    values(v_entreprise,v_article,'entree',120+(v_i%5)*20,
      v_debut,'[RECETTE 5A] Stock initial');
    for v_semaine in 0..59 loop
      insert into public.mouvements_stock(entreprise_id,article_id,chantier_id,type,quantite,date,motif)
      values(v_entreprise,v_article,v_chantiers[1+((v_i+v_semaine-1)%array_length(v_chantiers,1))],
        'sortie',1+((v_i+v_semaine)%3),(v_debut+make_interval(months=>v_semaine)+interval '14 days')::date,
        '[RECETTE 5A] Consommation chantier');
    end loop;
  end loop;

  -- Fournisseurs, commandes, réceptions, factures d'achat et règlements.
  for v_i in 1..10 loop
    insert into public.fournisseurs(
      entreprise_id,reference,nom,contact_nom,email,telephone,adresse,code_postal,ville,notes,actif
    ) values (
      v_entreprise,'TST5-FRN-'||lpad(v_i::text,3,'0'),
      (array['Point.P','Sonepar','Kiloutou','Rexel','Dispano','Legallais',U&'W\00FCrth',U&'La Plateforme du B\00E2timent','Foussier','Aubade'])[v_i],
      'Service professionnel','commandes.'||v_i||'@example.test','040000'||lpad(v_i::text,4,'0'),
      v_i||' rue des Fournisseurs','6900'||v_i,'Lyon',U&'[RECETTE 5A] Fournisseur de d\00E9monstration',true
    ) on conflict(entreprise_id,reference) do update set nom=excluded.nom,actif=true;
  end loop;
  select array_agg(id order by reference) into v_fournisseurs
  from public.fournisseurs where entreprise_id=v_entreprise and reference like 'TST5-FRN-%';

  v_index := 0;
  for v_mois in 0..59 loop
    for v_jour in 1..4 loop
      v_index:=v_index+1;
      v_date:=(v_debut+make_interval(months=>v_mois))::date+(v_jour-1)*6+2;
      v_fournisseur:=v_fournisseurs[1+((v_index-1)%array_length(v_fournisseurs,1))];
      v_chantier:=v_chantiers[1+((v_index-1)%array_length(v_chantiers,1))];
      v_statut:=case when v_index%7=0 then 'recue_partiel' when v_index%6=0 then 'confirmee' else 'recue' end;
      insert into public.commandes_fournisseurs(
        entreprise_id,numero,fournisseur_id,chantier_id,statut,date_commande,date_livraison_prevue,notes,created_at
      ) values (
        v_entreprise,'CMD-TST5-'||to_char(v_date,'YYYYMM')||'-'||lpad(v_index::text,3,'0'),
        v_fournisseur,v_chantier,v_statut,v_date,v_date+7,'[RECETTE 5A] Approvisionnement chantier',v_date::timestamptz+interval '8 hours'
      ) returning id into v_commande;
      insert into public.lignes_commande(
        entreprise_id,commande_id,designation,description,quantite,unite,prix_unitaire_ht,taux_tva,quantite_recue,ordre
      ) values
        (v_entreprise,v_commande,U&'Mat\00E9riaux chantier',U&'Panneaux et profil\00E9s',10,'u',95+(v_index%5)*12,20,case when v_statut='recue_partiel' then 6 when v_statut='recue' then 10 else 0 end,1),
        (v_entreprise,v_commande,'Consommables','Fixations et produits de finition',20,'u',18+(v_index%4)*3,20,case when v_statut='recue_partiel' then 12 when v_statut='recue' then 20 else 0 end,2);

      if v_statut in ('recue','recue_partiel') then
        insert into public.depenses_fournisseurs(
          entreprise_id,fournisseur_id,chantier_id,commande_id,numero_piece,categorie,
          date_piece,date_echeance,montant_ht,montant_tva,notes,created_at
        ) values (
          v_entreprise,v_fournisseur,v_chantier,v_commande,'ACH-TST5-'||lpad(v_index::text,4,'0'),'materiaux',
          v_date+8,v_date+38,1250+(v_index%6)*175,round((1250+(v_index%6)*175)*0.2,2),
          U&'[RECETTE 5A] Facture fournisseur li\00E9e \00E0 la commande',v_date::timestamptz+interval '9 days'
        ) returning id into v_depense;
        select montant_ttc into v_total from public.depenses_fournisseurs where id=v_depense;
        if v_index%5<>0 then
          insert into public.reglements_fournisseurs(entreprise_id,depense_id,montant,date,mode,reference,created_at)
          values(v_entreprise,v_depense,case when v_index%7=0 then round(v_total*0.5,2) else v_total end,
            v_date+25,'virement','RF-TST5-'||lpad(v_index::text,4,'0'),(v_date+25)::timestamptz+interval '10 hours');
        end if;
      end if;
    end loop;
  end loop;

  -- Charges récurrentes de l'entreprise.
  insert into public.charges_recurrentes(
    entreprise_id,libelle,fournisseur_id,categorie,periodicite,montant_ht,montant_tva,prochaine_echeance,actif,notes
  ) values
    (v_entreprise,'[RECETTE 5A] Assurance flotte',v_fournisseurs[1],'assurance','mensuelle',620,0,date_trunc('month',current_date)::date+interval '1 month',true,U&'Charge de d\00E9monstration'),
    (v_entreprise,U&'[RECETTE 5A] Location d\00E9p\00F4t',v_fournisseurs[2],'location','mensuelle',1800,360,date_trunc('month',current_date)::date+interval '1 month',true,U&'Charge de d\00E9monstration'),
    (v_entreprise,'[RECETTE 5A] Carburant cartes flotte',v_fournisseurs[3],'carburant','mensuelle',1450,290,date_trunc('month',current_date)::date+interval '1 month',true,U&'Charge de d\00E9monstration'),
    (v_entreprise,U&'[RECETTE 5A] T\00E9l\00E9phonie \00E9quipe',v_fournisseurs[4],'autre','mensuelle',380,76,date_trunc('month',current_date)::date+interval '1 month',true,U&'Charge de d\00E9monstration')
  on conflict(entreprise_id,libelle) do update
    set fournisseur_id=excluded.fournisseur_id,montant_ht=excluded.montant_ht,
        montant_tva=excluded.montant_tva,prochaine_echeance=excluded.prochaine_echeance,actif=true;

  -- Notes de frais personnelles, sans faux justificatif : le document reste à compléter.
  for v_i in 1..300 loop
    v_date := v_debut + ((v_i-1)*6);
    v_employe := v_employes[1+((v_i-1)%least(12,array_length(v_employes,1)))];
    v_chantier := v_chantiers[1+((v_i-1)%array_length(v_chantiers,1))];
    v_total := 18 + (v_i%9)*11.5;
    insert into public.notes_frais(
      entreprise_id,employe_id,chantier_id,date_frais,montant_ttc,categorie,description,
      statut,fournisseur,date_import,montant_ht,montant_tva,taux_tva,devise,moyen_paiement,
      commentaire_salarie,type_document_principal,statut_document,soumis_at,valide_at,valide_par,
      created_at,updated_at
    ) values (
      v_entreprise,v_employe,v_chantier,v_date,v_total,
      (array['repas','carburant','peage','stationnement','petit_materiel','achat_chantier'])[1+((v_i-1)%6)],
      U&'[RECETTE 5A] D\00E9pense professionnelle historique',
      case when v_i%9=0 then 'soumis' when v_i%13=0 then 'refuse' else 'valide' end,
      (array['TotalEnergies','Boulangerie du chantier','VINCI Autoroutes','Parking Lyon','Quincaillerie Pro'])[1+((v_i-1)%5)],
      v_date::timestamptz+interval '18 hours',round(v_total/1.2,2),round(v_total-v_total/1.2,2),20,'EUR','cb',
      U&'D\00E9pense engag\00E9e pour les besoins du chantier','ticket_caisse','incomplet',
      v_date::timestamptz+interval '19 hours',
      case when v_i%9<>0 and v_i%13<>0 then v_date::timestamptz+interval '2 days' else null end,
      case when v_i%9<>0 and v_i%13<>0 then v_admin else null end,
      v_date::timestamptz+interval '18 hours',v_date::timestamptz+interval '2 days'
    );
  end loop;

  -- Congés historiques (les fiches sont rattachées au compte admin pour le jeu de test).
  for v_i in 1..100 loop
    v_date := v_debut + ((v_i-1)*18);
    insert into public.demandes_conges(
      entreprise_id,employe_id,type_conge,date_debut,date_fin,commentaire,statut,
      motif_decision,decide_par,decide_at,soumis_at,created_by,created_at,updated_at
    ) values (
      v_entreprise,v_employes[1+((v_i-1)%least(12,array_length(v_employes,1)))],
      case when v_i%5=0 then 'rtt' else 'conges_payes' end,v_date,v_date+case when v_i%4=0 then 4 else 0 end,
      U&'[RECETTE 5A] Demande historique de d\00E9monstration',case when v_i%7=0 then 'refusee' else 'approuvee' end,
      case when v_i%7=0 then U&'P\00E9riode d\00E9j\00E0 compl\00E8te' else U&'Valid\00E9e par le responsable' end,
      v_admin,v_date::timestamptz-interval '5 days',v_date::timestamptz-interval '7 days',v_admin,
      v_date::timestamptz-interval '7 days',v_date::timestamptz-interval '5 days'
    );
  end loop;

  -- Kilométrages et factures d'entretien sur un échantillon de la flotte déjà créée.
  select array_agg(id order by created_at,id) into v_vehicules
  from (select id,created_at from public.vehicules where entreprise_id=v_entreprise order by created_at,id limit 12) x;
  if coalesce(array_length(v_vehicules,1),0)>0 then
    for v_i in 1..array_length(v_vehicules,1) loop
      v_vehicule:=v_vehicules[v_i];
      if not exists(select 1 from public.releves_kilometrage where vehicule_id=v_vehicule and note like '[RECETTE 5A]%') then
        select kilometrage into v_km from public.vehicules where id=v_vehicule;
        for v_mois in 0..59 loop
          v_km:=v_km+650+v_i*18+v_mois*12;
          insert into public.releves_kilometrage(entreprise_id,vehicule_id,date_releve,kilometrage,note,created_at)
          values(v_entreprise,v_vehicule,(v_debut+make_interval(months=>v_mois)+interval '25 days')::date,
            v_km,U&'[RECETTE 5A] Relev\00E9 mensuel',(v_debut+make_interval(months=>v_mois)+interval '25 days')::timestamptz);
        end loop;
      end if;
      v_fournisseur:=v_fournisseurs[1+((v_i-1)%array_length(v_fournisseurs,1))];
      insert into public.depenses_fournisseurs(
        entreprise_id,fournisseur_id,vehicule_id,numero_piece,categorie,date_piece,date_echeance,
        montant_ht,montant_tva,notes,travaux_effectues,created_at
      ) values (
        v_entreprise,v_fournisseur,v_vehicule,'ENT-TST5-'||lpad(v_i::text,4,'0'),'transport',
        current_date-(v_i*11),current_date-(v_i*11)+30,180+v_i*35,round((180+v_i*35)*0.2,2),
        U&'[RECETTE 5A] Entretien v\00E9hicule historique',
        case when v_i%3=0 then U&'R\00E9vision compl\00E8te, filtres et niveaux' when v_i%3=1 then U&'Remplacement pneumatiques et contr\00F4le g\00E9om\00E9trie' else U&'Vidange et contr\00F4le de s\00E9curit\00E9' end,
        (current_date-(v_i*11))::timestamptz+interval '9 hours'
      ) returning id into v_depense;
      select montant_ttc into v_total from public.depenses_fournisseurs where id=v_depense;
      insert into public.reglements_fournisseurs(entreprise_id,depense_id,montant,date,mode,reference)
      values(v_entreprise,v_depense,v_total,current_date-(v_i*11)+10,'cb','CB-ENT-'||lpad(v_i::text,4,'0'));
    end loop;
  end if;

  -- Historique mensuel de facturation des comptes réellement ouverts.
  for v_mois in 0..59 loop
    insert into public.facturation_comptes_mensuelle(
      entreprise_id,employe_id,poste_id,mois,statut_compte,libelle_poste,code_offre,montant_ht,motif
    )
    select v_entreprise,e.id,e.poste_id,
      (v_debut+make_interval(months=>v_mois))::date,
      e.compte_application_statut,p.nom,p.code_offre,coalesce(p.tarif_compte_mensuel,0),'seed_entreprise_test_5_ans'
    from public.employes e left join public.postes p on p.id=e.poste_id
    where e.entreprise_id=v_entreprise and e.utilisateur_id is not null
      and e.compte_application_statut in ('actif','pause')
    on conflict(entreprise_id,employe_id,mois) do update
      set statut_compte=excluded.statut_compte,libelle_poste=excluded.libelle_poste,
          code_offre=excluded.code_offre,montant_ht=excluded.montant_ht,motif=excluded.motif;
  end loop;

  -- Profils et dossiers de préparation de paie sur soixante mois.
  insert into public.parametres_paie_entreprise(
    entreprise_id,convention_collective,organisme_mutuelle,organisme_prevoyance,
    caisse_retraite,caisse_cibtp,taux_accident_travail,jour_cloture,jour_paiement,
    cabinet_comptable,contact_comptable,email_comptable,consignes_permanentes
  ) values (
    v_entreprise,'Convention collective nationale des ouvriers du bâtiment',
    'Mutuelle BTP Santé','Prévoyance PRO BTP','PRO BTP Retraite','CIBTP',
    3.2500,25,30,'Cabinet Expert Test','Service social','paie@example.test',
    '[RECETTE 5A] Dossiers fictifs destinés aux tests fonctionnels.'
  ) on conflict(entreprise_id) do update set
    cabinet_comptable=excluded.cabinet_comptable,
    contact_comptable=excluded.contact_comptable,
    email_comptable=excluded.email_comptable,
    updated_at=now();

  for v_i in 1..array_length(v_employes,1) loop
    v_employe:=v_employes[v_i];
    insert into public.profils_paie_employes(
      employe_id,entreprise_id,adresse,date_naissance,lieu_naissance,
      contact_urgence_nom,contact_urgence_telephone,type_contrat,qualification,
      classification,coefficient,categorie_statut,salaire_horaire_brut,
      salaire_mensuel_brut,duree_hebdomadaire,duree_mensuelle,temps_travail,
      convention_collective,etablissement,mutuelle,prevoyance,telephone,remarques_confidentielles
    ) values (
      v_employe,v_entreprise,(10+v_i)||' rue des Compagnons, 69000 Lyon',
      make_date(1978+(v_i%18),1+((v_i-1)%12),1+((v_i*2)%25)),'Lyon',
      'Contact urgence '||v_i,'061111'||lpad(v_i::text,4,'0'),'CDI',
      case when v_i<=6 then 'Ouvrier qualifié' when v_i<=9 then 'Chef d''équipe' else 'ETAM' end,
      case when v_i<=6 then 'Niveau III' else 'Niveau IV' end,
      (185+v_i*5)::text,case when v_i<=9 then 'ouvrier' else 'etam' end,
      13.50+v_i*0.65,2050+v_i*125,39,169,'temps_plein',
      'Convention collective nationale des ouvriers du bâtiment','Siège et dépôt',
      'BTP Santé','PRO BTP',true,'[RECETTE 5A] Données strictement fictives.'
    ) on conflict(employe_id) do update set
      salaire_horaire_brut=excluded.salaire_horaire_brut,
      salaire_mensuel_brut=excluded.salaire_mensuel_brut,
      duree_hebdomadaire=excluded.duree_hebdomadaire,
      duree_mensuelle=excluded.duree_mensuelle,
      qualification=excluded.qualification,
      updated_at=now();
  end loop;

  for v_mois in 0..59 loop
    v_date:=(v_debut+make_interval(months=>v_mois))::date;
    insert into public.periodes_paie(
      entreprise_id,mois,date_debut,date_fin,date_limite_saisie,date_validation,date_export,
      statut,verrouillee_at,verrouillee_par,cree_par,created_at,updated_at
    ) values (
      v_entreprise,v_date,v_date,(v_date+interval '1 month - 1 day')::date,v_date+24,
      case when v_mois<59 then v_date::timestamptz+interval '26 days' end,
      case when v_mois<59 then v_date::timestamptz+interval '27 days' end,
      case when v_mois<59 then 'verrouillee' else 'a_controler' end,
      case when v_mois<59 then v_date::timestamptz+interval '28 days' end,
      case when v_mois<59 then v_admin end,
      v_admin,v_date::timestamptz+interval '20 days',v_date::timestamptz+interval '28 days'
    ) on conflict(entreprise_id,mois) do update set
      date_debut=excluded.date_debut,date_fin=excluded.date_fin,
      date_limite_saisie=excluded.date_limite_saisie,
      date_validation=excluded.date_validation,date_export=excluded.date_export,
      statut=excluded.statut,verrouillee_at=excluded.verrouillee_at,
      verrouillee_par=excluded.verrouillee_par,updated_at=excluded.updated_at
    returning id into v_periode;

    for v_i in 1..array_length(v_employes,1) loop
      v_employe:=v_employes[v_i];
      insert into public.dossiers_paie_salaries(
        entreprise_id,periode_id,employe_id,statut,heures_normales,heures_sup_25,
        heures_sup_50,heures_absence,jours_conges,total_paniers,total_trajets,
        total_transports,total_grands_deplacements,total_kilometres,total_primes,
        total_acomptes,total_notes_frais,commentaire_comptable,valide_par,valide_at,
        created_at,updated_at
      ) values (
        v_entreprise,v_periode,v_employe,
        case when v_mois<59 then 'verrouille' else 'a_controler' end,
        151.67+(v_i%3)*4,case when (v_i+v_mois)%4=0 then 8 else 4 end,
        case when (v_i+v_mois)%9=0 then 2 else 0 end,
        case when (v_i+v_mois)%11=0 then 7 else 0 end,
        case when (v_i+v_mois)%8=0 then 2 else 0 end,
        10*(11.50+(v_i%3)),35+(v_i%4)*8,20+(v_i%3)*5,
        case when (v_i+v_mois)%10=0 then 245 else 0 end,
        case when (v_i+v_mois)%7=0 then 125 else 0 end,
        case when v_mois%12=11 then 350+(v_i*20) else 0 end,
        case when (v_i+v_mois)%15=0 then 200 else 0 end,
        25+(v_i%5)*12.50,
        '[RECETTE 5A] Variables contrôlées pour la recette.',
        case when v_mois<59 then v_admin end,
        case when v_mois<59 then v_date::timestamptz+interval '26 days' end,
        v_date::timestamptz+interval '22 days',v_date::timestamptz+interval '28 days'
      ) on conflict(periode_id,employe_id) do update set
        statut=excluded.statut,heures_normales=excluded.heures_normales,
        heures_sup_25=excluded.heures_sup_25,heures_sup_50=excluded.heures_sup_50,
        heures_absence=excluded.heures_absence,jours_conges=excluded.jours_conges,
        total_paniers=excluded.total_paniers,total_trajets=excluded.total_trajets,
        total_transports=excluded.total_transports,total_grands_deplacements=excluded.total_grands_deplacements,
        total_kilometres=excluded.total_kilometres,total_primes=excluded.total_primes,
        total_acomptes=excluded.total_acomptes,total_notes_frais=excluded.total_notes_frais,
        valide_par=excluded.valide_par,valide_at=excluded.valide_at,updated_at=excluded.updated_at
      returning id into v_dossier;

      insert into public.temps_travail_paie(
        entreprise_id,dossier_id,date,chantier_id,categorie,quantite_heures,majoration,
        source_type,commentaire,cree_par,created_at,updated_at
      )
      select
        v_entreprise,v_dossier,v_date+g.jour,
        v_chantiers[1+((v_i+v_mois+g.jour-2)%array_length(v_chantiers,1))],
        'normales',round((151.67+(v_i%3)*4)/20,2),0,'seed_entreprise_test_5_ans',
        '[RECETTE 5A] Journée issue de la synthèse mensuelle des pointages.',v_admin,
        v_date::timestamptz+interval '22 days',v_date::timestamptz+interval '22 days'
      from generate_series(1,20) as g(jour);

      if v_mois%12=11 then
        insert into public.primes_paie(
          entreprise_id,dossier_id,type_prime,libelle,montant,recurrent,cotisations,
          source_type,commentaire,cree_par,created_at,updated_at
        ) values (
          v_entreprise,v_dossier,'prime_annuelle','Prime annuelle de performance',
          350+(v_i*20),false,'a_determiner','seed_entreprise_test_5_ans',
          '[RECETTE 5A] Variable fictive.',v_admin,
          v_date::timestamptz+interval '23 days',v_date::timestamptz+interval '23 days'
        );
      end if;

      if (v_i+v_mois)%11=0 then
        insert into public.absences_paie(
          entreprise_id,dossier_id,type_absence,date_debut,date_fin,duree_jours,
          duree_heures,motif,maintien_salaire,source_type,commentaire,cree_par,created_at,updated_at
        ) values (
          v_entreprise,v_dossier,'absence_autorisee',v_date+10,v_date+10,1,7,
          'Rendez-vous personnel','a_controler','seed_entreprise_test_5_ans',
          '[RECETTE 5A] Absence fictive.',v_admin,
          v_date::timestamptz+interval '12 days',v_date::timestamptz+interval '12 days'
        );
      end if;
    end loop;

    insert into public.validations_paie(
      entreprise_id,periode_id,etape,action,commentaire,ancien_statut,nouveau_statut,
      utilisateur_id,created_at
    ) values (
      v_entreprise,v_periode,'controle_mensuel',
      case when v_mois<59 then 'validation' else 'ouverture_controle' end,
      '[RECETTE 5A] Historique fictif de préparation de paie.',
      'a_controler',case when v_mois<59 then 'verrouillee' else 'a_controler' end,
      v_admin,v_date::timestamptz+interval '26 days'
    );
  end loop;

  -- Sous-traitants et coûts de missions rattachés aux chantiers.
  for v_i in 1..5 loop
    insert into public.fournisseurs(
      entreprise_id,reference,nom,contact_nom,email,telephone,adresse,code_postal,ville,
      notes,actif,type_tiers,specialite,numero_tva
    ) values (
      v_entreprise,'TST5-ST-'||lpad(v_i::text,3,'0'),
      (array['Électricité Rhône','Plomberie Métropole','Peinture Finitions','Climatisation Services','Menuiserie Atelier'])[v_i],
      'Responsable travaux','soustraitant.'||v_i||'@example.test','047200'||lpad(v_i::text,4,'0'),
      (40+v_i)||' rue des Métiers','69000','Lyon','[RECETTE 5A] Sous-traitant fictif',true,
      'sous_traitant',(array['électricité','plomberie','peinture','climatisation','menuiserie'])[v_i],
      'FR'||lpad((10000000000+v_i)::text,11,'0')
    ) on conflict(entreprise_id,reference) do update set
      nom=excluded.nom,type_tiers='sous_traitant',specialite=excluded.specialite,actif=true;
  end loop;
  select array_agg(id order by reference) into v_sous_traitants
  from public.fournisseurs where entreprise_id=v_entreprise and reference like 'TST5-ST-%';

  for v_i in 1..30 loop
    insert into public.sous_traitants_chantiers(
      entreprise_id,fournisseur_id,chantier_id,mission,date_debut,date_fin,
      montant_previsionnel_ht,statut,notes,created_at,updated_at
    ) values (
      v_entreprise,v_sous_traitants[1+((v_i-1)%array_length(v_sous_traitants,1))],
      v_chantiers[1+((v_i-1)%array_length(v_chantiers,1))],
      (array['Mise en conformité','Pose réseaux','Travaux de finition','Installation technique','Renfort de production'])[1+((v_i-1)%5)],
      v_debut+(v_i-1)*55,v_debut+(v_i-1)*55+12,1800+v_i*135,
      case when v_i<=26 then 'terminee' else 'en_cours' end,
      '[RECETTE 5A] Mission fictive de recette',
      (v_debut+(v_i-1)*55)::timestamptz,(v_debut+(v_i-1)*55+12)::timestamptz
    );
  end loop;

  -- Contrats d’entretien, dépannages, visites et livraisons sur cinq exercices.
  for v_i in 1..12 loop
    insert into public.contrats_entretien(
      entreprise_id,numero,client_id,chantier_id,libelle,description,statut,
      date_debut,date_fin,periodicite,prochaine_intervention,montant_ht,taux_tva,
      reconduction_tacite,created_at,updated_at
    ) values (
      v_entreprise,'CTR-TST5-'||lpad(v_i::text,3,'0'),
      v_clients[1+((v_i-1)%array_length(v_clients,1))],
      v_chantiers[1+((v_i-1)%array_length(v_chantiers,1))],
      'Contrat entretien annuel '||v_i,'[RECETTE 5A] Maintenance préventive fictive',
      case when v_i<=9 then 'actif' else 'termine' end,
      v_debut+(v_i-1)*90,case when v_i>9 then v_debut+(v_i-1)*90+730 end,
      case when v_i%2=0 then 'semestrielle' else 'annuelle' end,
      current_date+(v_i*12),850+v_i*110,20,true,
      (v_debut+(v_i-1)*90)::timestamptz,now()
    ) on conflict(entreprise_id,numero) do update set
      statut=excluded.statut,prochaine_intervention=excluded.prochaine_intervention,updated_at=now()
    returning id into v_contrat;
  end loop;

  for v_i in 1..120 loop
    v_date:=v_debut+(v_i-1)*15;
    insert into public.interventions(
      entreprise_id,numero,client_id,chantier_id,employe_id,type,statut,priorite,
      objet,description,date_prevue,heure_prevue,duree_prevue,date_realisation,
      compte_rendu,signature_client_nom,signature_client_at,created_at,updated_at
    ) values (
      v_entreprise,'INT-TST5-'||lpad(v_i::text,4,'0'),
      v_clients[1+((v_i-1)%array_length(v_clients,1))],
      v_chantiers[1+((v_i-1)%array_length(v_chantiers,1))],
      v_employes[1+((v_i-1)%array_length(v_employes,1))],
      (array['depannage','entretien','sav','visite','livraison'])[1+((v_i-1)%5)],
      case when v_i<=112 then 'terminee' when v_i<=116 then 'planifiee' else 'a_planifier' end,
      case when v_i%13=0 then 'urgente' when v_i%5=0 then 'haute' else 'normale' end,
      'Intervention de recette '||v_i,'[RECETTE 5A] Historique complet fictif',
      v_date,'08:00',case when v_i%3=0 then 7.5 else 3.5 end,
      case when v_i<=112 then v_date::timestamptz+interval '16 hours' end,
      case when v_i<=112 then 'Intervention terminée et contrôlée.' end,
      case when v_i<=112 then 'Client Test '||v_i end,
      case when v_i<=112 then v_date::timestamptz+interval '16 hours' end,
      v_date::timestamptz+interval '7 hours',
      case when v_i<=112 then v_date::timestamptz+interval '16 hours' else v_date::timestamptz+interval '7 hours' end
    ) on conflict(entreprise_id,numero) do update set
      statut=excluded.statut,date_realisation=excluded.date_realisation,
      compte_rendu=excluded.compte_rendu,updated_at=excluded.updated_at;
  end loop;

  select jsonb_build_object(
    'employes',(select count(*) from public.employes where entreprise_id=v_entreprise),
    'clients',(select count(*) from public.clients where entreprise_id=v_entreprise),
    'chantiers',(select count(*) from public.chantiers where entreprise_id=v_entreprise),
    'devis',(select count(*) from public.devis where entreprise_id=v_entreprise),
    'factures',(select count(*) from public.factures where entreprise_id=v_entreprise),
    'paiements_clients',(select count(*) from public.paiements p join public.factures f on f.id=p.facture_id where f.entreprise_id=v_entreprise),
    'affectations_5_ans',(select count(*) from public.affectations where entreprise_id=v_entreprise and tache like '[RECETTE 5A]%'),
    'pointages_5_ans',(select count(*) from public.pointages where entreprise_id=v_entreprise and tache like '[RECETTE 5A]%'),
    'articles_stock',(select count(*) from public.articles_stock where entreprise_id=v_entreprise),
    'mouvements_stock_5_ans',(select count(*) from public.mouvements_stock where entreprise_id=v_entreprise and motif like '[RECETTE 5A]%'),
    'commandes_fournisseurs',(select count(*) from public.commandes_fournisseurs where entreprise_id=v_entreprise),
    'depenses_fournisseurs',(select count(*) from public.depenses_fournisseurs where entreprise_id=v_entreprise),
    'notes_frais_5_ans',(select count(*) from public.notes_frais where entreprise_id=v_entreprise and description like '[RECETTE 5A]%'),
    'demandes_conges_5_ans',(select count(*) from public.demandes_conges where entreprise_id=v_entreprise and commentaire like '[RECETTE 5A]%'),
    'periodes_paie',(select count(*) from public.periodes_paie where entreprise_id=v_entreprise),
    'dossiers_paie',(select count(*) from public.dossiers_paie_salaries where entreprise_id=v_entreprise),
    'sous_traitants',(select count(*) from public.fournisseurs where entreprise_id=v_entreprise and type_tiers='sous_traitant'),
    'missions_sous_traitants',(select count(*) from public.sous_traitants_chantiers where entreprise_id=v_entreprise),
    'contrats_entretien',(select count(*) from public.contrats_entretien where entreprise_id=v_entreprise),
    'interventions',(select count(*) from public.interventions where entreprise_id=v_entreprise),
    'vehicules',(select count(*) from public.vehicules where entreprise_id=v_entreprise),
    'outils',(select count(*) from public.outils where entreprise_id=v_entreprise)
  ) into v_resume;

  insert into entreprise_test_seed_resultat(entreprise,email_connexion,code_entreprise,resume)
  values('Entreprise Test',lower(v_email),v_code,v_resume);
end
$seed$;

select
  entreprise as "Entreprise",
  email_connexion as "Email de connexion",
  code_entreprise as "Code entreprise",
  resume as U&"Donn\00E9es pr\00E9sentes"
from entreprise_test_seed_resultat;
