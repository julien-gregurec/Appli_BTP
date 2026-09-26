begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

-- Entreprise A sur "mini" (n'inclut pas Stock), B sur "business" (inclut Stock).
update public.entreprises set abonnement_offre = 'mini'
where id = 'a0000000-0000-0000-0000-000000000001';
update public.entreprises set abonnement_offre = 'business'
where id = 'b0000000-0000-0000-0000-000000000001';

-- Catalogue : 19 modules, aucun prix.
select is((select count(*) from public.modules_gestion_pro), 19::bigint, 'catalogue = 19 modules');
select is(
  (select count(*) from public.modules_gestion_pro where statut_catalogue = 'actif'),
  8::bigint, '8 modules actifs au catalogue'
);
select is(
  (select mode_apres_desactivation from public.modules_gestion_pro where code = 'stock'),
  'lecture_seule', 'stock : mode_apres_desactivation = lecture_seule'
);

-- 1. module inclus dans le plan (B business → stock)
select ok(public.module_gestion_pro_actif_entreprise('b0000000-0000-0000-0000-000000000001','stock'),
  '1. B (business) a stock par inclusion plan');
select ok(not public.module_gestion_pro_actif_entreprise('a0000000-0000-0000-0000-000000000001','stock'),
  '1b. A (mini) n''a pas stock sans achat séparé');

-- 6. entitlement absent + statut bientot → jamais débloqué par le plan
select ok(not public.module_gestion_pro_actif_entreprise('b0000000-0000-0000-0000-000000000001','planning_avance'),
  '6. planning_avance (bientot) non actif même pour business');

-- 2. module acheté séparément sur un petit forfait
insert into public.modules_entreprises(entreprise_id, module_code, actif, origine, source)
values ('a0000000-0000-0000-0000-000000000001','stock',true,'achat','stripe');
select ok(public.module_gestion_pro_actif_entreprise('a0000000-0000-0000-0000-000000000001','stock'),
  '2. A (mini) a stock après achat séparé');
select ok(public.acces_module_pour_permission('a0000000-0000-0000-0000-000000000001', array['acces_stock']),
  '2b. la permission porte-d''entrée acces_stock est débloquée par le module acheté');

-- 3. module offert
insert into public.modules_entreprises(entreprise_id, module_code, actif, origine, source, motif)
values ('a0000000-0000-0000-0000-000000000001','vehicules',true,'offert','admin_plateforme','geste commercial');
select ok(public.module_gestion_pro_actif_entreprise('a0000000-0000-0000-0000-000000000001','vehicules'),
  '3. module offert actif');

-- 4. module en essai (fenêtre de validité future)
insert into public.modules_entreprises(entreprise_id, module_code, actif, origine, valide_du, valide_jusqu)
values ('a0000000-0000-0000-0000-000000000001','materiel',true,'essai',current_date - 1, current_date + 7);
select ok(public.module_gestion_pro_actif_entreprise('a0000000-0000-0000-0000-000000000001','materiel'),
  '4. module en essai actif dans sa fenêtre');

-- 5. expiration : fenêtre dépassée → inactif automatiquement, ligne conservée
insert into public.modules_entreprises(entreprise_id, module_code, actif, origine, valide_du, valide_jusqu)
values ('a0000000-0000-0000-0000-000000000001','notes_frais',true,'essai',current_date - 30, current_date - 1);
select ok(not public.module_gestion_pro_actif_entreprise('a0000000-0000-0000-0000-000000000001','notes_frais'),
  '5. entitlement expiré → module inactif');
select is(
  (select count(*) from public.modules_entreprises
   where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and module_code = 'notes_frais'),
  1::bigint, '5b. la ligne expirée est conservée (pas de suppression)');

-- 14. feature flag != entitlement
insert into public.entreprise_feature_flags(entreprise_id, feature_key, statut, active)
values ('a0000000-0000-0000-0000-000000000001','safety','active',true);
select ok(not public.module_gestion_pro_actif_entreprise('a0000000-0000-0000-0000-000000000001','safety'),
  '14. un feature flag actif ne crée pas d''entitlement module');

-- ── contrôles côté rôle authenticated ────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email','admin-a@invalid.local', true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","email":"admin-a@invalid.local","role":"authenticated","aal":"aal2"}', true);

-- 8. utilisateur habilité (admin A a toutes les permissions)
select ok(
  public.a_acces_module_gestion_pro('a0000000-0000-0000-0000-000000000001','stock','gerer_stock'),
  '8. admin A : entitlement + permission gerer_stock → accès module'
);

-- 11. authenticated ne peut pas s''accorder un module
select throws_ok(
  $$insert into public.modules_entreprises(entreprise_id, module_code, actif, origine)
    values ('a0000000-0000-0000-0000-000000000001','connect',true,'achat')$$,
  '42501', null, '11. INSERT direct dans modules_entreprises refusé pour authenticated'
);
select throws_ok(
  $$select public.plateforme_definir_module_entreprise(
      'a0000000-0000-0000-0000-000000000001','connect',true,'achat')$$,
  '42501', null, '11b. RPC de gestion module refusée hors plateforme'
);

-- 7. utilisateur NON habilité (ouvrier A n'a pas gerer_stock)
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email','ouvrier-a@invalid.local', true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","email":"ouvrier-a@invalid.local","role":"authenticated","aal":"aal1"}', true);
select ok(
  not public.a_acces_module_gestion_pro('a0000000-0000-0000-0000-000000000001','stock','gerer_stock'),
  '7. ouvrier A : entitlement présent mais permission manquante → pas d''accès'
);

-- 10. cross-tenant : un utilisateur de A ne lit pas les entitlements de B
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email','admin-b@invalid.local', true);
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","email":"admin-b@invalid.local","role":"authenticated","aal":"aal2"}', true);
select is(
  (select count(*) from public.modules_entreprises
   where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
  0::bigint, '10. RLS : B ne voit pas les entitlements de A'
);
select ok(
  public.module_gestion_pro_actif_entreprise('b0000000-0000-0000-0000-000000000001','stock'),
  '10b. B garde son module inclus indépendamment de A'
);

-- 9. direct access : sans entitlement ni inclusion, la porte reste fermée
select ok(
  not public.acces_module_pour_permission('b0000000-0000-0000-0000-000000000001', array['acces_connecteurs']),
  '9. B : aucune permission connecteurs débloquée (module bientot, pas d''achat)'
);
reset role;

-- 12. admin plateforme AAL2 peut gérer + historique
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email','plateforme@invalid.local', true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal2"}', true);
select lives_ok(
  $$select public.plateforme_definir_module_entreprise(
      'a0000000-0000-0000-0000-000000000001','connect',true,'offert',current_date,null,'sub_test','beta','admin_plateforme')$$,
  '12. admin plateforme AAL2 : activation module OK'
);
reset role;
select ok(
  public.module_gestion_pro_actif_entreprise('a0000000-0000-0000-0000-000000000001','connect'),
  '12b. module connect actif pour A après action plateforme'
);
select is(
  (select count(*) from public.historique_modules_entreprises
   where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and module_code = 'connect' and action = 'active'),
  1::bigint, '12c. historique append-only alimenté'
);

-- 13. désactivation : aucune donnée supprimée
select is(
  (select count(*) from public.articles_stock where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
  1::bigint, '13. donnée stock de A présente avant désactivation'
);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal2"}', true);
select lives_ok(
  $$select public.plateforme_definir_module_entreprise(
      'a0000000-0000-0000-0000-000000000001','stock',false,'admin',current_date,null,null,'fin de test','admin_plateforme')$$,
  '13b. désactivation du module stock'
);
reset role;
select ok(not public.module_gestion_pro_actif_entreprise('a0000000-0000-0000-0000-000000000001','stock'),
  '13c. module stock désactivé pour A');
select is(
  (select count(*) from public.articles_stock where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
  1::bigint, '13d. la donnée stock est CONSERVÉE après désactivation'
);
select is(
  (select count(*) from public.modules_entreprises
   where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and module_code = 'stock'),
  1::bigint, '13e. la ligne entitlement est conservée (désactivée, pas supprimée)'
);

-- ACL
select ok(
  has_function_privilege('authenticated','public.a_acces_module_gestion_pro(uuid,text,text)','EXECUTE')
  and has_function_privilege('authenticated','public.acces_module_pour_permission(uuid,text[])','EXECUTE'),
  'gardes module exposées à authenticated'
);
select ok(
  not has_function_privilege('anon','public.modules_entreprise_etat(uuid)','EXECUTE')
  and not has_function_privilege('service_role','public.plateforme_definir_module_entreprise(uuid,text,boolean,text,date,date,text,text,text)','EXECUTE'),
  'anon et service_role sans accès aux RPC module sensibles'
);
select ok(
  not has_table_privilege('authenticated','public.modules_entreprises','INSERT')
  and not has_table_privilege('authenticated','public.modules_entreprises','UPDATE')
  and not has_table_privilege('authenticated','public.modules_entreprises','DELETE'),
  'modules_entreprises : aucune écriture directe authenticated'
);
select matches(
  pg_get_functiondef('public.plateforme_definir_module_entreprise(uuid,text,boolean,text,date,date,text,text,text)'::regprocedure),
  'plateforme_exiger_session_aal2', 'RPC module plateforme exige AAL2'
);

select * from finish();
rollback;
