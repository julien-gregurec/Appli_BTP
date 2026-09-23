-- Train canonique V1 : test repris de claude/amazing-pascal-7lddkv (d42df217) SANS sa migration
-- GP : la propriété vérifiée est déjà portée par le tronc (preuve : ce test passe sur le train,
-- voir docs/qualification/ELSATIA_CANONICAL_TRAIN_EXECUTION_V1.md §STEP 6).
-- Un utilisateur authentifié quelconque ne peut plus appeler
-- boutique_finaliser_commande_payee() ni obtenir_ou_creer_fournisseur_boutique()
-- directement (contournement de paiement / écriture cross-tenant). Voir
-- 20260922000185_ferme_contournement_paiement_boutique.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.boutique_finaliser_commande_payee(uuid,text)',
    'execute'
  ),
  'un membre authentifié ne peut plus finaliser une commande boutique directement (contournement de paiement)'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.boutique_finaliser_commande_payee(uuid,text)',
    'execute'
  ),
  'le webhook Stripe (service_role) peut toujours finaliser une commande payée'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.boutique_finaliser_commande_payee(uuid,text)',
    'execute'
  ),
  'un appelant anonyme ne peut pas finaliser une commande boutique'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.obtenir_ou_creer_fournisseur_boutique(uuid)',
    'execute'
  ),
  'un membre authentifié ne peut plus créer une fiche fournisseur dans une entreprise tierce'
);

select * from finish();
rollback;
