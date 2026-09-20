-- pgTAP — ELSATIA Tools : accès serveur aux projets d'organisation (décision D2).
-- Teste supabase/proposed/tools_projects_server_side_access_v1.sql.proposed, appliquée en tête de
-- transaction (aucune migration numérotée n'existe pour elle). Tout est annulé en fin de test.
-- Lancer depuis supabase/proposed/tests/ (chemin relatif du \ir) ou copier les deux fichiers côte à côte.
-- Acteurs : pro-A (Pro, membre actif A), pro2-A (Pro, autre membre A), free-A (membre A sans Pro),
-- membre-B (Pro, B seulement), sans-org (Pro personnel), ex-abonné-A (Pro expiré/révoqué, membre A),
-- pro-sans-habilitation-A, membre-désactivé-A.
begin;
create extension if not exists pgtap with schema extensions;
select plan(70);

set local elsatia.capacite_personnes_bypass = 'on';
\ir ../tools_projects_server_side_access_v1.sql.proposed

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','11111111-0000-0000-0000-000000000001','authenticated','authenticated','pro-a@invalid.local','x',now(),now(),now()),
 ('00000000-0000-0000-0000-000000000000','11111111-0000-0000-0000-000000000002','authenticated','authenticated','pro2-a@invalid.local','x',now(),now(),now()),
 ('00000000-0000-0000-0000-000000000000','22222222-0000-0000-0000-000000000001','authenticated','authenticated','free-a@invalid.local','x',now(),now(),now()),
 ('00000000-0000-0000-0000-000000000000','33333333-0000-0000-0000-000000000001','authenticated','authenticated','pro-b@invalid.local','x',now(),now(),now()),
 ('00000000-0000-0000-0000-000000000000','44444444-0000-0000-0000-000000000001','authenticated','authenticated','pro-solo@invalid.local','x',now(),now(),now()),
 ('00000000-0000-0000-0000-000000000000','55555555-0000-0000-0000-000000000001','authenticated','authenticated','ex-a@invalid.local','x',now(),now(),now()),
 ('00000000-0000-0000-0000-000000000000','66666666-0000-0000-0000-000000000001','authenticated','authenticated','nohab-a@invalid.local','x',now(),now(),now()),
 ('00000000-0000-0000-0000-000000000000','77777777-0000-0000-0000-000000000001','authenticated','authenticated','off-a@invalid.local','x',now(),now(),now()),
 ('00000000-0000-0000-0000-000000000000','88888888-0000-0000-0000-000000000001','authenticated','authenticated','admin-a@invalid.local','x',now(),now(),now())
on conflict (id) do nothing;
insert into public.utilisateurs (id,prenom,nom) values
 ('11111111-0000-0000-0000-000000000001','ProA','T'),('11111111-0000-0000-0000-000000000002','Pro2A','T'),
 ('22222222-0000-0000-0000-000000000001','FreeA','T'),('33333333-0000-0000-0000-000000000001','ProB','T'),
 ('44444444-0000-0000-0000-000000000001','Solo','T'),('55555555-0000-0000-0000-000000000001','ExA','T'),
 ('66666666-0000-0000-0000-000000000001','NoHabA','T'),('77777777-0000-0000-0000-000000000001','OffA','T'),
 ('88888888-0000-0000-0000-000000000001','AdminA','T')
on conflict (id) do nothing;
insert into public.entreprises (id,nom,code_adhesion) values
 ('aaaaaaaa-0000-0000-0000-00000000000a','Org A','D2ORGA01'),('bbbbbbbb-0000-0000-0000-00000000000b','Org B','D2ORGB01')
on conflict (id) do nothing;
insert into public.postes (id,entreprise_id,nom) values
 ('aaaaaaa1-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-00000000000a','Ouvrier A'),
 ('aaaaaaa2-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-00000000000a','Administrateur A'),
 ('bbbbbbb1-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-00000000000b','Ouvrier B')
on conflict (id) do nothing;
insert into public.utilisateurs_entreprises (utilisateur_id,entreprise_id,poste_id,statut) values
 ('11111111-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000000a','aaaaaaa1-0000-0000-0000-00000000000a','actif'),
 ('11111111-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-00000000000a','aaaaaaa1-0000-0000-0000-00000000000a','actif'),
 ('22222222-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000000a','aaaaaaa1-0000-0000-0000-00000000000a','actif'),
 ('33333333-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-00000000000b','bbbbbbb1-0000-0000-0000-00000000000b','actif'),
 ('55555555-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000000a','aaaaaaa1-0000-0000-0000-00000000000a','actif'),
 ('66666666-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000000a','aaaaaaa1-0000-0000-0000-00000000000a','actif'),
 ('77777777-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000000a','aaaaaaa1-0000-0000-0000-00000000000a','desactive'),
 ('88888888-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000000a','aaaaaaa2-0000-0000-0000-00000000000a','actif')
on conflict do nothing;
insert into public.acces_applications_entreprises (entreprise_id,application_code,autorise,source) values
 ('aaaaaaaa-0000-0000-0000-00000000000a','tools',true,'d2-test'),('bbbbbbbb-0000-0000-0000-00000000000b','tools',true,'d2-test')
on conflict (entreprise_id,application_code) do update set autorise=true;
-- habilitation tools_pro : tout le monde sauf nohab
insert into public.habilitations_applications_utilisateurs (entreprise_id,utilisateur_id,application_code,role_code,autorise) values
 ('aaaaaaaa-0000-0000-0000-00000000000a','11111111-0000-0000-0000-000000000001','tools','tools_pro',true),
 ('aaaaaaaa-0000-0000-0000-00000000000a','11111111-0000-0000-0000-000000000002','tools','tools_pro',true),
 ('aaaaaaaa-0000-0000-0000-00000000000a','22222222-0000-0000-0000-000000000001','tools','tools_pro',true),
 ('bbbbbbbb-0000-0000-0000-00000000000b','33333333-0000-0000-0000-000000000001','tools','tools_pro',true),
 ('aaaaaaaa-0000-0000-0000-00000000000a','55555555-0000-0000-0000-000000000001','tools','tools_pro',true),
 ('aaaaaaaa-0000-0000-0000-00000000000a','77777777-0000-0000-0000-000000000001','tools','tools_pro',true),
 ('aaaaaaaa-0000-0000-0000-00000000000a','88888888-0000-0000-0000-000000000001','tools','tools_pro',true)
on conflict (entreprise_id,utilisateur_id,application_code) do update set autorise=true;
-- entitlements Pro (saved-projects) : pro, pro2, b, solo, nohab, off, admin ; ex-abonné = expiré + revoqué
insert into public.entitlements_utilisateurs_elsatia (utilisateur_id,application_code,niveau,capabilities,source) values
 ('11111111-0000-0000-0000-000000000001','tools','pro',array['saved-projects','export-pdf'],'internal'),
 ('11111111-0000-0000-0000-000000000002','tools','pro',array['saved-projects'],'internal'),
 ('33333333-0000-0000-0000-000000000001','tools','pro',array['saved-projects'],'internal'),
 ('44444444-0000-0000-0000-000000000001','tools','pro',array['saved-projects'],'internal'),
 ('66666666-0000-0000-0000-000000000001','tools','pro',array['saved-projects'],'internal'),
 ('77777777-0000-0000-0000-000000000001','tools','pro',array['saved-projects'],'internal'),
 ('88888888-0000-0000-0000-000000000001','tools','pro',array['saved-projects'],'internal');
insert into public.entitlements_utilisateurs_elsatia (utilisateur_id,application_code,niveau,capabilities,source,valide_du,expire_le,revoked_at,status) values
 ('55555555-0000-0000-0000-000000000001','tools','pro',array['saved-projects'],'web',now()-interval '60 days',now()-interval '1 day',now()-interval '1 day','expired');

-- Projets de référence (posés en superuser) : le projet de pro-A, celui de pro2-A, celui de membre-B,
-- et un ancien projet cloud de l'ex-abonné (créé du temps où il était Pro).
insert into public.tools_projects (id,user_id,organization_id,local_id,schema_version,tool_id,name,input_parameters,project_payload,created_at,updated_at) values
 ('a1a1a1a1-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000000a','aaaaaaaa-1111-1111-1111-111111111111',1,'fleur-6','Projet pro-A','{}','{"name":"Projet pro-A"}','2026-09-20T08:00:00Z','2026-09-20T08:00:00Z'),
 ('a1a1a1a1-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-00000000000a','aaaaaaaa-2222-2222-2222-222222222222',1,'fleur-6','Projet pro2-A','{}','{"name":"Projet pro2-A"}','2026-09-20T08:00:00Z','2026-09-20T08:00:00Z'),
 ('b1b1b1b1-0000-0000-0000-000000000001','33333333-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-00000000000b','bbbbbbbb-1111-1111-1111-111111111111',1,'fleur-6','Projet B','{}','{"name":"Projet B"}','2026-09-20T08:00:00Z','2026-09-20T08:00:00Z'),
 ('e1e1e1e1-0000-0000-0000-000000000001','55555555-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000000a','eeeeeeee-1111-1111-1111-111111111111',1,'fleur-6','Ancien projet ex-abonné','{}','{"name":"Ancien projet ex-abonné"}','2026-09-20T08:00:00Z','2026-09-20T08:00:00Z');
update public.utilisateurs set entreprise_active_id='aaaaaaaa-0000-0000-0000-00000000000a'
  where id::text in ('11111111-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000001');

-- Aides : exécute une instruction en tant qu'utilisateur `authenticated` (JWT de p_uid) et rend
-- 'OK …' ou 'ERR <sqlstate> <message> [hint:<jeton>]' ; les claims sont nettoyés ensuite.
create function pg_temp.essai(p_uid text, p_sql text, p_expr boolean default false) returns text language plpgsql as $$
declare v_n bigint; v_res text; v_state text; v_msg text; v_hint text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub',nullif(p_uid,''),'role','authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid, true);
  execute 'set local role authenticated';
  begin
    if p_expr then execute 'select ('||p_sql||')::text' into v_res; v_res := 'OK ' || coalesce(v_res,'null');
    else execute p_sql; get diagnostics v_n = row_count; v_res := 'OK rows=' || v_n; end if;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
    v_res := 'ERR ' || v_state || ' ' || v_msg || coalesce(' [hint:'||nullif(v_hint,'')||']','');
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims','',true); perform set_config('request.jwt.claim.sub','',true);
  return v_res;
end $$;
-- SQL d'un appel RPC (construit ici, exécuté ensuite par `essai` sous `authenticated`).
create function pg_temp.rpc(p_org text, p_id text, p_name text default 'N', p_rev bigint default 0, p_pad int default 0,
                            p_extra jsonb default '{}') returns text language sql as $$
  select format('public.tools_sync_project_entreprise(%L::uuid,%L::jsonb,%s,%L)->>%L', p_org,
    (jsonb_build_object('id',p_id,'schemaVersion',1,'toolId','fleur-6','name',p_name,'createdAt','2026-09-20T08:00:00Z',
      'updatedAt','2026-09-20T08:00:00Z','inputParameters','{}'::jsonb,'options','{}'::jsonb,'archived',false)
      || case when p_pad > 0 then jsonb_build_object('pad', repeat('x', p_pad)) else '{}'::jsonb end || p_extra)::text,
    coalesce(p_rev::text,'null'), 'd', 'status')
$$;
-- SQL d'un INSERT direct dans tools_projects.
create function pg_temp.ins(p_uid text, p_org text, p_local text, p_payload text default '''{}''') returns text language sql as $$
  select format('insert into public.tools_projects(user_id,organization_id,local_id,schema_version,tool_id,name,input_parameters,project_payload,created_at,updated_at) values(%L,%L,%L,1,%L,%L,%L,%s,now(),now())',
    p_uid, p_org, p_local, 'fleur-6', 'X', '{}', p_payload)
$$;

-- ═══ pro-A : Pro, membre actif de A (non-régression du cas sain) ═══
select is(pg_temp.essai('11111111-0000-0000-0000-000000000001','public.tools_resoudre_entitlements()->>''tier''',true),'OK pro','pro-A : Tools Pro résolu');
select is(pg_temp.essai('11111111-0000-0000-0000-000000000001','(select count(*) from public.tools_projects)',true),'OK 1','pro-A lit son projet, et lui seul');
select is(pg_temp.essai('11111111-0000-0000-0000-000000000001','(select count(*) from public.tools_projects where id=''a1a1a1a1-0000-0000-0000-000000000002'')',true),'OK 0','IDOR lecture : l''id du projet de pro2-A (même organisation) ne donne rien');
select is(pg_temp.essai('11111111-0000-0000-0000-000000000001','(select count(*) from public.tools_projects where id=''b1b1b1b1-0000-0000-0000-000000000001'')',true),'OK 0','IDOR lecture : l''id du projet de l''organisation B ne donne rien');
select is(pg_temp.essai('11111111-0000-0000-0000-000000000001','update public.tools_projects set name=''PIRATE'' where id=''a1a1a1a1-0000-0000-0000-000000000002'''),'OK rows=0','IDOR écriture directe sur le projet de pro2-A : 0 ligne');
select is(pg_temp.essai('11111111-0000-0000-0000-000000000001','update public.tools_projects set name=''PIRATE'' where id=''b1b1b1b1-0000-0000-0000-000000000001'''),'OK rows=0','IDOR écriture directe sur le projet de B : 0 ligne');
select alike(pg_temp.essai('11111111-0000-0000-0000-000000000001','delete from public.tools_projects where id=''a1a1a1a1-0000-0000-0000-000000000001'''),'ERR 42501 %','DELETE direct toujours refusé (suppression logique uniquement)');
select is(pg_temp.essai('11111111-0000-0000-0000-000000000001',pg_temp.ins('11111111-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000000a','direct-ok-0000000001')),'OK rows=1','pro-A : INSERT direct dans A accepté');
select alike(pg_temp.essai('11111111-0000-0000-0000-000000000001',pg_temp.ins('11111111-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-00000000000b','direct-b-00000000001')),'ERR 42501 %','pro-A : INSERT direct dans B refusé');
select alike(pg_temp.essai('11111111-0000-0000-0000-000000000001',pg_temp.ins('11111111-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-00000000000a','usurpe-0000000000001')),'ERR 42501 %','pro-A : INSERT usurpant user_id de pro2-A refusé');
select is(pg_temp.essai('11111111-0000-0000-0000-000000000001',pg_temp.rpc('aaaaaaaa-0000-0000-0000-00000000000a','rpc-a-000000000000001','Nouveau'),true),'OK applied','pro-A : RPC sync dans A appliquée');
select is(pg_temp.essai('11111111-0000-0000-0000-000000000001',pg_temp.rpc('aaaaaaaa-0000-0000-0000-00000000000a','rpc-a-000000000000001','Nouveau v2',1),true),'OK applied','pro-A : mise à jour à la bonne révision appliquée');
select is(pg_temp.essai('11111111-0000-0000-0000-000000000001',pg_temp.rpc('aaaaaaaa-0000-0000-0000-00000000000a','rpc-a-000000000000001','Nouveau v3',1),true),'OK conflict','pro-A : révision périmée = conflit explicite (comportement R10 conservé)');
select is(pg_temp.essai('11111111-0000-0000-0000-000000000001',pg_temp.rpc('aaaaaaaa-0000-0000-0000-00000000000a','rpc-a-000000000000001','Nouveau v4',null),true),'OK conflict','pro-A : révision attendue absente traitée comme 0 (plus de contournement du conflit)');
select is(pg_temp.essai('11111111-0000-0000-0000-000000000001','public.tools_sync_project(''{"id":"legacy-a-00000000001","schemaVersion":1,"toolId":"fleur-6","name":"L","createdAt":"2026-09-20T08:00:00Z","updatedAt":"2026-09-20T08:00:00Z","inputParameters":{},"options":{}}''::jsonb,0,''d'')->>''status''',true),'OK applied','pro-A : RPC historique tools_sync_project (entreprise active) toujours fonctionnelle');
select is(pg_temp.essai('11111111-0000-0000-0000-000000000001',pg_temp.rpc('bbbbbbbb-0000-0000-0000-00000000000b','rpc-b-000000000000001'),true),'ERR 42501 Entreprise non autorisée pour ELSATIA Tools [hint:tools_org_non_autorisee]','pro-A : RPC dans B refusée (42501, jeton stable)');
select is(pg_temp.essai('11111111-0000-0000-0000-000000000001',pg_temp.rpc('cccccccc-0000-0000-0000-00000000000c','rpc-z-000000000000001'),true),'ERR 42501 Entreprise non autorisée pour ELSATIA Tools [hint:tools_org_non_autorisee]','organisation inexistante : message identique à une organisation étrangère (aucune fuite)');
select is(pg_temp.essai('11111111-0000-0000-0000-000000000001',pg_temp.rpc('bbbbbbbb-0000-0000-0000-00000000000b','bbbbbbbb-1111-1111-1111-111111111111','PIRATE'),true),'ERR 42501 Entreprise non autorisée pour ELSATIA Tools [hint:tools_org_non_autorisee]','IDOR RPC : upsert sur le project_id connu du projet de B refusé');
select is(pg_temp.essai('11111111-0000-0000-0000-000000000001',pg_temp.rpc('aaaaaaaa-0000-0000-0000-00000000000a','aaaaaaaa-2222-2222-2222-222222222222','PIRATE'),true),'OK applied','pro-A : RPC avec le local_id de pro2-A crée SA PROPRE ligne (clé user_id+org+local_id)…');
select is((select name from public.tools_projects where id='a1a1a1a1-0000-0000-0000-000000000002'),'Projet pro2-A','…et le projet de pro2-A n''est pas modifié (IDOR RPC intra-organisation)');
select is(pg_temp.essai('11111111-0000-0000-0000-000000000001',pg_temp.rpc('aaaaaaaa-0000-0000-0000-00000000000a','bad-000000000000000001','X',0,0,'{"schemaVersion":"abc"}'),true),'ERR 22023 Projet Tools invalide','payload mal typé : 22023 explicite (plus de 22P02 brut)');
select is(pg_temp.essai('11111111-0000-0000-0000-000000000001',pg_temp.rpc('aaaaaaaa-0000-0000-0000-00000000000a','bad-000000000000000002','X',0,0,'{"createdAt":"pas-une-date"}'),true),'ERR 22023 Projet Tools invalide','date invalide : 22023 explicite');
select is(pg_temp.essai('11111111-0000-0000-0000-000000000001','public.tools_sync_project_entreprise(''aaaaaaaa-0000-0000-0000-00000000000a''::uuid,''{"schemaVersion":1}''::jsonb,0,''d'')->>''status''',true),'ERR 22023 Projet Tools invalide','payload incomplet : 22023 explicite');
select is(pg_temp.essai('11111111-0000-0000-0000-000000000001',pg_temp.rpc('aaaaaaaa-0000-0000-0000-00000000000a','big-0000000000000001','X',0,300000),true),'ERR 54000 Projet Tools trop volumineux (maximum 262144 octets) [hint:tools_projet_trop_volumineux]','RPC : payload de 300 Ko refusé (54000, jamais tronqué)');
select is(pg_temp.essai('11111111-0000-0000-0000-000000000001',pg_temp.rpc('aaaaaaaa-0000-0000-0000-00000000000a','big-0000000000000002','X',0,200000),true),'OK applied','RPC : payload de 200 Ko (sous la borne) accepté');
select is(pg_temp.essai('11111111-0000-0000-0000-000000000001',pg_temp.ins('11111111-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000000a','direct-big-000000001','jsonb_build_object(''pad'',repeat(''x'',300000))')),'ERR 54000 Projet Tools trop volumineux (maximum 262144 octets) [hint:tools_projet_trop_volumineux]','INSERT direct : la borne de taille s''applique aussi (trigger)');
select is((select count(*) from public.tools_projects where local_id like 'big-%'),1::bigint,'seule la ligne sous la borne existe : rien n''a été tronqué ni stocké à moitié');

-- ═══ Free-A : membre actif de A avec habilitation, SANS entitlement Pro ═══
select is(pg_temp.essai('22222222-0000-0000-0000-000000000001','public.tools_resoudre_entitlements()->>''tier''',true),'OK free','Free : tools_resoudre_entitlements() rend toujours free (jamais bloqué)');
select is(pg_temp.essai('22222222-0000-0000-0000-000000000001','public.tools_resoudre_entitlements_entreprise(''aaaaaaaa-0000-0000-0000-00000000000a'')->>''tier''',true),'OK free','Free : résolution par organisation rend free, sans erreur');
select is(pg_temp.essai('22222222-0000-0000-0000-000000000001','(select count(*) from public.tools_lister_entreprises_autorisees())',true),'OK 1','Free : le sélecteur d''organisations reste disponible (aucun refus applicatif)');
select is(pg_temp.essai('22222222-0000-0000-0000-000000000001','(select count(*) from public.tools_projects)',true),'OK 0','Free : aucune ligne cloud visible');
select alike(pg_temp.essai('22222222-0000-0000-0000-000000000001',pg_temp.ins('22222222-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000000a','free-direct-000000001')),'ERR 42501 %','Free : INSERT direct refusé (RLS)');
select is(pg_temp.essai('22222222-0000-0000-0000-000000000001',pg_temp.rpc('aaaaaaaa-0000-0000-0000-00000000000a','free-rpc-00000000001'),true),'ERR 42501 Synchronisation cloud réservée à ELSATIA Tools Pro (capacité saved-projects requise) [hint:tools_pro_requis]','Free : RPC sync refusée avec 42501 / tools_pro_requis');
select is(pg_temp.essai('22222222-0000-0000-0000-000000000001',pg_temp.rpc('aaaaaaaa-0000-0000-0000-00000000000a','aaaaaaaa-1111-1111-1111-111111111111','PIRATE'),true),'ERR 42501 Synchronisation cloud réservée à ELSATIA Tools Pro (capacité saved-projects requise) [hint:tools_pro_requis]','Free : IDOR RPC sur un project_id connu refusé');
select is(pg_temp.essai('22222222-0000-0000-0000-000000000001','public.tools_sync_project(''{"id":"legacy-f-00000000001","schemaVersion":1,"toolId":"fleur-6","name":"L","createdAt":"2026-09-20T08:00:00Z","updatedAt":"2026-09-20T08:00:00Z","inputParameters":{},"options":{}}''::jsonb,0,''d'')->>''status''',true),'ERR 42501 Synchronisation cloud réservée à ELSATIA Tools Pro (capacité saved-projects requise) [hint:tools_pro_requis]','Free : la RPC historique tools_sync_project est fermée aussi');
select is(pg_temp.essai('22222222-0000-0000-0000-000000000001',pg_temp.rpc('bbbbbbbb-0000-0000-0000-00000000000b','free-rpc-00000000002'),true),'ERR 42501 Entreprise non autorisée pour ELSATIA Tools [hint:tools_org_non_autorisee]','Free : RPC dans B = organisation non autorisée (le message ne dépend pas de l''existence de B)');

-- ═══ ex-abonné-A : entitlement expiré ET révoqué, toujours membre actif de A avec habilitation ═══
select is(pg_temp.essai('55555555-0000-0000-0000-000000000001','public.tools_resoudre_entitlements()->>''tier''',true),'OK free','ex-abonné : repasse Free (jamais bloqué)');
select is(pg_temp.essai('55555555-0000-0000-0000-000000000001','(select count(*) from public.tools_projects)',true),'OK 0','ex-abonné : son ancien projet cloud n''est plus lisible…');
select is((select count(*) from public.tools_projects where user_id='55555555-0000-0000-0000-000000000001' and deleted_at is null),1::bigint,'…mais la ligne n''est PAS supprimée (aucune perte de donnée)');
select is(pg_temp.essai('55555555-0000-0000-0000-000000000001',pg_temp.rpc('aaaaaaaa-0000-0000-0000-00000000000a','eeeeeeee-1111-1111-1111-111111111111','Mise à jour',1),true),'ERR 42501 Synchronisation cloud réservée à ELSATIA Tools Pro (capacité saved-projects requise) [hint:tools_pro_requis]','ex-abonné : RPC de mise à jour de son ancien projet refusée');
select is(pg_temp.essai('55555555-0000-0000-0000-000000000001','update public.tools_projects set name=''X'' where id=''e1e1e1e1-0000-0000-0000-000000000001'''),'OK rows=0','ex-abonné : UPDATE direct de son ancien projet : 0 ligne');
insert into public.entitlements_utilisateurs_elsatia (utilisateur_id,application_code,niveau,capabilities,source) values
 ('55555555-0000-0000-0000-000000000001','tools','pro',array['saved-projects'],'internal');
select is(pg_temp.essai('55555555-0000-0000-0000-000000000001','(select count(*) from public.tools_projects)',true),'OK 1','renouvellement : l''ancien projet réapparaît sans migration de données');
select is(pg_temp.essai('55555555-0000-0000-0000-000000000001',pg_temp.rpc('aaaaaaaa-0000-0000-0000-00000000000a','eeeeeeee-1111-1111-1111-111111111111','Mise à jour',1),true),'OK applied','renouvellement : l''écriture cloud est de nouveau autorisée');
-- Pro sans la capacité saved-projects : refusé aussi
update public.entitlements_utilisateurs_elsatia set capabilities=array['export-pdf'] where utilisateur_id='55555555-0000-0000-0000-000000000001' and revoked_at is null;
select alike(pg_temp.essai('55555555-0000-0000-0000-000000000001',pg_temp.rpc('aaaaaaaa-0000-0000-0000-00000000000a','eeeeeeee-1111-1111-1111-111111111111','Mise à jour',2),true),'ERR 42501 % [hint:tools_pro_requis]','Pro SANS la capacité saved-projects : refusé (la capacité compte, pas seulement le palier)');

-- ═══ membre-B : Pro, membre de B seulement ═══
select is(pg_temp.essai('33333333-0000-0000-0000-000000000001','(select count(*) from public.tools_projects)',true),'OK 1','membre-B lit son projet de B, pas ceux de A');
select is(pg_temp.essai('33333333-0000-0000-0000-000000000001',pg_temp.rpc('aaaaaaaa-0000-0000-0000-00000000000a','aaaaaaaa-1111-1111-1111-111111111111','PIRATE'),true),'ERR 42501 Entreprise non autorisée pour ELSATIA Tools [hint:tools_org_non_autorisee]','membre-B : RPC dans A avec le project_id de pro-A refusée');
select is(pg_temp.essai('33333333-0000-0000-0000-000000000001','update public.tools_projects set name=''PIRATE'' where id=''a1a1a1a1-0000-0000-0000-000000000001'''),'OK rows=0','membre-B : UPDATE direct par id sur le projet de pro-A : 0 ligne');
select is(pg_temp.essai('33333333-0000-0000-0000-000000000001',pg_temp.rpc('bbbbbbbb-0000-0000-0000-00000000000b','bbbbbbbb-1111-1111-1111-111111111111','Projet B v2',1),true),'OK applied','membre-B : écriture dans sa propre organisation acceptée (non-régression)');

-- ═══ sans-org : Pro personnel, aucune entreprise ═══
select is(pg_temp.essai('44444444-0000-0000-0000-000000000001','public.tools_resoudre_entitlements()->>''tier''',true),'OK pro','Pro personnel sans entreprise : reste Pro (entitlement utilisateur intact)');
select is(pg_temp.essai('44444444-0000-0000-0000-000000000001',pg_temp.rpc('aaaaaaaa-0000-0000-0000-00000000000a','solo-a-0000000000001'),true),'ERR 42501 Entreprise non autorisée pour ELSATIA Tools [hint:tools_org_non_autorisee]','Pro sans entreprise : aucun cloud d''organisation (stockage personnel serveur = DECISION_REQUIRED, non créé)');
select is(pg_temp.essai('44444444-0000-0000-0000-000000000001','(select count(*) from public.tools_projects)',true),'OK 0','Pro sans entreprise : aucune ligne visible');

-- ═══ pro-sans-habilitation-A et membre désactivé ═══
select is(pg_temp.essai('66666666-0000-0000-0000-000000000001',pg_temp.rpc('aaaaaaaa-0000-0000-0000-00000000000a','nohab-a-000000000001'),true),'ERR 42501 Entreprise non autorisée pour ELSATIA Tools [hint:tools_org_non_autorisee]','Pro sans habilitation tools_pro : refusé (couche iii conservée)');
select is(pg_temp.essai('77777777-0000-0000-0000-000000000001',pg_temp.rpc('aaaaaaaa-0000-0000-0000-00000000000a','off-a-00000000000001'),true),'ERR 42501 Entreprise non autorisée pour ELSATIA Tools [hint:tools_org_non_autorisee]','Pro, membre désactivé : refusé (couche i : membre `actif` exigé)');

-- ═══ Non authentifié ═══
select is(pg_temp.essai('',pg_temp.rpc('aaaaaaaa-0000-0000-0000-00000000000a','anon-a-0000000000001'),true),'ERR 28000 Authentification requise','sans identité : 28000 explicite');

-- ═══ Découplage d'avec l'abonnement GP ═══
select is(pg_temp.essai('11111111-0000-0000-0000-000000000001','public.tools_a_entitlement_projets_cloud()',true),'OK true','l''entitlement Pro est évalué au niveau utilisateur : indépendant de l''abonnement GP');

-- ═══ Quota (bornes abaissées dans la transaction pour un test rapide) ═══
select is((select public.tools_projets_quota_max()||'/'||public.tools_projets_lignes_max()||'/'||public.tools_projets_taille_max_octets()),'500/5000/262144','bornes de production : 500 projets actifs, 5000 lignes, 262144 octets');
create or replace function public.tools_projets_quota_max() returns integer language sql immutable as $$ select 3 $$;
create or replace function public.tools_projets_lignes_max() returns integer language sql immutable as $$ select 5 $$;
-- pro2-A possède déjà 1 ligne active (son projet de référence) ; il en crée 2 → 3 actifs
select is(pg_temp.essai('11111111-0000-0000-0000-000000000002',pg_temp.rpc('aaaaaaaa-0000-0000-0000-00000000000a','q-2222222222222222001'),true),'OK applied','quota : 2e projet actif');
select is(pg_temp.essai('11111111-0000-0000-0000-000000000002',pg_temp.rpc('aaaaaaaa-0000-0000-0000-00000000000a','q-2222222222222222002'),true),'OK applied','quota : 3e projet actif (à la borne)');
select is(pg_temp.essai('11111111-0000-0000-0000-000000000002',pg_temp.rpc('aaaaaaaa-0000-0000-0000-00000000000a','q-2222222222222222003'),true),'ERR 53400 Quota de projets cloud atteint (3 projets actifs par entreprise) [hint:tools_quota_projets]','quota : 4e projet refusé (53400 / tools_quota_projets)');
select is(pg_temp.essai('11111111-0000-0000-0000-000000000002',pg_temp.rpc('aaaaaaaa-0000-0000-0000-00000000000a','q-2222222222222222002','Renommé',1),true),'OK applied','à la borne, MODIFIER un projet existant reste possible');
select is(pg_temp.essai('11111111-0000-0000-0000-000000000002',pg_temp.rpc('aaaaaaaa-0000-0000-0000-00000000000a','q-2222222222222222002','Renommé',2,0,'{"deletedAt":"2026-09-20T09:00:00Z"}'),true),'OK applied','à la borne, SUPPRIMER (logique) un projet reste possible : le quota n''enferme jamais l''utilisateur');
select is(pg_temp.essai('11111111-0000-0000-0000-000000000002',pg_temp.rpc('aaaaaaaa-0000-0000-0000-00000000000a','q-2222222222222222003'),true),'OK applied','la suppression libère une place de quota actif');
select is(pg_temp.essai('11111111-0000-0000-0000-000000000002',pg_temp.rpc('aaaaaaaa-0000-0000-0000-00000000000a','q-2222222222222222002','Restauré',3,0,'{"deletedAt":null}'),true),'ERR 53400 Quota de projets cloud atteint (3 projets actifs par entreprise) [hint:tools_quota_projets]','restaurer un projet supprimé compte comme un projet actif');
-- lignes totales : 4 (dont 1 supprimée) → une de plus atteint 5, la suivante dépasse
select is(pg_temp.essai('11111111-0000-0000-0000-000000000002',pg_temp.rpc('aaaaaaaa-0000-0000-0000-00000000000a','q-2222222222222222004','T',0,0,'{"deletedAt":"2026-09-20T09:00:00Z"}'),true),'OK applied','plafond de lignes : la 5e ligne (supprimée) est acceptée');
select is(pg_temp.essai('11111111-0000-0000-0000-000000000002',pg_temp.rpc('aaaaaaaa-0000-0000-0000-00000000000a','q-2222222222222222005','T',0,0,'{"deletedAt":"2026-09-20T09:00:00Z"}'),true),'ERR 53400 Quota de lignes cloud atteint (5 projets, supprimés compris) [hint:tools_quota_lignes]','plafond de lignes : la 6e ligne est refusée même supprimée (53400 / tools_quota_lignes)');
select is((select count(*) from public.tools_projects where user_id='11111111-0000-0000-0000-000000000002'),5::bigint,'aucune ligne fantôme après refus : 5 lignes exactement');

-- ═══ Structure ═══
select is((select count(*) from pg_policies where schemaname='public' and tablename='tools_projects'),3::bigint,'tools_projects : 3 policies (lecture, insertion, modification), aucune policy de suppression');
select ok(not has_table_privilege('authenticated','public.tools_projects','DELETE'),'DELETE direct toujours révoqué pour authenticated');
select ok(not has_function_privilege('anon','public.tools_a_entitlement_projets_cloud()','EXECUTE')
  and not has_function_privilege('service_role','public.tools_organisations_projets_autorisees()','EXECUTE')
  and not has_function_privilege('authenticated','public.tools_projects_garde_bornes()','EXECUTE')
  and has_function_privilege('authenticated','public.tools_organisation_projets_autorisee(uuid)','EXECUTE'),'ACL des nouvelles fonctions : ni anon ni service_role, authenticated seulement là où la RLS l''exige');
select ok(not has_function_privilege('anon','public.tools_sync_project_entreprise(uuid,jsonb,bigint,text)','EXECUTE'),'anon ne peut toujours pas appeler la RPC de synchronisation');

select * from finish();
rollback;
