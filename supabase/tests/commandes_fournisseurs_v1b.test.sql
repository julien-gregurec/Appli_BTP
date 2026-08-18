-- COMMANDES-FOURNISSEURS-V1B : filet de sécurité automatisé, module non modifié.
-- Complète (sans dupliquer) la couverture déjà existante :
-- isolation_multitenant_comportement.test.sql / isolation_multitenant_roles.test.sql
-- testent déjà le SELECT cross-tenant sur commandes_fournisseurs (admin/comptable A/B).
-- Ce fichier couvre : SELECT cross-tenant sur lignes_commande (gap), INSERT/UPDATE/DELETE
-- cross-tenant, RPC (création, transitions de statut, réception, annulation),
-- validations métier, et l'absence de double comptage avec la rentabilité.
begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

\ir fixtures/isolation_multitenant.inc

-- Lignes sur les commandes déjà présentes dans le fixture (contexte superuser, hors RLS).
insert into public.lignes_commande (entreprise_id, commande_id, designation, quantite, unite, prix_unitaire_ht, taux_tva, ordre) values
  ('a0000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000001', 'TEST_A ligne', 5, 'u', 10, 20, 1),
  ('b0000000-0000-0000-0000-000000000001', 'bc000000-0000-0000-0000-000000000001', 'TEST_B ligne', 5, 'u', 15, 20, 1);

-- Second fournisseur de A, distinct de ab000000..., pour tester le rapprochement dépense↔commande.
insert into public.fournisseurs (id, entreprise_id, reference, nom) values
  ('af000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'TEST_A_FOU_002', 'TEST_A_Autre_Fournisseur');

set local role authenticated;

-- 1-2. SELECT cross-tenant sur lignes_commande (gap non couvert ailleurs).
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select is((select count(*) from public.lignes_commande where designation like 'TEST_%'), 1::bigint, 'admin A ne voit que sa propre ligne de commande');
select is((select designation from public.lignes_commande where designation like 'TEST_%'), 'TEST_A ligne', 'admin A voit bien sa ligne, jamais celle de B');

-- 3. INSERT cross-tenant bloqué (RLS with check est_membre_actif).
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
select throws_like(
  $$insert into public.commandes_fournisseurs (entreprise_id, fournisseur_id, numero, montant_ht) values ('a0000000-0000-0000-0000-000000000001','ab000000-0000-0000-0000-000000000001','TEST_INTRUSION',1)$$,
  '%row-level security%', 'admin B ne peut pas insérer une commande dans l’entreprise A'
);

-- 4. UPDATE cross-tenant bloqué (0 ligne affectée, pas d’erreur — cohérent avec le reste du codebase).
-- Vérifié depuis un contexte qui PEUT voir la ligne (superuser) : sous l’angle de B lui-même,
-- la ligne est de toute façon invisible que l’update ait réussi ou non — un faux test ne prouverait rien.
select lives_ok(
  $$update public.commandes_fournisseurs set notes = 'INTRUSION' where id = 'ac000000-0000-0000-0000-000000000001'$$,
  'la tentative de modification sans ligne visible ne lève pas d’erreur'
);
reset role;
select is((select count(*) from public.commandes_fournisseurs where id = 'ac000000-0000-0000-0000-000000000001' and notes = 'INTRUSION'), 0::bigint, 'admin B ne peut pas modifier la commande de A (vérifié en contexte superuser)');
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);

-- 5. DELETE cross-tenant bloqué (même remarque : vérifié en contexte superuser).
select lives_ok($$delete from public.commandes_fournisseurs where id = 'ac000000-0000-0000-0000-000000000001'$$, 'la tentative de suppression sans ligne visible ne lève pas d’erreur');
reset role;
select is((select count(*) from public.commandes_fournisseurs where id = 'ac000000-0000-0000-0000-000000000001'), 1::bigint, 'admin B ne peut pas supprimer la commande de A, elle existe toujours (vérifié en contexte superuser)');
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);

-- 6-7. RPC creer_commande_fournisseur cross-tenant : refusé (admin B, p_entreprise_id = A).
select throws_like(
  $$select public.creer_commande_fournisseur('a0000000-0000-0000-0000-000000000001', jsonb_build_object('fournisseur_id','ab000000-0000-0000-0000-000000000001'), jsonb_build_array(jsonb_build_object('designation','x','quantite',1,'unite','u','prix_unitaire_ht',1,'taux_tva',20,'ordre',0)))$$,
  '%Accès refusé%', 'admin B ne peut pas créer de commande pour l’entreprise A (RPC)'
);

-- Bascule sur admin A pour le reste des tests RPC.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

-- 8. Fournisseur d’un autre tenant refusé.
select throws_like(
  $$select public.creer_commande_fournisseur('a0000000-0000-0000-0000-000000000001', jsonb_build_object('fournisseur_id','bb000000-0000-0000-0000-000000000001'), jsonb_build_array(jsonb_build_object('designation','x','quantite',1,'unite','u','prix_unitaire_ht',1,'taux_tva',20,'ordre',0)))$$,
  '%Fournisseur introuvable%', 'un fournisseur d’une autre entreprise est refusé à la création'
);

-- 9. Chantier d’un autre tenant refusé.
select throws_like(
  $$select public.creer_commande_fournisseur('a0000000-0000-0000-0000-000000000001', jsonb_build_object('fournisseur_id','ab000000-0000-0000-0000-000000000001','chantier_id','b4000000-0000-0000-0000-000000000001'), jsonb_build_array(jsonb_build_object('designation','x','quantite',1,'unite','u','prix_unitaire_ht',1,'taux_tva',20,'ordre',0)))$$,
  '%Chantier introuvable%', 'un chantier d’une autre entreprise est refusé à la création'
);

-- 10-12. Lignes invalides refusées.
select throws_like(
  $$select public.creer_commande_fournisseur('a0000000-0000-0000-0000-000000000001', jsonb_build_object('fournisseur_id','ab000000-0000-0000-0000-000000000001'), jsonb_build_array(jsonb_build_object('designation','','quantite',1,'unite','u','prix_unitaire_ht',1,'taux_tva',20,'ordre',0)))$$,
  '%ligne de commande est invalide%', 'désignation vide refusée'
);
select throws_like(
  $$select public.creer_commande_fournisseur('a0000000-0000-0000-0000-000000000001', jsonb_build_object('fournisseur_id','ab000000-0000-0000-0000-000000000001'), jsonb_build_array(jsonb_build_object('designation','x','quantite',0,'unite','u','prix_unitaire_ht',1,'taux_tva',20,'ordre',0)))$$,
  '%ligne de commande est invalide%', 'quantité nulle/interdite refusée'
);
select throws_like(
  $$select public.creer_commande_fournisseur('a0000000-0000-0000-0000-000000000001', jsonb_build_object('fournisseur_id','ab000000-0000-0000-0000-000000000001'), jsonb_build_array(jsonb_build_object('designation','x','quantite',1,'unite','u','prix_unitaire_ht',-1,'taux_tva',20,'ordre',0)))$$,
  '%ligne de commande est invalide%', 'prix unitaire négatif refusé'
);

-- 13. Création valide : totaux calculés correctement (2 lignes : 5*10 HT + 2*20 HT = 90 HT, TVA 20% = 18, TTC 108).
select public.creer_commande_fournisseur(
  'a0000000-0000-0000-0000-000000000001',
  jsonb_build_object('fournisseur_id','ab000000-0000-0000-0000-000000000001','chantier_id','a4000000-0000-0000-0000-000000000001'),
  jsonb_build_array(
    jsonb_build_object('designation','Ligne 1','quantite',5,'unite','u','prix_unitaire_ht',10,'taux_tva',20,'ordre',0),
    jsonb_build_object('designation','Ligne 2','quantite',2,'unite','u','prix_unitaire_ht',20,'taux_tva',20,'ordre',1)
  )
) as creee_id \gset
select ok(:'creee_id' is not null, 'la commande valide est créée');
select is((select montant_ht from public.commandes_fournisseurs where id = :'creee_id'), 90::numeric, 'le montant HT est calculé correctement (5×10 + 2×20)');
select is((select montant_ttc from public.commandes_fournisseurs where id = :'creee_id'), 108::numeric, 'le montant TTC est calculé correctement (90 + 20% de TVA)');
select is((select statut from public.commandes_fournisseurs where id = :'creee_id'), 'brouillon', 'la commande est créée en brouillon');

-- 14-17. Machine à états, transitions valides et invalides.
select lives_ok(format($$select public.changer_statut_commande('a0000000-0000-0000-0000-000000000001','%s','envoyee')$$, :'creee_id'), 'brouillon → envoyee autorisé');
select throws_like(format($$select public.changer_statut_commande('a0000000-0000-0000-0000-000000000001','%s','brouillon')$$, :'creee_id'), '%non autorisée%', 'envoyee → brouillon refusé (pas de retour arrière arbitraire)');
select lives_ok(format($$select public.changer_statut_commande('a0000000-0000-0000-0000-000000000001','%s','confirmee')$$, :'creee_id'), 'envoyee → confirmee autorisé');
select is((select statut from public.commandes_fournisseurs where id = :'creee_id'), 'confirmee', 'le statut est bien confirmee après la transition');

-- 18-19. Une commande "recue" ne peut plus changer de statut.
select lives_ok(format($$select public.changer_statut_commande('a0000000-0000-0000-0000-000000000001','%s','recue')$$, :'creee_id'), 'confirmee → recue (forcé) autorisé, fige toutes les lignes à quantité pleine');
select throws_like(format($$select public.changer_statut_commande('a0000000-0000-0000-0000-000000000001','%s','annulee')$$, :'creee_id'), '%non autorisée%', 'une commande reçue ne peut plus être annulée ni modifiée de statut');

-- 20. Réception forcée via changer_statut_commande('recue') : les lignes sont bien à quantité pleine.
select is((select bool_and(quantite_recue = quantite) from public.lignes_commande where commande_id = :'creee_id'), true, 'toutes les lignes sont à quantité pleine après passage forcé à recue');

-- 21-27. Réception partielle puis complète, sur-réception, multi-lignes (commande dédiée).
select public.creer_commande_fournisseur(
  'a0000000-0000-0000-0000-000000000001',
  jsonb_build_object('fournisseur_id','ab000000-0000-0000-0000-000000000001'),
  jsonb_build_array(
    jsonb_build_object('designation','Ligne A','quantite',10,'unite','u','prix_unitaire_ht',5,'taux_tva',20,'ordre',0),
    jsonb_build_object('designation','Ligne B','quantite',3,'unite','u','prix_unitaire_ht',8,'taux_tva',20,'ordre',1)
  )
) as reception_id \gset
select public.changer_statut_commande('a0000000-0000-0000-0000-000000000001', :'reception_id', 'envoyee');

select id as ligne_a_id from public.lignes_commande where commande_id = :'reception_id' and designation = 'Ligne A' \gset
select id as ligne_b_id from public.lignes_commande where commande_id = :'reception_id' and designation = 'Ligne B' \gset

-- Réception partielle de la ligne A (4 sur 10), ligne B non touchée.
select public.enregistrer_reception_commande('a0000000-0000-0000-0000-000000000001', :'reception_id',
  jsonb_build_array(jsonb_build_object('ligne_id', :'ligne_a_id', 'quantite_recue', 4), jsonb_build_object('ligne_id', :'ligne_b_id', 'quantite_recue', 0))
);
select is((select statut from public.commandes_fournisseurs where id = :'reception_id'), 'recue_partiel', 'réception partielle (4/10 sur une ligne) → statut recue_partiel');
select is((select quantite_recue from public.lignes_commande where id = :'ligne_a_id'), 4::numeric, '4 unités enregistrées comme reçues sur la ligne A');

-- Sur-réception refusée (11 sur une ligne commandée à 10).
select throws_like(
  format($$select public.enregistrer_reception_commande('a0000000-0000-0000-0000-000000000001','%s', jsonb_build_array(jsonb_build_object('ligne_id','%s','quantite_recue',11)))$$, :'reception_id', :'ligne_a_id'),
  '%invalide%', 'une réception supérieure à la quantité commandée est refusée'
);
select is((select quantite_recue from public.lignes_commande where id = :'ligne_a_id'), 4::numeric, 'la tentative de sur-réception n’a pas modifié la quantité déjà enregistrée');

-- Réception complémentaire de la ligne A (cumulé 10/10) + ligne B complète (3/3) → recue.
select public.enregistrer_reception_commande('a0000000-0000-0000-0000-000000000001', :'reception_id',
  jsonb_build_array(jsonb_build_object('ligne_id', :'ligne_a_id', 'quantite_recue', 10), jsonb_build_object('ligne_id', :'ligne_b_id', 'quantite_recue', 3))
);
select is((select statut from public.commandes_fournisseurs where id = :'reception_id'), 'recue', 'les deux lignes complètes (10/10 et 3/3) → statut recue');
select is((select quantite_recue from public.lignes_commande where id = :'ligne_b_id'), 3::numeric, 'la ligne B, jamais partiellement reçue, passe directement à quantité pleine');

-- 28-29. Une commande annulée ne peut plus être réceptionnée, et l’annulation ne crée aucune dépense fantôme.
select public.creer_commande_fournisseur(
  'a0000000-0000-0000-0000-000000000001',
  jsonb_build_object('fournisseur_id','ab000000-0000-0000-0000-000000000001'),
  jsonb_build_array(jsonb_build_object('designation','Ligne annulee','quantite',1,'unite','u','prix_unitaire_ht',100,'taux_tva',20,'ordre',0))
) as annulee_id \gset
select public.changer_statut_commande('a0000000-0000-0000-0000-000000000001', :'annulee_id', 'annulee');
select throws_like(
  format($$select public.enregistrer_reception_commande('a0000000-0000-0000-0000-000000000001','%s', jsonb_build_array(jsonb_build_object('ligne_id',(select id from public.lignes_commande where commande_id='%s' limit 1),'quantite_recue',1)))$$, :'annulee_id', :'annulee_id'),
  '%ne peut pas être réceptionnée%', 'une commande annulée ne peut pas être réceptionnée'
);
select is((select count(*) from public.depenses_fournisseurs where entreprise_id = 'a0000000-0000-0000-0000-000000000001'), 0::bigint, 'aucune dépense fantôme n’a été créée par l’annulation ou les commandes de ce test');

-- 30-33. Rentabilité : la commande seule n’ajoute aucun coût réel, la dépense correspondante compte une seule fois.
select public.creer_commande_fournisseur(
  'a0000000-0000-0000-0000-000000000001',
  jsonb_build_object('fournisseur_id','ab000000-0000-0000-0000-000000000001','chantier_id','a4000000-0000-0000-0000-000000000001'),
  jsonb_build_array(jsonb_build_object('designation','Materiel rentabilite','quantite',1,'unite','u','prix_unitaire_ht',500,'taux_tva',20,'ordre',0))
) as rentab_cmd_id \gset

reset role;
-- Étape 1 : commande seule, aucune dépense réelle -> aucun coût dans la rentabilité.
select is(
  (select coalesce(sum(montant_ht),0) from public.depenses_fournisseurs where entreprise_id='a0000000-0000-0000-0000-000000000001' and chantier_id='a4000000-0000-0000-0000-000000000001'),
  0::numeric,
  'la commande seule (sans dépense réelle) n’ajoute aucun coût réel au chantier'
);
-- Étape 2 : la dépense réelle correspondante est créée, rattachée à la commande.
insert into public.depenses_fournisseurs (entreprise_id, fournisseur_id, chantier_id, commande_id, numero_piece, categorie, montant_ht, statut) values
  ('a0000000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', :'rentab_cmd_id', 'TEST_RENTAB_01', 'materiaux', 500, 'a_payer');
select is(
  (select coalesce(sum(montant_ht),0) from public.depenses_fournisseurs where entreprise_id='a0000000-0000-0000-0000-000000000001' and chantier_id='a4000000-0000-0000-0000-000000000001' and statut<>'annulee'),
  500::numeric,
  'le coût réel apparaît une seule fois (500), jamais doublé avec le montant de la commande'
);
-- Étape 3 : la traçabilité commande → dépense est bien conservée, sans dupliquer l’agrégat.
select is((select commande_id from public.depenses_fournisseurs where numero_piece='TEST_RENTAB_01'), :'rentab_cmd_id'::uuid, 'le lien commande_id trace correctement la dépense sans modifier le montant agrégé');
select is(
  (select count(*) from public.depenses_fournisseurs where commande_id = :'rentab_cmd_id'),
  1::bigint,
  'une seule ligne de dépense existe pour cette commande (pas de duplication)'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

-- 34. Le rapprochement dépense↔commande refuse un fournisseur différent (cohérence déjà en place, testée ici).
-- La commande :annulee_id est rattachée à ab000000 (fournisseur 1) ; on tente une dépense avec af000000 (fournisseur 2, même entreprise).
select throws_like(
  format($$insert into public.depenses_fournisseurs (entreprise_id, fournisseur_id, chantier_id, commande_id, numero_piece, categorie, montant_ht, statut) values ('a0000000-0000-0000-0000-000000000001', 'af000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', '%s', 'TEST_RENTAB_02', 'materiaux', 1, 'a_payer')$$, :'annulee_id'),
  '%même fournisseur%', 'une dépense ne peut pas se rattacher à une commande d’un autre fournisseur qu’elle-même'
) ;

-- 35-36. Permissions : ouvrier (sans gerer_achats/acces_achats) ne peut ni lire ni créer de commande.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);
select is((select count(*) from public.commandes_fournisseurs), 0::bigint, 'ouvrier A sans droit achats ne lit aucune commande');
select throws_like(
  $$select public.creer_commande_fournisseur('a0000000-0000-0000-0000-000000000001', jsonb_build_object('fournisseur_id','ab000000-0000-0000-0000-000000000001'), jsonb_build_array(jsonb_build_object('designation','x','quantite',1,'unite','u','prix_unitaire_ht',1,'taux_tva',20,'ordre',0)))$$,
  '%Accès refusé%', 'ouvrier A sans droit gerer_achats ne peut pas créer de commande (RPC)'
);

-- 37-38. RPC réception/statut cross-tenant : admin B ne peut pas agir sur une commande de A.
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
select throws_like(
  format($$select public.changer_statut_commande('a0000000-0000-0000-0000-000000000001','%s','annulee')$$, :'reception_id'),
  '%Accès refusé%', 'admin B ne peut pas changer le statut d’une commande de A (p_entreprise_id=A refusé par a_permission)'
);
select throws_like(
  format($$select public.enregistrer_reception_commande('a0000000-0000-0000-0000-000000000001','%s', jsonb_build_array(jsonb_build_object('ligne_id','%s','quantite_recue',1)))$$, :'reception_id', :'ligne_a_id'),
  '%Accès refusé%', 'admin B ne peut pas réceptionner une commande de A (RPC)'
);

-- 39-40. Page d’impression : la requête lignes_commande filtrée par commande_id seul reste protégée par RLS.
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
select is(
  (select count(*) from public.lignes_commande where commande_id = :'reception_id'::uuid),
  0::bigint,
  'la requête d’impression (filtrée par commande_id seul, sans entreprise_id) reste protégée par RLS pour un autre tenant'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select is(
  (select count(*) from public.lignes_commande where commande_id = :'reception_id'::uuid),
  2::bigint,
  'la même requête, pour le propriétaire légitime, renvoie bien les 2 lignes'
);

reset role;
select * from finish();
rollback;
