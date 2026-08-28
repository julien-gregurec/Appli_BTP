begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

-- ELSATIA Colors V1.3 — fermeture DML directe (anon / service_role) sur toutes
-- les tables colors_*, et surface de consultation persistante et cloisonnée de
-- la file de nettoyage photo (colors_nettoyages_photos_seau).

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','43000000-0000-0000-0000-000000000001','authenticated','authenticated','v13-a@invalid.local',crypt('t',gen_salt('bf')),now(),now(),now()),
('00000000-0000-0000-0000-000000000000','44000000-0000-0000-0000-000000000001','authenticated','authenticated','v13-b@invalid.local',crypt('t',gen_salt('bf')),now(),now(),now()),
('00000000-0000-0000-0000-000000000000','45000000-0000-0000-0000-000000000001','authenticated','authenticated','v13-nocolors@invalid.local',crypt('t',gen_salt('bf')),now(),now(),now()) on conflict(id) do nothing;
insert into public.utilisateurs(id,prenom,nom) values
('43000000-0000-0000-0000-000000000001','V13','A'),('44000000-0000-0000-0000-000000000001','V13','B'),('45000000-0000-0000-0000-000000000001','V13','NoColors') on conflict(id) do nothing;
insert into public.entreprises(id,nom,code_adhesion) values
('ad000000-0000-0000-0000-000000000013','V13 A','V13A0013'),('bd000000-0000-0000-0000-000000000013','V13 B','V13B0013') on conflict(id) do nothing;
insert into public.postes(id,entreprise_id,nom) values
('ad100000-0000-0000-0000-000000000013','ad000000-0000-0000-0000-000000000013','V13 A'),
('bd100000-0000-0000-0000-000000000013','bd000000-0000-0000-0000-000000000013','V13 B') on conflict(id) do nothing;
insert into public.utilisateurs_entreprises(utilisateur_id,entreprise_id,poste_id,statut) values
('43000000-0000-0000-0000-000000000001','ad000000-0000-0000-0000-000000000013','ad100000-0000-0000-0000-000000000013','actif'),
('45000000-0000-0000-0000-000000000001','ad000000-0000-0000-0000-000000000013','ad100000-0000-0000-0000-000000000013','actif'),
('44000000-0000-0000-0000-000000000001','bd000000-0000-0000-0000-000000000013','bd100000-0000-0000-0000-000000000013','actif') on conflict do nothing;
insert into public.acces_applications_entreprises(entreprise_id,application_code,autorise,source) values
('ad000000-0000-0000-0000-000000000013','colors',true,'test'),('bd000000-0000-0000-0000-000000000013','colors',true,'test');
insert into public.habilitations_applications_utilisateurs(entreprise_id,utilisateur_id,application_code,role_code) values
('ad000000-0000-0000-0000-000000000013','43000000-0000-0000-0000-000000000001','colors','colors_admin_organisation'),
('bd000000-0000-0000-0000-000000000013','44000000-0000-0000-0000-000000000001','colors','colors_admin_organisation');
insert into public.colors_emplacements(id,entreprise_id,nom,type,created_by) values
('ad200000-0000-0000-0000-000000000013','ad000000-0000-0000-0000-000000000013','Dépôt A','depot','43000000-0000-0000-0000-000000000001'),
('bd200000-0000-0000-0000-000000000013','bd000000-0000-0000-0000-000000000013','Dépôt B','depot','44000000-0000-0000-0000-000000000001');
insert into public.colors_seaux(id,entreprise_id,emplacement_id,marque,produit,mode_quantite,quantite_nominale,quantite_restante,unite,etat,created_by) values
('ad300000-0000-0000-0000-000000000013','ad000000-0000-0000-0000-000000000013','ad200000-0000-0000-0000-000000000013','V13','A','volume',10,5,'l','ferme','43000000-0000-0000-0000-000000000001'),
('bd300000-0000-0000-0000-000000000013','bd000000-0000-0000-0000-000000000013','bd200000-0000-0000-0000-000000000013','V13','B','volume',10,5,'l','ferme','44000000-0000-0000-0000-000000000001');
insert into storage.objects(id,bucket_id,name,metadata) values
('ad400000-0000-0000-0000-000000000013','colors-seaux','ad000000-0000-0000-0000-000000000013/ad300000-0000-0000-0000-000000000013/ancienne.jpg','{"mimetype":"image/jpeg","size":1024}'),
('ad400000-0000-0000-0000-000000000014','colors-seaux','ad000000-0000-0000-0000-000000000013/ad300000-0000-0000-0000-000000000013/nouvelle.png','{"mimetype":"image/png","size":2048}');

-- =====================================================================
-- Section A — révocation DML directe sur toutes les tables colors_*
-- =====================================================================
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema='public' and table_name like 'colors\_%'
      and grantee in ('PUBLIC','anon','service_role')
      and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')),
  0,
  'aucun grant direct INSERT/UPDATE/DELETE/TRUNCATE colors_* pour PUBLIC/anon/service_role'
);
select is(
  (select bool_or(has_table_privilege(r.role, format('public.%I', t.relname), p.priv))
     from (select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='public' and c.relkind in ('r','p') and c.relname like 'colors\_%') t
     cross join (select unnest(array['anon','service_role']) as role) r
     cross join (select unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) as priv) p),
  false,
  'aucun privilège d''écriture effectif (hérité inclus) pour anon/service_role sur colors_*'
);

reset role; set local role service_role; select set_config('request.jwt.claim.sub','',true);
select throws_ok($$insert into public.colors_seaux(entreprise_id,emplacement_id,marque,produit,mode_quantite,quantite_nominale,quantite_restante,unite,created_by) values('ad000000-0000-0000-0000-000000000013','ad200000-0000-0000-0000-000000000013','H','H','volume',10,5,'l','43000000-0000-0000-0000-000000000001')$$,null,null,'service_role : INSERT colors_seaux refusé');
select throws_ok($$update public.colors_seaux set marque='HACK' where id='ad300000-0000-0000-0000-000000000013'$$,null,null,'service_role : UPDATE colors_seaux refusé');
select throws_ok($$delete from public.colors_seaux where id='ad300000-0000-0000-0000-000000000013'$$,null,null,'service_role : DELETE colors_seaux refusé');
select throws_ok($$delete from public.colors_mouvements where seau_id='ad300000-0000-0000-0000-000000000013'$$,null,null,'service_role : DELETE colors_mouvements refusé');
select throws_ok($$delete from public.colors_analyses_ocr$$,null,null,'service_role : DELETE colors_analyses_ocr refusé');
select throws_ok($$truncate public.colors_parametres$$,null,null,'service_role : TRUNCATE colors_parametres refusé');
select throws_ok($$insert into public.colors_nettoyages_photos(entreprise_id,seau_id,photo_path) values('ad000000-0000-0000-0000-000000000013','ad300000-0000-0000-0000-000000000013','ad000000-0000-0000-0000-000000000013/ad300000-0000-0000-0000-000000000013/forge.jpg')$$,null,null,'service_role : INSERT colors_nettoyages_photos refusé');
select throws_ok($$delete from public.colors_nettoyages_photos$$,null,null,'service_role : DELETE colors_nettoyages_photos refusé');

reset role; set local role anon; select set_config('request.jwt.claim.sub','',true);
select throws_ok($$insert into public.colors_seaux(entreprise_id,emplacement_id,marque,produit,mode_quantite,quantite_nominale,quantite_restante,unite,created_by) values('ad000000-0000-0000-0000-000000000013','ad200000-0000-0000-0000-000000000013','AN','A','volume',10,5,'l','43000000-0000-0000-0000-000000000001')$$,null,null,'anon : INSERT colors_seaux refusé');
select throws_ok($$update public.colors_seaux set marque='ANON' where id='ad300000-0000-0000-0000-000000000013'$$,null,null,'anon : UPDATE colors_seaux refusé');
select throws_ok($$delete from public.colors_seaux$$,null,null,'anon : DELETE colors_seaux refusé');

reset role;
select is((select marque from public.colors_seaux where id='ad300000-0000-0000-0000-000000000013'),'V13','service_role/anon : seau A non modifié');
select is((select count(*) from public.colors_seaux),2::bigint,'service_role/anon : aucun seau créé ni supprimé');

-- =====================================================================
-- Section B — conservation du chemin serveur canonique
-- =====================================================================
set local role authenticated; select set_config('request.jwt.claim.sub','43000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.colors_definir_photo('ad300000-0000-0000-0000-000000000013','ad000000-0000-0000-0000-000000000013/ad300000-0000-0000-0000-000000000013/ancienne.jpg')$$,'RPC canonique colors_definir_photo fonctionne après révocations');
select lives_ok($$select public.colors_definir_photo('ad300000-0000-0000-0000-000000000013','ad000000-0000-0000-0000-000000000013/ad300000-0000-0000-0000-000000000013/nouvelle.png')$$,'bascule vers la nouvelle photo (ancienne devient non principale)');
select lives_ok($$select public.colors_signaler_nettoyage_photo('ad300000-0000-0000-0000-000000000013','ad000000-0000-0000-0000-000000000013/ad300000-0000-0000-0000-000000000013/ancienne.jpg','échec suppression Storage')$$,'mise en file de l''ancienne photo');

-- =====================================================================
-- Section C — consultation persistante et cloisonnée de la file
-- =====================================================================
select is((select count(*)::int from public.colors_nettoyages_photos_seau('ad300000-0000-0000-0000-000000000013')),1,'consultation : une dette visible pour le seau A');
select is((select nettoyage_requis from public.colors_nettoyages_photos_seau('ad300000-0000-0000-0000-000000000013')),true,'consultation : nettoyage_requis = true');
select is((select statut from public.colors_nettoyages_photos_seau('ad300000-0000-0000-0000-000000000013')),'a_nettoyer','consultation : statut a_nettoyer');
select is((select tentatives from public.colors_nettoyages_photos_seau('ad300000-0000-0000-0000-000000000013')),1,'consultation : une tentative comptée');
select ok((select created_at is not null and derniere_tentative_at is not null from public.colors_nettoyages_photos_seau('ad300000-0000-0000-0000-000000000013')),'consultation : horodatages présents');
select ok((select resolved_at is null from public.colors_nettoyages_photos_seau('ad300000-0000-0000-0000-000000000013')),'consultation : resolved_at null tant que non résolu');
select ok((select derniere_erreur like '%échec suppression Storage%' from public.colors_nettoyages_photos_seau('ad300000-0000-0000-0000-000000000013')),'consultation : erreur technique assainie exposée');
select ok(pg_get_function_result('public.colors_nettoyages_photos_seau(uuid)'::regprocedure) not like '%photo_path%','consultation : le chemin Storage interne complet n''est pas exposé');

-- idempotence : appels répétés ne polluent pas la file
select lives_ok($$select public.colors_signaler_nettoyage_photo('ad300000-0000-0000-0000-000000000013','ad000000-0000-0000-0000-000000000013/ad300000-0000-0000-0000-000000000013/ancienne.jpg','2e échec')$$,'2e signalement idempotent');
select lives_ok($$select public.colors_signaler_nettoyage_photo('ad300000-0000-0000-0000-000000000013','ad000000-0000-0000-0000-000000000013/ad300000-0000-0000-0000-000000000013/ancienne.jpg','3e échec')$$,'3e signalement idempotent');
reset role;
select is((select count(*) from public.colors_nettoyages_photos where photo_path like '%ancienne.jpg'),1::bigint,'idempotence : une seule dette active pour la même suppression');
set local role authenticated; select set_config('request.jwt.claim.sub','43000000-0000-0000-0000-000000000001',true);
select is((select tentatives from public.colors_nettoyages_photos_seau('ad300000-0000-0000-0000-000000000013')),3,'idempotence : tentatives ultérieures tracées (3)');

-- l'utilisateur ne peut ni forger ni résoudre en direct
select throws_ok($$insert into public.colors_nettoyages_photos(entreprise_id,seau_id,photo_path) values('ad000000-0000-0000-0000-000000000013','ad300000-0000-0000-0000-000000000013','ad000000-0000-0000-0000-000000000013/ad300000-0000-0000-0000-000000000013/forge.jpg')$$,null,null,'authenticated : INSERT direct colors_nettoyages_photos refusé');
select throws_ok($$update public.colors_nettoyages_photos set statut='resolu',resolved_at=now() where photo_path like '%ancienne.jpg'$$,null,null,'authenticated : marquer une dette résolue en direct refusé');
select throws_ok($$delete from public.colors_nettoyages_photos where photo_path like '%ancienne.jpg'$$,null,null,'authenticated : supprimer une dette en direct refusé');
select is((select statut from public.colors_nettoyages_photos_seau('ad300000-0000-0000-0000-000000000013')),'a_nettoyer','authenticated : dette toujours a_nettoyer après tentatives directes');

-- isolation multi-tenant de la consultation
reset role; set local role authenticated; select set_config('request.jwt.claim.sub','44000000-0000-0000-0000-000000000001',true);
select is((select count(*)::int from public.colors_nettoyages_photos_seau('ad300000-0000-0000-0000-000000000013')),0,'isolation : le tenant B ne voit pas la file du seau A');
reset role; set local role authenticated; select set_config('request.jwt.claim.sub','45000000-0000-0000-0000-000000000001',true);
select is((select count(*)::int from public.colors_nettoyages_photos_seau('ad300000-0000-0000-0000-000000000013')),0,'isolation : un membre sans habilitation Colors ne voit rien');
reset role; set local role anon; select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select public.colors_nettoyages_photos_seau('ad300000-0000-0000-0000-000000000013')$$,null,null,'isolation : anon ne peut pas exécuter la consultation');
reset role; set local role service_role; select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select public.colors_nettoyages_photos_seau('ad300000-0000-0000-0000-000000000013')$$,null,null,'isolation : service_role ne peut pas exécuter la consultation');
select throws_ok($$select public.colors_resoudre_nettoyage_photo('ad300000-0000-0000-0000-000000000013','ad000000-0000-0000-0000-000000000013/ad300000-0000-0000-0000-000000000013/ancienne.jpg')$$,null,null,'isolation : service_role ne pilote pas la résolution');

-- persistance après « rechargement » : tant que l'objet est présent, la dette reste
reset role; set local role authenticated; select set_config('request.jwt.claim.sub','43000000-0000-0000-0000-000000000001',true);
select throws_like($$select public.colors_resoudre_nettoyage_photo('ad300000-0000-0000-0000-000000000013','ad000000-0000-0000-0000-000000000013/ad300000-0000-0000-0000-000000000013/ancienne.jpg')$$,'%encore présente dans Storage%','résolution refusée tant que l''objet Storage existe');
select is((select nettoyage_requis from public.colors_nettoyages_photos_seau('ad300000-0000-0000-0000-000000000013')),true,'persistance : dette toujours visible après un rechargement de la consultation');

-- résolution réelle : l'objet est supprimé côté Storage, puis la file est résolue
reset role;
select set_config('storage.allow_delete_query','true',true);
delete from storage.objects where bucket_id='colors-seaux' and name='ad000000-0000-0000-0000-000000000013/ad300000-0000-0000-0000-000000000013/ancienne.jpg';
set local role authenticated; select set_config('request.jwt.claim.sub','43000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.colors_resoudre_nettoyage_photo('ad300000-0000-0000-0000-000000000013','ad000000-0000-0000-0000-000000000013/ad300000-0000-0000-0000-000000000013/ancienne.jpg')$$,'résolution effective une fois l''objet supprimé');
select is((select nettoyage_requis from public.colors_nettoyages_photos_seau('ad300000-0000-0000-0000-000000000013')),false,'persistance : la dette disparaît uniquement après résolution réelle');
select ok((select resolved_at is not null and statut='resolu' from public.colors_nettoyages_photos_seau('ad300000-0000-0000-0000-000000000013')),'résolution : statut resolu + resolved_at renseigné');
select lives_ok($$select public.colors_resoudre_nettoyage_photo('ad300000-0000-0000-0000-000000000013','ad000000-0000-0000-0000-000000000013/ad300000-0000-0000-0000-000000000013/ancienne.jpg')$$,'résolution répétée idempotente');
reset role;
select is((select count(*) from public.colors_nettoyages_photos where photo_path like '%ancienne.jpg'),1::bigint,'idempotence : toujours une seule ligne, historique conservé');

reset role;
select * from finish();
rollback;
