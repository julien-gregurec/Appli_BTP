-- =====================================================================================================
-- PREUVE pgTAP — correctif de la migration 20260914000296 : « permission denied for function
-- recalc_totaux_facture » à l'enregistrement d'une facture brouillon existante.
--
-- Root cause (voir l'audit en tête de la migration) : `modifier_facture_brouillon` (SECURITY INVOKER)
-- appelait directement `recalc_totaux_facture` (SECURITY DEFINER, EXECUTE révoqué à `authenticated` par
-- la 20260902000255) — appel exécuté avec les privilèges de l'appelant, donc refusé. Le recalcul se fait
-- en réalité déjà, en toute sécurité, via le déclencheur `recalc_facture_apres_ligne` (SECURITY DEFINER)
-- posé sur `lignes_factures` : l'appel direct, retiré par la 296, était strictement redondant. AUCUN
-- nouveau privilège n'est accordé par le correctif — ce fichier le prouve.
-- =====================================================================================================
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

\ir fixtures/isolation_multitenant.inc

create or replace function pg_temp.jwt(p_sub uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_sub::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
end $$;

-- Le poste « Comptable » du jeu d'isolation (acces_factures, gerer_factures, acces_achats, gerer_achats,
-- acces_exports, acces_rentabilite, voir_rentabilite) n'a PAS acces_clients ni acces_chantiers : dans
-- l'application réelle, il ne pourrait donc pas non plus lire le client ou le chantier d'une facture —
-- ce n'est pas une restriction propre à `modifier_facture_brouillon`. On complète ce poste, pour CE
-- fichier de test seulement, avec exactement les deux permissions de LECTURE nécessaires pour incarner un
-- comptable qui facture réellement (persona réaliste, toujours pas administrateur) : ni plus, ni moins.
insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
values
  ('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000005', 'acces_clients', true),
  ('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000005', 'acces_chantiers', true),
  ('b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000005', 'acces_clients', true),
  ('b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000005', 'acces_chantiers', true)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- A. Droits d'exécution — l'état voulu, exactement (principe de moindre privilège)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────

-- `recalc_totaux_facture` : AUCUN rôle client ne peut l'appeler directement, ni avant ni après ce
-- correctif — seul le déclencheur y accède, avec les privilèges de son propriétaire.
select is(has_function_privilege('anon', 'public.recalc_totaux_facture(uuid)', 'execute'), false,
  'anon ne peut pas appeler recalc_totaux_facture directement');
select is(has_function_privilege('authenticated', 'public.recalc_totaux_facture(uuid)', 'execute'), false,
  'authenticated ne peut pas appeler recalc_totaux_facture directement (PAS de GRANT ajouté par le correctif)');
select is(has_function_privilege('service_role', 'public.recalc_totaux_facture(uuid)', 'execute'), false,
  'service_role ne peut pas appeler recalc_totaux_facture directement');
select is((select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'recalc_totaux_facture'), true,
  'recalc_totaux_facture reste SECURITY DEFINER');
select is((select 'search_path=public' = any(proconfig) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'recalc_totaux_facture'), true,
  'search_path de recalc_totaux_facture reste figé');

-- Le déclencheur lui-même : jamais appelable directement non plus.
select is(has_function_privilege('anon', 'public.trg_recalc_facture()', 'execute'), false, 'anon ne peut pas appeler le déclencheur directement');
select is(has_function_privilege('authenticated', 'public.trg_recalc_facture()', 'execute'), false, 'authenticated ne peut pas appeler le déclencheur directement');
select is(has_function_privilege('anon', 'public.trg_recalc_facture_apres_remise()', 'execute'), false, 'anon ne peut pas appeler le second déclencheur directement');
select is(has_function_privilege('authenticated', 'public.trg_recalc_facture_apres_remise()', 'execute'), false, 'authenticated ne peut pas appeler le second déclencheur directement');

-- `modifier_facture_brouillon` : EXECUTE inchangé par le correctif (déjà accordé à `authenticated` seul,
-- avant comme après — on ne le réaccorde pas, on ne le retire pas).
select is(has_function_privilege('anon', 'public.modifier_facture_brouillon(uuid, jsonb, jsonb)', 'execute'), false,
  'anon ne peut toujours pas appeler modifier_facture_brouillon (inchangé)');
select is(has_function_privilege('authenticated', 'public.modifier_facture_brouillon(uuid, jsonb, jsonb)', 'execute'), true,
  'authenticated peut toujours appeler modifier_facture_brouillon (inchangé)');
select is(has_function_privilege('service_role', 'public.modifier_facture_brouillon(uuid, jsonb, jsonb)', 'execute'), false,
  'service_role ne peut toujours pas appeler modifier_facture_brouillon (inchangé)');

-- Comparaison au modèle (recalc_totaux_devis, même traitement par la 255) : toujours vrai après ce correctif,
-- qui ne touche à rien côté devis.
select is(has_function_privilege('authenticated', 'public.recalc_totaux_devis(uuid)', 'execute'), false,
  'même politique que le modèle devis : authenticated sans EXECUTE direct sur recalc_totaux_devis');

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- B. Fixture : deux factures brouillon (A et B), chacune avec une ligne existante.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
insert into public.factures (id, entreprise_id, numero, client_id, chantier_id, statut, type, montant_ht, montant_tva, montant_ttc)
values
  ('af000000-0000-0000-0000-000000000296', 'a0000000-0000-0000-0000-000000000001', null, 'a3000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'brouillon', 'simple', 0, 0, 0),
  ('bf000000-0000-0000-0000-000000000296', 'b0000000-0000-0000-0000-000000000001', null, 'b3000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 'brouillon', 'simple', 0, 0, 0);

insert into public.lignes_factures (facture_id, designation, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre)
values ('af000000-0000-0000-0000-000000000296', 'Ligne initiale', 'fourniture', 1, 'u', 100, 0, 20, 1000);
-- La ligne initiale a déclenché le trigger : preuve que le déclencheur seul (aucun appel direct
-- nécessaire) recalcule déjà correctement au moment de l'insertion, avant même tout test de la RPC.
select is((select montant_ht from public.factures where id = 'af000000-0000-0000-0000-000000000296'), 100.00::numeric,
  'préalable : le déclencheur seul recalcule déjà 100,00 HT après l''insertion directe de la ligne');

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- C. Utilisateur autorisé (comptable A : acces_factures + gerer_factures, pas administrateur) — peut
--    enregistrer/recalculer une facture existante : quantité, prix, remise, TVA.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
set local role authenticated;
select pg_temp.jwt('10000000-0000-0000-0000-000000000005');
select lives_ok($$select public.modifier_facture_brouillon('af000000-0000-0000-0000-000000000296',
  '{"client_id":"a3000000-0000-0000-0000-000000000001","chantier_id":"a4000000-0000-0000-0000-000000000001","type":"simple"}'::jsonb,
  '[{"designation":"Ligne modifiée","type":"fourniture","quantite":3,"unite":"u","prix_unitaire_ht":150,"remise_ligne":10,"taux_tva":5.5,"ordre":1000}]'::jsonb)$$,
  'le comptable A (gerer_factures, pas admin) enregistre sa facture brouillon SANS erreur de permission');
reset role;
-- 3 × 150 × (1 - 10 %) = 405,00 HT ; TVA 5,5 % = 22,275 → 22,28 arrondi ; TTC = 427,28.
select is((select montant_ht from public.factures where id = 'af000000-0000-0000-0000-000000000296'), 405.00::numeric,
  'totaux recalculés : 405,00 HT (quantité, prix et remise pris en compte)');
select is((select montant_tva from public.factures where id = 'af000000-0000-0000-0000-000000000296'), 22.28::numeric,
  'totaux recalculés : TVA à 5,5 % correctement appliquée');
select is((select montant_ttc from public.factures where id = 'af000000-0000-0000-0000-000000000296'), 427.28::numeric,
  'totaux recalculés : TTC cohérent');
select is((select count(*)::int from public.lignes_factures where facture_id = 'af000000-0000-0000-0000-000000000296'), 1,
  'une seule ligne (l''ancienne a bien été remplacée, pas cumulée)');
select is((select designation from public.lignes_factures where facture_id = 'af000000-0000-0000-0000-000000000296'), 'Ligne modifiée',
  'persistance : la nouvelle désignation est bien celle enregistrée');

-- Remise à zéro lignes : totaux à zéro (cas limite du déclencheur, aucune ligne restante).
set local role authenticated;
select pg_temp.jwt('10000000-0000-0000-0000-000000000005');
select lives_ok($$select public.modifier_facture_brouillon('af000000-0000-0000-0000-000000000296',
  '{"client_id":"a3000000-0000-0000-0000-000000000001","type":"simple"}'::jsonb, '[]'::jsonb)$$,
  'vider toutes les lignes ne lève pas d''erreur de permission non plus');
reset role;
select is((select montant_ht from public.factures where id = 'af000000-0000-0000-0000-000000000296'), 0.00::numeric,
  'sans ligne restante, les totaux retombent à zéro (dernière suppression recalculée par le déclencheur)');

-- Remet une ligne pour la suite des scénarios (persistance après relecture, notamment).
set local role authenticated;
select pg_temp.jwt('10000000-0000-0000-0000-000000000005');
select lives_ok($$select public.modifier_facture_brouillon('af000000-0000-0000-0000-000000000296',
  '{"client_id":"a3000000-0000-0000-0000-000000000001","type":"simple"}'::jsonb,
  '[{"designation":"Ligne finale","type":"fourniture","quantite":2,"unite":"u","prix_unitaire_ht":50,"remise_ligne":0,"taux_tva":20,"ordre":1000}]'::jsonb)$$,
  'ré-enregistrement après le cas limite : toujours sans erreur de permission');
reset role;
select is((select montant_ht from public.factures where id = 'af000000-0000-0000-0000-000000000296'), 100.00::numeric,
  'persistance après relecture (nouvelle session implicite via reset role) : 100,00 HT');

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- D. Utilisateur non autorisé (ouvrier A : membre actif, mais sans gerer_factures) — ne contourne rien.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
set local role authenticated;
select pg_temp.jwt('10000000-0000-0000-0000-000000000002');
select is(public.a_permission('a0000000-0000-0000-0000-000000000001', 'gerer_factures'), false,
  'préalable : ouvrier A n''a explicitement pas gerer_factures');
-- La RLS (et non plus un refus d'EXECUTE, puisque authenticated a EXECUTE sur la RPC) bloque la relecture
-- verrouillante (`for update`) : la ligne n'est pour lui pas visible en écriture, la fonction lève
-- « Facture introuvable » — aucune fuite de la cause réelle (droit insuffisant) ni des données.
select throws_ok($$select public.modifier_facture_brouillon('af000000-0000-0000-0000-000000000296',
  '{"client_id":"a3000000-0000-0000-0000-000000000001","type":"simple"}'::jsonb,
  '[{"designation":"Fraude","type":"fourniture","quantite":999,"unite":"u","prix_unitaire_ht":999,"remise_ligne":0,"taux_tva":20,"ordre":1000}]'::jsonb)$$,
  'Facture introuvable', 'ouvrier A (sans gerer_factures) ne peut pas modifier la facture de son entreprise');
reset role;
select is((select montant_ht from public.factures where id = 'af000000-0000-0000-0000-000000000296'), 100.00::numeric,
  'les totaux n''ont pas bougé après la tentative refusée : aucun contournement');
select is((select count(*)::int from public.lignes_factures where facture_id = 'af000000-0000-0000-0000-000000000296' and designation = 'Fraude'), 0,
  'aucune ligne frauduleuse insérée');

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- E. anon — aucun droit inattendu (refus au niveau de la fonction elle-même, avant toute RLS).
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
set local role anon;
select throws_ok($$select public.modifier_facture_brouillon('af000000-0000-0000-0000-000000000296',
  '{"client_id":"a3000000-0000-0000-0000-000000000001","type":"simple"}'::jsonb, '[]'::jsonb)$$,
  '42501', null, 'anon : refus d''exécution (permission denied for function), avant toute évaluation RLS');
reset role;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- F. Autre entreprise — aucun accès cross-tenant, ni en lecture ni en recalcul.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
set local role authenticated;
select pg_temp.jwt('20000000-0000-0000-0000-000000000005'); -- comptable B : a gerer_factures, mais côté B.
select throws_ok($$select public.modifier_facture_brouillon('af000000-0000-0000-0000-000000000296',
  '{"client_id":"b3000000-0000-0000-0000-000000000001","type":"simple"}'::jsonb,
  '[{"designation":"Vol B","type":"fourniture","quantite":1,"unite":"u","prix_unitaire_ht":1,"remise_ligne":0,"taux_tva":20,"ordre":1000}]'::jsonb)$$,
  'Facture introuvable', 'le comptable B (droit gerer_factures, mais autre entreprise) ne voit pas la facture de A');
reset role;
select is((select montant_ht from public.factures where id = 'af000000-0000-0000-0000-000000000296'), 100.00::numeric,
  'la facture de A est intacte après la tentative cross-tenant de B');
select is((select count(*)::int from public.lignes_factures where facture_id = 'af000000-0000-0000-0000-000000000296' and designation = 'Vol B'), 0,
  'aucune ligne de B insérée dans la facture de A');

-- Symétrique : A ne peut pas davantage toucher la facture de B.
set local role authenticated;
select pg_temp.jwt('10000000-0000-0000-0000-000000000005');
select throws_ok($$select public.modifier_facture_brouillon('bf000000-0000-0000-0000-000000000296',
  '{"client_id":"a3000000-0000-0000-0000-000000000001","type":"simple"}'::jsonb, '[]'::jsonb)$$,
  'Facture introuvable', 'le comptable A ne voit pas la facture brouillon de B (symétrique)');
reset role;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- G. Droits « coûts » — hors sujet par construction pour les factures : ni `lignes_factures` ni
--    `factures` ne portent de colonne de coût ou de marge (vérifié sur le schéma) ; `recalc_totaux_facture`
--    ne lit que prix de vente, quantité, remise et TVA. Le correctif ne peut donc exposer aucune donnée
--    de coût supplémentaire, à qui que ce soit — assertion de schéma, pas de comportement.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
select is((select count(*)::int from information_schema.columns
           where table_schema = 'public' and table_name in ('factures', 'lignes_factures')
             and (column_name ilike '%cout%' or column_name ilike '%marge%' or column_name ilike '%achat%')), 0,
  'ni factures ni lignes_factures ne portent de colonne de coût, marge ou prix d''achat');

select finish();
rollback;
