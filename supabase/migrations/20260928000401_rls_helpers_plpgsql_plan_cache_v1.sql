-- ============================================================================
-- ELSATIA — Baseline performance V1 : fonctions d'aide RLS en PL/pgSQL
-- (docs/qualification/ELSATIA_PERFORMANCE_CAPACITY_BASELINE_V1.md, § Correctifs)
--
-- MESURÉ AVANT (PostgreSQL 16, jeu GP, rôle authenticated, RLS active) :
--   est_membre_actif(uuid)       ≈ 200 µs par appel, dont 125 µs pour est_acces_support_actif
--   a_permission(uuid,text)      ≈ 565 µs par appel
--   policy SELECT de pointages   ≈ 1,27 ms par ligne (13,8 s pour 10 909 pointages)
--   policy SELECT de reserves    ≈ 0,9 ms par ligne (reserves_action_autorisee → reserves_role_courant
--                                  → a_acces_application → est_plateforme_admin / est_membre_actif)
-- CAUSE : ces fonctions sont en LANGUAGE sql avec `SET search_path` et SECURITY DEFINER,
-- donc jamais inlinées. Une fonction SQL non inlinée appelée DEPUIS une autre fonction SQL
-- non inlinée est ré-analysée et re-planifiée à CHAQUE appel de la fonction appelante
-- (PostgreSQL ≤ 17 ne met pas en cache le plan d'une fonction SQL imbriquée ; le projet
-- cible PostgreSQL 17). Évaluées ligne à ligne par la RLS, les chaînes
-- a_permission → est_membre_actif → est_acces_support_actif / session_courante_revoquee →
-- session_jwt_courante (et, côté Réserves, reserves_role_courant → a_acces_application →
-- est_plateforme_admin) paient donc une planification par niveau et par ligne.
--
-- CORRECTIF : même corps, même signature, même SECURITY DEFINER, même `search_path`, même
-- volatilité (STABLE), même propriétaire et mêmes droits (CREATE OR REPLACE les conserve) ;
-- seul le langage passe de `sql` à `plpgsql`, dont les plans sont mis en cache pour la
-- session. Chaque corps est l'expression `select …` d'origine, rendue telle quelle par
-- `return ( … )` (requête scalaire `select … from … limit 1` : sous-requête scalaire, NULL si aucune
-- ligne, exactement comme la fonction SQL d'origine) : aucune règle d'accès n'est modifiée. Les définitions ont été extraites
-- par pg_get_functiondef du train V5 (20260928000301), pas réécrites à la main.
--
-- PREUVE D'ÉQUIVALENCE : supabase/tests/rls_helpers_plpgsql_equivalence_v1.test.sql compare
-- chaque fonction à une copie SQL de sa version antérieure sur toute la matrice du jeu
-- d'isolation (utilisateurs × entreprises × permissions × applications × chantiers × salariés ×
-- intervenants Réserves), y compris session révoquée, accès support actif, admin plateforme.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.session_jwt_courante()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
begin
  return (
  case
      when (auth.jwt() ->> 'session_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (auth.jwt() ->> 'session_id')::uuid
    end
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.session_courante_revoquee()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return (
  exists (
      select 1 from public.sessions_revoquees s
       where s.session_id = public.session_jwt_courante()
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.est_acces_support_actif(p_entreprise_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return (
  auth.uid() is not null and exists(
      select 1
      from public.plateforme_acces_entreprises s
      join public.plateforme_admins pa
        on pa.utilisateur_id = auth.uid()
       and pa.actif
       and pa.statut_identite = 'active'
       and pa.role in ('total','support')
      where s.plateforme_user_id = auth.uid()
        and s.entreprise_id = p_entreprise_id
        and s.termine_at is null
        and s.commence_at <= now()
        and s.expire_at > now()
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.est_membre_actif(p_entreprise_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return (
  not public.session_courante_revoquee() and (
      public.est_acces_support_actif(p_entreprise_id) or exists (
        select 1
        from public.utilisateurs_entreprises ue
        join public.entreprises e on e.id = ue.entreprise_id
        where ue.entreprise_id = p_entreprise_id
          and ue.utilisateur_id = auth.uid()
          and ue.statut = 'actif'
          and e.abonnement_statut not in ('suspendu', 'annule')
          and (e.suspension_prevue_at is null or e.suspension_prevue_at > now())
      )
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.est_plateforme_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return (
  auth.uid() is not null and exists(
      select 1
      from public.plateforme_admins
      where utilisateur_id = auth.uid()
        and actif
        and statut_identite = 'active'
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.a_permission(p_entreprise_id uuid, p_permission text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return (
  not public.session_courante_revoquee() and (
      public.est_acces_support_actif(p_entreprise_id) or exists (
        select 1
        from public.utilisateurs_entreprises ue
        where ue.utilisateur_id = auth.uid()
          and ue.entreprise_id = p_entreprise_id
          and ue.statut = 'actif'
          and public.est_membre_actif(p_entreprise_id)
          and (
            (p_permission = 'saisir_son_pointage' and ue.pointage_personnel_actif)
            or
            (p_permission <> 'saisir_son_pointage' and exists (
              select 1
              from public.permissions_poste pp
              where pp.entreprise_id = ue.entreprise_id
                and pp.poste_id = ue.poste_id
                and pp.cle_permission = p_permission
                and pp.autorise
            ))
          )
      )
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.a_acces_application(p_entreprise_id uuid, p_application_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return (
  auth.uid() is not null
      and (
        (
          public.est_plateforme_admin()
          and exists(select 1 from public.applications_elsatia a where a.code=p_application_code and a.actif)
        )
        or (
          p_entreprise_id is not null
          and public.est_membre_actif(p_entreprise_id)
          and exists(
            select 1 from public.acces_applications_entreprises ae
            join public.applications_elsatia a on a.code=ae.application_code and a.actif
            where ae.entreprise_id=p_entreprise_id
              and ae.application_code=p_application_code
              and ae.autorise
              and (ae.valide_du is null or ae.valide_du<=now())
              and (ae.valide_jusqu_au is null or ae.valide_jusqu_au>now())
          )
          and exists(
            select 1 from public.habilitations_applications_utilisateurs hu
            join public.roles_applications_elsatia r
              on r.application_code=hu.application_code and r.code=hu.role_code and r.actif
            where hu.entreprise_id=p_entreprise_id
              and hu.utilisateur_id=auth.uid()
              and hu.application_code=p_application_code
              and hu.autorise
              and (hu.valide_du is null or hu.valide_du<=now())
              and (hu.valide_jusqu_au is null or hu.valide_jusqu_au>now())
          )
        )
      )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.peut_consulter_pointage_employe(p_entreprise_id uuid, p_employe_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return (
  public.a_permission(p_entreprise_id,'voir_pointages_equipe')
      or public.a_permission(p_entreprise_id,'gerer_pointage')
      or public.a_permission(p_entreprise_id,'valider_pointages')
      or exists(
        select 1 from public.employes e
        where e.id=p_employe_id and e.entreprise_id=p_entreprise_id
          and e.utilisateur_id=auth.uid() and e.statut not in ('sorti','suspendu')
      )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.peut_consulter_chantier(p_entreprise_id uuid, p_chantier_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return (
  (
        public.est_membre_actif(p_entreprise_id)
        and (
          public.a_permission(p_entreprise_id,'acces_chantiers')
          or public.a_permission(p_entreprise_id,'gerer_chantiers')
          or (
            public.a_permission(p_entreprise_id,'voir_chantiers_assignes')
            and exists(
              select 1 from public.employes e
              where e.entreprise_id=p_entreprise_id and e.utilisateur_id=auth.uid()
                and e.statut not in ('sorti','suspendu')
                and (
                  exists(
                    select 1 from public.equipes_chantiers ec
                    where ec.entreprise_id=p_entreprise_id and ec.chantier_id=p_chantier_id
                      and ec.employe_id=e.id and ec.date_debut<=current_date
                      and (ec.date_fin is null or ec.date_fin>=current_date)
                  )
                  or exists(
                    select 1 from public.affectations a
                    where a.entreprise_id=p_entreprise_id and a.chantier_id=p_chantier_id
                      and a.employe_id=e.id and a.date=current_date
                  )
                )
            )
          )
        )
      )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.reserves_role_courant(p_entreprise_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return (
  select h.role_code
    from public.habilitations_applications_utilisateurs h
    join public.roles_applications_elsatia r
      on r.application_code = h.application_code and r.code = h.role_code and r.actif
    where h.entreprise_id = p_entreprise_id
      and h.utilisateur_id = auth.uid()
      and h.application_code = 'reserves'
      and h.autorise
      and (h.valide_du is null or h.valide_du <= now())
      and (h.valide_jusqu_au is null or h.valide_jusqu_au > now())
      and not public.est_plateforme_admin()
      and public.a_acces_application(p_entreprise_id, 'reserves')
    limit 1
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.reserves_intervenant_courant(p_intervenant_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return (
  p_intervenant_id is not null
      and auth.uid() is not null
      and exists (
        select 1
        from public.reserves_intervenants i
        where i.id = p_intervenant_id
          and i.statut = 'active'
          and i.entreprise_intervenante_id is not null
          and public.est_membre_actif(i.entreprise_intervenante_id)
          and public.a_acces_application(i.entreprise_intervenante_id, 'reserves')
      )
  );
end;
$function$;
