begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

-- Réutilise la fixture autonome du test V1 lorsque la suite est jouée fichier par fichier.
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','31000000-0000-0000-0000-000000000001','authenticated','authenticated','v11-a@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
('00000000-0000-0000-0000-000000000000','32000000-0000-0000-0000-000000000001','authenticated','authenticated','v11-b@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()) on conflict(id) do nothing;
insert into public.utilisateurs(id,prenom,nom) values('31000000-0000-0000-0000-000000000001','V11','A'),('32000000-0000-0000-0000-000000000001','V11','B') on conflict(id) do nothing;
insert into public.entreprises(id,nom,code_adhesion) values('aa000000-0000-0000-0000-000000000011','V11 A','V11A0011'),('bb000000-0000-0000-0000-000000000011','V11 B','V11B0011') on conflict(id) do nothing;
insert into public.postes(id,entreprise_id,nom) values('aa100000-0000-0000-0000-000000000011','aa000000-0000-0000-0000-000000000011','V11 A'),('bb100000-0000-0000-0000-000000000011','bb000000-0000-0000-0000-000000000011','V11 B') on conflict(id) do nothing;
insert into public.utilisateurs_entreprises(utilisateur_id,entreprise_id,poste_id,statut) values('31000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000011','aa100000-0000-0000-0000-000000000011','actif'),('32000000-0000-0000-0000-000000000001','bb000000-0000-0000-0000-000000000011','bb100000-0000-0000-0000-000000000011','actif') on conflict do nothing;
insert into public.acces_applications_entreprises(entreprise_id,application_code,autorise,source) values('aa000000-0000-0000-0000-000000000011','colors',true,'test'),('bb000000-0000-0000-0000-000000000011','colors',true,'test');
insert into public.habilitations_applications_utilisateurs(entreprise_id,utilisateur_id,application_code,role_code) values('aa000000-0000-0000-0000-000000000011','31000000-0000-0000-0000-000000000001','colors','colors_admin_organisation'),('bb000000-0000-0000-0000-000000000011','32000000-0000-0000-0000-000000000001','colors','colors_admin_organisation');

set local role authenticated;
select set_config('request.jwt.claim.sub','31000000-0000-0000-0000-000000000001',true);
select lives_ok($$insert into public.colors_emplacements(id,entreprise_id,nom,type,created_by) values('aa200000-0000-0000-0000-000000000011','aa000000-0000-0000-0000-000000000011','Dépôt V11','depot','32000000-0000-0000-0000-000000000001')$$,'création emplacement');
select is((select created_by from public.colors_emplacements where id='aa200000-0000-0000-0000-000000000011'),'31000000-0000-0000-0000-000000000001'::uuid,'auteur emplacement canonique');
select lives_ok($$insert into public.colors_seaux(id,entreprise_id,emplacement_id,marque,produit,mode_quantite,quantite_nominale,quantite_restante,unite,created_by) values('aa300000-0000-0000-0000-000000000011','aa000000-0000-0000-0000-000000000011','aa200000-0000-0000-0000-000000000011','V11','Seau','volume',10,8,'l','32000000-0000-0000-0000-000000000001')$$,'création seau');
select is((select created_by from public.colors_seaux where id='aa300000-0000-0000-0000-000000000011'),'31000000-0000-0000-0000-000000000001'::uuid,'auteur seau canonique');
reset role; set local role service_role;
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$update public.colors_seaux set notes='bypass service' where id='aa300000-0000-0000-0000-000000000011'$$,'42501',null,'service_role direct ne contourne pas le seau');
select throws_ok($$insert into public.colors_mouvements(entreprise_id,seau_id,type,auteur_id) values('aa000000-0000-0000-0000-000000000011','aa300000-0000-0000-0000-000000000011','ajustement','32000000-0000-0000-0000-000000000001')$$,'42501',null,'service_role direct ne falsifie pas le journal');
select throws_ok($$insert into public.colors_parametres(entreprise_id,seuil_stock_faible_pourcent) values('aa000000-0000-0000-0000-000000000011',99)$$,'42501',null,'service_role direct ne contourne pas les paramètres');
reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','31000000-0000-0000-0000-000000000001',true);
select throws_ok($$update public.colors_seaux set created_by='32000000-0000-0000-0000-000000000001' where id='aa300000-0000-0000-0000-000000000011'$$,'42501',null,'auteur initial immuable');
select throws_ok($$update public.colors_seaux set notes='direct' where id='aa300000-0000-0000-0000-000000000011'$$,'42501',null,'écriture directe fermée');
select throws_ok($$update public.colors_seaux set photo_principale_path='aa000000-0000-0000-0000-000000000011/aa300000-0000-0000-0000-000000000011/direct.jpg' where id='aa300000-0000-0000-0000-000000000011'$$,'42501',null,'photo directe fermée');
select throws_ok($$select public.colors_definir_photo('aa300000-0000-0000-0000-000000000011','aa000000-0000-0000-0000-000000000011/aa300000-0000-0000-0000-000000000011/inexistante.jpg')$$,'P0001','Photo Colors invalide','photo inexistante refusée');
select lives_ok($$select public.colors_modifier_seau('aa300000-0000-0000-0000-000000000011','V11','RPC',null,null,null,null,'ok')$$,'métadonnées via RPC');
select throws_ok($$insert into public.colors_analyses_ocr(entreprise_id,photo_path,created_by) values('aa000000-0000-0000-0000-000000000011','aa000000-0000-0000-0000-000000000011/x/y.jpg','31000000-0000-0000-0000-000000000001')$$,'42501',null,'OCR direct fermé');
select lives_ok($$select public.colors_creer_analyse_ocr('aa000000-0000-0000-0000-000000000011','aa300000-0000-0000-0000-000000000011','aa000000-0000-0000-0000-000000000011/aa300000-0000-0000-0000-000000000011/ocr.jpg','{"marque":"V11"}',90)$$,'OCR proposé via RPC');
select is((select statut from public.colors_analyses_ocr where entreprise_id='aa000000-0000-0000-0000-000000000011'),'a_confirmer','OCR impose confirmation');
select throws_ok($$update public.colors_analyses_ocr set statut='confirmee',confirme_par='32000000-0000-0000-0000-000000000001',confirme_at=now() where entreprise_id='aa000000-0000-0000-0000-000000000011'$$,'42501',null,'statut et confirme_par directs fermés');
select throws_ok($$select public.colors_confirmer_analyse_ocr((select id from public.colors_analyses_ocr where entreprise_id='aa000000-0000-0000-0000-000000000011'),'{}')$$,'P0001','Résultat OCR confirmé requis','confirmation vide refusée');
select lives_ok($$select public.colors_confirmer_analyse_ocr((select id from public.colors_analyses_ocr where entreprise_id='aa000000-0000-0000-0000-000000000011'),'{"marque":"Confirmée"}')$$,'confirmation explicite');
select throws_ok($$select public.colors_confirmer_analyse_ocr((select id from public.colors_analyses_ocr where entreprise_id='aa000000-0000-0000-0000-000000000011'),'{"x":1}')$$,'P0001','Analyse OCR déjà traitée','double confirmation refusée');
select throws_ok($$select public.colors_ajuster_quantite('aa300000-0000-0000-0000-000000000011',9,'consommation','x')$$,'P0001','Une sortie ou consommation doit réduire le stock','sens consommation contrôlé');
select throws_ok($$select public.colors_ajuster_quantite('aa300000-0000-0000-0000-000000000011',7,'retour_chantier','x')$$,'P0001','Un retour chantier doit augmenter le stock','sens retour contrôlé');
select throws_ok($$select public.colors_ajuster_quantite('aa300000-0000-0000-0000-000000000011',7,'ajustement',null)$$,'P0001','Un motif est requis pour un ajustement','motif ajustement requis');
select lives_ok($$select public.colors_ajuster_quantite('aa300000-0000-0000-0000-000000000011',0,'consommation','fin')$$,'passage vide automatique');
select is((select etat_avant from public.colors_mouvements where seau_id='aa300000-0000-0000-0000-000000000011' and type='passage_vide' order by created_at desc limit 1),'ferme','état avant réel conservé');
select lives_ok($$select public.colors_enregistrer_parametres('aa000000-0000-0000-0000-000000000011',35)$$,'seuil tenant enregistré');
select is((select seuil_stock_faible_pourcent from public.colors_statistiques('aa000000-0000-0000-0000-000000000011')),35::numeric,'statistiques utilisent le seuil tenant');
select lives_ok($$insert into public.colors_seaux(entreprise_id,emplacement_id,marque,produit,mode_quantite,quantite_nominale,quantite_restante,unite,created_by)
  select 'aa000000-0000-0000-0000-000000000011','aa200000-0000-0000-0000-000000000011','Lot V11',g::text,'volume',10,1,'l','32000000-0000-0000-0000-000000000001' from generate_series(1,65) g$$,'65 seaux supplémentaires créés');
select is((select actifs from public.colors_statistiques('aa000000-0000-0000-0000-000000000011')),66::bigint,'statistiques comptent plus de 60 seaux');
select is((select faibles from public.colors_statistiques('aa000000-0000-0000-0000-000000000011')),65::bigint,'stock faible agrégé sur tout le tenant');
select is((select count(*) from public.colors_seaux where entreprise_id='bb000000-0000-0000-0000-000000000011'),0::bigint,'isolation tenant intacte');

reset role;
select * from finish();
rollback;
