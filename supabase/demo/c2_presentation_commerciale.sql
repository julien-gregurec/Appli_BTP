-- C2-A — Complément local/Preview pour les captures commerciales ELSATIA.
--
-- IMPORTANT : ce fichier complète uniquement l'entreprise marquée DEMO-18M.
-- Il ne doit jamais être exécuté sur elsatia-production. Le jeu de base doit
-- avoir été créé auparavant par creer_entreprise_demo_18_mois.sql.
-- Le script est idempotent : il peut être rejoué sans dupliquer les données.

begin;

do $c2$
declare
  v_entreprise uuid;
  v_chantier_principal uuid;
  v_chantier_secondaire uuid;
  v_chantier_a_venir uuid;
  v_client_principal uuid;
  v_client_secondaire uuid;
  v_client_a_venir uuid;
  v_employes uuid[];
  v_jour date := date_trunc('week', current_date)::date + 1;
begin
  select id into v_entreprise
  from public.entreprises
  where reference_interne = 'DEMO-18M'
  limit 1;

  if v_entreprise is null then
    raise exception 'C2-A refuse : entreprise DEMO-18M absente';
  end if;

  if exists (
    select 1 from public.entreprises
    where id = v_entreprise and reference_interne = 'ENT-001'
  ) then
    raise exception 'C2-A refuse : la cible correspond a l entreprise reelle';
  end if;

  update public.entreprises
  set nom = 'Atelier Bâtiment Lyonnais',
      raison_sociale = 'Atelier Bâtiment Lyonnais',
      updated_at = now()
  where id = v_entreprise;

  select id, client_id into v_chantier_principal, v_client_principal
  from public.chantiers
  where entreprise_id = v_entreprise and reference_interne = 'DEMO-CHA-024';

  select id, client_id into v_chantier_secondaire, v_client_secondaire
  from public.chantiers
  where entreprise_id = v_entreprise and reference_interne = 'DEMO-CHA-027';

  select id, client_id into v_chantier_a_venir, v_client_a_venir
  from public.chantiers
  where entreprise_id = v_entreprise and reference_interne = 'DEMO-CHA-030';

  if v_chantier_principal is null or v_chantier_secondaire is null or v_chantier_a_venir is null then
    raise exception 'C2-A refuse : les chantiers de reference sont incomplets';
  end if;

  update public.clients
  set type = 'professionnel', nom = null, prenom = null,
      societe = 'Groupe Montchat Immobilier',
      raison_sociale = 'Groupe Montchat Immobilier',
      email = 'contact.montchat@example.test',
      telephone = '0478002400'
  where id = v_client_principal and entreprise_id = v_entreprise;

  update public.clients
  set type = 'professionnel', nom = null, prenom = null,
      societe = 'Résidence Les Terrasses',
      raison_sociale = 'Résidence Les Terrasses',
      email = 'gestion.terrasses@example.test',
      telephone = '0478002700'
  where id = v_client_secondaire and entreprise_id = v_entreprise;

  update public.clients
  set type = 'professionnel', nom = null, prenom = null,
      societe = 'Cabinet Nova Architecture',
      raison_sociale = 'Cabinet Nova Architecture',
      email = 'projets.nova@example.test',
      telephone = '0478003000'
  where id = v_client_a_venir and entreprise_id = v_entreprise;

  update public.chantiers
  set nom = 'Rénovation du siège — Lyon Part-Dieu',
      adresse = '24 boulevard Vivier-Merle', code_postal = '69003', ville = 'Lyon',
      statut = 'en_cours', date_debut_prevue = current_date - 35,
      date_fin_prevue = current_date + 24, date_debut_reelle = current_date - 33,
      date_fin_reelle = null, budget_previsionnel = 48500
  where id = v_chantier_principal and entreprise_id = v_entreprise;

  update public.chantiers
  set nom = 'Aménagement des parties communes — Villeurbanne',
      adresse = '18 cours Émile-Zola', code_postal = '69100', ville = 'Villeurbanne',
      statut = 'en_cours', date_debut_prevue = current_date - 18,
      date_fin_prevue = current_date + 31, date_debut_reelle = current_date - 16,
      date_fin_reelle = null, budget_previsionnel = 36200
  where id = v_chantier_secondaire and entreprise_id = v_entreprise;

  update public.chantiers
  set nom = 'Extension des bureaux — Bron',
      adresse = '6 avenue Franklin-Roosevelt', code_postal = '69500', ville = 'Bron',
      statut = 'accepte', date_debut_prevue = current_date + 21,
      date_fin_prevue = current_date + 72, date_debut_reelle = null,
      date_fin_reelle = null, budget_previsionnel = 41900
  where id = v_chantier_a_venir and entreprise_id = v_entreprise;

  insert into public.comptes_rendus_chantier (
    entreprise_id, chantier_id, titre, contenu, transcription_brute, created_at
  )
  select v_entreprise, v_chantier_principal,
    '[C2] Réunion de chantier — avancement semaine',
    'Les cloisons du deuxième étage sont terminées. La pose des plafonds avance conformément au planning. Les menuiseries seront livrées jeudi matin. Aucun point de sécurité bloquant n''a été signalé.',
    'Démo fictive C2 — aucune donnée réelle.', now() - interval '2 days'
  where not exists (
    select 1 from public.comptes_rendus_chantier
    where entreprise_id = v_entreprise and chantier_id = v_chantier_principal
      and titre = '[C2] Réunion de chantier — avancement semaine'
  );

  insert into public.comptes_rendus_chantier (
    entreprise_id, chantier_id, titre, contenu, transcription_brute, created_at
  )
  select v_entreprise, v_chantier_principal,
    '[C2] Point livraison et réserves',
    'Livraison des luminaires confirmée. Deux réserves mineures ont été relevées dans la zone accueil et affectées à l''équipe de finition.',
    'Démo fictive C2 — aucune donnée réelle.', now() - interval '6 days'
  where not exists (
    select 1 from public.comptes_rendus_chantier
    where entreprise_id = v_entreprise and chantier_id = v_chantier_principal
      and titre = '[C2] Point livraison et réserves'
  );

  select array_agg(id order by reference_interne) into v_employes
  from public.employes
  where entreprise_id = v_entreprise and reference_interne like 'DEMO-EMP-%';

  if coalesce(array_length(v_employes, 1), 0) < 8 then
    raise exception 'C2-A refuse : equipe de demonstration incomplete';
  end if;

  insert into public.notes_frais (
    entreprise_id, employe_id, chantier_id, date_frais, montant_ttc,
    categorie, description, justificatif_nom, statut, fournisseur,
    montant_ht, montant_tva, taux_tva, moyen_paiement,
    commentaire_salarie, type_document_principal, statut_document,
    soumis_at, lieu_hors_chantier, reference
  )
  select v_entreprise, v_employes[5], v_chantier_principal, current_date - 3,
    46.80, 'repas', 'Repas de l''équipe — réunion de coordination',
    'ticket-repas-demo-c2.pdf', 'valide', 'Brasserie du Parc',
    42.55, 4.25, 10, 'carte',
    '[DEMO C2] Justificatif fictif préparé pour la présentation commerciale.',
    'ticket_caisse', 'original_recu', now() - interval '3 days', null,
    'EXP-DEMO-C2-001'
  where not exists (
    select 1 from public.notes_frais
    where entreprise_id = v_entreprise and reference = 'EXP-DEMO-C2-001'
  );

  insert into public.notes_frais (
    entreprise_id, employe_id, chantier_id, date_frais, montant_ttc,
    categorie, description, justificatif_nom, statut, fournisseur,
    montant_ht, montant_tva, taux_tva, moyen_paiement,
    commentaire_salarie, type_document_principal, statut_document,
    soumis_at, lieu_hors_chantier, reference
  )
  select v_entreprise, v_employes[6], v_chantier_principal, current_date - 5,
    78.40, 'carburant', 'Carburant utilitaire chantier',
    'ticket-carburant-demo-c2.pdf', 'en_verification', 'Station Rhône Services',
    65.33, 13.07, 20, 'carte',
    '[DEMO C2] Justificatif fictif préparé pour la présentation commerciale.',
    'ticket_caisse', 'original_recu', now() - interval '5 days', null,
    'EXP-DEMO-C2-002'
  where not exists (
    select 1 from public.notes_frais
    where entreprise_id = v_entreprise and reference = 'EXP-DEMO-C2-002'
  );

  insert into public.notes_frais (
    entreprise_id, employe_id, chantier_id, date_frais, montant_ttc,
    categorie, description, justificatif_nom, statut, fournisseur,
    montant_ht, montant_tva, taux_tva, moyen_paiement,
    commentaire_salarie, type_document_principal, statut_document,
    soumis_at, lieu_hors_chantier, reference
  )
  select v_entreprise, v_employes[7], v_chantier_secondaire, current_date - 1,
    24.90, 'fournitures', 'Consommables de finition',
    'facture-fournitures-demo-c2.pdf', 'soumis', 'Pro Matériaux Lyon',
    20.75, 4.15, 20, 'carte',
    '[DEMO C2] Justificatif fictif préparé pour la présentation commerciale.',
    'facture', 'original_recu', now() - interval '1 day', null,
    'EXP-DEMO-C2-003'
  where not exists (
    select 1 from public.notes_frais
    where entreprise_id = v_entreprise and reference = 'EXP-DEMO-C2-003'
  );

  for i in 3..7 loop
    insert into public.affectations (
      entreprise_id, chantier_id, employe_id, date, heures,
      tache, notes, type_activite, created_at
    )
    select v_entreprise,
      case when i in (3, 5, 6) then v_chantier_principal else v_chantier_secondaire end,
      v_employes[i], v_jour,
      case when i = 3 then 7 else 8 end,
      '[C2 CAPTURE] Coordination, pose et finitions',
      'Planning fictif commun aux captures ordinateur et smartphone.',
      'chantier', now()
    where not exists (
      select 1 from public.affectations
      where entreprise_id = v_entreprise and employe_id = v_employes[i]
        and date = v_jour and tache = '[C2 CAPTURE] Coordination, pose et finitions'
    );
  end loop;
end;
$c2$;

commit;

select jsonb_build_object(
  'entreprise', (select nom from public.entreprises where reference_interne = 'DEMO-18M'),
  'comptes_rendus_c2', (
    select count(*) from public.comptes_rendus_chantier cr
    join public.entreprises e on e.id = cr.entreprise_id
    where e.reference_interne = 'DEMO-18M' and cr.titre like '[C2]%'
  ),
  'notes_frais_c2', (
    select count(*) from public.notes_frais n
    join public.entreprises e on e.id = n.entreprise_id
    where e.reference_interne = 'DEMO-18M' and n.reference like 'EXP-DEMO-C2-%'
  ),
  'affectations_c2', (
    select count(*) from public.affectations a
    join public.entreprises e on e.id = a.entreprise_id
    where e.reference_interne = 'DEMO-18M' and a.tache = '[C2 CAPTURE] Coordination, pose et finitions'
  )
) as "Preparation C2-A";
