-- DEVIS-LOCK-V1 : un devis accepté doit être immuable au niveau base, pas seulement RPC/UI.
-- Faille corrigée par la migration 20260818000210_verrou_devis_accepte.sql : un devis
-- statut='accepte' restait modifiable/supprimable par écriture directe (UPDATE/DELETE sur
-- devis, INSERT/UPDATE/DELETE sur lignes_devis) pour tout utilisateur gerer_devis, car le
-- verrou n'existait que dans la RPC modifier_devis_brouillon, jamais au niveau table/RLS.
-- Ce fichier couvre : brouillon toujours modifiable, accepté verrouillé (devis + lignes),
-- champs non contractuels épargnés, cross-tenant inchangé, duplication/facturation non
-- cassées, cascade de suppression d'un devis brouillon toujours fonctionnelle.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

\ir fixtures/isolation_multitenant.inc

-- Devis brouillon dédié (le fixture ne fournit que des devis déjà acceptés).
insert into public.devis (id, entreprise_id, numero, client_id, chantier_id, statut, montant_ht, montant_tva, montant_ttc) values
  ('a9000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'TEST_A_DEV_002', 'a3000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'brouillon', 100, 20, 120);
insert into public.lignes_devis (id, devis_id, designation, type, quantite, unite, prix_unitaire_ht, ordre) values
  ('a9500000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000002', 'TEST_A ligne brouillon', 'fourniture', 1, 'u', 100, 1);

-- Lignes sur le devis déjà accepté du fixture (contexte superuser, hors RLS).
insert into public.lignes_devis (id, devis_id, designation, type, quantite, unite, prix_unitaire_ht, ordre) values
  ('a9500000-0000-0000-0000-000000000002', 'a9000000-0000-0000-0000-000000000001', 'TEST_A ligne acceptee', 'fourniture', 1, 'u', 100, 1);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

-- 1. Devis brouillon : UPDATE montant autorisé.
select lives_ok(
  $$update public.devis set montant_ht = 150 where id = 'a9000000-0000-0000-0000-000000000002'$$,
  '1. admin A peut modifier un devis brouillon'
);

-- 2-4. Devis brouillon : lignes INSERT/UPDATE/DELETE autorisés.
select lives_ok(
  $$insert into public.lignes_devis (devis_id, designation, type, quantite, unite, prix_unitaire_ht, ordre) values ('a9000000-0000-0000-0000-000000000002', 'TEST_A nouvelle ligne', 'fourniture', 1, 'u', 10, 2)$$,
  '2. admin A peut insérer une ligne sur un devis brouillon'
);
select lives_ok(
  $$update public.lignes_devis set prix_unitaire_ht = 120 where id = 'a9500000-0000-0000-0000-000000000001'$$,
  '3. admin A peut modifier une ligne d’un devis brouillon'
);
select lives_ok(
  $$delete from public.lignes_devis where id = 'a9500000-0000-0000-0000-000000000001'$$,
  '4. admin A peut supprimer une ligne d’un devis brouillon'
);

-- 5. Devis accepté : UPDATE montant refusé.
select throws_like(
  $$update public.devis set montant_ht = 999 where id = 'a9000000-0000-0000-0000-000000000001'$$,
  '%accepté%',
  '5. un devis accepté ne peut plus voir son montant modifié'
);

-- 6. Devis accepté : DELETE refusé.
select throws_like(
  $$delete from public.devis where id = 'a9000000-0000-0000-0000-000000000001'$$,
  '%accepté%',
  '6. un devis accepté ne peut plus être supprimé'
);

-- 7. Lignes d’un devis accepté : INSERT refusé.
select throws_like(
  $$insert into public.lignes_devis (devis_id, designation, type, quantite, unite, prix_unitaire_ht, ordre) values ('a9000000-0000-0000-0000-000000000001', 'TEST_A intrusion', 'fourniture', 1, 'u', 1, 9)$$,
  '%accepté%',
  '7. impossible d’insérer une ligne sur un devis accepté'
);

-- 8. Lignes d’un devis accepté : UPDATE refusé.
select throws_like(
  $$update public.lignes_devis set prix_unitaire_ht = 1 where id = 'a9500000-0000-0000-0000-000000000002'$$,
  '%accepté%',
  '8. impossible de modifier une ligne d’un devis accepté'
);

-- 9. Lignes d’un devis accepté : DELETE refusé.
select throws_like(
  $$delete from public.lignes_devis where id = 'a9500000-0000-0000-0000-000000000002'$$,
  '%accepté%',
  '9. impossible de supprimer une ligne d’un devis accepté'
);

-- 10. Statut : un devis accepté ne peut pas redevenir brouillon via une écriture ordinaire.
select throws_like(
  $$update public.devis set statut = 'brouillon' where id = 'a9000000-0000-0000-0000-000000000001'$$,
  '%accepté%',
  '10. un devis accepté ne peut pas redevenir brouillon'
);

-- 11. Chantier : un devis accepté ne peut plus changer de chantier (décision explicite du lot).
select throws_like(
  $$update public.devis set chantier_id = null where id = 'a9000000-0000-0000-0000-000000000001'$$,
  '%accepté%',
  '11. un devis accepté ne peut plus changer de chantier'
);

-- 12. Client : un devis accepté ne peut plus changer de client.
select throws_like(
  $$update public.devis set client_id = 'a3000000-0000-0000-0000-000000000003' where id = 'a9000000-0000-0000-0000-000000000001'$$,
  '%accepté%',
  '12. un devis accepté ne peut plus changer de client'
);

-- 13. Remise globale : verrouillée elle aussi.
select throws_like(
  $$update public.devis set remise_globale = 5 where id = 'a9000000-0000-0000-0000-000000000001'$$,
  '%accepté%',
  '13. la remise globale d’un devis accepté est verrouillée'
);

-- 14. Champ non contractuel : notes_internes reste modifiable après acceptation.
select lives_ok(
  $$update public.devis set notes_internes = 'TEST_A note interne post-acceptation' where id = 'a9000000-0000-0000-0000-000000000001'$$,
  '14. les notes internes restent modifiables sur un devis accepté'
);

-- 15. Champ non contractuel : email_envoye_le/email_envoye_a restent modifiables (envoi du PDF).
select lives_ok(
  $$update public.devis set email_envoye_le = now(), email_envoye_a = 'client@test.local' where id = 'a9000000-0000-0000-0000-000000000001'$$,
  '15. la traçabilité d’envoi par email reste modifiable sur un devis accepté'
);

-- 16. Un update sans changement réel (même statut) reste sans effet, sans erreur.
select lives_ok(
  $$update public.devis set statut = 'accepte', updated_at = now() where id = 'a9000000-0000-0000-0000-000000000001'$$,
  '16. un UPDATE no-op (statut inchangé) sur un devis accepté ne lève pas d’erreur'
);

-- 17. Le montant du devis accepté n’a bougé sur aucune des tentatives précédentes.
select is(
  (select montant_ht from public.devis where id = 'a9000000-0000-0000-0000-000000000001'),
  100::numeric,
  '17. le montant du devis accepté est resté à 100 malgré les tentatives'
);

-- 18. Duplication d’un devis accepté : toujours possible, nouveau devis brouillon indépendant.
select public.dupliquer_devis('a9000000-0000-0000-0000-000000000001') as copie_id \gset
select is(
  (select statut from public.devis where id = :'copie_id'),
  'brouillon',
  '18. la duplication d’un devis accepté produit un nouveau devis brouillon'
);

-- 19. La copie est librement modifiable.
select lives_ok(
  format($$update public.devis set montant_ht = 500 where id = %L$$, :'copie_id'),
  '19. la copie dupliquée (brouillon) est modifiable normalement'
);

-- 20. Une fois la copie acceptée à son tour, elle devient verrouillée.
select lives_ok(
  format($$update public.devis set statut = 'accepte' where id = %L$$, :'copie_id'),
  '20. la copie dupliquée peut être acceptée normalement'
);
select throws_like(
  format($$update public.devis set montant_ht = 1 where id = %L$$, :'copie_id'),
  '%accepté%',
  '21. la copie, une fois acceptée, est à son tour verrouillée'
);

-- 22. Facturation depuis un devis accepté verrouillé : continue de fonctionner. On utilise la
-- copie dupliquée (montant 500, aucune facture déjà émise) : a9000000-...-001 porte déjà une
-- facture du fixture pour son montant complet (100/100), tout acompte y serait à juste titre
-- refusé par le garde-fou anti-surfacturation, indépendant de ce lot.
select lives_ok(
  format($$select public.creer_facture_avancee('a0000000-0000-0000-0000-000000000001', %L, 'acompte', 30, false)$$, :'copie_id'),
  '22. la création d’une facture d’acompte depuis un devis accepté verrouillé fonctionne toujours'
);

-- 23. Lecture d’un devis accepté verrouillé : inchangée, toujours visible.
select is(
  (select count(*) from public.devis where id = 'a9000000-0000-0000-0000-000000000001'),
  1::bigint,
  '23. un devis accepté verrouillé reste lisible normalement'
);

-- 24. Suppression d’un devis brouillon avec lignes : la cascade fonctionne toujours (cas
-- particulier du verrou sur lignes_devis, qui ne doit pas bloquer une cascade légitime).
select lives_ok(
  $$delete from public.devis where id = 'a9000000-0000-0000-0000-000000000002'$$,
  '24. supprimer un devis brouillon supprime bien ses lignes en cascade, sans erreur'
);

reset role;

-- 25-26. Cross-tenant : admin B ne peut ni lire ni modifier le devis accepté de l’entreprise A.
-- Vérifié depuis un contexte capable de voir la ligne (superuser) après la tentative de B,
-- car RLS masque de toute façon la ligne à B, que l’écriture ait réussi ou non.
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
select is(
  (select count(*) from public.devis where id = 'a9000000-0000-0000-0000-000000000001'),
  0::bigint,
  '25. admin B ne voit pas le devis accepté de l’entreprise A (RLS, inchangée par le verrou)'
);
select lives_ok(
  $$update public.devis set montant_ht = 777 where id = 'a9000000-0000-0000-0000-000000000001'$$,
  '26. la tentative de B ne lève pas d’erreur (RLS filtre la ligne avant d’atteindre le verrou)'
);
reset role;
select is(
  (select montant_ht from public.devis where id = 'a9000000-0000-0000-0000-000000000001'),
  100::numeric,
  '27. le montant du devis A est resté intact après la tentative de B (vérifié en superuser)'
);

-- 28. anon n'a même pas de droit de lecture de base sur devis (GRANT, indépendant de ce lot).
reset role;
select is(
  has_table_privilege('anon', 'public.devis', 'SELECT'),
  false,
  '28. anon n’a aucun privilège de lecture sur devis (inchangé par l’ajout du verrou)'
);

select * from finish();
rollback;
