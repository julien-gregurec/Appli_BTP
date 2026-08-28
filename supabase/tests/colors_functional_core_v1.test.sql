begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

-- Fixture Colors minimale : évite de dépendre des champs admin plateforme hors périmètre.
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000001','authenticated','authenticated','admin-a@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000002','authenticated','authenticated','manager-a@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000003','authenticated','authenticated','depot-a@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000004','authenticated','authenticated','consultation-a@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000005','authenticated','authenticated','sans-colors-a@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
('00000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000001','authenticated','authenticated','admin-b@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()) on conflict(id) do nothing;
insert into public.utilisateurs(id,prenom,nom) values
('10000000-0000-0000-0000-000000000001','Admin','A'),('10000000-0000-0000-0000-000000000002','Manager','A'),
('10000000-0000-0000-0000-000000000003','Dépôt','A'),('10000000-0000-0000-0000-000000000004','Consultation','A'),
('10000000-0000-0000-0000-000000000005','Sans Colors','A'),('20000000-0000-0000-0000-000000000001','Admin','B') on conflict(id) do update set prenom=excluded.prenom,nom=excluded.nom;
insert into public.entreprises(id,nom,code_adhesion) values
('a0000000-0000-0000-0000-000000000001','Entreprise Colors A','COLA0001'),
('b0000000-0000-0000-0000-000000000001','Entreprise Colors B','COLB0001') on conflict(id) do nothing;
insert into public.postes(id,entreprise_id,nom) values
('a1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Colors A'),
('b1000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','Colors B') on conflict(id) do nothing;
insert into public.utilisateurs_entreprises(utilisateur_id,entreprise_id,poste_id,statut) values
('10000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','actif'),
('10000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','actif'),
('10000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','actif'),
('10000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','actif'),
('10000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','actif'),
('20000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','actif') on conflict do nothing;

insert into public.acces_applications_entreprises(entreprise_id,application_code,autorise,source) values
  ('a0000000-0000-0000-0000-000000000001','colors',true,'test'),
  ('b0000000-0000-0000-0000-000000000001','colors',true,'test');
insert into public.habilitations_applications_utilisateurs(entreprise_id,utilisateur_id,application_code,role_code) values
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','colors','colors_admin_organisation'),
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','colors','colors_gestionnaire_stock'),
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','colors','colors_utilisateur_depot'),
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','colors','colors_consultation'),
  ('b0000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','colors','colors_admin_organisation');

insert into public.colors_emplacements(id,entreprise_id,nom,type,created_by) values
  ('c0100000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Dépôt A','depot','10000000-0000-0000-0000-000000000001'),
  ('c0100000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','Camion A','vehicule','10000000-0000-0000-0000-000000000001'),
  ('d0100000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','Dépôt B','depot','20000000-0000-0000-0000-000000000001');
insert into public.colors_seaux(id,entreprise_id,emplacement_id,marque,produit,teinte_nom,mode_quantite,quantite_nominale,quantite_restante,unite,created_by) values
  ('d0200000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','d0100000-0000-0000-0000-000000000001','Marque B','Produit B','Bleu B','volume',10,8,'l','20000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claim.email','ouvrier-a@invalid.local',true);

select ok(public.colors_action_autorisee('a0000000-0000-0000-0000-000000000001','ajouter_seau'),'gestionnaire peut ajouter');
select lives_ok($$
  insert into public.colors_seaux(id,entreprise_id,emplacement_id,marque,produit,reference_produit,teinte_nom,couleur_hex,mode_quantite,quantite_nominale,quantite_restante,unite,created_by)
  values('c0200000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','c0100000-0000-0000-0000-000000000001','Sto','StoColor','STO-1','Blanc','#ffffff','volume',10,2.5,'l','10000000-0000-0000-0000-000000000002')
$$,'gestionnaire crée un seau en litres');
select is((select pourcentage_restant from public.colors_seaux where id='c0200000-0000-0000-0000-000000000001'),25.00::numeric,'pourcentage calculé à 25 %');
select is((select couleur_hex from public.colors_seaux where id='c0200000-0000-0000-0000-000000000001'),'#FFFFFF','HEX normalisé');
select is((select count(*) from public.colors_mouvements where seau_id='c0200000-0000-0000-0000-000000000001'),1::bigint,'création historisée');
select is((select count(*) from public.colors_seaux),1::bigint,'gestionnaire A ne voit pas le seau B');
select throws_ok($$insert into public.colors_seaux(entreprise_id,marque,produit,mode_quantite,pourcentage_saisi,unite,created_by) values('b0000000-0000-0000-0000-000000000001','X','X','pourcentage',50,'pourcent','10000000-0000-0000-0000-000000000002')$$,'42501',null,'insert cross-tenant refusé');
select throws_ok($$update public.colors_seaux set quantite_restante=2 where id='c0200000-0000-0000-0000-000000000001'$$,'42501',null,'ajustement direct refusé');
select lives_ok($$select public.colors_ajuster_quantite('c0200000-0000-0000-0000-000000000001',1.5,'consommation','Chantier test')$$,'ajustement via RPC autorisé');
select is((select pourcentage_restant from public.colors_seaux where id='c0200000-0000-0000-0000-000000000001'),15.00::numeric,'quantité litres recalculée');
select is((select count(*) from public.colors_mouvements where seau_id='c0200000-0000-0000-0000-000000000001'),2::bigint,'consommation historisée');
select throws_ok($$select public.colors_ajuster_quantite('c0200000-0000-0000-0000-000000000001',-1,'ajustement',null)$$,'P0001','La quantité restante ne peut pas être négative','quantité négative refusée');
select throws_ok($$select public.colors_ajuster_quantite('c0200000-0000-0000-0000-000000000001',11,'ajustement','Correction inventaire')$$,'P0001','Quantité supérieure au nominal','dépassement nominal refusé');
select throws_ok($$insert into public.colors_seaux(entreprise_id,marque,produit,mode_quantite,unite,created_by) values('a0000000-0000-0000-0000-000000000001','X','Sans pourcentage','pourcentage','pourcent','10000000-0000-0000-0000-000000000002')$$,'23514',null,'pourcentage NULL refusé');
select throws_ok($$insert into public.colors_seaux(entreprise_id,marque,produit,mode_quantite,quantite_nominale,unite,created_by) values('a0000000-0000-0000-0000-000000000001','X','Sans restant','volume',10,'l','10000000-0000-0000-0000-000000000002')$$,'23514',null,'quantité restante NULL refusée');
select lives_ok($$select public.colors_creer_analyse_ocr('a0000000-0000-0000-0000-000000000001','c0200000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001/c0200000-0000-0000-0000-000000000001/ocr.jpg')$$,'proposition OCR A créée à confirmer');
select throws_ok($$select public.colors_creer_analyse_ocr('a0000000-0000-0000-0000-000000000001','d0200000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001/d0200000-0000-0000-0000-000000000001/ocr.jpg')$$,'P0001','Seau OCR Colors invalide','OCR cross-tenant par UUID refusé');

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claim.email','chef-equipe-a@invalid.local',true);
select ok(public.colors_action_autorisee('a0000000-0000-0000-0000-000000000001','mouvement'),'utilisateur dépôt peut mouvementer');
select lives_ok($$select public.colors_deplacer_seau('c0200000-0000-0000-0000-000000000001','c0100000-0000-0000-0000-000000000002','Vers camion')$$,'utilisateur dépôt déplace le seau');
select is((select emplacement_id from public.colors_seaux where id='c0200000-0000-0000-0000-000000000001'),'c0100000-0000-0000-0000-000000000002'::uuid,'nouvel emplacement conservé');
select lives_ok($$select public.colors_changer_etat('c0200000-0000-0000-0000-000000000001','ouvert','Première utilisation')$$,'utilisateur dépôt ouvre le seau');
select ok((select date_ouverture is not null from public.colors_seaux where id='c0200000-0000-0000-0000-000000000001'),'date ouverture renseignée');
select is((select count(*) from public.colors_mouvements where seau_id='c0200000-0000-0000-0000-000000000001'),4::bigint,'déplacement et ouverture historisés');
select throws_ok($$update public.colors_seaux set notes='Tentative dépôt' where id='c0200000-0000-0000-0000-000000000001'$$,'42501',null,'update direct dépôt refusé');
select isnt((select notes from public.colors_seaux where id='c0200000-0000-0000-0000-000000000001'),'Tentative dépôt','dépôt ne modifie pas les métadonnées');

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
select set_config('request.jwt.claim.email','conducteur-a@invalid.local',true);
select is((select count(*) from public.colors_seaux),1::bigint,'consultation lit le stock A');
select ok(not public.colors_action_autorisee('a0000000-0000-0000-0000-000000000001','mouvement'),'consultation ne mouvemente pas');
select throws_ok($$select public.colors_ajuster_quantite('c0200000-0000-0000-0000-000000000001',1,'ajustement',null)$$,'P0001','Accès Colors refusé','RPC refuse la consultation');

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',true);
select set_config('request.jwt.claim.email','comptable-a@invalid.local',true);
select is((select count(*) from public.colors_seaux),0::bigint,'utilisateur sans Colors ne voit rien');

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claim.email','ouvrier-a@invalid.local',true);
select lives_ok($$insert into storage.objects(id,bucket_id,name,metadata) values('c0300000-0000-0000-0000-000000000001','colors-seaux','a0000000-0000-0000-0000-000000000001/c0200000-0000-0000-0000-000000000001/photo.jpg','{"mimetype":"image/jpeg","size":1024}')$$,'photo privée A ajoutée');
select is((select count(*) from storage.objects where bucket_id='colors-seaux'),1::bigint,'A voit sa photo');
select lives_ok($$select public.colors_definir_photo('c0200000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001/c0200000-0000-0000-0000-000000000001/photo.jpg')$$,'photo associée par action métier');
select is((select photo_principale_path from public.colors_seaux where id='c0200000-0000-0000-0000-000000000001'),'a0000000-0000-0000-0000-000000000001/c0200000-0000-0000-0000-000000000001/photo.jpg','chemin photo privé conservé');

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','admin-b@invalid.local',true);
select is((select count(*) from public.colors_seaux),1::bigint,'B voit uniquement son seau');
select is((select count(*) from storage.objects where bucket_id='colors-seaux'),0::bigint,'B ne voit pas la photo A');
select throws_ok($$select public.colors_ajuster_quantite('c0200000-0000-0000-0000-000000000001',1,'ajustement',null)$$,'P0001','Accès Colors refusé','RPC refuse explicitement le UUID du tenant A à B');

reset role; set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claim.email','ouvrier-a@invalid.local',true);
select lives_ok($$select public.colors_archiver_seau('c0200000-0000-0000-0000-000000000001',true,'Fin de stock')$$,'gestionnaire archive');
select is((select etat from public.colors_seaux where id='c0200000-0000-0000-0000-000000000001'),'archive','seau archivé conservé');
select is((select count(*) from public.colors_mouvements where seau_id='c0200000-0000-0000-0000-000000000001'),5::bigint,'historique conservé après archivage');
select lives_ok($$select public.colors_archiver_seau('c0200000-0000-0000-0000-000000000001',false,'Retour stock')$$,'gestionnaire restaure');
select is((select etat from public.colors_seaux where id='c0200000-0000-0000-0000-000000000001'),'ferme','seau restauré actif');

reset role;
select * from finish();
rollback;
