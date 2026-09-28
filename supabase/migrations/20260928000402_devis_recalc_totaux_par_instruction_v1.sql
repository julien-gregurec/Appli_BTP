-- ============================================================================
-- ELSATIA — Baseline performance V1 : totaux de devis recalculés une fois par instruction
-- (docs/qualification/ELSATIA_PERFORMANCE_CAPACITY_BASELINE_V1.md, § Correctifs)
--
-- MESURÉ AVANT (PostgreSQL 16, jeu GP moyen, rôle authenticated, RLS active) :
--   modifier_devis_brouillon (supprime puis réinsère toutes les lignes) :
--   20 lignes 0,38 s · 100 lignes 1,29 s · 500 lignes 6,08 s · 1 000 lignes 13,42 s.
--   EXPLAIN ANALYZE (200 lignes) : trigger recalc_devis_apres_ligne = 1 085 ms sur 1 266 ms à
--   l'insertion, 1 044 ms sur 1 412 ms à la suppression (≈ 5,4 ms par ligne).
-- CAUSE : le trigger `FOR EACH ROW` appelle recalc_totaux_devis(devis_id) pour CHAQUE ligne :
--   somme de toutes les lignes du devis, puis UPDATE du devis, qui redéclenche à chaque fois
--   la dizaine de triggers de `devis` (instantanés client/entreprise, cache du tableau de
--   bord, verrous…). Une sauvegarde de n lignes paie donc 2n UPDATE du devis.
--
-- CORRECTIF : même fonction de calcul (recalc_totaux_devis, inchangée), appelée UNE fois par
-- devis touché et par instruction, via trois triggers `FOR EACH STATEMENT` à tables de
-- transition (une par évènement : PostgreSQL n'admet pas de tables de transition sur un
-- trigger multi-évènement). Un trigger AFTER ROW s'exécute de toute façon à la fin de
-- l'instruction : l'état final du devis est identique (mêmes totaux, même arrondi), seul le
-- nombre de recalculs intermédiaires disparaît. Un changement de devis_id (UPDATE) recalcule
-- l'ancien ET le nouveau devis, comme avant. Le verrou `verrou_lignes_devis_accepte` (BEFORE
-- ROW) et `synchroniser_taches_ligne_devis` (AFTER ROW, n'utilise pas les totaux) sont
-- inchangés. trg_recalc_devis() est conservée (non référencée) pour ne rien retirer.
-- ============================================================================

create or replace function public.trg_recalc_devis_instruction()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_devis_id uuid;
begin
  if tg_op = 'INSERT' then
    for v_devis_id in select distinct devis_id from lignes_nouvelles where devis_id is not null loop
      perform public.recalc_totaux_devis(v_devis_id);
    end loop;
  elsif tg_op = 'DELETE' then
    for v_devis_id in select distinct devis_id from lignes_anciennes where devis_id is not null loop
      perform public.recalc_totaux_devis(v_devis_id);
    end loop;
  else
    for v_devis_id in
      select devis_id from lignes_nouvelles where devis_id is not null
      union
      select devis_id from lignes_anciennes where devis_id is not null
    loop
      perform public.recalc_totaux_devis(v_devis_id);
    end loop;
  end if;
  return null;
end;
$function$;

-- Même posture d'accès que trg_recalc_devis : fonction de trigger, jamais appelée par l'API.
revoke all on function public.trg_recalc_devis_instruction() from public, anon, authenticated;

drop trigger if exists recalc_devis_apres_ligne on public.lignes_devis;

create trigger recalc_devis_apres_insertion_lignes
  after insert on public.lignes_devis
  referencing new table as lignes_nouvelles
  for each statement execute function public.trg_recalc_devis_instruction();

create trigger recalc_devis_apres_modification_lignes
  after update on public.lignes_devis
  referencing old table as lignes_anciennes new table as lignes_nouvelles
  for each statement execute function public.trg_recalc_devis_instruction();

create trigger recalc_devis_apres_suppression_lignes
  after delete on public.lignes_devis
  referencing old table as lignes_anciennes
  for each statement execute function public.trg_recalc_devis_instruction();
