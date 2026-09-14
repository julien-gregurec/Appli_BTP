-- GP V1 — enregistrement v2 d'un brouillon en SECURITY DEFINER (même modèle que `conflits_planning`, 290).
--
-- Constat (recette preview 2026-09-13, après la 292) : la RPC s'exécutait avec les droits de l'appelant et
-- chaque ligne insérée, relue ou journalisée payait la politique RLS ligne à ligne (`est_membre_actif`) :
-- journal des prix 452 ms + insertion 448 ms pour 500 lignes en local (plans auto_explain), et
-- `statement_timeout` (8 s, erreur 57014) dès ~200 lignes sur Supabase. La fonction devient SECURITY
-- DEFINER avec les gardes explicites : membre actif, droit `gerer_devis`, devis / client / chantier /
-- commercial appartenant à `p_entreprise_id` ; le reste du corps est strictement celui de la 286.
-- `anon` et `service_role` restent révoqués ; `search_path` figé.

CREATE OR REPLACE FUNCTION public.enregistrer_devis_brouillon_v2(p_entreprise_id uuid, p_devis_id uuid, p_devis jsonb, p_ouvrages jsonb, p_lignes jsonb, p_couts jsonb DEFAULT '[]'::jsonb, p_revision integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_statut text;
  v_revision integer;
  v_couts boolean := public.a_permission(p_entreprise_id, 'gerer_couts_devis');
  v_commercial uuid := nullif(p_devis ->> 'commercial_employe_id', '')::uuid;
begin
  if not public.a_permission(p_entreprise_id, 'gerer_devis') then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  -- SECURITY DEFINER (20260913000293) : les politiques RLS ne filtrent plus ligne à ligne ; les
  -- appartenances à l'entreprise sont vérifiées ici, avant toute lecture ou écriture.
  if not public.est_membre_actif(p_entreprise_id) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if p_devis_id is not null and not exists (
    select 1 from public.devis d where d.id = p_devis_id and d.entreprise_id = p_entreprise_id
  ) then
    raise exception 'Devis introuvable';
  end if;
  if not exists (
    select 1 from public.clients c where c.id = (p_devis ->> 'client_id')::uuid and c.entreprise_id = p_entreprise_id
  ) then
    raise exception 'Client introuvable dans cette entreprise.';
  end if;
  if nullif(p_devis ->> 'chantier_id', '') is not null and not exists (
    select 1 from public.chantiers ch where ch.id = (p_devis ->> 'chantier_id')::uuid and ch.entreprise_id = p_entreprise_id
  ) then
    raise exception 'Chantier introuvable dans cette entreprise.';
  end if;
  -- GP V1 (lot D) : droits fins sur le prix de vente et les remises, vérifiés EN BASE.
  perform public.verifier_droits_prix_devis(p_entreprise_id, p_devis_id, p_devis, p_lignes);
  if jsonb_typeof(coalesce(p_lignes, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Un devis compte au moins une ligne.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lignes) l
    where coalesce(l ->> 'type_ligne', 'libre') not in ('article', 'libre', 'titre', 'sous_titre', 'commentaire', 'sous_total', 'remise', 'vide', 'separateur', 'saut_page')
  ) then
    raise exception 'Type de ligne inconnu.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lignes) l
    where (coalesce(btrim(l ->> 'designation'), '') = '' and coalesce(l ->> 'type_ligne', 'libre') not in ('vide', 'separateur', 'saut_page'))
       or coalesce((l ->> 'remise_ligne')::numeric, 0) not between 0 and 100
       or coalesce((l ->> 'taux_tva')::numeric, -1) not between 0 and 100
       or (l ->> 'quantite') is null or (l ->> 'prix_unitaire_ht') is null
  ) then
    raise exception 'Ligne invalide : désignation, quantité, prix, remise (0 à 100) et TVA (0 à 100) sont requis.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lignes) l
    where (coalesce(l ->> 'type_ligne', 'libre') = 'remise'
           and ((l ->> 'quantite')::numeric <> 1 or (l ->> 'prix_unitaire_ht')::numeric > 0 or coalesce((l ->> 'remise_ligne')::numeric, 0) <> 0))
       or (coalesce(l ->> 'type_ligne', 'libre') not in ('article', 'libre', 'remise')
           and ((l ->> 'quantite')::numeric <> 0 or (l ->> 'prix_unitaire_ht')::numeric <> 0 or coalesce((l ->> 'remise_ligne')::numeric, 0) <> 0))
  ) then
    raise exception 'Une ligne de structure ne porte ni quantité ni prix ; une remise est un montant négatif à quantité 1.';
  end if;
  if coalesce((p_devis ->> 'remise_globale')::numeric, 0) not between 0 and 100 then
    raise exception 'La remise globale doit être comprise entre 0 et 100 %%.';
  end if;
  if v_commercial is not null and not exists (
    select 1 from public.employes e where e.id = v_commercial and e.entreprise_id = p_entreprise_id
  ) then
    raise exception 'Commercial introuvable dans cette entreprise.';
  end if;

  if p_devis_id is null then
    insert into public.devis (
      entreprise_id, client_id, chantier_id, date_emission, date_validite,
      conditions, notes_client, notes_internes, remise_globale, filigrane, moteur_presentation,
      reference_interne, reference_client, mode_reglement, conditions_paiement, commercial_employe_id, revision
    ) values (
      p_entreprise_id,
      (p_devis ->> 'client_id')::uuid,
      nullif(p_devis ->> 'chantier_id', '')::uuid,
      coalesce(nullif(p_devis ->> 'date_emission', '')::date, current_date),
      nullif(p_devis ->> 'date_validite', '')::date,
      nullif(p_devis ->> 'conditions', ''),
      nullif(p_devis ->> 'notes_client', ''),
      nullif(p_devis ->> 'notes_internes', ''),
      coalesce((p_devis ->> 'remise_globale')::numeric, 0),
      case when jsonb_typeof(p_devis -> 'filigrane') = 'object' then p_devis -> 'filigrane' end,
      2,
      nullif(btrim(p_devis ->> 'reference_interne'), ''),
      nullif(btrim(p_devis ->> 'reference_client'), ''),
      nullif(btrim(p_devis ->> 'mode_reglement'), ''),
      nullif(btrim(p_devis ->> 'conditions_paiement'), ''),
      v_commercial,
      1
    ) returning id, revision into v_id, v_revision;
  else
    select statut, revision into v_statut, v_revision
    from public.devis where id = p_devis_id and entreprise_id = p_entreprise_id
    for update;
    if not found then raise exception 'Devis introuvable'; end if;
    if v_statut <> 'brouillon' then raise exception 'Seul un devis brouillon peut etre modifie'; end if;
    if p_revision is not null and p_revision <> v_revision then
      raise exception 'Ce devis a été modifié ailleurs depuis votre dernière lecture (révision % au lieu de %). Rechargez-le avant d''enregistrer.', v_revision, p_revision
        using errcode = '40001';
    end if;
    v_id := p_devis_id;

    -- Journal : valeurs d'avant, comparées par clé stable de ligne, AVANT la réécriture.
    insert into public.devis_prix_journal (entreprise_id, devis_id, cle_ligne, champ, ancienne, nouvelle)
    select p_entreprise_id, v_id, a.cle_ligne, c.champ, c.ancienne, c.nouvelle
    from public.lignes_devis a
    join jsonb_to_recordset(p_lignes) as n(cle_ligne text, quantite numeric, prix_unitaire_ht numeric, remise_ligne numeric)
      on n.cle_ligne = a.cle_ligne
    cross join lateral (values
      ('prix_unitaire_ht', a.prix_unitaire_ht, n.prix_unitaire_ht),
      ('quantite', a.quantite, n.quantite),
      ('remise_ligne', a.remise_ligne, coalesce(n.remise_ligne, 0))
    ) as c(champ, ancienne, nouvelle)
    where a.devis_id = v_id and c.ancienne is distinct from c.nouvelle;

    insert into public.devis_prix_journal (entreprise_id, devis_id, cle_ligne, champ, ancienne, nouvelle)
    select p_entreprise_id, v_id, '*', 'remise_globale', d.remise_globale, coalesce((p_devis ->> 'remise_globale')::numeric, 0)
    from public.devis d
    where d.id = v_id and d.remise_globale is distinct from coalesce((p_devis ->> 'remise_globale')::numeric, 0);

    update public.devis set
      client_id = (p_devis ->> 'client_id')::uuid,
      chantier_id = nullif(p_devis ->> 'chantier_id', '')::uuid,
      date_emission = coalesce(nullif(p_devis ->> 'date_emission', '')::date, date_emission),
      date_validite = nullif(p_devis ->> 'date_validite', '')::date,
      conditions = nullif(p_devis ->> 'conditions', ''),
      notes_client = nullif(p_devis ->> 'notes_client', ''),
      notes_internes = nullif(p_devis ->> 'notes_internes', ''),
      remise_globale = coalesce((p_devis ->> 'remise_globale')::numeric, 0),
      filigrane = case when jsonb_typeof(p_devis -> 'filigrane') = 'object' then p_devis -> 'filigrane' end,
      moteur_presentation = 2,
      reference_interne = nullif(btrim(p_devis ->> 'reference_interne'), ''),
      reference_client = nullif(btrim(p_devis ->> 'reference_client'), ''),
      mode_reglement = nullif(btrim(p_devis ->> 'mode_reglement'), ''),
      conditions_paiement = nullif(btrim(p_devis ->> 'conditions_paiement'), ''),
      commercial_employe_id = v_commercial,
      revision = revision + 1,
      updated_at = now()
    where id = v_id
    returning revision into v_revision;

    delete from public.lignes_devis where devis_id = v_id;
    delete from public.devis_ouvrages where devis_id = v_id;
  end if;

  insert into public.devis_ouvrages (
    devis_id, entreprise_id, cle, ordre, ouvrage_id, ouvrage_version, ouvrage_reference, ouvrage_nom,
    categorie, unite_principale, quantite_principale, options, saisies, libelle_client, description_client,
    mode_presentation, instantane_modele, modifications_manuelles
  )
  select v_id, p_entreprise_id, o.cle, coalesce(o.ordre, 0), o.ouvrage_id, o.ouvrage_version, o.ouvrage_reference,
         o.ouvrage_nom, o.categorie, o.unite_principale, o.quantite_principale, coalesce(o.options, '[]'::jsonb),
         coalesce(o.saisies, '{}'::jsonb), o.libelle_client, o.description_client,
         coalesce(o.mode_presentation, 'regroupe'), o.instantane_modele, coalesce(o.modifications_manuelles, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(p_ouvrages, '[]'::jsonb)) as o(
    cle text, ordre integer, ouvrage_id uuid, ouvrage_version integer, ouvrage_reference text, ouvrage_nom text,
    categorie text, unite_principale text, quantite_principale numeric, options jsonb, saisies jsonb,
    libelle_client text, description_client text, mode_presentation text, instantane_modele jsonb,
    modifications_manuelles jsonb);

  insert into public.lignes_devis (
    devis_id, designation, description, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre,
    cle_ligne, ouvrage_cle, origine_ligne, source_catalogue, source_id, reference_interne_instantane,
    reference_fabricant_instantane, nature, parametres_quantite, quantite_forcee, visible_client,
    afficher_quantite, afficher_prix, description_client_personnalisee, motif_ajustement, detail_calcul,
    type_ligne, remise_section_pct, commentaire_interne, famille_instantane, fournisseur_instantane, code_fournisseur_instantane
  )
  select v_id, coalesce(l.designation, ''), l.description, coalesce(l.type, 'forfait'), l.quantite, coalesce(l.unite, 'u'),
         l.prix_unitaire_ht, coalesce(l.remise_ligne, 0), l.taux_tva, coalesce(l.ordre, 0),
         coalesce(nullif(l.cle_ligne, ''), gen_random_uuid()::text), l.ouvrage_cle, coalesce(l.origine_ligne, 'saisie'),
         l.source_catalogue, l.source_id, l.reference_interne_instantane, l.reference_fabricant_instantane,
         l.nature, l.parametres_quantite, coalesce(l.quantite_forcee, false), coalesce(l.visible_client, true),
         coalesce(l.afficher_quantite, true), coalesce(l.afficher_prix, true), l.description_client_personnalisee,
         l.motif_ajustement, l.detail_calcul,
         coalesce(l.type_ligne, 'libre'), l.remise_section_pct, nullif(btrim(l.commentaire_interne), ''),
         l.famille_instantane, l.fournisseur_instantane, l.code_fournisseur_instantane
  from jsonb_to_recordset(p_lignes) as l(
    designation text, description text, type text, quantite numeric, unite text, prix_unitaire_ht numeric,
    remise_ligne numeric, taux_tva numeric, ordre integer, cle_ligne text, ouvrage_cle text, origine_ligne text,
    source_catalogue text, source_id uuid, reference_interne_instantane text, reference_fabricant_instantane text,
    nature text, parametres_quantite jsonb, quantite_forcee boolean, visible_client boolean,
    afficher_quantite boolean, afficher_prix boolean, description_client_personnalisee text,
    motif_ajustement text, detail_calcul text,
    type_ligne text, remise_section_pct numeric, commentaire_interne text, famille_instantane text,
    fournisseur_instantane text, code_fournisseur_instantane text);

  if v_couts then
    insert into public.devis_prix_journal (entreprise_id, devis_id, cle_ligne, champ, ancienne, nouvelle)
    select p_entreprise_id, v_id, n.cle_ligne, c.champ, c.ancienne, c.nouvelle
    from jsonb_to_recordset(coalesce(p_couts, '[]'::jsonb)) as n(cle_ligne text, prix_achat_ht numeric, cout_main_oeuvre_ht numeric, coefficient numeric)
    left join public.lignes_devis_couts a on a.devis_id = v_id and a.cle_ligne = n.cle_ligne
    cross join lateral (values
      ('prix_achat_ht', a.prix_achat_ht, n.prix_achat_ht),
      ('cout_main_oeuvre_ht', a.cout_main_oeuvre_ht, coalesce(n.cout_main_oeuvre_ht, 0)),
      ('coefficient', a.coefficient, n.coefficient)
    ) as c(champ, ancienne, nouvelle)
    where p_devis_id is not null and c.ancienne is distinct from c.nouvelle
      and not (c.champ <> 'prix_achat_ht' and a.cle_ligne is null and c.nouvelle is null);

    delete from public.lignes_devis_couts where devis_id = v_id;
    insert into public.lignes_devis_couts (devis_id, cle_ligne, entreprise_id, prix_achat_ht, cout_main_oeuvre_ht, coefficient)
    select v_id, n.cle_ligne, p_entreprise_id, n.prix_achat_ht, coalesce(n.cout_main_oeuvre_ht, 0), n.coefficient
    from jsonb_to_recordset(coalesce(p_couts, '[]'::jsonb)) as n(cle_ligne text, prix_achat_ht numeric, cout_main_oeuvre_ht numeric, coefficient numeric)
    where n.prix_achat_ht is not null
      and exists (select 1 from public.lignes_devis l where l.devis_id = v_id and l.cle_ligne = n.cle_ligne);
  else
    perform public.purger_couts_orphelins_devis(v_id);
  end if;

  return jsonb_build_object('id', v_id, 'revision', v_revision);
end $function$;

revoke all on function public.enregistrer_devis_brouillon_v2(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer) from public, anon, service_role;
grant execute on function public.enregistrer_devis_brouillon_v2(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer) to authenticated;
