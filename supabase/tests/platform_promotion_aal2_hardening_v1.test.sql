-- Régression : les quatre RPC plateforme_promotion_* (administration
-- commerciale, migration 20260816000203) exigent désormais une session AAL2,
-- via la migration 20260831000250_platform_promotion_aal2_hardening_v1.
--
-- Couverture demandée :
--   * session AAL1 refusée avec SQLSTATE 42501 ;
--   * session AAL2 sans la permission gerer_remises refusée ;
--   * session AAL2 avec la permission requise autorisée ;
--   * l'invariant global platform_aal2_role_integrity_v1 (test 71) redevient vert
--     (vérifié en propre par `supabase test db`).
-- On vérifie aussi que signatures, résultats, SECURITY DEFINER, search_path et
-- privilèges (authenticated seulement, jamais public/anon) sont inchangés.

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

-- Admin plateforme rôle "support" : actif, mais SANS la permission gerer_remises.
insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at
) values
  ('00000000-0000-0000-0000-000000000000','dd000000-0000-4000-8000-000000000001','authenticated','authenticated','promo-support@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now())
on conflict(id) do nothing;

insert into public.plateforme_admins(email,role,utilisateur_id,actif,statut_identite,activation_at)
values('promo-support@invalid.local','support','dd000000-0000-4000-8000-000000000001',true,'active',now())
on conflict(email) do update
  set role=excluded.role, utilisateur_id=excluded.utilisateur_id, actif=excluded.actif,
      statut_identite=excluded.statut_identite, activation_at=excluded.activation_at;

-- Deux promotions ciblées par code (entreprise_id nul : aucune écriture remise_*
-- sur entreprises, donc aucune interaction avec le garde-fou de la migration 243).
insert into public.promotions_commerciales(
  id,nom_interne,type_remise,valeur,duree,duree_mois,date_debut,date_fin,offres,
  entreprise_id,justification,statut,code_promotionnel,cree_par,modifie_par
) values
  ('dd100000-0000-4000-8000-000000000001','Promo test brouillon','pourcentage',10,'once',null,current_date,null,
   array['pro']::text[],null,'Justification test AAL2','brouillon','TESTBROUILLON',
   '30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001'),
  ('dd100000-0000-4000-8000-000000000002','Promo test active','pourcentage',10,'once',null,current_date,null,
   array['pro']::text[],null,'Justification test AAL2','actif','TESTACTIVE',
   '30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- 1. Signatures / résultats / sécurité inchangés.
-- ---------------------------------------------------------------------------
select is(
  pg_get_function_result('public.plateforme_promotion_creer(text,text,numeric,text,integer,date,date,text[],uuid,text,boolean,text,integer)'::regprocedure),
  'uuid', 'plateforme_promotion_creer : retour uuid conservé');
select is(
  pg_get_function_result('public.plateforme_promotion_modifier(uuid,text,text,numeric,text,integer,date,date,text[],uuid,text,boolean,text,integer)'::regprocedure),
  'void', 'plateforme_promotion_modifier : retour void conservé');
select is(
  pg_get_function_result('public.plateforme_promotion_confirmer_activation(uuid,text,text)'::regprocedure),
  'void', 'plateforme_promotion_confirmer_activation : retour void conservé');
select is(
  pg_get_function_result('public.plateforme_promotion_confirmer_desactivation(uuid)'::regprocedure),
  'void', 'plateforme_promotion_confirmer_desactivation : retour void conservé');

select ok(
  (select bool_and(p.prosecdef
     and exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c = 'search_path=public')
     and p.prosrc like '%plateforme_exiger_permission(''gerer_remises'')%'
     and p.prosrc like '%plateforme_exiger_session_aal2%')
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in (
     'plateforme_promotion_creer','plateforme_promotion_modifier',
     'plateforme_promotion_confirmer_activation','plateforme_promotion_confirmer_desactivation')),
  'les 4 RPC : SECURITY DEFINER + search_path=public + gerer_remises + AAL2 dans le corps');

-- Privilèges : authenticated conserve EXECUTE ; jamais public ni anon.
select ok(
  (select bool_and(has_function_privilege('authenticated',p.oid,'EXECUTE')
     and not has_function_privilege('anon',p.oid,'EXECUTE')
     and not exists(select 1 from aclexplode(p.proacl) a where a.grantee=0 and a.privilege_type='EXECUTE'))
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in (
     'plateforme_promotion_creer','plateforme_promotion_modifier',
     'plateforme_promotion_confirmer_activation','plateforme_promotion_confirmer_desactivation')),
  'les 4 RPC : EXECUTE réservé à authenticated, aucun droit public/anon');

-- ---------------------------------------------------------------------------
-- 2. Session AAL2 + rôle total (permission gerer_remises) : autorisé.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','plateforme@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal2"}',true);

select lives_ok(
  $$select public.plateforme_promotion_creer('Promo creee AAL2','pourcentage',15,'once',null,current_date,null,array['pro']::text[],null,'Creation via test AAL2',false,'TESTCREER',null)$$,
  'AAL2 + gerer_remises : plateforme_promotion_creer autorisé');
select lives_ok(
  $$select public.plateforme_promotion_modifier('dd100000-0000-4000-8000-000000000001','Promo brouillon modifiee','pourcentage',20,'once',null,current_date,null,array['pro','business']::text[],null,'Modification via test AAL2',false,'TESTBROUILLON',null)$$,
  'AAL2 + gerer_remises : plateforme_promotion_modifier autorisé');
select lives_ok(
  $$select public.plateforme_promotion_confirmer_activation('dd100000-0000-4000-8000-000000000001','coupon_test_aal2',null)$$,
  'AAL2 + gerer_remises : plateforme_promotion_confirmer_activation autorisé');
select lives_ok(
  $$select public.plateforme_promotion_confirmer_desactivation('dd100000-0000-4000-8000-000000000002')$$,
  'AAL2 + gerer_remises : plateforme_promotion_confirmer_desactivation autorisé');

-- ---------------------------------------------------------------------------
-- 3. Session AAL2 SANS la permission gerer_remises (rôle support) : refusé 42501.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub','dd000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.email','promo-support@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"dd000000-0000-4000-8000-000000000001","email":"promo-support@invalid.local","role":"authenticated","aal":"aal2"}',true);

select throws_ok(
  $$select public.plateforme_promotion_creer('x','pourcentage',15,'once',null,current_date,null,array['pro']::text[],null,'refus perm',false,'REFUSPERM1',null)$$,
  '42501','Permission plateforme refusée : gerer_remises',
  'AAL2 sans gerer_remises : plateforme_promotion_creer refusé (42501)');
select throws_ok(
  $$select public.plateforme_promotion_modifier('dd100000-0000-4000-8000-000000000002','x','pourcentage',15,'once',null,current_date,null,array['pro']::text[],null,'refus perm',false,null,null)$$,
  '42501','Permission plateforme refusée : gerer_remises',
  'AAL2 sans gerer_remises : plateforme_promotion_modifier refusé (42501)');
select throws_ok(
  $$select public.plateforme_promotion_confirmer_activation('dd100000-0000-4000-8000-000000000001','coupon',null)$$,
  '42501','Permission plateforme refusée : gerer_remises',
  'AAL2 sans gerer_remises : plateforme_promotion_confirmer_activation refusé (42501)');
select throws_ok(
  $$select public.plateforme_promotion_confirmer_desactivation('dd100000-0000-4000-8000-000000000001')$$,
  '42501','Permission plateforme refusée : gerer_remises',
  'AAL2 sans gerer_remises : plateforme_promotion_confirmer_desactivation refusé (42501)');

-- ---------------------------------------------------------------------------
-- 4. Session AAL1 + rôle total : le verrou AAL2 rejette (après le contrôle de
--    permission, comme les autres RPC plateforme sensibles).
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','plateforme@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal1"}',true);

select throws_ok(
  $$select public.plateforme_promotion_creer('x','pourcentage',15,'once',null,current_date,null,array['pro']::text[],null,'refus aal1',false,'REFUSAAL11',null)$$,
  'P0001','Authentification forte AAL2 requise',
  'AAL1 + total : plateforme_promotion_creer refusé par le verrou AAL2');
select throws_ok(
  $$select public.plateforme_promotion_modifier('dd100000-0000-4000-8000-000000000002','x','pourcentage',15,'once',null,current_date,null,array['pro']::text[],null,'refus aal1',false,null,null)$$,
  'P0001','Authentification forte AAL2 requise',
  'AAL1 + total : plateforme_promotion_modifier refusé par le verrou AAL2');
select throws_ok(
  $$select public.plateforme_promotion_confirmer_activation('dd100000-0000-4000-8000-000000000002','coupon',null)$$,
  'P0001','Authentification forte AAL2 requise',
  'AAL1 + total : plateforme_promotion_confirmer_activation refusé par le verrou AAL2');
select throws_ok(
  $$select public.plateforme_promotion_confirmer_desactivation('dd100000-0000-4000-8000-000000000002')$$,
  'P0001','Authentification forte AAL2 requise',
  'AAL1 + total : plateforme_promotion_confirmer_desactivation refusé par le verrou AAL2');

-- ---------------------------------------------------------------------------
-- 5. Session AAL1 sans permission : refus observé en SQLSTATE 42501.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub','dd000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.email','promo-support@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"dd000000-0000-4000-8000-000000000001","email":"promo-support@invalid.local","role":"authenticated","aal":"aal1"}',true);
select throws_ok(
  $$select public.plateforme_promotion_creer('x','pourcentage',15,'once',null,current_date,null,array['pro']::text[],null,'refus aal1 sans perm',false,'REFUSAAL12',null)$$,
  '42501',null,
  'AAL1 sans permission : plateforme_promotion_creer refusé avec SQLSTATE 42501');

reset role;
select * from finish();
rollback;
