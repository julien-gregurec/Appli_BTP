begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','41000000-0000-0000-0000-000000000001','authenticated','authenticated','v12-a@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
('00000000-0000-0000-0000-000000000000','42000000-0000-0000-0000-000000000001','authenticated','authenticated','v12-b@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()) on conflict(id) do nothing;
insert into public.utilisateurs(id,prenom,nom) values
('41000000-0000-0000-0000-000000000001','V12','A'),('42000000-0000-0000-0000-000000000001','V12','B') on conflict(id) do nothing;
insert into public.entreprises(id,nom,code_adhesion) values
('ac000000-0000-0000-0000-000000000012','V12 A','V12A0012'),('bc000000-0000-0000-0000-000000000012','V12 B','V12B0012') on conflict(id) do nothing;
insert into public.postes(id,entreprise_id,nom) values
('ac100000-0000-0000-0000-000000000012','ac000000-0000-0000-0000-000000000012','V12 A'),
('bc100000-0000-0000-0000-000000000012','bc000000-0000-0000-0000-000000000012','V12 B') on conflict(id) do nothing;
insert into public.utilisateurs_entreprises(utilisateur_id,entreprise_id,poste_id,statut) values
('41000000-0000-0000-0000-000000000001','ac000000-0000-0000-0000-000000000012','ac100000-0000-0000-0000-000000000012','actif'),
('42000000-0000-0000-0000-000000000001','bc000000-0000-0000-0000-000000000012','bc100000-0000-0000-0000-000000000012','actif') on conflict do nothing;
insert into public.acces_applications_entreprises(entreprise_id,application_code,autorise,source) values
('ac000000-0000-0000-0000-000000000012','colors',true,'test'),('bc000000-0000-0000-0000-000000000012','colors',true,'test');
insert into public.habilitations_applications_utilisateurs(entreprise_id,utilisateur_id,application_code,role_code) values
('ac000000-0000-0000-0000-000000000012','41000000-0000-0000-0000-000000000001','colors','colors_admin_organisation'),
('bc000000-0000-0000-0000-000000000012','42000000-0000-0000-0000-000000000001','colors','colors_admin_organisation');
insert into public.colors_emplacements(id,entreprise_id,nom,type,created_by) values
('ac200000-0000-0000-0000-000000000012','ac000000-0000-0000-0000-000000000012','Dépôt A','depot','41000000-0000-0000-0000-000000000001'),
('bc200000-0000-0000-0000-000000000012','bc000000-0000-0000-0000-000000000012','Dépôt B','depot','42000000-0000-0000-0000-000000000001');
insert into public.colors_seaux(id,entreprise_id,emplacement_id,marque,produit,mode_quantite,quantite_nominale,quantite_restante,unite,etat,date_ouverture,created_by) values
('ac300000-0000-0000-0000-000000000012','ac000000-0000-0000-0000-000000000012','ac200000-0000-0000-0000-000000000012','V12','Ouvert','volume',10,5,'l','ouvert',current_date,'41000000-0000-0000-0000-000000000001'),
('bc300000-0000-0000-0000-000000000012','bc000000-0000-0000-0000-000000000012','bc200000-0000-0000-0000-000000000012','V12','B','volume',10,5,'l','ferme',null,'42000000-0000-0000-0000-000000000001');
insert into storage.objects(id,bucket_id,name,metadata) values
('ac400000-0000-0000-0000-000000000012','colors-seaux','ac000000-0000-0000-0000-000000000012/ac300000-0000-0000-0000-000000000012/ancienne.jpg','{"mimetype":"image/jpeg","size":1024}'),
('ac400000-0000-0000-0000-000000000013','colors-seaux','ac000000-0000-0000-0000-000000000012/ac300000-0000-0000-0000-000000000012/nouvelle.png','{"mimetype":"image/png","size":2048}'),
('bc400000-0000-0000-0000-000000000012','colors-seaux','bc000000-0000-0000-0000-000000000012/bc300000-0000-0000-0000-000000000012/b.jpg','{"mimetype":"image/jpeg","size":1024}');

set local role authenticated;
select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-000000000001',true);

select throws_ok($$select public.colors_photo_stockage_valide('ac000000-0000-0000-0000-000000000012','ac300000-0000-0000-0000-000000000012','x')$$,'42501',null,'validateur Storage interne non exécutable directement');
select throws_ok($$insert into storage.objects(id,bucket_id,name,metadata) values('ac400000-0000-0000-0000-000000000099','colors-seaux','ac000000-0000-0000-0000-000000000012/ac300000-0000-0000-0000-000000000012/direct.jpg','{"mimetype":"image/jpeg","size":1024}')$$,'42501',null,'upload direct Colors refusé sans validation binaire serveur');
select throws_ok($$select public.colors_creer_analyse_ocr('ac000000-0000-0000-0000-000000000012','ac300000-0000-0000-0000-000000000012','ac000000-0000-0000-0000-000000000012/ac300000-0000-0000-0000-000000000012/absente.jpg')$$,'P0001','Photo OCR Colors invalide','OCR refuse une photo absente');
select throws_ok($$select public.colors_creer_analyse_ocr('ac000000-0000-0000-0000-000000000012','ac300000-0000-0000-0000-000000000012','ac000000-0000-0000-0000-000000000012/ac300000-0000-0000-0000-000000000012/../ancienne.jpg')$$,'P0001','Photo OCR Colors invalide','OCR refuse un chemin non canonique');
select throws_ok($$select public.colors_creer_analyse_ocr('ac000000-0000-0000-0000-000000000012','ac300000-0000-0000-0000-000000000012','bc000000-0000-0000-0000-000000000012/bc300000-0000-0000-0000-000000000012/b.jpg')$$,'P0001','Photo OCR Colors invalide','OCR refuse une photo cross-tenant');
select lives_ok($$select public.colors_creer_analyse_ocr('ac000000-0000-0000-0000-000000000012','ac300000-0000-0000-0000-000000000012','ac000000-0000-0000-0000-000000000012/ac300000-0000-0000-0000-000000000012/ancienne.jpg')$$,'OCR accepte une photo canonique existante');
select is((select statut from public.colors_analyses_ocr where entreprise_id='ac000000-0000-0000-0000-000000000012'),'a_confirmer','OCR reste à confirmer');

select lives_ok($$select public.colors_archiver_seau('ac300000-0000-0000-0000-000000000012',true,'archive')$$,'premier archivage');
select is((select etat_avant_archivage from public.colors_seaux where id='ac300000-0000-0000-0000-000000000012'),'ouvert','état ouvert mémorisé');
select lives_ok($$select public.colors_archiver_seau('ac300000-0000-0000-0000-000000000012',true,'bis')$$,'archivage répété idempotent');
select is((select count(*) from public.colors_mouvements where seau_id='ac300000-0000-0000-0000-000000000012' and type='archivage'),1::bigint,'un seul mouvement archivage');
select lives_ok($$select public.colors_archiver_seau('ac300000-0000-0000-0000-000000000012',false,'retour')$$,'première restauration');
select is((select etat from public.colors_seaux where id='ac300000-0000-0000-0000-000000000012'),'ouvert','restauration retrouve l’état ouvert');
select lives_ok($$select public.colors_archiver_seau('ac300000-0000-0000-0000-000000000012',false,'bis')$$,'restauration répétée idempotente');
select is((select count(*) from public.colors_mouvements where seau_id='ac300000-0000-0000-0000-000000000012' and type='restauration'),1::bigint,'un seul mouvement restauration');

select lives_ok($$select public.colors_definir_photo('ac300000-0000-0000-0000-000000000012','ac000000-0000-0000-0000-000000000012/ac300000-0000-0000-0000-000000000012/nouvelle.png')$$,'nouvelle photo liée');
select lives_ok($$select public.colors_signaler_nettoyage_photo('ac300000-0000-0000-0000-000000000012','ac000000-0000-0000-0000-000000000012/ac300000-0000-0000-0000-000000000012/ancienne.jpg','différé')$$,'ancien objet mis en file');
select lives_ok($$select public.colors_signaler_nettoyage_photo('ac300000-0000-0000-0000-000000000012','ac000000-0000-0000-0000-000000000012/ac300000-0000-0000-0000-000000000012/ancienne.jpg','nouvel essai')$$,'mise en file répétée idempotente');
reset role;
select is((select count(*) from public.colors_nettoyages_photos where photo_path like '%ancienne.jpg'),1::bigint,'une seule dette de nettoyage');
select is((select tentatives from public.colors_nettoyages_photos where photo_path like '%ancienne.jpg'),2,'tentatives comptabilisées');
reset role;
select set_config('storage.allow_delete_query','true',true);
delete from storage.objects where bucket_id='colors-seaux' and name='ac000000-0000-0000-0000-000000000012/ac300000-0000-0000-0000-000000000012/ancienne.jpg';
set local role authenticated;
select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-000000000001',true);
select ok(public.colors_resoudre_nettoyage_photo('ac300000-0000-0000-0000-000000000012','ac000000-0000-0000-0000-000000000012/ac300000-0000-0000-0000-000000000012/ancienne.jpg'),'nettoyage résolu');
select ok(public.colors_resoudre_nettoyage_photo('ac300000-0000-0000-0000-000000000012','ac000000-0000-0000-0000-000000000012/ac300000-0000-0000-0000-000000000012/ancienne.jpg'),'résolution répétée idempotente');

reset role; set local role service_role;
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select public.colors_signaler_nettoyage_photo('ac300000-0000-0000-0000-000000000012','ac000000-0000-0000-0000-000000000012/ac300000-0000-0000-0000-000000000012/ancienne.jpg',null)$$,'42501',null,'service_role ne pilote pas la file Colors');

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','42000000-0000-0000-0000-000000000001',true);
select throws_ok($$select public.colors_signaler_nettoyage_photo('ac300000-0000-0000-0000-000000000012','ac000000-0000-0000-0000-000000000012/ac300000-0000-0000-0000-000000000012/ancienne.jpg',null)$$,'P0001','Accès Colors refusé','file de nettoyage isolée entre tenants');

reset role;
select * from finish();
rollback;
