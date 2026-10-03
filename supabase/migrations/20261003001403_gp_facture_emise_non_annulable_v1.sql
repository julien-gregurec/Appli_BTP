-- ELSATIA GP BUSINESS HARDENING V9.1 — portage sémantique de la recette métier GP
-- (source : claude/loving-heisenberg-ygkjck, rapport ELSATIA_GP_END_TO_END_BUSINESS_ACCEPTANCE_V1.md).
-- Rapport : docs/qualification/ELSATIA_GP_BUSINESS_HARDENING_V9_1.md — témoin : supabase/tests/gp_business_hardening_v9_1.test.sql
--
-- B24 : une facture émise (statut ≠ brouillon) pouvait passer à « annulée »
-- en un clic (et par l'API), sortant du chiffre d'affaires sans document
-- rectificatif. Seul un brouillon (non numéroté) s'annule ; une facture émise
-- se neutralise par un avoir. Aucun flux V9.1 n'annule une facture émise.

create or replace function public.trg_facture_emise_non_annulable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.statut = 'annulee' and old.statut is distinct from 'annulee' and old.statut <> 'brouillon' then
    raise exception 'Une facture émise ne peut pas être annulée : émettez un avoir';
  end if;
  return new;
end;
$$;

revoke all on function public.trg_facture_emise_non_annulable() from public, anon, authenticated, service_role;

drop trigger if exists facture_emise_non_annulable on public.factures;
create trigger facture_emise_non_annulable
  before update of statut on public.factures
  for each row execute function public.trg_facture_emise_non_annulable();
