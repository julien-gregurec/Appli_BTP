begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- ELSATIA-BOUTIQUE-PAYMENT-IDEMPOTENCY-CLOSURE-V1 — non-régression pour
-- 20260922000330. Couvre le contrat d'idempotence du webhook Boutique côté
-- séquentiel, sécurité et cross-tenant. La concurrence réelle (deux sessions
-- Postgres simultanées) ne peut pas être testée dans un seul fichier pgTAP
-- (une seule transaction) — même convention que
-- gp_reception_commande_stock_transactionnel_v1.test.sql : elle est vérifiée
-- séparément par un harnais à deux connexions psql concurrentes, documenté
-- dans docs/qualification/ELSATIA_BOUTIQUE_PAYMENT_IDEMPOTENCY_CLOSURE_V1.md
-- (reproduction du P1 avant correctif, puis preuve de clôture après).

\ir fixtures/isolation_multitenant.inc

insert into public.boutique_produits (id, sku, nom, categorie, prix_ht, taux_tva, stock_disponible)
values ('d0000000-0000-0000-0000-00000000009a', 'SKU-IDEMP-1', 'Produit idempotence', 'consommable_plastification', 100, 0.20, 10);

insert into public.boutique_commandes (id, entreprise_id, statut, montant_ht, montant_tva, montant_ttc, stripe_checkout_id)
values ('c0000000-0000-0000-0000-00000000009a', 'a0000000-0000-0000-0000-000000000001', 'en_attente_paiement', 100, 20, 120, 'cs_idemp_1');

insert into public.boutique_lignes_commande (commande_id, produit_id, sku_snapshot, nom_snapshot, prix_unitaire_ht_snapshot, quantite, montant_ht)
values ('c0000000-0000-0000-0000-00000000009a', 'd0000000-0000-0000-0000-00000000009a', 'SKU-IDEMP-1', 'Produit idempotence', 100, 3, 300);

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Négatif : authenticated ne peut pas appeler la RPC directement (déjà
--    couvert par redteam_v3, revérifié ici dans le contexte de ce commande).
-- ─────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_like(
  $$select public.boutique_finaliser_commande_payee('c0000000-0000-0000-0000-00000000009a'::uuid, 'cs_idemp_1')$$,
  '%permission denied%',
  'DENIED - authenticated ne peut pas appeler boutique_finaliser_commande_payee directement'
);
reset role;
select is(
  (select statut from public.boutique_commandes where id = 'c0000000-0000-0000-0000-00000000009a'),
  'en_attente_paiement',
  'DENIED - la commande reste en_attente_paiement apres le refus'
);

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Positif : premier appel service_role (chemin webhook) = APPLY.
-- ─────────────────────────────────────────────────────────────────────────
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$select public.boutique_finaliser_commande_payee('c0000000-0000-0000-0000-00000000009a'::uuid, 'cs_idemp_1')$$,
  'ALLOWED - service_role (webhook) peut finaliser la commande'
);
reset role;
select is(
  (select statut from public.boutique_commandes where id = 'c0000000-0000-0000-0000-00000000009a'),
  'payee',
  'APPLY - la commande passe a payee au premier appel valide'
);
select is(
  (select stock_disponible from public.boutique_produits where id = 'd0000000-0000-0000-0000-00000000009a')::int,
  7,
  'APPLY - le stock est decremente une seule fois (10 - 3 = 7)'
);
select is(
  (select count(*)::int from public.depenses_fournisseurs where numero_piece = 'BTQ-c0000000-0000-0000-0000-00000000009a'),
  1,
  'APPLY - une depense fournisseur est enregistree'
);
select is(
  (select count(*)::int from public.reglements_fournisseurs r join public.depenses_fournisseurs d on d.id = r.depense_id where d.numero_piece = 'BTQ-c0000000-0000-0000-0000-00000000009a'),
  1,
  'APPLY - un reglement fournisseur est enregistre'
);

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Positif : rejeu SEQUENTIEL du meme evenement (retry Stripe apres un 200
--    deja renvoye, ou appel RPC direct repete par un timeout HTTP) = NO-OP
--    SUR. Ne leve jamais, ne redecremente jamais le stock, n'insere jamais
--    une seconde depense/reglement. C'etait deja le comportement AVANT le
--    correctif 20260922000330 (le garde-fou v_deja_payee existait) : ce test
--    fige ce comportement contre toute regression future du correctif.
-- ─────────────────────────────────────────────────────────────────────────
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$select public.boutique_finaliser_commande_payee('c0000000-0000-0000-0000-00000000009a'::uuid, 'cs_idemp_1')$$,
  'NO-OP - rejeu sequentiel du meme evenement (service_role) ne leve pas'
);
reset role;
select is(
  (select stock_disponible from public.boutique_produits where id = 'd0000000-0000-0000-0000-00000000009a')::int,
  7,
  'NO-OP - le stock reste inchange apres le rejeu sequentiel'
);
select is(
  (select count(*)::int from public.depenses_fournisseurs where numero_piece = 'BTQ-c0000000-0000-0000-0000-00000000009a'),
  1,
  'NO-OP - toujours une seule depense fournisseur apres le rejeu sequentiel'
);
select is(
  (select count(*)::int from public.reglements_fournisseurs r join public.depenses_fournisseurs d on d.id = r.depense_id where d.numero_piece = 'BTQ-c0000000-0000-0000-0000-00000000009a'),
  1,
  'NO-OP - toujours un seul reglement fournisseur apres le rejeu sequentiel'
);

-- ─────────────────────────────────────────────────────────────────────────
-- 4) Négatif : cross-tenant — un checkout_id d'une commande de l'entreprise A
--    ne finalise jamais une commande d'une autre entreprise (couple
--    commande_id/checkout_id incoherent -> ignoree, aucune ecriture).
-- ─────────────────────────────────────────────────────────────────────────
insert into public.boutique_commandes (id, entreprise_id, statut, montant_ht, montant_tva, montant_ttc, stripe_checkout_id)
values ('c0000000-0000-0000-0000-00000000009b', 'b0000000-0000-0000-0000-000000000001', 'en_attente_paiement', 50, 10, 60, 'cs_idemp_2');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$select public.boutique_finaliser_commande_payee('c0000000-0000-0000-0000-00000000009b'::uuid, 'cs_idemp_1')$$,
  'CROSS-TENANT - couple commande/checkout incoherent : ne leve pas (ignoree)'
);
reset role;
select is(
  (select statut from public.boutique_commandes where id = 'c0000000-0000-0000-0000-00000000009b'),
  'en_attente_paiement',
  'CROSS-TENANT - la commande de l''entreprise B n''est jamais touchee par le checkout de l''entreprise A'
);

-- ─────────────────────────────────────────────────────────────────────────
-- 5) Négatif : commande/checkout inexistants -> ignoree, jamais d'erreur.
-- ─────────────────────────────────────────────────────────────────────────
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$select public.boutique_finaliser_commande_payee('00000000-0000-0000-0000-000000000000'::uuid, 'cs_inconnu')$$,
  'IGNOREE - commande/checkout inexistants : ne leve pas'
);

-- ─────────────────────────────────────────────────────────────────────────
-- 6) Verrouillage — preuve statique que le correctif 20260922000330 est bien
--    en place (le corps de la fonction contient le verrou de ligne). Garde
--    contre une régression qui supprimerait silencieusement le
--    "for no key update" en gardant tout le reste identique.
-- ─────────────────────────────────────────────────────────────────────────
select ok(
  (select prosrc from pg_proc where oid = 'public.boutique_finaliser_commande_payee(uuid, text)'::regprocedure) ~* 'for no key update',
  'VERROU - boutique_finaliser_commande_payee verrouille la ligne commande a la lecture (for no key update)'
);

select * from finish();
rollback;
