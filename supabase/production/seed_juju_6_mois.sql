-- Données de démonstration réservées à l'entreprise de test « juju ».
--
-- Ce script :
--   1. réactive l'abonnement et le compte administrateur existant de juju ;
--   2. génère un nouveau mot de passe temporaire, affiché uniquement dans le
--      dernier résultat du SQL Editor (aucun mot de passe n'est stocké ici) ;
--   3. ajoute six mois cohérents de devis, factures, règlements, planning,
--      pointages, stock, commandes, achats, frais, congés et kilométrages.
--
-- Il refuse de s'exécuter si l'entreprise ou un compte membre n'est pas trouvé.
-- Il ne modifie aucune autre entreprise. Les données qu'il crée portent le
-- marqueur [JUJU 6M] et peuvent être régénérées sans doublon.

set statement_timeout = '10min';

create temp table if not exists juju_seed_resultat (
  entreprise text,
  email_connexion text,
  mot_de_passe_temporaire text,
  code_entreprise text,
  resume jsonb
);
truncate table juju_seed_resultat;

do $seed$
declare
  v_entreprise uuid;
  v_admin uuid;
  v_admin_poste uuid;
  v_email text;
  v_password text;
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
begin
  select e.id, e.code_adhesion
  into v_entreprise, v_code
  from public.entreprises e
  where lower(btrim(e.nom)) = 'juju'
     or lower(coalesce(e.raison_sociale,'')) = 'juju'
  order by case when lower(btrim(e.nom)) = 'juju' then 0 else 1 end, e.created_at
  limit 1;

  if v_entreprise is null then
    raise exception U&'Entreprise de test \00AB juju \00BB introuvable : aucune donn\00E9e n''a \00E9t\00E9 modifi\00E9e';
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
    case when lower(coalesce(au.email,'')) like '%juju%' then 0 else 1 end,
    ue.created_at
  limit 1;

  if v_admin is null or v_email is null then
    raise exception U&'Aucun compte de connexion existant n''est rattach\00E9 \00E0 juju : aucune donn\00E9e n''a \00E9t\00E9 modifi\00E9e';
  end if;

  -- Réactivation du compte test et attribution du poste administrateur.
  update public.entreprises
  set abonnement_statut = 'actif',
      abonnement_echeance = current_date + 365,
      abonnement_note = U&'Compte de d\00E9monstration juju \2014 historique de six mois',
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
      premiere_connexion_at = coalesce(premiere_connexion_at, now() - interval '6 months'),
      derniere_connexion_at = now(),
      application_installee_at = coalesce(application_installee_at, now() - interval '6 months'),
      updated_at = now()
  where entreprise_id = v_entreprise and utilisateur_id = v_admin;

  if v_admin_poste is not null then
    insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
    select v_entreprise,v_admin_poste,d.cle,true
    from public.permissions_disponibles d
    on conflict(entreprise_id,poste_id,cle_permission)
    do update set autorise = true;
  end if;

  v_password := 'Jj!' || upper(substr(encode(gen_random_bytes(8),'hex'),1,10)) || '9a';
  update auth.users
  set encrypted_password = crypt(v_password, gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      confirmation_token = '',
      recovery_token = '',
      updated_at = now()
  where id = v_admin;

  -- Jeu minimum de clients et chantiers, sans toucher aux données déjà présentes.
  for v_i in 1..20 loop
    insert into public.clients(
      entreprise_id,reference_interne,type,nom,prenom,societe,raison_sociale,
      adresse_facturation,code_postal,ville,telephone,email,conditions_paiement,statut,notes,created_at
    ) values (
      v_entreprise,'JUJU-CLI-'||lpad(v_i::text,3,'0'),
      case when v_i % 3 = 0 then 'professionnel' else 'particulier' end,
      case when v_i % 3 = 0 then null else (array['Martin','Bernard','Petit','Robert','Richard','Durand','Dubois','Moreau','Laurent','Simon'])[1+((v_i-1)%10)] end,
      case when v_i % 3 = 0 then null else (array['Camille','Thomas','Julie','Nicolas','Sophie','Alexandre',U&'\00C9milie','Maxime','Laura','Julien'])[1+((v_i-1)%10)] end,
      case when v_i % 3 = 0 then U&'Soci\00E9t\00E9 D\00E9mo '||v_i else null end,
      case when v_i % 3 = 0 then U&'Soci\00E9t\00E9 D\00E9mo '||v_i else null end,
      (10+v_i)||U&' rue de la R\00E9publique','69'||lpad((100+v_i)::text,3,'0'),'Lyon',
      '060000'||lpad(v_i::text,4,'0'),'client.'||v_i||'@example.test','30 jours','actif',U&'[JUJU 6M] Client de d\00E9monstration',
      now() - interval '7 months'
    ) on conflict(entreprise_id,reference_interne) do nothing;

    insert into public.chantiers(
      entreprise_id,reference_interne,client_id,nom,adresse,code_postal,ville,statut,
      date_debut_prevue,date_fin_prevue,date_debut_reelle,budget_previsionnel,created_at
    )
    select v_entreprise,'JUJU-CHA-'||lpad(v_i::text,3,'0'),c.id,
      (array[U&'R\00E9novation bureaux','Cloisons amovibles','Cabines sanitaires','Agencement accueil',U&'Pose sol stratifi\00E9'])[1+((v_i-1)%5)]||U&' \2014 D\00E9mo '||v_i,
      (30+v_i)||' avenue des Artisans','69'||lpad((200+v_i)::text,3,'0'),'Lyon',
      case when v_i <= 8 then 'facture' when v_i <= 14 then 'en_cours' when v_i <= 17 then 'accepte' else 'prospect' end,
      (date_trunc('month',current_date)-interval '5 months')::date + ((v_i-1)*5),
      (date_trunc('month',current_date)-interval '5 months')::date + ((v_i-1)*5+25),
      case when v_i <= 14 then (date_trunc('month',current_date)-interval '5 months')::date + ((v_i-1)*5) else null end,
      6500 + v_i*850, now() - interval '7 months'
    from public.clients c
    where c.entreprise_id=v_entreprise and c.reference_interne='JUJU-CLI-'||lpad(v_i::text,3,'0')
    on conflict(entreprise_id,reference_interne) do nothing;
  end loop;

  select array_agg(id order by created_at,id) into v_clients
  from public.clients where entreprise_id=v_entreprise;
  select array_agg(id order by created_at,id) into v_chantiers
  from public.chantiers where entreprise_id=v_entreprise;
  select array_agg(id order by created_at,id) into v_employes
  from public.employes where entreprise_id=v_entreprise and statut in ('actif','en_conge');

  if coalesce(array_length(v_clients,1),0)=0 or coalesce(array_length(v_chantiers,1),0)=0 then
    raise exception U&'Le jeu clients/chantiers de juju n''a pas pu \00EAtre pr\00E9par\00E9';
  end if;
  if coalesce(array_length(v_employes,1),0)=0 then
    raise exception U&'Aucun employ\00E9 actif dans juju : le seed a \00E9t\00E9 annul\00E9';
  end if;

  -- Nettoyage ciblé des données d'une éventuelle exécution précédente.
  delete from public.pointages where entreprise_id=v_entreprise and tache like '[JUJU 6M]%';
  delete from public.affectations where entreprise_id=v_entreprise and tache like '[JUJU 6M]%';
  delete from public.demandes_conges where entreprise_id=v_entreprise and commentaire like '[JUJU 6M]%';
  delete from public.notes_frais where entreprise_id=v_entreprise and description like '[JUJU 6M]%';
  delete from public.depenses_fournisseurs where entreprise_id=v_entreprise and notes like '[JUJU 6M]%';
  delete from public.commandes_fournisseurs where entreprise_id=v_entreprise and notes like '[JUJU 6M]%';
  delete from public.factures where entreprise_id=v_entreprise and notes_internes like '[JUJU 6M]%';
  delete from public.devis where entreprise_id=v_entreprise and notes_internes like '[JUJU 6M]%';
  delete from public.mouvements_stock where entreprise_id=v_entreprise and motif like '[JUJU 6M]%';

  -- 42 devis sur six mois, dont 24 acceptés et facturés.
  v_index := 0;
  for v_mois in 0..5 loop
    for v_jour in 1..7 loop
      v_index := v_index + 1;
      v_date := (date_trunc('month',current_date)-interval '5 months' + make_interval(months=>v_mois))::date + (v_jour-1)*3 + 1;
      v_chantier := v_chantiers[1+((v_index-1)%array_length(v_chantiers,1))];
      v_statut := case when v_jour<=4 then 'accepte' when v_jour=5 then 'envoye' when v_jour=6 then 'refuse' else 'brouillon' end;

      insert into public.devis(
        entreprise_id,numero,client_id,chantier_id,statut,date_emission,date_validite,
        conditions,notes_client,notes_internes,remise_globale,created_at
      )
      select v_entreprise,'DEV-JUJU-'||to_char(v_date,'YYYYMM')||'-'||lpad(v_index::text,3,'0'),
        c.client_id,v_chantier,v_statut,v_date,v_date+30,U&'Validit\00E9 30 jours \2014 acompte de 30 % \00E0 la commande',
        'Merci pour votre confiance.',U&'[JUJU 6M] Historique de d\00E9monstration',case when v_index%9=0 then 5 else 0 end,
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
        select v_entreprise,'FAC-JUJU-'||to_char(v_date+7,'YYYYMM')||'-'||lpad(v_index::text,3,'0'),
          d.client_id,d.chantier_id,d.id,
          case when v_index%5=0 then 'acompte' else 'simple' end,
          'envoyee',v_date+7,v_date+37,U&'R\00E8glement par virement.',U&'[JUJU 6M] Historique de d\00E9monstration',
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
          values(v_facture,v_total,v_date+17,'virement','VIR-JUJU-'||lpad(v_index::text,4,'0'),(v_date+17)::timestamptz+interval '11 hours');
        elsif v_index % 6=4 then
          insert into public.paiements(facture_id,montant,date,mode,reference,created_at)
          values(v_facture,round(v_total*0.4,2),v_date+17,'virement','ACP-JUJU-'||lpad(v_index::text,4,'0'),(v_date+17)::timestamptz+interval '11 hours');
        else
          perform public.recalc_paiements_facture(v_facture);
        end if;
      end if;
    end loop;
  end loop;

  -- Planning et pointages validés : douze salariés, cinq jours par semaine, six mois.
  for v_semaine in 0..25 loop
    for v_jour in 0..4 loop
      v_date := date_trunc('week',current_date)::date - 26*7 + v_semaine*7 + v_jour;
      for v_i in 1..least(12,array_length(v_employes,1)) loop
        v_employe := v_employes[v_i];
        v_chantier := v_chantiers[1+((v_semaine+v_jour+v_i-1)%array_length(v_chantiers,1))];
        insert into public.affectations(
          entreprise_id,chantier_id,employe_id,date,heures,tache,notes,type_activite,created_at
        ) values (
          v_entreprise,v_chantier,v_employe,v_date,
          case when (v_jour+v_i)%5=0 then 8 else 7.5 end,
          '[JUJU 6M] '||(array[U&'Pose et r\00E9glages',U&'Pr\00E9paration supports','Montage cloisons','Finitions',U&'Nettoyage et r\00E9ception'])[1+(v_jour%5)],
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
          45,U&'[JUJU 6M] Travail r\00E9alis\00E9',U&'Pointage historique GPS de d\00E9monstration',
          45.764000 + (v_i::numeric/10000),4.835700 + (v_jour::numeric/10000),12+(v_i%8),
          'valide',v_date::timestamptz+interval '18 hours',v_admin,U&'Pointage contr\00F4l\00E9 et valid\00E9',
          v_affectation,v_date::timestamptz+interval '18 hours',v_date::timestamptz+interval '18 hours'
        );
      end loop;
    end loop;
  end loop;

  -- Stock : vingt références, stock initial et sorties régulières par chantier.
  for v_i in 1..20 loop
    insert into public.articles_stock(
      entreprise_id,reference,designation,unite,quantite_stock,seuil_alerte,prix_achat_ht,emplacement,actif
    ) values (
      v_entreprise,'JUJU-STK-'||lpad(v_i::text,3,'0'),
      (array['Plaque BA13',U&'Rail m\00E9tallique 48',U&'Montant m\00E9tallique 48','Vis placo 25 mm',U&'Bande \00E0 joint','Enduit de finition',U&'Laine min\00E9rale','Profil aluminium',U&'Panneau m\00E9lamin\00E9','Silicone sanitaire'])[1+((v_i-1)%10)]||' '||v_i,
      case when v_i%4=0 then 'boite' when v_i%3=0 then 'ml' else 'u' end,
      0,12+(v_i%8),4.5+v_i*2.15,U&'D\00E9p\00F4t \2014 Zone '||chr(65+((v_i-1)%5)),true
    ) on conflict(entreprise_id,reference) do update
      set designation=excluded.designation,seuil_alerte=excluded.seuil_alerte,
          prix_achat_ht=excluded.prix_achat_ht,emplacement=excluded.emplacement,actif=true;

    select id into v_article from public.articles_stock
    where entreprise_id=v_entreprise and reference='JUJU-STK-'||lpad(v_i::text,3,'0');
    update public.articles_stock set quantite_stock=0 where id=v_article;
    insert into public.mouvements_stock(entreprise_id,article_id,type,quantite,date,motif)
    values(v_entreprise,v_article,'entree',120+(v_i%5)*20,
      date_trunc('month',current_date)::date-interval '6 months','[JUJU 6M] Stock initial');
    for v_semaine in 0..25 loop
      insert into public.mouvements_stock(entreprise_id,article_id,chantier_id,type,quantite,date,motif)
      values(v_entreprise,v_article,v_chantiers[1+((v_i+v_semaine-1)%array_length(v_chantiers,1))],
        'sortie',1+((v_i+v_semaine)%3),date_trunc('week',current_date)::date-26*7+v_semaine*7+2,
        '[JUJU 6M] Consommation chantier');
    end loop;
  end loop;

  -- Fournisseurs, commandes, réceptions, factures d'achat et règlements.
  for v_i in 1..8 loop
    insert into public.fournisseurs(
      entreprise_id,reference,nom,contact_nom,email,telephone,adresse,code_postal,ville,notes,actif
    ) values (
      v_entreprise,'JUJU-FRN-'||lpad(v_i::text,3,'0'),
      (array['Point.P','Sonepar','Kiloutou','Rexel','Dispano','Legallais',U&'W\00FCrth',U&'La Plateforme du B\00E2timent'])[v_i],
      'Service professionnel','commandes.'||v_i||'@example.test','040000'||lpad(v_i::text,4,'0'),
      v_i||' rue des Fournisseurs','6900'||v_i,'Lyon',U&'[JUJU 6M] Fournisseur de d\00E9monstration',true
    ) on conflict(entreprise_id,reference) do update set nom=excluded.nom,actif=true;
  end loop;
  select array_agg(id order by reference) into v_fournisseurs
  from public.fournisseurs where entreprise_id=v_entreprise and reference like 'JUJU-FRN-%';

  v_index := 0;
  for v_mois in 0..5 loop
    for v_jour in 1..5 loop
      v_index:=v_index+1;
      v_date:=(date_trunc('month',current_date)-interval '5 months'+make_interval(months=>v_mois))::date+(v_jour-1)*4+2;
      v_fournisseur:=v_fournisseurs[1+((v_index-1)%array_length(v_fournisseurs,1))];
      v_chantier:=v_chantiers[1+((v_index-1)%array_length(v_chantiers,1))];
      v_statut:=case when v_index%7=0 then 'recue_partiel' when v_index%6=0 then 'confirmee' else 'recue' end;
      insert into public.commandes_fournisseurs(
        entreprise_id,numero,fournisseur_id,chantier_id,statut,date_commande,date_livraison_prevue,notes,created_at
      ) values (
        v_entreprise,'CMD-JUJU-'||to_char(v_date,'YYYYMM')||'-'||lpad(v_index::text,3,'0'),
        v_fournisseur,v_chantier,v_statut,v_date,v_date+7,'[JUJU 6M] Approvisionnement chantier',v_date::timestamptz+interval '8 hours'
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
          v_entreprise,v_fournisseur,v_chantier,v_commande,'ACH-JUJU-'||lpad(v_index::text,4,'0'),'materiaux',
          v_date+8,v_date+38,1250+(v_index%6)*175,round((1250+(v_index%6)*175)*0.2,2),
          U&'[JUJU 6M] Facture fournisseur li\00E9e \00E0 la commande',v_date::timestamptz+interval '9 days'
        ) returning id into v_depense;
        select montant_ttc into v_total from public.depenses_fournisseurs where id=v_depense;
        if v_index%5<>0 then
          insert into public.reglements_fournisseurs(entreprise_id,depense_id,montant,date,mode,reference,created_at)
          values(v_entreprise,v_depense,case when v_index%7=0 then round(v_total*0.5,2) else v_total end,
            v_date+25,'virement','RF-JUJU-'||lpad(v_index::text,4,'0'),(v_date+25)::timestamptz+interval '10 hours');
        end if;
      end if;
    end loop;
  end loop;

  -- Charges récurrentes de l'entreprise.
  insert into public.charges_recurrentes(
    entreprise_id,libelle,fournisseur_id,categorie,periodicite,montant_ht,montant_tva,prochaine_echeance,actif,notes
  ) values
    (v_entreprise,'[JUJU 6M] Assurance flotte',v_fournisseurs[1],'assurance','mensuelle',620,0,date_trunc('month',current_date)::date+interval '1 month',true,U&'Charge de d\00E9monstration'),
    (v_entreprise,U&'[JUJU 6M] Location d\00E9p\00F4t',v_fournisseurs[2],'location','mensuelle',1800,360,date_trunc('month',current_date)::date+interval '1 month',true,U&'Charge de d\00E9monstration'),
    (v_entreprise,'[JUJU 6M] Carburant cartes flotte',v_fournisseurs[3],'carburant','mensuelle',1450,290,date_trunc('month',current_date)::date+interval '1 month',true,U&'Charge de d\00E9monstration'),
    (v_entreprise,U&'[JUJU 6M] T\00E9l\00E9phonie \00E9quipe',v_fournisseurs[4],'autre','mensuelle',380,76,date_trunc('month',current_date)::date+interval '1 month',true,U&'Charge de d\00E9monstration')
  on conflict(entreprise_id,libelle) do update
    set fournisseur_id=excluded.fournisseur_id,montant_ht=excluded.montant_ht,
        montant_tva=excluded.montant_tva,prochaine_echeance=excluded.prochaine_echeance,actif=true;

  -- Notes de frais personnelles, sans faux justificatif : le document reste à compléter.
  for v_i in 1..60 loop
    v_date := current_date - (180-(v_i*3));
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
      U&'[JUJU 6M] D\00E9pense professionnelle historique',
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
  for v_i in 1..18 loop
    v_date := date_trunc('week',current_date)::date - 24*7 + (v_i-1)*8;
    insert into public.demandes_conges(
      entreprise_id,employe_id,type_conge,date_debut,date_fin,commentaire,statut,
      motif_decision,decide_par,decide_at,soumis_at,created_by,created_at,updated_at
    ) values (
      v_entreprise,v_employes[1+((v_i-1)%least(12,array_length(v_employes,1)))],
      case when v_i%5=0 then 'rtt' else 'conges_payes' end,v_date,v_date+case when v_i%4=0 then 4 else 0 end,
      U&'[JUJU 6M] Demande historique de d\00E9monstration',case when v_i%7=0 then 'refusee' else 'approuvee' end,
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
      if not exists(select 1 from public.releves_kilometrage where vehicule_id=v_vehicule and note like '[JUJU 6M]%') then
        select kilometrage into v_km from public.vehicules where id=v_vehicule;
        for v_mois in 0..5 loop
          v_km:=v_km+650+v_i*18+v_mois*12;
          insert into public.releves_kilometrage(entreprise_id,vehicule_id,date_releve,kilometrage,note,created_at)
          values(v_entreprise,v_vehicule,(date_trunc('month',current_date)-interval '5 months'+make_interval(months=>v_mois))::date+25,
            v_km,U&'[JUJU 6M] Relev\00E9 mensuel',(date_trunc('month',current_date)-interval '5 months'+make_interval(months=>v_mois))::timestamptz+interval '25 days');
        end loop;
      end if;
      v_fournisseur:=v_fournisseurs[1+((v_i-1)%array_length(v_fournisseurs,1))];
      insert into public.depenses_fournisseurs(
        entreprise_id,fournisseur_id,vehicule_id,numero_piece,categorie,date_piece,date_echeance,
        montant_ht,montant_tva,notes,travaux_effectues,created_at
      ) values (
        v_entreprise,v_fournisseur,v_vehicule,'ENT-JUJU-'||lpad(v_i::text,4,'0'),'transport',
        current_date-(v_i*11),current_date-(v_i*11)+30,180+v_i*35,round((180+v_i*35)*0.2,2),
        U&'[JUJU 6M] Entretien v\00E9hicule historique',
        case when v_i%3=0 then U&'R\00E9vision compl\00E8te, filtres et niveaux' when v_i%3=1 then U&'Remplacement pneumatiques et contr\00F4le g\00E9om\00E9trie' else U&'Vidange et contr\00F4le de s\00E9curit\00E9' end,
        (current_date-(v_i*11))::timestamptz+interval '9 hours'
      ) returning id into v_depense;
      select montant_ttc into v_total from public.depenses_fournisseurs where id=v_depense;
      insert into public.reglements_fournisseurs(entreprise_id,depense_id,montant,date,mode,reference)
      values(v_entreprise,v_depense,v_total,current_date-(v_i*11)+10,'cb','CB-ENT-'||lpad(v_i::text,4,'0'));
    end loop;
  end if;

  -- Historique mensuel de facturation des comptes réellement ouverts.
  for v_mois in 0..5 loop
    insert into public.facturation_comptes_mensuelle(
      entreprise_id,employe_id,poste_id,mois,statut_compte,libelle_poste,code_offre,montant_ht,motif
    )
    select v_entreprise,e.id,e.poste_id,
      (date_trunc('month',current_date)-interval '5 months'+make_interval(months=>v_mois))::date,
      e.compte_application_statut,p.nom,p.code_offre,coalesce(p.tarif_compte_mensuel,0),'seed_juju_6_mois'
    from public.employes e left join public.postes p on p.id=e.poste_id
    where e.entreprise_id=v_entreprise and e.utilisateur_id is not null
      and e.compte_application_statut in ('actif','pause')
    on conflict(entreprise_id,employe_id,mois) do update
      set statut_compte=excluded.statut_compte,libelle_poste=excluded.libelle_poste,
          code_offre=excluded.code_offre,montant_ht=excluded.montant_ht,motif=excluded.motif;
  end loop;

  select jsonb_build_object(
    'employes',(select count(*) from public.employes where entreprise_id=v_entreprise),
    'clients',(select count(*) from public.clients where entreprise_id=v_entreprise),
    'chantiers',(select count(*) from public.chantiers where entreprise_id=v_entreprise),
    'devis',(select count(*) from public.devis where entreprise_id=v_entreprise),
    'factures',(select count(*) from public.factures where entreprise_id=v_entreprise),
    'paiements_clients',(select count(*) from public.paiements p join public.factures f on f.id=p.facture_id where f.entreprise_id=v_entreprise),
    'affectations_6_mois',(select count(*) from public.affectations where entreprise_id=v_entreprise and tache like '[JUJU 6M]%'),
    'pointages_6_mois',(select count(*) from public.pointages where entreprise_id=v_entreprise and tache like '[JUJU 6M]%'),
    'articles_stock',(select count(*) from public.articles_stock where entreprise_id=v_entreprise),
    'mouvements_stock_6_mois',(select count(*) from public.mouvements_stock where entreprise_id=v_entreprise and motif like '[JUJU 6M]%'),
    'commandes_fournisseurs',(select count(*) from public.commandes_fournisseurs where entreprise_id=v_entreprise),
    'depenses_fournisseurs',(select count(*) from public.depenses_fournisseurs where entreprise_id=v_entreprise),
    'notes_frais_6_mois',(select count(*) from public.notes_frais where entreprise_id=v_entreprise and description like '[JUJU 6M]%'),
    'demandes_conges_6_mois',(select count(*) from public.demandes_conges where entreprise_id=v_entreprise and commentaire like '[JUJU 6M]%'),
    'vehicules',(select count(*) from public.vehicules where entreprise_id=v_entreprise),
    'outils',(select count(*) from public.outils where entreprise_id=v_entreprise)
  ) into v_resume;

  insert into juju_seed_resultat(entreprise,email_connexion,mot_de_passe_temporaire,code_entreprise,resume)
  values('juju',lower(v_email),v_password,v_code,v_resume);
end
$seed$;

-- IMPORTANT : copiez l'email et le mot de passe affichés par ce dernier résultat.
select
  entreprise as "Entreprise",
  email_connexion as "Email de connexion",
  mot_de_passe_temporaire as "Mot de passe temporaire",
  code_entreprise as "Code entreprise",
  resume as U&"Donn\00E9es pr\00E9sentes"
from juju_seed_resultat;
