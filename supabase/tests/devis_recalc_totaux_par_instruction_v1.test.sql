begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- ELSATIA — Baseline performance V1 : 20260928000402 remplace le trigger FOR EACH ROW
-- recalc_devis_apres_ligne par trois triggers FOR EACH STATEMENT (tables de transition).
-- Ce test prouve que les totaux restent EXACTEMENT ceux de recalc_totaux_devis, pour chaque
-- évènement, pour plusieurs devis touchés par une même instruction, pour un déplacement de
-- ligne d'un devis à l'autre, avec remise de ligne et remise globale, et que le verrou des
-- devis acceptés reste actif.

\ir fixtures/isolation_multitenant.inc

select is(
  (select array_agg(tgname::text order by tgname) from pg_trigger
    where tgrelid = 'public.lignes_devis'::regclass and not tgisinternal and tgname like 'recalc_devis%'),
  array['recalc_devis_apres_insertion_lignes','recalc_devis_apres_modification_lignes','recalc_devis_apres_suppression_lignes'],
  'les trois triggers par instruction remplacent recalc_devis_apres_ligne');
select ok(
  (select bool_and((tgtype & 1) = 0) from pg_trigger where tgrelid = 'public.lignes_devis'::regclass and tgname like 'recalc_devis_apres_%_lignes'),
  'ils sont FOR EACH STATEMENT');
select ok(not has_function_privilege('authenticated', 'public.trg_recalc_devis_instruction()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.trg_recalc_devis_instruction()', 'EXECUTE'),
  'la fonction de trigger n''est pas exécutable par l''API');

-- Référence : le calcul de recalc_totaux_devis, recopié.
create function pg_temp.ttc_attendu(p_devis uuid) returns numeric language sql as $$
  select round(
    (coalesce(sum(q * pu * (1 - rl / 100)), 0) + coalesce(sum(q * pu * (1 - rl / 100) * tva / 100), 0))
    * (1 - coalesce((select remise_globale from public.devis where id = p_devis), 0) / 100), 2)
  from (select quantite q, prix_unitaire_ht pu, remise_ligne rl, taux_tva tva from public.lignes_devis where devis_id = p_devis) s
$$;

insert into public.devis (id, entreprise_id, client_id, statut, date_emission, date_validite, remise_globale)
select v.id, 'a0000000-0000-0000-0000-000000000001', (select id from public.clients where entreprise_id = 'a0000000-0000-0000-0000-000000000001' limit 1),
  'brouillon', current_date, current_date + 30, v.remise
from (values ('d1110000-0000-4000-8000-000000000001'::uuid, 0::numeric), ('d1110000-0000-4000-8000-000000000002'::uuid, 7.5::numeric)) v(id, remise);

-- Une seule instruction touche DEUX devis (200 + 150 lignes, remises de ligne, TVA variées).
insert into public.lignes_devis (devis_id, designation, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre)
select case when g <= 200 then 'd1110000-0000-4000-8000-000000000001'::uuid else 'd1110000-0000-4000-8000-000000000002'::uuid end,
  'Ligne ' || g, 'fourniture', 1 + (g % 7) * 0.5, 'u', 10 + (g % 13) * 3.33, (g % 4) * 2.5, (array[20, 10, 5.5])[1 + g % 3], g
from generate_series(1, 350) g;

select is((select montant_ttc from public.devis where id = 'd1110000-0000-4000-8000-000000000001'),
  pg_temp.ttc_attendu('d1110000-0000-4000-8000-000000000001'), 'INSERT multi-devis : devis 1 exact');
select is((select montant_ttc from public.devis where id = 'd1110000-0000-4000-8000-000000000002'),
  pg_temp.ttc_attendu('d1110000-0000-4000-8000-000000000002'), 'INSERT multi-devis : devis 2 exact (remise globale 7,5 %)');
select ok((select montant_ht > 0 and montant_tva > 0 from public.devis where id = 'd1110000-0000-4000-8000-000000000001'), 'HT et TVA renseignés');

update public.lignes_devis set quantite = quantite + 1 where devis_id = 'd1110000-0000-4000-8000-000000000001' and ordre % 2 = 0;
select is((select montant_ttc from public.devis where id = 'd1110000-0000-4000-8000-000000000001'),
  pg_temp.ttc_attendu('d1110000-0000-4000-8000-000000000001'), 'UPDATE : total recalculé');

-- Déplacement de lignes d'un devis vers l'autre : les DEUX totaux changent.
update public.lignes_devis set devis_id = 'd1110000-0000-4000-8000-000000000002'
where devis_id = 'd1110000-0000-4000-8000-000000000001' and ordre <= 50;
select is((select montant_ttc from public.devis where id = 'd1110000-0000-4000-8000-000000000001'),
  pg_temp.ttc_attendu('d1110000-0000-4000-8000-000000000001'), 'UPDATE devis_id : ancien devis recalculé');
select is((select montant_ttc from public.devis where id = 'd1110000-0000-4000-8000-000000000002'),
  pg_temp.ttc_attendu('d1110000-0000-4000-8000-000000000002'), 'UPDATE devis_id : nouveau devis recalculé');

delete from public.lignes_devis where devis_id = 'd1110000-0000-4000-8000-000000000002' and ordre > 300;
select is((select montant_ttc from public.devis where id = 'd1110000-0000-4000-8000-000000000002'),
  pg_temp.ttc_attendu('d1110000-0000-4000-8000-000000000002'), 'DELETE partiel : total recalculé');

delete from public.lignes_devis where devis_id = 'd1110000-0000-4000-8000-000000000001';
select is((select (montant_ht, montant_tva, montant_ttc)::text from public.devis where id = 'd1110000-0000-4000-8000-000000000001'),
  '(0.00,0.00,0.00)', 'DELETE total : devis à zéro');

-- Le verrou des devis acceptés (BEFORE ROW) reste en place.
update public.devis set statut = 'envoye' where id = 'd1110000-0000-4000-8000-000000000002';
update public.devis set statut = 'accepte' where id = 'd1110000-0000-4000-8000-000000000002';
select throws_ok(
  $$insert into public.lignes_devis (devis_id, designation, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre)
    values ('d1110000-0000-4000-8000-000000000002', 'Ajout interdit', 'fourniture', 1, 'u', 1, 0, 20, 999)$$,
  null, null, 'lignes d''un devis accepté toujours verrouillées');

select * from finish();
rollback;
