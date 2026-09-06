-- =====================================================================
-- ELSATIA — Entreprise de démonstration pour les captures du site.
-- ELSATIA-GP-SAFE-DEMO-CAPTURE-BUILD-V1
-- =====================================================================
--
-- Environnement : SUPABASE LOCAL UNIQUEMENT (conteneur Docker du poste).
-- Ce fichier vit volontairement dans supabase/local/ et non dans
-- supabase/production/ : il est donc hors du registre de
-- scripts/garde-scripts-production.mjs et ne peut être poussé vers aucun
-- projet distant par ce chemin.
--
-- Lancement : node scripts/seed-demo-captures-local.mjs
-- (le lanceur vérifie que l'URL Supabase et la base sont bien locales,
--  puis positionne le paramètre de session exigé par le garde-fou ci-dessous).
--
-- Aucune donnée réelle : entreprise, clients, chantiers, salariés, devis,
-- factures et pointages sont entièrement fictifs. Les adresses e-mail
-- utilisent exclusivement @example.test (RFC 2606) et les numéros de
-- téléphone la plage 06 39 98 xx xx réservée à la fiction (ARCEP).
--
-- Idempotent : chaque exécution repart d'un état identique en supprimant
-- d'abord, de façon strictement ciblée, les données de la seule entreprise
-- reference_interne = 'DEMO-CAPT'. Aucun TRUNCATE, aucune action globale.
-- =====================================================================

set statement_timeout = '15min';

-- ---------------------------------------------------------------------
-- Garde-fou d'environnement (défense en profondeur — la garantie forte
-- vient du lanceur, qui refuse toute URL/base non locale).
-- ---------------------------------------------------------------------
do $garde$
begin
  if coalesce(current_setting('elsatia.demo_captures_local', true), '') <> 'oui' then
    raise exception 'ARRET SUR : ce script est réservé au Supabase LOCAL. Lancez-le via `node scripts/seed-demo-captures-local.mjs` (qui vérifie la cible et pose elsatia.demo_captures_local).';
  end if;
  if session_user <> 'postgres' then
    raise exception 'ARRET SUR : connexion superutilisateur locale attendue (session_user=%).', session_user;
  end if;
  -- Tripwires : marqueurs connus des bases distantes ELSATIA.
  if exists (select 1 from public.entreprises where reference_interne = 'DEMO-18M') then
    raise exception 'ARRET SUR : entreprise DEMO-18M présente — cette base ressemble à la Production. Aucune écriture effectuée.';
  end if;
  if exists (select 1 from public.entreprises where lower(btrim(nom)) = 'elsatia' or reference_interne = 'ENT-001' and lower(btrim(nom)) like '%elsatia%' and lower(btrim(nom)) not like '%test%') then
    raise exception 'ARRET SUR : entreprise réelle « elsatia » détectée. Aucune écriture effectuée.';
  end if;
end
$garde$;

-- Amorçage de confiance : autorise la création des 12 salariés sans buter
-- sur le contrôle de capacité (n'a d'effet que sous session_user=postgres,
-- cf. public.trg_capacite_personnes_actives).
set elsatia.capacite_personnes_bypass = 'on';

-- ---------------------------------------------------------------------
-- Réinitialisation ciblée de l'entreprise de démonstration.
-- ---------------------------------------------------------------------
do $reset$
declare
  v_ent uuid;
begin
  select id into v_ent from public.entreprises where reference_interne = 'DEMO-CAPT';
  if v_ent is null then
    raise notice 'Aucune entreprise DEMO-CAPT existante : création directe.';
    return;
  end if;

  -- Les verrous métier (devis accepté, facture émise) sont de vrais garde-fous
  -- d'intégrité : on ne les supprime pas, on les suspend le temps du nettoyage
  -- local puis on les rétablit immédiatement.
  alter table public.devis          disable trigger verrou_devis_accepte;
  alter table public.lignes_devis   disable trigger verrou_lignes_devis_accepte;
  alter table public.factures       disable trigger verrou_facture_emise;
  alter table public.lignes_factures disable trigger lignes_factures_brouillon_only;

  update public.utilisateurs set entreprise_active_id = null where entreprise_active_id = v_ent;

  delete from public.paiements       where facture_id in (select id from public.factures where entreprise_id = v_ent);
  delete from public.lignes_factures where facture_id in (select id from public.factures where entreprise_id = v_ent);
  delete from public.factures        where entreprise_id = v_ent;
  delete from public.taches          where chantier_id in (select id from public.chantiers where entreprise_id = v_ent);
  delete from public.lignes_devis    where devis_id in (select id from public.devis where entreprise_id = v_ent);
  delete from public.devis           where entreprise_id = v_ent;
  delete from public.pointages       where entreprise_id = v_ent;
  delete from public.affectations    where entreprise_id = v_ent;
  delete from public.equipes_chantiers where entreprise_id = v_ent;
  delete from public.lignes_commande where entreprise_id = v_ent;
  delete from public.commandes_fournisseurs where entreprise_id = v_ent;
  delete from public.mouvements_stock where entreprise_id = v_ent;
  delete from public.articles_stock  where entreprise_id = v_ent;
  -- Les outils partent avant les salariés : un outil « affecté » doit garder
  -- un employe_id non nul (contrainte CHECK réelle de la table).
  delete from public.outils          where entreprise_id = v_ent;
  delete from public.vehicules       where entreprise_id = v_ent;
  delete from public.habilitations_employe where entreprise_id = v_ent;
  delete from public.employes_cout_horaire where entreprise_id = v_ent;
  delete from public.employes        where entreprise_id = v_ent;
  delete from public.chantiers       where entreprise_id = v_ent;
  delete from public.clients         where entreprise_id = v_ent;
  delete from public.fournisseurs    where entreprise_id = v_ent;
  delete from public.utilisateurs_entreprises where entreprise_id = v_ent;
  delete from public.permissions_poste where entreprise_id = v_ent;
  delete from public.postes          where entreprise_id = v_ent;
  delete from public.entreprises     where id = v_ent;

  alter table public.devis          enable trigger verrou_devis_accepte;
  alter table public.lignes_devis   enable trigger verrou_lignes_devis_accepte;
  alter table public.factures       enable trigger verrou_facture_emise;
  alter table public.lignes_factures enable trigger lignes_factures_brouillon_only;
end
$reset$;

-- ---------------------------------------------------------------------
-- Création du jeu de démonstration.
-- ---------------------------------------------------------------------
do $seed$
declare
  v_ent uuid;
  v_poste uuid;
  v_client uuid;
  v_chantier uuid;
  v_employe uuid;
  v_devis uuid;
  v_facture uuid;
  v_affectation uuid;
  v_fournisseur uuid;
  v_commande uuid;
  v_clients uuid[];
  v_chantiers uuid[];
  v_employes uuid[];
  v_fournisseurs uuid[];
  v_total numeric;
  v_date date;
  v_lundi date;
  v_i integer;
  v_j integer;
  v_mois integer;
  v_semaine integer;
  v_index integer := 0;
  v_statut text;

  -- Sept profils d'accès distincts, comme dans une vraie entreprise.
  v_roles text[][] := array[
    array['Administrateur','tous'],
    array['Conducteur de travaux','acces_clients,gerer_clients,acces_chantiers,gerer_chantiers,acces_devis,gerer_devis,acces_factures,acces_planning,gerer_planning,acces_employes,acces_pointage,gerer_pointage,valider_pointages,voir_heures_chantiers,voir_indicateurs_financiers,acces_achats,acces_stock,acces_flotte,acces_outillage,acces_rentabilite,voir_devis_chantier_sans_prix'],
    array['Chef de chantier','acces_chantiers,gerer_chantiers,acces_planning,gerer_planning,acces_employes,acces_pointage,gerer_pointage,valider_pointages,voir_heures_chantiers,acces_stock,acces_outillage,acces_flotte,voir_devis_chantier_sans_prix'],
    array['Chef d''équipe','acces_chantiers,acces_planning,acces_pointage,saisir_son_pointage,valider_pointages,voir_heures_chantiers,acces_stock,acces_outillage,voir_devis_chantier_sans_prix'],
    array['Ouvrier','acces_chantiers,acces_planning,acces_pointage,saisir_son_pointage,saisir_ses_notes_frais,demander_ses_conges,acces_stock,acces_outillage,voir_devis_chantier_sans_prix'],
    array['Comptable','acces_clients,acces_devis,acces_factures,gerer_factures,acces_achats,gerer_achats,acces_notes_frais,gerer_notes_frais,verifier_notes_frais,acces_rentabilite,voir_indicateurs_financiers,acces_exports,gerer_exports'],
    array['Responsable RH','acces_employes,gerer_employes,acces_planning,acces_pointage,valider_pointages,gerer_conges,voir_heures_chantiers']
  ];

  -- Équipe fictive. Les quatre premiers noms sont ceux retenus pour les captures.
  v_prenoms text[] := array['Jean','Marie','Paul','Sophie','Lucie','Marc','Nadia','Hugo','Chloé','Yanis','Claire','Olivier'];
  v_noms    text[] := array['Exemple','Démonstration','Test','Exemple','Démonstration','Exemple','Test','Démonstration','Exemple','Test','Démonstration','Exemple'];
  v_postes  text[] := array['Administrateur','Conducteur de travaux','Chef de chantier','Chef d''équipe','Ouvrier','Ouvrier','Ouvrier','Ouvrier','Chef d''équipe','Ouvrier','Comptable','Responsable RH'];

  -- Les trois derniers créés remontent en tête de la liste des chantiers
  -- (chantiers_liste_paginee trie par created_at décroissant).
  v_chantiers_visibles text[] := array['Résidence Horizon','Bureaux République','Centre médical Demo'];
  v_chantiers_fond text[] := array[
    'Aménagement de bureaux','Cloisons amovibles','Rénovation accueil',
    'Panneaux décoratifs','Sol stratifié','Cabines sanitaires'
  ];
  v_villes text[] := array['Lyon','Villeurbanne','Bron','Caluire','Écully','Vénissieux'];
begin
  -- ---- Entreprise ---------------------------------------------------
  insert into public.entreprises(
    reference_interne, nom, raison_sociale, siret, adresse, code_postal, ville,
    abonnement_statut, abonnement_offre, abonnement_periodicite,
    abonnement_echeance, abonnement_essai_debut, abonnement_essai_fin, abonnement_note,
    created_at, updated_at
  ) values (
    'DEMO-CAPT', 'ELSATIA Démonstration', 'ELSATIA Démonstration SAS', '99999999999999',
    '12 rue de la Démonstration', '69003', 'Lyon',
    'actif', 'entreprise', 'annuel',
    current_date + 365, current_date - 400, current_date - 370,
    'Entreprise fictive — jeu de démonstration local pour les captures du site ELSATIA.',
    now() - interval '18 months', now()
  ) returning id into v_ent;

  -- ---- Postes et permissions ----------------------------------------
  for v_i in 1..array_length(v_roles, 1) loop
    insert into public.postes(entreprise_id, nom, code_offre, tarif_compte_mensuel)
    values (
      v_ent, v_roles[v_i][1],
      case when v_roles[v_i][1] in ('Administrateur','Conducteur de travaux') then 'premium' else 'standard' end,
      case when v_roles[v_i][1] = 'Administrateur' then 35 when v_roles[v_i][1] = 'Conducteur de travaux' then 25 else 12 end
    )
    returning id into v_poste;

    if v_roles[v_i][2] = 'tous' then
      -- Le mode dépôt est un verrouillage de terminal, jamais un droit ordinaire.
      insert into public.permissions_poste(entreprise_id, poste_id, cle_permission, autorise)
      select v_ent, v_poste, cle, cle <> 'mode_compte_depot' from public.permissions_disponibles;
    else
      insert into public.permissions_poste(entreprise_id, poste_id, cle_permission, autorise)
      select v_ent, v_poste, p.cle, p.cle = any(string_to_array(v_roles[v_i][2], ','))
      from public.permissions_disponibles p;
    end if;
  end loop;

  -- ---- Salariés ------------------------------------------------------
  for v_i in 1..12 loop
    select id into v_poste from public.postes where entreprise_id = v_ent and nom = v_postes[v_i];
    insert into public.employes(
      entreprise_id, prenom, nom, email, telephone, poste, poste_id, type_contrat,
      date_entree, taux_horaire, statut, notes, created_at
    ) values (
      v_ent, v_prenoms[v_i], v_noms[v_i],
      'demo' || lpad(v_i::text, 2, '0') || '@example.test',
      '06399800' || lpad(v_i::text, 2, '0'),
      case when v_i = 1 then 'Gérant' else v_postes[v_i] end, v_poste,
      case when v_i in (10, 12) then 'cdd' when v_i = 7 then 'apprenti' else 'cdi' end,
      (current_date - 540 + v_i * 7), 22 + v_i, 'actif',
      '[DEMO CAPTURES] Salarié fictif — aucune donnée personnelle réelle.',
      now() - interval '18 months'
    ) returning id into v_employe;

    -- Le coût horaire vit désormais dans sa table dédiée (migration 205 :
    -- employes.cout_horaire a été supprimée). Correction D1.
    insert into public.employes_cout_horaire(employe_id, entreprise_id, cout_horaire)
    values (v_employe, v_ent, 26 + v_i * 1.4);

    v_employes := array_append(v_employes, v_employe);
  end loop;

  -- Quelques habilitations, pour que la fiche salarié ne soit pas vide.
  for v_i in 3..8 loop
    insert into public.habilitations_employe(entreprise_id, employe_id, type, libelle, date_obtention, date_expiration)
    values (
      v_ent, v_employes[v_i],
      (array['sst','caces','travail_hauteur','habilitation_electrique'])[1 + ((v_i - 1) % 4)],
      'Habilitation fictive de démonstration',
      current_date - 300 - v_i * 10, current_date + 120 + v_i * 15
    );
  end loop;

  -- ---- Clients -------------------------------------------------------
  for v_i in 1..26 loop
    -- Les trois premiers portent les libellés retenus pour les captures ; les
    -- autres alternent sociétés et particuliers, tous manifestement fictifs.
    insert into public.clients(
      entreprise_id, reference_interne, type, nom, prenom, societe, adresse_facturation,
      code_postal, ville, telephone, email, delai_paiement_jours, statut, notes, created_at
    ) values (
      v_ent, 'CL-' || lpad(v_i::text, 3, '0'),
      case when v_i <= 3 then 'professionnel'
           when v_i % 3 = 0 then 'particulier'
           else 'professionnel' end,
      case v_i
        when 1 then 'Client Démonstration A'
        when 2 then 'Client Démonstration B'
        when 3 then 'Client Exemple'
        when 4 then 'Société Démonstration Nord'
        else case when v_i % 3 = 0
                  then (array['Démonstration','Exemple','Test'])[1 + ((v_i / 3 - 1) % 3)]
                  else 'Société Démonstration ' || v_i end
      end,
      case when v_i > 3 and v_i % 3 = 0
           then (array['Camille','Alex','Dominique','Sacha','Charlie','Noa'])[1 + ((v_i / 3 - 1) % 6)]
           else null end,
      case when v_i > 3 and v_i % 3 = 0 then null
           when v_i = 1 then 'Client Démonstration A'
           when v_i = 2 then 'Client Démonstration B'
           when v_i = 3 then 'Client Exemple'
           when v_i = 4 then 'Société Démonstration Nord'
           else 'Société Démonstration ' || v_i end,
      (10 + v_i) || ' rue de la Construction Fictive',
      '69' || lpad((100 + v_i)::text, 3, '0'),
      v_villes[1 + ((v_i - 1) % 6)],
      '06399801' || lpad(v_i::text, 2, '0'),
      'client' || lpad(v_i::text, 2, '0') || '@example.test',
      30, 'actif', '[DEMO CAPTURES] Client fictif.',
      now() - interval '18 months' + make_interval(days => v_i)
    ) returning id into v_client;

    v_clients := array_append(v_clients, v_client);
  end loop;

  -- ---- Chantiers -----------------------------------------------------
  for v_i in 1..26 loop
    insert into public.chantiers(
      entreprise_id, reference_interne, client_id, nom, adresse, code_postal, ville, statut,
      date_debut_prevue, date_fin_prevue, date_debut_reelle, date_fin_reelle,
      budget_previsionnel, description, created_at
    ) values (
      v_ent, 'CH-' || lpad(v_i::text, 3, '0'), v_clients[v_i],
      case when v_i > 23 then v_chantiers_visibles[v_i - 23]
           else v_chantiers_fond[1 + ((v_i - 1) % 6)] || ' — Démo ' || v_i end,
      (40 + v_i) || ' avenue du Bâtiment Fictif',
      '69' || lpad((200 + v_i)::text, 3, '0'),
      v_villes[1 + ((v_i - 1) % 6)],
      'a_preparer',
      (date_trunc('month', current_date) - interval '17 months')::date + (v_i - 1) * 19,
      (date_trunc('month', current_date) - interval '17 months')::date + (v_i - 1) * 19 + 50,
      (date_trunc('month', current_date) - interval '17 months')::date + (v_i - 1) * 19,
      case when v_i <= 18 then (date_trunc('month', current_date) - interval '17 months')::date + (v_i - 1) * 19 + 47 else null end,
      9500 + v_i * 1450,
      '[DEMO CAPTURES] Chantier fictif.',
      now() - interval '18 months' + make_interval(days => v_i * 2)
    ) returning id into v_chantier;

    v_chantiers := array_append(v_chantiers, v_chantier);
  end loop;

  -- ---- Équipes permanentes ------------------------------------------
  for v_i in 1..26 loop
    insert into public.equipes_chantiers(entreprise_id, chantier_id, employe_id, role_chantier, date_debut, note) values
      (v_ent, v_chantiers[v_i], v_employes[2], 'conducteur_travaux', current_date - 400, '[DEMO CAPTURES] Encadrement'),
      (v_ent, v_chantiers[v_i], v_employes[3 + (v_i % 2)], case when v_i % 2 = 0 then 'chef_chantier' else 'chef_equipe' end, current_date - 400, '[DEMO CAPTURES] Responsable terrain'),
      (v_ent, v_chantiers[v_i], v_employes[5 + ((v_i - 1) % 4)], 'ouvrier', current_date - 400, '[DEMO CAPTURES] Équipe de pose');
  end loop;

  -- ---- Devis, factures et règlements sur 18 mois ---------------------
  -- Les lignes sont posées pendant que le document est encore en brouillon :
  -- verrou_lignes_devis_accepte et lignes_factures_brouillon_only sont de
  -- vrais garde-fous d'intégrité, jamais désactivés ici.
  for v_mois in 0..17 loop
    for v_j in 1..6 loop
      v_index := v_index + 1;
      v_date := (date_trunc('month', current_date) - interval '17 months' + make_interval(months => v_mois))::date + (v_j - 1) * 4 + 1;
      if v_date > current_date then v_date := current_date - 1; end if;
      v_chantier := v_chantiers[1 + ((v_index - 1) % 26)];
      v_statut := case when v_j <= 4 then 'accepte' when v_j = 5 then 'envoye' else 'refuse' end;

      insert into public.devis(
        entreprise_id, client_id, chantier_id, statut, date_emission, date_validite,
        conditions, notes_client, notes_internes, created_at
      )
      select v_ent, c.client_id, v_chantier, 'brouillon', v_date, v_date + 30,
             'Validité 30 jours — acompte de 30 % à la commande.',
             'Document fictif de démonstration — sans valeur contractuelle.',
             '[DEMO CAPTURES] Historique fictif.',
             v_date::timestamptz + interval '9 hours'
      from public.chantiers c where c.id = v_chantier
      returning id into v_devis;

      insert into public.lignes_devis(devis_id, designation, description, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre) values
        (v_devis, 'Pose et main-d''œuvre', 'Préparation, implantation et pose', 'main_oeuvre', 18 + (v_index * 7 % 96), 'h', 52 + (v_index % 9), 0, 20, 1),
        (v_devis, 'Fournitures de chantier', 'Profilés, panneaux et fixations', 'fourniture', 8 + (v_index * 5 % 64), 'u', 98 + (v_index % 45), 0, 20, 2),
        (v_devis, 'Protection et nettoyage', 'Forfait chantier', 'forfait', 1, 'forfait', 280 + (v_index % 7) * 90, 0, 20, 3);

      update public.devis set statut = v_statut where id = v_devis;

      if v_statut = 'accepte' then
        insert into public.factures(
          entreprise_id, client_id, chantier_id, devis_origine_id, type, statut,
          date_emission, date_echeance, notes_client, notes_internes, created_at
        )
        select v_ent, d.client_id, d.chantier_id, d.id,
               case when v_index % 7 = 0 then 'acompte' else 'simple' end, 'brouillon',
               v_date + 7, v_date + 37,
               'Facture fictive de démonstration — sans valeur comptable.',
               '[DEMO CAPTURES] Facture fictive.',
               (v_date + 7)::timestamptz + interval '10 hours'
        from public.devis d where d.id = v_devis
        returning id into v_facture;

        insert into public.lignes_factures(facture_id, designation, description, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre)
        select v_facture, designation, description, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre
        from public.lignes_devis where devis_id = v_devis;

        update public.factures set statut = 'envoyee' where id = v_facture;
        select montant_ttc into v_total from public.factures where id = v_facture;

        -- Quatre factures sur cinq sont réglées, dont certaines partiellement :
        -- le tableau de bord montre ainsi de l'encaissé et du reste à encaisser.
        if v_index % 5 <> 0 then
          insert into public.paiements(facture_id, montant, date, mode, reference, created_at)
          values (
            v_facture,
            case when v_index % 7 = 0 then round(v_total * 0.4, 2) else v_total end,
            least(v_date + 18, current_date),
            case when v_index % 4 = 0 then 'carte_en_ligne' when v_index % 4 = 1 then 'cb' else 'virement' end,
            'DEMO-REG-' || lpad(v_index::text, 4, '0'),
            (least(v_date + 18, current_date))::timestamptz + interval '12 hours'
          );
        end if;
      end if;
    end loop;
  end loop;

  -- Trois devis en brouillon, datés du mois courant : la liste des devis
  -- montre les quatre statuts (brouillon, envoyé, accepté, refusé).
  for v_i in 1..3 loop
    v_chantier := v_chantiers[23 + v_i];
    insert into public.devis(entreprise_id, client_id, chantier_id, statut, date_emission, date_validite,
                             conditions, notes_client, notes_internes, created_at)
    select v_ent, c.client_id, v_chantier, 'brouillon', current_date - v_i, current_date + 30 - v_i,
           'Validité 30 jours — acompte de 30 % à la commande.',
           'Document fictif de démonstration — sans valeur contractuelle.',
           '[DEMO CAPTURES] Devis en préparation.',
           (current_date - v_i)::timestamptz + interval '11 hours'
    from public.chantiers c where c.id = v_chantier
    returning id into v_devis;

    insert into public.lignes_devis(devis_id, designation, description, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre) values
      (v_devis, 'Pose et main-d''œuvre', 'Préparation, implantation et pose', 'main_oeuvre', 30 + v_i * 4, 'h', 55, 0, 20, 1),
      (v_devis, 'Fournitures de chantier', 'Profilés, panneaux et fixations', 'fourniture', 16 + v_i * 2, 'u', 115, 0, 20, 2),
      (v_devis, 'Protection et nettoyage', 'Forfait chantier', 'forfait', 1, 'forfait', 350, 0, 20, 3);
  end loop;

  -- ---- Planning et pointages (correction D2) -------------------------
  -- La génération va de S-30 à S+1 : la semaine courante et la suivante sont
  -- remplies, donc /planning et le bloc « Prochaines affectations » du tableau
  -- de bord ne sont jamais vides. Les pointages ne sont posés que sur des
  -- journées passées : on ne pointe pas une journée qui n'a pas eu lieu.
  v_lundi := date_trunc('week', current_date)::date;
  for v_semaine in -30..1 loop
    for v_j in 0..4 loop
      v_date := v_lundi + v_semaine * 7 + v_j;
      for v_i in 1..6 loop
        v_employe := v_employes[v_i];
        v_chantier := v_chantiers[1 + ((v_semaine + 30 + v_j + v_i) % 26)];
        insert into public.affectations(
          entreprise_id, chantier_id, employe_id, date, heures, tache, notes, type_activite, created_at
        ) values (
          v_ent, v_chantier, v_employe, v_date,
          case when v_j = 4 then 7 else 8 end,
          (array['Pose et finitions','Préparation du support','Cloisonnement','Reprise et nettoyage','Implantation'])[1 + ((v_i + v_j) % 5)],
          'Planning fictif de démonstration.', 'chantier',
          v_date::timestamptz + interval '6 hours'
        ) returning id into v_affectation;

        if v_date < current_date then
          insert into public.pointages(
            entreprise_id, employe_id, chantier_id, date, heures_normales, heures_supplementaires,
            pause_minutes, tache, commentaire, verification_statut, verification_at,
            affectation_id, heures_attendues, origine_pointage, created_at, updated_at
          ) values (
            v_ent, v_employe, v_chantier, v_date,
            case when v_j = 4 then 7 else 8 end,
            case when (v_i + v_semaine) % 11 = 0 then 0.5 else 0 end,
            45, 'Travail réalisé', 'Historique fictif de démonstration.',
            'valide', v_date::timestamptz + interval '18 hours',
            v_affectation, case when v_j = 4 then 7 else 8 end, 'gps_complet',
            v_date::timestamptz + interval '18 hours', v_date::timestamptz + interval '18 hours'
          );
        end if;
      end loop;
    end loop;
  end loop;

  -- ---- Fournisseurs, achats, stock, flotte, outillage ----------------
  for v_i in 1..8 loop
    insert into public.fournisseurs(entreprise_id, reference, nom, contact_nom, email, telephone,
                                    adresse, code_postal, ville, delai_paiement_jours, notes, actif)
    values (v_ent, 'FRN-' || lpad(v_i::text, 3, '0'),
            'Fournisseur Démonstration ' || v_i, 'Service Démonstration',
            'fournisseur' || lpad(v_i::text, 2, '0') || '@example.test',
            '06399802' || lpad(v_i::text, 2, '0'),
            v_i || ' rue des Fournisseurs Fictifs', '69004', 'Lyon', 30,
            '[DEMO CAPTURES] Compte fournisseur fictif.', true)
    returning id into v_fournisseur;

    v_fournisseurs := array_append(v_fournisseurs, v_fournisseur);
  end loop;

  for v_i in 1..24 loop
    insert into public.articles_stock(entreprise_id, reference, designation, marque, unite,
                                      quantite_stock, seuil_alerte, prix_achat_ht, prix_vente_ht,
                                      emplacement, actif)
    values (v_ent, 'ART-' || lpad(v_i::text, 3, '0'),
            (array['Plaque de plâtre BA13','Rail 48 mm','Montant 48 mm','Vis TTPC 25 mm','Enduit à joint','Bande à joint'])[1 + ((v_i - 1) % 6)] || ' — lot ' || v_i,
            'Marque Démonstration', (array['u','ml','u','boîte','sac','rouleau'])[1 + ((v_i - 1) % 6)],
            -- Quatre articles passent volontairement sous le seuil : le widget
            -- « alertes de stock » du tableau de bord a de quoi s'afficher.
            case when v_i % 6 = 0 then 3 else 40 + v_i * 5 end,
            case when v_i % 6 = 0 then 12 else 10 end,
            4 + v_i * 0.6, 7 + v_i * 0.9,
            'Dépôt — allée ' || (1 + ((v_i - 1) % 4)), true);
  end loop;

  for v_i in 1..6 loop
    insert into public.vehicules(entreprise_id, immatriculation, marque, modele, type, statut,
                                 date_mise_circulation, kilometrage, controle_technique_echeance,
                                 assurance_echeance, prochain_entretien_date, notes, created_at)
    values (v_ent, 'DE-' || lpad((100 + v_i)::text, 3, '0') || '-MO', 'Renault',
            case when v_i % 2 = 0 then 'Master' else 'Trafic' end, 'utilitaire', 'actif',
            current_date - (900 + v_i * 80), 28000 + v_i * 7300,
            current_date + 20 + v_i * 12, current_date + 200, current_date + 15 + v_i * 9,
            '[DEMO CAPTURES] Véhicule fictif.', now() - interval '18 months');
  end loop;

  for v_i in 1..18 loop
    insert into public.outils(entreprise_id, reference, designation, categorie, marque, modele,
                              numero_serie, statut, etat, employe_id, date_achat, prix_achat_ht,
                              prochaine_verification, notes, created_at)
    values (v_ent, 'OUT-' || lpad(v_i::text, 3, '0'),
            (array['Perforateur','Visseuse','Laser de chantier','Scie circulaire','Aspirateur de chantier','Meuleuse'])[1 + ((v_i - 1) % 6)] || ' ' || v_i,
            case when v_i % 6 = 3 then 'mesure' else 'electroportatif' end,
            'Marque Démonstration', 'Modèle ' || v_i, 'DEMOSN' || lpad(v_i::text, 5, '0'),
            'affecte', case when v_i % 5 = 0 then 'usage' else 'bon' end,
            v_employes[3 + ((v_i - 1) % 6)], current_date - (400 + v_i * 7), 180 + v_i * 22,
            current_date + 25 + v_i * 6, '[DEMO CAPTURES] Outil fictif.', now() - interval '18 months');
  end loop;

  -- Quatre commandes fournisseurs en cours : le tableau de bord affiche des
  -- livraisons attendues plutôt qu'un bloc vide.
  for v_i in 1..4 loop
    v_fournisseur := v_fournisseurs[v_i];
    insert into public.commandes_fournisseurs(entreprise_id, numero, fournisseur_id, chantier_id,
                                              statut, date_commande, date_livraison_prevue, notes)
    values (v_ent, 'CMD-DEMO-' || lpad(v_i::text, 3, '0'), v_fournisseur, v_chantiers[23 + ((v_i - 1) % 3)],
            case when v_i % 2 = 0 then 'confirmee' else 'envoyee' end,
            current_date - v_i * 3, current_date + v_i * 2,
            '[DEMO CAPTURES] Commande fictive.')
    returning id into v_commande;

    insert into public.lignes_commande(entreprise_id, commande_id, designation, quantite, unite, prix_unitaire_ht, taux_tva, ordre) values
      (v_ent, v_commande, 'Plaques de plâtre BA13', 60 + v_i * 10, 'u', 6.40, 20, 1),
      (v_ent, v_commande, 'Rails et montants 48 mm', 40 + v_i * 5, 'ml', 3.10, 20, 2);
  end loop;

  -- ---- Statuts de chantier : variété visuelle assumée -----------------
  -- Posé en dernier : les triggers devis_sync_chantier / facture_sync_chantier
  -- font avancer le statut au fil des documents, on fixe donc l'état final ici.
  for v_i in 1..26 loop
    update public.chantiers
    set statut = case
          when v_i <= 12 then 'facture'
          when v_i <= 17 then 'termine'
          when v_i = 18 then 'en_pause'
          when v_i <= 21 then 'en_cours'
          when v_i = 22 then 'a_preparer'
          when v_i = 23 then 'accepte'
          when v_i <= 25 then 'en_cours'
          else 'accepte'
        end,
        -- Un chantier encore ouvert dont l'échéance est déjà passée s'affiche
        -- « en retard » sur le tableau de bord : les chantiers actifs reçoivent
        -- donc une fin prévisionnelle à venir, et aucune date de fin réelle.
        date_fin_prevue = case when v_i <= 17 then date_fin_prevue
                               else current_date + 12 + (v_i - 17) * 9 end,
        date_fin_reelle = case when v_i <= 17 then date_fin_reelle else null end,
        updated_at = now() - make_interval(days => 26 - v_i)
    where id = v_chantiers[v_i];
  end loop;

  raise notice 'Entreprise de démonstration créée : %', v_ent;
end
$seed$;

reset elsatia.capacite_personnes_bypass;

-- ---------------------------------------------------------------------
-- Contrôle final.
-- ---------------------------------------------------------------------
select
  e.nom                                                                                as "Entreprise",
  (select count(*) from public.employes   where entreprise_id = e.id)                  as "Salariés",
  (select count(*) from public.clients    where entreprise_id = e.id)                  as "Clients",
  (select count(*) from public.chantiers  where entreprise_id = e.id)                  as "Chantiers",
  (select count(*) from public.devis      where entreprise_id = e.id)                  as "Devis",
  (select count(*) from public.factures   where entreprise_id = e.id)                  as "Factures",
  (select count(*) from public.affectations where entreprise_id = e.id)                as "Affectations",
  (select count(*) from public.affectations where entreprise_id = e.id
     and date between date_trunc('week', current_date)::date
                  and date_trunc('week', current_date)::date + 6)                      as "Affectations semaine courante",
  (select count(*) from public.pointages  where entreprise_id = e.id)                  as "Pointages"
from public.entreprises e
where e.reference_interne = 'DEMO-CAPT';
