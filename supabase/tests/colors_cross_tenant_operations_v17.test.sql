begin;
create extension if not exists pgtap with schema extensions;
select plan(79);

-- COLORS V17 — Cloisonnement inter-tenant de TOUTES les opérations Colors.
--
-- L'attaquant est l'administrateur Colors de l'organisation B : le rôle le plus
-- privilégié d'un tenant légitime (toutes les actions Colors lui sont ouvertes chez lui).
-- Il connaît tous les UUID de l'organisation A (seau, emplacements, analyse OCR, chemins
-- Storage) — le pire cas d'une fuite d'identifiants. Pour chaque opération :
--   1. l'appel de B sur un objet A est refusé (exception métier, 0 ligne, ou filtrage RLS) ;
--   2. l'état de A est relu côté service et prouvé inchangé ;
--   3. un témoin positif prouve que l'opération fonctionne pour son propriétaire, pour que
--      le refus ne puisse pas s'expliquer par une opération cassée.

create function pg_temp.en_tant_que(p uuid) returns text language sql as $$
  select set_config('role','authenticated',true) || set_config('request.jwt.claim.sub',p::text,true)
$$;
create function pg_temp.en_service() returns text language sql as $$
  select set_config('role','postgres',true) || set_config('request.jwt.claim.sub','',true)
$$;
-- Nombre de lignes réellement atteintes par une écriture. Un refus de privilège (42501)
-- compte pour 0 : le test reste valide que la couche qui arrête l'écriture soit le GRANT
-- (harnais local) ou la policy RLS (Supabase réel, où storage.objects est GRANT ALL).
create function pg_temp.lignes_atteintes(p_sql text) returns integer language plpgsql as $$
declare n integer;
begin
  execute p_sql; get diagnostics n = row_count; return n;
exception when insufficient_privilege then return 0;
end $$;

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','17000000-0000-0000-0000-000000000001','authenticated','authenticated','admin-a17@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
('00000000-0000-0000-0000-000000000000','17000000-0000-0000-0000-000000000002','authenticated','authenticated','admin-b17@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now())
on conflict(id) do nothing;
insert into public.utilisateurs(id,prenom,nom) values
('17000000-0000-0000-0000-000000000001','Admin','A17'),('17000000-0000-0000-0000-000000000002','Admin','B17')
on conflict(id) do update set prenom=excluded.prenom,nom=excluded.nom;
insert into public.entreprises(id,nom,code_adhesion) values
('a7000000-0000-0000-0000-000000000001','Colors A17','COLA0017'),
('b7000000-0000-0000-0000-000000000001','Colors B17','COLB0017') on conflict(id) do nothing;
insert into public.postes(id,entreprise_id,nom) values
('a7100000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000001','Colors A17'),
('b7100000-0000-0000-0000-000000000001','b7000000-0000-0000-0000-000000000001','Colors B17') on conflict(id) do nothing;
insert into public.utilisateurs_entreprises(utilisateur_id,entreprise_id,poste_id,statut) values
('17000000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000001','a7100000-0000-0000-0000-000000000001','actif'),
('17000000-0000-0000-0000-000000000002','b7000000-0000-0000-0000-000000000001','b7100000-0000-0000-0000-000000000001','actif') on conflict do nothing;
insert into public.acces_applications_entreprises(entreprise_id,application_code,autorise,source) values
('a7000000-0000-0000-0000-000000000001','colors',true,'test'),('b7000000-0000-0000-0000-000000000001','colors',true,'test');
insert into public.habilitations_applications_utilisateurs(entreprise_id,utilisateur_id,application_code,role_code) values
('a7000000-0000-0000-0000-000000000001','17000000-0000-0000-0000-000000000001','colors','colors_admin_organisation'),
('b7000000-0000-0000-0000-000000000001','17000000-0000-0000-0000-000000000002','colors','colors_admin_organisation');

insert into public.colors_emplacements(id,entreprise_id,nom,type,created_by) values
('a7110000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000001','Dépôt A17','depot','17000000-0000-0000-0000-000000000001'),
('a7110000-0000-0000-0000-000000000002','a7000000-0000-0000-0000-000000000001','Camion A17','vehicule','17000000-0000-0000-0000-000000000001'),
('b7110000-0000-0000-0000-000000000001','b7000000-0000-0000-0000-000000000001','Dépôt B17','depot','17000000-0000-0000-0000-000000000002');
insert into public.colors_seaux(id,entreprise_id,emplacement_id,marque,produit,teinte_nom,mode_quantite,quantite_nominale,quantite_restante,unite,notes,created_by) values
('a7200000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000001','a7110000-0000-0000-0000-000000000001','Marque A','Produit A','Blanc A','volume',10,8,'l','Note A','17000000-0000-0000-0000-000000000001'),
('b7200000-0000-0000-0000-000000000001','b7000000-0000-0000-0000-000000000001','b7110000-0000-0000-0000-000000000001','Marque B','Produit B','Bleu B','volume',10,6,'l','Note B','17000000-0000-0000-0000-000000000002');
insert into public.colors_parametres(entreprise_id,seuil_stock_faible_pourcent,updated_by) values
('a7000000-0000-0000-0000-000000000001',20,'17000000-0000-0000-0000-000000000001');
insert into storage.objects(id,bucket_id,name,metadata) values
('a7300000-0000-0000-0000-000000000001','colors-seaux','a7000000-0000-0000-0000-000000000001/a7200000-0000-0000-0000-000000000001/photo.jpg','{"mimetype":"image/jpeg","size":1024}'),
('a7300000-0000-0000-0000-000000000002','colors-seaux','a7000000-0000-0000-0000-000000000001/a7200000-0000-0000-0000-000000000001/ocr.jpg','{"mimetype":"image/jpeg","size":1024}'),
('a7300000-0000-0000-0000-000000000003','colors-seaux','a7000000-0000-0000-0000-000000000001/a7200000-0000-0000-0000-000000000001/orpheline.jpg','{"mimetype":"image/jpeg","size":1024}'),
('b7300000-0000-0000-0000-000000000001','colors-seaux','b7000000-0000-0000-0000-000000000001/b7200000-0000-0000-0000-000000000001/photo.jpg','{"mimetype":"image/jpeg","size":1024}');
update public.colors_seaux set photo_principale_path='a7000000-0000-0000-0000-000000000001/a7200000-0000-0000-0000-000000000001/photo.jpg'
 where id='a7200000-0000-0000-0000-000000000001';
insert into public.colors_analyses_ocr(id,entreprise_id,seau_id,photo_path,statut,resultat,created_by) values
('a7400000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000001/a7200000-0000-0000-0000-000000000001/ocr.jpg','a_confirmer','{}','17000000-0000-0000-0000-000000000001'),
('a7400000-0000-0000-0000-000000000002','a7000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000001/a7200000-0000-0000-0000-000000000001/ocr.jpg','a_confirmer','{}','17000000-0000-0000-0000-000000000001');
insert into public.colors_nettoyages_photos(entreprise_id,seau_id,photo_path,statut,tentatives) values
('a7000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000001/a7200000-0000-0000-0000-000000000001/orpheline.jpg','a_nettoyer',1);

-- Empreinte de l'état A avant toute tentative, relue à la fin.
create temp table empreinte_a as
select (select row_to_json(s)::text from public.colors_seaux s where s.id='a7200000-0000-0000-0000-000000000001') seau,
       (select string_agg(row_to_json(e)::text,'|' order by e.id) from public.colors_emplacements e where e.entreprise_id='a7000000-0000-0000-0000-000000000001') emplacements,
       (select count(*) from public.colors_mouvements where entreprise_id='a7000000-0000-0000-0000-000000000001') mouvements,
       (select string_agg(row_to_json(o)::text,'|' order by o.id) from public.colors_analyses_ocr o where o.entreprise_id='a7000000-0000-0000-0000-000000000001') ocr,
       (select row_to_json(p)::text from public.colors_parametres p where p.entreprise_id='a7000000-0000-0000-0000-000000000001') parametres,
       (select string_agg(row_to_json(n)::text,'|' order by n.id) from public.colors_nettoyages_photos n where n.entreprise_id='a7000000-0000-0000-0000-000000000001') nettoyages,
       (select count(*) from storage.objects where name like 'a7000000-0000-0000-0000-000000000001/%') objets;
grant select on empreinte_a to authenticated;

-- ============================================================================
-- 1. Décision d'accès : B n'a aucun droit Colors sur A.
-- ============================================================================
select pg_temp.en_tant_que('17000000-0000-0000-0000-000000000002');
select is(public.colors_role_courant('a7000000-0000-0000-0000-000000000001'),null,'décision · B n''a aucun rôle Colors sur A');
select ok(not public.a_acces_application('a7000000-0000-0000-0000-000000000001','colors'),'décision · a_acces_application(A) faux pour B');
select is((select count(*) from unnest(array['voir','voir_fiche','ajouter_seau','mouvement','ocr','modifier_seau','archiver','restaurer','gerer_emplacements','exporter','gerer_parametres']) a where public.colors_action_autorisee('a7000000-0000-0000-0000-000000000001',a)),0::bigint,'décision · aucune des 11 actions Colors autorisée à B sur A');
select is((select count(*) from unnest(array['voir','voir_fiche','ajouter_seau','mouvement','ocr','modifier_seau','archiver','restaurer','gerer_emplacements','exporter','gerer_parametres']) a where public.colors_action_autorisee('b7000000-0000-0000-0000-000000000001',a)),11::bigint,'témoin · les 11 actions autorisées à B chez lui');

-- ============================================================================
-- 2. Lecture directe (RLS) — les 6 tables et Storage.
-- ============================================================================
select is((select count(*) from public.colors_seaux where entreprise_id='a7000000-0000-0000-0000-000000000001'),0::bigint,'lecture · seaux A invisibles');
select is((select count(*) from public.colors_seaux where id='a7200000-0000-0000-0000-000000000001'),0::bigint,'lecture · seau A invisible même par UUID');
select is((select count(*) from public.colors_emplacements where entreprise_id='a7000000-0000-0000-0000-000000000001'),0::bigint,'lecture · emplacements A invisibles');
select is((select count(*) from public.colors_mouvements where entreprise_id='a7000000-0000-0000-0000-000000000001'),0::bigint,'lecture · mouvements A invisibles');
select is((select count(*) from public.colors_parametres where entreprise_id='a7000000-0000-0000-0000-000000000001'),0::bigint,'lecture · paramètres A invisibles');
select is((select count(*) from public.colors_analyses_ocr where entreprise_id='a7000000-0000-0000-0000-000000000001'),0::bigint,'lecture · analyses OCR A invisibles');
select throws_ok($$select count(*) from public.colors_nettoyages_photos$$,'42501',null,'lecture · file de nettoyage non exposée en lecture directe (aucun privilège)');
select is((select count(*) from storage.objects where name like 'a7000000-0000-0000-0000-000000000001/%'),0::bigint,'lecture · objets Storage A invisibles');
select is((select count(*) from public.colors_seaux),1::bigint,'témoin · B voit son propre seau');
select is((select count(*) from storage.objects where bucket_id='colors-seaux'),1::bigint,'témoin · B voit sa propre photo');

-- ============================================================================
-- 3. RPC de lecture.
-- ============================================================================
select throws_like($$select * from public.colors_statistiques('a7000000-0000-0000-0000-000000000001')$$,'%Accès Colors refusé%','RPC lecture · statistiques A refusées');
select throws_like($$select * from public.colors_activite_recente('a7000000-0000-0000-0000-000000000001')$$,'%Accès Colors refusé%','RPC lecture · historique A refusé');
select throws_like($$select * from public.colors_activite_recente('a7000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001')$$,'%Accès Colors refusé%','RPC lecture · historique du seau A refusé');
select is((select count(*) from public.colors_activite_recente('b7000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001')),0::bigint,'RPC lecture · historique B filtré sur un seau A : 0 ligne');
select throws_like($$select * from public.colors_acteurs_activite('a7000000-0000-0000-0000-000000000001')$$,'%Accès Colors refusé%','RPC lecture · acteurs A refusés');
select is((select count(*) from public.colors_nettoyages_photos_seau('a7200000-0000-0000-0000-000000000001')),0::bigint,'RPC lecture · suivi nettoyage du seau A : 0 ligne');
select lives_ok($$select * from public.colors_statistiques('b7000000-0000-0000-0000-000000000001')$$,'témoin · statistiques B autorisées');

-- ============================================================================
-- 4. RPC d'écriture sur le seau A.
-- ============================================================================
select throws_like($$select public.colors_ajuster_quantite('a7200000-0000-0000-0000-000000000001',1,'consommation','B')$$,'%Accès Colors refusé%','écriture · ajuster quantité A refusé');
select throws_like($$select public.colors_changer_etat('a7200000-0000-0000-0000-000000000001','ouvert','B')$$,'%Accès Colors refusé%','écriture · changer état A refusé');
select throws_like($$select public.colors_archiver_seau('a7200000-0000-0000-0000-000000000001',true,'B')$$,'%Accès Colors refusé%','écriture · archiver A refusé');
select throws_like($$select public.colors_archiver_seau('a7200000-0000-0000-0000-000000000001',false,'B')$$,'%Accès Colors refusé%','écriture · restaurer A refusé');
select throws_like($$select public.colors_modifier_seau('a7200000-0000-0000-0000-000000000001','Pirate','Pirate',null,null,null,null,'B')$$,'%Accès Colors refusé%','écriture · modifier fiche A refusé');
select throws_like($$select public.colors_definir_finition('a7200000-0000-0000-0000-000000000001','brillant')$$,'%Accès Colors refusé%','écriture · définir finition A refusé');
select throws_like($$select public.colors_definir_reference_nuancier('a7200000-0000-0000-0000-000000000001','RAL 9010',0.5,true)$$,'%Accès Colors refusé%','écriture · définir référence nuancier A refusé');
select throws_like($$select public.colors_definir_photo('a7200000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000001/a7200000-0000-0000-0000-000000000001/ocr.jpg')$$,'%Accès Colors refusé%','écriture · définir photo A refusé');
select throws_like($$select public.colors_definir_photo('b7200000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000001/a7200000-0000-0000-0000-000000000001/photo.jpg')$$,'%','écriture · rattacher une photo A au seau B refusé');
select throws_like($$select public.colors_deplacer_seau('a7200000-0000-0000-0000-000000000001','a7110000-0000-0000-0000-000000000002','B')$$,'%Accès Colors refusé%','écriture · déplacer seau A dans A refusé');
select throws_like($$select public.colors_deplacer_seau('a7200000-0000-0000-0000-000000000001','b7110000-0000-0000-0000-000000000001','B')$$,'%Accès Colors refusé%','écriture · déplacer seau A vers B refusé');
select throws_like($$select public.colors_deplacer_seau('b7200000-0000-0000-0000-000000000001','a7110000-0000-0000-0000-000000000001','B')$$,'%','écriture · déplacer seau B vers un emplacement A refusé');
select throws_like($$select public.colors_enregistrer_parametres('a7000000-0000-0000-0000-000000000001',90)$$,'%Accès Colors refusé%','écriture · paramètres A refusés');

-- ============================================================================
-- 5. OCR et nettoyage de photos.
-- ============================================================================
select throws_like($$select public.colors_creer_analyse_ocr('a7000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000001/a7200000-0000-0000-0000-000000000001/ocr.jpg')$$,'%','OCR · créer une analyse dans A refusé');
select throws_like($$select public.colors_creer_analyse_ocr('b7000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000001/a7200000-0000-0000-0000-000000000001/ocr.jpg')$$,'%','OCR · créer dans B une analyse pointant le seau et la photo A refusé');
select throws_like($$select public.colors_confirmer_analyse_ocr('a7400000-0000-0000-0000-000000000001','{"marque":"Pirate"}')$$,'%Accès Colors refusé%','OCR · confirmer analyse A refusé');
select throws_like($$select public.colors_rejeter_analyse_ocr('a7400000-0000-0000-0000-000000000002','B')$$,'%Accès Colors refusé%','OCR · rejeter analyse A refusé');
select throws_like($$select public.colors_signaler_nettoyage_photo('a7200000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000001/a7200000-0000-0000-0000-000000000001/ocr.jpg','B')$$,'%Accès Colors refusé%','nettoyage · signaler sur A refusé');
select throws_like($$select public.colors_resoudre_nettoyage_photo('a7200000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000001/a7200000-0000-0000-0000-000000000001/orpheline.jpg')$$,'%','nettoyage · résoudre sur A refusé');

-- ============================================================================
-- 6. Écriture directe sur les tables (contournement des RPC).
-- ============================================================================
select throws_ok($$insert into public.colors_seaux(entreprise_id,marque,produit,mode_quantite,pourcentage_saisi,unite,created_by) values('a7000000-0000-0000-0000-000000000001','X','X','pourcentage',50,'pourcent','17000000-0000-0000-0000-000000000002')$$,null,null,'direct · insert seau dans A refusé');
select throws_ok($$insert into public.colors_seaux(entreprise_id,emplacement_id,marque,produit,mode_quantite,pourcentage_saisi,unite,created_by) values('b7000000-0000-0000-0000-000000000001','a7110000-0000-0000-0000-000000000001','X','X','pourcentage',50,'pourcent','17000000-0000-0000-0000-000000000002')$$,null,null,'direct · insert seau B rangé dans un emplacement A refusé');
select is(pg_temp.lignes_atteintes($$update public.colors_seaux set notes='Pirate' where id='a7200000-0000-0000-0000-000000000001'$$),0,'direct · update seau A : 0 ligne atteinte');
select is(pg_temp.lignes_atteintes($$delete from public.colors_seaux where id='a7200000-0000-0000-0000-000000000001'$$),0,'direct · delete seau A : 0 ligne atteinte');
select throws_ok($$insert into public.colors_emplacements(entreprise_id,nom,type,created_by) values('a7000000-0000-0000-0000-000000000001','Pirate','depot','17000000-0000-0000-0000-000000000002')$$,null,null,'direct · insert emplacement dans A refusé');
select throws_ok($$insert into public.colors_emplacements(entreprise_id,parent_id,nom,type,created_by) values('b7000000-0000-0000-0000-000000000001','a7110000-0000-0000-0000-000000000001','Enfant pirate','depot','17000000-0000-0000-0000-000000000002')$$,null,null,'direct · emplacement B rattaché à un parent A refusé');
select is(pg_temp.lignes_atteintes($$update public.colors_emplacements set nom='Pirate' where id='a7110000-0000-0000-0000-000000000001'$$),0,'direct · update emplacement A : 0 ligne atteinte');
select throws_ok($$update public.colors_emplacements set entreprise_id='a7000000-0000-0000-0000-000000000001' where id='b7110000-0000-0000-0000-000000000001'$$,null,null,'direct · transfert d''un emplacement B vers A refusé');
select throws_ok($$insert into public.colors_mouvements(entreprise_id,seau_id,type,auteur_id) values('a7000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','consommation','17000000-0000-0000-0000-000000000002')$$,null,null,'direct · insert mouvement dans A refusé');
select throws_ok($$insert into public.colors_parametres(entreprise_id,seuil_stock_faible_pourcent) values('a7000000-0000-0000-0000-000000000001',99) on conflict(entreprise_id) do update set seuil_stock_faible_pourcent=99$$,null,null,'direct · upsert paramètres A refusé');
select throws_ok($$insert into public.colors_analyses_ocr(entreprise_id,seau_id,photo_path,statut) values('a7000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000001/a7200000-0000-0000-0000-000000000001/ocr.jpg','confirmee')$$,null,null,'direct · insert analyse OCR dans A refusé');
select is(pg_temp.lignes_atteintes($$update public.colors_analyses_ocr set statut='confirmee' where id='a7400000-0000-0000-0000-000000000001'$$),0,'direct · update analyse OCR A : 0 ligne atteinte');
select throws_ok($$insert into public.colors_nettoyages_photos(entreprise_id,seau_id,photo_path) values('a7000000-0000-0000-0000-000000000001','a7200000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000001/a7200000-0000-0000-0000-000000000001/x.jpg')$$,null,null,'direct · insert file de nettoyage A refusé');

-- ============================================================================
-- 7. Storage direct (policies storage.objects).
-- ============================================================================
select throws_ok($$insert into storage.objects(id,bucket_id,name,metadata) values('b7300000-0000-0000-0000-000000000099','colors-seaux','a7000000-0000-0000-0000-000000000001/a7200000-0000-0000-0000-000000000001/pirate.jpg','{"mimetype":"image/jpeg","size":10}')$$,null,null,'Storage · upload sous le préfixe A refusé');
select throws_ok($$insert into storage.objects(id,bucket_id,name,metadata) values('b7300000-0000-0000-0000-000000000098','colors-seaux','b7000000-0000-0000-0000-000000000001/a7200000-0000-0000-0000-000000000001/pirate.jpg','{"mimetype":"image/jpeg","size":10}')$$,null,null,'Storage · upload sous préfixe B pointant un seau A refusé');
select is(pg_temp.lignes_atteintes($$delete from storage.objects where name='a7000000-0000-0000-0000-000000000001/a7200000-0000-0000-0000-000000000001/photo.jpg'$$),0,'Storage · delete photo A : 0 ligne atteinte');
select is(pg_temp.lignes_atteintes($$update storage.objects set name='b7000000-0000-0000-0000-000000000001/b7200000-0000-0000-0000-000000000001/vol.jpg' where name='a7000000-0000-0000-0000-000000000001/a7200000-0000-0000-0000-000000000001/photo.jpg'$$),0,'Storage · renommage d''une photo A vers B : 0 ligne atteinte');

-- ============================================================================
-- 8. Vérification côté service : A strictement inchangé.
-- ============================================================================
select pg_temp.en_service();
select is((select row_to_json(s)::text from public.colors_seaux s where s.id='a7200000-0000-0000-0000-000000000001'),(select seau from empreinte_a),'intégrité · seau A identique octet pour octet');
select is((select string_agg(row_to_json(e)::text,'|' order by e.id) from public.colors_emplacements e where e.entreprise_id='a7000000-0000-0000-0000-000000000001'),(select emplacements from empreinte_a),'intégrité · emplacements A identiques');
select is((select count(*) from public.colors_mouvements where entreprise_id='a7000000-0000-0000-0000-000000000001'),(select mouvements from empreinte_a),'intégrité · aucun mouvement ajouté à A');
select is((select string_agg(row_to_json(o)::text,'|' order by o.id) from public.colors_analyses_ocr o where o.entreprise_id='a7000000-0000-0000-0000-000000000001'),(select ocr from empreinte_a),'intégrité · analyses OCR A identiques');
select is((select row_to_json(p)::text from public.colors_parametres p where p.entreprise_id='a7000000-0000-0000-0000-000000000001'),(select parametres from empreinte_a),'intégrité · paramètres A identiques');
select is((select string_agg(row_to_json(n)::text,'|' order by n.id) from public.colors_nettoyages_photos n where n.entreprise_id='a7000000-0000-0000-0000-000000000001'),(select nettoyages from empreinte_a),'intégrité · file de nettoyage A identique');
select is((select count(*) from storage.objects where name like 'a7000000-0000-0000-0000-000000000001/%'),(select objets from empreinte_a),'intégrité · objets Storage A intacts');
select is((select count(*) from public.colors_analyses_ocr where seau_id='a7200000-0000-0000-0000-000000000001' and entreprise_id<>'a7000000-0000-0000-0000-000000000001'),0::bigint,'intégrité · aucune analyse d''un autre tenant ne pointe le seau A');
select is((select count(*) from public.colors_seaux where entreprise_id='b7000000-0000-0000-0000-000000000001'),1::bigint,'intégrité · aucun seau parasite créé dans B');
select is((select emplacement_id from public.colors_seaux where id='b7200000-0000-0000-0000-000000000001'),'b7110000-0000-0000-0000-000000000001'::uuid,'intégrité · seau B jamais rangé dans un emplacement A');
select is((select photo_principale_path from public.colors_seaux where id='b7200000-0000-0000-0000-000000000001'),null,'intégrité · aucune photo A rattachée au seau B');
select is((select count(*) from storage.objects where name like '%pirate%' or name like '%vol.jpg'),0::bigint,'intégrité · aucun objet Storage pirate');

-- ============================================================================
-- 9. Témoins positifs : chaque opération refusée à B fonctionne pour A.
-- ============================================================================
select pg_temp.en_tant_que('17000000-0000-0000-0000-000000000001');
select lives_ok($$select public.colors_ajuster_quantite('a7200000-0000-0000-0000-000000000001',7,'consommation','A')$$,'témoin A · ajuster');
select lives_ok($$select public.colors_changer_etat('a7200000-0000-0000-0000-000000000001','ouvert','A')$$,'témoin A · changer état');
select lives_ok($$select public.colors_modifier_seau('a7200000-0000-0000-0000-000000000001','Marque A2','Produit A',null,'Blanc A',null,null,'Note A')$$,'témoin A · modifier fiche');
select lives_ok($$select public.colors_definir_finition('a7200000-0000-0000-0000-000000000001','satine')$$,'témoin A · finition');
select lives_ok($$select public.colors_deplacer_seau('a7200000-0000-0000-0000-000000000001','a7110000-0000-0000-0000-000000000002','A')$$,'témoin A · déplacer');
select lives_ok($$select public.colors_enregistrer_parametres('a7000000-0000-0000-0000-000000000001',25)$$,'témoin A · paramètres');
select lives_ok($$select public.colors_confirmer_analyse_ocr('a7400000-0000-0000-0000-000000000001','{"marque":"Marque A"}')$$,'témoin A · confirmer OCR');
select lives_ok($$select public.colors_rejeter_analyse_ocr('a7400000-0000-0000-0000-000000000002','A')$$,'témoin A · rejeter OCR');
select lives_ok($$select public.colors_archiver_seau('a7200000-0000-0000-0000-000000000001',true,'A')$$,'témoin A · archiver');
select is((select count(*) from public.colors_activite_recente('a7000000-0000-0000-0000-000000000001'))>0,true,'témoin A · historique lisible et alimenté');

reset role;
select * from finish();
rollback;
