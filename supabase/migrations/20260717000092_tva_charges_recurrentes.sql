-- TVA automatique des charges récurrentes et transmission fidèle aux factures fournisseurs.
alter table public.charges_recurrentes
  add column if not exists taux_tva numeric(5,2);

update public.charges_recurrentes
set taux_tva = case
  when montant_ht = 0 or montant_tva = 0 then 0
  when abs((montant_tva / montant_ht * 100) - 2.1) < 0.2 then 2.1
  when abs((montant_tva / montant_ht * 100) - 5.5) < 0.3 then 5.5
  when abs((montant_tva / montant_ht * 100) - 10) < 0.3 then 10
  else 20
end
where taux_tva is null;

alter table public.charges_recurrentes
  alter column taux_tva set default 20,
  alter column taux_tva set not null;

alter table public.charges_recurrentes
  drop constraint if exists charges_recurrentes_taux_tva_check;
alter table public.charges_recurrentes
  add constraint charges_recurrentes_taux_tva_check
  check (taux_tva in (0, 2.10, 5.50, 10, 20));

create or replace function public.trg_calculer_tva_charge_recurrente()
returns trigger language plpgsql set search_path = public as $$
begin
  new.montant_ht := round(new.montant_ht, 2);
  new.montant_tva := round(new.montant_ht * new.taux_tva / 100, 2);
  return new;
end;
$$;

drop trigger if exists calculer_tva_charge_recurrente on public.charges_recurrentes;
create trigger calculer_tva_charge_recurrente
before insert or update of montant_ht, taux_tva
on public.charges_recurrentes
for each row execute function public.trg_calculer_tva_charge_recurrente();

create or replace function public.materialiser_charge_recurrente(p_entreprise_id uuid,p_charge_id uuid,p_numero_piece text,p_date_piece date default current_date)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_charge public.charges_recurrentes;v_depense uuid;v_suivante date;
begin
 if auth.role() is distinct from 'anon' and not public.est_membre_actif(p_entreprise_id) then raise exception 'Accès refusé';end if;
 if nullif(btrim(p_numero_piece),'') is null then raise exception 'Numéro de pièce obligatoire';end if;
 select * into v_charge from public.charges_recurrentes where id=p_charge_id and entreprise_id=p_entreprise_id for update;
 if not found or not v_charge.actif then raise exception 'Charge récurrente introuvable ou inactive';end if;
 insert into public.depenses_fournisseurs(entreprise_id,fournisseur_id,chantier_id,numero_piece,categorie,date_piece,date_echeance,montant_ht,taux_tva,notes,charge_recurrente_id)
 values(p_entreprise_id,v_charge.fournisseur_id,v_charge.chantier_id,btrim(p_numero_piece),v_charge.categorie,coalesce(p_date_piece,current_date),greatest(v_charge.prochaine_echeance,coalesce(p_date_piece,current_date)),v_charge.montant_ht,v_charge.taux_tva,'Générée depuis la charge : '||v_charge.libelle,v_charge.id) returning id into v_depense;
 v_suivante:=case v_charge.periodicite when 'mensuelle' then v_charge.prochaine_echeance+interval '1 month' when 'trimestrielle' then v_charge.prochaine_echeance+interval '3 months' else v_charge.prochaine_echeance+interval '1 year' end;
 update public.charges_recurrentes set prochaine_echeance=v_suivante,actif=case when date_fin is not null and v_suivante>date_fin then false else actif end,updated_at=now() where id=v_charge.id;
 return v_depense;
end;$$;

revoke all on function public.trg_calculer_tva_charge_recurrente() from public, anon, authenticated;
grant execute on function public.materialiser_charge_recurrente(uuid,uuid,text,date) to anon,authenticated;
notify pgrst, 'reload schema';
