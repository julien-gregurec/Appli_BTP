begin;
create extension if not exists pgtap with schema extensions;
select plan(90);

-- COLORS V16 — Suspension d'application.
--
-- Couvre le seul domaine Colors à zéro preuve (GAP ANALYSIS V1, §3 ligne 16) :
--   A. entitlement entreprise `autorise = false`
--   B. entitlement entreprise `valide_jusqu_au` expiré / `valide_du` futur
--   C. entitlement entreprise absent (ligne supprimée)
--   D. tenant suspendu (`abonnement_statut` suspendu / annulé, `suspension_prevue_at` échue)
--   E. suspension au niveau utilisateur (habilitation, appartenance) et application globale
--   F. tentatives d'auto-réactivation par l'utilisateur suspendu
--
-- « Session déjà ouverte » : l'utilisateur ne se reconnecte JAMAIS entre les phases. Ses
-- claims JWT (request.jwt.claim.sub) restent posés à l'identique ; seul le service (rôle
-- postgres, équivalent service_role) bascule l'entitlement. Chaque assertion prouve donc
-- qu'une suspension prend effet à la requête suivante, sans reconnexion ni rafraîchissement
-- de jeton — RLS, RPC et Storage recalculent l'accès à chaque appel.
--
-- Refus vérifiés par le comportement observable (0 ligne visible, exception, absence de
-- mutation) et non par un SQLSTATE précis, comme les suites Colors V1.3+.

create function pg_temp.en_tant_que(p uuid) returns text language sql as $$
  select set_config('role','authenticated',true) || set_config('request.jwt.claim.sub',p::text,true)
$$;
create function pg_temp.en_service() returns text language sql as $$
  select set_config('role','postgres',true) || set_config('request.jwt.claim.sub','',true)
$$;

-- Fixture : S = entreprise qui sera suspendue, T = entreprise témoin jamais touchée.
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','15000000-0000-0000-0000-000000000001','authenticated','authenticated','admin-s@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
('00000000-0000-0000-0000-000000000000','15000000-0000-0000-0000-000000000002','authenticated','authenticated','gestion-s@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
('00000000-0000-0000-0000-000000000000','16000000-0000-0000-0000-000000000001','authenticated','authenticated','admin-t@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now())
on conflict(id) do nothing;
insert into public.utilisateurs(id,prenom,nom) values
('15000000-0000-0000-0000-000000000001','Admin','S'),
('15000000-0000-0000-0000-000000000002','Gestion','S'),
('16000000-0000-0000-0000-000000000001','Admin','T')
on conflict(id) do update set prenom=excluded.prenom,nom=excluded.nom;
insert into public.entreprises(id,nom,code_adhesion,abonnement_statut) values
('e5000000-0000-0000-0000-000000000001','Entreprise Colors S','COLS0016','actif'),
('e6000000-0000-0000-0000-000000000001','Entreprise Colors T','COLT0016','actif')
on conflict(id) do nothing;
insert into public.postes(id,entreprise_id,nom) values
('e5100000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001','Colors S'),
('e6100000-0000-0000-0000-000000000001','e6000000-0000-0000-0000-000000000001','Colors T')
on conflict(id) do nothing;
insert into public.postes(id,entreprise_id,nom) values
('e5100000-0000-0000-0000-000000000002','e5000000-0000-0000-0000-000000000001','Direction S')
on conflict(id) do nothing;
insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise) values
('e5000000-0000-0000-0000-000000000001','e5100000-0000-0000-0000-000000000002','gerer_parametres',true);
insert into public.utilisateurs_entreprises(utilisateur_id,entreprise_id,poste_id,statut) values
('15000000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001','e5100000-0000-0000-0000-000000000002','actif'),
('15000000-0000-0000-0000-000000000002','e5000000-0000-0000-0000-000000000001','e5100000-0000-0000-0000-000000000001','actif'),
('16000000-0000-0000-0000-000000000001','e6000000-0000-0000-0000-000000000001','e6100000-0000-0000-0000-000000000001','actif')
on conflict do nothing;
update public.utilisateurs set entreprise_active_id='e5000000-0000-0000-0000-000000000001'
  where id in ('15000000-0000-0000-0000-000000000001','15000000-0000-0000-0000-000000000002');
update public.utilisateurs set entreprise_active_id='e6000000-0000-0000-0000-000000000001'
  where id='16000000-0000-0000-0000-000000000001';

insert into public.acces_applications_entreprises(entreprise_id,application_code,autorise,source) values
('e5000000-0000-0000-0000-000000000001','colors',true,'test'),
('e6000000-0000-0000-0000-000000000001','colors',true,'test');
insert into public.habilitations_applications_utilisateurs(entreprise_id,utilisateur_id,application_code,role_code) values
('e5000000-0000-0000-0000-000000000001','15000000-0000-0000-0000-000000000001','colors','colors_admin_organisation'),
('e5000000-0000-0000-0000-000000000001','15000000-0000-0000-0000-000000000002','colors','colors_gestionnaire_stock'),
('e6000000-0000-0000-0000-000000000001','16000000-0000-0000-0000-000000000001','colors','colors_admin_organisation');

insert into public.colors_emplacements(id,entreprise_id,nom,type,created_by) values
('e5110000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001','Dépôt S','depot','15000000-0000-0000-0000-000000000001'),
('e5110000-0000-0000-0000-000000000002','e5000000-0000-0000-0000-000000000001','Camion S','vehicule','15000000-0000-0000-0000-000000000001'),
('e6110000-0000-0000-0000-000000000001','e6000000-0000-0000-0000-000000000001','Dépôt T','depot','16000000-0000-0000-0000-000000000001');
insert into public.colors_seaux(id,entreprise_id,emplacement_id,marque,produit,teinte_nom,mode_quantite,quantite_nominale,quantite_restante,unite,created_by) values
('e5200000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000001','e5110000-0000-0000-0000-000000000001','Marque S','Produit S','Blanc S','volume',10,8,'l','15000000-0000-0000-0000-000000000001'),
('e6200000-0000-0000-0000-000000000001','e6000000-0000-0000-0000-000000000001','e6110000-0000-0000-0000-000000000001','Marque T','Produit T','Bleu T','volume',10,6,'l','16000000-0000-0000-0000-000000000001');
insert into storage.objects(id,bucket_id,name,metadata) values
('e5300000-0000-0000-0000-000000000001','colors-seaux','e5000000-0000-0000-0000-000000000001/e5200000-0000-0000-0000-000000000001/photo.jpg','{"mimetype":"image/jpeg","size":1024}'),
('e6300000-0000-0000-0000-000000000001','colors-seaux','e6000000-0000-0000-0000-000000000001/e6200000-0000-0000-0000-000000000001/photo.jpg','{"mimetype":"image/jpeg","size":1024}');

-- ============================================================================
-- 0. Référence : session ouverte du gestionnaire S, tout est accessible.
-- ============================================================================
select pg_temp.en_tant_que('15000000-0000-0000-0000-000000000002');
select ok(public.a_acces_application('e5000000-0000-0000-0000-000000000001','colors'),'0 · a_acces_application vrai avant suspension');
select is(public.colors_role_courant('e5000000-0000-0000-0000-000000000001'),'colors_gestionnaire_stock','0 · rôle Colors résolu avant suspension');
select is((select count(*) from public.colors_seaux),1::bigint,'0 · gestionnaire S voit son seau');
select is((select count(*) from public.colors_emplacements),2::bigint,'0 · gestionnaire S voit ses emplacements');
select is((select count(*) from storage.objects where bucket_id='colors-seaux'),1::bigint,'0 · gestionnaire S voit sa photo Storage');
select lives_ok($$select public.colors_ajuster_quantite('e5200000-0000-0000-0000-000000000001',7,'consommation','Réf')$$,'0 · écriture RPC autorisée avant suspension');

-- ============================================================================
-- A. Entitlement entreprise autorise = false — SANS reconnexion.
-- ============================================================================
select pg_temp.en_service();
update public.acces_applications_entreprises set autorise=false
 where entreprise_id='e5000000-0000-0000-0000-000000000001' and application_code='colors';
select pg_temp.en_tant_que('15000000-0000-0000-0000-000000000002');

select ok(not public.a_acces_application('e5000000-0000-0000-0000-000000000001','colors'),'A · a_acces_application faux dès la requête suivante');
select is(public.colors_role_courant('e5000000-0000-0000-0000-000000000001'),null,'A · rôle Colors retiré au niveau SQL');
select ok(not public.colors_action_autorisee('e5000000-0000-0000-0000-000000000001','voir'),'A · action voir refusée');
select is((select count(*) from public.colors_seaux),0::bigint,'A · RLS seaux : 0 ligne');
select is((select count(*) from public.colors_emplacements),0::bigint,'A · RLS emplacements : 0 ligne');
select is((select count(*) from public.colors_mouvements),0::bigint,'A · RLS mouvements : 0 ligne');
select is((select count(*) from storage.objects where bucket_id='colors-seaux'),0::bigint,'A · RLS Storage : 0 objet');
select throws_like($$select * from public.colors_statistiques('e5000000-0000-0000-0000-000000000001')$$,'%Accès Colors refusé%','A · RPC lecture statistiques refusée');
select throws_like($$select public.colors_ajuster_quantite('e5200000-0000-0000-0000-000000000001',1,'consommation','Suspendu')$$,'%Accès Colors refusé%','A · RPC écriture ajuster refusée');
select throws_like($$select public.colors_deplacer_seau('e5200000-0000-0000-0000-000000000001','e5110000-0000-0000-0000-000000000002','Suspendu')$$,'%Accès Colors refusé%','A · RPC déplacer refusée');
select throws_ok($$insert into public.colors_seaux(entreprise_id,marque,produit,mode_quantite,pourcentage_saisi,unite,created_by) values('e5000000-0000-0000-0000-000000000001','X','X','pourcentage',50,'pourcent','15000000-0000-0000-0000-000000000002')$$,null,null,'A · insert direct seau refusé');
select ok(exists(select 1 from public.contexte_application_courant() where entreprise_id='e5000000-0000-0000-0000-000000000001'),'A · appartenance conservée : le shell peut router vers abonnement-requis (pas appartenance)');
-- Auto-réactivation par l'utilisateur suspendu : aucune écriture possible sur l'entitlement.
select throws_ok($$update public.acces_applications_entreprises set autorise=true where entreprise_id='e5000000-0000-0000-0000-000000000001'$$,null,null,'A · auto-réactivation update entitlement refusée');
select throws_ok($$insert into public.habilitations_applications_utilisateurs(entreprise_id,utilisateur_id,application_code,role_code) values('e6000000-0000-0000-0000-000000000001','15000000-0000-0000-0000-000000000002','colors','colors_admin_organisation')$$,null,null,'A · auto-attribution habilitation refusée');
select pg_temp.en_service();
select is((select quantite_restante from public.colors_seaux where id='e5200000-0000-0000-0000-000000000001'),7::numeric,'A · aucune mutation pendant la suspension');
select ok(not (select autorise from public.acces_applications_entreprises where entreprise_id='e5000000-0000-0000-0000-000000000001' and application_code='colors'),'A · entitlement toujours suspendu');
select pg_temp.en_tant_que('16000000-0000-0000-0000-000000000001');
select is((select count(*) from public.colors_seaux),1::bigint,'A · témoin T non affecté par la suspension de S');
select lives_ok($$select public.colors_ajuster_quantite('e6200000-0000-0000-0000-000000000001',5,'consommation','Témoin')$$,'A · témoin T écrit normalement');

-- Rétablissement — toujours sans reconnexion.
select pg_temp.en_service();
update public.acces_applications_entreprises set autorise=true
 where entreprise_id='e5000000-0000-0000-0000-000000000001' and application_code='colors';
select pg_temp.en_tant_que('15000000-0000-0000-0000-000000000002');
select ok(public.a_acces_application('e5000000-0000-0000-0000-000000000001','colors'),'A↺ · accès rétabli sans reconnexion');
select is((select count(*) from public.colors_seaux),1::bigint,'A↺ · RLS seaux rétablie');
select is((select count(*) from storage.objects where bucket_id='colors-seaux'),1::bigint,'A↺ · Storage rétabli');
select lives_ok($$select public.colors_ajuster_quantite('e5200000-0000-0000-0000-000000000001',6,'consommation','Rétabli')$$,'A↺ · écriture rétablie');

-- ============================================================================
-- B. valide_jusqu_au expiré, puis valide_du futur.
-- ============================================================================
select pg_temp.en_service();
update public.acces_applications_entreprises set valide_du=now()-interval '30 days', valide_jusqu_au=now()-interval '1 second'
 where entreprise_id='e5000000-0000-0000-0000-000000000001' and application_code='colors';
select pg_temp.en_tant_que('15000000-0000-0000-0000-000000000002');
select ok(not public.a_acces_application('e5000000-0000-0000-0000-000000000001','colors'),'B · valide_jusqu_au échu : accès faux');
select is(public.colors_role_courant('e5000000-0000-0000-0000-000000000001'),null,'B · valide_jusqu_au échu : rôle retiré');
select is((select count(*) from public.colors_seaux),0::bigint,'B · valide_jusqu_au échu : RLS seaux 0');
select is((select count(*) from storage.objects where bucket_id='colors-seaux'),0::bigint,'B · valide_jusqu_au échu : Storage 0');
select throws_like($$select public.colors_ajuster_quantite('e5200000-0000-0000-0000-000000000001',1,'consommation','Échu')$$,'%Accès Colors refusé%','B · valide_jusqu_au échu : écriture refusée');
select throws_like($$select * from public.colors_activite_recente('e5000000-0000-0000-0000-000000000001')$$,'%Accès Colors refusé%','B · valide_jusqu_au échu : historique refusé');

select pg_temp.en_service();
update public.acces_applications_entreprises set valide_jusqu_au=now()+interval '1 day'
 where entreprise_id='e5000000-0000-0000-0000-000000000001' and application_code='colors';
select pg_temp.en_tant_que('15000000-0000-0000-0000-000000000002');
select ok(public.a_acces_application('e5000000-0000-0000-0000-000000000001','colors'),'B↺ · échéance prolongée : accès rétabli');
select is((select count(*) from public.colors_seaux),1::bigint,'B↺ · échéance prolongée : seaux visibles');

select pg_temp.en_service();
update public.acces_applications_entreprises set valide_du=now()+interval '1 hour', valide_jusqu_au=now()+interval '30 days'
 where entreprise_id='e5000000-0000-0000-0000-000000000001' and application_code='colors';
select pg_temp.en_tant_que('15000000-0000-0000-0000-000000000002');
select ok(not public.a_acces_application('e5000000-0000-0000-0000-000000000001','colors'),'B · valide_du futur : accès pas encore ouvert');
select is((select count(*) from public.colors_seaux),0::bigint,'B · valide_du futur : RLS seaux 0');

select pg_temp.en_service();
update public.acces_applications_entreprises set valide_du=null, valide_jusqu_au=null
 where entreprise_id='e5000000-0000-0000-0000-000000000001' and application_code='colors';

-- ============================================================================
-- C. Entitlement absent.
-- ============================================================================
delete from public.acces_applications_entreprises
 where entreprise_id='e5000000-0000-0000-0000-000000000001' and application_code='colors';
select pg_temp.en_tant_que('15000000-0000-0000-0000-000000000002');
select ok(not public.a_acces_application('e5000000-0000-0000-0000-000000000001','colors'),'C · entitlement absent : accès faux');
select is(public.colors_role_courant('e5000000-0000-0000-0000-000000000001'),null,'C · entitlement absent : rôle retiré malgré habilitation intacte');
select is((select count(*) from public.colors_seaux),0::bigint,'C · entitlement absent : RLS seaux 0');
select is((select count(*) from public.colors_emplacements),0::bigint,'C · entitlement absent : RLS emplacements 0');
select is((select count(*) from storage.objects where bucket_id='colors-seaux'),0::bigint,'C · entitlement absent : Storage 0');
select throws_like($$select public.colors_archiver_seau('e5200000-0000-0000-0000-000000000001',true,'Absent')$$,'%Accès Colors refusé%','C · entitlement absent : archiver refusé');
select throws_ok($$insert into public.acces_applications_entreprises(entreprise_id,application_code,autorise) values('e5000000-0000-0000-0000-000000000001','colors',true)$$,null,null,'C · auto-création d''entitlement refusée');
select pg_temp.en_service();
select is((select count(*) from public.acces_applications_entreprises where entreprise_id='e5000000-0000-0000-0000-000000000001' and application_code='colors'),0::bigint,'C · aucun entitlement créé par l''utilisateur');
insert into public.acces_applications_entreprises(entreprise_id,application_code,autorise,source)
values('e5000000-0000-0000-0000-000000000001','colors',true,'test');
select pg_temp.en_tant_que('15000000-0000-0000-0000-000000000002');
select ok(public.a_acces_application('e5000000-0000-0000-0000-000000000001','colors'),'C↺ · entitlement recréé : accès rétabli');

-- ============================================================================
-- D. Tenant suspendu (abonnement entreprise).
-- ============================================================================
select pg_temp.en_service();
update public.entreprises set abonnement_statut='suspendu' where id='e5000000-0000-0000-0000-000000000001';
select pg_temp.en_tant_que('15000000-0000-0000-0000-000000000002');
select ok(not public.a_acces_application('e5000000-0000-0000-0000-000000000001','colors'),'D · tenant suspendu : accès faux (entitlement pourtant autorisé)');
select is(public.colors_role_courant('e5000000-0000-0000-0000-000000000001'),null,'D · tenant suspendu : rôle retiré');
select is((select count(*) from public.colors_seaux),0::bigint,'D · tenant suspendu : RLS seaux 0');
select is((select count(*) from storage.objects where bucket_id='colors-seaux'),0::bigint,'D · tenant suspendu : Storage 0');
select throws_like($$select public.colors_ajuster_quantite('e5200000-0000-0000-0000-000000000001',1,'consommation','Tenant suspendu')$$,'%Accès Colors refusé%','D · tenant suspendu : écriture refusée');
select pg_temp.en_tant_que('15000000-0000-0000-0000-000000000001');
select throws_like($$select public.colors_enregistrer_parametres('e5000000-0000-0000-0000-000000000001',30)$$,'%Accès Colors refusé%','D · tenant suspendu : admin organisation ne peut plus paramétrer');
select pg_temp.en_tant_que('16000000-0000-0000-0000-000000000001');
select is((select count(*) from public.colors_seaux),1::bigint,'D · témoin T non affecté');

select pg_temp.en_service();
update public.entreprises set abonnement_statut='annule' where id='e5000000-0000-0000-0000-000000000001';
select pg_temp.en_tant_que('15000000-0000-0000-0000-000000000002');
select ok(not public.a_acces_application('e5000000-0000-0000-0000-000000000001','colors'),'D · tenant annulé : accès faux');
select is((select count(*) from public.colors_seaux),0::bigint,'D · tenant annulé : RLS seaux 0');

select pg_temp.en_service();
update public.entreprises set abonnement_statut='actif', suspension_prevue_at=now()-interval '1 minute' where id='e5000000-0000-0000-0000-000000000001';
select pg_temp.en_tant_que('15000000-0000-0000-0000-000000000002');
select ok(not public.a_acces_application('e5000000-0000-0000-0000-000000000001','colors'),'D · suspension programmée échue : accès faux');
select is((select count(*) from public.colors_seaux),0::bigint,'D · suspension programmée échue : RLS seaux 0');

select pg_temp.en_service();
update public.entreprises set suspension_prevue_at=now()+interval '7 days', impaye_signale_at=now(), impaye_message='Règlement non reçu' where id='e5000000-0000-0000-0000-000000000001';
select pg_temp.en_tant_que('15000000-0000-0000-0000-000000000002');
select ok(public.a_acces_application('e5000000-0000-0000-0000-000000000001','colors'),'D · suspension programmée future : accès maintenu');
select is((select count(*) from public.colors_seaux),1::bigint,'D · suspension programmée future : seaux visibles');
-- Préavis d'impayé en cours : un membre ne peut pas annuler sa propre suspension programmée.
-- Le gestionnaire (sans gerer_parametres) est filtré par RLS (0 ligne) ; l'admin S, qui
-- détient gerer_parametres côté Gestion Pro, est arrêté par proteger_facturation_entreprise
-- (migration 20260923000330 — avant elle, UPDATE 1 et suspension annulée).
-- Convergence avec le train canonique : 20260923000332 retire l'UPDATE de colonne aux rôles
-- d'API, le gestionnaire reçoit donc un refus franc (42501) au lieu d'un filtrage à 0 ligne.
-- La garantie est plus forte, pas plus faible ; l'état est revérifié ci-dessous.
select throws_ok($$update public.entreprises set suspension_prevue_at=null where id='e5000000-0000-0000-0000-000000000001'$$,'42501',null,'D · gestionnaire : update suspension refusé (colonnes commerciales verrouillées)');
select pg_temp.en_tant_que('15000000-0000-0000-0000-000000000001');
select ok(public.a_permission('e5000000-0000-0000-0000-000000000001','gerer_parametres'),'D · admin S détient bien gerer_parametres (précondition du contournement)');
select throws_ok($$update public.entreprises set suspension_prevue_at=null where id='e5000000-0000-0000-0000-000000000001'$$,'42501',null,'D · admin tenant ne peut pas annuler sa suspension programmée');
select throws_ok($$update public.entreprises set impaye_signale_at=null, impaye_message=null where id='e5000000-0000-0000-0000-000000000001'$$,'42501',null,'D · admin tenant ne peut pas effacer l''avertissement d''impayé');
select lives_ok($$update public.entreprises set ville='Strasbourg' where id='e5000000-0000-0000-0000-000000000001'$$,'D · admin tenant garde la main sur ses paramètres non facturation');
select pg_temp.en_service();
select ok((select suspension_prevue_at is not null from public.entreprises where id='e5000000-0000-0000-0000-000000000001'),'D · suspension programmée toujours en place');

select pg_temp.en_service();
update public.entreprises set abonnement_statut='actif', suspension_prevue_at=null, impaye_signale_at=null, impaye_message=null where id='e5000000-0000-0000-0000-000000000001';
select pg_temp.en_tant_que('15000000-0000-0000-0000-000000000002');
select ok(public.a_acces_application('e5000000-0000-0000-0000-000000000001','colors'),'D↺ · tenant réactivé : accès rétabli');
select lives_ok($$select public.colors_ajuster_quantite('e5200000-0000-0000-0000-000000000001',5,'consommation','Tenant réactivé')$$,'D↺ · tenant réactivé : écriture rétablie');

-- ============================================================================
-- E. Suspension utilisateur, appartenance, application globale.
-- ============================================================================
select pg_temp.en_service();
update public.habilitations_applications_utilisateurs set autorise=false
 where entreprise_id='e5000000-0000-0000-0000-000000000001' and utilisateur_id='15000000-0000-0000-0000-000000000002';
select pg_temp.en_tant_que('15000000-0000-0000-0000-000000000002');
select ok(not public.a_acces_application('e5000000-0000-0000-0000-000000000001','colors'),'E · habilitation utilisateur suspendue : accès faux');
select is((select count(*) from public.colors_seaux),0::bigint,'E · habilitation suspendue : RLS seaux 0');
select pg_temp.en_tant_que('15000000-0000-0000-0000-000000000001');
select is((select count(*) from public.colors_seaux),1::bigint,'E · collègue non suspendu conserve son accès');

select pg_temp.en_service();
update public.habilitations_applications_utilisateurs set autorise=true, valide_jusqu_au=now()-interval '1 second', valide_du=now()-interval '10 days'
 where entreprise_id='e5000000-0000-0000-0000-000000000001' and utilisateur_id='15000000-0000-0000-0000-000000000002';
select pg_temp.en_tant_que('15000000-0000-0000-0000-000000000002');
select ok(not public.a_acces_application('e5000000-0000-0000-0000-000000000001','colors'),'E · habilitation utilisateur échue : accès faux');
select is(public.colors_role_courant('e5000000-0000-0000-0000-000000000001'),null,'E · habilitation échue : rôle retiré');

select pg_temp.en_service();
update public.habilitations_applications_utilisateurs set valide_du=null, valide_jusqu_au=null
 where entreprise_id='e5000000-0000-0000-0000-000000000001' and utilisateur_id='15000000-0000-0000-0000-000000000002';
update public.utilisateurs_entreprises set statut='desactive'
 where entreprise_id='e5000000-0000-0000-0000-000000000001' and utilisateur_id='15000000-0000-0000-0000-000000000002';
select pg_temp.en_tant_que('15000000-0000-0000-0000-000000000002');
select ok(not public.a_acces_application('e5000000-0000-0000-0000-000000000001','colors'),'E · membre désactivé : accès faux');
select is((select count(*) from public.colors_seaux),0::bigint,'E · membre désactivé : RLS seaux 0');
select ok(not exists(select 1 from public.contexte_application_courant() where entreprise_id='e5000000-0000-0000-0000-000000000001'),'E · membre désactivé : contexte vide (shell → appartenance)');

select pg_temp.en_service();
update public.utilisateurs_entreprises set statut='actif'
 where entreprise_id='e5000000-0000-0000-0000-000000000001' and utilisateur_id='15000000-0000-0000-0000-000000000002';
update public.applications_elsatia set actif=false where code='colors';
select pg_temp.en_tant_que('15000000-0000-0000-0000-000000000002');
select ok(not public.a_acces_application('e5000000-0000-0000-0000-000000000001','colors'),'E · application Colors désactivée globalement : accès faux');
select is((select count(*) from public.colors_seaux),0::bigint,'E · application désactivée : RLS seaux 0');
select pg_temp.en_tant_que('16000000-0000-0000-0000-000000000001');
select is((select count(*) from public.colors_seaux),0::bigint,'E · application désactivée : témoin T aussi coupé');

select pg_temp.en_service();
update public.applications_elsatia set actif=true where code='colors';
select pg_temp.en_tant_que('15000000-0000-0000-0000-000000000002');
select ok(public.a_acces_application('e5000000-0000-0000-0000-000000000001','colors'),'E↺ · tout rétabli : accès vrai');

-- ============================================================================
-- F. Suspension de S, puis tentatives de T et de S l'un sur l'autre.
-- ============================================================================
select pg_temp.en_service();
update public.acces_applications_entreprises set autorise=false
 where entreprise_id='e5000000-0000-0000-0000-000000000001' and application_code='colors';
select pg_temp.en_tant_que('16000000-0000-0000-0000-000000000001');
select is((select count(*) from public.colors_seaux where entreprise_id='e5000000-0000-0000-0000-000000000001'),0::bigint,'F · T ne voit jamais les seaux de S');
select throws_like($$select public.colors_ajuster_quantite('e5200000-0000-0000-0000-000000000001',1,'consommation','T sur S')$$,'%Accès Colors refusé%','F · T ne peut pas écrire sur S');
select throws_like($$select public.colors_deplacer_seau('e6200000-0000-0000-0000-000000000001','e5110000-0000-0000-0000-000000000001','Vers S')$$,'%%','F · T ne peut pas déplacer vers un emplacement de S');
select pg_temp.en_tant_que('15000000-0000-0000-0000-000000000001');
select is((select count(*) from public.colors_seaux),0::bigint,'F · admin S suspendu ne voit rien (ni S ni T)');
select throws_like($$select public.colors_ajuster_quantite('e6200000-0000-0000-0000-000000000001',1,'consommation','S sur T')$$,'%Accès Colors refusé%','F · admin S suspendu ne peut pas écrire sur T');
select throws_like($$select * from public.colors_statistiques('e6000000-0000-0000-0000-000000000001')$$,'%Accès Colors refusé%','F · admin S suspendu ne lit pas les statistiques de T');
select pg_temp.en_service();
select is((select quantite_restante from public.colors_seaux where id='e6200000-0000-0000-0000-000000000001'),5::numeric,'F · seau T inchangé');
select is((select emplacement_id from public.colors_seaux where id='e6200000-0000-0000-0000-000000000001'),'e6110000-0000-0000-0000-000000000001'::uuid,'F · emplacement T inchangé');
select is((select quantite_restante from public.colors_seaux where id='e5200000-0000-0000-0000-000000000001'),5::numeric,'F · seau S inchangé depuis la dernière écriture légitime');
select is((select count(*) from public.colors_mouvements where seau_id='e5200000-0000-0000-0000-000000000001' and motif in ('Suspendu','Échu','Absent','Tenant suspendu','T sur S')),0::bigint,'F · aucun mouvement créé par une tentative refusée');

reset role;
select * from finish();
rollback;
