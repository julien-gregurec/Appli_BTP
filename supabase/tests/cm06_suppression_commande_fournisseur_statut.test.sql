-- CM-06 : garde-fou DB trg_commande_fournisseur_suppression_statut (20260923000326).
-- Matrice demandée : brouillon supprimable / annulee supprimable / tout autre
-- statut refusé, y compris par contournement SQL direct (le bug CM-06 d'origine),
-- et non-régression cross-tenant.

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

insert into public.fournisseurs (id, entreprise_id, nom) values
  ('a6000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'TEST_A_Fournisseur'),
  ('b6000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'TEST_B_Fournisseur')
on conflict (id) do nothing;

insert into public.commandes_fournisseurs (id, entreprise_id, fournisseur_id, numero, statut) values
  ('a7000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'TEST_A_CMD_BROUILLON', 'brouillon'),
  ('a7000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'TEST_A_CMD_ANNULEE',   'annulee'),
  ('a7000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'TEST_A_CMD_CONFIRMEE', 'confirmee'),
  ('a7000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'TEST_A_CMD_RECUE',     'recue'),
  ('a7000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'TEST_A_CMD_PARTIEL',   'recue_partiel'),
  ('b7000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'b6000000-0000-0000-0000-000000000001', 'TEST_B_CMD_RECUE',     'recue')
on conflict (id) do nothing;

-- 1. Positive witness : un brouillon reste supprimable (la garde DB ne durcit pas
--    la règle produit, elle la rend inviolable).
select lives_ok(
  $$delete from public.commandes_fournisseurs where id='a7000000-0000-0000-0000-000000000001'$$,
  '1. commande brouillon -> suppression autorisée'
);

-- 2. Positive witness : une commande annulée reste supprimable.
select lives_ok(
  $$delete from public.commandes_fournisseurs where id='a7000000-0000-0000-0000-000000000002'$$,
  '2. commande annulée -> suppression autorisée'
);

-- 3. Negative witness : statut confirmee -> refusé.
select throws_ok(
  $$delete from public.commandes_fournisseurs where id='a7000000-0000-0000-0000-000000000003'$$,
  'P0001', 'COMMANDE_SUPPRESSION_STATUT_INTERDIT',
  '3. commande confirmée -> suppression refusée'
);

-- 4. Negative witness : statut recue -> refusé (le cas exact mesuré en V3).
select throws_ok(
  $$delete from public.commandes_fournisseurs where id='a7000000-0000-0000-0000-000000000004'$$,
  'P0001', 'COMMANDE_SUPPRESSION_STATUT_INTERDIT',
  '4. commande reçue -> suppression refusée'
);

-- 5. Negative witness : statut recue_partiel -> refusé.
select throws_ok(
  $$delete from public.commandes_fournisseurs where id='a7000000-0000-0000-0000-000000000005'$$,
  'P0001', 'COMMANDE_SUPPRESSION_STATUT_INTERDIT',
  '5. commande reçue partiellement -> suppression refusée'
);

-- 6. Contournement direct (le bug CM-06 d'origine) : suppression de masse sans
--    repasser par supprimerCommandeAction. Doit échouer dès la première ligne
--    non supprimable, donc ne rien supprimer du tout.
select throws_ok(
  $$delete from public.commandes_fournisseurs where entreprise_id='a0000000-0000-0000-0000-000000000001'$$,
  'P0001', 'COMMANDE_SUPPRESSION_STATUT_INTERDIT',
  '6. suppression de masse (contournement SQL direct) bloquée au niveau DB'
);
-- Invariant, indépendant du contenu exact de la fixture : après le DELETE de
-- masse refusé, les trois commandes non supprimables sont toujours là, et plus
-- aucune commande supprimable ne subsiste (les deux premiers tests les ont
-- effacées) -- autrement dit le refus n'a rien supprimé partiellement.
select bag_eq(
  $$select numero from public.commandes_fournisseurs
      where entreprise_id='a0000000-0000-0000-0000-000000000001'
        and numero in ('TEST_A_CMD_CONFIRMEE','TEST_A_CMD_RECUE','TEST_A_CMD_PARTIEL',
                       'TEST_A_CMD_BROUILLON','TEST_A_CMD_ANNULEE')$$,
  $$values ('TEST_A_CMD_CONFIRMEE'),('TEST_A_CMD_RECUE'),('TEST_A_CMD_PARTIEL')$$,
  '6b. aucune commande non supprimable n''a été perdue par le DELETE de masse refusé'
);
-- 6c. Le refus est atomique : la commande supprimable que la fixture porte déjà
--     (TEST_A_CMD_001) est toujours là elle aussi, donc le DELETE de masse n'a
--     rien supprimé du tout au lieu de s'arrêter au milieu.
select isnt_empty(
  $$select 1 from public.commandes_fournisseurs
      where entreprise_id='a0000000-0000-0000-0000-000000000001'
        and statut in ('brouillon','annulee')$$,
  '6c. le DELETE de masse refusé est atomique : il n''a supprimé aucune ligne, même supprimable'
);

-- 7. Cross-tenant : la garde s'applique à l'identique sur l'entreprise B — elle
--    porte sur le statut de la ligne, jamais sur le tenant de l'appelant.
select throws_ok(
  $$delete from public.commandes_fournisseurs where id='b7000000-0000-0000-0000-000000000001'$$,
  'P0001', 'COMMANDE_SUPPRESSION_STATUT_INTERDIT',
  '7. commande reçue de l''entreprise B -> suppression refusée aussi'
);

-- 8. Non-régression : passer une commande reçue à 'annulee' (geste métier normal,
--    un UPDATE) reste possible, et la rend alors supprimable.
select lives_ok(
  $$update public.commandes_fournisseurs set statut='annulee' where id='a7000000-0000-0000-0000-000000000004'$$,
  '8. annuler une commande reçue reste possible (le trigger ne porte que sur DELETE)'
);
select lives_ok(
  $$delete from public.commandes_fournisseurs where id='a7000000-0000-0000-0000-000000000004'$$,
  '8b. une fois annulée, la même commande devient supprimable'
);

select * from finish();
rollback;
