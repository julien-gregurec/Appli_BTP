-- pgTAP — D3 : suspension commerciale PAR application + suspension plateforme globale.
-- PROPOSITION NON NUMÉROTÉE, NON RÉSERVÉE.
-- PRÉREQUIS : la base d'essai a reçu, dans cet ordre,
--   1. supabase/proposed/per_application_status_and_platform_suspension_v1.sql.proposed
--   2. packages/application-access/sql/decision_acces_application.sql.proposed
-- Rejeu (base jetable uniquement) : copier supabase/tests/ + ce fichier dans le conteneur, puis
--   psql -q -X -tA -f per_application_status.test.sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(103);

\ir fixtures/isolation_multitenant.inc

-- ── Assistants (session courante uniquement) ─────────────────────────────────────────────────
create function pg_temp.moi(p_uid uuid, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  perform set_config('request.jwt.claim.email', coalesce((select email from auth.users where id = p_uid), ''), true);
  perform set_config('request.jwt.claims',
    case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal,
      'email', (select email from auth.users where id = p_uid))::text end, true);
end $$;
create function pg_temp.d(p_app text, p_ent uuid) returns text language sql as $$
  select public.decision_acces_application(p_app, p_ent)->>'decision' $$;
-- L'ANCIENNE a_acces_application (migration 234), recopiée à l'identique : référence de non-régression.
create function pg_temp.a_acces_ancienne(p_entreprise_id uuid, p_application_code text) returns boolean
language sql security definer stable set search_path = public as $$
  select auth.uid() is not null
    and (
      (public.est_plateforme_admin()
        and exists(select 1 from public.applications_elsatia a where a.code=p_application_code and a.actif))
      or (
        p_entreprise_id is not null
        and public.est_membre_actif(p_entreprise_id)
        and exists(
          select 1 from public.acces_applications_entreprises ae
          join public.applications_elsatia a on a.code=ae.application_code and a.actif
          where ae.entreprise_id=p_entreprise_id and ae.application_code=p_application_code and ae.autorise
            and (ae.valide_du is null or ae.valide_du<=now())
            and (ae.valide_jusqu_au is null or ae.valide_jusqu_au>now()))
        and exists(
          select 1 from public.habilitations_applications_utilisateurs hu
          join public.roles_applications_elsatia r
            on r.application_code=hu.application_code and r.code=hu.role_code and r.actif
          where hu.entreprise_id=p_entreprise_id and hu.utilisateur_id=auth.uid()
            and hu.application_code=p_application_code and hu.autorise
            and (hu.valide_du is null or hu.valide_du<=now())
            and (hu.valide_jusqu_au is null or hu.valide_jusqu_au>now()))
      )
    ) $$;
-- Balaye tous les utilisateurs de la fixture × {A, B, aucune} × applications. Rend
-- (violations de l'invariant, refus NOUVEAUX vs ancienne, autorisations NOUVELLES vs ancienne dont GP, hors GP).
create function pg_temp.balayage() returns table(invariant_viole bigint, nouveaux_refus bigint, nouvelles_autorisations_gp bigint, nouvelles_autorisations_hors_gp bigint)
language plpgsql as $$
declare u record; e uuid; a text; v_dec text; v_new boolean; v_old boolean;
  n_inv bigint := 0; n_ref bigint := 0; n_gp bigint := 0; n_hgp bigint := 0;
begin
  for u in select id from auth.users where id::text ~ '^(10|20|30|ee9)0' loop
    perform set_config('request.jwt.claim.sub', u.id::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', u.id, 'role', 'authenticated')::text, true);
    foreach e in array array['a0000000-0000-0000-0000-000000000001'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid, null] loop
      foreach a in array array['gestion_pro','colors','tools','reserves','drone','application_qui_nexiste_pas'] loop
        v_dec := public.decision_acces_application(a, e)->>'decision';
        v_new := public.a_acces_application(e, a);
        v_old := pg_temp.a_acces_ancienne(e, a);
        if (v_dec = 'autorise') is distinct from v_new then n_inv := n_inv + 1; end if;
        if v_old and not v_new then n_ref := n_ref + 1; end if;
        if v_new and not v_old then
          if a = 'gestion_pro' then n_gp := n_gp + 1; else n_hgp := n_hgp + 1; end if;
        end if;
      end loop;
    end loop;
  end loop;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  return query select n_inv, n_ref, n_gp, n_hgp;
end $$;

-- ── Prérequis présents ───────────────────────────────────────────────────────────────────────
select has_column('public', 'acces_applications_entreprises', 'statut_commercial', 'colonne statut_commercial présente');
select has_column('public', 'acces_applications_entreprises', 'suspendu_depuis', 'colonne suspendu_depuis présente');
select has_table('public', 'suspensions_plateforme', 'table suspensions_plateforme présente');
select has_function('public', 'est_membre_organisation', array['uuid'], 'est_membre_organisation présente');
select has_function('public', 'plateforme_definir_statut_application_entreprise', array['uuid','text','text','text'], 'RPC statut par application présent');

-- ── Jeu de données ────────────────────────────────────────────────────────────────────────────
-- Organisation A : gestion_pro, colors, tools, reserves. ouvrier-a (10…02) habilité sur les quatre.
-- chef-equipe-a (10…03) : membre sans habilitation ; comptable-a (10…05) : désactivé ; dirigeant-a (10…06) : invité.
-- admin-b (20…01) : membre de B sans droit ; ouvrier-b (20…02) : en attente de validation.
-- plateforme (30…01) : administrateur `total` ; support-aal2 (ee9…02) : administrateur `support`.
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000000000','ee900000-0000-4000-8000-000000000002','authenticated','authenticated','support-aal2@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now());
insert into public.plateforme_admins(email,role,utilisateur_id,actif,statut_identite,activation_at)
values ('support-aal2@invalid.local','support','ee900000-0000-4000-8000-000000000002',true,'active',now());
insert into public.acces_applications_entreprises(entreprise_id, application_code, autorise, source)
select 'a0000000-0000-0000-0000-000000000001', a, true, 'test' from (values ('gestion_pro'),('colors'),('tools'),('reserves')) v(a);
insert into public.habilitations_applications_utilisateurs(entreprise_id, utilisateur_id, application_code, role_code, autorise)
select 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', r.app, r.role, true
from (values ('gestion_pro','gestion_pro_utilisateur'),('colors','colors_consultation'),('tools','tools_pro'),('reserves','reserves_consultation')) r(app, role);
update public.utilisateurs_entreprises set statut = 'desactive' where utilisateur_id = '10000000-0000-0000-0000-000000000005';
update public.utilisateurs_entreprises set statut = 'invite' where utilisateur_id = '10000000-0000-0000-0000-000000000006';
update public.utilisateurs_entreprises set statut = 'en_attente_validation' where utilisateur_id = '20000000-0000-0000-0000-000000000002';
update public.entreprises set abonnement_statut = 'actif' where id in ('a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001');
-- Données réelles par application, pour prouver la VISIBILITÉ (pas seulement la décision)
insert into public.colors_emplacements(id, entreprise_id, nom, type, created_by)
values ('ac200000-0000-0000-0000-0000000000d3','a0000000-0000-0000-0000-000000000001','Dépôt D3','depot','10000000-0000-0000-0000-000000000002');
insert into public.colors_seaux(id, entreprise_id, emplacement_id, marque, produit, mode_quantite, quantite_nominale, quantite_restante, unite, created_by)
values ('ac300000-0000-0000-0000-0000000000d3','a0000000-0000-0000-0000-000000000001','ac200000-0000-0000-0000-0000000000d3','D3','Seau','volume',10,8,'l','10000000-0000-0000-0000-000000000002');
insert into public.reserves_chantiers(id, entreprise_id, nom, created_by)
values ('e0000000-0000-0000-0000-0000000000d3','a0000000-0000-0000-0000-000000000001','Chantier Réserves D3','10000000-0000-0000-0000-000000000002');
insert into public.tools_projects(user_id, organization_id, local_id, schema_version, tool_id, name, input_parameters, project_payload, created_at, updated_at)
values ('10000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','d3d3d3d3-d3d3-d3d3-d3d3-d3d3d3d3d3d3',1,'escalier-droit','Projet Tools D3','{}','{}',now(),now());
-- Sous tools_projects_server_side_access_v1 (D2), lire/écrire le cloud d'organisation exige aussi un entitlement Tools Pro
-- personnel : ce membre en détient un, pour que la sonde mesure bien la suspension GP et non l'absence de Pro.
insert into public.entitlements_utilisateurs_elsatia(utilisateur_id, application_code, niveau, capabilities, source)
values ('10000000-0000-0000-0000-000000000002','tools','pro',array['saved-projects'],'internal');
insert into public.types_chantier(id, entreprise_id, nom) values ('c1000000-0000-0000-0000-0000000000d3','a0000000-0000-0000-0000-000000000001','Type de chantier GP D3');

-- ═══ 1. Référence : tout actif — l'invariant tient et rien ne change vs l'ancienne fonction ═══
select pg_temp.moi('10000000-0000-0000-0000-000000000002');
set local role authenticated;
select is(pg_temp.d('gestion_pro','a0000000-0000-0000-0000-000000000001'), 'autorise', '1. tout actif : gestion_pro autorisé');
select is(pg_temp.d('colors','a0000000-0000-0000-0000-000000000001'), 'autorise', '1. tout actif : colors autorisé');
select is(pg_temp.d('tools','a0000000-0000-0000-0000-000000000001'), 'autorise', '1. tout actif : tools autorisé');
select is(pg_temp.d('reserves','a0000000-0000-0000-0000-000000000001'), 'autorise', '1. tout actif : reserves autorisé');
select is((select count(*) from public.colors_seaux), 1::bigint, '1. tout actif : Colors visible (RLS)');
select is((select count(*) from public.reserves_chantiers), 1::bigint, '1. tout actif : Réserves visible (RLS)');
select is((select count(*) from public.tools_projects), 1::bigint, '1. tout actif : Tools visible (RLS)');
select is((select count(*) from public.types_chantier where id = 'c1000000-0000-0000-0000-0000000000d3'), 1::bigint, '1. tout actif : données Gestion Pro visibles (RLS)');
reset role; select pg_temp.moi(null);
select results_eq($$select invariant_viole, nouveaux_refus, nouvelles_autorisations_gp, nouvelles_autorisations_hors_gp from pg_temp.balayage()$$,
  $$values (0::bigint, 0::bigint, 0::bigint, 0::bigint)$$,
  '1. non-régression : tout actif => aucune différence entre l''ancienne et la nouvelle a_acces_application, invariant tenu');

-- ═══ 2. D3 : GP suspendu ⇒ GP refusé, Colors + Réserves + Tools AUTORISÉS (même utilisateur, même organisation) ═══
update public.entreprises set abonnement_statut = 'suspendu' where id = 'a0000000-0000-0000-0000-000000000001';
select pg_temp.moi('10000000-0000-0000-0000-000000000002');
set local role authenticated;
select is(pg_temp.d('gestion_pro','a0000000-0000-0000-0000-000000000001'), 'abonnement_suspendu', '2. GP suspendu : gestion_pro refusé (abonnement_suspendu)');
select is(pg_temp.d('colors','a0000000-0000-0000-0000-000000000001'), 'autorise', '2. GP suspendu : Colors autorisé');
select is(pg_temp.d('reserves','a0000000-0000-0000-0000-000000000001'), 'autorise', '2. GP suspendu : Réserves autorisé');
select is(pg_temp.d('tools','a0000000-0000-0000-0000-000000000001'), 'autorise', '2. GP suspendu : Tools autorisé');
select is(public.a_acces_application('a0000000-0000-0000-0000-000000000001','gestion_pro'), false, '2. GP suspendu : a_acces_application(gestion_pro) = false');
select is(public.a_acces_application('a0000000-0000-0000-0000-000000000001','colors'), true, '2. GP suspendu : a_acces_application(colors) = true');
select is(public.a_acces_application('a0000000-0000-0000-0000-000000000001','reserves'), true, '2. GP suspendu : a_acces_application(reserves) = true');
select is(public.a_acces_application('a0000000-0000-0000-0000-000000000001','tools'), true, '2. GP suspendu : a_acces_application(tools) = true');
-- RISQUE « autorisé mais aucune donnée » : RÉFUTÉ pour Colors / Tools / Réserves (RLS et RPC passent par a_acces_application)
select is((select count(*) from public.colors_seaux), 1::bigint, '2. GP suspendu : les seaux Colors sont VISIBLES (RLS colors_action_autorisee -> a_acces_application)');
select is(public.colors_action_autorisee('a0000000-0000-0000-0000-000000000001','voir'), true, '2. GP suspendu : colors_action_autorisee(voir)');
select is((select count(*) from public.reserves_chantiers), 1::bigint, '2. GP suspendu : les chantiers Réserves sont VISIBLES');
select is((select count(*) from public.tools_projects), 1::bigint, '2. GP suspendu : les projets Tools d''organisation sont VISIBLES');
select is((select count(*) from public.tools_lister_entreprises_autorisees()), 1::bigint, '2. GP suspendu : Tools liste toujours l''organisation');
select is((select count(*) from public.applications_autorisees('a0000000-0000-0000-0000-000000000001') where application_code = 'gestion_pro'), 0::bigint,
  '2. GP suspendu : applications_autorisees ne liste plus gestion_pro');
select is((select count(*) from public.applications_autorisees('a0000000-0000-0000-0000-000000000001') where application_code in ('colors','tools','reserves')), 3::bigint,
  '2. GP suspendu : applications_autorisees liste toujours Colors, Tools et Réserves');
-- Les données Gestion Pro restent protégées par est_membre_actif (INCHANGÉ)
select is((select count(*) from public.types_chantier where id = 'c1000000-0000-0000-0000-0000000000d3'), 0::bigint, '2. GP suspendu : les données Gestion Pro restent INVISIBLES (est_membre_actif intact)');
select is(public.est_membre_actif('a0000000-0000-0000-0000-000000000001'), false, '2. est_membre_actif inchangé : false quand l''abonnement GP est suspendu');
select is(public.est_membre_organisation('a0000000-0000-0000-0000-000000000001'), true, '2. est_membre_organisation : true (appartenance active, sans abonnement GP)');
-- Résidu couplé (annexe D3 §4) : sans `reserves_decouple_gp_suspension_v1`, les préférences Réserves restent sur
-- est_membre_actif (0 ligne alors que Réserves est autorisé) ; AVEC cette seconde proposition, elles sont lisibles.
-- L'assertion suit donc l'état réel de la fonction au lieu de figer l'un des deux mondes.
select is(((select count(*) from public.reserves_preferences_lire('a0000000-0000-0000-0000-000000000001')) > 0),
  (pg_get_functiondef('public.reserves_preferences_lire(uuid)'::regprocedure) ilike '%est_membre_organisation%'),
  '2. RÉSIDU Réserves : préférences lisibles ssi reserves_decouple_gp_suspension_v1 est appliquée (sinon 0 ligne, couplage GP)');
reset role; select pg_temp.moi(null);
select results_eq($$select invariant_viole, nouveaux_refus, nouvelles_autorisations_gp from pg_temp.balayage()$$,
  $$values (0::bigint, 0::bigint, 0::bigint)$$,
  '2. non-régression : GP suspendu => aucun refus nouveau, aucune autorisation nouvelle pour gestion_pro, invariant tenu');
select cmp_ok((select nouvelles_autorisations_hors_gp from pg_temp.balayage()), '>', 0::bigint,
  '2. seul écart voulu : autorisations NOUVELLES hors gestion_pro (découplage D3)');

-- Membre désactivé d'une organisation GP suspendue : priorité utilisateur_desactive
select pg_temp.moi('10000000-0000-0000-0000-000000000005');
set local role authenticated;
select is(pg_temp.d('gestion_pro','a0000000-0000-0000-0000-000000000001'), 'utilisateur_desactive', '2. priorité : désactivé d''une org GP suspendue = utilisateur_desactive');
reset role; select pg_temp.moi(null);

-- ═══ 3. Colors suspendu (statut propre) ⇒ seul Colors refusé, y compris côté données ═══════════
update public.entreprises set abonnement_statut = 'actif' where id = 'a0000000-0000-0000-0000-000000000001';
-- écriture via le RPC, en administrateur `total` AAL2
select pg_temp.moi('30000000-0000-0000-0000-000000000001', 'aal2');
set local role authenticated;
select is(public.plateforme_definir_statut_application_entreprise('a0000000-0000-0000-0000-000000000001','colors','suspendu','impayé Colors test'), true,
  '3. RPC (total + AAL2) : suspend Colors');
reset role; select pg_temp.moi(null);
select is((select statut_commercial||'/'||(suspendu_depuis is not null) from public.acces_applications_entreprises
            where entreprise_id='a0000000-0000-0000-0000-000000000001' and application_code='colors'), 'suspendu/true', '3. statut_commercial=suspendu, suspendu_depuis renseigné');
select is((select count(*) from public.historique_acces_applications where cible_id='a0000000-0000-0000-0000-000000000001' and application_code='colors'
            and action='statut_commercial:suspendu' and auteur_utilisateur_id='30000000-0000-0000-0000-000000000001' and nouveau->>'motif'='impayé Colors test'), 1::bigint,
  '3. historique_acces_applications : ligne d''audit (auteur, motif)');
select pg_temp.moi('10000000-0000-0000-0000-000000000002');
set local role authenticated;
select is(pg_temp.d('colors','a0000000-0000-0000-0000-000000000001'), 'abonnement_suspendu', '3. Colors suspendu : Colors refusé');
select is(pg_temp.d('gestion_pro','a0000000-0000-0000-0000-000000000001'), 'autorise', '3. Colors suspendu : gestion_pro autorisé');
select is(pg_temp.d('reserves','a0000000-0000-0000-0000-000000000001'), 'autorise', '3. Colors suspendu : Réserves autorisé');
select is(pg_temp.d('tools','a0000000-0000-0000-0000-000000000001'), 'autorise', '3. Colors suspendu : Tools autorisé');
select is((select count(*) from public.colors_seaux), 0::bigint, '3. Colors suspendu : seaux Colors INVISIBLES (RLS)');
select is((select count(*) from public.reserves_chantiers), 1::bigint, '3. Colors suspendu : Réserves visible');
select is((select count(*) from public.types_chantier where id = 'c1000000-0000-0000-0000-0000000000d3'), 1::bigint, '3. Colors suspendu : Gestion Pro visible');
-- un membre ne peut pas se « dé-suspendre » lui-même
select throws_ok($$update public.acces_applications_entreprises set statut_commercial='actif', suspendu_depuis=null where application_code='colors'$$,
  '42501', null, '3. un utilisateur authentifié ne peut pas modifier statut_commercial en direct');
reset role; select pg_temp.moi(null);
-- rétablissement
select pg_temp.moi('30000000-0000-0000-0000-000000000001', 'aal2');
set local role authenticated;
select is(public.plateforme_definir_statut_application_entreprise('a0000000-0000-0000-0000-000000000001','colors','actif'), true, '3. RPC : rétablit Colors');
select is(public.plateforme_definir_statut_application_entreprise('a0000000-0000-0000-0000-000000000001','colors','actif'), false, '3. RPC idempotent : second appel = false');
reset role; select pg_temp.moi(null);
select is((select suspendu_depuis from public.acces_applications_entreprises where entreprise_id='a0000000-0000-0000-0000-000000000001' and application_code='colors'), null,
  '3. rétabli : suspendu_depuis remis à NULL');
select pg_temp.moi('10000000-0000-0000-0000-000000000002');
set local role authenticated;
select is(pg_temp.d('colors','a0000000-0000-0000-0000-000000000001'), 'autorise', '3. rétabli : Colors autorisé');
select is((select count(*) from public.colors_seaux), 1::bigint, '3. rétabli : seaux Colors de nouveau visibles');
reset role; select pg_temp.moi(null);

-- ═══ 4. Gardes du RPC d'écriture du statut par application ════════════════════════════════
select pg_temp.moi('30000000-0000-0000-0000-000000000001', 'aal1');
set local role authenticated;
select throws_like($$select public.plateforme_definir_statut_application_entreprise('a0000000-0000-0000-0000-000000000001','colors','suspendu','motif de test')$$,
  '%AAL2%', '4. total en AAL1 : refusé');
reset role; select pg_temp.moi('ee900000-0000-4000-8000-000000000002', 'aal2');
set local role authenticated;
select throws_like($$select public.plateforme_definir_statut_application_entreprise('a0000000-0000-0000-0000-000000000001','colors','suspendu','motif de test')$$,
  '%rôles total%', '4. rôle plateforme `support` (non total), même en AAL2 : refusé');
reset role; select pg_temp.moi('10000000-0000-0000-0000-000000000001', 'aal2');
set local role authenticated;
select throws_like($$select public.plateforme_definir_statut_application_entreprise('a0000000-0000-0000-0000-000000000001','colors','suspendu','motif de test')$$,
  '%plateforme%', '4. administrateur d''entreprise (non plateforme), même en AAL2 : refusé');
reset role; select pg_temp.moi(null);
set local role authenticated;
select throws_like($$select public.plateforme_definir_statut_application_entreprise('a0000000-0000-0000-0000-000000000001','colors','suspendu','motif de test')$$,
  '%', '4. sans jeton : refusé');
reset role; select pg_temp.moi('30000000-0000-0000-0000-000000000001', 'aal2');
set local role authenticated;
select throws_ok($$select public.plateforme_definir_statut_application_entreprise('a0000000-0000-0000-0000-000000000001','gestion_pro','suspendu','motif de test')$$,
  '22023', null, '4. gestion_pro refusé : son statut est l''abonnement de l''entreprise');
select throws_ok($$select public.plateforme_definir_statut_application_entreprise('a0000000-0000-0000-0000-000000000001','colors','pause','motif de test')$$,
  '22023', null, '4. statut invalide refusé');
select throws_ok($$select public.plateforme_definir_statut_application_entreprise('a0000000-0000-0000-0000-000000000001','colors','suspendu',null)$$,
  '22023', null, '4. suspension sans motif refusée');
select throws_ok($$select public.plateforme_definir_statut_application_entreprise('a0000000-0000-0000-0000-000000000001','drone','suspendu','motif de test')$$,
  '22023', null, '4. application sans droit d''usage dans l''organisation : refusé (pas de création implicite)');
select throws_ok($$select public.plateforme_definir_statut_application_entreprise('b0000000-0000-0000-0000-000000000001','colors','suspendu','motif de test')$$,
  '22023', null, '4. organisation sans droit d''usage : refusé');
-- L'activation d'une application ne réinitialise PAS un statut suspendu (deux actes distincts)
select is(public.plateforme_definir_statut_application_entreprise('a0000000-0000-0000-0000-000000000001','tools','suspendu','impayé Tools test'), true, '4. suspend Tools');
select is(public.plateforme_activer_application_entreprise('a0000000-0000-0000-0000-000000000001','tools',null,null,'test',null) is not null, true, '4. réactivation du droit d''usage Tools (RPC existant)');
reset role; select pg_temp.moi(null);
select is((select statut_commercial from public.acces_applications_entreprises where entreprise_id='a0000000-0000-0000-0000-000000000001' and application_code='tools'),
  'suspendu', '4. la réactivation du droit d''usage ne lève PAS la suspension commerciale');
update public.acces_applications_entreprises set statut_commercial='actif', suspendu_depuis=null
 where entreprise_id='a0000000-0000-0000-0000-000000000001' and application_code='tools';
select throws_ok($$update public.acces_applications_entreprises set statut_commercial='suspendu' where application_code='tools'$$,
  '23514', null, '4. contrainte : suspendu sans suspendu_depuis refusé');

-- ═══ 5. Suspension plateforme globale : TOUT refusé, y compris les autres applications ═══════
select pg_temp.moi('30000000-0000-0000-0000-000000000001', 'aal2');
set local role authenticated;
select throws_ok($$select public.plateforme_suspendre_globalement('compte','30000000-0000-0000-0000-000000000001','motif de test')$$, '22023', null, '5. impossible de suspendre son propre compte');
select throws_ok($$select public.plateforme_suspendre_globalement('compte','10000000-0000-0000-0000-000000000002','abc')$$, '22023', null, '5. motif trop court refusé');
select throws_ok($$select public.plateforme_suspendre_globalement('compte','10000000-0000-0000-0000-000000000002','motif de test', now() - interval '1 hour')$$, '22023', null, '5. fin dans le passé refusée');
select throws_ok($$select public.plateforme_suspendre_globalement('compte','99999999-9999-4999-8999-999999999999','motif de test')$$, '22023', null, '5. compte inconnu refusé');
select throws_ok($$select public.plateforme_suspendre_globalement('planete','10000000-0000-0000-0000-000000000002','motif de test')$$, '22023', null, '5. portée invalide refusée');
create temp table _susp(id uuid);
select lives_ok($$insert into _susp select public.plateforme_suspendre_globalement('compte','10000000-0000-0000-0000-000000000002','compromission suspectée (test)')$$,
  '5. RPC (total + AAL2) : suspend le compte d''ouvrier-a');
reset role; select pg_temp.moi(null);
select is((select count(*) from public.suspensions_plateforme where utilisateur_id='10000000-0000-0000-0000-000000000002' and cree_par='30000000-0000-0000-0000-000000000001'
            and revoque_at is null and portee='compte'), 1::bigint, '5. suspension enregistrée avec son auteur');
select pg_temp.moi('10000000-0000-0000-0000-000000000002');
set local role authenticated;
select is(pg_temp.d('gestion_pro','a0000000-0000-0000-0000-000000000001'), 'suspension_plateforme', '5. compte suspendu : gestion_pro coupé');
select is(pg_temp.d('colors','a0000000-0000-0000-0000-000000000001'), 'suspension_plateforme', '5. compte suspendu : Colors coupé');
select is(pg_temp.d('reserves','a0000000-0000-0000-0000-000000000001'), 'suspension_plateforme', '5. compte suspendu : Réserves coupé');
select is(pg_temp.d('tools','a0000000-0000-0000-0000-000000000001'), 'suspension_plateforme', '5. compte suspendu : Tools coupé');
select is(pg_temp.d('colors', null), 'suspension_plateforme', '5. compte suspendu : même sans organisation');
select is((select count(*) from public.colors_seaux), 0::bigint, '5. compte suspendu : Colors invisible (RLS)');
select is((select count(*) from public.reserves_chantiers), 0::bigint, '5. compte suspendu : Réserves invisible (RLS)');
select is((select count(*) from public.tools_projects), 0::bigint, '5. compte suspendu : Tools invisible (RLS)');
select is((select count(*) from public.suspensions_plateforme), 0::bigint, '5. un utilisateur ordinaire ne peut pas lire les suspensions (RLS)');
select throws_ok($$insert into public.suspensions_plateforme(portee, utilisateur_id, motif) values ('compte','10000000-0000-0000-0000-000000000001','auto-attribution')$$,
  '42501', null, '5. un utilisateur ordinaire ne peut pas écrire une suspension');
reset role; select pg_temp.moi(null);
select results_eq($$select invariant_viole from pg_temp.balayage()$$, $$values (0::bigint)$$, '5. invariant décision/a_acces_application tenu avec une suspension de compte');
-- levée par RPC : rétablit
select pg_temp.moi('30000000-0000-0000-0000-000000000001', 'aal2');
set local role authenticated;
select is((select count(*) from public.suspensions_plateforme where revoque_at is null), 1::bigint, '5. l''administrateur lit les suspensions actives');
select throws_ok($$select public.plateforme_lever_suspension_globale((select id from _susp), 'x')$$, '22023', null, '5. levée sans motif suffisant refusée');
select is(public.plateforme_lever_suspension_globale((select id from _susp), 'incident clos (test)'), true, '5. RPC : lève la suspension');
select is(public.plateforme_lever_suspension_globale((select id from _susp), 'incident clos (test)'), false, '5. levée idempotente');
reset role; select pg_temp.moi(null);
select pg_temp.moi('10000000-0000-0000-0000-000000000002');
set local role authenticated;
select is(pg_temp.d('colors','a0000000-0000-0000-0000-000000000001'), 'autorise', '5. suspension révoquée : Colors rétabli');
select is(pg_temp.d('gestion_pro','a0000000-0000-0000-0000-000000000001'), 'autorise', '5. suspension révoquée : gestion_pro rétabli');
select is((select count(*) from public.colors_seaux), 1::bigint, '5. suspension révoquée : données Colors de nouveau visibles');
reset role; select pg_temp.moi(null);
-- fin programmée : rétablit à l'échéance
insert into public.suspensions_plateforme(portee, entreprise_id, motif, debut_at, fin_at)
values ('organisation', 'a0000000-0000-0000-0000-000000000001', 'suspension d''organisation à durée limitée', now() - interval '1 hour', now() + interval '1 hour');
select pg_temp.moi('10000000-0000-0000-0000-000000000002');
set local role authenticated;
select is(pg_temp.d('tools','a0000000-0000-0000-0000-000000000001'), 'suspension_plateforme', '5. organisation suspendue jusqu''à une date : Tools coupé');
reset role; select pg_temp.moi(null);
update public.suspensions_plateforme set debut_at = now() - interval '3 hours', fin_at = now() - interval '1 second' where revoque_at is null;
select pg_temp.moi('10000000-0000-0000-0000-000000000002');
set local role authenticated;
select is(pg_temp.d('tools','a0000000-0000-0000-0000-000000000001'), 'autorise', '5. fin de suspension atteinte : Tools rétabli');
reset role; select pg_temp.moi(null);
-- gardes de la levée / de la création : non total, AAL1
select pg_temp.moi('ee900000-0000-4000-8000-000000000002', 'aal2');
set local role authenticated;
select throws_like($$select public.plateforme_suspendre_globalement('compte','10000000-0000-0000-0000-000000000002','motif de test')$$, '%rôles total%', '5. support (non total) : suspension refusée');
reset role; select pg_temp.moi('30000000-0000-0000-0000-000000000001', 'aal1');
set local role authenticated;
select throws_like($$select public.plateforme_suspendre_globalement('compte','10000000-0000-0000-0000-000000000002','motif de test')$$, '%AAL2%', '5. total en AAL1 : suspension refusée');
select throws_like($$select public.plateforme_lever_suspension_globale('00000000-0000-0000-0000-000000000000','motif de test')$$, '%AAL2%', '5. total en AAL1 : levée refusée');
reset role; select pg_temp.moi(null);

-- ═══ 6. est_membre_organisation : appartenance active, sans abonnement, sans faux positif ═══
select pg_temp.moi('10000000-0000-0000-0000-000000000002');
set local role authenticated;
select is(public.est_membre_organisation('a0000000-0000-0000-0000-000000000001'), true, '6. membre actif : true');
select is(public.est_membre_organisation('b0000000-0000-0000-0000-000000000001'), false, '6. organisation tierce : false');
reset role; select pg_temp.moi('10000000-0000-0000-0000-000000000005');
set local role authenticated;
select is(public.est_membre_organisation('a0000000-0000-0000-0000-000000000001'), false, '6. membre désactivé : false');
reset role; select pg_temp.moi('10000000-0000-0000-0000-000000000006');
set local role authenticated;
select is(public.est_membre_organisation('a0000000-0000-0000-0000-000000000001'), false, '6. invité : false');
reset role; select pg_temp.moi(null);
select is(has_function_privilege('anon','public.est_membre_organisation(uuid)','execute'), false, '6. est_membre_organisation non appelable par anon');

-- ═══ 7. Différentiel final sur la matrice complète (états : org GP annulée, suspension prévue échue, essai expiré) ═══
update public.entreprises set abonnement_statut = 'annule' where id = 'a0000000-0000-0000-0000-000000000001';
select results_eq($$select invariant_viole, nouveaux_refus, nouvelles_autorisations_gp from pg_temp.balayage()$$, $$values (0::bigint, 0::bigint, 0::bigint)$$,
  '7. GP annulé : invariant tenu, aucun refus nouveau, aucune autorisation nouvelle pour gestion_pro');
update public.entreprises set abonnement_statut = 'actif', suspension_prevue_at = now() - interval '1 day' where id = 'a0000000-0000-0000-0000-000000000001';
select results_eq($$select invariant_viole, nouveaux_refus, nouvelles_autorisations_gp from pg_temp.balayage()$$, $$values (0::bigint, 0::bigint, 0::bigint)$$,
  '7. suspension GP prévue échue : invariant tenu, aucun refus nouveau, aucune autorisation nouvelle pour gestion_pro');
update public.entreprises set suspension_prevue_at = null where id = 'a0000000-0000-0000-0000-000000000001';
update public.acces_applications_entreprises set source='essai', valide_du = now() - interval '60 days', valide_jusqu_au = now() - interval '1 day'
 where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and application_code = 'reserves';
select results_eq($$select invariant_viole, nouveaux_refus, nouvelles_autorisations_gp, nouvelles_autorisations_hors_gp from pg_temp.balayage()$$, $$values (0::bigint, 0::bigint, 0::bigint, 0::bigint)$$,
  '7. essai expiré : décision strictement identique à l''ancienne fonction');

select * from finish();
rollback;
