begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- ELSATIA-REDTEAM-V3 — non-régression pour 20260922000323 :
--   1) synchroniser_capacite_stripe_service et
--      capacite_stripe_finaliser_op_convergente ne doivent plus être
--      exécutables par authenticated (ni anon) : ni l'une ni l'autre ne
--      vérifie l'appartenance de l'appelant à p_entreprise_id, un appel
--      direct authenticated permettait un auto-octroi de capacité payante
--      (P0) ou la falsification de l'état de réconciliation d'un autre
--      tenant (P1). service_role (seul appelant réel, src/lib/stripe-
--      capacite-reconcile.ts) doit conserver l'accès.
--   2) boutique_finaliser_commande_payee : même chose (P0, commande marquée
--      payée sans paiement réel) ; et le déclencheur D1
--      boutique_commandes_paiement_serveur_seul doit refuser toute mise à
--      "payee" hors chemin serveur, y compris par PATCH RLS direct.

-- 1) Grants au catalogue.
select ok(
  not has_function_privilege('authenticated', 'public.synchroniser_capacite_stripe_service(uuid,text,integer,integer,text,text,text,text,text,text,text,jsonb,timestamptz,text,timestamptz,text)', 'EXECUTE'),
  'synchroniser_capacite_stripe_service : authenticated ne peut plus exécuter'
);
select ok(
  not has_function_privilege('anon', 'public.synchroniser_capacite_stripe_service(uuid,text,integer,integer,text,text,text,text,text,text,text,jsonb,timestamptz,text,timestamptz,text)', 'EXECUTE'),
  'synchroniser_capacite_stripe_service : anon ne peut pas exécuter'
);
select ok(
  has_function_privilege('service_role', 'public.synchroniser_capacite_stripe_service(uuid,text,integer,integer,text,text,text,text,text,text,text,jsonb,timestamptz,text,timestamptz,text)', 'EXECUTE'),
  'synchroniser_capacite_stripe_service : service_role conserve l’accès'
);

select ok(
  not has_function_privilege('authenticated', 'public.capacite_stripe_finaliser_op_convergente(uuid)', 'EXECUTE'),
  'capacite_stripe_finaliser_op_convergente : authenticated ne peut plus exécuter'
);
select ok(
  has_function_privilege('service_role', 'public.capacite_stripe_finaliser_op_convergente(uuid)', 'EXECUTE'),
  'capacite_stripe_finaliser_op_convergente : service_role conserve l’accès'
);

select ok(
  not has_function_privilege('authenticated', 'public.boutique_finaliser_commande_payee(uuid,text)', 'EXECUTE'),
  'boutique_finaliser_commande_payee : authenticated ne peut plus exécuter'
);
select ok(
  has_function_privilege('service_role', 'public.boutique_finaliser_commande_payee(uuid,text)', 'EXECUTE'),
  'boutique_finaliser_commande_payee : service_role peut de nouveau exécuter'
);

-- 2) Témoins négatifs / positifs sur données réelles.
\ir fixtures/isolation_multitenant.inc

-- Négatif : self-service capacité par un authenticated d'une entreprise réelle.
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select throws_like(
  $$select public.synchroniser_capacite_stripe_service('b0000000-0000-0000-0000-000000000001'::uuid,'hausse',0,100000,'x','mensuel','x','sub_fake','item_fake','idem-redteam-1','completed',null,null,null,null,'attacker')$$,
  '%permission denied%',
  'Auto-octroi de capacité par authenticated refusé (42501)'
);
reset role;

-- Négatif : commande Boutique d'une entreprise réelle marquée payée par RPC directe.
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
insert into public.boutique_commandes (id, entreprise_id, statut, montant_ht, montant_tva, montant_ttc)
values ('c0000000-0000-0000-0000-000000000010','b0000000-0000-0000-0000-000000000001','en_attente_paiement',100,20,120);
select throws_like(
  $$select public.boutique_finaliser_commande_payee('c0000000-0000-0000-0000-000000000010'::uuid,'cs_fake')$$,
  '%permission denied%',
  'Finalisation Boutique par RPC directe refusée à authenticated (42501)'
);

-- Négatif : même sans la RPC, PATCH direct statut=payee refusé par D1.
select throws_like(
  $$update public.boutique_commandes set statut='payee' where id='c0000000-0000-0000-0000-000000000010'$$,
  '%statut payee reserve au chemin serveur%',
  'D1 : PATCH direct statut=payee refusé (RLS autorise l’UPDATE, le déclencheur le bloque)'
);

-- Positif : le cycle de vie légitime du client reste permis.
select lives_ok(
  $$update public.boutique_commandes set statut='annulee' where id='c0000000-0000-0000-0000-000000000010'$$,
  'Le client garde le droit d’annuler sa propre commande non payée'
);
reset role;

-- Positif : le chemin serveur (service_role) reste fonctionnel de bout en
-- bout, sur une commande créée normalement par le client (authenticated,
-- comme le fait réellement src/app/actions/boutique.ts — service_role
-- n'insère jamais directement dans boutique_commandes).
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
insert into public.boutique_commandes (id, entreprise_id, statut, montant_ht, montant_tva, montant_ttc, stripe_checkout_id)
values ('c0000000-0000-0000-0000-000000000011','b0000000-0000-0000-0000-000000000001','en_attente_paiement',50,10,60,'cs_redteam_v3');
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select lives_ok(
  $$select public.boutique_finaliser_commande_payee('c0000000-0000-0000-0000-000000000011'::uuid,'cs_redteam_v3')$$,
  'Le webhook (service_role) peut toujours finaliser une commande réellement payée'
);
reset role;

select is(
  (select statut from public.boutique_commandes where id = 'c0000000-0000-0000-0000-000000000011'),
  'payee',
  'La commande légitime est bien passée à payee par le chemin serveur'
);

select * from finish();
rollback;
