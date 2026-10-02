-- Assertions de la fixture Preview « satellites » du pilote PILOTE-BTP-V1
-- (supabase/production/fixture_preview_satellites_pilote.sql).
--
-- LECTURE SEULE : tout se joue dans une transaction terminée par ROLLBACK. Exécution Preview
-- via le wrapper (`node scripts/executer-script-production.mjs
-- assertions_fixture_preview_satellites_pilote.sql`) ou sur une base locale rejouant le train
-- (scripts/local-postgres-bootstrap/rebuild_db.sh), après seed_entreprise_pilote_btp.sql puis
-- la fixture.
--
-- Les décisions d'accès sont évaluées sous le rôle `authenticated` avec un vrai `auth.uid()`
-- (claims JWT de la transaction) : RLS et SECURITY DEFINER réels, rien n'est simulé.
--
-- Recette attendue (ELSATIA_SATELLITES_PREVIEW_READINESS_V2, A-01 / A-02) :
--   Karim Haddad (pilote.karim.haddad@example.test) : Gestion Pro, Colors, Tools, Réserves ;
--                                                     jamais Drone ; pas administrateur plateforme.
--   Karim Belaid (pilote.karim.belaid@example.test) : même entreprise, AUCUNE habilitation
--                                                     applicative ; catalogue vide.
--   Indépendance au temps : l'état commercial GP du pilote ne dépend d'aucune date (statut
--   « actif » posé par geste opérateur, aucune suspension programmée), et aucun droit de la
--   fixture n'a de borne temporelle ni d'essai.
-- Un échec lève une exception (code P0001) qui nomme les cas en écart.

\set ON_ERROR_STOP on

begin;

create temp table sat_resultats(cas text primary key, attendu text not null, obtenu text) on commit drop;
grant select, insert on sat_resultats to authenticated;

-- Identifiants résolus AVANT de quitter le rôle propriétaire : `authenticated` ne lit pas auth.users.
select set_config('sat.entreprise', coalesce((select id::text from public.entreprises where reference_interne='PILOTE-BTP-V1'), ''), true);
select set_config('sat.karim', coalesce((select id::text from auth.users where email='pilote.karim.haddad@example.test'), ''), true);
select set_config('sat.belaid', coalesce((select id::text from auth.users where email='pilote.karim.belaid@example.test'), ''), true);

do $prerequis$
begin
  if current_setting('sat.entreprise') = '' then raise exception 'PILOTE-BTP-V1 absente : jouer seed_entreprise_pilote_btp.sql d''abord'; end if;
  if current_setting('sat.karim') = '' or current_setting('sat.belaid') = '' then
    raise exception 'Comptes pilote absents (pilote.karim.haddad / pilote.karim.belaid@example.test)';
  end if;
end
$prerequis$;

-- ── Contrôles structurels (rôle propriétaire) ─────────────────────────────────
insert into sat_resultats
select 'structure:gp_etat_commercial', 'active', public.etat_commercial_gestion_pro(current_setting('sat.entreprise')::uuid);

insert into sat_resultats
select 'structure:gp_independant_du_temps', 'true',
       (e.abonnement_statut = 'actif' and e.suspension_prevue_at is null)::text
from public.entreprises e where e.id = current_setting('sat.entreprise')::uuid;

insert into sat_resultats
select 'structure:entitlements', 'colors,gestion_pro,reserves,tools',
       coalesce(string_agg(application_code, ',' order by application_code), '')
from public.acces_applications_entreprises
where entreprise_id = current_setting('sat.entreprise')::uuid and autorise;

insert into sat_resultats
select 'structure:entitlements_sans_borne_ni_essai', '0', count(*)::text
from public.acces_applications_entreprises
where entreprise_id = current_setting('sat.entreprise')::uuid
  and application_code in ('gestion_pro','colors','tools','reserves')
  and (valide_du is not null or valide_jusqu_au is not null or essai_fin is not null
       or statut_commercial <> 'entitled' or not autorise);

insert into sat_resultats
select 'structure:habilitations_karim',
       'colors:colors_admin_organisation,gestion_pro:gestion_pro_admin,reserves:reserves_admin_organisation,tools:tools_releve_admin',
       coalesce(string_agg(application_code || ':' || role_code, ',' order by application_code), '')
from public.habilitations_applications_utilisateurs
where entreprise_id = current_setting('sat.entreprise')::uuid
  and utilisateur_id = current_setting('sat.karim')::uuid
  and autorise and valide_du is null and valide_jusqu_au is null;

insert into sat_resultats
select 'structure:habilitations_belaid', '0', count(*)::text
from public.habilitations_applications_utilisateurs
where entreprise_id = current_setting('sat.entreprise')::uuid
  and utilisateur_id = current_setting('sat.belaid')::uuid;

insert into sat_resultats
select 'structure:drone_aucun_droit', '0',
       ((select count(*) from public.acces_applications_entreprises
          where entreprise_id = current_setting('sat.entreprise')::uuid and application_code = 'drone')
      + (select count(*) from public.habilitations_applications_utilisateurs
          where entreprise_id = current_setting('sat.entreprise')::uuid and application_code = 'drone'))::text;

insert into sat_resultats
select 'structure:membres_actifs', 'actif,actif',
       string_agg(statut, ',' order by statut)
from public.utilisateurs_entreprises
where entreprise_id = current_setting('sat.entreprise')::uuid
  and utilisateur_id in (current_setting('sat.karim')::uuid, current_setting('sat.belaid')::uuid);

-- ── Décisions réelles sous Karim Haddad ──────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('sat.karim'), 'role', 'authenticated')::text, true);
set local role authenticated;

insert into sat_resultats
select 'karim:a_acces:' || c, (c <> 'drone')::text,
       public.a_acces_application(current_setting('sat.entreprise')::uuid, c)::text
from unnest(array['gestion_pro','colors','tools','reserves','drone']) as c;

insert into sat_resultats
select 'karim:catalogue', 'colors,gestion_pro,reserves,tools',
       coalesce(string_agg(application_code, ',' order by application_code), '')
from public.applications_autorisees(current_setting('sat.entreprise')::uuid);

insert into sat_resultats select 'karim:est_admin_plateforme', 'false', public.est_plateforme_admin()::text;
insert into sat_resultats select 'karim:colors_gerer_parametres', 'true',
  public.colors_action_autorisee(current_setting('sat.entreprise')::uuid, 'gerer_parametres')::text;
insert into sat_resultats select 'karim:reserves_creer_reserve', 'true',
  public.reserves_action_autorisee(current_setting('sat.entreprise')::uuid, 'creer_reserve')::text;

reset role;

-- ── Décisions réelles sous Karim Belaid (même entreprise, sans habilitation) ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('sat.belaid'), 'role', 'authenticated')::text, true);
set local role authenticated;

insert into sat_resultats
select 'belaid:a_acces:' || c, 'false',
       public.a_acces_application(current_setting('sat.entreprise')::uuid, c)::text
from unnest(array['gestion_pro','colors','tools','reserves','drone']) as c;

insert into sat_resultats
select 'belaid:catalogue', '', coalesce(string_agg(application_code, ',' order by application_code), '')
from public.applications_autorisees(current_setting('sat.entreprise')::uuid);

reset role;

select cas, attendu, obtenu, case when attendu is not distinct from obtenu then 'PASS' else 'FAIL' end as verdict
from sat_resultats order by cas;

do $verdict$
declare v_ecarts text;
begin
  select string_agg(cas, ', ' order by cas) into v_ecarts from sat_resultats where attendu is distinct from obtenu;
  if v_ecarts is not null then
    raise exception 'Fixture satellites pilote : % en écart', v_ecarts;
  end if;
  raise notice 'Fixture satellites pilote : % contrôles PASS', (select count(*) from sat_resultats);
end
$verdict$;

rollback;
