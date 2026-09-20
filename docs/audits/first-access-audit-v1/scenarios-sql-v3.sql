-- Matrice « premier accès » : exécute les RPC réelles du Train V3 (ledger 278) pour chaque état de compte.
-- Base jetable, aucune donnée réelle. Les comptes sont fictifs.
\set ON_ERROR_STOP on
drop table if exists public._fa_cases; drop table if exists public._fa_res;
delete from public.plateforme_admins where email like '%@audit.test';
delete from public.habilitations_applications_utilisateurs where utilisateur_id::text like 'a0000000-0000-4000-8000-%';
delete from public.utilisateurs_entreprises where utilisateur_id::text like 'a0000000-0000-4000-8000-%';
delete from auth.users where email like '%@audit.test';
delete from public.acces_applications_entreprises where entreprise_id::text like 'e_000000-0000-4000-8000-%';
delete from public.entreprises where nom like 'ENTREPRISE-%';

create table public._fa_cases(label text primary key, uid uuid, ord int);
create table public._fa_res(label text, ord int, probe text, result text);

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

insert into public._fa_cases(label, uid, ord)
select split_part(email,'@',1), id, row_number() over (order by email)
from auth.users where email like '%@audit.test';

-- ── Évaluation en tant que chaque utilisateur (rôle authenticated + JWT) ───
do $$
declare
  c record; r text; app text; eid uuid; rows_ text;
begin
  for c in select * from public._fa_cases order by label loop
    -- entreprise active telle que la voient les apps
    select entreprise_active_id into eid from public.utilisateurs where id = c.uid;
    perform set_config('request.jwt.claims', json_build_object('sub', c.uid, 'role','authenticated','aal','aal1')::text, true);
    perform set_config('request.jwt.claim.sub', c.uid::text, true);
    set local role authenticated;

    foreach app in array array['gestion_pro','colors','tools','reserves'] loop
      begin
        r := public.a_acces_application(eid, app)::text;
      exception when others then r := 'ERREUR: '||sqlerrm; end;
      reset role; insert into public._fa_res values (c.label, c.ord::int, 'a_acces_application('||app||')', r); set local role authenticated;
    end loop;

    begin
      select coalesce(string_agg(application_code||':'||role_code, ', ' order by application_code),'(vide)') into rows_
      from public.applications_autorisees(eid);
    exception when others then rows_ := 'ERREUR: '||sqlerrm; end;
    reset role; insert into public._fa_res values (c.label, 0, 'applications_autorisees', rows_); set local role authenticated;

    begin
      select coalesce(string_agg(entreprise_id::text||'/'||coalesce(entreprise_nom,'?'), ', '),'(aucune ligne)') into rows_
      from public.contexte_application_courant();
    exception when others then rows_ := 'ERREUR: '||sqlerrm; end;
    reset role; insert into public._fa_res values (c.label, 0, 'contexte_application_courant', rows_); set local role authenticated;

    begin
      select coalesce(string_agg(x::text, ' | '),'(aucune ligne)') into rows_
      from public.contexte_abonnement_courant() x;
    exception when others then rows_ := 'ERREUR: '||sqlerrm; end;
    reset role; insert into public._fa_res values (c.label, 0, 'contexte_abonnement_courant (GP)', rows_); set local role authenticated;

    begin
      select coalesce(string_agg(x::text, ' | '),'(aucune)') into rows_ from public.tools_lister_entreprises_autorisees() x;
    exception when others then rows_ := 'ERREUR: '||sqlerrm; end;
    reset role; insert into public._fa_res values (c.label, 0, 'tools_lister_entreprises_autorisees', rows_); set local role authenticated;

    begin
      rows_ := (public.tools_resoudre_entitlements()->>'tier')||' / source='||(public.tools_resoudre_entitlements()->>'source');
    exception when others then rows_ := 'ERREUR: '||sqlerrm; end;
    reset role; insert into public._fa_res values (c.label, 0, 'tools_resoudre_entitlements (niveau perso)', rows_); set local role authenticated;

    begin
      rows_ := public.contexte_acces_proxy(array['acces_devis'], array[]::text[])::text;
    exception when others then rows_ := 'ERREUR: '||sqlerrm; end;
    reset role; insert into public._fa_res values (c.label, 0, 'contexte_acces_proxy(acces_devis) (GP)', rows_); set local role authenticated;

    reset role;
  end loop;
end $$;

select label, probe, result from public._fa_res order by label, ord, probe;
