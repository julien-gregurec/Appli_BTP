begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ELSATIA — Per-App Commercial Suspension & Entitlement Enforcement V1
-- (docs/qualification/ELSATIA_PER_APP_COMMERCIAL_SUSPENSION_V1.md, migration 20260928000804)
--
--   §X  matrice : état global × état GP × état Tools × état Colors × état Réserves
--       → accès attendu (GP métier, Tools, palier Tools, Colors, Réserves, facturation)
--       calculé par un ORACLE indépendant écrit dans ce fichier (aucune fonction testée)
--   §GP webhook Gestion Pro réel (checkout → paid → failed → paid → deleted →
--       réabonnement) : ne modifie QUE les droits GP
--   §W  webhook commercial par application (mock) : isolation, idempotence, ordre,
--       terminal, réabonnement, sécurité
--   §P  suspension plateforme / sécurité : explicite seulement, jamais déduite d'un impayé
--   §T  essai GP expiré ≠ perte des droits indépendants ; essai d'application
--   §D  Réserves D-01 conservée (hôte perd Réserves → invité en lecture seule)
--   §R  Tools / Relevé Pro : personnel inchangé, droits projet organisation séparés
--   §S  Studio (B + I1) : identité utilisateur, indépendante des états d'entreprise
--   §B  chemin facturation admin (état, paiement, réactivation) sans accès métier
--   §A  exposition des prédicats, ACL, audit

\ir fixtures/isolation_multitenant.inc

create function pg_temp.en_tant_que(p uuid) returns void language sql as $$
  select set_config('role','authenticated',true);
  select set_config('request.jwt.claim.sub',p::text,true);
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.en_plateforme(p uuid, aal text) returns void language sql as $$
  select set_config('role','authenticated',true);
  select set_config('request.jwt.claim.sub',p::text,true);
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', aal)::text, true);
$$;
create function pg_temp.en_service() returns void language sql as $$
  select set_config('role','postgres',true);
  select set_config('request.jwt.claim.sub','',true);
  select set_config('request.jwt.claims','',true);
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- §X. Matrice
-- ═══════════════════════════════════════════════════════════════════════════
-- 2 états globaux × 7 états GP × 10 états d'application. Pour chaque couple (global, GP),
-- dix entreprises : Tools prend l'état s, Colors l'état s+3, Réserves l'état s+7 (mod 10),
-- donc chaque application traverse les 10 états sous chaque état GP et global, avec des
-- combinaisons croisées différentes entre applications. 140 entreprises.
create temp table etats_gp (g int primary key, code text, statut text, essai_debut date, essai_fin date,
  suspension_prevue timestamptz, impaye boolean, attendu_etat text, attendu_ouvert boolean);
insert into etats_gp values
  (0, 'essai',              'essai',    current_date - 5,  current_date + 25, null,                         false, 'trial',     true),
  (1, 'essai_expire',       'essai',    current_date - 40, current_date - 10, null,                         false, 'suspended', false),
  (2, 'actif',              'actif',    current_date - 60, current_date - 30, null,                         false, 'active',    true),
  (3, 'impaye_preavis',     'actif',    current_date - 60, current_date - 30, now() + interval '3 days',    true,  'active',    true),
  (4, 'impaye_echu',        'actif',    current_date - 60, current_date - 30, now() - interval '1 minute',  true,  'unpaid',    false),
  (5, 'past_due_unpaid',    'suspendu', current_date - 60, current_date - 30, null,                         false, 'suspended', false),
  (6, 'annule',             'annule',   current_date - 60, current_date - 30, null,                         false, 'cancelled', false);

create temp table etats_app (s int primary key, code text, ligne boolean, autorise boolean, statut text,
  essai_fin timestamptz, attendu_etat text, attendu_ouvert boolean);
insert into etats_app values
  (0, 'entitled',       true,  true,  'entitled',  null,                        'entitled',  true),
  (1, 'trial',          true,  true,  'trial',     now() + interval '10 days',  'trial',     true),
  (2, 'trial_expire',   true,  true,  'trial',     now() - interval '1 minute', 'suspended', false),
  (3, 'active',         true,  true,  'active',    null,                        'active',    true),
  (4, 'past_due',       true,  true,  'past_due',  null,                        'past_due',  false),
  (5, 'unpaid',         true,  true,  'unpaid',    null,                        'unpaid',    false),
  (6, 'cancelled',      true,  true,  'cancelled', null,                        'cancelled', false),
  (7, 'suspended',      true,  true,  'suspended', null,                        'suspended', false),
  (8, 'absent',         false, false, null,        null,                        null,        false),
  (9, 'retire',         true,  false, 'active',    null,                        null,        false);

create temp table matrice as
select row_number() over (order by gl, g.g, s.s)::int as k, gl as global_suspendu, g.g, s.s as s_tools,
       (s.s + 3) % 10 as s_colors, (s.s + 7) % 10 as s_reserves
from (values (false), (true)) v(gl) cross join etats_gp g cross join etats_app s;

create function pg_temp.ent(k int) returns uuid language sql immutable as $$ select ('f0000000-0000-4000-8000-' || lpad(k::text, 12, '0'))::uuid $$;
create function pg_temp.adm(k int) returns uuid language sql immutable as $$ select ('f1000000-0000-4000-8000-' || lpad(k::text, 12, '0'))::uuid $$;
create function pg_temp.mbr(k int) returns uuid language sql immutable as $$ select ('f2000000-0000-4000-8000-' || lpad(k::text, 12, '0'))::uuid $$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', u::text || '@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()
from matrice, lateral (values (pg_temp.adm(k)), (pg_temp.mbr(k))) v(u);
insert into public.utilisateurs (id, prenom, nom)
select u, 'PerApp', u::text from matrice, lateral (values (pg_temp.adm(k)), (pg_temp.mbr(k))) v(u)
on conflict (id) do update set prenom = excluded.prenom, nom = excluded.nom;
insert into public.entreprises (id, nom, code_adhesion, abonnement_statut, abonnement_essai_debut, abonnement_essai_fin)
select pg_temp.ent(k), 'PerApp ' || k, 'PAP' || lpad(k::text, 5, '0'), 'essai', g.essai_debut, g.essai_fin
from matrice m join etats_gp g using (g);
update public.entreprises e set abonnement_statut = g.statut, suspension_prevue_at = g.suspension_prevue,
  impaye_signale_at = case when g.impaye then now() - interval '1 day' end,
  suspension_globale_at = case when m.global_suspendu then now() - interval '1 minute' end,
  suspension_globale_motif = case when m.global_suspendu then 'matrice' end
from matrice m join etats_gp g using (g) where e.id = pg_temp.ent(m.k);

insert into public.postes (id, entreprise_id, nom)
select ('f3000000-0000-4000-8000-' || lpad(k::text, 12, '0'))::uuid, pg_temp.ent(k), 'Direction' from matrice
union all
select ('f4000000-0000-4000-8000-' || lpad(k::text, 12, '0'))::uuid, pg_temp.ent(k), 'Ouvrier' from matrice;
insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
select pg_temp.ent(k), ('f3000000-0000-4000-8000-' || lpad(k::text, 12, '0'))::uuid, p, true
from matrice, unnest(array['gerer_parametres','acces_parametres','acces_chantiers']) p;
insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
select pg_temp.ent(k), ('f4000000-0000-4000-8000-' || lpad(k::text, 12, '0'))::uuid, 'acces_chantiers', true from matrice;
insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut)
select pg_temp.adm(k), pg_temp.ent(k), ('f3000000-0000-4000-8000-' || lpad(k::text, 12, '0'))::uuid, 'actif' from matrice
union all
select pg_temp.mbr(k), pg_temp.ent(k), ('f4000000-0000-4000-8000-' || lpad(k::text, 12, '0'))::uuid, 'actif' from matrice;
update public.utilisateurs u set entreprise_active_id = pg_temp.ent(m.k)
from matrice m where u.id in (pg_temp.adm(m.k), pg_temp.mbr(m.k));

insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source, statut_commercial, essai_fin)
select pg_temp.ent(m.k), x.app, a.autorise, 'test', a.statut, a.essai_fin
from matrice m
cross join lateral (values ('tools', m.s_tools), ('colors', m.s_colors), ('reserves', m.s_reserves)) x(app, s)
join etats_app a on a.s = x.s
where a.ligne;
-- Admin habilité aux trois applications ; membre simple habilité à Tools et Colors seulement.
insert into public.habilitations_applications_utilisateurs (entreprise_id, utilisateur_id, application_code, role_code)
select pg_temp.ent(m.k), pg_temp.adm(m.k), v.a, v.r from matrice m,
  (values ('tools','tools_pro'), ('colors','colors_admin_organisation'), ('reserves','reserves_admin_organisation')) v(a, r)
where exists (select 1 from public.acces_applications_entreprises ae where ae.entreprise_id = pg_temp.ent(m.k) and ae.application_code = v.a)
union all
select pg_temp.ent(m.k), pg_temp.mbr(m.k), v.a, v.r from matrice m,
  (values ('tools','tools_releve_consultation'), ('colors','colors_consultation')) v(a, r)
where exists (select 1 from public.acces_applications_entreprises ae where ae.entreprise_id = pg_temp.ent(m.k) and ae.application_code = v.a);
-- Tools Pro PERSONNEL de chaque admin (achat web).
insert into public.entitlements_utilisateurs_elsatia (utilisateur_id, application_code, niveau, capabilities, source)
select pg_temp.adm(k), 'tools', 'pro', public.tools_capabilities_pro(), 'web' from matrice;

-- Oracle indépendant.
create temp view attendu as
select m.k, m.global_suspendu, g.code as gp, t.code as tools_etat, c.code as colors_etat, r.code as reserves_etat,
       not m.global_suspendu and g.attendu_ouvert as gp_metier,
       not m.global_suspendu and t.attendu_ouvert as tools,
       not m.global_suspendu and c.attendu_ouvert as colors,
       not m.global_suspendu and r.attendu_ouvert as reserves,
       g.attendu_etat as gp_statut, t.attendu_etat as tools_statut, c.attendu_etat as colors_statut, r.attendu_etat as reserves_statut
from matrice m join etats_gp g using (g)
join etats_app t on t.s = m.s_tools join etats_app c on c.s = m.s_colors join etats_app r on r.s = m.s_reserves;

create temp table mesure (k int primary key,
  gp_admin boolean, gp_membre boolean, chantiers_admin boolean,
  tools_admin boolean, colors_admin boolean, reserves_admin boolean,
  tools_membre boolean, colors_membre boolean, reserves_membre boolean,
  palier_org text, palier_perso text, releve_role text,
  etats jsonb, fact_admin_gere boolean, fact_membre_vue boolean, fact_membre_gere boolean,
  plateforme_admin boolean, plateforme_membre boolean);
grant all on mesure to public;

create function pg_temp.mesurer(p_k int) returns void language plpgsql as $$
declare v_e uuid := pg_temp.ent(p_k); r mesure%rowtype;
begin
  r.k := p_k;
  perform pg_temp.en_tant_que(pg_temp.adm(p_k));
  r.gp_admin := public.est_membre_actif(v_e);
  r.chantiers_admin := public.a_permission(v_e, 'acces_chantiers');
  r.tools_admin := public.a_acces_application(v_e, 'tools');
  r.colors_admin := public.a_acces_application(v_e, 'colors');
  r.reserves_admin := public.a_acces_application(v_e, 'reserves');
  r.palier_org := public.tools_resoudre_entitlements_entreprise(v_e)->>'tier';
  r.palier_perso := public.tools_resoudre_entitlements()->>'tier';
  r.releve_role := public.tools_releve_role_courant(v_e);
  r.plateforme_admin := public.est_membre_plateforme_actif(v_e);
  select jsonb_object_agg(application_code, jsonb_build_object('statut', statut_commercial, 'ouvert', acces_ouvert, 'global', compte_global))
    into r.etats from public.etat_commercial_applications(v_e);
  r.fact_admin_gere := coalesce((select bool_and(peut_gerer) from public.etat_commercial_applications(v_e)), false);
  perform pg_temp.en_tant_que(pg_temp.mbr(p_k));
  r.gp_membre := public.est_membre_actif(v_e);
  r.tools_membre := public.a_acces_application(v_e, 'tools');
  r.colors_membre := public.a_acces_application(v_e, 'colors');
  r.reserves_membre := public.a_acces_application(v_e, 'reserves');
  r.plateforme_membre := public.est_membre_plateforme_actif(v_e);
  r.fact_membre_vue := exists (select 1 from public.etat_commercial_applications(v_e));
  r.fact_membre_gere := coalesce((select bool_or(peut_gerer) from public.etat_commercial_applications(v_e)), false);
  perform pg_temp.en_service();
  insert into mesure select r.*;
end;
$$;
select pg_temp.mesurer(k) from matrice order by k;

create function pg_temp.lib(k int) returns text language sql as $$
  select 'X' || a.k || ' [' || case when a.global_suspendu then 'GLOBAL_SUSPENDED' else 'GLOBAL_ACTIVE' end
      || ' gp=' || a.gp || ' tools=' || a.tools_etat || ' colors=' || a.colors_etat || ' reserves=' || a.reserves_etat || ']'
  from attendu a where a.k = lib.k
$$;

select is(m.gp_admin, a.gp_metier, pg_temp.lib(a.k) || ' GP métier (admin)') from attendu a join mesure m using (k) order by k;
select is(m.gp_membre, a.gp_metier, pg_temp.lib(a.k) || ' GP métier (membre)') from attendu a join mesure m using (k) order by k;
select is(m.chantiers_admin, a.gp_metier, pg_temp.lib(a.k) || ' GP permission métier') from attendu a join mesure m using (k) order by k;
select is(m.tools_admin, a.tools, pg_temp.lib(a.k) || ' Tools organisation (admin)') from attendu a join mesure m using (k) order by k;
select is(m.tools_membre, a.tools, pg_temp.lib(a.k) || ' Tools organisation (membre)') from attendu a join mesure m using (k) order by k;
select is(m.palier_org, case when a.tools then 'pro' else 'free' end, pg_temp.lib(a.k) || ' palier Tools organisation') from attendu a join mesure m using (k) order by k;
select is(m.palier_perso, 'pro', pg_temp.lib(a.k) || ' Tools Pro PERSONNEL intact (droit utilisateur)') from attendu a join mesure m using (k) order by k;
select is(m.releve_role is not null, a.tools, pg_temp.lib(a.k) || ' rôle Relevé organisation suit Tools, pas GP') from attendu a join mesure m using (k) order by k;
select is(m.colors_admin, a.colors, pg_temp.lib(a.k) || ' Colors (admin)') from attendu a join mesure m using (k) order by k;
select is(m.colors_membre, a.colors, pg_temp.lib(a.k) || ' Colors (membre)') from attendu a join mesure m using (k) order by k;
select is(m.reserves_admin, a.reserves, pg_temp.lib(a.k) || ' Réserves (admin)') from attendu a join mesure m using (k) order by k;
select is(m.reserves_membre, false, pg_temp.lib(a.k) || ' Réserves (membre non habilité) : jamais') from attendu a join mesure m using (k) order by k;
select is(m.plateforme_admin and m.plateforme_membre, not a.global_suspendu, pg_temp.lib(a.k) || ' appartenance plateforme = non suspendu globalement') from attendu a join mesure m using (k) order by k;
-- Chemin facturation : l'admin voit et gère, le membre voit sans gérer — dans TOUS les états.
select ok(m.fact_admin_gere and m.fact_membre_vue and not m.fact_membre_gere, pg_temp.lib(a.k) || ' facturation : admin gère, membre voit') from attendu a join mesure m using (k) order by k;
select is(m.etats->'gestion_pro'->>'statut', a.gp_statut, pg_temp.lib(a.k) || ' état commercial GP exposé') from attendu a join mesure m using (k) order by k;
select is(m.etats->'tools'->>'statut', a.tools_statut, pg_temp.lib(a.k) || ' état commercial Tools exposé') from attendu a join mesure m using (k) order by k;
select is(m.etats->'colors'->>'statut', a.colors_statut, pg_temp.lib(a.k) || ' état commercial Colors exposé') from attendu a join mesure m using (k) order by k;
select is(m.etats->'reserves'->>'statut', a.reserves_statut, pg_temp.lib(a.k) || ' état commercial Réserves exposé') from attendu a join mesure m using (k) order by k;
select is(coalesce((m.etats->'colors'->>'ouvert')::boolean, false), a.colors, pg_temp.lib(a.k) || ' ouverture Colors exposée = accès réel') from attendu a join mesure m using (k) order by k;
select is(m.etats->'gestion_pro'->>'global', case when a.global_suspendu then 'ACCOUNT_GLOBAL_SUSPENDED' else 'ACCOUNT_GLOBAL_ACTIVE' end,
  pg_temp.lib(a.k) || ' état global exposé') from attendu a join mesure m using (k) order by k;

-- Cas principal nommé : GP impayé, Tools payé → GP bloqué, Tools accessible.
select ok((select not m.gp_admin and m.tools_admin and m.palier_org = 'pro' from attendu a join mesure m using (k)
  where not a.global_suspendu and a.gp = 'past_due_unpaid' and a.tools_etat = 'active'),
  'CAS PRINCIPAL : GP impayé + Tools payé → GP métier bloqué, Tools accessible (Pro)');
select ok((select not m.gp_admin and m.tools_admin from attendu a join mesure m using (k)
  where not a.global_suspendu and a.gp = 'impaye_echu' and a.tools_etat = 'active'),
  'CAS PRINCIPAL (impayé signalé manuellement, échu) : GP bloqué, Tools accessible');

-- ═══════════════════════════════════════════════════════════════════════════
-- §GP. Webhook Gestion Pro réel : ne modifie que les droits GP
-- ═══════════════════════════════════════════════════════════════════════════
create temp table verite_stripe (sub text primary key, status text not null);
grant all on verite_stripe to public;
create function pg_temp.t(n integer) returns timestamptz language sql immutable
as $$ select timestamptz '2026-11-01 00:00:00+00' + make_interval(secs => n) $$;
create function pg_temp.statut(stripe text) returns text language sql immutable as $$
  select case when stripe = 'trialing' then 'essai' when stripe = 'active' then 'actif'
              when stripe in ('past_due','unpaid','incomplete','paused') then 'suspendu' else 'annule' end
$$;
create function pg_temp.verite(p_sub text, p_status text) returns void language sql as $$
  insert into verite_stripe values (p_sub, p_status) on conflict (sub) do update set status = excluded.status
$$;
create function pg_temp.evt_sub(e uuid, evt text, typ text, sub text, n integer) returns text language plpgsql as $$
declare v_courante text; v_cus text; v_issue text; v_status text; v_anc_status text; v_res jsonb;
begin
  select stripe_subscription_id, stripe_customer_id into v_courante, v_cus from public.entreprises where id = e;
  select status into v_status from verite_stripe where verite_stripe.sub = evt_sub.sub;
  if v_courante is not null and v_courante <> sub then
    select status into v_anc_status from verite_stripe where verite_stripe.sub = v_courante;
  end if;
  v_issue := public.relier_subscription_reabonnement_service(e, sub, v_cus, v_status,
    case when v_courante <> sub then v_courante end, v_anc_status);
  if v_issue in ('remplacee', 'terminale_ignoree') then return v_issue; end if;
  v_res := public.synchroniser_abonnement_stripe_ordonne_service(
    e, sub, v_cus, pg_temp.statut(v_status), 'mini', 'mensuel',
    current_date + 30, null, null, pg_temp.t(0), pg_temp.t(0) + interval '30 days',
    evt, typ, pg_temp.t(n), 'subscription', sub);
  return v_issue || ':' || (v_res->>'decision');
end;
$$;
create function pg_temp.fac(e uuid, evt text, typ text, invoice text, sub text, n integer) returns jsonb language sql as $$
  select public.appliquer_evenement_facture_abonnement_v2_service(
    e, evt, typ, pg_temp.t(n), invoice, case when typ = 'invoice.paid' then 'paid' else 'open' end, pg_temp.t(n),
    'ELS-' || invoice, pg_temp.t(0), pg_temp.t(0) + interval '30 days', 79, 0, 79, 'eur',
    'https://invoice.stripe.com/i/' || invoice, null, sub)
$$;
create function pg_temp.empreinte_apps(e uuid) returns text language sql as $$
  select string_agg(application_code || ':' || autorise || ':' || statut_commercial || ':' || coalesce(commercial_subscription_ref, '-')
                    || ':' || coalesce(valide_jusqu_au::text, '-') || ':' || updated_at::text, ',' order by application_code)
  from public.acces_applications_entreprises where entreprise_id = e
$$;
create function pg_temp.acces_i() returns text language plpgsql as $$
declare v text;
begin
  perform pg_temp.en_tant_que('f1100000-0000-4000-8000-000000000001');
  v := concat_ws('/',
    'gp=' || public.est_membre_actif('f0100000-0000-4000-8000-000000000001'),
    'tools=' || public.a_acces_application('f0100000-0000-4000-8000-000000000001', 'tools'),
    'colors=' || public.a_acces_application('f0100000-0000-4000-8000-000000000001', 'colors'),
    'reserves=' || public.a_acces_application('f0100000-0000-4000-8000-000000000001', 'reserves'));
  perform pg_temp.en_service();
  return v;
end;
$$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'f1100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'perapp-i@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now());
insert into public.utilisateurs (id, prenom, nom) values ('f1100000-0000-4000-8000-000000000001', 'Iso', 'I') on conflict (id) do nothing;
insert into public.entreprises (id, nom, code_adhesion, stripe_customer_id)
values ('f0100000-0000-4000-8000-000000000001', 'Isolation webhook I', 'PAPI0001', 'cus_PAI');
insert into public.postes (id, entreprise_id, nom) values ('f3100000-0000-4000-8000-000000000001', 'f0100000-0000-4000-8000-000000000001', 'Direction');
insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
select 'f0100000-0000-4000-8000-000000000001', 'f3100000-0000-4000-8000-000000000001', p, true from unnest(array['gerer_parametres','acces_chantiers']) p;
insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut)
values ('f1100000-0000-4000-8000-000000000001', 'f0100000-0000-4000-8000-000000000001', 'f3100000-0000-4000-8000-000000000001', 'actif');
insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source, statut_commercial)
values ('f0100000-0000-4000-8000-000000000001', 'tools', true, 'test', 'active'),
       ('f0100000-0000-4000-8000-000000000001', 'colors', true, 'test', 'entitled'),
       ('f0100000-0000-4000-8000-000000000001', 'reserves', true, 'test', 'entitled');
insert into public.habilitations_applications_utilisateurs (entreprise_id, utilisateur_id, application_code, role_code)
values ('f0100000-0000-4000-8000-000000000001', 'f1100000-0000-4000-8000-000000000001', 'tools', 'tools_pro'),
       ('f0100000-0000-4000-8000-000000000001', 'f1100000-0000-4000-8000-000000000001', 'colors', 'colors_admin_organisation'),
       ('f0100000-0000-4000-8000-000000000001', 'f1100000-0000-4000-8000-000000000001', 'reserves', 'reserves_admin_organisation');
select set_config('q.emp_i', pg_temp.empreinte_apps('f0100000-0000-4000-8000-000000000001'), true);
select set_config('q.hist_i', (select count(*) from public.historique_acces_applications where cible_id = 'f0100000-0000-4000-8000-000000000001')::text, true);

select pg_temp.verite('sub_PAI1', 'trialing');
select is(pg_temp.evt_sub('f0100000-0000-4000-8000-000000000001', 'evt_PAI_co', 'checkout.session.completed', 'sub_PAI1', 10), 'lie:applique', 'GP1 checkout GP appliqué');
select pg_temp.verite('sub_PAI1', 'active');
select is(pg_temp.fac('f0100000-0000-4000-8000-000000000001', 'evt_PAI_p1', 'invoice.paid', 'in_PAI1', 'sub_PAI1', 100)->>'decision', 'applique', 'GP2 invoice.paid appliqué');
select pg_temp.evt_sub('f0100000-0000-4000-8000-000000000001', 'evt_PAI_up', 'customer.subscription.updated', 'sub_PAI1', 101);
select is(pg_temp.acces_i(), 'gp=true/tools=true/colors=true/reserves=true', 'GP2 GP actif : tout ouvert');
select is(pg_temp.fac('f0100000-0000-4000-8000-000000000001', 'evt_PAI_f2', 'invoice.payment_failed', 'in_PAI2', 'sub_PAI1', 200)->>'statut_resultant', 'suspendu', 'GP3 payment_failed GP : suspension GP immédiate');
select is(pg_temp.acces_i(), 'gp=false/tools=true/colors=true/reserves=true', 'GP3 payment_failed GP : SEUL GP est coupé');
select is(pg_temp.empreinte_apps('f0100000-0000-4000-8000-000000000001'), current_setting('q.emp_i'), 'GP3 aucune ligne de droit d''application modifiée par le webhook GP');
select pg_temp.verite('sub_PAI1', 'unpaid');
select pg_temp.evt_sub('f0100000-0000-4000-8000-000000000001', 'evt_PAI_un', 'customer.subscription.updated', 'sub_PAI1', 201);
select is(pg_temp.acces_i(), 'gp=false/tools=true/colors=true/reserves=true', 'GP4 unpaid GP : SEUL GP est coupé');
select pg_temp.verite('sub_PAI1', 'active');
select pg_temp.fac('f0100000-0000-4000-8000-000000000001', 'evt_PAI_p2', 'invoice.paid', 'in_PAI2', 'sub_PAI1', 300);
select is(pg_temp.acces_i(), 'gp=true/tools=true/colors=true/reserves=true', 'GP5 réactivation GP : GP rouvert, autres inchangés');
select pg_temp.verite('sub_PAI1', 'canceled');
select is(pg_temp.evt_sub('f0100000-0000-4000-8000-000000000001', 'evt_PAI_del', 'customer.subscription.deleted', 'sub_PAI1', 400), 'deja_lie:applique', 'GP6 annulation GP appliquée');
select is(pg_temp.acces_i(), 'gp=false/tools=true/colors=true/reserves=true', 'GP6 annulation GP : SEUL GP est coupé');
select pg_temp.verite('sub_PAI2', 'active');
select is(pg_temp.evt_sub('f0100000-0000-4000-8000-000000000001', 'evt_PAI_re', 'checkout.session.completed', 'sub_PAI2', 500), 'relie:applique', 'GP7 réabonnement GP appliqué (nouvelle subscription reliée)');
select is(pg_temp.acces_i(), 'gp=true/tools=true/colors=true/reserves=true', 'GP7 réabonnement GP : tout ouvert');
select is(pg_temp.empreinte_apps('f0100000-0000-4000-8000-000000000001'), current_setting('q.emp_i'), 'GP8 cycle GP complet : droits Tools / Colors / Réserves strictement intacts');
select is((select count(*) from public.historique_acces_applications where cible_id = 'f0100000-0000-4000-8000-000000000001')::text,
  current_setting('q.hist_i'), 'GP8 aucune écriture d''audit d''application par le flux GP');
select is((select suspension_globale_at from public.entreprises where id = 'f0100000-0000-4000-8000-000000000001'), null, 'GP8 aucune suspension globale déduite du cycle GP');

-- ═══════════════════════════════════════════════════════════════════════════
-- §W. Webhook commercial par application (Stripe mock)
-- ═══════════════════════════════════════════════════════════════════════════
create function pg_temp.w(app text, st text, sub text, evt text, n int, essai timestamptz default null) returns text language sql as $$
  select public.synchroniser_statut_commercial_application_service('f0100000-0000-4000-8000-000000000001', app, st, sub, evt, pg_temp.t(n), essai)->>'decision'
$$;
create function pg_temp.st_app(app text) returns text language sql as $$
  select statut_commercial from public.acces_applications_entreprises
  where entreprise_id = 'f0100000-0000-4000-8000-000000000001' and application_code = app
$$;
select set_config('q.gp_avant_w', (select abonnement_statut || ':' || coalesce(stripe_subscription_id, '-') || ':' || updated_at
  from public.entreprises where id = 'f0100000-0000-4000-8000-000000000001'), true);

select is(pg_temp.w('tools', 'active', 'sub_T1', 'evt_T_1', 10), 'applique', 'W1 Tools : subscription rattachée (manuel → Stripe)');
select is(pg_temp.w('tools', 'past_due', 'sub_T1', 'evt_T_2', 20), 'applique', 'W2 Tools past_due appliqué');
select is(pg_temp.acces_i(), 'gp=true/tools=false/colors=true/reserves=true', 'W2 Tools past_due : SEUL Tools est coupé');
select is(pg_temp.st_app('colors') || '/' || pg_temp.st_app('reserves'), 'entitled/entitled', 'W2 lignes Colors et Réserves intactes');
select is((select abonnement_statut || ':' || coalesce(stripe_subscription_id, '-') || ':' || updated_at
  from public.entreprises where id = 'f0100000-0000-4000-8000-000000000001'), current_setting('q.gp_avant_w'), 'W2 état GP (ligne entreprise) intact');
select pg_temp.en_tant_que('f1100000-0000-4000-8000-000000000001');
select is(public.tools_resoudre_entitlements_entreprise('f0100000-0000-4000-8000-000000000001')->>'tier', 'free', 'W2 Tools organisation → Free');
select is(public.tools_resoudre_entitlements()->>'tier', 'free', 'W2 (admin sans achat personnel) palier personnel Free');
select pg_temp.en_service();
select is(public.synchroniser_statut_commercial_application_service('f0100000-0000-4000-8000-000000000001', 'tools', 'past_due', 'sub_T1', 'evt_T_2', pg_temp.t(20))->>'decision',
  'deja_traite', 'W3 doublon exact : deja_traite');
select is(pg_temp.w('tools', 'active', 'sub_T1', 'evt_T_old', 15), 'perime', 'W4 événement antérieur au filigrane : périmé');
select is(pg_temp.st_app('tools'), 'past_due', 'W4 toujours past_due');
select is(pg_temp.w('tools', 'active', 'sub_T1', 'evt_T_3', 30), 'applique', 'W5 réactivation Tools (paiement)');
select is(pg_temp.acces_i(), 'gp=true/tools=true/colors=true/reserves=true', 'W5 Tools rouvert');
select is(pg_temp.w('tools', 'active', 'sub_AUTRE', 'evt_T_x', 35), 'sans_effet', 'W6 subscription non rattachée (autre subscription vivante) : sans effet');
select is(pg_temp.w('tools', 'canceled', 'sub_T1', 'evt_T_4', 40), 'applique', 'W7 annulation Tools');
select is(pg_temp.w('tools', 'active', 'sub_T1', 'evt_T_5', 50), 'sans_effet', 'W8 subscription terminée jamais rouverte (même règle que B-1)');
select is(pg_temp.st_app('tools'), 'cancelled', 'W8 toujours cancelled');
select is(pg_temp.w('tools', 'canceled', 'sub_T1', 'evt_T_late', 5), 'sans_effet', 'W9 terminaison re-livrée en retard : aucun changement (déjà terminal)');
select is(pg_temp.w('tools', 'active', 'sub_T2', 'evt_T_6', 60), 'applique', 'W10 réabonnement Tools (nouvelle subscription)');
select is(pg_temp.acces_i(), 'gp=true/tools=true/colors=true/reserves=true', 'W10 Tools rouvert par le réabonnement');
-- Terminaison livrée AVANT un événement plus récent de la même subscription : appliquée quand même.
select is(pg_temp.w('tools', 'past_due', 'sub_T2', 'evt_T_7', 80), 'applique', 'W11 past_due');
select is(pg_temp.w('tools', 'canceled', 'sub_T2', 'evt_T_8', 70), 'applique', 'W11 terminaison plus ancienne que le filigrane : appliquée (irréversible)');
select is(pg_temp.st_app('tools'), 'cancelled', 'W11 cancelled');
-- Essai d'application.
select is(pg_temp.w('colors', 'trialing', 'sub_C1', 'evt_C_1', 10, now() + interval '5 days'), 'applique', 'W12 Colors en essai');
select is(pg_temp.acces_i(), 'gp=true/tools=false/colors=true/reserves=true', 'W12 Colors essai ouvert');
update public.acces_applications_entreprises set essai_fin = now() - interval '1 second'
where entreprise_id = 'f0100000-0000-4000-8000-000000000001' and application_code = 'colors';
select is(pg_temp.acces_i(), 'gp=true/tools=false/colors=false/reserves=true', 'W13 essai Colors échu : SEUL Colors coupé');
select is(pg_temp.w('colors', 'active', 'sub_C1', 'evt_C_2', 20), 'applique', 'W14 essai Colors converti');
select is(pg_temp.acces_i(), 'gp=true/tools=false/colors=true/reserves=true', 'W14 Colors rouvert');
-- Entitlement absent : créé seulement par un état ouvrant.
delete from public.acces_applications_entreprises where entreprise_id = 'f0100000-0000-4000-8000-000000000001' and application_code = 'reserves';
select is(pg_temp.w('reserves', 'past_due', 'sub_R1', 'evt_R_1', 10), 'sans_effet', 'W15 aucun droit Réserves + past_due : rien n''est créé');
select is(pg_temp.st_app('reserves'), null, 'W15 toujours aucune ligne');
select is(pg_temp.w('reserves', 'active', 'sub_R1', 'evt_R_2', 20), 'applique', 'W16 Checkout Réserves : droit créé');
select is(pg_temp.st_app('reserves'), 'active', 'W16 ligne Réserves active');
-- Garde-fous.
select throws_ok($$select public.synchroniser_statut_commercial_application_service('f0100000-0000-4000-8000-000000000001','gestion_pro','active','s','evt_gp',now())$$,
  '22023', null, 'W17 Gestion Pro refusé : son flux d''abonnement reste l''unique autorité');
select throws_ok($$select public.synchroniser_statut_commercial_application_service('f0100000-0000-4000-8000-000000000001','tools','bizarre','s','evt_bz',now())$$,
  '22023', null, 'W18 statut Stripe inconnu refusé');
select throws_ok($$select public.synchroniser_statut_commercial_application_service('f0100000-0000-4000-8000-000000000001','colors','trialing','s','evt_tr',now())$$,
  '22023', null, 'W19 essai sans date de fin refusé');
select pg_temp.en_tant_que('f1100000-0000-4000-8000-000000000001');
select throws_ok($$select public.synchroniser_statut_commercial_application_service('f0100000-0000-4000-8000-000000000001','tools','active','s','evt_self',now())$$,
  '42501', null, 'W20 un membre ne peut pas appeler le webhook');
select throws_ok($$update public.acces_applications_entreprises set statut_commercial = 'active' where entreprise_id = 'f0100000-0000-4000-8000-000000000001'$$,
  '42501', null, 'W21 un admin tenant ne réactive pas lui-même un droit');
select pg_temp.en_service();
select ok(has_function_privilege('service_role', 'public.synchroniser_statut_commercial_application_service(uuid,text,text,text,text,timestamptz,timestamptz)', 'execute'), 'W22 service_role peut appeler le webhook');
select is((select count(*)::int from public.historique_acces_applications
  where cible_id = 'f0100000-0000-4000-8000-000000000001' and action like 'statut_commercial:%'),
  (select count(*)::int from public.evenements_commerciaux_applications
   where entreprise_id = 'f0100000-0000-4000-8000-000000000001' and decision = 'applique'), 'W23 audit : une ligne par décision appliquée');
select ok((select bool_and(motif is not null) from public.evenements_commerciaux_applications
  where entreprise_id = 'f0100000-0000-4000-8000-000000000001' and decision in ('perime', 'sans_effet')), 'W23 audit : tout refus est motivé');
select is((select suspension_globale_at from public.entreprises where id = 'f0100000-0000-4000-8000-000000000001'), null, 'W24 aucune suspension globale déduite d''un impayé d''application');
select throws_ok($$insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, statut_commercial) values ('f0100000-0000-4000-8000-000000000001', 'gestion_pro', true, 'past_due')$$,
  '23514', null, 'W25 contrainte : l''état commercial GP n''a qu''une source (entreprises)');

-- ═══════════════════════════════════════════════════════════════════════════
-- §P. Suspension plateforme / sécurité : explicite uniquement
-- ═══════════════════════════════════════════════════════════════════════════
-- P0. Chemins d'impayé : aucun ne pose la suspension globale.
select pg_temp.en_plateforme('30000000-0000-0000-0000-000000000001', 'aal2');
select lives_ok($$select public.plateforme_signaler_impaye('a0000000-0000-0000-0000-000000000001', 'Test per-app')$$, 'P0 impayé signalé (plateforme)');
select pg_temp.en_service();
update public.entreprises set suspension_prevue_at = now() - interval '1 second' where id = 'a0000000-0000-0000-0000-000000000001';
select ok(public.appliquer_suspensions_impayes() >= 1, 'P0 cron des impayés appliqué');
select is((select abonnement_statut || ':' || coalesce(suspension_globale_at::text, 'aucune') from public.entreprises where id = 'a0000000-0000-0000-0000-000000000001'),
  'suspendu:aucune', 'P0 impayé échu : GP suspendu, AUCUNE suspension globale');
select is((select count(*)::int from public.entreprises where suspension_globale_at is not null and nom not like 'PerApp %'), 0,
  'P0 aucune entreprise hors matrice n''est suspendue globalement');
select pg_temp.en_plateforme('30000000-0000-0000-0000-000000000001', 'aal2');
select lives_ok($$select public.plateforme_enregistrer_reglement('a0000000-0000-0000-0000-000000000001', 'régularisé')$$, 'P0 règlement enregistré');
select pg_temp.en_service();
update public.entreprises set abonnement_statut = 'actif' where id = 'a0000000-0000-0000-0000-000000000001';

-- P1. Droits requis.
insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source)
values ('a0000000-0000-0000-0000-000000000001', 'tools', true, 'test'), ('a0000000-0000-0000-0000-000000000001', 'colors', true, 'test'),
       ('a0000000-0000-0000-0000-000000000001', 'reserves', true, 'test')
on conflict (entreprise_id, application_code) do update set autorise = true, statut_commercial = 'entitled';
insert into public.habilitations_applications_utilisateurs (entreprise_id, utilisateur_id, application_code, role_code)
values ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'tools', 'tools_pro'),
       ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'colors', 'colors_admin_organisation'),
       ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'reserves', 'reserves_admin_organisation')
on conflict (entreprise_id, utilisateur_id, application_code) do nothing;
create function pg_temp.acces_a() returns text language plpgsql as $$
declare v text;
begin
  perform pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
  v := concat_ws('/',
    'gp=' || public.est_membre_actif('a0000000-0000-0000-0000-000000000001'),
    'tools=' || public.a_acces_application('a0000000-0000-0000-0000-000000000001', 'tools'),
    'colors=' || public.a_acces_application('a0000000-0000-0000-0000-000000000001', 'colors'),
    'reserves=' || public.a_acces_application('a0000000-0000-0000-0000-000000000001', 'reserves'));
  perform pg_temp.en_service();
  return v;
end;
$$;
select is(pg_temp.acces_a(), 'gp=true/tools=true/colors=true/reserves=true', 'P1 A de référence : tout ouvert');

select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select throws_ok($$select public.plateforme_suspendre_compte_global('a0000000-0000-0000-0000-000000000001', 'x')$$, '42501', null, 'P1 un admin tenant ne suspend pas');
select throws_ok($$update public.entreprises set suspension_globale_at = now(), suspension_globale_motif = 'x' where id = 'a0000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'P1 écriture directe de la colonne refusée (ACL)');
select pg_temp.en_service();
grant update (suspension_globale_at, suspension_globale_motif) on public.entreprises to authenticated;
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select throws_ok($$update public.entreprises set suspension_globale_at = now(), suspension_globale_motif = 'auto' where id = 'a0000000-0000-0000-0000-000000000001'$$,
  '42501', 'La suspension globale d''un compte est réservée à la plateforme', 'P1 ACL rouverte : le trigger refuse seul');
select pg_temp.en_service();
revoke update (suspension_globale_at, suspension_globale_motif) on public.entreprises from authenticated;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'perapp-facturation@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now());
insert into public.plateforme_admins (email, role, utilisateur_id, actif, statut_identite, activation_at)
values ('perapp-facturation@invalid.local', 'facturation', 'f9000000-0000-4000-8000-000000000001', true, 'active', now());
select pg_temp.en_plateforme('f9000000-0000-4000-8000-000000000001', 'aal2');
select throws_ok($$select public.plateforme_suspendre_compte_global('a0000000-0000-0000-0000-000000000001', 'x')$$, '42501', null, 'P2 rôle facturation : refusé (sécurité = rôle total)');
select pg_temp.en_plateforme('30000000-0000-0000-0000-000000000001', 'aal1');
select throws_ok($$select public.plateforme_suspendre_compte_global('a0000000-0000-0000-0000-000000000001', 'x')$$, 'P0001', 'Authentification forte AAL2 requise', 'P2 total sans AAL2 : refusé');
select pg_temp.en_plateforme('30000000-0000-0000-0000-000000000001', 'aal2');
select throws_ok($$select public.plateforme_suspendre_compte_global('a0000000-0000-0000-0000-000000000001', '  ')$$, '22023', null, 'P2 motif obligatoire');
select isnt(public.plateforme_suspendre_compte_global('a0000000-0000-0000-0000-000000000001', 'Compromission suspectée'), null, 'P3 total + AAL2 : suspension globale posée');
select pg_temp.en_service();
select set_config('q.susp_at', (select suspension_globale_at::text from public.entreprises where id = 'a0000000-0000-0000-0000-000000000001'), true);
select pg_temp.en_plateforme('30000000-0000-0000-0000-000000000001', 'aal2');
select is(public.plateforme_suspendre_compte_global('a0000000-0000-0000-0000-000000000001', 'bis')::text, current_setting('q.susp_at'), 'P3 idempotent : la première suspension fait foi');
select pg_temp.en_service();
select is(pg_temp.acces_a(), 'gp=false/tools=false/colors=false/reserves=false', 'P4 suspension globale : TOUTES les applications coupées');
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select is(public.tools_resoudre_entitlements_entreprise('a0000000-0000-0000-0000-000000000001')->>'tier', 'free', 'P4 Tools organisation → Free');
select is((select count(*)::int from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001'), 0, 'P4 données GP invisibles');
select is((select compte_global from public.etat_commercial_applications('a0000000-0000-0000-0000-000000000001') limit 1), 'ACCOUNT_GLOBAL_SUSPENDED', 'P5 admin : état du compte visible');
select ok((select bool_and(not acces_ouvert) from public.etat_commercial_applications('a0000000-0000-0000-0000-000000000001')), 'P5 aucune application annoncée ouverte');
select ok(position('motif' in pg_get_function_result('public.etat_commercial_applications'::regproc)) = 0, 'P5 le motif de sécurité n''est pas exposé au tenant');
select pg_temp.en_service();
select is((select count(*)::int from public.historique_mutations_plateforme
  where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and action = 'suspension_globale'), 1, 'P6 audit plateforme : une ligne (idempotence comprise)');
select pg_temp.en_plateforme('30000000-0000-0000-0000-000000000001', 'aal2');
select lives_ok($$select public.plateforme_lever_suspension_globale('a0000000-0000-0000-0000-000000000001', 'Enquête close')$$, 'P7 levée explicite');
select pg_temp.en_service();
select is(pg_temp.acces_a(), 'gp=true/tools=true/colors=true/reserves=true', 'P7 levée : tout rouvert, sans reconnexion');
select is((select count(*)::int from public.historique_mutations_plateforme
  where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and action = 'suspension_globale_levee'), 1, 'P7 levée journalisée');
-- Programmée (future) : sans effet tant qu'elle n'est pas échue.
update public.entreprises set suspension_globale_at = now() + interval '1 day', suspension_globale_motif = 'programmée' where id = 'a0000000-0000-0000-0000-000000000001';
select is(pg_temp.acces_a(), 'gp=true/tools=true/colors=true/reserves=true', 'P8 suspension globale future : aucun effet');
update public.entreprises set suspension_globale_at = null, suspension_globale_motif = null where id = 'a0000000-0000-0000-0000-000000000001';
-- Support plateforme : conservé pour l'enquête (comme avant pour GP).
select ok(public.compte_suspendu_globalement('a0000000-0000-0000-0000-000000000001') = false, 'P9 A n''est plus suspendu');

-- ═══════════════════════════════════════════════════════════════════════════
-- §T. Essai GP expiré ≠ perte des droits indépendants
-- ═══════════════════════════════════════════════════════════════════════════
update public.entreprises set abonnement_statut = 'essai', abonnement_essai_debut = current_date - 40, abonnement_essai_fin = current_date - 10
where id = 'a0000000-0000-0000-0000-000000000001';
select is(pg_temp.acces_a(), 'gp=false/tools=true/colors=true/reserves=true', 'T1 essai GP expiré : GP bloqué, Tools / Colors / Réserves conservés');
select is((select statut_commercial from public.acces_applications_entreprises where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and application_code = 'tools'),
  'entitled', 'T2 l''expiration de l''essai GP n''écrit rien sur les droits indépendants');
update public.entreprises set abonnement_statut = 'actif' where id = 'a0000000-0000-0000-0000-000000000001';
select is(pg_temp.acces_a(), 'gp=true/tools=true/colors=true/reserves=true', 'T3 conversion GP : tout ouvert');

-- ═══════════════════════════════════════════════════════════════════════════
-- §D. Réserves D-01 : hôte perd Réserves → invité externe en lecture seule
-- ═══════════════════════════════════════════════════════════════════════════
-- Hôte H = f0100000…001 (I), invité G = B (fixture). Réserves de H réactivé.
insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source, statut_commercial)
values ('b0000000-0000-0000-0000-000000000001', 'reserves', true, 'test', 'entitled')
on conflict (entreprise_id, application_code) do update set autorise = true, statut_commercial = 'entitled';
select pg_temp.en_tant_que('f1100000-0000-4000-8000-000000000001');
insert into public.reserves_chantiers (id, entreprise_id, nom) values ('f8000000-0000-4000-8000-000000000001', 'f0100000-0000-4000-8000-000000000001', 'PerApp chantier');
insert into public.reserves_intervenants (id, entreprise_id, chantier_id, nom, corps_etat)
values ('f8200000-0000-4000-8000-000000000001', 'f0100000-0000-4000-8000-000000000001', 'f8000000-0000-4000-8000-000000000001', 'Invité B', 'Peinture');
select public.reserves_designer_entreprise_intervenante('f8200000-0000-4000-8000-000000000001', 'b0000000-0000-0000-0000-000000000001');
select pg_temp.en_tant_que('20000000-0000-0000-0000-000000000001');
select lives_ok($$select public.reserves_rejoindre_intervention('f8200000-0000-4000-8000-000000000001')$$, 'D0 B rejoint le chantier de H');
select pg_temp.en_tant_que('f1100000-0000-4000-8000-000000000001');
select set_config('q.rd', public.reserves_creer('f8000000-0000-4000-8000-000000000001', 'Reprise', null, 'normale', 'f8200000-0000-4000-8000-000000000001')::text, true);
create function pg_temp.b_peut_ecrire() returns text language plpgsql as $$
begin
  perform pg_temp.en_tant_que('20000000-0000-0000-0000-000000000001');
  begin
    perform public.reserves_commenter(current_setting('q.rd')::uuid, 'test ' || clock_timestamp());
    perform pg_temp.en_service();
    return 'ecriture';
  exception when others then
    perform pg_temp.en_service();
    return case when sqlerrm like '%lecture seule%' then 'lecture_seule' else 'refus:' || sqlerrm end;
  end;
end;
$$;
create function pg_temp.b_lit() returns int language plpgsql as $$
declare v int;
begin
  perform pg_temp.en_tant_que('20000000-0000-0000-0000-000000000001');
  select count(*) into v from public.reserves where id = current_setting('q.rd')::uuid;
  perform pg_temp.en_service();
  return v;
end;
$$;
select pg_temp.en_service();
select is(pg_temp.b_peut_ecrire(), 'ecriture', 'D1 hôte Réserves actif : l''invité écrit');
update public.entreprises set abonnement_statut = 'suspendu' where id = 'f0100000-0000-4000-8000-000000000001';
select is(pg_temp.b_peut_ecrire(), 'ecriture', 'D2 hôte : impayé GP SEUL (Réserves payé) → invité écrit toujours');
update public.entreprises set abonnement_statut = 'actif' where id = 'f0100000-0000-4000-8000-000000000001';
select pg_temp.w('reserves', 'past_due', 'sub_R1', 'evt_R_3', 30);
select is(pg_temp.b_lit() || ':' || pg_temp.b_peut_ecrire(), '1:lecture_seule', 'D3 hôte perd Réserves (past_due) : invité en LECTURE SEULE');
select pg_temp.w('reserves', 'active', 'sub_R1', 'evt_R_4', 40);
select is(pg_temp.b_peut_ecrire(), 'ecriture', 'D4 hôte Réserves réactivé : écriture rétablie, sans nouvelle invitation');
update public.entreprises set suspension_globale_at = now() - interval '1 second', suspension_globale_motif = 'D-01' where id = 'f0100000-0000-4000-8000-000000000001';
select is(pg_temp.b_lit() || ':' || pg_temp.b_peut_ecrire(), '1:lecture_seule', 'D5 hôte suspendu globalement : invité en lecture seule');
update public.entreprises set suspension_globale_at = null, suspension_globale_motif = null where id = 'f0100000-0000-4000-8000-000000000001';
update public.entreprises set abonnement_statut = 'annule' where id = 'b0000000-0000-0000-0000-000000000001';
select is(pg_temp.b_lit() || ':' || pg_temp.b_peut_ecrire(), '1:ecriture', 'D6 invité dont le GP est annulé : son droit Réserves (gratuit) reste');
update public.entreprises set abonnement_statut = 'actif' where id = 'b0000000-0000-0000-0000-000000000001';
update public.entreprises set suspension_globale_at = now() - interval '1 second', suspension_globale_motif = 'D-01' where id = 'b0000000-0000-0000-0000-000000000001';
select is(pg_temp.b_lit(), 0, 'D7 invité suspendu globalement : plus aucun accès');
update public.entreprises set suspension_globale_at = null, suspension_globale_motif = null where id = 'b0000000-0000-0000-0000-000000000001';
select is(pg_temp.b_lit() || ':' || pg_temp.b_peut_ecrire(), '1:ecriture', 'D8 invité rétabli');

-- ═══════════════════════════════════════════════════════════════════════════
-- §R. Tools / Relevé Pro : personnel inchangé, projet organisation séparé
-- ═══════════════════════════════════════════════════════════════════════════
-- Admin de la matrice k=… : GP annulé, Tools actif, global actif.
select set_config('q.kr', (select k::text from attendu where not global_suspendu and gp = 'annule' and tools_etat = 'active'), true);
select pg_temp.en_service();
insert into public.entitlements_utilisateurs_elsatia (utilisateur_id, application_code, niveau, capabilities, source)
values (pg_temp.adm(current_setting('q.kr')::int), 'tools', 'pro', array['releve-metre'], 'internal');
select pg_temp.en_tant_que(pg_temp.adm(current_setting('q.kr')::int));
select ok(public.tools_releve_action_autorisee(pg_temp.ent(current_setting('q.kr')::int), 'create'), 'R1 GP annulé, Tools actif : Relevé organisation utilisable');
select ok(not public.tools_releve_action_autorisee(pg_temp.ent(current_setting('q.kr')::int), 'sync-gp'), 'R2 synchronisation vers GP refusée : GP est fermé (droit GP, pas Tools)');
select ok((public.tools_releve_contexte(pg_temp.ent(current_setting('q.kr')::int))->>'tenant_has_tools')::boolean, 'R3 contexte Relevé : Tools présent malgré GP annulé');
select ok((public.tools_resoudre_entitlements()->'capabilities') ? 'releve-metre' and (public.tools_resoudre_entitlements()->'capabilities') ? 'saved-projects',
  'R4 Relevé Pro inclut Tools Pro (personnel)');
select pg_temp.en_service();

-- ═══════════════════════════════════════════════════════════════════════════
-- §S. Studio (B + I1) : identité utilisateur, hors état d'entreprise
-- ═══════════════════════════════════════════════════════════════════════════
select is((select account from public.elsatia_identity_prepare_handoff(pg_temp.adm(k), 'studio', rpad('perapp' || k, 43, 'x')) ), 'active',
  pg_temp.lib(k) || ' Studio : compte ELSATIA actif pour le passage (aucun état GP / global d''entreprise)')
from attendu where gp in ('annule', 'past_due_unpaid') and tools_etat = 'active' order by k;
update auth.users set banned_until = now() + interval '1 day' where id = pg_temp.adm(1);
select is((select account from public.elsatia_identity_prepare_handoff(pg_temp.adm(1), 'studio', rpad('perappban', 43, 'x'))), 'disabled',
  'S2 suspension plateforme d''une IDENTITÉ (bannissement) : Studio coupé');
update auth.users set banned_until = null where id = pg_temp.adm(1);

-- ═══════════════════════════════════════════════════════════════════════════
-- §B. Chemin facturation admin sans accès métier
-- ═══════════════════════════════════════════════════════════════════════════
select set_config('q.kb', (select k::text from attendu where not global_suspendu and gp = 'past_due_unpaid' and colors_etat = 'past_due'), true);
select pg_temp.en_tant_que(pg_temp.adm(current_setting('q.kb')::int));
select ok((select peut_gerer from public.etat_commercial_applications(pg_temp.ent(current_setting('q.kb')::int)) where application_code = 'colors'),
  'B1 Colors past_due + GP impayé : l''admin gère la facturation Colors');
select ok((select peut_gerer from public.etat_reabonnement_entreprise(pg_temp.ent(current_setting('q.kb')::int))), 'B2 et la facturation GP (chemin existant)');
select is((select count(*)::int from public.chantiers where entreprise_id = pg_temp.ent(current_setting('q.kb')::int)), 0, 'B3 aucun accès métier GP');
select is((select count(*)::int from public.colors_seaux where entreprise_id = pg_temp.ent(current_setting('q.kb')::int)), 0, 'B4 aucun accès métier Colors');
select is((select count(*)::int from public.etat_commercial_applications(pg_temp.ent(1))), 0, 'B5 aucun état d''une autre entreprise');
select ok((select count(*) from public.acces_applications_entreprises where entreprise_id = pg_temp.ent(current_setting('q.kb')::int)) > 0,
  'B6 la ligne de droit reste lisible pour expliquer le refus (abonnement requis)');
select pg_temp.en_service();
select ok(pg_get_function_result('public.etat_commercial_applications'::regproc) not like '%stripe%'
  and pg_get_function_result('public.etat_commercial_applications'::regproc) not like '%subscription%', 'B7 aucun identifiant Stripe exposé');

-- ═══════════════════════════════════════════════════════════════════════════
-- §A. Exposition, ACL, rapport de migration
-- ═══════════════════════════════════════════════════════════════════════════
select ok(not has_function_privilege('authenticated', 'public.compte_suspendu_globalement(uuid)', 'execute'), 'A1 prédicat global non exposé (pas d''oracle)');
select ok(not has_function_privilege('authenticated', 'public.statut_commercial_application(uuid,text)', 'execute'), 'A2 état commercial brut non exposé');
select ok(not has_function_privilege('authenticated', 'public.application_commercialement_ouverte(uuid,text)', 'execute'), 'A3 ouverture commerciale non exposée');
select ok(not has_function_privilege('authenticated', 'public.etat_commercial_gestion_pro(uuid)', 'execute'), 'A4 état GP brut non exposé');
select ok(not has_function_privilege('anon', 'public.est_membre_plateforme_actif(uuid)', 'execute'), 'A5 anon exclu');
select ok(not has_table_privilege('authenticated', 'public.acces_applications_entreprises', 'update'), 'A6 aucune écriture directe des droits');
select ok(not has_column_privilege('authenticated', 'public.entreprises', 'suspension_globale_at', 'update'), 'A7 colonne de suspension globale non modifiable');
select has_table('public', 'rapport_migration_suspension_par_app_v1', 'A8 rapport de migration présent');
select is((select count(*)::int from public.rapport_migration_suspension_par_app_v1 where changement = 'perte_acces'), 0, 'A9 aucune perte de droit');
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.rapport_migration_suspension_par_app_v1), 0, 'A10 rapport illisible hors plateforme');
select is((select count(*)::int from public.evenements_commerciaux_applications), 0, 'A11 journal webhook illisible hors plateforme');
select pg_temp.en_service();
-- Aucune fonction d'application non GP ne dépend encore de l'état commercial GP.
select is((select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname ~ '^(colors|reserves|tools)_'
    and (p.prosrc like '%est_membre_actif(%' or p.prosrc like '%abonnement_statut%' or p.prosrc like '%suspension_prevue_at%')), null,
  'A12 aucune fonction Colors / Réserves / Tools ne lit l''état commercial GP');
select is((select string_agg(tablename || '.' || policyname, ',') from pg_policies
  where tablename ~ '^(colors|reserves|tools)_' and coalesce(qual, '') || coalesce(with_check, '') like '%est_membre_actif(%'), null,
  'A13 aucune policy Colors / Réserves / Tools ne lit l''état commercial GP');

select * from finish();
rollback;
