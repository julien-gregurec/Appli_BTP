-- Non-régression : 7 fonctions internes (capacité de sièges x4, service Stripe
-- x2, fournisseur boutique) ne doivent plus être exécutables directement par
-- "authenticated" (corrigé par 20260905000267), tout en restant utilisables
-- par leurs appelants gardés légitimes (capacite_personnes_entreprise() pour
-- les 4 premières, service_role pour les 2 "_service", l'appelant interne
-- boutique_finaliser_commande_payee() pour la dernière).
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

\ir fixtures/isolation_multitenant.inc

update public.entreprises
set capacite_personnes_supplementaire = 5,
    capacite_personnes_supplementaire_planifiee = 1,
    capacite_personnes_planifiee_effet_at = now() - interval '1 day'
where id = 'b0000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true); -- admin A, non membre de B
select set_config('request.jwt.claim.role', 'authenticated', true);

-- 1-4. Témoins négatifs : les 4 briques de capacité, appelées directement par
-- authenticated, sont refusées au niveau privilège (ex-fuite cross-tenant fermée).
select throws_ok(
  $$select public.capacite_personnes_base('b0000000-0000-0000-0000-000000000001')$$,
  '42501', null,
  '1. capacite_personnes_base(B) refusé pour authenticated'
);
select throws_ok(
  $$select public.capacite_personnes_totale('b0000000-0000-0000-0000-000000000001')$$,
  '42501', null,
  '2. capacite_personnes_totale(B) refusé pour authenticated'
);
select throws_ok(
  $$select public.compter_personnes_actives_entreprise('b0000000-0000-0000-0000-000000000001')$$,
  '42501', null,
  '3. compter_personnes_actives_entreprise(B) refusé pour authenticated'
);
select throws_ok(
  $$select public.etat_capacite_personnes('b0000000-0000-0000-0000-000000000001')$$,
  '42501', null,
  '4. etat_capacite_personnes(B) refusé pour authenticated'
);

-- 5. Témoin positif : le wrapper gardé reste utilisable par un membre réel.
select lives_ok(
  $$select * from public.capacite_personnes_entreprise('a0000000-0000-0000-0000-000000000001')$$,
  '5. capacite_personnes_entreprise(A) fonctionne toujours pour un membre de A'
);

-- 6-7. Témoins négatifs : les fonctions "_service" refusées pour authenticated.
select throws_ok(
  $$select public.appliquer_baisse_capacite_planifiee_service('b0000000-0000-0000-0000-000000000001')$$,
  '42501', null,
  '6. appliquer_baisse_capacite_planifiee_service(B) refusé pour authenticated'
);
select throws_ok(
  $$select public.capacite_stripe_avancer_marqueur_evenement('b0000000-0000-0000-0000-000000000001', now())$$,
  '42501', null,
  '7. capacite_stripe_avancer_marqueur_evenement(B) refusé pour authenticated'
);

-- 8. Témoin négatif : le helper fournisseur boutique refusé pour authenticated.
select throws_ok(
  $$select public.obtenir_ou_creer_fournisseur_boutique('b0000000-0000-0000-0000-000000000001')$$,
  '42501', null,
  '8. obtenir_ou_creer_fournisseur_boutique(B) refusé pour authenticated'
);

reset role;

-- 9-10. Témoins positifs service_role : les 2 fonctions "_service" restent
-- utilisables par leur appelant applicatif réel (client admin/service_role).
set local role service_role;
select lives_ok(
  $$select public.appliquer_baisse_capacite_planifiee_service('b0000000-0000-0000-0000-000000000001')$$,
  '9. appliquer_baisse_capacite_planifiee_service(B) fonctionne toujours pour service_role'
);
select lives_ok(
  $$select public.capacite_stripe_avancer_marqueur_evenement('b0000000-0000-0000-0000-000000000001', now())$$,
  '10. capacite_stripe_avancer_marqueur_evenement(B) fonctionne toujours pour service_role'
);
reset role;

-- 11. Audit final des grants : aucune des 7 fonctions n'est exécutable par
-- anon ni (sauf les 2 "_service") par authenticated ; postgres/service_role
-- conservent l'accès nécessaire à leurs appelants internes.
select ok(
  not has_function_privilege('authenticated','public.capacite_personnes_base(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.capacite_personnes_totale(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.compter_personnes_actives_entreprise(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.etat_capacite_personnes(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.appliquer_baisse_capacite_planifiee_service(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.capacite_stripe_avancer_marqueur_evenement(uuid,timestamptz)','EXECUTE')
  and not has_function_privilege('authenticated','public.obtenir_ou_creer_fournisseur_boutique(uuid)','EXECUTE')
  and has_function_privilege('service_role','public.appliquer_baisse_capacite_planifiee_service(uuid)','EXECUTE')
  and has_function_privilege('service_role','public.capacite_stripe_avancer_marqueur_evenement(uuid,timestamptz)','EXECUTE'),
  '11. Audit final des grants : authenticated exclu des 7 fonctions internes, service_role conservé pour les 2 fonctions de service'
);

select * from finish();
rollback;
