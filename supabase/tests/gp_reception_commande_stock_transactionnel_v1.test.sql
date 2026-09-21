-- GP-PILOT — Réception commande fournisseur → stock, moteur transactionnel unique.
-- Couvre les 14 scénarios métier demandés pour la qualification du correctif
-- COMMANDE_STOCK_FLOW_WORKING, plus la convergence du parcours scan et les
-- contrôles de sécurité (owner/grants/security definer/search_path/anon) des
-- fonctions créées ou modifiées par 20260922000318. La concurrence réelle
-- (deux sessions Postgres simultanées) ne peut pas être testée dans un seul
-- fichier pgTAP (une seule transaction) : elle est vérifiée séparément par un
-- script utilisant deux connexions psql concurrentes, documenté dans
-- docs/qualification/ELSATIA_GP_COMMANDE_RECEPTION_STOCK_V1.md.
--
-- Convention de rôle dans ce fichier : les fixtures et la création des
-- commandes de test passent par role postgres et par les fonctions internes
-- non protégées (…_interne), pour ne pas mélanger la préparation des données
-- avec ce qui est réellement sous test. Chaque scénario bascule
-- explicitement vers `authenticated` avec le claim JWT de l'utilisateur
-- voulu juste avant d'appeler la fonction publique testée, puis revient à
-- postgres (`reset role`) avant la préparation du scénario suivant.
--
-- Chaque scénario utilise son propre article de stock dédié (jamais partagé
-- entre deux scénarios) : les assertions de stock sont donc des valeurs
-- absolues autoportantes, indépendantes de l'ordre d'exécution des autres
-- scénarios de ce fichier.

begin;
create extension if not exists pgtap with schema extensions;
select plan(65);

-- ─────────────────────────────────────────────────────────────
-- Fixtures : deux entreprises, un utilisateur avec droits d'achat, un
-- utilisateur sans droits, fournisseurs, un article de stock dédié par
-- scénario.
-- ─────────────────────────────────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('a1111111-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','achat-e1@test.local','x',now(),now(),now()),
  ('a1111111-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sans-droit-e1@test.local','x',now(),now(),now()),
  ('a2222222-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','achat-e2@test.local','x',now(),now(),now());

insert into public.entreprises (id, nom) values
  ('e1111111-0000-0000-0000-000000000001','GP Test Entreprise 1'),
  ('e2222222-0000-0000-0000-000000000002','GP Test Entreprise 2');

insert into public.postes (id, entreprise_id, nom) values
  ('90111111-0000-0000-0000-000000000001','e1111111-0000-0000-0000-000000000001','Achats'),
  ('90111111-0000-0000-0000-000000000002','e1111111-0000-0000-0000-000000000001','Sans droit'),
  ('90222222-0000-0000-0000-000000000001','e2222222-0000-0000-0000-000000000002','Achats E2');

-- 'acces_achats' conditionne la LECTURE de commandes_fournisseurs/
-- lignes_commande/fournisseurs (policy RLS restrictive dédiée, distincte de
-- 'gerer_achats' qui conditionne l'écriture) : sans elle, même le créateur
-- d'une commande ne peut pas la relire ensuite.
insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise) values
  ('e1111111-0000-0000-0000-000000000001','90111111-0000-0000-0000-000000000001','gerer_achats', true),
  ('e1111111-0000-0000-0000-000000000001','90111111-0000-0000-0000-000000000001','acces_achats', true),
  ('e1111111-0000-0000-0000-000000000001','90111111-0000-0000-0000-000000000001','effectuer_entree_stock', true),
  ('e2222222-0000-0000-0000-000000000002','90222222-0000-0000-0000-000000000001','gerer_achats', true),
  ('e2222222-0000-0000-0000-000000000002','90222222-0000-0000-0000-000000000001','acces_achats', true);

insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut) values
  ('a1111111-0000-0000-0000-000000000001','e1111111-0000-0000-0000-000000000001','90111111-0000-0000-0000-000000000001','actif'),
  ('a1111111-0000-0000-0000-000000000002','e1111111-0000-0000-0000-000000000001','90111111-0000-0000-0000-000000000002','actif'),
  ('a2222222-0000-0000-0000-000000000001','e2222222-0000-0000-0000-000000000002','90222222-0000-0000-0000-000000000001','actif');

insert into public.fournisseurs (id, entreprise_id, nom) values
  ('f1111111-0000-0000-0000-000000000001','e1111111-0000-0000-0000-000000000001','Fournisseur E1'),
  ('f2222222-0000-0000-0000-000000000002','e2222222-0000-0000-0000-000000000002','Fournisseur E2');

insert into public.articles_stock (id, entreprise_id, reference, designation, quantite_stock) values
  ('a1000000-0000-0000-0000-00000000a001','e1111111-0000-0000-0000-000000000001','ART-T1','Article scénario 1',0),
  ('a1000000-0000-0000-0000-00000000a002','e1111111-0000-0000-0000-000000000001','ART-T2','Article scénario 2',0),
  ('a1000000-0000-0000-0000-00000000a003','e1111111-0000-0000-0000-000000000001','ART-T3','Article scénario 3',0),
  ('a1000000-0000-0000-0000-00000000a004','e1111111-0000-0000-0000-000000000001','ART-T4','Article scénario 4',0),
  ('a1000000-0000-0000-0000-00000000a005','e1111111-0000-0000-0000-000000000001','ART-T5','Article scénario 5',0),
  ('a1000000-0000-0000-0000-00000000a006','e1111111-0000-0000-0000-000000000001','ART-T6','Article scénario 6',0),
  ('a1000000-0000-0000-0000-00000000a007','e1111111-0000-0000-0000-000000000001','ART-T7A','Article scénario 7 (ligne A)',0),
  ('a1000000-0000-0000-0000-00000000a008','e1111111-0000-0000-0000-000000000001','ART-T7B','Article scénario 7 (ligne B)',0),
  ('a1000000-0000-0000-0000-00000000a009','e1111111-0000-0000-0000-000000000001','ART-T14','Article scénario 14 (cohérence)',0),
  ('a1000000-0000-0000-0000-00000000a011','e1111111-0000-0000-0000-000000000001','ART-SCAN','Article scénario scan',0),
  ('a2000000-0000-0000-0000-00000000a001','e2222222-0000-0000-0000-000000000002','ART-E2-1','Article E2',0);

-- Helper (role postgres, contourne volontairement le contrôle de permission
-- de creer_commande_fournisseur — ce n'est pas ce qui est sous test ici) :
-- crée une commande E1 à une ligne, statut 'envoyee', article optionnellement
-- pré-lié, et retourne (commande_id, ligne_id).
create or replace function pg_temp.creer_commande_test(p_quantite numeric, p_article uuid)
returns table (commande_id uuid, ligne_id uuid) language plpgsql as $$
declare v_cmd uuid; v_lig uuid;
begin
  v_cmd := public.creer_commande_fournisseur_interne(
    'e1111111-0000-0000-0000-000000000001'::uuid,
    jsonb_build_object('fournisseur_id','f1111111-0000-0000-0000-000000000001'),
    jsonb_build_array(jsonb_build_object('designation','Ligne test','quantite',p_quantite,'unite','u','prix_unitaire_ht',1,'taux_tva',20,'ordre',1))
  );
  select id into v_lig from public.lignes_commande where lignes_commande.commande_id = v_cmd;
  if p_article is not null then
    update public.lignes_commande set article_id = p_article where id = v_lig;
  end if;
  perform public.changer_statut_commande_interne('e1111111-0000-0000-0000-000000000001'::uuid, v_cmd, 'envoyee');
  return query select v_cmd, v_lig;
end;
$$;

reset role;

-- ═════════════════════════════════════════════════════════════
-- 1) commande 10 / réception 10 (totale)
-- ═════════════════════════════════════════════════════════════
create temporary table t1 as select * from pg_temp.creer_commande_test(10, 'a1000000-0000-0000-0000-00000000a001');
grant select on t1 to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select public.enregistrer_reception_commande('e1111111-0000-0000-0000-000000000001'::uuid, commande_id,
     jsonb_build_array(jsonb_build_object('ligne_id', ligne_id, 'quantite_recue', 10))) from t1),
  'recue', '1) réception totale 10/10 renvoie le statut recue'
);
reset role;
select is((select quantite_recue from public.lignes_commande where id = (select ligne_id from t1)), 10::numeric,
  '1) quantite_recue = 10 après réception totale');
select is((select quantite_stock from public.articles_stock where id = 'a1000000-0000-0000-0000-00000000a001'), 10::numeric,
  '1) le stock de l''article est crédité de 10');
select is((select count(*)::int from public.mouvements_stock where ligne_commande_id = (select ligne_id from t1)), 1,
  '1) un seul mouvement de stock créé pour cette ligne');

-- ═════════════════════════════════════════════════════════════
-- 2) commande 10 / réception 4 puis 6 (deux réceptions partielles)
-- ═════════════════════════════════════════════════════════════
create temporary table t2 as select * from pg_temp.creer_commande_test(10, 'a1000000-0000-0000-0000-00000000a002');
grant select on t2 to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select public.enregistrer_reception_commande('e1111111-0000-0000-0000-000000000001'::uuid, commande_id,
     jsonb_build_array(jsonb_build_object('ligne_id', ligne_id, 'quantite_recue', 4))) from t2),
  'recue_partiel', '2) première réception partielle (4/10) => statut recue_partiel'
);
-- 12) statut partiellement reçue, explicitement.
select is((select statut from public.commandes_fournisseurs where id = (select commande_id from t2)), 'recue_partiel',
  '12) le statut de la commande est bien recue_partiel après une réception partielle');
select is((select quantite_stock from public.articles_stock where id = 'a1000000-0000-0000-0000-00000000a002'), 4::numeric,
  '2) stock après la première partielle (4)');
select is(
  (select public.enregistrer_reception_commande('e1111111-0000-0000-0000-000000000001'::uuid, commande_id,
     jsonb_build_array(jsonb_build_object('ligne_id', ligne_id, 'quantite_recue', 10))) from t2),
  'recue', '2) seconde réception (cible cumulée 10) complète la ligne => statut recue'
);
reset role;
-- 13) statut totalement reçue, explicitement.
select is((select statut from public.commandes_fournisseurs where id = (select commande_id from t2)), 'recue',
  '13) le statut de la commande est bien recue une fois toutes les lignes soldées');
select is((select quantite_stock from public.articles_stock where id = 'a1000000-0000-0000-0000-00000000a002'), 10::numeric,
  '2) stock après la seconde partielle (4 + 6 de delta = 10)');
select is((select count(*)::int from public.mouvements_stock where ligne_commande_id = (select ligne_id from t2)), 2,
  '2) exactement deux mouvements (4 puis 6), pas un mouvement de 10');

-- ═════════════════════════════════════════════════════════════
-- 3) tentative 4 puis 7 sur une ligne de 5 : la seconde doit être refusée
-- ═════════════════════════════════════════════════════════════
create temporary table t3 as select * from pg_temp.creer_commande_test(5, 'a1000000-0000-0000-0000-00000000a003');
grant select on t3 to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select public.enregistrer_reception_commande('e1111111-0000-0000-0000-000000000001'::uuid, commande_id,
     jsonb_build_array(jsonb_build_object('ligne_id', ligne_id, 'quantite_recue', 4))) from t3),
  'recue_partiel', '3) réception de 4/5 acceptée'
);
select throws_like(
  format($sql$select public.enregistrer_reception_commande('e1111111-0000-0000-0000-000000000001'::uuid, %L,
    jsonb_build_array(jsonb_build_object('ligne_id', %L, 'quantite_recue', 7)))$sql$,
    (select commande_id from t3), (select ligne_id from t3)),
  '%invalide%',
  '3) tentative de cible 7 sur une commande de 5 est rejetée'
);
reset role;
select is((select quantite_recue from public.lignes_commande where id = (select ligne_id from t3)), 4::numeric,
  '3) quantite_recue reste à 4 après le rejet (aucune écriture partielle)');
select is((select count(*)::int from public.mouvements_stock where ligne_commande_id = (select ligne_id from t3)), 1,
  '3) toujours un seul mouvement (celui de la réception de 4) après le rejet');

-- ═════════════════════════════════════════════════════════════
-- 4) double réception identique (rejeu exact, "double clic")
-- ═════════════════════════════════════════════════════════════
create temporary table t4 as select * from pg_temp.creer_commande_test(10, 'a1000000-0000-0000-0000-00000000a004');
grant select on t4 to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.enregistrer_reception_commande('e1111111-0000-0000-0000-000000000001'::uuid, commande_id,
  jsonb_build_array(jsonb_build_object('ligne_id', ligne_id, 'quantite_recue', 10))) from t4;
select is((select quantite_stock from public.articles_stock where id = 'a1000000-0000-0000-0000-00000000a004'), 10::numeric,
  '4) stock après la première réception totale');
-- Rejeu exact, y compris une fois la commande déjà "recue" (cf. correctif :
-- sans lui, ce rejeu échouerait avec "commande non réceptionnable" au lieu
-- d'être un no-op idempotent).
select is(
  (select public.enregistrer_reception_commande('e1111111-0000-0000-0000-000000000001'::uuid, commande_id,
     jsonb_build_array(jsonb_build_object('ligne_id', ligne_id, 'quantite_recue', 10))) from t4),
  'recue', '4) le rejeu exact après complétion renvoie le même statut sans erreur'
);
reset role;
select is((select quantite_stock from public.articles_stock where id = 'a1000000-0000-0000-0000-00000000a004'), 10::numeric,
  '4) le stock est inchangé après le rejeu (aucun second mouvement)');
select is((select count(*)::int from public.mouvements_stock where ligne_commande_id = (select ligne_id from t4)), 1,
  '4) toujours un seul mouvement de stock après le rejeu exact');

-- ═════════════════════════════════════════════════════════════
-- 5) retry avec clé d'idempotence explicite : la seconde requête, même avec
--    une charge utile différente, renvoie le résultat déjà mémorisé et
--    n'exécute aucune nouvelle écriture. C'est la clé, pas la coïncidence
--    des valeurs, qui protège ce cas.
-- ═════════════════════════════════════════════════════════════
create temporary table t5 as select * from pg_temp.creer_commande_test(10, 'a1000000-0000-0000-0000-00000000a005');
grant select on t5 to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select public.enregistrer_reception_commande('e1111111-0000-0000-0000-000000000001'::uuid, commande_id,
     jsonb_build_array(jsonb_build_object('ligne_id', ligne_id, 'quantite_recue', 5)),
     '55555555-5555-5555-5555-555555555555'::uuid) from t5),
  'recue_partiel', '5) premier appel avec clé d''idempotence : réception de 5/10'
);
select is(
  (select public.enregistrer_reception_commande('e1111111-0000-0000-0000-000000000001'::uuid, commande_id,
     jsonb_build_array(jsonb_build_object('ligne_id', ligne_id, 'quantite_recue', 9)),
     '55555555-5555-5555-5555-555555555555'::uuid) from t5),
  'recue_partiel', '5) rejeu avec la MÊME clé mais une charge différente (9 au lieu de 5) : résultat mémorisé renvoyé, pas retraité'
);
reset role;
select is((select quantite_recue from public.lignes_commande where id = (select ligne_id from t5)), 5::numeric,
  '5) quantite_recue reste 5 : la seconde charge (9) n''a jamais été appliquée grâce à la clé');
select is((select count(*)::int from public.mouvements_stock where ligne_commande_id = (select ligne_id from t5)), 1,
  '5) un seul mouvement malgré les deux appels sous la même clé');

-- ═════════════════════════════════════════════════════════════
-- 7) deux lignes différentes d'une même commande, réceptionnées ensemble
-- ═════════════════════════════════════════════════════════════
do $$
declare v_cmd uuid; v_l1 uuid; v_l2 uuid;
begin
  v_cmd := public.creer_commande_fournisseur_interne(
    'e1111111-0000-0000-0000-000000000001'::uuid,
    jsonb_build_object('fournisseur_id','f1111111-0000-0000-0000-000000000001'),
    jsonb_build_array(
      jsonb_build_object('designation','Ligne A','quantite',10,'unite','u','prix_unitaire_ht',1,'taux_tva',20,'ordre',1),
      jsonb_build_object('designation','Ligne B','quantite',8,'unite','u','prix_unitaire_ht',1,'taux_tva',20,'ordre',2)
    )
  );
  select id into v_l1 from public.lignes_commande where commande_id = v_cmd and designation = 'Ligne A';
  select id into v_l2 from public.lignes_commande where commande_id = v_cmd and designation = 'Ligne B';
  update public.lignes_commande set article_id = 'a1000000-0000-0000-0000-00000000a007' where id = v_l1;
  update public.lignes_commande set article_id = 'a1000000-0000-0000-0000-00000000a008' where id = v_l2;
  perform public.changer_statut_commande_interne('e1111111-0000-0000-0000-000000000001'::uuid, v_cmd, 'envoyee');
  create temporary table t7 as select v_cmd as commande_id, v_l1 as ligne_a, v_l2 as ligne_b;
end $$;
grant select on t7 to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select public.enregistrer_reception_commande('e1111111-0000-0000-0000-000000000001'::uuid, commande_id,
     jsonb_build_array(
       jsonb_build_object('ligne_id', ligne_a, 'quantite_recue', 10),
       jsonb_build_object('ligne_id', ligne_b, 'quantite_recue', 8)
     )) from t7),
  'recue', '7) deux lignes différentes réceptionnées en un seul appel => commande recue'
);
reset role;
select is((select quantite_stock from public.articles_stock where id = 'a1000000-0000-0000-0000-00000000a007'), 10::numeric,
  '7) le premier article porte le stock de sa propre ligne (10)');
select is((select quantite_stock from public.articles_stock where id = 'a1000000-0000-0000-0000-00000000a008'), 8::numeric,
  '7) le second article, indépendant, porte le stock de sa propre ligne (8)');
select is((select count(*)::int from public.mouvements_stock where ligne_commande_id = (select ligne_a from t7)), 1,
  '7) un mouvement pour la ligne A');
select is((select count(*)::int from public.mouvements_stock where ligne_commande_id = (select ligne_b from t7)), 1,
  '7) un mouvement distinct pour la ligne B');

-- ═════════════════════════════════════════════════════════════
-- 8) deux entreprises : E1 ne peut pas réceptionner une commande de E2
-- ═════════════════════════════════════════════════════════════
do $$
declare v_cmd uuid; v_lig uuid;
begin
  v_cmd := public.creer_commande_fournisseur_interne(
    'e2222222-0000-0000-0000-000000000002'::uuid,
    jsonb_build_object('fournisseur_id','f2222222-0000-0000-0000-000000000002'),
    jsonb_build_array(jsonb_build_object('designation','Ligne E2','quantite',10,'unite','u','prix_unitaire_ht',1,'taux_tva',20,'ordre',1))
  );
  select id into v_lig from public.lignes_commande where commande_id = v_cmd;
  update public.lignes_commande set article_id = 'a2000000-0000-0000-0000-00000000a001' where id = v_lig;
  perform public.changer_statut_commande_interne('e2222222-0000-0000-0000-000000000002'::uuid, v_cmd, 'envoyee');
  create temporary table t8 as select v_cmd as commande_id, v_lig as ligne_id;
end $$;
grant select on t8 to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_like(
  format($sql$select public.enregistrer_reception_commande('e1111111-0000-0000-0000-000000000001'::uuid, %L,
    jsonb_build_array(jsonb_build_object('ligne_id', %L, 'quantite_recue', 10)))$sql$,
    (select commande_id from t8), (select ligne_id from t8)),
  '%Commande introuvable%',
  '8) E1 référençant la commande de E2 avec son propre entreprise_id : "Commande introuvable" (aucune fuite cross-tenant)'
);
reset role;
select is((select quantite_stock from public.articles_stock where id = 'a2000000-0000-0000-0000-00000000a001'), 0::numeric,
  '8) le stock de l''article E2 reste à 0 : la tentative cross-tenant n''a rien crédité');

-- ═════════════════════════════════════════════════════════════
-- 9) article d'une autre entreprise : impossible à relier via le scan
--    (appel direct du moteur : aucun contrôle de permission dedans, ce n'est
--    pas ce qui est sous test sur cette assertion précise)
-- ═════════════════════════════════════════════════════════════
create temporary table t9 as select * from pg_temp.creer_commande_test(10, null);
grant select on t9 to authenticated;
select throws_like(
  format($sql$select public.appliquer_reception_ligne_commande('e1111111-0000-0000-0000-000000000001'::uuid, %L, 5,
    p_article_id_scan => 'a2000000-0000-0000-0000-00000000a001'::uuid)$sql$, (select ligne_id from t9)),
  '%introuvable dans cette entreprise%',
  '9) impossible de relier un article appartenant à une autre entreprise'
);
select is((select article_id from public.lignes_commande where id = (select ligne_id from t9)), null,
  '9) la ligne reste non reliée après la tentative refusée');

-- ═════════════════════════════════════════════════════════════
-- 10) utilisateur sans la permission gerer_achats
-- ═════════════════════════════════════════════════════════════
create temporary table t10 as select * from pg_temp.creer_commande_test(10, 'a1000000-0000-0000-0000-00000000a009');
grant select on t10 to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_like(
  format($sql$select public.enregistrer_reception_commande('e1111111-0000-0000-0000-000000000001'::uuid, %L,
    jsonb_build_array(jsonb_build_object('ligne_id', %L, 'quantite_recue', 10)))$sql$,
    (select commande_id from t10), (select ligne_id from t10)),
  '%Accès refusé%',
  '10) un utilisateur du poste "Sans droit" (pas de gerer_achats) est rejeté'
);
reset role;
select is((select quantite_recue from public.lignes_commande where id = (select ligne_id from t10)), 0::numeric,
  '10) aucune écriture pour l''utilisateur sans permission');

-- ═════════════════════════════════════════════════════════════
-- 11) rollback : une ligne étrangère dans le même lot doit annuler TOUT le
--     lot, y compris la ligne par ailleurs valide.
-- ═════════════════════════════════════════════════════════════
create temporary table t11 as select * from pg_temp.creer_commande_test(10, 'a1000000-0000-0000-0000-00000000a009');
grant select on t11 to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_like(
  format($sql$select public.enregistrer_reception_commande('e1111111-0000-0000-0000-000000000001'::uuid, %L,
    jsonb_build_array(
      jsonb_build_object('ligne_id', %L, 'quantite_recue', 10),
      jsonb_build_object('ligne_id', gen_random_uuid(), 'quantite_recue', 1)
    ))$sql$, (select commande_id from t11), (select ligne_id from t11)),
  '%invalide ou ligne étrangère%',
  '11) un lot contenant une ligne étrangère est intégralement rejeté'
);
reset role;
select is((select quantite_recue from public.lignes_commande where id = (select ligne_id from t11)), 0::numeric,
  '11) la ligne par ailleurs valide du même lot n''a RIEN reçu (rollback complet)');
select is((select count(*)::int from public.mouvements_stock where ligne_commande_id = (select ligne_id from t11)), 0,
  '11) aucun mouvement de stock créé pour la ligne valide malgré son propre bien-fondé');
select is((select statut from public.commandes_fournisseurs where id = (select commande_id from t11)), 'envoyee',
  '11) le statut de la commande n''a pas bougé après le rollback');

-- ═════════════════════════════════════════════════════════════
-- 14) cohérence globale mouvements ↔ stock ↔ quantite_recue, exécutée avec
--     plusieurs réceptions partielles sur un article dédié pour ce test.
-- ═════════════════════════════════════════════════════════════
do $$
declare v_cmd uuid; v_lig uuid;
begin
  v_cmd := public.creer_commande_fournisseur_interne(
    'e1111111-0000-0000-0000-000000000001'::uuid,
    jsonb_build_object('fournisseur_id','f1111111-0000-0000-0000-000000000001'),
    jsonb_build_array(jsonb_build_object('designation','Ligne 14','quantite',9,'unite','u','prix_unitaire_ht',1,'taux_tva',20,'ordre',1))
  );
  select id into v_lig from public.lignes_commande where commande_id = v_cmd;
  update public.lignes_commande set article_id = 'a1000000-0000-0000-0000-00000000a009' where id = v_lig;
  perform public.changer_statut_commande_interne('e1111111-0000-0000-0000-000000000001'::uuid, v_cmd, 'envoyee');
  create temporary table t14 as select v_cmd as commande_id, v_lig as ligne_id;
end $$;
grant select on t14 to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.enregistrer_reception_commande('e1111111-0000-0000-0000-000000000001'::uuid, commande_id,
  jsonb_build_array(jsonb_build_object('ligne_id', ligne_id, 'quantite_recue', 3))) from t14;
select public.enregistrer_reception_commande('e1111111-0000-0000-0000-000000000001'::uuid, commande_id,
  jsonb_build_array(jsonb_build_object('ligne_id', ligne_id, 'quantite_recue', 9))) from t14;
reset role;
select is(
  (select quantite_stock from public.articles_stock where id = 'a1000000-0000-0000-0000-00000000a009'),
  (select coalesce(sum(case when type in ('entree','ajustement_plus') then quantite else -quantite end), 0)
     from public.mouvements_stock where article_id = 'a1000000-0000-0000-0000-00000000a009'),
  '14) quantite_stock = somme signée des mouvements de cet article (t10/t11 n''y ont jamais rien écrit)'
);
select is(
  (select coalesce(sum(m.quantite), 0) from public.mouvements_stock m
     join public.lignes_commande l on l.id = m.ligne_commande_id
     where l.article_id = 'a1000000-0000-0000-0000-00000000a009' and m.type = 'entree'),
  (select coalesce(sum(quantite_recue), 0) from public.lignes_commande
     where article_id = 'a1000000-0000-0000-0000-00000000a009'),
  '14) somme des entrées liées aux lignes de cet article = somme de leurs quantite_recue'
);
select is((select quantite_stock from public.articles_stock where id = 'a1000000-0000-0000-0000-00000000a009'), 9::numeric,
  '14) valeur absolue attendue : 9 (t10 et t11 n''ont rien reçu sur ce même article)'
);

-- ═════════════════════════════════════════════════════════════
-- 6) bascule manuelle "reçue" : même moteur, même traçabilité (troisième
--    entrée historique dans le défaut d'origine).
-- ═════════════════════════════════════════════════════════════
create temporary table t6 as select * from pg_temp.creer_commande_test(7, 'a1000000-0000-0000-0000-00000000a006');
grant select on t6 to authenticated;
select public.changer_statut_commande_interne('e1111111-0000-0000-0000-000000000001'::uuid, commande_id, 'recue') from t6;
select is((select quantite_recue from public.lignes_commande where id = (select ligne_id from t6)), 7::numeric,
  '6) la bascule manuelle met bien à jour quantite_recue');
select is((select quantite_stock from public.articles_stock where id = 'a1000000-0000-0000-0000-00000000a006'), 7::numeric,
  '6) la bascule manuelle crédite désormais le stock (avant le correctif : jamais)');
select is((select count(*)::int from public.mouvements_stock where ligne_commande_id = (select ligne_id from t6)), 1,
  '6) la bascule manuelle crée exactement un mouvement de stock');

-- ═════════════════════════════════════════════════════════════
-- Parcours scan : convergence vers le même moteur + idempotence par clé.
-- ═════════════════════════════════════════════════════════════
create temporary table tscan as select * from pg_temp.creer_commande_test(10, null);
grant select on tscan to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select (public.enregistrer_reception_lot(
     'e1111111-0000-0000-0000-000000000001'::uuid,
     '[]'::jsonb,
     jsonb_build_array(jsonb_build_object('ligne_commande_id', ligne_id, 'quantite', 6, 'article_id', 'a1000000-0000-0000-0000-00000000a011')),
     null, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
   ) -> 'commandes' -> 0 ->> 'statut') from tscan),
  'recue_partiel', 'scan) une attribution de scan crédite le stock ET relie l''article via le moteur canonique'
);
select is((select article_id from public.lignes_commande where id = (select ligne_id from tscan)), 'a1000000-0000-0000-0000-00000000a011'::uuid,
  'scan) la ligne, jamais pré-liée, est désormais reliée à l''article scanné');
select is((select quantite_stock from public.articles_stock where id = 'a1000000-0000-0000-0000-00000000a011'), 6::numeric,
  'scan) le stock est crédité de 6 par l''attribution de scan');
select is((select count(*)::int from public.mouvements_stock where ligne_commande_id = (select ligne_id from tscan)), 1,
  'scan) un mouvement de stock créé par l''attribution de scan (même table que le parcours commande)');
-- Rejeu du scan avec la même clé d'idempotence : aucune nouvelle écriture.
select is(
  (select (public.enregistrer_reception_lot(
     'e1111111-0000-0000-0000-000000000001'::uuid,
     '[]'::jsonb,
     jsonb_build_array(jsonb_build_object('ligne_commande_id', ligne_id, 'quantite', 6, 'article_id', 'a1000000-0000-0000-0000-00000000a011')),
     null, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
   ) -> 'commandes' -> 0 ->> 'statut') from tscan),
  'recue_partiel', 'scan) rejeu du même lot avec la même clé : résultat mémorisé renvoyé'
);
select is((select quantite_stock from public.articles_stock where id = 'a1000000-0000-0000-0000-00000000a011'), 6::numeric,
  'scan) le stock reste à 6 après le rejeu (aucun second crédit)');
select is((select count(*)::int from public.mouvements_stock where ligne_commande_id = (select ligne_id from tscan)), 1,
  'scan) toujours un seul mouvement après le rejeu du scan sous la même clé');
reset role;

-- ═════════════════════════════════════════════════════════════
-- Sécurité : owner, SECURITY DEFINER, search_path, grants — aucun accès anon.
-- ═════════════════════════════════════════════════════════════
select ok(
  (select prosecdef from pg_proc where proname = 'appliquer_reception_ligne_commande' and pronamespace = 'public'::regnamespace),
  'sécurité) appliquer_reception_ligne_commande est SECURITY DEFINER'
);
select is(
  (select r.rolname from pg_proc p join pg_roles r on r.oid = p.proowner
     where p.proname = 'appliquer_reception_ligne_commande' and p.pronamespace = 'public'::regnamespace),
  'postgres', 'sécurité) appliquer_reception_ligne_commande appartient à postgres'
);
select ok(
  (select 'search_path=public' = any(proconfig) from pg_proc
     where proname = 'appliquer_reception_ligne_commande' and pronamespace = 'public'::regnamespace),
  'sécurité) search_path figé à public sur le moteur canonique (pas de search_path hijack)'
);
select ok(
  not has_function_privilege('anon', 'public.appliquer_reception_ligne_commande(uuid,uuid,numeric,uuid,uuid,boolean,text)', 'EXECUTE'),
  'sécurité) anon ne peut jamais exécuter le moteur canonique (fonction interne)'
);
select ok(
  not has_function_privilege('authenticated', 'public.appliquer_reception_ligne_commande(uuid,uuid,numeric,uuid,uuid,boolean,text)', 'EXECUTE'),
  'sécurité) authenticated ne peut pas non plus l''exécuter directement : seul le wrapper public le peut'
);
select ok(
  not has_function_privilege('anon', 'public.enregistrer_reception_commande(uuid,uuid,jsonb,uuid)', 'EXECUTE'),
  'sécurité) anon ne peut pas exécuter enregistrer_reception_commande'
);
select ok(
  has_function_privilege('authenticated', 'public.enregistrer_reception_commande(uuid,uuid,jsonb,uuid)', 'EXECUTE'),
  'sécurité) authenticated peut exécuter le point d''entrée public (le contrôle de permission est interne)'
);
select ok(
  not has_function_privilege('anon', 'public.enregistrer_reception_lot(uuid,jsonb,jsonb,text,uuid)', 'EXECUTE'),
  'sécurité) anon ne peut pas exécuter enregistrer_reception_lot (scan)'
);
select ok(
  not has_function_privilege('anon', 'public.enregistrer_reception_lot_borne(uuid,text,text,jsonb,jsonb,text,uuid)', 'EXECUTE'),
  'sécurité) anon ne peut pas exécuter enregistrer_reception_lot_borne'
);
select ok(
  not has_function_privilege('authenticated', 'public.enregistrer_reception_lot_borne(uuid,text,text,jsonb,jsonb,text,uuid)', 'EXECUTE')
  or (select prosecdef from pg_proc where proname='employe_borne_autorise' and pronamespace='public'::regnamespace),
  'sécurité) le parcours borne reste gardé par employe_borne_autorise (identité salarié + poste)'
);
select is(
  (select count(*)::int from pg_proc where proname = 'enregistrer_reception_commande_interne' and pronamespace = 'public'::regnamespace),
  1, 'sécurité) une seule signature de enregistrer_reception_commande_interne en base (pas d''ancienne version résiduelle)'
);
select is(
  (select count(*)::int from pg_proc where proname = 'enregistrer_reception_commande' and pronamespace = 'public'::regnamespace),
  1, 'sécurité) une seule signature de enregistrer_reception_commande en base'
);
select is(
  (select count(*)::int from pg_proc where proname = 'enregistrer_reception_lot' and pronamespace = 'public'::regnamespace),
  1, 'sécurité) une seule signature de enregistrer_reception_lot en base'
);

-- ─────────────────────────────────────────────────────────────
-- FK composite : une ligne de commande ne peut référencer un article d'une
-- autre entreprise (garantie au niveau base, pas seulement applicative).
-- ─────────────────────────────────────────────────────────────
select throws_ok(
  format($sql$update public.lignes_commande set article_id = 'a2000000-0000-0000-0000-00000000a001'::uuid where id = %L$sql$,
    (select ligne_id from t1)),
  '23503',
  'insert or update on table "lignes_commande" violates foreign key constraint "lignes_commande_article_entreprise_fk"',
  'FK) impossible en base de relier une ligne E1 à un article E2 (contrainte composite)'
);

select * from finish();
rollback;
