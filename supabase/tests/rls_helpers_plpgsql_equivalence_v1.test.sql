begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- ELSATIA — Baseline performance V1 : 20260928000401 convertit onze fonctions d'aide RLS de
-- LANGUAGE sql en LANGUAGE plpgsql (plans mis en cache) SANS changer leur logique.
-- Ce test le prouve de deux façons :
--   1. les attributs de sécurité sont inchangés (SECURITY DEFINER, search_path, STABLE,
--      propriétaire, EXECUTE d'anon / authenticated) ;
--   2. ÉQUIVALENCE DIFFÉRENTIELLE : chaque fonction est comparée à une copie LANGUAGE sql
--      de sa définition antérieure (texte exact de pg_get_functiondef sur le train V5),
--      sur toute la matrice du jeu d'isolation — chaque utilisateur (et l'absence
--      d'utilisateur) × chaque entreprise × chaque permission × chaque chantier × chaque
--      salarié —, avec une session normale, une session RÉVOQUÉE et un accès SUPPORT actif.

\ir fixtures/isolation_multitenant.inc

-- Copies de référence (définitions antérieures à 20260928000401, LANGUAGE sql).
CREATE FUNCTION pg_temp.ref_session_jwt_courante()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case
    when (auth.jwt() ->> 'session_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (auth.jwt() ->> 'session_id')::uuid
  end;
$function$;
CREATE FUNCTION pg_temp.ref_session_courante_revoquee()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.sessions_revoquees s
     where s.session_id = public.session_jwt_courante()
  );
$function$;
CREATE FUNCTION pg_temp.ref_est_acces_support_actif(p_entreprise_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select auth.uid() is not null and exists(
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
  );
$function$;
CREATE FUNCTION pg_temp.ref_est_membre_actif(p_entreprise_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select not public.session_courante_revoquee() and (
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
  );
$function$;
CREATE FUNCTION pg_temp.ref_est_plateforme_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select auth.uid() is not null and exists(
    select 1
    from public.plateforme_admins
    where utilisateur_id = auth.uid()
      and actif
      and statut_identite = 'active'
  );
$function$;
CREATE FUNCTION pg_temp.ref_a_permission(p_entreprise_id uuid, p_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select not public.session_courante_revoquee() and (
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
  );
$function$;
CREATE FUNCTION pg_temp.ref_a_acces_application(p_entreprise_id uuid, p_application_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select auth.uid() is not null
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
    );
$function$;
CREATE FUNCTION pg_temp.ref_peut_consulter_pointage_employe(p_entreprise_id uuid, p_employe_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.a_permission(p_entreprise_id,'voir_pointages_equipe')
    or public.a_permission(p_entreprise_id,'gerer_pointage')
    or public.a_permission(p_entreprise_id,'valider_pointages')
    or exists(
      select 1 from public.employes e
      where e.id=p_employe_id and e.entreprise_id=p_entreprise_id
        and e.utilisateur_id=auth.uid() and e.statut not in ('sorti','suspendu')
    );
$function$;
CREATE FUNCTION pg_temp.ref_peut_consulter_chantier(p_entreprise_id uuid, p_chantier_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (
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
    );
$function$;
CREATE FUNCTION pg_temp.ref_reserves_role_courant(p_entreprise_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  limit 1;
$function$;
CREATE FUNCTION pg_temp.ref_reserves_intervenant_courant(p_intervenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p_intervenant_id is not null
    and auth.uid() is not null
    and exists (
      select 1
      from public.reserves_intervenants i
      where i.id = p_intervenant_id
        and i.statut = 'active'
        and i.entreprise_intervenante_id is not null
        and public.est_membre_actif(i.entreprise_intervenante_id)
        and public.a_acces_application(i.entreprise_intervenante_id, 'reserves')
    );
$function$;

-- 1. Attributs de sécurité.
select is(
  (select count(*)::int from pg_proc p where p.oid in (
    'public.session_jwt_courante()'::regprocedure, 'public.session_courante_revoquee()'::regprocedure,
    'public.est_acces_support_actif(uuid)'::regprocedure, 'public.est_membre_actif(uuid)'::regprocedure,
    'public.a_permission(uuid,text)'::regprocedure, 'public.peut_consulter_pointage_employe(uuid,uuid)'::regprocedure,
    'public.peut_consulter_chantier(uuid,uuid)'::regprocedure, 'public.est_plateforme_admin()'::regprocedure,
    'public.a_acces_application(uuid,text)'::regprocedure, 'public.reserves_role_courant(uuid)'::regprocedure,
    'public.reserves_intervenant_courant(uuid)'::regprocedure)
    and p.prolang = (select oid from pg_language where lanname = 'plpgsql')
    and p.provolatile = 's' and p.proconfig = array['search_path=public']
    and pg_get_userbyid(p.proowner) = 'postgres'),
  11, 'les 11 fonctions sont en plpgsql, STABLE, search_path=public, propriétaire postgres');
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p where p.oid in (
    'public.session_courante_revoquee()'::regprocedure, 'public.est_acces_support_actif(uuid)'::regprocedure,
    'public.est_membre_actif(uuid)'::regprocedure, 'public.a_permission(uuid,text)'::regprocedure,
    'public.peut_consulter_pointage_employe(uuid,uuid)'::regprocedure, 'public.peut_consulter_chantier(uuid,uuid)'::regprocedure,
    'public.est_plateforme_admin()'::regprocedure, 'public.a_acces_application(uuid,text)'::regprocedure,
    'public.reserves_role_courant(uuid)'::regprocedure, 'public.reserves_intervenant_courant(uuid)'::regprocedure)
    and p.prosecdef),
  array['a_acces_application','a_permission','est_acces_support_actif','est_membre_actif','est_plateforme_admin','peut_consulter_chantier','peut_consulter_pointage_employe','reserves_intervenant_courant','reserves_role_courant','session_courante_revoquee'],
  'SECURITY DEFINER conservé sur les 10 fonctions qui l''étaient');
select ok(not (select prosecdef from pg_proc where oid = 'public.session_jwt_courante()'::regprocedure),
  'session_jwt_courante reste SECURITY INVOKER');
select ok(
  has_function_privilege('authenticated', 'public.a_permission(uuid,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.est_membre_actif(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.peut_consulter_chantier(uuid,uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.peut_consulter_pointage_employe(uuid,uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.est_acces_support_actif(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.session_courante_revoquee()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.est_plateforme_admin()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.a_acces_application(uuid,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.reserves_role_courant(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.reserves_intervenant_courant(uuid)', 'EXECUTE'),
  'authenticated conserve EXECUTE');
select ok(
  not has_function_privilege('anon', 'public.a_permission(uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.est_membre_actif(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.peut_consulter_chantier(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.peut_consulter_pointage_employe(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.est_acces_support_actif(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.session_courante_revoquee()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.est_plateforme_admin()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.a_acces_application(uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.reserves_role_courant(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.reserves_intervenant_courant(uuid)', 'EXECUTE'),
  'anon n''obtient aucun EXECUTE nouveau');

-- 2. Équivalence différentielle.
-- Session révoquée (utilisateur admin-a) et accès support actif (compte plateforme → A).
insert into public.sessions_revoquees (session_id, utilisateur_id, entreprise_id)
values ('5e550000-0000-4000-8000-00000000d1ff', '10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001');
insert into public.plateforme_admins (email, role, utilisateur_id, actif, statut_identite, activation_at)
select 'plateforme@invalid.local', 'support', '30000000-0000-0000-0000-000000000001', true, 'active', now()
where not exists (select 1 from public.plateforme_admins where utilisateur_id = '30000000-0000-0000-0000-000000000001');
update public.plateforme_admins set actif = true, statut_identite = 'active', role = 'support'
where utilisateur_id = '30000000-0000-0000-0000-000000000001' and role not in ('total', 'support');
insert into public.plateforme_acces_entreprises (plateforme_user_id, entreprise_id, motif)
values ('30000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'test équivalence plpgsql');

-- Réserves : A a l'application, admin-a en est responsable, ouvrier-a sans habilitation ; un
-- chantier de A avec B comme intervenant actif (admin-b habilité), un intervenant seulement invité.
insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source) values
  ('a0000000-0000-0000-0000-000000000001', 'reserves', true, 'test'), ('b0000000-0000-0000-0000-000000000001', 'reserves', true, 'test'),
  ('a0000000-0000-0000-0000-000000000001', 'colors', true, 'test')
on conflict (entreprise_id, application_code) do update set autorise = true;
insert into public.habilitations_applications_utilisateurs (entreprise_id, utilisateur_id, application_code, role_code) values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'reserves', 'reserves_responsable'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000006', 'reserves', 'reserves_consultation'),
  ('b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'reserves', 'reserves_intervenant')
on conflict do nothing;
insert into public.reserves_chantiers (id, entreprise_id, nom, created_by)
values ('e9000000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Test équivalence', '10000000-0000-0000-0000-000000000001');
insert into public.reserves_intervenants (id, entreprise_id, chantier_id, nom, statut, entreprise_intervenante_id, created_by, onboarding_statut, rejoint_at, revoque_at) values
  ('e9100000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'e9000000-0000-4000-8000-000000000001', 'B active', 'active', 'b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'rattachee', now(), null),
  ('e9100000-0000-4000-8000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'e9000000-0000-4000-8000-000000000001', 'Invitée non rattachée', 'invitee', null, '10000000-0000-0000-0000-000000000001', 'invitee', null, null);

create temp table ecarts (fonction text, contexte text);
create temp table vrais (fonction text);
create temp table compteur (n int);
insert into compteur values (0);

do $$
declare
  u uuid; s uuid; e uuid; perm text; c uuid; emp uuid; i uuid; app text;
  v_n int := 0;
begin
  for u, s in
    select x.id, x.sess from (
      select id, gen_random_uuid() sess from auth.users
      union all select null, gen_random_uuid()
      union all select '10000000-0000-0000-0000-000000000001', '5e550000-0000-4000-8000-00000000d1ff') x
  loop
    perform set_config('request.jwt.claims',
      case when u is null then json_build_object('role','anon','session_id',s)::text
           else json_build_object('sub',u,'role','authenticated','session_id',s)::text end, true);
    perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true);
    if public.session_jwt_courante() is distinct from pg_temp.ref_session_jwt_courante() then insert into ecarts values ('session_jwt_courante', u::text); end if;
    if public.session_courante_revoquee() is distinct from pg_temp.ref_session_courante_revoquee() then insert into ecarts values ('session_courante_revoquee', u::text); end if;
    if public.session_courante_revoquee() then insert into vrais values ('session_courante_revoquee'); end if;
    v_n := v_n + 2;
    if public.est_plateforme_admin() is distinct from pg_temp.ref_est_plateforme_admin() then insert into ecarts values ('est_plateforme_admin', u::text); end if;
    if public.est_plateforme_admin() then insert into vrais values ('est_plateforme_admin'); end if;
    for i in select id from public.reserves_intervenants union all select null loop
      if public.reserves_intervenant_courant(i) is distinct from pg_temp.ref_reserves_intervenant_courant(i) then insert into ecarts values ('reserves_intervenant_courant', u || '/' || i); end if;
      if public.reserves_intervenant_courant(i) then insert into vrais values ('reserves_intervenant_courant'); end if;
      v_n := v_n + 1;
    end loop;
    for e in select id from public.entreprises loop
      if public.est_acces_support_actif(e) is distinct from pg_temp.ref_est_acces_support_actif(e) then insert into ecarts values ('est_acces_support_actif', u || '/' || e); end if;
      if public.est_membre_actif(e) is distinct from pg_temp.ref_est_membre_actif(e) then insert into ecarts values ('est_membre_actif', u || '/' || e); end if;
      if public.est_acces_support_actif(e) then insert into vrais values ('est_acces_support_actif'); end if;
      if public.reserves_role_courant(e) is distinct from pg_temp.ref_reserves_role_courant(e) then insert into ecarts values ('reserves_role_courant', u || '/' || e); end if;
      if public.reserves_role_courant(e) is not null then insert into vrais values ('reserves_role_courant'); end if;
      for app in select code from public.applications_elsatia union select 'inexistante' loop
        if public.a_acces_application(e, app) is distinct from pg_temp.ref_a_acces_application(e, app) then insert into ecarts values ('a_acces_application', u || '/' || e || '/' || app); end if;
        if public.a_acces_application(e, app) then insert into vrais values ('a_acces_application'); end if;
        v_n := v_n + 1;
      end loop;
      v_n := v_n + 2;
      for perm in select cle from public.permissions_disponibles union select 'saisir_son_pointage' union select 'cle_inexistante' loop
        if public.a_permission(e, perm) is distinct from pg_temp.ref_a_permission(e, perm) then insert into ecarts values ('a_permission', u || '/' || e || '/' || perm); end if;
        v_n := v_n + 1;
      end loop;
      for c in select id from public.chantiers loop
        if public.peut_consulter_chantier(e, c) is distinct from pg_temp.ref_peut_consulter_chantier(e, c) then insert into ecarts values ('peut_consulter_chantier', u || '/' || e || '/' || c); end if;
        v_n := v_n + 1;
      end loop;
      for emp in select id from public.employes union all select null loop
        if public.peut_consulter_pointage_employe(e, emp) is distinct from pg_temp.ref_peut_consulter_pointage_employe(e, emp) then insert into ecarts values ('peut_consulter_pointage_employe', u || '/' || e || '/' || emp); end if;
        v_n := v_n + 1;
      end loop;
    end loop;
  end loop;
  update compteur set n = v_n;
end $$;

select cmp_ok((select n from compteur), '>', 1000, 'matrice différentielle non triviale (plus de 1 000 comparaisons)');
select is((select count(*)::int from ecarts where fonction in ('session_jwt_courante','session_courante_revoquee')), 0, 'session_jwt_courante / session_courante_revoquee : 0 écart');
select is((select count(*)::int from ecarts where fonction = 'est_acces_support_actif'), 0, 'est_acces_support_actif : 0 écart');
select is((select count(*)::int from ecarts where fonction = 'est_membre_actif'), 0, 'est_membre_actif : 0 écart');
select is((select count(*)::int from ecarts where fonction = 'a_permission'), 0, 'a_permission : 0 écart');
select is((select count(*)::int from ecarts where fonction = 'peut_consulter_chantier'), 0, 'peut_consulter_chantier : 0 écart');
select is((select count(*)::int from ecarts where fonction = 'peut_consulter_pointage_employe'), 0, 'peut_consulter_pointage_employe : 0 écart');
select is((select count(*)::int from ecarts where fonction in ('est_plateforme_admin', 'a_acces_application')), 0, 'est_plateforme_admin / a_acces_application : 0 écart');
select is((select count(*)::int from ecarts where fonction in ('reserves_role_courant', 'reserves_intervenant_courant')), 0, 'reserves_role_courant / reserves_intervenant_courant : 0 écart');
-- Les branches VRAIES sont réellement exercées (sinon l'équivalence serait triviale).
select is((select array_agg(distinct fonction order by fonction) from vrais),
  array['a_acces_application','est_acces_support_actif','est_plateforme_admin','reserves_intervenant_courant','reserves_role_courant','session_courante_revoquee'],
  'chaque fonction à branche rare renvoie VRAI au moins une fois dans la matrice');
select is((select count(*)::int from ecarts), 0, 'aucun écart, toutes fonctions confondues');

select * from finish();
rollback;
