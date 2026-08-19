-- FACTURATION-BTP-V1B : correctifs des 3 P0 identifiés par l'audit FACTURATION-BTP-V1
-- (paiements sans GRANT, sur-facturation acompte+situation, facture classique
-- dupliquable) et du P1 associé (facture émise mutable en écriture directe).
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

\ir fixtures/isolation_multitenant.inc

-- Devis brouillon dédié pour entreprise A (10 000 € HT), distinct du devis déjà
-- accepté du fixture partagé (a9000000-...-001), pour ne dépendre d'aucun autre
-- test et manipuler des montants précis.
insert into public.devis (id, entreprise_id, numero, client_id, chantier_id, statut, montant_ht, montant_tva, montant_ttc) values
  ('fb000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'TEST_A_DEV_FB01', 'a3000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'accepte', 10000, 2000, 12000);
insert into public.lignes_devis (id, devis_id, designation, type, quantite, unite, prix_unitaire_ht, ordre) values
  ('fb100000-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000001', 'Prestation FB01', 'forfait', 1, 'forfait', 10000, 1);

-- Facture déjà 'envoyee' : ses lignes sont insérées en contournant volontairement
-- le trigger existant lignes_factures_brouillon_only (enrichissement de fixture,
-- pas une action utilisateur simulée — cf. le motif déjà utilisé ailleurs dans
-- cette suite pour la même raison).
insert into public.factures (id, entreprise_id, numero, client_id, chantier_id, statut, montant_ht, montant_tva, montant_ttc) values
  ('af000000-0000-0000-0000-000000000098', 'a0000000-0000-0000-0000-000000000001', 'TEST_A_FAC_098', 'a3000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'envoyee', 500, 100, 600);
set session_replication_role = replica;
insert into public.lignes_factures (id, facture_id, designation, type, quantite, unite, prix_unitaire_ht, ordre) values
  ('af500000-0000-0000-0000-000000000001', 'af000000-0000-0000-0000-000000000098', 'Ligne test', 'fourniture', 1, 'u', 500, 1);
set session_replication_role = origin;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

-- 1-2. P0 paiements : INSERT + lecture autorisés pour un tenant légitime.
select lives_ok(
  $$insert into public.paiements (facture_id, montant, mode) values ('af000000-0000-0000-0000-000000000098', 200, 'virement')$$,
  '1. admin A peut enregistrer un paiement sur sa propre facture'
);
select is(
  (select montant from public.paiements where facture_id = 'af000000-0000-0000-0000-000000000098'),
  200::numeric,
  '2. admin A lit correctement le paiement enregistré'
);

reset role;

-- 3-4. Cross-tenant : admin B ne lit ni n'insère sur la facture de A.
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
select is(
  (select count(*) from public.paiements where facture_id = 'af000000-0000-0000-0000-000000000098'),
  0::bigint,
  '3. admin B ne voit aucun paiement de la facture A'
);
select throws_like(
  $$insert into public.paiements (facture_id, montant, mode) values ('af000000-0000-0000-0000-000000000098', 999, 'virement')$$,
  '%row-level security%',
  '4. admin B ne peut pas insérer un paiement sur la facture de A'
);

reset role;
select is(
  (select count(*) from public.paiements where facture_id = 'af000000-0000-0000-0000-000000000098'),
  1::bigint,
  '5. un seul paiement existe réellement sur la facture A (vérifié en superuser)'
);

-- 6. Rôle sans permission facturation : refus.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);
select throws_like(
  $$insert into public.paiements (facture_id, montant, mode) values ('af000000-0000-0000-0000-000000000098', 50, 'virement')$$,
  '%row-level security%',
  '6. un salarié terrain sans droit facturation ne peut pas enregistrer de paiement'
);
reset role;

-- 7-8. anon : aucun privilège.
select is(has_table_privilege('anon', 'public.paiements', 'SELECT'), false, '7. anon n''a aucun privilège de lecture sur paiements');
select is(has_table_privilege('anon', 'public.paiements', 'INSERT'), false, '8. anon n''a aucun privilège d''écriture sur paiements');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

-- 9-10. Paiement partiel puis complémentaire (facture 500€ HT / 600€ TTC, déjà 200€ payés).
select lives_ok(
  $$insert into public.paiements (facture_id, montant, mode) values ('af000000-0000-0000-0000-000000000098', 400, 'virement')$$,
  '9. paiement complémentaire accepté'
);
select is(
  (select statut from public.factures where id = 'af000000-0000-0000-0000-000000000098'),
  'payee',
  '10. la facture passe automatiquement à payée une fois le TTC atteint (200+400=600)'
);

-- 11. P0 anti-surfacturation : acompte 20% sur devis 10 000€ → 2 000€.
select public.creer_facture_avancee('a0000000-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000001', 'acompte', 20, false) as acompte_id \gset
select is((select montant_ht from public.factures where id = :'acompte_id'), 2000::numeric, '11. acompte 20% = 2000€ exactement');

-- 12. Situation à 50% cumulé (5000€) : autorisée (total réel après = 7000€, sous le plafond).
select public.creer_situation_travaux('a0000000-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000001', 50, 0, 'Situation test') as situation1_id \gset
select public.facturer_situation_travaux('a0000000-0000-0000-0000-000000000001', :'situation1_id') as facture_situation1_id \gset
select is((select montant_ht from public.factures where id = :'facture_situation1_id'), 5000::numeric, '12. situation à 50% = 5000€');

-- 13. LE CORRECTIF : situation à 100% cumulé (5000€ de période supplémentaire) doit
-- désormais être refusée, car acompte (2000) + situation déjà facturée (5000) + cette
-- nouvelle période (5000) = 12000€ > 10000€.
select throws_like(
  $$select public.creer_situation_travaux('a0000000-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000001', 100, 0, 'Situation excédentaire')$$,
  '%dépasserait le montant contractuel autorisé%',
  '13. une situation qui, combinée à l''acompte déjà facturé, dépasserait le devis est refusée'
);

-- 14. Confirmation : le total réel facturé reste strictement sous le plafond (7000€).
select is(
  (select coalesce(sum(montant_ht),0) from public.factures where devis_origine_id = 'fb000000-0000-0000-0000-000000000001' and statut <> 'annulee'),
  7000::numeric,
  '14. le total facturé reste à 7000€, la sur-facturation n''a pas eu lieu'
);

-- 15. Une situation plus modeste (80%, soit +3000€ de période) reste acceptée, puis
-- réellement facturée (facturer_situation_travaux), portant le total réel à 10000€.
select public.creer_situation_travaux('a0000000-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000001', 80, 0, 'Situation dans les clous') as situation2_id \gset
select public.facturer_situation_travaux('a0000000-0000-0000-0000-000000000001', :'situation2_id') as facture_situation2_id \gset
select is(
  (select coalesce(sum(montant_ht),0) from public.factures where devis_origine_id = 'fb000000-0000-0000-0000-000000000001' and statut <> 'annulee'),
  10000::numeric,
  '15. une situation qui reste dans le plafond (7000+3000=10000), une fois facturée, porte le total réel à 10000€'
);

-- 16. Une facture finale par-dessus (déjà 10000€ facturés) est refusée.
select throws_like(
  $$select public.creer_facture_avancee('a0000000-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000001', 'finale', 1, false)$$,
  '%dépasserait le montant contractuel du devis%',
  '16. une facture finale par-dessus un devis déjà entièrement facturé est refusée'
);

-- 17. P0 facture classique : sur un devis vierge de toute facturation, autorisée. Les
-- lignes sont insérées en contournant le trigger DEVIS-LOCK-V1 (enrichissement de
-- fixture pour un devis déjà 'accepte', pas une action utilisateur simulée).
insert into public.devis (id, entreprise_id, numero, client_id, chantier_id, statut, montant_ht, montant_tva, montant_ttc) values
  ('fb000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'TEST_A_DEV_FB02', 'a3000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'accepte', 3000, 600, 3600);
reset role;
set session_replication_role = replica;
insert into public.lignes_devis (devis_id, designation, type, quantite, unite, prix_unitaire_ht, ordre) values
  ('fb000000-0000-0000-0000-000000000002', 'Prestation FB02', 'forfait', 1, 'forfait', 3000, 1);
set session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select public.creer_facture_depuis_devis('fb000000-0000-0000-0000-000000000002', 'simple') as facture_simple_id \gset
select is((select montant_ht from public.factures where id = :'facture_simple_id'), 3000::numeric, '17. la première facture classique sur un devis vierge est acceptée');

-- 18-19. LE CORRECTIF : un second appel sur le même devis est refusé (duplication bloquée).
select throws_like(
  $$select public.creer_facture_depuis_devis('fb000000-0000-0000-0000-000000000002', 'simple')$$,
  '%déjà facturé%',
  '18. un second appel de creer_facture_depuis_devis sur le même devis est refusé'
);
select is(
  (select count(*) from public.factures where devis_origine_id = 'fb000000-0000-0000-0000-000000000002'),
  1::bigint,
  '19. une seule facture existe réellement sur ce devis'
);

-- 20. anon ne peut plus exécuter creer_facture_depuis_devis (sécurité en profondeur restaurée).
select is(
  has_function_privilege('anon', 'public.creer_facture_depuis_devis(uuid,text)', 'EXECUTE'),
  false,
  '20. anon n''a plus le droit d''exécuter creer_facture_depuis_devis'
);

-- 21. P1 FACTURE-LOCK : une facture brouillon reste librement modifiable.
select lives_ok(
  format($$update public.factures set montant_ht = 3500 where id = %L$$, :'facture_simple_id'),
  '21. une facture brouillon reste librement modifiable'
);
select lives_ok(
  format($$update public.factures set montant_ht = 3000 where id = %L$$, :'facture_simple_id'),
  '21b. remise à la valeur initiale (nettoyage du test 21)'
);

-- 22. Facture émise : le montant ne peut plus être modifié en écriture directe.
select throws_like(
  $$update public.factures set montant_ht = 1 where id = 'af000000-0000-0000-0000-000000000098'$$,
  '%déjà été émise%',
  '22. une facture émise ne peut plus voir son montant modifié'
);

-- 23. Facture émise : le client ne peut plus être modifié.
select throws_like(
  $$update public.factures set client_id = 'a3000000-0000-0000-0000-000000000003' where id = 'af000000-0000-0000-0000-000000000098'$$,
  '%déjà été émise%',
  '23. une facture émise ne peut plus changer de client'
);

-- 24. Facture émise : ne peut pas redevenir brouillon.
select throws_like(
  $$update public.factures set statut = 'brouillon' where id = 'af000000-0000-0000-0000-000000000098'$$,
  '%redevenir brouillon%',
  '24. une facture émise ne peut pas redevenir brouillon'
);

-- 25. Facture émise : ligne INSERT refusée (protection déjà existante, non modifiée).
select throws_like(
  $$insert into public.lignes_factures (facture_id, designation, type, quantite, unite, prix_unitaire_ht, ordre) values ('af000000-0000-0000-0000-000000000098', 'Intrusion', 'fourniture', 1, 'u', 1, 9)$$,
  '%plus être modifiées%',
  '25. impossible d''insérer une ligne sur une facture émise'
);

-- 26. Facture émise : ligne UPDATE refusée.
select throws_like(
  $$update public.lignes_factures set prix_unitaire_ht = 1 where id = 'af500000-0000-0000-0000-000000000001'$$,
  '%plus être modifiées%',
  '26. impossible de modifier une ligne d''une facture émise'
);

-- 27. Facture émise : ligne DELETE refusée.
select throws_like(
  $$delete from public.lignes_factures where id = 'af500000-0000-0000-0000-000000000001'$$,
  '%plus être modifiées%',
  '27. impossible de supprimer une ligne d''une facture émise'
);

-- 28. Suppression d'une facture émise : refusée explicitement (plus un simple effet de bord).
select throws_like(
  $$delete from public.factures where id = 'af000000-0000-0000-0000-000000000098'$$,
  '%plus être supprimée%',
  '28. une facture émise ne peut plus être supprimée (règle explicite)'
);

-- 29. Champ non contractuel : notes_internes reste modifiable.
select lives_ok(
  $$update public.factures set notes_internes = 'note test' where id = 'af000000-0000-0000-0000-000000000098'$$,
  '29. les notes internes restent modifiables sur une facture émise'
);

-- 30. Champ non contractuel : date_echeance reste modifiable (modifierEcheanceFactureAction).
select lives_ok(
  $$update public.factures set date_echeance = current_date + 60 where id = 'af000000-0000-0000-0000-000000000098'$$,
  '30. l''échéance reste modifiable sur une facture émise (fonctionnalité existante)'
);

-- 31. Le montant de la facture émise n'a bougé sur aucune des tentatives précédentes.
select is(
  (select montant_ht from public.factures where id = 'af000000-0000-0000-0000-000000000098'),
  500::numeric,
  '31. le montant de la facture émise est resté intact malgré les tentatives'
);

-- 32. Cross-tenant : admin B ne peut ni lire ni modifier la facture émise de A.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
select is(
  (select count(*) from public.factures where id = 'af000000-0000-0000-0000-000000000098'),
  0::bigint,
  '32. admin B ne voit pas la facture émise de l''entreprise A'
);
reset role;

-- 33. Avoir : impact correct sur le montant net facturé du devis (10000 facturé - avoir 1000 = 9000).
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select public.creer_facture_avancee('a0000000-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000001', 'avoir', 10, false) as avoir_id \gset
select is(
  (select coalesce(sum(montant_ht),0) from public.factures where devis_origine_id = 'fb000000-0000-0000-0000-000000000001' and statut <> 'annulee'),
  9000::numeric,
  '33. un avoir de 1000€ (10% de 10000) ramène le total net facturé à 9000€'
);

-- 34. Un avoir ne bloque jamais, même si le devis est déjà entièrement facturé.
select lives_ok(
  $$select public.creer_facture_avancee('a0000000-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000001', 'avoir', 5, false)$$,
  '34. un second avoir reste toujours autorisé, jamais bloqué par le plafond'
);

reset role;
select * from finish();
rollback;
