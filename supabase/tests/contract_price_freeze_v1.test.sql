-- ELSATIA — FIGEMENT DU PRIX CONTRACTUEL (migration 00278)
--
-- Ce que ce fichier prouve, et pourquoi cela compte :
--
--   1. un contrat NOUVEAU ne peut pas relever d'une génération retirée ;
--   2. une reprise de contrat existant, elle, le peut — sinon on ne pourrait
--      pas honorer les clients déjà signés ;
--   3. les montants souscrits ne se réécrivent pas en place ;
--   4. la génération et le Price Stripe souscrits non plus ;
--   5. un contrat ne se supprime pas, il se clôt ;
--   6. l'historique est append-only, et alimenté sans que l'appelant y pense ;
--   7. une entreprise peut porter PLUSIEURS produits — c'est le socle
--      multiproduit — mais un seul contrat ACTIF par produit ;
--   8. une remise à vie ne peut pas avoir de date de fin ;
--   9. le total après remise ne peut pas dépasser le total avant remise ;
--  10. une génération retirée dit toujours POURQUOI elle l'est.

begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

\ir fixtures/isolation_multitenant.inc

-- ── Générations : l'état posé par la migration ─────────────────────────────
select ok(
  (select vendable from public.generations_tarifaires where cle = 'CANONICAL-V4-2026-09'),
  'la génération V4 est vendable'
);
select ok(
  not (select vendable from public.generations_tarifaires where cle = 'COMPTES-PAR-FORFAIT-2026-07'),
  'la génération par forfait est retirée de la vente'
);
select isnt(
  (select motif_retrait from public.generations_tarifaires where cle = 'COMPTES-PAR-FORFAIT-2026-07'),
  null,
  'une génération retirée dit POURQUOI elle l''est'
);

-- ── 1. Un contrat nouveau ne peut relever que d'une génération vendable ────
select throws_ok(
  $$insert into public.contrats_abonnement
      (entreprise_id, produit, generation, forfait, periodicite,
       prix_forfait_ht_centimes, total_avant_remise_ht_centimes, total_apres_remise_ht_centimes,
       provenance)
    values ('a0000000-0000-0000-0000-000000000001','gestion_pro','COMPTES-PAR-FORFAIT-2026-07',
            'mini','mensuel', 7900, 7900, 7900, 'plateforme')$$,
  null,
  'une génération retirée ne peut pas fonder un contrat nouveau'
);

-- ── 2. …mais une REPRISE de contrat existant le peut ───────────────────────
insert into public.contrats_abonnement
  (id, entreprise_id, produit, generation, forfait, periodicite,
   prix_forfait_ht_centimes, total_avant_remise_ht_centimes, total_apres_remise_ht_centimes,
   provenance, stripe_price_id)
values ('c1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',
        'gestion_pro','COMPTES-PAR-FORFAIT-2026-07','mini','mensuel',
        7900, 7900, 7900, 'reprise', 'price_historique_1');
select pass('un contrat historique peut être repris sous sa propre génération');

-- ── 3-4. Les conditions souscrites sont figées ─────────────────────────────
select throws_ok(
  $$update public.contrats_abonnement
    set total_apres_remise_ht_centimes = 5000
    where id = 'c1000000-0000-0000-0000-000000000001'$$,
  null,
  'le montant souscrit ne se réécrit pas en place'
);
select throws_ok(
  $$update public.contrats_abonnement set generation = 'CANONICAL-V4-2026-09'
    where id = 'c1000000-0000-0000-0000-000000000001'$$,
  null,
  'la génération souscrite ne se réécrit pas : publier une grille ne migre personne'
);
select throws_ok(
  $$update public.contrats_abonnement set stripe_price_id = 'price_v4_nouveau'
    where id = 'c1000000-0000-0000-0000-000000000001'$$,
  null,
  'le Price souscrit est conservé : le renouvellement ne le réélit pas'
);

-- ── 5. Un contrat se clôt, il ne se supprime pas ───────────────────────────
select throws_ok(
  $$delete from public.contrats_abonnement where id = 'c1000000-0000-0000-0000-000000000001'$$,
  null,
  'un contrat ne se supprime pas'
);
update public.contrats_abonnement
  set actif = false, date_fin = current_date
  where id = 'c1000000-0000-0000-0000-000000000001';
select pass('clore un contrat reste possible : actif = false et date_fin');

-- ── 6. Historique append-only, alimenté tout seul ──────────────────────────
select cmp_ok(
  (select count(*) from public.historique_contrats_abonnement
   where contrat_id = 'c1000000-0000-0000-0000-000000000001'), '>=', 2::bigint,
  'la création puis la clôture ont laissé une trace, sans appel explicite'
);
select throws_ok(
  $$update public.historique_contrats_abonnement set motif = 'réécrit'
    where contrat_id = 'c1000000-0000-0000-0000-000000000001'$$,
  null,
  'un snapshot d''historique ne se réécrit pas'
);
select throws_ok(
  $$delete from public.historique_contrats_abonnement
    where contrat_id = 'c1000000-0000-0000-0000-000000000001'$$,
  null,
  'un snapshot d''historique ne s''efface pas'
);

-- ── 7. Socle multiproduit ──────────────────────────────────────────────────
insert into public.contrats_abonnement
  (entreprise_id, produit, generation, forfait, periodicite,
   prix_forfait_ht_centimes, total_avant_remise_ht_centimes, total_apres_remise_ht_centimes)
values ('a0000000-0000-0000-0000-000000000001','gestion_pro','CANONICAL-V4-2026-09',
        'pro','mensuel', 24900, 24900, 24900);

insert into public.generations_tarifaires (cle, produit, libelle, vendable)
values ('RESERVES-V1-2026-09','reserves','Grille Réserves V1', true)
on conflict (cle) do nothing;

insert into public.contrats_abonnement
  (entreprise_id, produit, generation, forfait, periodicite,
   prix_forfait_ht_centimes, total_avant_remise_ht_centimes, total_apres_remise_ht_centimes)
values ('a0000000-0000-0000-0000-000000000001','reserves','RESERVES-V1-2026-09',
        'standard','mensuel', 4900, 4900, 4900);
select pass('une entreprise porte plusieurs produits en même temps');

select throws_ok(
  $$insert into public.contrats_abonnement
      (entreprise_id, produit, generation, forfait, periodicite,
       prix_forfait_ht_centimes, total_avant_remise_ht_centimes, total_apres_remise_ht_centimes)
    values ('a0000000-0000-0000-0000-000000000001','gestion_pro','CANONICAL-V4-2026-09',
            'business','mensuel', 44900, 44900, 44900)$$,
  null,
  'mais un seul contrat ACTIF par produit'
);

-- ── 8-9. Cohérence des remises et des totaux ───────────────────────────────
select throws_ok(
  $$insert into public.contrats_abonnement
      (entreprise_id, produit, generation, forfait, periodicite,
       prix_forfait_ht_centimes, total_avant_remise_ht_centimes, total_apres_remise_ht_centimes,
       remise_a_vie, remise_fin)
    values ('b0000000-0000-0000-0000-000000000001','gestion_pro','CANONICAL-V4-2026-09',
            'mini','mensuel', 7900, 7900, 7000, true, '2027-01-01')$$,
  null,
  'une remise à vie n''a pas de date de fin'
);
select throws_ok(
  $$insert into public.contrats_abonnement
      (entreprise_id, produit, generation, forfait, periodicite,
       prix_forfait_ht_centimes, total_avant_remise_ht_centimes, total_apres_remise_ht_centimes)
    values ('b0000000-0000-0000-0000-000000000001','gestion_pro','CANONICAL-V4-2026-09',
            'mini','mensuel', 7900, 7900, 9000)$$,
  null,
  'le total après remise ne dépasse jamais le total avant remise'
);

select finish();
rollback;
