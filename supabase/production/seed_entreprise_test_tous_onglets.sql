-- Complément de recette multi-onglets réservé à « Entreprise Test ».
--
-- Prérequis : exécuter d'abord seed_entreprise_test_5_ans.sql.
-- Ce script complète les écrans qui ne sont pas alimentés par le seed historique :
-- banque et paie, tâches, situations, modèles, métrés, CRM, appels d'offres,
-- messagerie, DOE, comptes-rendus, bons de livraison et remises en banque.
--
-- Les coordonnées bancaires sont entièrement fictives. Aucun compte bancaire réel
-- ni aucune connexion à un prestataire n'est créé. Les lignes portent le marqueur
-- [RECETTE ONGLETS] et le script est réexécutable sans toucher aux autres sociétés.

set statement_timeout = '10min';

create temp table if not exists entreprise_test_onglets_resultat (
  entreprise text,
  resume jsonb
);
truncate table entreprise_test_onglets_resultat;

do $seed$
declare
  v_entreprise uuid;
  v_admin uuid;
  v_employes uuid[];
  v_clients uuid[];
  v_chantiers uuid[];
  v_fournisseurs uuid[];
  v_devis_acceptes uuid[];
  v_factures uuid[];
  v_paiements uuid[];
  v_articles uuid[];
  v_employe uuid;
  v_fournisseur uuid;
  v_chantier uuid;
  v_client uuid;
  v_devis uuid;
  v_facture uuid;
  v_paiement uuid;
  v_modele uuid;
  v_metre uuid;
  v_situation uuid;
  v_conversation uuid;
  v_remise uuid;
  v_lot uuid;
  v_rib record;
  v_note record;
  v_depense record;
  v_total numeric;
  v_date date;
  v_i integer;
  v_j integer;
  v_statut text;
  v_resume jsonb;
begin
  select e.id
  into v_entreprise
  from public.entreprises e
  where lower(btrim(e.nom)) = 'entreprise test'
     or lower(coalesce(e.raison_sociale, '')) = 'entreprise test'
  order by case when lower(btrim(e.nom)) = 'entreprise test' then 0 else 1 end, e.created_at
  limit 1;

  if v_entreprise is null then
    raise exception 'Entreprise Test introuvable : aucune donnée n''a été modifiée';
  end if;

  select ue.utilisateur_id
  into v_admin
  from public.utilisateurs_entreprises ue
  left join public.postes p on p.id = ue.poste_id
  where ue.entreprise_id = v_entreprise and ue.statut = 'actif'
  order by
    case when lower(coalesce(p.nom, '')) like '%admin%' then 0
         when lower(coalesce(p.nom, '')) like '%gérant%' then 1
         when lower(coalesce(p.nom, '')) like '%gerant%' then 1
         else 2 end,
    ue.created_at
  limit 1;

  select array_agg(id order by created_at, id)
  into v_employes
  from public.employes
  where entreprise_id = v_entreprise and statut not in ('sorti', 'suspendu');

  select array_agg(id order by created_at, id)
  into v_clients
  from public.clients
  where entreprise_id = v_entreprise;

  select array_agg(id order by created_at, id)
  into v_chantiers
  from public.chantiers
  where entreprise_id = v_entreprise;

  select array_agg(id order by created_at, id)
  into v_fournisseurs
  from public.fournisseurs
  where entreprise_id = v_entreprise and actif;

  select array_agg(id order by date_emission, id)
  into v_devis_acceptes
  from public.devis
  where entreprise_id = v_entreprise and statut = 'accepte' and chantier_id is not null;

  select array_agg(id order by date_emission, id)
  into v_factures
  from public.factures
  where entreprise_id = v_entreprise;

  select array_agg(p.id order by p.date, p.id)
  into v_paiements
  from public.paiements p
  join public.factures f on f.id = p.facture_id
  where f.entreprise_id = v_entreprise;

  select array_agg(id order by created_at, id)
  into v_articles
  from public.articles_stock
  where entreprise_id = v_entreprise and actif;

  if coalesce(array_length(v_employes, 1), 0) = 0
     or coalesce(array_length(v_clients, 1), 0) = 0
     or coalesce(array_length(v_chantiers, 1), 0) = 0
     or coalesce(array_length(v_fournisseurs, 1), 0) = 0 then
    raise exception 'Le seed historique 5 ans doit être exécuté avant ce complément';
  end if;

  -- Nettoyage strictement limité aux données de ce complément.
  delete from public.journal_paiements_bancaires
  where entreprise_id = v_entreprise
    and metadata ->> 'source' = 'seed_entreprise_test_tous_onglets';

  delete from public.lots_virements
  where entreprise_id = v_entreprise and numero like 'VIR-TST-ONG-%';

  delete from public.coordonnees_bancaires
  where entreprise_id = v_entreprise
    and verification_message = '[RECETTE ONGLETS] RIB fictif vérifié';

  delete from public.messages_internes
  where entreprise_id = v_entreprise
    and contenu like '[RECETTE ONGLETS]%';

  delete from public.conversations_internes
  where entreprise_id = v_entreprise
    and titre like '[RECETTE ONGLETS]%';

  delete from public.taches
  where chantier_id in (select id from public.chantiers where entreprise_id = v_entreprise)
    and description like '[RECETTE ONGLETS]%';

  delete from public.comptes_rendus_chantier
  where entreprise_id = v_entreprise
    and contenu like '[RECETTE ONGLETS]%';

  delete from public.appels_contacts
  where entreprise_id = v_entreprise
    and compte_rendu like '[RECETTE ONGLETS]%';

  delete from public.emails_chantier
  where entreprise_id = v_entreprise
    and identifiant_externe like 'recette-onglets-%';

  delete from public.connexions_email
  where entreprise_id = v_entreprise
    and adresse_email = 'demonstration@entreprise-test.example';

  delete from public.appels_offres
  where entreprise_id = v_entreprise and reference like 'AO-TST-%';

  delete from public.doe_generations
  where entreprise_id = v_entreprise
    and manifeste ->> 'source' = 'seed_entreprise_test_tous_onglets';

  delete from public.relances_impayes
  where entreprise_id = v_entreprise
    and message like '[RECETTE ONGLETS]%';

  delete from public.bons_livraison
  where entreprise_id = v_entreprise and numero like 'BL-TST-ONG-%';

  delete from public.remises_banque
  where entreprise_id = v_entreprise and numero like 'RB-TST-ONG-%';

  delete from public.metres
  where entreprise_id = v_entreprise and numero like 'MET-TST-ONG-%';

  delete from public.situations_travaux
  where entreprise_id = v_entreprise
    and notes like '[RECETTE ONGLETS]%';

  -- Coffre RIB : données fictives, non déchiffrables et clairement marquées.
  for v_i in 1..array_length(v_employes, 1) loop
    v_employe := v_employes[v_i];
    if not exists (
      select 1 from public.coordonnees_bancaires
      where entreprise_id = v_entreprise and employe_id = v_employe and actif
    ) then
      insert into public.coordonnees_bancaires(
        entreprise_id, type_beneficiaire, employe_id, titulaire,
        iban_chiffre, iban_hash, iban_quatre_derniers, bic_chiffre,
        actif, verification_statut, verification_message, verifie_at,
        verifie_par, created_by, updated_by, created_at, updated_at
      )
      select
        v_entreprise, 'employe', e.id, concat(e.prenom, ' ', e.nom),
        'DEMO_NON_DECHIFFRABLE_' || encode(digest('employe:' || e.id::text, 'sha256'), 'hex'),
        encode(digest('iban-demo-employe:' || e.id::text, 'sha256'), 'hex'),
        upper(substr(encode(digest(e.id::text, 'sha256'), 'hex'), 1, 4)),
        null, true, 'verifie', '[RECETTE ONGLETS] RIB fictif vérifié',
        now(), v_admin, v_admin, v_admin,
        now() - make_interval(days => 90 + v_i), now()
      from public.employes e
      where e.id = v_employe;
    end if;
  end loop;

  for v_i in 1..least(array_length(v_fournisseurs, 1), 20) loop
    v_fournisseur := v_fournisseurs[v_i];
    if not exists (
      select 1 from public.coordonnees_bancaires
      where entreprise_id = v_entreprise and fournisseur_id = v_fournisseur and actif
    ) then
      insert into public.coordonnees_bancaires(
        entreprise_id, type_beneficiaire, fournisseur_id, titulaire,
        iban_chiffre, iban_hash, iban_quatre_derniers, bic_chiffre,
        actif, verification_statut, verification_message, verifie_at,
        verifie_par, created_by, updated_by, created_at, updated_at
      )
      select
        v_entreprise, 'fournisseur', f.id, f.nom,
        'DEMO_NON_DECHIFFRABLE_' || encode(digest('fournisseur:' || f.id::text, 'sha256'), 'hex'),
        encode(digest('iban-demo-fournisseur:' || f.id::text, 'sha256'), 'hex'),
        upper(substr(encode(digest(f.id::text, 'sha256'), 'hex'), 1, 4)),
        null, true, 'verifie', '[RECETTE ONGLETS] RIB fictif vérifié',
        now(), v_admin, v_admin, v_admin,
        now() - make_interval(days => 120 + v_i), now()
      from public.fournisseurs f
      where f.id = v_fournisseur;
    end if;
  end loop;

  insert into public.connexions_bancaires(
    entreprise_id, provider, environnement, statut, dernier_message, updated_at
  ) values (
    v_entreprise, 'powens', 'test', 'a_configurer',
    '[RECETTE ONGLETS] Données de démonstration uniquement : aucun prestataire bancaire réel n’est connecté.',
    now()
  )
  on conflict(entreprise_id) do update set
    environnement = 'test',
    statut = case when connexions_bancaires.statut in ('pret', 'actif') then connexions_bancaires.statut else 'a_configurer' end,
    dernier_message = excluded.dernier_message,
    updated_at = now();

  -- Tâches opérationnelles : trois par chantier, avec responsables et échéances.
  for v_i in 1..least(array_length(v_chantiers, 1), 80) loop
    v_chantier := v_chantiers[v_i];
    for v_j in 1..3 loop
      insert into public.taches(
        chantier_id, libelle, statut, echeance, responsable_id,
        description, priorite, completed_at, created_at
      ) values (
        v_chantier,
        (array[
          'Préparation et protection des zones',
          'Réalisation des travaux prévus au devis',
          'Contrôle qualité et réception'
        ])[v_j],
        case when v_i <= 55 or (v_j = 1 and v_i <= 70) then 'fait' else 'a_faire' end,
        (select coalesce(date_debut_prevue, current_date) from public.chantiers where id = v_chantier)
          + (v_j * 5),
        v_employes[1 + ((v_i + v_j - 2) % array_length(v_employes, 1))],
        '[RECETTE ONGLETS] Tâche de démonstration liée au chantier et à son équipe.',
        case when v_j = 3 then 'haute' else 'normale' end,
        case when v_i <= 55 or (v_j = 1 and v_i <= 70)
          then (select coalesce(date_debut_reelle, date_debut_prevue, current_date)::timestamptz from public.chantiers where id = v_chantier)
               + make_interval(days => v_j * 5, hours => 17)
          else null end,
        (select coalesce(date_debut_reelle, date_debut_prevue, current_date)::timestamptz from public.chantiers where id = v_chantier)
      );
    end loop;
  end loop;

  -- Bibliothèque de modèles chiffrés.
  for v_i in 1..6 loop
    insert into public.modeles_devis(
      entreprise_id, nom, description, categorie, actif, created_at, updated_at
    ) values (
      v_entreprise,
      (array[
        'Cloison amovible vitrée',
        'Cloison amovible pleine',
        'Cabine sanitaire complète',
        'Panneaux décoratifs muraux',
        'Agencement accueil sur mesure',
        'Pose de sol stratifié'
      ])[v_i],
      '[RECETTE ONGLETS] Modèle complet de démonstration avec main-d’œuvre et fournitures.',
      (array['cloisons', 'cloisons', 'sanitaires', 'décoration', 'agencement', 'sols'])[v_i],
      true, now() - make_interval(months => 72 - v_i), now()
    )
    on conflict(entreprise_id, nom) do update set
      description = excluded.description, categorie = excluded.categorie,
      actif = true, updated_at = now()
    returning id into v_modele;

    if not exists (select 1 from public.lignes_modeles_devis where modele_id = v_modele) then
      insert into public.lignes_modeles_devis(
        entreprise_id, modele_id, designation, description, type,
        quantite, unite, prix_unitaire_ht, taux_tva, ordre
      ) values
        (v_entreprise, v_modele, 'Préparation du chantier', 'Protection, implantation et approvisionnement', 'forfait', 1, 'forfait', 320, 20, 1),
        (v_entreprise, v_modele, 'Main-d’œuvre qualifiée', 'Pose et réglages par une équipe qualifiée', 'main_oeuvre', 24, 'h', 52, 20, 2),
        (v_entreprise, v_modele, 'Fournitures principales', 'Matériaux, profilés, panneaux et quincaillerie', 'fourniture', 1, 'forfait', 1850 + v_i * 190, 20, 3),
        (v_entreprise, v_modele, 'Nettoyage et réception', 'Nettoyage final et contrôle qualité', 'forfait', 1, 'forfait', 280, 20, 4);
    end if;
  end loop;

  -- Métrés reliés aux chantiers et devis.
  for v_i in 1..30 loop
    v_chantier := v_chantiers[1 + ((v_i - 1) % array_length(v_chantiers, 1))];
    select id into v_devis
    from public.devis
    where entreprise_id = v_entreprise and chantier_id = v_chantier
    order by date_emission desc
    limit 1;

    insert into public.metres(
      entreprise_id, chantier_id, devis_id, numero, nom, date_releve,
      notes, created_at, updated_at
    ) values (
      v_entreprise, v_chantier, v_devis,
      'MET-TST-ONG-' || lpad(v_i::text, 3, '0'),
      'Métré chantier de recette ' || v_i,
      current_date - (v_i * 42),
      '[RECETTE ONGLETS] Relevé de dimensions fictif.',
      now() - make_interval(days => v_i * 42), now()
    )
    on conflict(entreprise_id, numero) do update set
      chantier_id = excluded.chantier_id, devis_id = excluded.devis_id,
      nom = excluded.nom, date_releve = excluded.date_releve,
      notes = excluded.notes, updated_at = now()
    returning id into v_metre;

    delete from public.lignes_metres where metre_id = v_metre;
    insert into public.lignes_metres(
      entreprise_id, metre_id, designation, formule,
      longueur, largeur, hauteur, nombre, deduction, resultat, unite, ordre
    ) values
      (v_entreprise, v_metre, 'Cloisons principales', 'longueur*hauteur*nombre-deduction', 12 + v_i % 6, null, 2.70, 2, 3.78, round((12 + v_i % 6) * 2.70 * 2 - 3.78, 3), 'm²', 1),
      (v_entreprise, v_metre, 'Plinthes et profils', 'longueur*nombre', 18 + v_i % 8, null, null, 2, 0, (18 + v_i % 8) * 2, 'ml', 2),
      (v_entreprise, v_metre, 'Portes intégrées', 'nombre', null, null, null, 2 + v_i % 3, 0, 2 + v_i % 3, 'u', 3);
  end loop;

  -- Situations de travaux sur devis acceptés : avancement cumulé cohérent.
  if coalesce(array_length(v_devis_acceptes, 1), 0) > 0 then
    for v_i in 1..least(array_length(v_devis_acceptes, 1), 40) loop
      v_devis := v_devis_acceptes[v_i];
      select chantier_id into v_chantier from public.devis where id = v_devis;
      select coalesce(sum(
        quantite * prix_unitaire_ht * (1 - remise_ligne / 100)
      ), 0) into v_total
      from public.lignes_devis where devis_id = v_devis;

      for v_j in 1..2 loop
        insert into public.situations_travaux(
          entreprise_id, devis_id, chantier_id, numero, date_situation, statut,
          retenue_garantie_pct, montant_marche_ht, montant_cumule_ht,
          montant_periode_ht, montant_retenue, notes, created_by, created_at, updated_at
        ) values (
          v_entreprise, v_devis, v_chantier, v_j,
          (select date_emission from public.devis where id = v_devis) + (v_j * 20),
          case when v_i <= 30 then 'validee' else 'brouillon' end,
          case when v_i % 4 = 0 then 5 else 0 end,
          round(v_total, 2),
          round(v_total * (case when v_j = 1 then 0.40 else 0.75 end), 2),
          round(v_total * (case when v_j = 1 then 0.40 else 0.35 end), 2),
          round(v_total * (case when v_j = 1 then 0.40 else 0.35 end)
            * (case when v_i % 4 = 0 then 0.05 else 0 end), 2),
          '[RECETTE ONGLETS] Situation de travaux fictive et cumulative.',
          v_admin,
          (select date_emission::timestamptz from public.devis where id = v_devis)
            + make_interval(days => v_j * 20),
          now()
        )
        on conflict(entreprise_id, devis_id, numero) do update set
          statut = excluded.statut,
          retenue_garantie_pct = excluded.retenue_garantie_pct,
          montant_marche_ht = excluded.montant_marche_ht,
          montant_cumule_ht = excluded.montant_cumule_ht,
          montant_periode_ht = excluded.montant_periode_ht,
          montant_retenue = excluded.montant_retenue,
          notes = excluded.notes,
          updated_at = now()
        returning id into v_situation;

        delete from public.lignes_situations where situation_id = v_situation;
        insert into public.lignes_situations(
          entreprise_id, situation_id, ligne_devis_id,
          avancement_precedent_pct, avancement_cumule_pct,
          montant_periode_ht, created_at
        )
        select
          v_entreprise, v_situation, ld.id,
          case when v_j = 1 then 0 else 40 end,
          case when v_j = 1 then 40 else 75 end,
          round(ld.quantite * ld.prix_unitaire_ht * (1 - ld.remise_ligne / 100)
            * (case when v_j = 1 then 0.40 else 0.35 end), 2),
          now()
        from public.lignes_devis ld
        where ld.devis_id = v_devis;
      end loop;
    end loop;
  end if;

  -- Bons de livraison signés et à venir.
  for v_i in 1..60 loop
    v_chantier := v_chantiers[1 + ((v_i - 1) % array_length(v_chantiers, 1))];
    select client_id into v_client from public.chantiers where id = v_chantier;
    insert into public.bons_livraison(
      entreprise_id, numero, client_id, chantier_id, date_livraison, statut,
      livre_par, receptionnaire, observations, signature_at, created_at
    ) values (
      v_entreprise, 'BL-TST-ONG-' || lpad(v_i::text, 3, '0'),
      v_client, v_chantier, current_date - (v_i * 25),
      case when v_i <= 52 then 'accepte' when v_i <= 56 then 'livre' else 'brouillon' end,
      v_employes[1 + ((v_i - 1) % array_length(v_employes, 1))],
      case when v_i <= 56 then 'Réceptionnaire Test ' || v_i end,
      '[RECETTE ONGLETS] Livraison fictive contrôlée.',
      case when v_i <= 52 then (current_date - (v_i * 25))::timestamptz + interval '15 hours' end,
      (current_date - (v_i * 25))::timestamptz + interval '8 hours'
    )
    on conflict(entreprise_id, numero) do update set
      statut = excluded.statut, receptionnaire = excluded.receptionnaire,
      observations = excluded.observations, signature_at = excluded.signature_at;
  end loop;

  -- Historique CRM.
  for v_i in 1..180 loop
    v_client := v_clients[1 + ((v_i - 1) % array_length(v_clients, 1))];
    insert into public.appels_contacts(
      entreprise_id, client_id, employe_id, type, sens, objet,
      compte_rendu, a_rappeler_at, termine, created_by, created_at
    ) values (
      v_entreprise, v_client,
      v_employes[1 + ((v_i - 1) % array_length(v_employes, 1))],
      (array['appel', 'email', 'sms', 'courrier', 'rendez_vous'])[1 + ((v_i - 1) % 5)],
      case when v_i % 3 = 0 then 'entrant' else 'sortant' end,
      (array['Suivi du devis', 'Planification des travaux', 'Confirmation de rendez-vous', 'Réception chantier', 'Demande de précision'])[1 + ((v_i - 1) % 5)],
      '[RECETTE ONGLETS] Échange client fictif et historisé.',
      case when v_i > 170 then now() + make_interval(days => v_i - 169) end,
      v_i <= 170,
      v_admin,
      now() - make_interval(days => v_i * 9)
    );
  end loop;

  -- Relances sur factures encore ouvertes.
  v_i := 0;
  for v_facture in
    select f.id
    from public.factures f
    where f.entreprise_id = v_entreprise
      and f.statut not in ('payee', 'annulee')
    order by f.date_echeance, f.id
    limit 40
  loop
    v_i := v_i + 1;
    insert into public.relances_impayes(
      entreprise_id, facture_id, niveau, canal, statut, date_prevue,
      date_envoi, destinataire, sujet, message, created_by, created_at
    )
    select
      v_entreprise, v_facture, 1,
      case when v_i % 4 = 0 then 'telephone' else 'email' end,
      case when v_i <= 32 then 'envoyee' else 'a_envoyer' end,
      coalesce(f.date_echeance, current_date) + 8,
      case when v_i <= 32 then coalesce(f.date_echeance, current_date)::timestamptz + interval '8 days 9 hours' end,
      coalesce(c.email, 'client@example.test'),
      'Rappel de règlement ' || f.numero,
      '[RECETTE ONGLETS] Relance fictive de démonstration.',
      v_admin,
      coalesce(f.date_echeance, current_date)::timestamptz + interval '8 days'
    from public.factures f
    join public.clients c on c.id = f.client_id
    where f.id = v_facture
    on conflict do nothing;
  end loop;

  -- Appels d'offres avec cycle complet.
  for v_i in 1..24 loop
    v_statut := (array['a_etudier', 'en_preparation', 'depose', 'gagne', 'perdu', 'abandonne'])[1 + ((v_i - 1) % 6)];
    v_client := v_clients[1 + ((v_i - 1) % array_length(v_clients, 1))];
    v_chantier := case when v_statut = 'gagne' then v_chantiers[1 + ((v_i - 1) % array_length(v_chantiers, 1))] else null end;
    insert into public.appels_offres(
      entreprise_id, reference, titre, client_id, chantier_id, source_url,
      date_limite, montant_estime_ht, statut, notes, cree_par, created_at, updated_at
    ) values (
      v_entreprise, 'AO-TST-' || to_char(current_date - v_i * 70, 'YYYY') || '-' || lpad(v_i::text, 3, '0'),
      (array['Réaménagement de bureaux', 'Cloisons et espaces collaboratifs', 'Cabines sanitaires ERP', 'Agencement d’un accueil public'])[1 + ((v_i - 1) % 4)],
      v_client, v_chantier, 'https://example.test/appel-offres/' || v_i,
      (current_date - v_i * 70)::timestamptz + interval '30 days 17 hours',
      18000 + v_i * 2750, v_statut,
      '[RECETTE ONGLETS] Appel d’offres fictif pour validation fonctionnelle.',
      v_admin, now() - make_interval(days => v_i * 70), now()
    )
    on conflict(entreprise_id, reference) do update set
      titre = excluded.titre, client_id = excluded.client_id,
      chantier_id = excluded.chantier_id, date_limite = excluded.date_limite,
      montant_estime_ht = excluded.montant_estime_ht,
      statut = excluded.statut, notes = excluded.notes, updated_at = now();
  end loop;

  -- Messagerie : conversations de chantier et échanges directs.
  for v_i in 1..least(array_length(v_chantiers, 1), 20) loop
    v_chantier := v_chantiers[v_i];
    insert into public.conversations_internes(
      entreprise_id, type, titre, chantier_id, cree_par_employe_id,
      derniere_activite_at, created_at
    ) values (
      v_entreprise, 'chantier', '[RECETTE ONGLETS] Équipe chantier ' || v_i,
      v_chantier,
      v_employes[1 + ((v_i - 1) % array_length(v_employes, 1))],
      now() - make_interval(days => v_i), now() - make_interval(days => v_i + 20)
    )
    on conflict(entreprise_id, chantier_id) where type = 'chantier'
    do update set
      titre = excluded.titre,
      derniere_activite_at = excluded.derniere_activite_at
    returning id into v_conversation;

    for v_j in 1..3 loop
      insert into public.messages_internes(
        entreprise_id, conversation_id, auteur_employe_id,
        contenu, lu_at, created_at
      ) values (
        v_entreprise, v_conversation,
        v_employes[1 + ((v_i + v_j - 2) % array_length(v_employes, 1))],
        '[RECETTE ONGLETS] ' || (array[
          'Le matériel est prêt pour l’intervention.',
          'Les plans et consignes ont été vérifiés.',
          'Le compte-rendu de fin de journée est disponible.'
        ])[v_j],
        now() - make_interval(days => v_i, hours => 8 - v_j),
        now() - make_interval(days => v_i, hours => 12 - v_j)
      );
    end loop;
  end loop;

  for v_i in 1..least(array_length(v_employes, 1) - 1, 10) loop
    insert into public.conversations_internes(
      entreprise_id, type, titre, cree_par_employe_id,
      destinataire_employe_id, derniere_activite_at, created_at
    ) values (
      v_entreprise, 'directe', '[RECETTE ONGLETS] Échange direct ' || v_i,
      v_employes[1], v_employes[v_i + 1],
      now() - make_interval(hours => v_i), now() - make_interval(days => 30 + v_i)
    )
    returning id into v_conversation;

    insert into public.messages_internes(
      entreprise_id, conversation_id, auteur_employe_id, contenu, lu_at, created_at
    ) values
      (v_entreprise, v_conversation, v_employes[1],
       '[RECETTE ONGLETS] Merci de confirmer votre planning de demain.',
       now() - make_interval(hours => v_i - 1), now() - make_interval(hours => v_i + 2)),
      (v_entreprise, v_conversation, v_employes[v_i + 1],
       '[RECETTE ONGLETS] Planning confirmé, les documents sont consultés.',
       now() - make_interval(hours => v_i - 1), now() - make_interval(hours => v_i + 1));
  end loop;

  -- Comptes-rendus et DOE.
  for v_i in 1..least(array_length(v_chantiers, 1), 60) loop
    v_chantier := v_chantiers[v_i];
    for v_j in 1..2 loop
      insert into public.comptes_rendus_chantier(
        entreprise_id, chantier_id, auteur_id, titre, contenu,
        transcription_brute, created_at
      ) values (
        v_entreprise, v_chantier, v_admin,
        'Compte-rendu ' || to_char(current_date - (v_i * 18 + v_j), 'DD/MM/YYYY'),
        '[RECETTE ONGLETS] Avancement conforme au planning. Les réserves, heures et matériaux utilisés ont été contrôlés.',
        case when v_j = 2 then 'Dictée de démonstration retranscrite et corrigée.' end,
        now() - make_interval(days => v_i * 18 + v_j)
      );
    end loop;

    insert into public.doe_generations(
      entreprise_id, chantier_id, version, statut, manifeste,
      genere_par, genere_at
    ) values (
      v_entreprise, v_chantier, 1,
      case when v_i <= 45 then 'archive' when v_i <= 52 then 'transmis' else 'genere' end,
      jsonb_build_object(
        'source', 'seed_entreprise_test_tous_onglets',
        'sections', jsonb_build_array('plans', 'fiches techniques', 'procès-verbaux', 'photos', 'réception'),
        'documents', 8 + (v_i % 12),
        'fictif', true
      ),
      v_admin, now() - make_interval(days => v_i * 18)
    )
    on conflict(entreprise_id, chantier_id, version) do update set
      statut = excluded.statut, manifeste = excluded.manifeste,
      genere_at = excluded.genere_at;
  end loop;

  -- Boîte mail de démonstration non connectée et messages déjà classés.
  insert into public.connexions_email(
    entreprise_id, fournisseur, adresse_email, statut,
    erreur_derniere_synchro, created_at, updated_at
  ) values (
    v_entreprise, 'imap', 'demonstration@entreprise-test.example',
    'a_configurer',
    '[RECETTE ONGLETS] Connexion fictive : aucune boîte réelle n’est interrogée.',
    now() - interval '2 years', now()
  )
  on conflict(entreprise_id, adresse_email) do update set
    statut = 'a_configurer',
    erreur_derniere_synchro = excluded.erreur_derniere_synchro,
    updated_at = now();

  for v_i in 1..80 loop
    v_chantier := v_chantiers[1 + ((v_i - 1) % array_length(v_chantiers, 1))];
    insert into public.emails_chantier(
      entreprise_id, chantier_id, identifiant_externe, direction,
      expediteur, destinataires, copie, objet, apercu, recu_at, created_at
    ) values (
      v_entreprise, v_chantier, 'recette-onglets-' || lpad(v_i::text, 4, '0'),
      case when v_i % 3 = 0 then 'sortant' else 'entrant' end,
      case when v_i % 3 = 0 then 'demonstration@entreprise-test.example' else 'client.' || (1 + v_i % 60) || '@example.test' end,
      array[case when v_i % 3 = 0 then 'client.' || (1 + v_i % 60) || '@example.test' else 'demonstration@entreprise-test.example' end],
      case when v_i % 7 = 0 then array['conducteur@example.test'] else '{}'::text[] end,
      (array['Validation des plans', 'Compte-rendu de chantier', 'Confirmation de livraison', 'Réception des travaux'])[1 + ((v_i - 1) % 4)],
      '[RECETTE ONGLETS] Aperçu d’un message fictif classé dans le chantier.',
      now() - make_interval(days => v_i * 8),
      now() - make_interval(days => v_i * 8)
    )
    on conflict(entreprise_id, identifiant_externe) do update set
      chantier_id = excluded.chantier_id, objet = excluded.objet,
      apercu = excluded.apercu, recu_at = excluded.recu_at;
  end loop;

  -- Remises en banque reliées aux paiements clients.
  if coalesce(array_length(v_paiements, 1), 0) > 0 then
    for v_i in 1..12 loop
      insert into public.remises_banque(
        entreprise_id, numero, date_remise, compte_bancaire, mode,
        statut, montant, reference_banque, notes, created_at
      ) values (
        v_entreprise, 'RB-TST-ONG-' || lpad(v_i::text, 3, '0'),
        current_date - (v_i * 30), 'Compte professionnel de démonstration',
        (array['virement', 'cb', 'cheque'])[1 + ((v_i - 1) % 3)],
        case when v_i <= 10 then 'rapprochee' else 'deposee' end,
        0, 'REF-DEMO-' || lpad(v_i::text, 4, '0'),
        '[RECETTE ONGLETS] Remise fictive de démonstration.',
        now() - make_interval(days => v_i * 30)
      )
      on conflict(entreprise_id, numero) do update set
        statut = excluded.statut, reference_banque = excluded.reference_banque,
        notes = excluded.notes
      returning id into v_remise;

      for v_j in 1..least(5, array_length(v_paiements, 1)) loop
        v_paiement := v_paiements[1 + (((v_i - 1) * 5 + v_j - 1) % array_length(v_paiements, 1))];
        insert into public.remises_banque_paiements(remise_id, paiement_id, entreprise_id)
        values(v_remise, v_paiement, v_entreprise)
        on conflict(remise_id, paiement_id) do nothing;
      end loop;

      update public.remises_banque rb
      set montant = coalesce((
        select sum(p.montant)
        from public.remises_banque_paiements rbp
        join public.paiements p on p.id = rbp.paiement_id
        where rbp.remise_id = rb.id
      ), 0)
      where rb.id = v_remise;
    end loop;
  end if;

  -- Champs personnalisés et connecteurs visibles, sans prétendre qu’un service réel est actif.
  insert into public.champs_personnalises(
    entreprise_id, ressource, cle, libelle, type, options, obligatoire, actif, ordre
  ) values
    (v_entreprise, 'chantier', 'numero_marche', 'Numéro de marché', 'texte', '[]', false, true, 1),
    (v_entreprise, 'chantier', 'acces_site', 'Consignes d’accès au site', 'texte_long', '[]', false, true, 2),
    (v_entreprise, 'client', 'origine_contact', 'Origine du contact', 'liste', '["Recommandation","Site web","Appel d’offres","Partenaire"]', false, true, 1),
    (v_entreprise, 'devis', 'charge_affaire', 'Chargé d’affaire', 'texte', '[]', false, true, 1),
    (v_entreprise, 'vehicule', 'carte_carburant', 'Carte carburant', 'texte', '[]', false, true, 1)
  on conflict(entreprise_id, ressource, cle) do update set
    libelle = excluded.libelle, type = excluded.type,
    options = excluded.options, actif = true, ordre = excluded.ordre;

  insert into public.connecteurs_externes(
    entreprise_id, domaine, nom, type, statut, configuration,
    derniere_synchro_at, prochaine_synchro_at, dernier_message, created_at, updated_at
  )
  select v_entreprise, x.domaine, x.nom, x.type, 'a_configurer',
    jsonb_build_object('mode', 'demonstration', 'fictif', true),
    null, null,
    '[RECETTE ONGLETS] Connecteur présenté mais non relié à un compte réel.',
    now() - interval '1 year', now()
  from (values
    ('fournisseur', 'Würth France', 'xlsx'),
    ('fournisseur', 'Foussier', 'punchout_oci'),
    ('fournisseur', 'SIEHR', 'csv'),
    ('fournisseur', 'Aubade eBat', 'edi'),
    ('comptabilite', 'Export expert-comptable', 'xlsx'),
    ('sms', 'Notifications SMS', 'api')
  ) as x(domaine, nom, type)
  on conflict(entreprise_id, domaine, nom) do update set
    statut = case when connecteurs_externes.statut = 'actif' then 'actif' else 'a_configurer' end,
    configuration = excluded.configuration,
    dernier_message = excluded.dernier_message,
    updated_at = now();

  -- Lots bancaires historiques : uniquement notes de frais et factures fournisseurs
  -- possédant un RIB fictif vérifié. Les bulletins PDF sont ajoutés séparément via
  -- l’application afin que chaque fichier privé existe réellement dans Storage.
  v_i := 0;
  for v_note in
    select n.id, n.employe_id, n.montant_ttc, n.reference, n.date_frais,
           c.titulaire, c.iban_chiffre, c.iban_quatre_derniers, c.bic_chiffre
    from public.notes_frais n
    join public.coordonnees_bancaires c
      on c.entreprise_id = n.entreprise_id
     and c.employe_id = n.employe_id
     and c.actif and c.verification_statut = 'verifie'
    where n.entreprise_id = v_entreprise
      and n.statut in ('valide', 'validee', 'exporte_comptabilite')
      and not exists (
        select 1 from public.ordres_virements o
        where o.note_frais_id = n.id and o.statut not in ('echec', 'annule')
      )
    order by n.date_frais desc
    limit 12
  loop
    v_i := v_i + 1;
    insert into public.lots_virements(
      entreprise_id, numero, type_lot, statut, date_execution, devise,
      nombre_ordres, montant_total, provider, provider_statut,
      provider_message, idempotency_key, cree_par, valide_par, transmis_par,
      created_at, valide_at, transmis_at, execute_at, updated_at
    ) values (
      v_entreprise, 'VIR-TST-ONG-NDF-' || lpad(v_i::text, 3, '0'),
      'notes_frais', 'execute', coalesce(v_note.date_frais, current_date) + 7,
      'EUR', 1, v_note.montant_ttc, 'powens', 'execute',
      '[RECETTE ONGLETS] Virement fictif historique, sans effet bancaire.',
      gen_random_uuid(), v_admin, v_admin, v_admin,
      coalesce(v_note.date_frais, current_date)::timestamptz + interval '5 days',
      coalesce(v_note.date_frais, current_date)::timestamptz + interval '5 days 2 hours',
      coalesce(v_note.date_frais, current_date)::timestamptz + interval '6 days',
      coalesce(v_note.date_frais, current_date)::timestamptz + interval '7 days 10 hours',
      coalesce(v_note.date_frais, current_date)::timestamptz + interval '7 days 10 hours'
    )
    returning id into v_lot;

    insert into public.ordres_virements(
      entreprise_id, lot_id, type_beneficiaire, employe_id, note_frais_id,
      titulaire, iban_chiffre, iban_quatre_derniers, bic_chiffre,
      montant, devise, libelle, statut, provider_statut, created_at, updated_at
    ) values (
      v_entreprise, v_lot, 'employe', v_note.employe_id, v_note.id,
      v_note.titulaire, v_note.iban_chiffre, v_note.iban_quatre_derniers, v_note.bic_chiffre,
      v_note.montant_ttc, 'EUR',
      'Remboursement note ' || coalesce(v_note.reference, left(v_note.id::text, 8)),
      'execute', 'execute',
      coalesce(v_note.date_frais, current_date)::timestamptz + interval '5 days',
      coalesce(v_note.date_frais, current_date)::timestamptz + interval '7 days 10 hours'
    );

    insert into public.journal_paiements_bancaires(
      entreprise_id, utilisateur_id, action, ressource_type, ressource_id,
      ancien_statut, nouveau_statut, metadata, created_at
    ) values (
      v_entreprise, v_admin, 'lot_execute', 'lot_virement', v_lot,
      'transmis', 'execute',
      jsonb_build_object('source', 'seed_entreprise_test_tous_onglets', 'fictif', true),
      coalesce(v_note.date_frais, current_date)::timestamptz + interval '7 days 10 hours'
    );
  end loop;

  v_i := 0;
  for v_depense in
    select d.id, d.fournisseur_id,
           round(d.montant_ttc - d.montant_regle, 2) as restant,
           d.numero_piece, d.date_echeance,
           c.titulaire, c.iban_chiffre, c.iban_quatre_derniers, c.bic_chiffre
    from public.depenses_fournisseurs d
    join public.coordonnees_bancaires c
      on c.entreprise_id = d.entreprise_id
     and c.fournisseur_id = d.fournisseur_id
     and c.actif and c.verification_statut = 'verifie'
    where d.entreprise_id = v_entreprise
      and d.statut in ('a_payer', 'payee_partiel')
      and d.montant_ttc > d.montant_regle
      and not exists (
        select 1 from public.ordres_virements o
        where o.depense_fournisseur_id = d.id and o.statut not in ('echec', 'annule')
      )
    order by d.date_echeance desc
    limit 12
  loop
    v_i := v_i + 1;
    insert into public.lots_virements(
      entreprise_id, numero, type_lot, statut, date_execution, devise,
      nombre_ordres, montant_total, provider, provider_statut,
      provider_message, idempotency_key, cree_par, valide_par, transmis_par,
      created_at, valide_at, transmis_at, execute_at, updated_at
    ) values (
      v_entreprise, 'VIR-TST-ONG-FOU-' || lpad(v_i::text, 3, '0'),
      'fournisseurs', 'execute', coalesce(v_depense.date_echeance, current_date),
      'EUR', 1, v_depense.restant, 'powens', 'execute',
      '[RECETTE ONGLETS] Virement fictif historique, sans effet bancaire.',
      gen_random_uuid(), v_admin, v_admin, v_admin,
      coalesce(v_depense.date_echeance, current_date)::timestamptz - interval '2 days',
      coalesce(v_depense.date_echeance, current_date)::timestamptz - interval '2 days' + interval '2 hours',
      coalesce(v_depense.date_echeance, current_date)::timestamptz - interval '1 day',
      coalesce(v_depense.date_echeance, current_date)::timestamptz + interval '10 hours',
      coalesce(v_depense.date_echeance, current_date)::timestamptz + interval '10 hours'
    )
    returning id into v_lot;

    insert into public.ordres_virements(
      entreprise_id, lot_id, type_beneficiaire, fournisseur_id,
      depense_fournisseur_id, titulaire, iban_chiffre, iban_quatre_derniers,
      bic_chiffre, montant, devise, libelle, statut, provider_statut,
      created_at, updated_at
    ) values (
      v_entreprise, v_lot, 'fournisseur', v_depense.fournisseur_id,
      v_depense.id, v_depense.titulaire, v_depense.iban_chiffre,
      v_depense.iban_quatre_derniers, v_depense.bic_chiffre,
      v_depense.restant, 'EUR', 'Facture ' || v_depense.numero_piece,
      'execute', 'execute',
      coalesce(v_depense.date_echeance, current_date)::timestamptz - interval '2 days',
      coalesce(v_depense.date_echeance, current_date)::timestamptz + interval '10 hours'
    );

    insert into public.journal_paiements_bancaires(
      entreprise_id, utilisateur_id, action, ressource_type, ressource_id,
      ancien_statut, nouveau_statut, metadata, created_at
    ) values (
      v_entreprise, v_admin, 'lot_execute', 'lot_virement', v_lot,
      'transmis', 'execute',
      jsonb_build_object('source', 'seed_entreprise_test_tous_onglets', 'fictif', true),
      coalesce(v_depense.date_echeance, current_date)::timestamptz + interval '10 hours'
    );
  end loop;

  select jsonb_build_object(
    'ribs_actifs', (select count(*) from public.coordonnees_bancaires where entreprise_id = v_entreprise and actif),
    'lots_virements', (select count(*) from public.lots_virements where entreprise_id = v_entreprise),
    'journal_bancaire', (select count(*) from public.journal_paiements_bancaires where entreprise_id = v_entreprise),
    'taches', (select count(*) from public.taches t join public.chantiers c on c.id = t.chantier_id where c.entreprise_id = v_entreprise),
    'modeles_devis', (select count(*) from public.modeles_devis where entreprise_id = v_entreprise),
    'metres', (select count(*) from public.metres where entreprise_id = v_entreprise),
    'situations', (select count(*) from public.situations_travaux where entreprise_id = v_entreprise),
    'bons_livraison', (select count(*) from public.bons_livraison where entreprise_id = v_entreprise),
    'crm', (select count(*) from public.appels_contacts where entreprise_id = v_entreprise),
    'relances', (select count(*) from public.relances_impayes where entreprise_id = v_entreprise),
    'appels_offres', (select count(*) from public.appels_offres where entreprise_id = v_entreprise),
    'conversations', (select count(*) from public.conversations_internes where entreprise_id = v_entreprise),
    'messages', (select count(*) from public.messages_internes where entreprise_id = v_entreprise),
    'comptes_rendus', (select count(*) from public.comptes_rendus_chantier where entreprise_id = v_entreprise),
    'doe', (select count(*) from public.doe_generations where entreprise_id = v_entreprise),
    'emails_classes', (select count(*) from public.emails_chantier where entreprise_id = v_entreprise),
    'remises_banque', (select count(*) from public.remises_banque where entreprise_id = v_entreprise),
    'champs_personnalises', (select count(*) from public.champs_personnalises where entreprise_id = v_entreprise),
    'connecteurs_presentes', (select count(*) from public.connecteurs_externes where entreprise_id = v_entreprise)
  ) into v_resume;

  insert into entreprise_test_onglets_resultat(entreprise, resume)
  values('Entreprise Test', v_resume);
end
$seed$;

select entreprise as "Entreprise", resume as "Données par onglet"
from entreprise_test_onglets_resultat;
