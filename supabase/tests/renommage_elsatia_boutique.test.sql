begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

select has_function(
  'public',
  'obtenir_ou_creer_fournisseur_boutique',
  array['uuid'],
  'la création du fournisseur boutique reste disponible'
);
select has_function(
  'public',
  'boutique_finaliser_commande_payee',
  array['uuid', 'text'],
  'la finalisation boutique reste disponible'
);
select is(
  (select description from public.permissions_disponibles where cle = 'acces_boutique'),
  'Parcourir la boutique de matériel ELSATIA',
  'la permission de lecture porte la nouvelle marque'
);
select is(
  (select description from public.permissions_disponibles where cle = 'gerer_boutique'),
  'Commander du matériel dans la boutique ELSATIA',
  'la permission de commande porte la nouvelle marque'
);
select ok(
  position('Liria' in pg_get_functiondef('public.obtenir_ou_creer_fournisseur_boutique(uuid)'::regprocedure)) = 0,
  'la fonction fournisseur ne recrée pas l ancien nom'
);
select ok(
  position('Liria' in pg_get_functiondef('public.boutique_finaliser_commande_payee(uuid,text)'::regprocedure)) = 0,
  'la finalisation ne recrée pas l ancien nom'
);

insert into public.entreprises(id, reference_interne, nom)
values('19400000-0000-0000-0000-000000000001', 'TEST-MIG-194', 'Entreprise migration 194');

select lives_ok(
  $$select public.obtenir_ou_creer_fournisseur_boutique('19400000-0000-0000-0000-000000000001')$$,
  'la fiche boutique est créée'
);
select is(
  public.obtenir_ou_creer_fournisseur_boutique('19400000-0000-0000-0000-000000000001'),
  public.obtenir_ou_creer_fournisseur_boutique('19400000-0000-0000-0000-000000000001'),
  'deux appels renvoient la même fiche'
);
select is(
  (select nom from public.fournisseurs where entreprise_id = '19400000-0000-0000-0000-000000000001'),
  'ELSATIA (boutique)',
  'la fiche automatique utilise la marque ELSATIA'
);
select is(
  (select count(*)::integer from public.fournisseurs where entreprise_id = '19400000-0000-0000-0000-000000000001'),
  1,
  'la création est idempotente'
);

insert into public.entreprises(id, reference_interne, nom)
values('19400000-0000-0000-0000-000000000101', 'TEST-CIBLE-194', 'Entreprise cible existante');
insert into public.fournisseurs(id, entreprise_id, reference, nom)
values(
  '19400000-0000-0000-0000-000000000102',
  '19400000-0000-0000-0000-000000000101',
  'FRN-CIBLE-194',
  'ELSATIA (boutique)'
);
select is(
  public.obtenir_ou_creer_fournisseur_boutique('19400000-0000-0000-0000-000000000101'),
  '19400000-0000-0000-0000-000000000102'::uuid,
  'une fiche ELSATIA existante est réutilisée'
);
select is(
  (select count(*)::integer from public.fournisseurs where entreprise_id = '19400000-0000-0000-0000-000000000101'),
  1,
  'la cible existante ne crée aucun doublon'
);

insert into public.boutique_produits(
  id, sku, nom, categorie, prix_ht, taux_tva, stock_disponible
) values (
  '19400000-0000-0000-0000-000000000002', 'TEST-MIG-194', 'Produit test migration',
  'imprimante_code_barres', 100, 0.20, 2
);
insert into public.boutique_commandes(
  id, entreprise_id, statut, montant_ht, montant_tva, montant_ttc, stripe_checkout_id
) values (
  '19400000-0000-0000-0000-000000000003',
  '19400000-0000-0000-0000-000000000001',
  'en_attente_paiement', 100, 20, 120, 'cs_test_migration_194'
);
insert into public.boutique_lignes_commande(
  commande_id, produit_id, sku_snapshot, nom_snapshot, prix_unitaire_ht_snapshot, quantite, montant_ht
) values (
  '19400000-0000-0000-0000-000000000003',
  '19400000-0000-0000-0000-000000000002',
  'TEST-MIG-194', 'Produit test migration', 100, 1, 100
);

select lives_ok(
  $$select public.boutique_finaliser_commande_payee('19400000-0000-0000-0000-000000000003', 'cs_test_migration_194')$$,
  'la commande est finalisée'
);
select is(
  (select statut from public.boutique_commandes where id = '19400000-0000-0000-0000-000000000003'),
  'payee',
  'la commande passe payée'
);
select is(
  (select notes from public.depenses_fournisseurs where numero_piece = 'BTQ-19400000-0000-0000-0000-000000000003'),
  'Commande boutique ELSATIA réglée par carte (Stripe).',
  'la dépense utilise la nouvelle marque'
);
select is(
  (select count(*)::integer from public.reglements_fournisseurs r
    join public.depenses_fournisseurs d on d.id = r.depense_id
    where d.numero_piece = 'BTQ-19400000-0000-0000-0000-000000000003'),
  1,
  'un règlement est créé'
);

select lives_ok(
  $$select public.boutique_finaliser_commande_payee('19400000-0000-0000-0000-000000000003', 'cs_test_migration_194')$$,
  'le second appel de finalisation est accepté'
);
select is(
  (select count(*)::integer from public.depenses_fournisseurs where numero_piece = 'BTQ-19400000-0000-0000-0000-000000000003'),
  1,
  'le second appel ne duplique pas la dépense'
);

select * from finish();
rollback;
