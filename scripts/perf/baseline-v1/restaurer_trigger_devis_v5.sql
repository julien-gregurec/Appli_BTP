-- ELSATIA — Baseline performance V1 : rétablit sur une base de MESURE le trigger de V5
-- (recalc_devis_apres_ligne, FOR EACH ROW, supabase/migrations/20260710000005_devis.sql) après
-- une génération de jeu faite avec 20260928000402 appliquée (générer 20 000 devis avec le
-- trigger par ligne dépassait l'heure). Après ce script, le schéma des lignes de devis est celui
-- de V5 : les mesures « avant » portent bien sur V5. Base jetable uniquement.
drop trigger if exists recalc_devis_apres_insertion_lignes on public.lignes_devis;
drop trigger if exists recalc_devis_apres_modification_lignes on public.lignes_devis;
drop trigger if exists recalc_devis_apres_suppression_lignes on public.lignes_devis;
drop function if exists public.trg_recalc_devis_instruction();
create trigger recalc_devis_apres_ligne
  after insert or update or delete on public.lignes_devis
  for each row execute function public.trg_recalc_devis();
