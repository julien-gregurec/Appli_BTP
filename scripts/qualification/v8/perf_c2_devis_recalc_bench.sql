-- ELSATIA — Train canonique V8 : mesure avant/après du correctif Performance C2
-- (recalcul des totaux de devis par instruction, migration 20260928000812).
-- Rapport : docs/qualification/ELSATIA_CANONICAL_TRAIN_V8_CONVERGENCE_V1.md (§ Performance).
--
-- Transaction ANNULÉE. Jeu : fixture d'isolation pgTAP (supabase/tests/fixtures) ; un devis
-- brouillon, 1 000 lignes insérées en une instruction, 1 000 lignes supprimées en une
-- instruction (motif de modifier_devis_brouillon). Sortie : durées en ms et TTC final.
-- Usage : cd supabase/tests && psql -X -q -At -d <base> -f ../../scripts/qualification/v8/perf_c2_devis_recalc_bench.sql
begin;
\ir ../../../supabase/tests/fixtures/isolation_multitenant.inc
insert into public.devis (id, entreprise_id, client_id, statut, date_emission, date_validite, remise_globale)
values ('d8880000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000001',
        (select id from public.clients where entreprise_id = 'a0000000-0000-0000-0000-000000000001' limit 1),
        'brouillon', current_date, current_date + 30, 5);
create temp table mesure(etape text, ms numeric);
do $$
declare t timestamptz;
begin
  t := clock_timestamp();
  insert into public.lignes_devis (devis_id, designation, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre)
  select 'd8880000-0000-4000-8000-000000000001', 'Ligne ' || g, 'fourniture', 1 + (g % 7) * 0.5, 'u',
         10 + (g % 13) * 3.33, (g % 4) * 2.5, (array[20, 10, 5.5])[1 + g % 3], g
  from generate_series(1, 1000) g;
  insert into mesure values ('insert_1000', extract(epoch from clock_timestamp() - t) * 1000);
  insert into mesure values ('ttc_apres_insert', (select montant_ttc from public.devis where id = 'd8880000-0000-4000-8000-000000000001'));
  t := clock_timestamp();
  update public.lignes_devis set quantite = quantite + 1 where devis_id = 'd8880000-0000-4000-8000-000000000001';
  insert into mesure values ('update_1000', extract(epoch from clock_timestamp() - t) * 1000);
  insert into mesure values ('ttc_apres_update', (select montant_ttc from public.devis where id = 'd8880000-0000-4000-8000-000000000001'));
  t := clock_timestamp();
  delete from public.lignes_devis where devis_id = 'd8880000-0000-4000-8000-000000000001';
  insert into mesure values ('delete_1000', extract(epoch from clock_timestamp() - t) * 1000);
  insert into mesure values ('ttc_apres_delete', (select montant_ttc from public.devis where id = 'd8880000-0000-4000-8000-000000000001'));
end $$;
select etape || '=' || round(ms, 2) from mesure;
rollback;
