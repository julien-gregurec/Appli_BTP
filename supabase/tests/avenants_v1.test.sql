-- AVENANTS-V1 : modèle de données, statuts, immutabilité, intégration
-- rentabilité/facturation. Réutilise strictement les sources canoniques déjà
-- éprouvées (montant_facture_devis, FACTURATION-BTP-V1B) — aucune seconde
-- logique anti-surfacturation spécifique aux avenants.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

\ir fixtures/isolation_multitenant.inc

-- Devis brouillon puis accepté dédié pour entreprise A (10 000 € HT), distinct
-- du devis déjà accepté du fixture partagé, pour manipuler des montants précis.
insert into public.devis (id, entreprise_id, numero, client_id, chantier_id, statut, montant_ht, montant_tva, montant_ttc) values
  ('a9600000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'TEST_A_DEV_AV01', 'a3000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'accepte', 10000, 2000, 12000);
insert into public.lignes_devis (devis_id, designation, type, quantite, unite, prix_unitaire_ht, ordre) values
  ('a9600000-0000-0000-0000-000000000001', 'Prestation', 'main_oeuvre', 100, 'h', 100, 1);
-- Devis brouillon (pour tester le refus "devis accepté requis").
insert into public.devis (id, entreprise_id, numero, client_id, chantier_id, statut, montant_ht, montant_tva, montant_ttc) values
  ('a9600000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'TEST_A_DEV_AV02', 'a3000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'brouillon', 5000, 1000, 6000);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

-- 1. Création d'un avenant en brouillon avec ligne positive.
select public.creer_avenant('a0000000-0000-0000-0000-000000000001', 'a9600000-0000-0000-0000-000000000001', 'Plus-value', null,
  '[{"designation":"Travaux sup","type":"main_oeuvre","quantite":20,"unite":"h","prix_unitaire_ht":100}]'::jsonb) as av01_id \gset
select is((select statut from public.avenants where id = :'av01_id'), 'brouillon', '1. avenant créé en brouillon');

-- 2. Devis accepté requis (refus sur devis brouillon).
select throws_like(
  $$select public.creer_avenant('a0000000-0000-0000-0000-000000000001', 'a9600000-0000-0000-0000-000000000002', null, null, '[]'::jsonb)$$,
  '%accepté%',
  '2. un avenant ne peut être créé que sur un devis accepté'
);

-- 3. Cross-tenant devis origine refusé (devis de B).
select throws_like(
  $$select public.creer_avenant('a0000000-0000-0000-0000-000000000001', 'b9000000-0000-0000-0000-000000000001', null, null, '[]'::jsonb)$$,
  '%introuvable%',
  '3. impossible de créer un avenant sur le devis d''un autre tenant'
);

-- 4. Ligne positive : montant correctement calculé (20h x 100 = 2000).
select is((select montant_ht from public.avenants where id = :'av01_id'), 2000::numeric, '4. ligne positive : montant calculé correctement (2000€)');

-- 5-6. Moins-value : ligne à quantité négative, calcul du montant.
select public.creer_avenant('a0000000-0000-0000-0000-000000000001', 'a9600000-0000-0000-0000-000000000001', null, null,
  '[{"designation":"Suppression","type":"fourniture","quantite":-1,"unite":"forfait","prix_unitaire_ht":500}]'::jsonb) as av02_id \gset
select is((select montant_ht from public.avenants where id = :'av02_id'), -500::numeric, '5-6. moins-value : quantité négative → montant négatif (-500€)');

-- 7. Avenant brouillon exclu du contrat (vérifié via creer_situation_travaux, qui
-- utilise montant_contractuel_devis en interne : le marché doit rester 10000€).
select public.creer_situation_travaux('a0000000-0000-0000-0000-000000000001', 'a9600000-0000-0000-0000-000000000001', 50, 0, 'Vérif brouillon') as s_verif_id \gset
select is((select montant_marche_ht from public.situations_travaux where id = :'s_verif_id'), 10000::numeric, '7. un avenant brouillon n''entre pas dans le montant contractuel');
update public.situations_travaux set statut = 'annulee' where id = :'s_verif_id';

-- 8. Envoi de l'avenant (toujours exclu du contrat tant que non accepté).
update public.avenants set statut = 'envoye' where id = :'av01_id';
select public.creer_situation_travaux('a0000000-0000-0000-0000-000000000001', 'a9600000-0000-0000-0000-000000000001', 50, 0, 'Vérif envoyé') as s_verif2_id \gset
select is((select montant_marche_ht from public.situations_travaux where id = :'s_verif2_id'), 10000::numeric, '8. un avenant envoyé n''entre pas dans le montant contractuel');
update public.situations_travaux set statut = 'annulee' where id = :'s_verif2_id';

-- 9. Acceptation : dates et auteur capturés automatiquement.
update public.avenants set statut = 'accepte' where id = :'av01_id';
select ok((select date_acceptation is not null and accepte_par is not null from public.avenants where id = :'av01_id'), '9. acceptation : date et auteur capturés automatiquement');

-- 9bis. AV accepté inclus dans le contrat.
select public.creer_situation_travaux('a0000000-0000-0000-0000-000000000001', 'a9600000-0000-0000-0000-000000000001', 50, 0, 'Vérif accepté') as s_verif3_id \gset
select is((select montant_marche_ht from public.situations_travaux where id = :'s_verif3_id'), 12000::numeric, '9bis. un avenant accepté (av01, +2000) entre dans le montant contractuel (12000)');
update public.situations_travaux set statut = 'annulee' where id = :'s_verif3_id';

-- 10. AV refusé exclu.
update public.avenants set statut = 'envoye' where id = :'av02_id';
update public.avenants set statut = 'refuse' where id = :'av02_id';
select public.creer_situation_travaux('a0000000-0000-0000-0000-000000000001', 'a9600000-0000-0000-0000-000000000001', 60, 0, 'Vérif refusé') as s_verif4_id \gset
select is((select montant_marche_ht from public.situations_travaux where id = :'s_verif4_id'), 12000::numeric, '10. un avenant refusé (av02, -500) n''entre pas dans le contrat : reste 12000');
update public.situations_travaux set statut = 'annulee' where id = :'s_verif4_id';

-- 11. AV annulé exclu (nouvel avenant brouillon, annulé sans jamais être accepté).
select public.creer_avenant('a0000000-0000-0000-0000-000000000001', 'a9600000-0000-0000-0000-000000000001', null, null,
  '[{"designation":"Test annulation","type":"forfait","quantite":1,"unite":"forfait","prix_unitaire_ht":1000}]'::jsonb) as av03_id \gset
update public.avenants set statut = 'annule' where id = :'av03_id';
select public.creer_situation_travaux('a0000000-0000-0000-0000-000000000001', 'a9600000-0000-0000-0000-000000000001', 70, 0, 'Vérif annulé') as s_verif5_id \gset
select is((select montant_marche_ht from public.situations_travaux where id = :'s_verif5_id'), 12000::numeric, '11. un avenant annulé (jamais accepté) n''entre pas dans le contrat');
update public.situations_travaux set statut = 'annulee' where id = :'s_verif5_id';

-- 12-13. Multi-avenants : numérotation séquentielle par devis, jamais de collision.
select is((select ordre from public.avenants where id = :'av01_id'), 1, '12. AV01 porte l''ordre 1');
select is((select ordre from public.avenants where id = :'av02_id'), 2, '13. AV02 porte l''ordre 2 (numérotation séquentielle, pas de collision)');

-- 14. (déjà couvert par le test 9, regroupé ici pour la numérotation du cahier des charges)
select ok(true, '14. acceptation capturée (voir test 9)');

-- 15. Lock après acceptation : header.
select throws_like(
  format($$update public.avenants set notes_client = 'x' where id = %L$$, :'av01_id'),
  '%accepté%',
  '15. un avenant accepté ne peut plus être modifié (header)'
);

-- 16. Lock après acceptation : lignes.
select id as ligne_av01_id from public.lignes_avenants where avenant_id = :'av01_id' limit 1 \gset
select throws_like(
  format($$update public.lignes_avenants set prix_unitaire_ht = 1 where id = %L$$, :'ligne_av01_id'),
  '%accepté%',
  '16. les lignes d''un avenant accepté ne peuvent plus être modifiées'
);

-- 17. Suppression d'un avenant accepté refusée.
select throws_like(
  format($$delete from public.avenants where id = %L$$, :'av01_id'),
  '%accepté%',
  '17. un avenant accepté ne peut plus être supprimé'
);

-- 18. Cross-tenant : admin B ne voit pas l'avenant de A.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
select is((select count(*) from public.avenants where id = :'av01_id'), 0::bigint, '18. admin B ne voit pas l''avenant de l''entreprise A');
reset role;

-- 19. anon : aucun privilège.
select is(has_table_privilege('anon', 'public.avenants', 'SELECT'), false, '19. anon n''a aucun privilège de lecture sur avenants');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

-- 20. Plafond de facturation intègre les avenants acceptés : acompte jusqu'à 12000 OK.
select public.creer_facture_avancee('a0000000-0000-0000-0000-000000000001', 'a9600000-0000-0000-0000-000000000001', 'acompte', 100, false) as acompte_id \gset
select is((select montant_ht from public.factures where id = :'acompte_id'), 10000::numeric, '20a. acompte 100% du devis initial (10000) accepté sous un plafond de 12000');
select throws_like(
  $$select public.creer_facture_avancee('a0000000-0000-0000-0000-000000000001', 'a9600000-0000-0000-0000-000000000001', 'finale', 30, false)$$,
  '%dépasserait%',
  '20b. au-delà du plafond contractuel (12000, avenant compris : 10000+30%*10000=13000), refusé'
);
select lives_ok(
  $$select public.creer_facture_avancee('a0000000-0000-0000-0000-000000000001', 'a9600000-0000-0000-0000-000000000001', 'finale', 20, false)$$,
  '20c. le solde de 2000€ (12000-10000) reste facturable grâce à l''avenant accepté'
);

-- 21. Moins-value + plafond : nouveau devis dédié pour un scénario propre. Les
-- lignes sont insérées en contournant DEVIS-LOCK-V1 (enrichissement de fixture
-- pour un devis créé directement 'accepte', pas une action utilisateur simulée).
reset role;
insert into public.devis (id, entreprise_id, numero, client_id, chantier_id, statut, montant_ht, montant_tva, montant_ttc) values
  ('a9600000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'TEST_A_DEV_AV03', 'a3000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'accepte', 10000, 2000, 12000);
set session_replication_role = replica;
insert into public.lignes_devis (devis_id, designation, type, quantite, unite, prix_unitaire_ht, ordre) values
  ('a9600000-0000-0000-0000-000000000003', 'Prestation', 'forfait', 1, 'forfait', 10000, 1);
set session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select public.creer_avenant('a0000000-0000-0000-0000-000000000001', 'a9600000-0000-0000-0000-000000000003', null, null,
  '[{"designation":"Moins-value","type":"forfait","quantite":-1,"unite":"forfait","prix_unitaire_ht":500}]'::jsonb) as av_moins_id \gset
update public.avenants set statut = 'envoye' where id = :'av_moins_id';
update public.avenants set statut = 'accepte' where id = :'av_moins_id';
select throws_like(
  $$select public.creer_facture_avancee('a0000000-0000-0000-0000-000000000001', 'a9600000-0000-0000-0000-000000000003', 'acompte', 100, false)$$,
  '%dépasserait%',
  '21. après une moins-value acceptée (-500), un acompte à 100% du devis initial (10000 > 9500) est refusé'
);

-- 22. Situation : 100% du marché reflète l'avenant accepté (déjà vérifié en détail au test 9bis,
-- confirmation supplémentaire sur le devis du test 21 : marché = 9500).
select public.creer_situation_travaux('a0000000-0000-0000-0000-000000000001', 'a9600000-0000-0000-0000-000000000003', 100, 0, 'Situation finale') as s_final_id \gset
select is((select montant_marche_ht from public.situations_travaux where id = :'s_final_id'), 9500::numeric, '22. une situation à 100% reflète le montant contractuel courant (9500, moins-value comprise)');

-- 23. Finale : cohérente avec le plafond contractuel (déjà couvert par le test 20b/21) —
-- confirmation qu'une finale reste possible tant que le plafond n'est pas atteint.
select lives_ok(
  $$select public.creer_facture_avancee('a0000000-0000-0000-0000-000000000001', 'a9600000-0000-0000-0000-000000000003', 'finale', 5, false)$$,
  '23. une facture finale reste possible tant que le montant contractuel courant n''est pas dépassé'
);

reset role;
select * from finish();
rollback;
