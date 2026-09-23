-- Train canonique V1 : test repris de claude/amazing-pascal-7lddkv (d42df217) SANS sa migration
-- GP : la propriété vérifiée est déjà portée par le tronc (preuve : ce test passe sur le train,
-- voir docs/qualification/ELSATIA_CANONICAL_TRAIN_EXECUTION_V1.md §STEP 6).
-- Vérifie le correctif de la migration 20260922000200 : authenticated ne peut
-- plus INSERT directement dans public.paiements, seulement via la RPC
-- verrouillée enregistrer_paiement_facture.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select ok(
  not has_table_privilege('authenticated', 'public.paiements', 'INSERT'),
  'authenticated n''a plus le privilège INSERT sur public.paiements'
);
select ok(
  has_table_privilege('authenticated', 'public.paiements', 'SELECT'),
  'authenticated garde SELECT sur public.paiements (lecture non régressée)'
);
select ok(
  has_table_privilege('authenticated', 'public.paiements', 'UPDATE'),
  'authenticated garde UPDATE sur public.paiements (non régressé)'
);
select ok(
  has_table_privilege('authenticated', 'public.paiements', 'DELETE'),
  'authenticated garde DELETE sur public.paiements (supprimerPaiementAction non régressé)'
);

select * from finish();
rollback;
