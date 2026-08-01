begin;
create extension if not exists pgtap with schema extensions;
\if :{?migration_194_replay}
select plan(39);
\else
select plan(18);
\endif

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

\if :{?migration_194_replay}
-- Rejoue la migration sur des données historiques préparées après le reset afin de
-- vérifier le renommage et la fusion, pas seulement les fonctions finales.
insert into public.entreprises(id, reference_interne, nom, raison_sociale)
values
  ('19400000-0000-0000-0000-000000000201', 'TEST-LEGACY-194', ' LIRIA CONCEPT ', 'Liria Concept'),
  ('19400000-0000-0000-0000-000000000301', 'TEST-DEMO-194', 'Liria Gestion Pro - Entreprise Demo', null),
  ('19400000-0000-0000-0000-000000000401', 'TEST-FUSION-194', 'Entreprise fusion 194', null),
  ('19400000-0000-0000-0000-000000000501', 'TEST-MIGREE-194', 'Entreprise déjà migrée', null);

insert into public.fournisseurs(id, entreprise_id, reference, nom, contact_nom, email, notes)
values
  (
    '19400000-0000-0000-0000-000000000202',
    '19400000-0000-0000-0000-000000000201',
    'FRN-LEGACY-194',
    'Liria (boutique)',
    'Contact historique',
    'historique@example.test',
    'Fiche créée automatiquement pour rattacher les achats de la boutique Liria (imprimantes, plastifieuses, étiquettes) à la trésorerie.'
  ),
  (
    '19400000-0000-0000-0000-000000000203',
    '19400000-0000-0000-0000-000000000201',
    'FRN-SANS-RAPPORT-194',
    'Liria Services',
    null,
    null,
    'Fournisseur utilisateur sans rapport avec la boutique'
  ),
  (
    '19400000-0000-0000-0000-000000000402',
    '19400000-0000-0000-0000-000000000401',
    'FRN-SOURCE-194',
    'Liria (boutique)',
    null,
    'source@example.test',
    'Note utilisateur conservée'
  ),
  (
    '19400000-0000-0000-0000-000000000403',
    '19400000-0000-0000-0000-000000000401',
    'FRN-CIBLE-FUSION-194',
    'ELSATIA (boutique)',
    'Contact cible',
    null,
    null
  ),
  (
    '19400000-0000-0000-0000-000000000502',
    '19400000-0000-0000-0000-000000000501',
    'FRN-DEJA-MIGRE-194',
    'ELSATIA (boutique)',
    null,
    'deja-migre@example.test',
    'Donnée déjà conforme'
  );

insert into public.zones_depot(id, entreprise_id, code, nom, type, description)
values(
  '19400000-0000-0000-0000-000000000204',
  '19400000-0000-0000-0000-000000000201',
  'DEPOT-MIG-194',
  'Dépôt principal LIRIA',
  'depot',
  'Description à conserver'
);

insert into public.depenses_fournisseurs(
  id, entreprise_id, fournisseur_id, numero_piece, montant_ht, montant_tva, notes
) values (
  '19400000-0000-0000-0000-000000000404',
  '19400000-0000-0000-0000-000000000401',
  '19400000-0000-0000-0000-000000000402',
  'PIECE-MIG-194',
  42,
  8.40,
  'Commande boutique Liria réglée par carte (Stripe).'
);

\ir :migration_194_path

select is(
  (select nom from public.entreprises where id = '19400000-0000-0000-0000-000000000201'),
  'ELSATIA',
  'le nom historique exact de l éditeur est remplacé'
);
select is(
  (select raison_sociale from public.entreprises where id = '19400000-0000-0000-0000-000000000201'),
  'ELSATIA',
  'la raison sociale historique exacte est remplacée'
);
select is(
  (select nom from public.entreprises where id = '19400000-0000-0000-0000-000000000301'),
  'ELSATIA Gestion Pro - Entreprise Demo',
  'l entreprise de démonstration utilise le nom du logiciel'
);
select is(
  (select nom from public.zones_depot where id = '19400000-0000-0000-0000-000000000204'),
  'Dépôt principal ELSATIA',
  'le dépôt historique utilise la marque'
);
select is(
  (select nom from public.fournisseurs where id = '19400000-0000-0000-0000-000000000202'),
  'ELSATIA (boutique)',
  'la fiche historique sans doublon est renommée sur place'
);
select is(
  (select reference from public.fournisseurs where id = '19400000-0000-0000-0000-000000000202'),
  'FRN-LEGACY-194',
  'la référence fournisseur historique est conservée'
);
select is(
  (select email from public.fournisseurs where id = '19400000-0000-0000-0000-000000000202'),
  'historique@example.test',
  'les coordonnées de la fiche renommée sont conservées'
);
select is(
  (select notes from public.fournisseurs where id = '19400000-0000-0000-0000-000000000202'),
  'Fiche créée automatiquement pour rattacher les achats de la boutique ELSATIA (imprimantes, plastifieuses, étiquettes) à la trésorerie.',
  'la note automatique historique est renommée'
);
select is(
  (select nom from public.fournisseurs where id = '19400000-0000-0000-0000-000000000203'),
  'Liria Services',
  'un fournisseur utilisateur sans rapport reste inchangé'
);
select is(
  (select count(*)::integer from public.fournisseurs
    where entreprise_id = '19400000-0000-0000-0000-000000000401'
      and nom in ('Liria (boutique)', 'ELSATIA (boutique)')),
  1,
  'la coexistence ancien et nouveau est fusionnée en une fiche'
);
select is(
  (select email from public.fournisseurs where id = '19400000-0000-0000-0000-000000000403'),
  'source@example.test',
  'les données manquantes de la cible sont reprises depuis la source'
);
select is(
  (select contact_nom from public.fournisseurs where id = '19400000-0000-0000-0000-000000000403'),
  'Contact cible',
  'les données déjà présentes sur la cible sont conservées'
);
select is(
  (select fournisseur_id from public.depenses_fournisseurs where id = '19400000-0000-0000-0000-000000000404'),
  '19400000-0000-0000-0000-000000000403'::uuid,
  'la dépense historique est rattachée à la cible avant suppression'
);
select is(
  (select notes from public.depenses_fournisseurs where id = '19400000-0000-0000-0000-000000000404'),
  'Commande boutique ELSATIA réglée par carte (Stripe).',
  'la note de dépense historique utilise la nouvelle marque'
);
select is(
  (select montant_ht from public.depenses_fournisseurs where id = '19400000-0000-0000-0000-000000000404'),
  42.00::numeric,
  'le montant de la dépense rattachée est conservé'
);
select is(
  (select id from public.fournisseurs where entreprise_id = '19400000-0000-0000-0000-000000000501'),
  '19400000-0000-0000-0000-000000000502'::uuid,
  'une fiche déjà migrée est conservée'
);

\ir :migration_194_path

select is(
  (select count(*)::integer from public.fournisseurs
    where entreprise_id = '19400000-0000-0000-0000-000000000201'),
  2,
  'un second passage ne crée ni ne supprime de fiche supplémentaire'
);
select is(
  (select count(*)::integer from public.fournisseurs
    where entreprise_id = '19400000-0000-0000-0000-000000000401'),
  1,
  'la fusion reste stable après un second passage'
);
select is(
  (select fournisseur_id from public.depenses_fournisseurs where id = '19400000-0000-0000-0000-000000000404'),
  '19400000-0000-0000-0000-000000000403'::uuid,
  'le rattachement reste stable après un second passage'
);
select is(
  (select nom from public.fournisseurs where id = '19400000-0000-0000-0000-000000000203'),
  'Liria Services',
  'le rejeu laisse toujours intact le fournisseur sans rapport'
);
select is(
  (select id from public.fournisseurs where entreprise_id = '19400000-0000-0000-0000-000000000501'),
  '19400000-0000-0000-0000-000000000502'::uuid,
  'le rejeu conserve encore la fiche déjà migrée'
);
\endif

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
