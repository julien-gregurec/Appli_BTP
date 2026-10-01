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
