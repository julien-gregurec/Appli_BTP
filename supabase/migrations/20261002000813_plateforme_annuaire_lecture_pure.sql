-- ELSATIA — Annuaire plateforme : lecture pure (correctif du train V8).
--
-- Défaut : public.plateforme_annuaire_entreprises() est déclarée STABLE mais
-- exécutait `perform public.appliquer_suspensions_impayes()`, qui fait un UPDATE
-- de public.entreprises. PostgREST exécute une fonction STABLE dans une
-- transaction en lecture seule : l'annuaire de /plateforme échouait avec
-- « cannot execute UPDATE in a read-only transaction » (constaté sur la Preview
-- hébergée, invisible en pgTAP où l'appel se fait en lecture-écriture).
--
-- Correctif :
--   * l'annuaire redevient une lecture pure, toujours STABLE : plus aucune
--     écriture implicite à l'ouverture de l'écran ;
--   * le statut affiché, les onglets et le filtre « statut d'abonnement » lisent
--     un statut EFFECTIF calculé sans écrire, avec le prédicat exact de
--     appliquer_suspensions_impayes() : l'écran reste juste entre deux passages
--     du cron ;
--   * la matérialisation reste à son chemin d'écriture explicite et existant :
--     le cron /api/cron/abonnements, qui appelle appliquer_suspensions_impayes()
--     avec la clé de service (EXECUTE réservé à service_role, inchangé).
--
-- Corps repris à l'identique de 20260908000276 en dehors de ces trois points.
-- Aucun droit, aucune policy, aucune donnée modifiés (create or replace conserve
-- les grants existants).

create or replace function public.plateforme_annuaire_entreprises(
  p_recherche text default '',
  p_onglet text default 'toutes',
  p_tri text default 'date_inscription',
  p_sens text default 'desc',
  p_page integer default 1,
  p_taille integer default 25,
  p_filtres jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_terme      text    := nullif(btrim(p_recherche), '');
  v_terme_n    text    := case when v_terme is null then null else public.elsatia_normaliser_recherche(v_terme) end;
  v_chiffres   text    := case when v_terme is null then null else public.elsatia_chiffres_seuls(v_terme) end;
  v_page       integer := greatest(coalesce(p_page, 1), 1);
  -- Plafond DUR : aucune page ne dépasse 100 lignes, quelle que soit la demande.
  v_taille     integer := least(greatest(coalesce(p_taille, 25), 1), 100);
  v_offset     integer := (v_page - 1) * v_taille;
  v_tri        text    := coalesce(p_tri, 'date_inscription');
  v_sens       text    := case when lower(coalesce(p_sens, 'desc')) = 'asc' then 'asc' else 'desc' end;
  v_maintenant timestamptz := now();
  v_total      integer;
  v_lignes     jsonb;
begin
  -- Le rôle plateforme fait autorité ici, pas l'écran.
  perform public.plateforme_exiger_permission('consulter_plateforme');

  -- La liste blanche de tri interdit toute injection d'ordre depuis l'URL.
  if v_tri not in (
    'nom','date_inscription','forfait','montant','prochaine_echeance',
    'montant_impaye','derniere_activite','comptes_actifs','fin_remise'
  ) then
    v_tri := 'date_inscription';
  end if;

  with base as (
    select
      e.*,
      -- Statut effectif, en lecture pure. Une suspension échue apparaît « suspendu »
      -- même si le cron ne l'a pas encore écrite : même prédicat que
      -- appliquer_suspensions_impayes(), qui reste la seule écriture (cron
      -- /api/cron/abonnements, clé de service).
      case
        when e.suspension_prevue_at is not null
             and e.suspension_prevue_at <= v_maintenant
             and e.abonnement_statut not in ('suspendu', 'annule') then 'suspendu'
        else e.abonnement_statut
      end as abonnement_statut_effectif,
      ab.code_offre           as ab_code_offre,
      ab.periodicite          as ab_periodicite,
      ab.prix_contractuel_ht  as ab_prix_contractuel_ht,
      -- Situation de paiement, dans le même ordre de priorité que le TypeScript :
      -- impayé signalé > état Stripe > essai. Une facturation illisible ne peut
      -- pas produire « à jour » : elle produit 'inconnu'.
      case
        when e.suspension_prevue_at is not null then 'impaye'
        when ab.statut = 'impaye'               then 'impaye'
        when e.derniere_facture_statut = 'uncollectible' then 'impaye'
        when e.abonnement_statut = 'annule'     then 'sans_objet'
        when e.derniere_facture_statut in ('open','draft')
             and e.abonnement_echeance < current_date then 'retard'
        when e.derniere_facture_statut in ('open','draft') then 'en_attente'
        when e.derniere_facture_statut in ('paid','void') then 'a_jour'
        when e.abonnement_statut = 'essai'      then 'sans_objet'
        else 'inconnu'
      end as paiement,
      (select count(*) from public.employes em
        where em.entreprise_id = e.id and em.compte_application_statut = 'actif') as nb_comptes_actifs,
      (select count(*) from public.employes em
        where em.entreprise_id = e.id and em.statut <> 'sorti') as nb_salaries,
      (select max(em.derniere_connexion_at) from public.employes em
        where em.entreprise_id = e.id) as derniere_activite,
      (select coalesce(array_agg(me.module_code order by me.module_code), '{}')
         from public.modules_entreprises me
        where me.entreprise_id = e.id and me.actif) as modules_actifs,
      (select coalesce(array_agg(ae.application_code order by ae.application_code), '{}')
         from public.acces_applications_entreprises ae
        where ae.entreprise_id = e.id and ae.autorise) as applications_actives,
      (select u.email from public.utilisateurs_entreprises ue
         join auth.users u on u.id = ue.utilisateur_id
        where ue.entreprise_id = e.id and ue.statut = 'actif'
        order by ue.created_at limit 1) as proprietaire_email
    from public.entreprises e
    left join public.abonnements_entreprises ab on ab.entreprise_id = e.id
  ),
  filtree as (
    select * from base b
    where
      (v_terme_n is null
       or public.elsatia_normaliser_recherche(b.nom) like '%' || v_terme_n || '%'
       or public.elsatia_normaliser_recherche(coalesce(b.raison_sociale,'')) like '%' || v_terme_n || '%'
       or public.elsatia_normaliser_recherche(coalesce(b.ville,'')) like '%' || v_terme_n || '%'
       or public.elsatia_normaliser_recherche(coalesce(b.code_postal,'')) like '%' || v_terme_n || '%'
       or public.elsatia_normaliser_recherche(coalesce(b.reference_interne,'')) like '%' || v_terme_n || '%'
       or public.elsatia_normaliser_recherche(coalesce(b.code_adhesion,'')) like '%' || v_terme_n || '%'
       or public.elsatia_normaliser_recherche(coalesce(b.proprietaire_email,'')) like '%' || v_terme_n || '%'
       or (length(v_chiffres) >= 3
           and public.elsatia_chiffres_seuls(coalesce(b.siret,'')) like '%' || v_chiffres || '%'))
      and (p_onglet is null or p_onglet = 'toutes'
       or (p_onglet = 'actives'          and b.abonnement_statut_effectif = 'actif' and b.paiement <> 'impaye')
       or (p_onglet = 'essais'           and b.abonnement_statut_effectif = 'essai')
       or (p_onglet = 'a_renouveler'     and (b.abonnement_echeance between current_date and current_date + 30
                                          or b.abonnement_essai_fin between current_date and current_date + 30))
       or (p_onglet = 'paiement_attente' and b.paiement = 'en_attente')
       or (p_onglet = 'retards'          and b.paiement = 'retard')
       or (p_onglet = 'impayes'          and b.paiement = 'impaye')
       or (p_onglet = 'suspendues'       and b.abonnement_statut_effectif = 'suspendu')
       or (p_onglet = 'resiliees'        and (b.abonnement_statut_effectif = 'annule'
                                          or b.abonnement_annulation_prevue_at is not null)))
      and (p_filtres->>'forfait'      is null or p_filtres->>'forfait'      = '' or coalesce(b.abonnement_offre, b.ab_code_offre) = p_filtres->>'forfait')
      and (p_filtres->>'periodicite'  is null or p_filtres->>'periodicite'  = '' or coalesce(b.abonnement_periodicite, b.ab_periodicite) = p_filtres->>'periodicite')
      and (p_filtres->>'statutAbonnement' is null or p_filtres->>'statutAbonnement' = '' or b.abonnement_statut_effectif = p_filtres->>'statutAbonnement')
      and (p_filtres->>'statutPaiement'   is null or p_filtres->>'statutPaiement'   = '' or b.paiement = p_filtres->>'statutPaiement')
      and (p_filtres->>'module'       is null or p_filtres->>'module'       = '' or (p_filtres->>'module')      = any(b.modules_actifs))
      and (p_filtres->>'application'  is null or p_filtres->>'application'  = '' or (p_filtres->>'application') = any(b.applications_actives))
      and (p_filtres->>'ville'        is null or p_filtres->>'ville'        = ''
           or public.elsatia_normaliser_recherche(coalesce(b.ville,''))
              like '%' || public.elsatia_normaliser_recherche(p_filtres->>'ville') || '%')
      and (p_filtres->>'inscritDu'    is null or p_filtres->>'inscritDu'    = '' or b.created_at::date >= (p_filtres->>'inscritDu')::date)
      and (p_filtres->>'inscritAu'    is null or p_filtres->>'inscritAu'    = '' or b.created_at::date <= (p_filtres->>'inscritAu')::date)
      and (p_filtres->>'echeanceDu'   is null or p_filtres->>'echeanceDu'   = '' or b.abonnement_echeance >= (p_filtres->>'echeanceDu')::date)
      and (p_filtres->>'echeanceAu'   is null or p_filtres->>'echeanceAu'   = '' or b.abonnement_echeance <= (p_filtres->>'echeanceAu')::date)
      and (p_filtres->>'remise'       is null or p_filtres->>'remise'       = ''
           or (p_filtres->>'remise' = 'oui' and b.remise_type is not null)
           or (p_filtres->>'remise' = 'non' and b.remise_type is null))
      and (p_filtres->>'comptesMin'   is null or p_filtres->>'comptesMin'   = '' or b.nb_comptes_actifs >= (p_filtres->>'comptesMin')::int)
      and (p_filtres->>'comptesMax'   is null or p_filtres->>'comptesMax'   = '' or b.nb_comptes_actifs <= (p_filtres->>'comptesMax')::int)
      and (p_filtres->>'salariesMin'  is null or p_filtres->>'salariesMin'  = '' or b.nb_salaries       >= (p_filtres->>'salariesMin')::int)
  ),
  page as (
    select f.*, count(*) over () as total_count
    from filtree f
    order by
      -- Une valeur absente se range toujours en fin de liste, dans les deux sens.
      case when v_tri = 'nom'                and v_sens = 'asc'  then public.elsatia_normaliser_recherche(f.nom) end asc  nulls last,
      case when v_tri = 'nom'                and v_sens = 'desc' then public.elsatia_normaliser_recherche(f.nom) end desc nulls last,
      case when v_tri = 'date_inscription'   and v_sens = 'asc'  then f.created_at end asc  nulls last,
      case when v_tri = 'date_inscription'   and v_sens = 'desc' then f.created_at end desc nulls last,
      case when v_tri = 'prochaine_echeance' and v_sens = 'asc'  then f.abonnement_echeance end asc  nulls last,
      case when v_tri = 'prochaine_echeance' and v_sens = 'desc' then f.abonnement_echeance end desc nulls last,
      case when v_tri = 'derniere_activite'  and v_sens = 'asc'  then f.derniere_activite end asc  nulls last,
      case when v_tri = 'derniere_activite'  and v_sens = 'desc' then f.derniere_activite end desc nulls last,
      case when v_tri = 'comptes_actifs'     and v_sens = 'asc'  then f.nb_comptes_actifs end asc  nulls last,
      case when v_tri = 'comptes_actifs'     and v_sens = 'desc' then f.nb_comptes_actifs end desc nulls last,
      case when v_tri = 'montant'            and v_sens = 'asc'  then f.ab_prix_contractuel_ht end asc  nulls last,
      case when v_tri = 'montant'            and v_sens = 'desc' then f.ab_prix_contractuel_ht end desc nulls last,
      f.nom asc
    limit v_taille offset v_offset
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'nom', p.nom,
      'raison_sociale', p.raison_sociale,
      'siret', p.siret,
      'ville', p.ville,
      'code_postal', p.code_postal,
      'reference_interne', p.reference_interne,
      'code_adhesion', p.code_adhesion,
      'proprietaire_nom', null,
      'proprietaire_email', p.proprietaire_email,
      'telephone', null,
      'created_at', p.created_at,
      'abonnement_statut', p.abonnement_statut_effectif,
      'abonnement_offre', coalesce(p.abonnement_offre, p.ab_code_offre),
      'abonnement_periodicite', coalesce(p.abonnement_periodicite, p.ab_periodicite),
      'abonnement_echeance', p.abonnement_echeance,
      'abonnement_essai_fin', p.abonnement_essai_fin,
      'abonnement_annulation_prevue_at', p.abonnement_annulation_prevue_at,
      'prix_contractuel_ht', p.ab_prix_contractuel_ht,
      'remise_type', p.remise_type,
      'remise_valeur', p.remise_valeur,
      'remise_description', p.remise_description,
      'remise_duree_mois', p.remise_duree_mois,
      'remise_appliquee_at', p.remise_appliquee_at,
      'suspension_prevue_at', p.suspension_prevue_at,
      'derniere_facture_statut', p.derniere_facture_statut,
      'derniere_facture_url', p.derniere_facture_url,
      'montant_impaye_ht', null,          -- voir bloc 5
      'nb_comptes_actifs', p.nb_comptes_actifs,
      'nb_comptes_facturables', p.nb_comptes_actifs,
      'nb_salaries', p.nb_salaries,
      'modules_actifs', to_jsonb(p.modules_actifs),
      'applications_actives', to_jsonb(p.applications_actives),
      'option_ia_statut', p.option_ia_statut,
      'derniere_activite', p.derniere_activite
    )), '[]'::jsonb),
    coalesce(max(p.total_count), 0)
  into v_lignes, v_total
  from page p;

  return jsonb_build_object(
    'lignes', v_lignes,
    'total', v_total,
    'page', v_page,
    'taille', v_taille,
    'genere_a', v_maintenant
  );
end;
$$;

notify pgrst, 'reload schema';
