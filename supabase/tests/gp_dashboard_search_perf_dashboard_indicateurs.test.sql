-- ELSATIA-GP-DASHBOARD-SEARCH-PERFORMANCE-V1 : correction du Dashboard
-- (20260922000316/317). Vérifie que la nouvelle RPC dashboard_indicateurs()
-- reproduit exactement les agrégats que la page calculait auparavant en
-- JavaScript à partir d'un chargement complet, et que le cache
-- entreprises_dashboard_cache reste cohérent avec un recalcul manuel après
-- écriture — et que le cloisonnement tenant tient (permission par domaine,
-- jamais les données de l'autre entreprise).
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

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

select * from finish();
rollback;
