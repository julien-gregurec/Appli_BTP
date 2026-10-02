-- ELSATIA-GP-POINTAGES-FACTURE-FIX-V1 — B2 : modification d'une facture
-- brouillon sous le rôle `authenticated` (chemin réel de modifierFactureAction).
--
-- Avant correctif : `modifier_facture_brouillon` appelait directement
-- recalc_totaux_facture, dont `authenticated` n'a plus le droit EXECUTE depuis
-- 20260902000255 → « permission denied for function recalc_totaux_facture ».
-- Correctif : 20260930000102 (totaux recalculés par le trigger de lignes).
--
-- Matrice : brouillon modifiable (même entreprise, deux profils autorisés),
-- totaux exacts ; autre entreprise refusée ; profils sans droit refusés ;
-- facture émise / payée / annulée immuables (RPC, UPDATE, lignes) ; droits
-- non rouverts (recalc_totaux_facture toujours fermé, RPC toujours INVOKER,
-- anon toujours sans EXECUTE).
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

\ir fixtures/isolation_multitenant.inc

-- Factures de départ (superutilisateur, hors RLS).
insert into public.factures (id, entreprise_id, client_id, chantier_id, statut, type) values
  ('fb000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'brouillon', 'simple'),
  ('fb000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', null, 'brouillon', 'simple'),
  ('fb000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', null, 'brouillon', 'simple'),
  ('fb000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', null, 'brouillon', 'simple'),
  ('fb000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', null, 'brouillon', 'simple');
insert into public.lignes_factures (facture_id, designation, quantite, prix_unitaire_ht, taux_tva, ordre)
select id, 'Ligne initiale', 1, 10, 20, 0 from public.factures where id::text like 'fb000000-%';

-- Émission (envoyee), paiement complet (payee) et annulation (annulee).
update public.factures set statut = 'envoyee' where id in ('fb000000-0000-0000-0000-000000000002', 'fb000000-0000-0000-0000-000000000003', 'fb000000-0000-0000-0000-000000000004');
insert into public.paiements (facture_id, montant) values ('fb000000-0000-0000-0000-000000000003', 12);
update public.factures set statut = 'annulee' where id = 'fb000000-0000-0000-0000-000000000004';

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Droits : rien n'a été rouvert.
-- ───────────────────────────────────────────────────────────────────────────
select is(has_function_privilege('authenticated', 'public.recalc_totaux_facture(uuid)', 'execute'), false,
  '1. authenticated n''a toujours PAS EXECUTE sur recalc_totaux_facture (ACL 255 conservée)');
select is(has_function_privilege('anon', 'public.modifier_facture_brouillon(uuid, jsonb, jsonb)', 'execute'), false,
  '2. anon n''a pas EXECUTE sur modifier_facture_brouillon');
select is(has_function_privilege('authenticated', 'public.modifier_facture_brouillon(uuid, jsonb, jsonb)', 'execute'), true,
  '3. authenticated garde EXECUTE sur modifier_facture_brouillon');
select is((select prosecdef from pg_proc where oid = 'public.modifier_facture_brouillon(uuid, jsonb, jsonb)'::regprocedure), false,
  '4. modifier_facture_brouillon reste SECURITY INVOKER (RLS de l''appelant appliquée)');

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Brouillon modifiable par le dirigeant A (chemin réel de l'éditeur).
-- ───────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);

select lives_ok($$
  select public.modifier_facture_brouillon('fb000000-0000-0000-0000-000000000001',
    '{"client_id":"a3000000-0000-0000-0000-000000000001","chantier_id":"a4000000-0000-0000-0000-000000000001","type":"simple","date_emission":"2026-09-01","date_echeance":"2026-10-01","notes_client":"Merci","notes_internes":"interne"}'::jsonb,
    '[{"designation":"Maçonnerie","description":null,"type":"main_oeuvre","quantite":3,"unite":"h","prix_unitaire_ht":45.5,"remise_ligne":10,"taux_tva":10,"ordre":0},
      {"designation":"Parpaings","description":"20x20x50","type":"fourniture","quantite":120,"unite":"u","prix_unitaire_ht":1.37,"remise_ligne":0,"taux_tva":20,"ordre":1}]'::jsonb)
$$, '5. dirigeant A : enregistrement d''une facture brouillon réussi (était « permission denied »)');

select is((select count(*)::int from public.lignes_factures where facture_id = 'fb000000-0000-0000-0000-000000000001'), 2,
  '6. les lignes sont remplacées (2 nouvelles lignes, l''ancienne supprimée)');
-- 3 × 45,5 × 0,9 = 122,85 (TVA 10 % = 12,285) ; 120 × 1,37 = 164,40 (TVA 20 % = 32,88).
select is((select montant_ht from public.factures where id = 'fb000000-0000-0000-0000-000000000001'), 287.25::numeric, '7. montant HT recalculé (287,25)');
select is((select montant_tva from public.factures where id = 'fb000000-0000-0000-0000-000000000001'), 45.17::numeric, '8. montant TVA recalculé (45,17)');
select is((select montant_ttc from public.factures where id = 'fb000000-0000-0000-0000-000000000001'), 332.42::numeric, '9. montant TTC recalculé (332,42)');
select is((select notes_client || '|' || date_echeance::text from public.factures where id = 'fb000000-0000-0000-0000-000000000001'), 'Merci|2026-10-01',
  '10. en-tête de facture mis à jour');
select is((select statut from public.factures where id = 'fb000000-0000-0000-0000-000000000001'), 'brouillon', '11. la facture reste brouillon');

-- Même entreprise, second profil autorisé (administrateur A).
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$
  select public.modifier_facture_brouillon('fb000000-0000-0000-0000-000000000001',
    '{"client_id":"a3000000-0000-0000-0000-000000000001","type":"simple"}'::jsonb,
    '[{"designation":"Forfait","type":"forfait","quantite":1,"unite":"u","prix_unitaire_ht":1000,"remise_ligne":0,"taux_tva":20,"ordre":0}]'::jsonb)
$$, '12. administrateur A (même entreprise) : modification réussie');
select is((select montant_ttc from public.factures where id = 'fb000000-0000-0000-0000-000000000001'), 1200::numeric, '13. totaux recalculés après la 2e modification (1 200 TTC)');
select is((select chantier_id from public.factures where id = 'fb000000-0000-0000-0000-000000000001'), null::uuid, '14. chantier retiré comme demandé');

-- Aucune ligne : montants remis à zéro, comme recalc_totaux_facture.
select lives_ok($$
  select public.modifier_facture_brouillon('fb000000-0000-0000-0000-000000000001',
    '{"client_id":"a3000000-0000-0000-0000-000000000001","type":"simple"}'::jsonb, '[]'::jsonb)
$$, '15. enregistrement sans ligne accepté par la RPC');
select is((select montant_ht + montant_tva + montant_ttc from public.factures where id = 'fb000000-0000-0000-0000-000000000001'), 0::numeric,
  '16. sans ligne : montants à 0');
select lives_ok($$
  select public.modifier_facture_brouillon('fb000000-0000-0000-0000-000000000001',
    '{"client_id":"a3000000-0000-0000-0000-000000000001","type":"simple"}'::jsonb, '[]'::jsonb)
$$, '17. aucune ligne avant ni après : toujours accepté');
select is((select montant_ttc from public.factures where id = 'fb000000-0000-0000-0000-000000000001'), 0::numeric, '18. montants toujours à 0');

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Facture émise / payée / annulée : immuables.
-- ───────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select throws_like($$
  select public.modifier_facture_brouillon('fb000000-0000-0000-0000-000000000002',
    '{"client_id":"a3000000-0000-0000-0000-000000000001","type":"simple"}'::jsonb,
    '[{"designation":"Fraude","type":"forfait","quantite":1,"unite":"u","prix_unitaire_ht":1,"remise_ligne":0,"taux_tva":20,"ordre":0}]'::jsonb)
$$, '%Seule une facture brouillon%', '19. facture émise (envoyee) : RPC refusée');
select throws_like($$
  select public.modifier_facture_brouillon('fb000000-0000-0000-0000-000000000003',
    '{"client_id":"a3000000-0000-0000-0000-000000000001","type":"simple"}'::jsonb, '[]'::jsonb)
$$, '%Seule une facture brouillon%', '20. facture payée : RPC refusée');
select throws_like($$
  select public.modifier_facture_brouillon('fb000000-0000-0000-0000-000000000004',
    '{"client_id":"a3000000-0000-0000-0000-000000000001","type":"simple"}'::jsonb, '[]'::jsonb)
$$, '%Seule une facture brouillon%', '21. facture annulée (figée) : RPC refusée');
select throws_like($$update public.factures set montant_ht = 1 where id = 'fb000000-0000-0000-0000-000000000002'$$,
  '%déjà été émise%', '22. facture émise : UPDATE direct du montant refusé');
select throws_like($$delete from public.lignes_factures where facture_id = 'fb000000-0000-0000-0000-000000000002'$$,
  '%', '23. facture émise : suppression directe de ses lignes refusée');
select throws_like($$insert into public.lignes_factures (facture_id, designation, quantite, prix_unitaire_ht) values ('fb000000-0000-0000-0000-000000000003', 'Ajout', 1, 1)$$,
  '%', '24. facture payée : ajout direct de ligne refusé');
select throws_ok($$select public.recalc_totaux_facture('fb000000-0000-0000-0000-000000000002')$$, '42501', null,
  '25. appel direct à recalc_totaux_facture toujours refusé (42501)');

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Autre entreprise et profils sans droit.
-- ───────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select throws_like($$
  select public.modifier_facture_brouillon('fb000000-0000-0000-0000-000000000001',
    '{"client_id":"a3000000-0000-0000-0000-000000000001","type":"simple"}'::jsonb,
    '[{"designation":"Intrusion","type":"forfait","quantite":1,"unite":"u","prix_unitaire_ht":999,"remise_ligne":0,"taux_tva":20,"ordre":0}]'::jsonb)
$$, '%Facture introuvable%', '26. dirigeant B (tous droits chez B) : facture brouillon de A introuvable');
select throws_like($$
  select public.modifier_facture_brouillon('fb000000-0000-0000-0000-00000000000b',
    '{"client_id":"a3000000-0000-0000-0000-000000000001","type":"simple"}'::jsonb, '[]'::jsonb)
$$, '%Client introuvable%', '27. dirigeant B : impossible de rattacher un client de A à sa propre facture');
select lives_ok($$
  select public.modifier_facture_brouillon('fb000000-0000-0000-0000-00000000000b',
    '{"client_id":"b3000000-0000-0000-0000-000000000001","type":"simple"}'::jsonb,
    '[{"designation":"B","type":"forfait","quantite":2,"unite":"u","prix_unitaire_ht":50,"remise_ligne":0,"taux_tva":20,"ordre":0}]'::jsonb)
$$, '28. dirigeant B : sa propre facture brouillon reste modifiable');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_like($$
  select public.modifier_facture_brouillon('fb000000-0000-0000-0000-000000000001',
    '{"client_id":"a3000000-0000-0000-0000-000000000001","type":"simple"}'::jsonb, '[]'::jsonb)
$$, '%Facture introuvable%', '29. ouvrier A (sans acces_factures) : refusé');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select throws_like($$
  select public.modifier_facture_brouillon('fb000000-0000-0000-0000-000000000001',
    '{"client_id":"a3000000-0000-0000-0000-000000000001","type":"simple"}'::jsonb, '[]'::jsonb)
$$, '%Facture introuvable%', '30. conducteur A (sans acces_factures) : refusé');

reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok($$
  select public.modifier_facture_brouillon('fb000000-0000-0000-0000-000000000001',
    '{"client_id":"a3000000-0000-0000-0000-000000000001","type":"simple"}'::jsonb, '[]'::jsonb)
$$, '42501', null, '31. anon : EXECUTE refusé');
reset role;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. État final : rien n'a bougé là où c'était refusé.
-- ───────────────────────────────────────────────────────────────────────────
select is((select montant_ttc from public.factures where id = 'fb000000-0000-0000-0000-000000000002'), 12::numeric,
  '32. facture émise : montant TTC inchangé (12)');
select is((select string_agg(designation, ',') from public.lignes_factures where facture_id in ('fb000000-0000-0000-0000-000000000002', 'fb000000-0000-0000-0000-000000000003', 'fb000000-0000-0000-0000-000000000004')),
  'Ligne initiale,Ligne initiale,Ligne initiale', '33. lignes des factures émise/payée/annulée inchangées');
select is((select montant_ttc from public.factures where id = 'fb000000-0000-0000-0000-00000000000b'), 120::numeric,
  '34. facture B : totaux recalculés pour son propriétaire (120)');

select * from finish();
rollback;
