-- TVA des factures fournisseurs : taux français explicite et calcul serveur.
alter table public.depenses_fournisseurs
  add column if not exists taux_tva numeric(5,2);

update public.depenses_fournisseurs
set taux_tva = case
  when montant_ht = 0 or montant_tva = 0 then 0
  when abs((montant_tva / montant_ht * 100) - 2.1) < 0.2 then 2.1
  when abs((montant_tva / montant_ht * 100) - 5.5) < 0.3 then 5.5
  when abs((montant_tva / montant_ht * 100) - 10) < 0.3 then 10
  else 20
end
where taux_tva is null;

alter table public.depenses_fournisseurs
  alter column taux_tva set default 20,
  alter column taux_tva set not null;

alter table public.depenses_fournisseurs
  drop constraint if exists depenses_fournisseurs_taux_tva_fr_check;
alter table public.depenses_fournisseurs
  add constraint depenses_fournisseurs_taux_tva_fr_check
  check (taux_tva in (0, 2.1, 5.5, 10, 20));

create or replace function public.trg_calculer_tva_depense_fournisseur()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.taux_tva not in (0, 2.1, 5.5, 10, 20) then
    raise exception 'Taux de TVA non autorisé';
  end if;
  new.montant_ht := round(new.montant_ht, 2);
  new.montant_tva := round(new.montant_ht * new.taux_tva / 100, 2);
  return new;
end;
$$;

drop trigger if exists calculer_tva_depense_fournisseur on public.depenses_fournisseurs;
create trigger calculer_tva_depense_fournisseur
before insert or update of montant_ht, taux_tva
on public.depenses_fournisseurs
for each row execute function public.trg_calculer_tva_depense_fournisseur();

revoke all on function public.trg_calculer_tva_depense_fournisseur() from public, anon, authenticated;
notify pgrst, 'reload schema';

