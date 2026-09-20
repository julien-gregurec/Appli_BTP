\set ON_ERROR_STOP on
-- PROPOSITION — NON NUMÉROTÉE, NON RÉSERVÉE. Ne pas placer dans supabase/migrations avant le train
-- de convergence (numéro : NEXT_MIGRATION_AFTER_CONVERGED_TRAIN).
--
-- decision_acces_application : décision d'accès AVEC MOTIF. Additive : `a_acces_application` reste
-- inchangée (compatibilité). Invariant vérifié par le jeu d'essai
-- (docs/qualification/access-convergence-v1/decision-cases.sql) :
--     decision = 'autorise'  ⇔  a_acces_application(entreprise, app) = true
--
-- Contrat v1 : packages/application-access/src/decision-acces.ts.
-- Aucun prix, aucun plan, aucune donnée modifiée : lecture seule.

-- ── Noyau : évalue pour un utilisateur donné et rend décision + diagnostic complet ────────────
create or replace function public._decision_acces_noyau(
  p_uid uuid, p_entreprise_id uuid, p_application_code text
) returns jsonb
language plpgsql security definer stable set search_path = public
as $$
declare
  v_app public.applications_elsatia%rowtype;
  v_statut_membre text;
  v_ent public.entreprises%rowtype;
  v_ae public.acces_applications_entreprises%rowtype;
  v_hu public.habilitations_applications_utilisateurs%rowtype;
  v_role_actif boolean;
  v_admin boolean;
  v_support boolean := false;
  v_decision text;
  v_role text;
  v_membre boolean := false;
  v_diag jsonb := '{}'::jsonb;
begin
  if p_uid is null then
    return jsonb_build_object('decision','non_authentifie','membre',false,'diagnostic','{}'::jsonb);
  end if;

  select * into v_app from public.applications_elsatia where code = p_application_code;
  if not found or not v_app.actif then
    return jsonb_build_object('decision','erreur_configuration','membre',false,
      'diagnostic', jsonb_build_object('cause','application_inconnue_ou_inactive'));
  end if;

  -- Même condition que a_acces_application : administrateur plateforme actif, identité active.
  select exists(select 1 from public.plateforme_admins
                where utilisateur_id = p_uid and actif and statut_identite = 'active') into v_admin;
  if v_admin then
    return jsonb_build_object('decision','autorise','role_code','administrateur_plateforme_global','membre',false,
      'diagnostic', jsonb_build_object('bypass','administrateur_plateforme'));
  end if;

  if p_entreprise_id is null then
    return jsonb_build_object('decision','sans_organisation','membre',false,
      'diagnostic', jsonb_build_object('cause','entreprise_active_nulle'));
  end if;

  select ue.statut into v_statut_membre from public.utilisateurs_entreprises ue
   where ue.utilisateur_id = p_uid and ue.entreprise_id = p_entreprise_id;
  if not found then
    return jsonb_build_object('decision','sans_organisation','membre',false,
      'diagnostic', jsonb_build_object('cause','aucune_appartenance'));
  end if;
  v_membre := true;
  v_diag := jsonb_build_object('membre_statut', v_statut_membre);

  if v_statut_membre = 'invite' then
    return jsonb_build_object('decision','invitation_en_attente','membre',true,'diagnostic',v_diag);
  elsif v_statut_membre = 'en_attente_validation' then
    return jsonb_build_object('decision','validation_en_attente','membre',true,'diagnostic',v_diag);
  elsif v_statut_membre = 'desactive' then
    return jsonb_build_object('decision','utilisateur_desactive','membre',true,'diagnostic',v_diag);
  elsif v_statut_membre <> 'actif' then
    return jsonb_build_object('decision','erreur_configuration','membre',true,
      'diagnostic', v_diag || jsonb_build_object('cause','statut_membre_inconnu'));
  end if;

  select * into v_ent from public.entreprises where id = p_entreprise_id;
  if not found then
    return jsonb_build_object('decision','erreur_configuration','membre',true,
      'diagnostic', v_diag || jsonb_build_object('cause','entreprise_introuvable'));
  end if;
  -- Une session d'assistance ouverte sur cette entreprise passe l'état d'abonnement (comme est_membre_actif).
  if p_uid = auth.uid() then v_support := coalesce(public.est_acces_support_actif(p_entreprise_id), false); end if;
  v_diag := v_diag || jsonb_build_object('abonnement_statut', v_ent.abonnement_statut,
                                         'suspension_prevue_at', v_ent.suspension_prevue_at,
                                         'support', v_support);
  if not v_support then
    if v_ent.abonnement_statut = 'annule' then
      return jsonb_build_object('decision','entreprise_inactive','membre',true,'diagnostic',v_diag);
    elsif v_ent.abonnement_statut = 'suspendu'
       or (v_ent.suspension_prevue_at is not null and v_ent.suspension_prevue_at <= now()) then
      return jsonb_build_object('decision','abonnement_suspendu','membre',true,'diagnostic',v_diag);
    end if;
  end if;

  -- Droit d'usage de l'organisation.
  select * into v_ae from public.acces_applications_entreprises
   where entreprise_id = p_entreprise_id and application_code = p_application_code;
  if not found or not v_ae.autorise then
    return jsonb_build_object('decision','application_non_incluse','membre',true,
      'diagnostic', v_diag || jsonb_build_object('droit_org', case when found then 'desactive' else 'absent' end));
  end if;
  if (v_ae.valide_du is not null and v_ae.valide_du > now())
     or (v_ae.valide_jusqu_au is not null and v_ae.valide_jusqu_au <= now()) then
    return jsonb_build_object(
      'decision', case when v_ae.source = 'essai' then 'essai_expire' else 'application_non_incluse' end,
      'membre',true,
      'diagnostic', v_diag || jsonb_build_object('droit_org','hors_fenetre','source',v_ae.source,
                                                 'valide_du',v_ae.valide_du,'valide_jusqu_au',v_ae.valide_jusqu_au));
  end if;

  -- Habilitation de l'utilisateur.
  select * into v_hu from public.habilitations_applications_utilisateurs
   where entreprise_id = p_entreprise_id and utilisateur_id = p_uid and application_code = p_application_code;
  if not found then
    return jsonb_build_object('decision','sans_habilitation','membre',true,'diagnostic',v_diag);
  end if;
  select r.actif into v_role_actif from public.roles_applications_elsatia r
   where r.application_code = v_hu.application_code and r.code = v_hu.role_code;
  if not v_hu.autorise or coalesce(v_role_actif, false) = false
     or (v_hu.valide_du is not null and v_hu.valide_du > now())
     or (v_hu.valide_jusqu_au is not null and v_hu.valide_jusqu_au <= now()) then
    return jsonb_build_object('decision','sans_role','membre',true,
      'diagnostic', v_diag || jsonb_build_object('role_code',v_hu.role_code,'role_actif',v_role_actif,
                                                 'habilitation_autorise',v_hu.autorise,
                                                 'valide_du',v_hu.valide_du,'valide_jusqu_au',v_hu.valide_jusqu_au));
  end if;

  return jsonb_build_object('decision','autorise','role_code',v_hu.role_code,'membre',true,'diagnostic',v_diag);
end;
$$;
revoke all on function public._decision_acces_noyau(uuid,uuid,text) from public, anon, authenticated, service_role;

-- ── Vue CLIENT : décision + rôle propre + nom d'entreprise SI l'appelant en est membre ───────
create or replace function public.decision_acces_application(
  p_application_code text, p_entreprise_id uuid default null
) returns jsonb
language plpgsql security definer stable set search_path = public
as $$
declare
  v jsonb := public._decision_acces_noyau(auth.uid(), p_entreprise_id, p_application_code);
  v_nom text;
begin
  if (v->>'membre')::boolean then
    select nom into v_nom from public.entreprises where id = p_entreprise_id;
  end if;
  return jsonb_build_object(
    'version', 1,
    'decision', v->>'decision',
    'application_code', p_application_code,
    'role_code', case when v->>'decision' = 'autorise' then v->>'role_code' end,
    'entreprise', case when v_nom is not null then jsonb_build_object('id', p_entreprise_id, 'nom', v_nom) end
  );
end;
$$;
revoke all on function public.decision_acces_application(text,uuid) from public, anon;
grant execute on function public.decision_acces_application(text,uuid) to authenticated;

-- ── Vue ADMIN/LOGS : diagnostic complet pour un tiers (administrateur plateforme uniquement) ─
create or replace function public.diagnostic_acces_application(
  p_utilisateur_id uuid, p_entreprise_id uuid, p_application_code text
) returns jsonb
language plpgsql security definer stable set search_path = public
as $$
begin
  if not public.est_plateforme_admin() then
    raise exception 'Réservé aux administrateurs de la plateforme' using errcode = '42501';
  end if;
  return public._decision_acces_noyau(p_utilisateur_id, p_entreprise_id, p_application_code);
end;
$$;
revoke all on function public.diagnostic_acces_application(uuid,uuid,text) from public, anon;
grant execute on function public.diagnostic_acces_application(uuid,uuid,text) to authenticated;
-- À DÉCIDER : exiger aussi rôle plateforme `total` + AAL2 comme les RPC d'habilitation (00239).

-- Matrice « premier accès » : exécute les RPC réelles du Train V3 (ledger 278) pour chaque état de compte.
-- Base jetable, aucune donnée réelle. Les comptes sont fictifs.
drop table if exists public._dc_expect; drop table if exists public._dc_res;
delete from public.plateforme_admins where email like '%@audit.test';
delete from public.habilitations_applications_utilisateurs where utilisateur_id::text like 'a0000000-0000-4000-8000-%';
delete from public.utilisateurs_entreprises where utilisateur_id::text like 'a0000000-0000-4000-8000-%';
delete from auth.users where email like '%@audit.test';
delete from public.acces_applications_entreprises where entreprise_id::text like 'e_000000-0000-4000-8000-%';
delete from public.entreprises where nom like 'ENTREPRISE-%';


-- ── Entreprises ────────────────────────────────────────────────────────────
insert into public.entreprises(id, nom) values
 ('e1000000-0000-4000-8000-000000000001','ENTREPRISE-A (active, droits org sur les 4 apps)'),
 ('e2000000-0000-4000-8000-000000000002','ENTREPRISE-B (active, AUCUN droit org)'),
 ('e4000000-0000-4000-8000-000000000004','ENTREPRISE-D (SUSPENDUE, droits org)');
update public.entreprises set abonnement_statut='suspendu' where id='e4000000-0000-4000-8000-000000000004';
update public.entreprises set abonnement_statut='actif' where id in ('e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000002');

-- Droits d'usage de l'organisation (acces_applications_entreprises)
insert into public.acces_applications_entreprises(entreprise_id, application_code, autorise, source)
select e, a, true, 'audit'
from (values ('e1000000-0000-4000-8000-000000000001'::uuid),('e4000000-0000-4000-8000-000000000004'::uuid)) v(e),
     (values ('gestion_pro'),('colors'),('tools'),('reserves')) x(a);

-- ── Comptes Auth (le trigger handle_new_user crée public.utilisateurs) ─────
insert into auth.users(id, email) values
 ('a0000000-0000-4000-8000-000000000001','c1-auth-seul@audit.test'),
 ('a0000000-0000-4000-8000-000000000002','c1b-sans-profil-gp@audit.test'),
 ('a0000000-0000-4000-8000-000000000003','c3-membre-sans-droit-org@audit.test'),
 ('a0000000-0000-4000-8000-000000000004','c4-droit-org-sans-role@audit.test'),
 ('a0000000-0000-4000-8000-000000000005','c5-role-sans-droit-org@audit.test'),
 ('a0000000-0000-4000-8000-000000000006','c6-acces-complet@audit.test'),
 ('a0000000-0000-4000-8000-000000000007','c7-entreprise-suspendue@audit.test'),
 ('a0000000-0000-4000-8000-000000000008','c8-desactive@audit.test'),
 ('a0000000-0000-4000-8000-000000000009','c9-invite-en-attente@audit.test'),
 ('a0000000-0000-4000-8000-00000000000a','c10-habilitation-retiree@audit.test'),
 ('a0000000-0000-4000-8000-00000000000b','c11-droit-org-expire@audit.test'),
 ('a0000000-0000-4000-8000-00000000000c','c12-admin-plateforme-actif@audit.test'),
 ('a0000000-0000-4000-8000-00000000000d','c13-admin-plateforme-en-attente(julien)@audit.test');
-- cas 1b : compte Auth SANS ligne public.utilisateurs (trigger contourné)
delete from public.utilisateurs where id='a0000000-0000-4000-8000-000000000002';

-- Appartenances
insert into public.utilisateurs_entreprises(utilisateur_id, entreprise_id, statut) values
 ('a0000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000002','actif'),
 ('a0000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000001','actif'),
 ('a0000000-0000-4000-8000-000000000005','e2000000-0000-4000-8000-000000000002','actif'),
 ('a0000000-0000-4000-8000-000000000006','e1000000-0000-4000-8000-000000000001','actif'),
 ('a0000000-0000-4000-8000-000000000007','e4000000-0000-4000-8000-000000000004','actif'),
 ('a0000000-0000-4000-8000-000000000008','e1000000-0000-4000-8000-000000000001','desactive'),
 ('a0000000-0000-4000-8000-000000000009','e1000000-0000-4000-8000-000000000001','invite'),
 ('a0000000-0000-4000-8000-00000000000a','e1000000-0000-4000-8000-000000000001','actif'),
 ('a0000000-0000-4000-8000-00000000000b','e1000000-0000-4000-8000-000000000001','actif');
update public.utilisateurs u set entreprise_active_id = ue.entreprise_id
from public.utilisateurs_entreprises ue where ue.utilisateur_id = u.id;

-- Habilitations (rôle applicatif)
insert into public.habilitations_applications_utilisateurs(entreprise_id, utilisateur_id, application_code, role_code, autorise)
select ent, usr, app, role, aut from (values
  ('e2000000-0000-4000-8000-000000000002'::uuid,'a0000000-0000-4000-8000-000000000005'::uuid),  -- c5 rôle sans droit org
  ('e1000000-0000-4000-8000-000000000001'::uuid,'a0000000-0000-4000-8000-000000000006'::uuid),  -- c6 complet
  ('e4000000-0000-4000-8000-000000000004'::uuid,'a0000000-0000-4000-8000-000000000007'::uuid),  -- c7 suspendu
  ('e1000000-0000-4000-8000-000000000001'::uuid,'a0000000-0000-4000-8000-000000000008'::uuid),  -- c8 désactivé
  ('e1000000-0000-4000-8000-000000000001'::uuid,'a0000000-0000-4000-8000-000000000009'::uuid),  -- c9 invité
  ('e1000000-0000-4000-8000-000000000001'::uuid,'a0000000-0000-4000-8000-00000000000a'::uuid),  -- c10 retirée
  ('e1000000-0000-4000-8000-000000000001'::uuid,'a0000000-0000-4000-8000-00000000000b'::uuid)   -- c11 droit org expiré
) u(ent, usr),
(values ('gestion_pro','gestion_pro_utilisateur'),('colors','colors_consultation'),('tools','tools_pro'),('reserves','reserves_consultation')) r(app, role),
lateral (select (u.usr <> 'a0000000-0000-4000-8000-00000000000a'::uuid) as aut) z;

-- c11 : droit d'usage de l'organisation expiré pour ce cas uniquement → on utilise une entreprise dédiée
insert into public.entreprises(id, nom) values ('e5000000-0000-4000-8000-000000000005','ENTREPRISE-E (droit org EXPIRÉ)');
update public.entreprises set abonnement_statut='actif' where id='e5000000-0000-4000-8000-000000000005';
insert into public.acces_applications_entreprises(entreprise_id, application_code, autorise, source, valide_du, valide_jusqu_au)
select 'e5000000-0000-4000-8000-000000000005', a, true, 'audit', now()-interval '60 days', now()-interval '1 day'
from (values ('gestion_pro'),('colors'),('tools'),('reserves')) x(a);
delete from public.habilitations_applications_utilisateurs where utilisateur_id='a0000000-0000-4000-8000-00000000000b';
delete from public.utilisateurs_entreprises where utilisateur_id='a0000000-0000-4000-8000-00000000000b';
insert into public.utilisateurs_entreprises(utilisateur_id, entreprise_id, statut) values ('a0000000-0000-4000-8000-00000000000b','e5000000-0000-4000-8000-000000000005','actif');
update public.utilisateurs set entreprise_active_id='e5000000-0000-4000-8000-000000000005' where id='a0000000-0000-4000-8000-00000000000b';
insert into public.habilitations_applications_utilisateurs(entreprise_id, utilisateur_id, application_code, role_code)
values ('e5000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-00000000000b','gestion_pro','gestion_pro_utilisateur'),
       ('e5000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-00000000000b','colors','colors_consultation'),
       ('e5000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-00000000000b','tools','tools_pro'),
       ('e5000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-00000000000b','reserves','reserves_consultation');

-- Admins plateforme : c12 actif ; c13 = Julien (en_attente / inactif)
insert into public.plateforme_admins(utilisateur_id, email, role, actif, statut_identite, activation_at)
values ('a0000000-0000-4000-8000-00000000000c','c12-admin-plateforme-actif@audit.test','total',true,'active', now());
-- Julien : ligne 'en_attente' non rattachée (utilisateur_id NULL), inactive → est_plateforme_admin() = false
insert into public.plateforme_admins(utilisateur_id, email, role, actif, statut_identite)
values (null,'c13-admin-plateforme-en-attente(julien)@audit.test','total',false,'en_attente');



-- ── Fixtures supplémentaires ───────────────────────────────────────────────
insert into public.entreprises(id, nom) values
 ('e6000000-0000-4000-8000-000000000006','ENTREPRISE-F (ANNULÉE)'),
 ('e7000000-0000-4000-8000-000000000007','ENTREPRISE-G (droit ESSAI expiré)'),
 ('e8000000-0000-4000-8000-000000000008','ENTREPRISE-H (suspension prévue échue)'),
 ('e9000000-0000-4000-8000-000000000009','ENTREPRISE-I (habilitation hors fenêtre)');
update public.entreprises set abonnement_statut='annule' where id='e6000000-0000-4000-8000-000000000006';
update public.entreprises set abonnement_statut='actif' where id in ('e7000000-0000-4000-8000-000000000007','e9000000-0000-4000-8000-000000000009');
update public.entreprises set abonnement_statut='actif', suspension_prevue_at=now()-interval '1 day' where id='e8000000-0000-4000-8000-000000000008';
insert into public.acces_applications_entreprises(entreprise_id, application_code, autorise, source, valide_du, valide_jusqu_au)
select e, 'colors', true, s, v1, v2 from (values
 ('e6000000-0000-4000-8000-000000000006'::uuid,'audit',null::timestamptz,null::timestamptz),
 ('e7000000-0000-4000-8000-000000000007','essai',now()-interval '60 days',now()-interval '1 day'),
 ('e8000000-0000-4000-8000-000000000008','audit',null,null),
 ('e9000000-0000-4000-8000-000000000009','audit',null,null)) t(e,s,v1,v2);
insert into auth.users(id,email) values
 ('a1000000-0000-4000-8000-000000000001','x1-entreprise-annulee@audit.test'),
 ('a1000000-0000-4000-8000-000000000002','x2-droit-essai-expire@audit.test'),
 ('a1000000-0000-4000-8000-000000000003','x3-validation-en-attente@audit.test'),
 ('a1000000-0000-4000-8000-000000000004','x4-suspension-prevue-echue@audit.test'),
 ('a1000000-0000-4000-8000-000000000005','x5-habilitation-hors-fenetre@audit.test');
insert into public.utilisateurs_entreprises(utilisateur_id, entreprise_id, statut) values
 ('a1000000-0000-4000-8000-000000000001','e6000000-0000-4000-8000-000000000006','actif'),
 ('a1000000-0000-4000-8000-000000000002','e7000000-0000-4000-8000-000000000007','actif'),
 ('a1000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000001','en_attente_validation'),
 ('a1000000-0000-4000-8000-000000000004','e8000000-0000-4000-8000-000000000008','actif'),
 ('a1000000-0000-4000-8000-000000000005','e9000000-0000-4000-8000-000000000009','actif');
update public.utilisateurs u set entreprise_active_id = ue.entreprise_id
 from public.utilisateurs_entreprises ue where ue.utilisateur_id=u.id and u.id::text like 'a1000000-%';
insert into public.habilitations_applications_utilisateurs(entreprise_id, utilisateur_id, application_code, role_code, valide_du, valide_jusqu_au) values
 ('e6000000-0000-4000-8000-000000000006','a1000000-0000-4000-8000-000000000001','colors','colors_consultation',null,null),
 ('e7000000-0000-4000-8000-000000000007','a1000000-0000-4000-8000-000000000002','colors','colors_consultation',null,null),
 ('e8000000-0000-4000-8000-000000000008','a1000000-0000-4000-8000-000000000004','colors','colors_consultation',null,null),
 ('e9000000-0000-4000-8000-000000000009','a1000000-0000-4000-8000-000000000005','colors','colors_consultation',now()-interval '30 days',now()-interval '1 day');

-- ── Attendus ────────────────────────────────────────────────────────────────
create table public._dc_expect(label text, app text, expected text, note text);
insert into public._dc_expect(label, app, expected, note)
select l, a, e, n from (values
 ('c1-auth-seul','sans_organisation','pas d''organisation'),
 ('c1b-sans-profil-gp','sans_organisation','compte Auth sans ligne utilisateurs'),
 ('c13-admin-plateforme-en-attente(julien)','sans_organisation','Julien tel que documenté : en_attente, non actif'),
 ('c3-membre-sans-droit-org','application_non_incluse','pas d''entitlement (aucun droit d''usage)'),
 ('c5-role-sans-droit-org','application_non_incluse','rôle sans entitlement'),
 ('c11-droit-org-expire','application_non_incluse','droit d''usage expiré (hors essai)'),
 ('c4-droit-org-sans-role','sans_habilitation','pas de rôle : aucune habilitation'),
 ('c10-habilitation-retiree','sans_role','habilitation retirée (autorise=false)'),
 ('c6-acces-complet','autorise','accès complet'),
 ('c12-admin-plateforme-actif','autorise','administrateur plateforme actif'),
 ('c7-entreprise-suspendue','abonnement_suspendu','suspendu'),
 ('c8-desactive','utilisateur_desactive','désactivé'),
 ('c9-invite-en-attente','invitation_en_attente','invitation en attente')
) v(l,e,n), (values ('gestion_pro'),('colors'),('tools'),('reserves')) x(a);
insert into public._dc_expect(label, app, expected, note) values
 ('x1-entreprise-annulee','colors','entreprise_inactive','entreprise annulée'),
 ('x2-droit-essai-expire','colors','essai_expire','droit d''usage issu d''un essai, expiré'),
 ('x3-validation-en-attente','colors','validation_en_attente','rejoint par code, validation admin en attente'),
 ('x4-suspension-prevue-echue','colors','abonnement_suspendu','suspension prévue échue'),
 ('x5-habilitation-hors-fenetre','colors','sans_role','habilitation hors fenêtre de validité');

create table public._dc_res(label text, app text, expected text, obtenu text, a_acces boolean, ok boolean, note text, exposition text);

do $$
declare c record; u uuid; ent uuid; d jsonb; b boolean; membre boolean; nom_expose boolean;
begin
  for c in select e.*, (select id from auth.users where email like e.label||'@%') as uid from public._dc_expect e order by label, app loop
    select entreprise_active_id into ent from public.utilisateurs where id = c.uid;
    perform set_config('request.jwt.claims', json_build_object('sub', c.uid, 'role','authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', c.uid::text, true);
    set local role authenticated;
    d := public.decision_acces_application(c.app, ent);
    b := public.a_acces_application(ent, c.app);
    reset role;
    select exists(select 1 from public.utilisateurs_entreprises where utilisateur_id = c.uid and entreprise_id = ent) into membre;
    nom_expose := jsonb_typeof(d->'entreprise') = 'object';
    insert into public._dc_res values (c.label, c.app, c.expected, d->>'decision', b,
      (d->>'decision') = c.expected and ((d->>'decision')='autorise') = b and nom_expose = membre, c.note,
      case when nom_expose then 'nom exposé' else 'aucun nom' end || case when membre then ' (membre)' else ' (non-membre)' end);
  end loop;
  -- Non authentifié (aucun JWT) et application inconnue
  perform set_config('request.jwt.claims', '', true); perform set_config('request.jwt.claim.sub', '', true);
  set local role authenticated;
  d := public.decision_acces_application('colors', null);
  reset role;
  insert into public._dc_res values ('(aucun jeton)','colors','non_authentifie', d->>'decision', false, (d->>'decision')='non_authentifie' and jsonb_typeof(d->'entreprise')<>'object', 'non connecté','aucun nom (non-membre)');
  select id into u from auth.users where email like 'c6-acces-complet@%';
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role','authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u::text, true);
  set local role authenticated;
  d := public.decision_acces_application('application_qui_nexiste_pas', 'e1000000-0000-4000-8000-000000000001');
  reset role;
  insert into public._dc_res values ('c6-acces-complet','application_qui_nexiste_pas','erreur_configuration', d->>'decision', false, (d->>'decision')='erreur_configuration' and jsonb_typeof(d->'entreprise')<>'object', 'application inconnue (échec fermé, aucun nom)','aucun nom (membre)');
end $$;

\echo == Cas ==
select label, app, expected as attendu, obtenu, a_acces as "a_acces_application", case when ok then 'PASS' else 'FAIL' end as verdict, exposition, note
from public._dc_res order by label, app;
\echo == Synthèse ==
select count(*) filter (where ok) as pass, count(*) filter (where not ok) as fail, count(*) as total from public._dc_res;
\echo == Invariant : decision = autorise <=> a_acces_application ==
select count(*) as violations from public._dc_res where (obtenu='autorise') is distinct from a_acces and label <> '(aucun jeton)' and app <> 'application_qui_nexiste_pas';

-- Contrôles de confidentialité de la vue CLIENT et du diagnostic ADMIN
\echo == Confidentialité ==
begin;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select 'auth seul, entreprise D suspendue tierce -> vue client' as sonde, public.decision_acces_application('colors','e4000000-0000-4000-8000-000000000004')::text as resultat;
do $$ begin
  begin perform public.diagnostic_acces_application('a0000000-0000-4000-8000-000000000007','e4000000-0000-4000-8000-000000000004','colors'); raise notice 'diagnostic par un non-admin : AUTORISE (BUG)';
  exception when others then raise notice 'diagnostic par un non-admin : REFUSE (%)', sqlstate; end;
  begin perform public._decision_acces_noyau(null,null,'colors'); raise notice 'noyau appelable par authenticated : OUI (BUG)';
  exception when others then raise notice 'noyau appelable par authenticated : NON (%)', sqlstate; end;
end $$;
rollback;
begin;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-00000000000c","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-00000000000c',true);
set local role authenticated;
select 'diagnostic admin sur le compte suspendu (c7)' as sonde, public.diagnostic_acces_application('a0000000-0000-4000-8000-000000000007','e4000000-0000-4000-8000-000000000004','colors')::text as resultat;
rollback;
