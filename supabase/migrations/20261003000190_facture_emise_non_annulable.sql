-- Une facture émise ne peut plus être passée au statut « annulée ».
--
-- La recette a annulé FAC-2026-008 (émise, numérotée) en un clic depuis la
-- fiche, sans avoir : le numéro disparaissait du chiffre d'affaires et de la
-- trésorerie sans document rectificatif. Seul un brouillon (non numéroté) peut
-- être annulé ; une facture émise se neutralise par un avoir.

create or replace function public.trg_facture_emise_non_annulable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.statut = 'annulee' and old.statut is distinct from 'annulee' and old.numero is not null then
    raise exception '%', ('Une facture ' || chr(233) || 'mise ne peut pas ' || chr(234) || 'tre annul' || chr(233) || 'e : ' || chr(233) || 'mettez un avoir');
  end if;
  return new;
end;
$$;

revoke all on function public.trg_facture_emise_non_annulable() from public, anon, authenticated;

drop trigger if exists facture_emise_non_annulable on public.factures;
create trigger facture_emise_non_annulable
  before update of statut on public.factures
  for each row execute function public.trg_facture_emise_non_annulable();
