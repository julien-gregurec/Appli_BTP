-- Délai de règlement propre à chaque fournisseur et échéance automatique des factures.
alter table public.fournisseurs
  add column if not exists delai_paiement_jours integer not null default 30;

alter table public.fournisseurs drop constraint if exists fournisseurs_delai_paiement_jours_check;
alter table public.fournisseurs
  add constraint fournisseurs_delai_paiement_jours_check
  check (delai_paiement_jours in (0, 30, 45, 60, 90));

create or replace function public.trg_appliquer_delai_paiement_fournisseur()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_delai integer;
begin
  if new.date_echeance is null then
    select delai_paiement_jours into v_delai
    from public.fournisseurs
    where id=new.fournisseur_id and entreprise_id=new.entreprise_id;
    new.date_echeance := new.date_piece + coalesce(v_delai,30);
  end if;
  return new;
end;$$;

drop trigger if exists appliquer_delai_paiement_fournisseur on public.depenses_fournisseurs;
create trigger appliquer_delai_paiement_fournisseur
before insert or update of fournisseur_id,date_piece,date_echeance
on public.depenses_fournisseurs for each row
execute function public.trg_appliquer_delai_paiement_fournisseur();

revoke all on function public.trg_appliquer_delai_paiement_fournisseur() from public,anon,authenticated;
notify pgrst,'reload schema';
