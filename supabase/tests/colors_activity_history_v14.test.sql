begin;
create extension if not exists pgtap with schema extensions;
select plan(47);
-- V1.4 — traçabilité produit Colors : ajout, tri par date, modification champ
-- par champ, corbeille, restauration, filtres, utilisateur, multi-tenant,
-- pagination et droits. Les refus sont vérifiés par leur effet observable
-- (opération refusée + absence de mutation), pas par un SQLSTATE exact.

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','41000000-0000-0000-0000-000000000014','authenticated','authenticated','v14-a@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
('00000000-0000-0000-0000-000000000000','42000000-0000-0000-0000-000000000014','authenticated','authenticated','v14-b@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
('00000000-0000-0000-0000-000000000000','43000000-0000-0000-0000-000000000014','authenticated','authenticated','v14-c@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()) on conflict(id) do nothing;
insert into public.utilisateurs(id,prenom,nom) values
('41000000-0000-0000-0000-000000000014','Ada','Gestion'),
('42000000-0000-0000-0000-000000000014','Bruno','Autre'),
('43000000-0000-0000-0000-000000000014','Cléa','Lecture') on conflict(id) do update set prenom=excluded.prenom, nom=excluded.nom;
insert into public.entreprises(id,nom,code_adhesion) values
('ac000000-0000-0000-0000-000000000014','V14 A','V14A0014'),
('bc000000-0000-0000-0000-000000000014','V14 B','V14B0014') on conflict(id) do nothing;
insert into public.postes(id,entreprise_id,nom) values
('ac100000-0000-0000-0000-000000000014','ac000000-0000-0000-0000-000000000014','V14 A'),
('bc100000-0000-0000-0000-000000000014','bc000000-0000-0000-0000-000000000014','V14 B') on conflict(id) do nothing;
insert into public.utilisateurs_entreprises(utilisateur_id,entreprise_id,poste_id,statut) values
('41000000-0000-0000-0000-000000000014','ac000000-0000-0000-0000-000000000014','ac100000-0000-0000-0000-000000000014','actif'),
('43000000-0000-0000-0000-000000000014','ac000000-0000-0000-0000-000000000014','ac100000-0000-0000-0000-000000000014','actif'),
('42000000-0000-0000-0000-000000000014','bc000000-0000-0000-0000-000000000014','bc100000-0000-0000-0000-000000000014','actif') on conflict do nothing;
insert into public.acces_applications_entreprises(entreprise_id,application_code,autorise,source) values
('ac000000-0000-0000-0000-000000000014','colors',true,'test'),
('bc000000-0000-0000-0000-000000000014','colors',true,'test');
insert into public.habilitations_applications_utilisateurs(entreprise_id,utilisateur_id,application_code,role_code) values
('ac000000-0000-0000-0000-000000000014','41000000-0000-0000-0000-000000000014','colors','colors_admin_organisation'),
('ac000000-0000-0000-0000-000000000014','43000000-0000-0000-0000-000000000014','colors','colors_consultation'),
('bc000000-0000-0000-0000-000000000014','42000000-0000-0000-0000-000000000014','colors','colors_admin_organisation');
insert into public.colors_emplacements(id,entreprise_id,nom,type,created_by) values
('ac200000-0000-0000-0000-000000000014','ac000000-0000-0000-0000-000000000014','Dépôt A','depot','41000000-0000-0000-0000-000000000014'),
('ac210000-0000-0000-0000-000000000014','ac000000-0000-0000-0000-000000000014','Camion A','vehicule','41000000-0000-0000-0000-000000000014'),
('bc200000-0000-0000-0000-000000000014','bc000000-0000-0000-0000-000000000014','Dépôt B','depot','42000000-0000-0000-0000-000000000014');
insert into storage.objects(id,bucket_id,name,metadata) values
('ac400000-0000-0000-0000-000000000014','colors-seaux','ac000000-0000-0000-0000-000000000014/ac300000-0000-0000-0000-000000000014/photo.jpg','{"mimetype":"image/jpeg","size":2048}');

-- 1. Ajout : le seau est créé et journalisé -----------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-000000000014',true);

select lives_ok($$insert into public.colors_seaux(id,entreprise_id,emplacement_id,marque,produit,teinte_nom,mode_quantite,quantite_nominale,quantite_restante,unite,etat,notes)
  values('ac300000-0000-0000-0000-000000000014','ac000000-0000-0000-0000-000000000014','ac200000-0000-0000-0000-000000000014','Zolpan','Mat Velours','Blanc Cassé','volume',10,10,'l','ferme','Note initiale')$$,'ajout d’un seau par un gestionnaire');
select lives_ok($$insert into public.colors_seaux(id,entreprise_id,emplacement_id,marque,produit,mode_quantite,quantite_nominale,quantite_restante,unite,etat)
  values('ac310000-0000-0000-0000-000000000014','ac000000-0000-0000-0000-000000000014','ac210000-0000-0000-0000-000000000014','Tollens','Satin','volume',5,5,'l','ferme')$$,'ajout d’un second seau');
select is((select type from public.colors_mouvements where seau_id='ac300000-0000-0000-0000-000000000014'),'entree','l’ajout produit un événement « entree »');
select isnt((select created_at from public.colors_seaux where id='ac300000-0000-0000-0000-000000000014'),null,'date d’ajout renseignée');
select is((select created_by from public.colors_seaux where id='ac300000-0000-0000-0000-000000000014'),'41000000-0000-0000-0000-000000000014'::uuid,'auteur de l’ajout renseigné');

-- 2. Tri par date d’ajout : index dédié et ordre effectif ---------------------
reset role;
select has_index('public','colors_seaux','colors_seaux_ajout_idx','index de tri par date d’ajout');
select has_index('public','colors_mouvements','colors_mouvements_activite_idx','index de l’activité chronologique globale');
select is((select array_agg(id order by created_at desc, id desc) from public.colors_seaux where entreprise_id='ac000000-0000-0000-0000-000000000014')[1],
  'ac310000-0000-0000-0000-000000000014'::uuid,'le dernier seau ajouté sort en tête du tri par date d’ajout décroissante');

-- 3. Modification : ancienne → nouvelle valeur --------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-000000000014',true);
select lives_ok($$select public.colors_modifier_seau('ac300000-0000-0000-0000-000000000014','Zolpan','Mat Velours Premium',null,'Blanc Pur',null,'#F2EFEA','Note corrigée')$$,'modification descriptive acceptée');
select is((select count(*) from public.colors_mouvements where seau_id='ac300000-0000-0000-0000-000000000014' and type='modification'),1::bigint,'la modification est journalisée');
select is((select champs_modifies->0->>'champ' from public.colors_mouvements where seau_id='ac300000-0000-0000-0000-000000000014' and type='modification'),'produit','premier champ modifié identifié');
select is((select champs_modifies->0->>'avant' from public.colors_mouvements where seau_id='ac300000-0000-0000-0000-000000000014' and type='modification'),'Mat Velours','ancienne valeur conservée');
select is((select champs_modifies->0->>'apres' from public.colors_mouvements where seau_id='ac300000-0000-0000-0000-000000000014' and type='modification'),'Mat Velours Premium','nouvelle valeur conservée');
select is((select jsonb_array_length(champs_modifies) from public.colors_mouvements where seau_id='ac300000-0000-0000-0000-000000000014' and type='modification'),4,'seuls les champs réellement changés sont journalisés');
select is((select updated_by from public.colors_seaux where id='ac300000-0000-0000-0000-000000000014'),'41000000-0000-0000-0000-000000000014'::uuid,'auteur de la dernière modification renseigné');
select lives_ok($$select public.colors_modifier_seau('ac300000-0000-0000-0000-000000000014','Zolpan','Mat Velours Premium',null,'Blanc Pur',null,'#F2EFEA','Note corrigée')$$,'modification sans changement acceptée');
select is((select count(*) from public.colors_mouvements where seau_id='ac300000-0000-0000-0000-000000000014' and type='modification'),1::bigint,'une modification sans changement ne pollue pas le journal');

-- Les notes longues sont tronquées : le journal reste un journal.
select lives_ok($$select public.colors_modifier_seau('ac300000-0000-0000-0000-000000000014','Zolpan','Mat Velours Premium',null,'Blanc Pur',null,'#F2EFEA',repeat('x',900))$$,'modification avec note longue acceptée');
select is((select length(champs_modifies->0->>'apres') from public.colors_mouvements where seau_id='ac300000-0000-0000-0000-000000000014' and type='modification' and champs_modifies->0->>'champ'='notes'),201,'la valeur journalisée est tronquée');

-- 4. Photo : journalisée par nom de fichier seulement -------------------------
select lives_ok($$select public.colors_definir_photo('ac300000-0000-0000-0000-000000000014','ac000000-0000-0000-0000-000000000014/ac300000-0000-0000-0000-000000000014/photo.jpg')$$,'photo principale définie');
select is((select champs_modifies->0->>'apres' from public.colors_mouvements where seau_id='ac300000-0000-0000-0000-000000000014' and type='photo'),'photo.jpg','le journal photo ne retient que le nom du fichier');
select is((select count(*) from public.colors_mouvements where type='photo' and champs_modifies::text like '%ac000000-0000-0000-0000-000000000014/%'),0::bigint,'aucun chemin Storage complet dans le journal');

-- 5. Suppression : aucune suppression physique, corbeille et restauration -----
select throws_ok($$delete from public.colors_seaux where id='ac310000-0000-0000-0000-000000000014'$$,null,null,'suppression physique d’un produit refusée');
select is((select count(*) from public.colors_seaux where id='ac310000-0000-0000-0000-000000000014'),1::bigint,'le produit visé par la suppression est intact');
select lives_ok($$select public.colors_archiver_seau('ac310000-0000-0000-0000-000000000014',true,'erreur de saisie')$$,'mise à la corbeille (archivage)');
select is((select etat from public.colors_seaux where id='ac310000-0000-0000-0000-000000000014'),'archive','le produit est dans la corbeille');
select lives_ok($$select public.colors_archiver_seau('ac310000-0000-0000-0000-000000000014',false,'restauration')$$,'restauration depuis la corbeille');
select is((select etat from public.colors_seaux where id='ac310000-0000-0000-0000-000000000014'),'ferme','le produit retrouve son état antérieur');

-- 6. Activité récente : contenu, utilisateur, filtres, pagination -------------
select ok((select count(*) from public.colors_activite_recente('ac000000-0000-0000-0000-000000000014')) >= 7,'l’activité récente agrège tous les événements de l’organisation');
select is((select auteur_nom from public.colors_activite_recente('ac000000-0000-0000-0000-000000000014') limit 1),'Ada Gestion','l’auteur de l’événement est nommé');
select is((select count(*) from public.colors_activite_recente('ac000000-0000-0000-0000-000000000014',null,null,array['modification'])),2::bigint,'filtre par type « modifications »');
select is((select count(*) from public.colors_activite_recente('ac000000-0000-0000-0000-000000000014',null,null,array['archivage','restauration'])),2::bigint,'filtre par type « suppressions / restaurations »');
select is((select count(*) from public.colors_activite_recente('ac000000-0000-0000-0000-000000000014',null,now()+interval '1 hour')),0::bigint,'filtre de période « depuis »');
select ok((select count(*) from public.colors_activite_recente('ac000000-0000-0000-0000-000000000014',null,now()-interval '1 day')) >= 7,'filtre de période 24 h');
select is((select count(*) from public.colors_activite_recente('ac000000-0000-0000-0000-000000000014',null,null,null,'42000000-0000-0000-0000-000000000014')),0::bigint,'filtre par utilisateur d’une autre organisation : aucun événement');
select is((select count(*) from public.colors_activite_recente('ac000000-0000-0000-0000-000000000014',null,null,null,null,'ac210000-0000-0000-0000-000000000014')),3::bigint,'filtre par emplacement');
select is((select count(*) from public.colors_activite_recente('ac000000-0000-0000-0000-000000000014','ac300000-0000-0000-0000-000000000014')),4::bigint,'historique d’un produit donné');
select is((select count(*) from public.colors_activite_recente('ac000000-0000-0000-0000-000000000014',null,null,null,null,null,3)),3::bigint,'pagination : première page bornée');
select is((select count(*) from public.colors_activite_recente('ac000000-0000-0000-0000-000000000014',null,null,null,null,null,100,
    (select created_at from public.colors_activite_recente('ac000000-0000-0000-0000-000000000014',null,null,null,null,null,3) order by created_at, id limit 1),
    (select id from public.colors_activite_recente('ac000000-0000-0000-0000-000000000014',null,null,null,null,null,3) order by created_at, id limit 1))
  where type is not null) > 0,true,'pagination : le curseur rend la page suivante');
select is((select count(*) from public.colors_acteurs_activite('ac000000-0000-0000-0000-000000000014')),1::bigint,'la liste des acteurs se limite au journal de l’organisation');

-- 7. Multi-tenant et droits ---------------------------------------------------
select set_config('request.jwt.claim.sub','43000000-0000-0000-0000-000000000014',true);
select ok((select count(*) from public.colors_activite_recente('ac000000-0000-0000-0000-000000000014')) >= 7,'un rôle consultation lit l’activité de son organisation');

select set_config('request.jwt.claim.sub','42000000-0000-0000-0000-000000000014',true);
select throws_like($$select * from public.colors_activite_recente('ac000000-0000-0000-0000-000000000014')$$,'%Accès Colors refusé%','activité cloisonnée entre organisations');
select is((select count(*) from public.colors_activite_recente('bc000000-0000-0000-0000-000000000014','ac300000-0000-0000-0000-000000000014')),0::bigint,'un seau d’une autre organisation ne fuit pas via p_seau_id');
select throws_like($$select * from public.colors_acteurs_activite('ac000000-0000-0000-0000-000000000014')$$,'%Accès Colors refusé%','liste des acteurs cloisonnée entre organisations');

-- 8. Journal append-only : rien n’est forgeable -------------------------------
select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-000000000014',true);
select throws_ok($$insert into public.colors_mouvements(entreprise_id,seau_id,type,auteur_id,champs_modifies) values('ac000000-0000-0000-0000-000000000014','ac300000-0000-0000-0000-000000000014','modification','41000000-0000-0000-0000-000000000014','[{"champ":"marque","avant":"x","apres":"y"}]')$$,null,null,'écriture directe d’un événement refusée');
select throws_ok($$update public.colors_mouvements set champs_modifies=null where seau_id='ac300000-0000-0000-0000-000000000014'$$,null,null,'réécriture du journal refusée');

reset role; set local role service_role;
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select * from public.colors_activite_recente('ac000000-0000-0000-0000-000000000014')$$,null,null,'service_role ne lit pas l’activité Colors');

select * from finish();
rollback;
