-- Train canonique V9 : numéro d'origine 20260928000814 (GP residual data correctness (claude/optimistic-hopper-0ytout)), renuméroté 20261002001102
-- (bloc V9 strictement après 20261002000901 / 20261002001003, ordre relatif d'origine conservé) ; corps inchangé.
-- ELSATIA-FINANCE-AGGREGATES-DATA-CORRECTNESS-V1 — pointage d'équipe et
-- planning hebdomadaire lus en entier.
--
-- Constat (docs/qualification/witnesses/finance-aggregates-v1/11-*) :
-- /pointage/gestion (pointages, sessions, contrôles GPS d'un mois) et
-- /planning (affectations et pointages validés d'une semaine) lisaient
-- chacune de leurs tables en une requête PostgREST, plafonnée à 1 000 lignes
-- sans erreur : totaux d'heures par salarié et heures réalisées faux au-delà
-- (blocker B2 du train V8). Une lecture paginée côté Next est exacte mais
-- inutilisable : la policy `peut_consulter_pointage_employe` coûte de 0,4 à
-- 1,6 ms PAR LIGNE, et chaque page la réévalue sur les lignes qui restent
-- (mesuré : 294 s pour un mois de 20 000 lignes, 74 s à 5 000).
--
-- Correctif : une RPC par écran, en une valeur jsonb (non soumise à
-- `max_rows`), mêmes filtres, mêmes colonnes et même ordre qu'auparavant.
-- Sécurité — SECURITY DEFINER, `search_path` figé, policies reproduites à
-- l'identique mais évaluées une fois PAR SALARIÉ / PAR CHANTIER au lieu d'une
-- fois par ligne :
--   pointages, sessions_pointage → est_membre_actif(e)
--                                   ∧ peut_consulter_pointage_employe(e, employe)
--   verifications_zone_pointage   → est_membre_actif(e) ∧ (est_employe_du_compte(e, employe)
--                                   ∨ a_permission(e, 'gerer_pointage') ∨ a_permission(e, 'valider_pointages'))
--   affectations                  → est_membre_actif(e)
--                                   ∧ peut_consulter_affectation_employe(e, employe)
--   employes (nom joint)          → est_membre_actif(e)
--   chantiers (nom joint)         → peut_consulter_chantier(e, chantier)
-- Exécution réservée à `authenticated`.

create or replace function public.pointages_equipe_periode(
  p_entreprise_id uuid, p_debut date, p_fin date, p_debut_at timestamptz, p_fin_at timestamptz
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_pointages jsonb;
  v_sessions jsonb;
  v_verifications jsonb;
  v_employes_pointage uuid[];
  v_employes_controle uuid[];
  v_chantiers uuid[];
begin
  if not public.est_membre_actif(p_entreprise_id) then
    return jsonb_build_object('pointages', '[]'::jsonb, 'sessions', '[]'::jsonb, 'verifications', '[]'::jsonb);
  end if;

  -- Droits évalués une fois par salarié et par chantier de l'entreprise.
  select coalesce(array_agg(e.id) filter (where public.peut_consulter_pointage_employe(p_entreprise_id, e.id)), '{}'),
         coalesce(array_agg(e.id) filter (where public.est_employe_du_compte(p_entreprise_id, e.id)
                                              or public.a_permission(p_entreprise_id, 'gerer_pointage')
                                              or public.a_permission(p_entreprise_id, 'valider_pointages')), '{}')
    into v_employes_pointage, v_employes_controle
  from public.employes e
  where e.entreprise_id = p_entreprise_id;
  select coalesce(array_agg(c.id), '{}') into v_chantiers
  from public.chantiers c
  where c.entreprise_id = p_entreprise_id and public.peut_consulter_chantier(p_entreprise_id, c.id);

  if (select count(*) from public.pointages p where p.entreprise_id = p_entreprise_id and p.date >= p_debut and p.date <= p_fin)
     + (select count(*) from public.sessions_pointage s where s.entreprise_id = p_entreprise_id and s.arrivee_at >= p_debut_at and s.arrivee_at <= p_fin_at)
     + (select count(*) from public.verifications_zone_pointage v where v.entreprise_id = p_entreprise_id and v.created_at >= p_debut_at and v.created_at <= p_fin_at) > 250000 then
    raise exception 'LECTURE_TROP_VOLUMINEUSE' using errcode = '54000';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'date', p.date, 'heures_normales', p.heures_normales, 'heures_supplementaires', p.heures_supplementaires,
           'latitude', p.latitude, 'longitude', p.longitude, 'verification_statut', p.verification_statut,
           'origine_pointage', p.origine_pointage, 'commentaire', p.commentaire,
           'employe', case when em.id is not null then jsonb_build_object('id', em.id, 'prenom', em.prenom, 'nom', em.nom) end,
           'chantier', case when cv.id is not null then jsonb_build_object('id', cv.id, 'nom', cv.nom) end
         ) order by p.date desc, p.id), '[]'::jsonb)
    into v_pointages
  from public.pointages p
  left join public.employes em on em.id = p.employe_id and em.entreprise_id = p.entreprise_id
  left join public.chantiers cv on cv.id = p.chantier_id and cv.entreprise_id = p.entreprise_id and cv.id = any(v_chantiers)
  where p.entreprise_id = p_entreprise_id and p.date >= p_debut and p.date <= p_fin
    and p.employe_id = any(v_employes_pointage);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'employe_id', s.employe_id, 'chantier_id', s.chantier_id, 'arrivee_at', s.arrivee_at, 'depart_at', s.depart_at,
           'pause_minutes', s.pause_minutes, 'latitude_arrivee', s.latitude_arrivee, 'longitude_arrivee', s.longitude_arrivee,
           'precision_arrivee_metres', s.precision_arrivee_metres, 'latitude_depart', s.latitude_depart, 'longitude_depart', s.longitude_depart,
           'precision_depart_metres', s.precision_depart_metres, 'tache', s.tache, 'pointage_id', s.pointage_id,
           'pointage', case when po.id is not null then jsonb_build_object('id', po.id, 'verification_statut', po.verification_statut,
             'anomalie_niveau', po.anomalie_niveau, 'anomalie_motif', po.anomalie_motif, 'heures_attendues', po.heures_attendues) end,
           'employe', case when em.id is not null then jsonb_build_object('id', em.id, 'prenom', em.prenom, 'nom', em.nom) end,
           'chantier', case when cv.id is not null then jsonb_build_object('id', cv.id, 'nom', cv.nom) end
         ) order by s.arrivee_at desc, s.id), '[]'::jsonb)
    into v_sessions
  from public.sessions_pointage s
  left join public.pointages po on po.id = s.pointage_id and po.entreprise_id = s.entreprise_id and po.employe_id = any(v_employes_pointage)
  left join public.employes em on em.id = s.employe_id and em.entreprise_id = s.entreprise_id
  left join public.chantiers cv on cv.id = s.chantier_id and cv.entreprise_id = s.entreprise_id and cv.id = any(v_chantiers)
  where s.entreprise_id = p_entreprise_id and s.arrivee_at >= p_debut_at and s.arrivee_at <= p_fin_at
    and s.employe_id = any(v_employes_pointage);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', v.id, 'session_id', v.session_id, 'employe_id', v.employe_id, 'chantier_id', v.chantier_id,
           'latitude', v.latitude, 'longitude', v.longitude, 'precision_metres', v.precision_metres,
           'distance_metres', v.distance_metres, 'dans_zone', v.dans_zone, 'created_at', v.created_at
         ) order by v.created_at desc, v.id), '[]'::jsonb)
    into v_verifications
  from public.verifications_zone_pointage v
  where v.entreprise_id = p_entreprise_id and v.created_at >= p_debut_at and v.created_at <= p_fin_at
    and v.employe_id = any(v_employes_controle);

  return jsonb_build_object('pointages', v_pointages, 'sessions', v_sessions, 'verifications', v_verifications);
end;
$$;

create or replace function public.planning_semaine(p_entreprise_id uuid, p_debut date, p_fin date, p_employe_id uuid default null)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_affectations jsonb;
  v_pointages jsonb;
begin
  if not public.est_membre_actif(p_entreprise_id) then
    return jsonb_build_object('affectations', '[]'::jsonb, 'pointages', '[]'::jsonb);
  end if;

  with visibles as (
    select e.id,
           public.peut_consulter_affectation_employe(p_entreprise_id, e.id) as affectation,
           public.peut_consulter_pointage_employe(p_entreprise_id, e.id) as pointage
    from public.employes e
    where e.entreprise_id = p_entreprise_id
  ), chantiers_visibles as (
    select c.id, c.nom from public.chantiers c
    where c.entreprise_id = p_entreprise_id
      and c.id in (select a.chantier_id from public.affectations a
                   where a.entreprise_id = p_entreprise_id and a.date >= p_debut and a.date <= p_fin and a.chantier_id is not null)
      and public.peut_consulter_chantier(p_entreprise_id, c.id)
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object(
              'id', a.id, 'date', a.date, 'heures', a.heures, 'tache', a.tache, 'type_activite', a.type_activite, 'lieu_activite', a.lieu_activite,
              'chantier', case when cv.id is not null then jsonb_build_object('id', cv.id, 'nom', cv.nom) end,
              'employe', case when em.id is not null then jsonb_build_object('id', em.id, 'prenom', em.prenom, 'nom', em.nom) end
            ) order by a.date, a.id), '[]'::jsonb)
       from public.affectations a
       join visibles vis on vis.id = a.employe_id and vis.affectation
       left join chantiers_visibles cv on cv.id = a.chantier_id
       left join public.employes em on em.id = a.employe_id and em.entreprise_id = a.entreprise_id
       where a.entreprise_id = p_entreprise_id and a.date >= p_debut and a.date <= p_fin
         and (p_employe_id is null or a.employe_id = p_employe_id)),
    (select coalesce(jsonb_agg(jsonb_build_object(
              'id', p.id, 'date', p.date, 'heures_normales', p.heures_normales, 'heures_supplementaires', p.heures_supplementaires,
              'verification_statut', p.verification_statut, 'employe_id', p.employe_id, 'chantier_id', p.chantier_id
            ) order by p.id), '[]'::jsonb)
       from public.pointages p
       join visibles vis on vis.id = p.employe_id and vis.pointage
       where p.entreprise_id = p_entreprise_id and p.date >= p_debut and p.date <= p_fin and p.verification_statut = 'valide')
    into v_affectations, v_pointages;

  return jsonb_build_object('affectations', v_affectations, 'pointages', v_pointages);
end;
$$;

revoke all on function public.pointages_equipe_periode(uuid, date, date, timestamptz, timestamptz) from public, anon;
revoke all on function public.planning_semaine(uuid, date, date, uuid) from public, anon;
grant execute on function public.pointages_equipe_periode(uuid, date, date, timestamptz, timestamptz) to authenticated;
grant execute on function public.planning_semaine(uuid, date, date, uuid) to authenticated;
