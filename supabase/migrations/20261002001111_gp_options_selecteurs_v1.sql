-- Train canonique V9 : numéro d'origine 20260930000404 (GP residual data correctness (claude/optimistic-hopper-0ytout)), renuméroté 20261002001111
-- (bloc V9 strictement après 20261002000901 / 20261002001003, ordre relatif d'origine conservé) ; corps inchangé.
-- ELSATIA-GP-RESIDUAL-DATA-CORRECTNESS-V1 — listes de choix (chantiers,
-- salariés) complètes et rapides.
--
-- Constat (docs/qualification/ELSATIA_GP_RESIDUAL_DATA_CORRECTNESS_V1.md §2,
-- recette navigateur à 20 000 lignes) : une vingtaine d'écrans lisent « tous
-- les chantiers ouverts » ou « tous les salariés actifs » pour alimenter un
-- sélecteur, par PostgREST, triés par nom. Deux défauts :
--   - au-delà de 1 000 lignes, la liste est tronquée sans erreur (un chantier
--     ou un salarié devient impossible à choisir) ;
--   - le tri par nom oblige à évaluer la RLS de chaque ligne avant d'en rendre
--     une (peut_consulter_chantier ≈ 2 ms par chantier) : 10 à 40 s par écran
--     mesurées à 20 000 chantiers / salariés.
--
-- Correctif : jsonb (non plafonné) avec la visibilité RLS évaluée une fois :
--   chantiers → peut_consulter_chantier(e, id) : tous (acces_chantiers ou
--               gerer_chantiers) ou l'ensemble des chantiers assignés au compte
--               (mêmes conditions que la fonction, voir gp_client_chantiers_page) ;
--   employes  → est_membre_actif(e) (seule policy SELECT de la table) ; colonnes
--               non sensibles uniquement (prénom, nom, poste, statut).
-- Parité vérifiée par supabase/tests/gp_residuel_agregats_v1.test.sql.

create or replace function public.gp_options_chantiers(
  p_entreprise_id uuid,
  p_statuts_exclus text[] default array['archive', 'annule'],
  p_client_id uuid default null,
  p_tri text default 'nom'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tous boolean;
  v_ids uuid[] := '{}';
  v jsonb;
begin
  perform public.gp_exiger_membre(p_entreprise_id);
  v_tous := public.a_permission(p_entreprise_id, 'acces_chantiers') or public.a_permission(p_entreprise_id, 'gerer_chantiers');
  if not v_tous then
    if not public.a_permission(p_entreprise_id, 'voir_chantiers_assignes') then
      return '[]'::jsonb;
    end if;
    select coalesce(array_agg(distinct x.chantier_id), '{}') into v_ids
    from (
      select ec.chantier_id
      from public.employes e
      join public.equipes_chantiers ec on ec.entreprise_id = p_entreprise_id and ec.employe_id = e.id
      where e.entreprise_id = p_entreprise_id and e.utilisateur_id = auth.uid() and e.statut not in ('sorti', 'suspendu')
        and ec.date_debut <= current_date and (ec.date_fin is null or ec.date_fin >= current_date)
      union all
      select a.chantier_id
      from public.employes e
      join public.affectations a on a.entreprise_id = p_entreprise_id and a.employe_id = e.id
      where e.entreprise_id = p_entreprise_id and e.utilisateur_id = auth.uid() and e.statut not in ('sorti', 'suspendu')
        and a.date = current_date
    ) x;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nom', c.nom, 'reference_interne', c.reference_interne,
                                                'client_id', c.client_id, 'ville', c.ville, 'statut', c.statut)
                            order by case when p_tri = 'recent' then null else c.nom end, c.created_at desc, c.id), '[]'::jsonb)
    into v
  from public.chantiers c
  where c.entreprise_id = p_entreprise_id
    and (v_tous or c.id = any(v_ids))
    and (p_client_id is null or c.client_id = p_client_id)
    and not (coalesce(c.statut, '') = any(coalesce(p_statuts_exclus, '{}')));
  return v;
end;
$$;

create or replace function public.gp_options_employes(p_entreprise_id uuid, p_inclure_inactifs boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.gp_exiger_membre(p_entreprise_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'prenom', e.prenom, 'nom', e.nom, 'poste', e.poste, 'statut', e.statut)
                     order by e.nom, e.prenom, e.id)
    from public.employes e
    where e.entreprise_id = p_entreprise_id
      and (case when p_inclure_inactifs then e.statut not in ('sorti', 'suspendu') else e.statut = 'actif' end)
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.gp_options_chantiers(uuid, text[], uuid, text) from public, anon;
revoke all on function public.gp_options_employes(uuid, boolean) from public, anon;
grant execute on function public.gp_options_chantiers(uuid, text[], uuid, text) to authenticated;
grant execute on function public.gp_options_employes(uuid, boolean) to authenticated;

-- Clients (création de devis, de chantier, CRM, interventions, appels
-- d'offres) : un artisan qui travaille pour des particuliers dépasse vite
-- 1 000 clients. Visibilité RLS : est_membre_actif ∧ a_permission(acces_clients).
create or replace function public.gp_options_clients(
  p_entreprise_id uuid,
  p_statut text default null,
  p_statut_exclu text default null,
  p_tri text default 'recent'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.gp_exiger_membre(p_entreprise_id);
  if not public.a_permission(p_entreprise_id, 'acces_clients') then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'nom', c.nom, 'prenom', c.prenom, 'societe', c.societe, 'email', c.email, 'statut', c.statut)
                     order by case when p_tri = 'societe' then c.societe when p_tri = 'nom' then c.nom end,
                              case when p_tri in ('societe', 'nom') then null else c.created_at end desc,
                              c.id)
    from public.clients c
    where c.entreprise_id = p_entreprise_id
      and (p_statut is null or c.statut = p_statut)
      and (p_statut_exclu is null or c.statut is distinct from p_statut_exclu)
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.gp_options_clients(uuid, text, text, text) from public, anon;
grant execute on function public.gp_options_clients(uuid, text, text, text) to authenticated;

-- Index des listes « dernières communications / relances » du CRM (tri par date
-- sous RLS, limite 100).
create index if not exists appels_contacts_entreprise_created_idx on public.appels_contacts (entreprise_id, created_at desc);
create index if not exists relances_impayes_entreprise_date_idx on public.relances_impayes (entreprise_id, date_prevue desc);

-- Statistiques étendues (dépendances fonctionnelles) : un tiers, un véhicule,
-- un outil, un chantier ou un client appartient à UNE entreprise. Sans elles,
-- le planificateur multiplie les sélectivités de entreprise_id et de la
-- colonne parente, sous-estime le nombre de lignes (76 estimées pour 1 462
-- réelles) et choisit bitmap + tri plutôt que le parcours d'index ordonné avec
-- LIMIT : la RLS est alors évaluée sur toutes les lignes (5,8 s pour 51 lignes
-- mesurées sur la fiche sous-traitant à 1 462 missions).
create statistics if not exists stat_sous_traitants_chantiers_entreprise_tiers (dependencies) on entreprise_id, fournisseur_id from public.sous_traitants_chantiers;
create statistics if not exists stat_depenses_entreprise_tiers (dependencies) on entreprise_id, fournisseur_id from public.depenses_fournisseurs;
create statistics if not exists stat_depenses_entreprise_vehicule (dependencies) on entreprise_id, vehicule_id from public.depenses_fournisseurs;
create statistics if not exists stat_depenses_entreprise_outil (dependencies) on entreprise_id, outil_id from public.depenses_fournisseurs;
create statistics if not exists stat_depenses_entreprise_chantier (dependencies) on entreprise_id, chantier_id from public.depenses_fournisseurs;
create statistics if not exists stat_releves_entreprise_vehicule (dependencies) on entreprise_id, vehicule_id from public.releves_kilometrage;
create statistics if not exists stat_mouvements_outillage_entreprise_outil (dependencies) on entreprise_id, outil_id from public.mouvements_outillage;
create statistics if not exists stat_devis_entreprise_client (dependencies) on entreprise_id, client_id from public.devis;
create statistics if not exists stat_factures_entreprise_client (dependencies) on entreprise_id, client_id from public.factures;
create statistics if not exists stat_pieces_jointes_messages_entreprise_chantier (dependencies) on entreprise_id, chantier_id from public.pieces_jointes_messages;
create statistics if not exists stat_notes_frais_entreprise_chantier (dependencies) on entreprise_id, chantier_id from public.notes_frais;
analyze public.sous_traitants_chantiers, public.depenses_fournisseurs, public.releves_kilometrage, public.mouvements_outillage,
        public.devis, public.factures, public.pieces_jointes_messages, public.notes_frais;

-- Paie : liste des anomalies ouvertes d'une période (par niveau), même
-- visibilité que paie_periode_synthese (nb_anomalies). Sous RLS, la policy
-- (sous-requête sur le dossier + peut_gerer_paie) coûtait ~16 ms par anomalie
-- triée : 8 s pour 500 anomalies sur 20 000.
create or replace function public.paie_anomalies_page(
  p_entreprise_id uuid,
  p_periode_id uuid,
  p_dossier_id uuid default null,
  p_limite integer default 500
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gestion boolean;
  v_miens uuid[];
  v_limite integer := least(greatest(coalesce(p_limite, 500), 1), 2000);
begin
  perform public.gp_exiger_membre(p_entreprise_id);
  if p_periode_id is null then
    raise exception 'GP_AGREGAT_PARAMETRES' using errcode = '22023';
  end if;
  v_gestion := public.peut_gerer_paie(p_entreprise_id);
  select coalesce(array_agg(e.id), '{}') into v_miens
  from public.employes e
  where e.entreprise_id = p_entreprise_id and e.utilisateur_id = auth.uid();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'dossier_id', x.dossier_id, 'niveau', x.niveau, 'code', x.code, 'description', x.description,
                                        'justification', x.justification, 'created_at', x.created_at)
                     order by x.niveau, x.created_at, x.id)
    from (
      select a.*
      from public.anomalies_paie a
      join public.dossiers_paie_salaries d on d.id = a.dossier_id
      where a.periode_id = p_periode_id and a.corrigee_at is null
        and d.entreprise_id = p_entreprise_id
        and (v_gestion or d.employe_id = any(v_miens))
        and (p_dossier_id is null or a.dossier_id = p_dossier_id)
      order by a.niveau, a.created_at, a.id
      limit v_limite
    ) x), '[]'::jsonb);
end;
$$;

revoke all on function public.paie_anomalies_page(uuid, uuid, uuid, integer) from public, anon;
grant execute on function public.paie_anomalies_page(uuid, uuid, uuid, integer) to authenticated;

-- Parc (pages /flotte et /outillage) : compteurs du bandeau calculés en base.
-- Ils comptaient une liste PostgREST plafonnée à 1 000 (« N outil(s) ·
-- X vérification(s) échue(s) · Y hors service »). Visibilité : vehicules et
-- outils → est_membre_actif (seule policy SELECT).
create or replace function public.gp_parc_synthese(p_entreprise_id uuid, p_aujourdhui date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.gp_exiger_membre(p_entreprise_id);
  return jsonb_build_object(
    'vehicules', (select jsonb_build_object(
        'nb', count(*),
        'alertes', count(*) filter (where controle_technique_echeance <= p_aujourdhui or assurance_echeance <= p_aujourdhui or prochain_entretien_date <= p_aujourdhui))
      from public.vehicules where entreprise_id = p_entreprise_id),
    'outils', (select jsonb_build_object(
        'nb', count(*),
        'alertes', count(*) filter (where prochaine_verification <= p_aujourdhui),
        'hors_service', count(*) filter (where statut = 'hors_service'))
      from public.outils where entreprise_id = p_entreprise_id));
end;
$$;

revoke all on function public.gp_parc_synthese(uuid, date) from public, anon;
grant execute on function public.gp_parc_synthese(uuid, date) to authenticated;

-- Annuaires /fournisseurs et /sous-traitants paginés par curseur (nom, id).
create index if not exists fournisseurs_annuaire_curseur_idx on public.fournisseurs (entreprise_id, type_tiers, nom, id);

-- Tableau de bord : effectif actif compté en base (le briefing « N salariés
-- présents » comptait une lecture plafonnée à 1 000). employes → est_membre_actif.
create or replace function public.gp_effectif_actif(p_entreprise_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.gp_exiger_membre(p_entreprise_id);
  return (select count(*) from public.employes where entreprise_id = p_entreprise_id and statut = 'actif');
end;
$$;

revoke all on function public.gp_effectif_actif(uuid) from public, anon;
grant execute on function public.gp_effectif_actif(uuid) to authenticated;

-- Tableau de bord : alertes du parc filtrées en base. Les véhicules actifs
-- étaient lus sans borne (alertes manquées au-delà de 1 000 véhicules) et les
-- outils triés sous RLS (8 s à 20 000). Seuls les éléments qui produisent une
-- alerte sont rendus : échéance à `p_horizon_jours` jours ou kilométrage
-- d'entretien atteint, échéance la plus proche d'abord, avec le nombre exact.
-- Visibilité : vehicules et outils → est_membre_actif.
create or replace function public.gp_alertes_parc(p_entreprise_id uuid, p_aujourdhui date, p_horizon_jours integer default 30, p_limite integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limite date := p_aujourdhui + coalesce(p_horizon_jours, 30);
  v_n integer := least(greatest(coalesce(p_limite, 200), 1), 1000);
begin
  perform public.gp_exiger_membre(p_entreprise_id);
  return (
    with vehicules as materialized (
      select v.id, v.immatriculation, v.marque, v.modele, v.kilometrage, v.controle_technique_echeance, v.assurance_echeance,
             v.prochain_entretien_date, v.prochain_entretien_km,
             least(case when v.controle_technique_echeance <= v_limite then v.controle_technique_echeance end,
                   case when v.assurance_echeance <= v_limite then v.assurance_echeance end,
                   case when v.prochain_entretien_date <= v_limite then v.prochain_entretien_date end) as premiere
      from public.vehicules v
      where v.entreprise_id = p_entreprise_id and v.statut in ('actif', 'maintenance')
        and (v.controle_technique_echeance <= v_limite or v.assurance_echeance <= v_limite or v.prochain_entretien_date <= v_limite
             or (v.prochain_entretien_km is not null and v.kilometrage >= v.prochain_entretien_km))
    ), outils as materialized (
      select o.id, o.reference, o.designation, o.prochaine_verification
      from public.outils o
      where o.entreprise_id = p_entreprise_id and o.statut not in ('hors_service', 'perdu') and o.prochaine_verification <= v_limite
    )
    select jsonb_build_object(
      'nb_vehicules', (select count(*) from vehicules),
      'vehicules', coalesce((select jsonb_agg(to_jsonb(x) - 'premiere' order by x.premiere nulls first, x.id) from (select * from vehicules order by premiere nulls first, id limit v_n) x), '[]'::jsonb),
      'nb_outils', (select count(*) from outils),
      'outils', coalesce((select jsonb_agg(to_jsonb(x) order by x.prochaine_verification, x.id) from (select * from outils order by prochaine_verification, id limit v_n) x), '[]'::jsonb))
  );
end;
$$;

revoke all on function public.gp_alertes_parc(uuid, date, integer, integer) from public, anon;
grant execute on function public.gp_alertes_parc(uuid, date, integer, integer) to authenticated;
