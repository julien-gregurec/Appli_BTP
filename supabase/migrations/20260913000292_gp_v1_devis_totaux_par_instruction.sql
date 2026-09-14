-- GP V1 — totaux de devis recalculés une fois par instruction (et non par ligne).
--
-- Constat (recette preview 2026-09-13, phase performance) : `recalc_devis_apres_ligne` (20260710000005)
-- est un déclencheur FOR EACH ROW qui relit toutes les lignes du devis à chaque ligne insérée, modifiée ou
-- supprimée. L'enregistrement v2 (`enregistrer_devis_brouillon_v2`) supprime puis réinsère toutes les
-- lignes : coût quadratique — 407 ms sur 435 ms pour 500 lignes en local, `statement_timeout` (8 s) dépassé
-- sur Supabase dès ~200 lignes (erreur 57014, autosauvegarde en boucle). Le recalcul devient FOR EACH
-- STATEMENT, une fois par devis touché, via les tables de transition ; le résultat est identique.

create or replace function public.trg_recalc_devis_instruction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if tg_op = 'INSERT' then
    for v_id in select distinct devis_id from lignes_nouvelles loop
      perform public.recalc_totaux_devis(v_id);
    end loop;
  elsif tg_op = 'DELETE' then
    for v_id in select distinct devis_id from lignes_anciennes loop
      perform public.recalc_totaux_devis(v_id);
    end loop;
  else
    for v_id in select devis_id from lignes_nouvelles union select devis_id from lignes_anciennes loop
      perform public.recalc_totaux_devis(v_id);
    end loop;
  end if;
  return null;
end;
$$;

revoke all on function public.trg_recalc_devis_instruction() from public, anon, authenticated, service_role;

drop trigger if exists recalc_devis_apres_ligne on public.lignes_devis;

drop trigger if exists recalc_devis_apres_lignes_insertion on public.lignes_devis;
create trigger recalc_devis_apres_lignes_insertion
  after insert on public.lignes_devis
  referencing new table as lignes_nouvelles
  for each statement execute function public.trg_recalc_devis_instruction();

drop trigger if exists recalc_devis_apres_lignes_suppression on public.lignes_devis;
create trigger recalc_devis_apres_lignes_suppression
  after delete on public.lignes_devis
  referencing old table as lignes_anciennes
  for each statement execute function public.trg_recalc_devis_instruction();

drop trigger if exists recalc_devis_apres_lignes_modification on public.lignes_devis;
create trigger recalc_devis_apres_lignes_modification
  after update on public.lignes_devis
  referencing old table as lignes_anciennes new table as lignes_nouvelles
  for each statement execute function public.trg_recalc_devis_instruction();

-- L'ancienne fonction par ligne n'est plus référencée par aucun déclencheur.
drop function if exists public.trg_recalc_devis();
