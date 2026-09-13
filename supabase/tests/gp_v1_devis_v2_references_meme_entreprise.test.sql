-- =====================================================================================================
-- PREUVE pgTAP — GP V1, presse-papier de lignes : références catalogue / ouvrages de la même entreprise
-- (migration 20260913000291). Une ligne de devis ne peut référencer qu'un article, une prestation ou un
-- ouvrage de l'entreprise du devis ; une référence nulle reste libre.
-- =====================================================================================================
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

\ir fixtures/isolation_multitenant.inc

-- Brouillons de A et de B (les devis de la fixture sont acceptés : verrouillés).
insert into public.devis (id, entreprise_id, numero, client_id, chantier_id, statut, montant_ht, montant_tva, montant_ttc)
values ('a9000000-0000-0000-0000-000000000291', 'a0000000-0000-0000-0000-000000000001', 'PGTAP-A-291', 'a3000000-0000-0000-0000-000000000001', null, 'brouillon', 0, 0, 0),
       ('b9000000-0000-0000-0000-000000000291', 'b0000000-0000-0000-0000-000000000001', 'PGTAP-B-291', 'b3000000-0000-0000-0000-000000000001', null, 'brouillon', 0, 0, 0);
insert into public.prestations_catalogue (id, entreprise_id, designation, type, unite, prix_unitaire_ht, taux_tva)
values ('a7000000-0000-0000-0000-000000000291', 'a0000000-0000-0000-0000-000000000001', 'Prestation A (fictif)', 'fourniture', 'u', 10, 20);
insert into public.articles_stock (id, entreprise_id, designation, reference)
values ('a8000000-0000-0000-0000-000000000291', 'a0000000-0000-0000-0000-000000000001', 'Article stock A (fictif)', 'STK-A-291');
insert into public.ouvrages (id, entreprise_id, reference_interne, nom, unite_principale)
values ('ab000000-0000-0000-0000-000000000291', 'a0000000-0000-0000-0000-000000000001', 'OUV-A-291', 'Ouvrage A (fictif)', 'm²');

select has_trigger('public', 'lignes_devis', 'lignes_devis_source_meme_entreprise', 'déclencheur source de ligne présent');
select has_trigger('public', 'devis_ouvrages', 'devis_ouvrages_ouvrage_meme_entreprise', 'déclencheur ouvrage de devis présent');

select lives_ok($$insert into public.lignes_devis (devis_id, designation, quantite, prix_unitaire_ht, ordre, cle_ligne, source_catalogue, source_id)
  values ('a9000000-0000-0000-0000-000000000291', 'Ligne A → prestation A', 1, 10, 1, 'a-ok', 'prestation', 'a7000000-0000-0000-0000-000000000291')$$,
  'A référence sa propre prestation : accepté');
select lives_ok($$insert into public.lignes_devis (devis_id, designation, quantite, prix_unitaire_ht, ordre, cle_ligne, source_catalogue, source_id)
  values ('a9000000-0000-0000-0000-000000000291', 'Ligne A → article stock A', 1, 10, 2, 'a-stk', 'article', 'a8000000-0000-0000-0000-000000000291')$$,
  'A référence son propre article de stock : accepté');
select lives_ok($$insert into public.lignes_devis (devis_id, designation, quantite, prix_unitaire_ht, ordre, cle_ligne)
  values ('b9000000-0000-0000-0000-000000000291', 'Ligne libre B', 1, 10, 1, 'b-libre')$$,
  'ligne sans référence : acceptée');
select throws_ok($$insert into public.lignes_devis (devis_id, designation, quantite, prix_unitaire_ht, ordre, cle_ligne, source_catalogue, source_id)
  values ('b9000000-0000-0000-0000-000000000291', 'Ligne B → prestation de A', 1, 10, 2, 'b-forge', 'prestation', 'a7000000-0000-0000-0000-000000000291')$$,
  '23514', null, 'B ne peut pas référencer une prestation de A (presse-papier forgé)');
select throws_ok($$insert into public.lignes_devis (devis_id, designation, quantite, prix_unitaire_ht, ordre, cle_ligne, source_catalogue, source_id)
  values ('b9000000-0000-0000-0000-000000000291', 'Ligne B → article de A', 1, 10, 3, 'b-forge2', 'article', 'a8000000-0000-0000-0000-000000000291')$$,
  '23514', null, 'B ne peut pas référencer un article de stock de A');
select throws_ok($$update public.lignes_devis set source_catalogue = 'prestation', source_id = 'a7000000-0000-0000-0000-000000000291' where cle_ligne = 'b-libre'$$,
  '23514', null, 'une mise à jour vers une référence étrangère est refusée');
select is((select count(*)::int from public.lignes_devis where devis_id = 'b9000000-0000-0000-0000-000000000291'), 1, 'aucune ligne étrangère créée chez B');

select lives_ok($$insert into public.devis_ouvrages (devis_id, entreprise_id, cle, ordre, ouvrage_id, ouvrage_version, ouvrage_nom, unite_principale, quantite_principale, mode_presentation, libelle_client, instantane_modele)
  values ('a9000000-0000-0000-0000-000000000291', 'a0000000-0000-0000-0000-000000000001', 'o-a', 1, 'ab000000-0000-0000-0000-000000000291', 1, 'Ouvrage A', 'm²', 1, 'regroupe', 'Ouvrage A', '{}'::jsonb)$$,
  'A insère son propre ouvrage : accepté');
select throws_ok($$insert into public.devis_ouvrages (devis_id, entreprise_id, cle, ordre, ouvrage_id, ouvrage_version, ouvrage_nom, unite_principale, quantite_principale, mode_presentation, libelle_client, instantane_modele)
  values ('b9000000-0000-0000-0000-000000000291', 'b0000000-0000-0000-0000-000000000001', 'o-b', 1, 'ab000000-0000-0000-0000-000000000291', 1, 'Ouvrage A', 'm²', 1, 'regroupe', 'Ouvrage A', '{}'::jsonb)$$,
  '23514', null, 'B ne peut pas insérer un ouvrage de A');

select * from finish();
rollback;
