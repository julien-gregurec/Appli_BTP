-- [CONVERGENCE TRAIN] Porte depuis claude/beautiful-franklin-7hwzq0 (SHA
-- 56aa747958a480d484ddf3d71d25e1efc539d99, PERFORMANCE QUALIFIED). Renumerotation
-- des migrations referencees ci-dessous : 20260922000316 -> 20260922000318,
-- 20260922000317 (dashboard) -> 20260922000319, 20260922000318 -> 20260922000320
-- dans le ledger de ce train (claude/compassionate-euler-5j6avr).

-- ELSATIA-GP-DASHBOARD-SEARCH-PERFORMANCE-V1 : correction du Dashboard
-- (20260922000318/319). Vérifie que la nouvelle RPC dashboard_indicateurs()
-- reproduit exactement les agrégats que la page calculait auparavant en
-- JavaScript à partir d'un chargement complet, et que le cache
-- entreprises_dashboard_cache reste cohérent avec un recalcul manuel après
-- écriture — et que le cloisonnement tenant tient (permission par domaine,
-- jamais les données de l'autre entreprise).
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

\ir fixtures/isolation_multitenant.inc

-- La fixture d'isolation pose déjà un devis 'accepte' (120 TTC) et une
-- facture 'envoyee' (120 TTC, 0 payé) pour l'entreprise A.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

-- 1. Le total "devis acceptés" du cache correspond au recalcul manuel.
select is(
  ((public.dashboard_indicateurs('a0000000-0000-0000-0000-000000000001', current_date))->>'devis_acceptes_total')::numeric,
  (select coalesce(sum(montant_ttc), 0) from public.devis where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut = 'accepte'),
  '1. devis_acceptes_total == SUM(montant_ttc) WHERE statut=accepte (recalcul manuel)'
);

-- 2. Le total facturé (hors annulée) correspond au recalcul manuel.
select is(
  ((public.dashboard_indicateurs('a0000000-0000-0000-0000-000000000001', current_date))->>'factures_total')::numeric,
  (select coalesce(sum(montant_ttc), 0) from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and statut <> 'annulee'),
  '2. factures_total == SUM(montant_ttc) WHERE statut<>annulee (recalcul manuel)'
);

-- 3. Insertion d'un nouveau devis accepté : le cache suit immédiatement
-- (maintenance incrémentale par trigger, pas seulement le backfill initial).
insert into public.devis (id, entreprise_id, client_id, statut, montant_ht, montant_tva, montant_ttc)
values ('ac000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'accepte', 500, 100, 600);

select is(
  ((public.dashboard_indicateurs('a0000000-0000-0000-0000-000000000001', current_date))->>'devis_acceptes_total')::numeric,
  720::numeric,
  '3. Un nouveau devis accepté (600) s''ajoute immédiatement au total en cache (120 préexistant + 600)'
);

-- 4. ... et un devis inséré directement dans un autre statut ne bouge pas
-- le total (le trigger ne compte que statut = 'accepte', pas de faux
-- positif). Un devis accepté est ensuite verrouillé (verrou_devis_accepte
-- interdit UPDATE/DELETE) : le scénario "redescend après coup" n'est pas
-- un cas métier atteignable pour les devis, donc pas testé ici.
insert into public.devis (id, entreprise_id, client_id, statut, montant_ht, montant_tva, montant_ttc)
values ('ac000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'envoye', 800, 160, 960);
select is(
  ((public.dashboard_indicateurs('a0000000-0000-0000-0000-000000000001', current_date))->>'devis_acceptes_total')::numeric,
  720::numeric,
  '4. Un devis inséré à l''état "envoyé" (non accepté) ne modifie pas le total en cache'
);

-- 5. Un paiement partiel met à jour factures_encaisse_total immédiatement.
update public.factures set montant_paye = 50 where id = 'aa000000-0000-0000-0000-000000000001';
select is(
  ((public.dashboard_indicateurs('a0000000-0000-0000-0000-000000000001', current_date))->>'factures_encaisse_total')::numeric,
  50::numeric,
  '5. factures_encaisse_total reflète immédiatement le paiement partiel'
);

-- 6-7. Isolation : un utilisateur A n'obtient jamais les chiffres de B.
select isnt(
  ((public.dashboard_indicateurs('a0000000-0000-0000-0000-000000000001', current_date))->>'devis_acceptes_total')::numeric,
  ((public.dashboard_indicateurs('b0000000-0000-0000-0000-000000000001', current_date))->>'devis_acceptes_total')::numeric,
  '6. Les totaux A et B diffèrent (pas de fuite silencieuse par confusion de scope)'
);
-- a_permission() est permissif par conception ici (pas de raise) : demander
-- l'entreprise B depuis un contexte A renvoie des champs vides plutôt que
-- les données de B, jamais une erreur qui laisserait deviner leur existence
-- autrement que par ce comportement documenté des RPC de liste.
select ok(
  (public.dashboard_indicateurs('b0000000-0000-0000-0000-000000000001', current_date)) ? 'devis_acceptes_total'
  and ((public.dashboard_indicateurs('b0000000-0000-0000-0000-000000000001', current_date))->'devis_acceptes_total') = 'null'::jsonb,
  '7. Entreprise B demandée depuis un contexte A : champs devis vides (aucune permission A sur B), jamais les vrais chiffres de B'
);

-- 8-9. Aucun accès direct au cache pour authenticated (seule la RPC, qui
-- fait le contrôle de permission, peut le lire).
select throws_ok(
  $$select * from public.entreprises_dashboard_cache$$,
  '42501',
  null,
  '8. authenticated ne peut pas lire entreprises_dashboard_cache directement'
);
select throws_ok(
  $$update public.entreprises_dashboard_cache set devis_acceptes_total = 999999$$,
  '42501',
  null,
  '9. authenticated ne peut pas écrire entreprises_dashboard_cache directement'
);

-- 10-13. Changement direct d'entreprise_id sur une facture brouillon
-- (correctif 20260922000320, qualification finale § 12.3 du rapport de
-- mission — reproduit avant correctif : les deux caches restaient
-- incohérents, l'ancien tenant gardait la facture à son crédit, le nouveau
-- ne la voyait jamais). Effectué hors RLS (rôle propriétaire) : ce test
-- isole la correction du trigger, indépendamment de qui a le droit
-- d'effectuer une telle mutation (déjà audité séparément, § 12.5/§ 8.4 du
-- rapport — la contrainte composite factures_client_entreprise_fkey exige
-- de changer client_id en même temps, seule protection structurelle dédiée
-- à ce jour).
reset role;
set local role supabase_migrator;

insert into public.factures (id, entreprise_id, client_id, statut, montant_ht, montant_tva, montant_ttc, montant_paye)
values ('ae000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'brouillon', 1000, 200, 1200, 0);

select is(
  (select factures_total from public.entreprises_dashboard_cache where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
  (select coalesce(sum(montant_ttc) filter (where statut <> 'annulee'), 0) from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
  '10. Cache tenant A cohérent juste après création de la facture brouillon (avant mutation)'
);

-- Capture le total B AVANT le déplacement (B a déjà ses propres factures
-- dans la fixture d'isolation : ne pas supposer que B part de zéro).
create temp table _qual_cache_b_avant as
select factures_total as v from public.entreprises_dashboard_cache where entreprise_id = 'b0000000-0000-0000-0000-000000000001';

update public.factures
set entreprise_id = 'b0000000-0000-0000-0000-000000000001', client_id = 'b3000000-0000-0000-0000-000000000001'
where id = 'ae000000-0000-0000-0000-000000000001';

select is(
  (select factures_total from public.entreprises_dashboard_cache where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
  (select coalesce(sum(montant_ttc) filter (where statut <> 'annulee'), 0) from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
  '11. ANCIEN tenant (A) : cache débité, cohérent avec le recalcul canonique après le changement d''entreprise'
);
select is(
  (select factures_total from public.entreprises_dashboard_cache where entreprise_id = 'b0000000-0000-0000-0000-000000000001'),
  (select coalesce(sum(montant_ttc) filter (where statut <> 'annulee'), 0) from public.factures where entreprise_id = 'b0000000-0000-0000-0000-000000000001'),
  '12. NOUVEAU tenant (B) : cache crédité, cohérent avec le recalcul canonique après le changement d''entreprise'
);
select is(
  (select factures_total from public.entreprises_dashboard_cache where entreprise_id = 'b0000000-0000-0000-0000-000000000001') - (select v from _qual_cache_b_avant),
  1200::numeric,
  '13. NOUVEAU tenant (B) : le montant complet de la facture déplacée (1200) s''ajoute, pas un delta net partiel'
);

select * from finish();
rollback;
