-- Charges récurrentes projetées puis matérialisées en dépenses fournisseurs.
create table public.charges_recurrentes(
 id uuid primary key default gen_random_uuid(),entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 libelle text not null check(btrim(libelle)<>''),fournisseur_id uuid not null,chantier_id uuid,
 categorie text not null default 'autre' check(categorie in('materiaux','sous_traitance','location','transport','carburant','outillage','assurance','autre')),
 periodicite text not null default 'mensuelle' check(periodicite in('mensuelle','trimestrielle','annuelle')),
 montant_ht numeric(12,2) not null check(montant_ht>=0),montant_tva numeric(12,2) not null default 0 check(montant_tva>=0),
 prochaine_echeance date not null,date_fin date,actif boolean not null default true,notes text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(entreprise_id,libelle),unique(id,entreprise_id),check(montant_ht+montant_tva>0),check(date_fin is null or date_fin>=prochaine_echeance),
 foreign key(fournisseur_id,entreprise_id) references public.fournisseurs(id,entreprise_id) on delete restrict,
 foreign key(chantier_id,entreprise_id) references public.chantiers(id,entreprise_id) on delete set null(chantier_id)
);
alter table public.depenses_fournisseurs add column charge_recurrente_id uuid;
alter table public.depenses_fournisseurs add constraint depenses_charge_entreprise_fk foreign key(charge_recurrente_id,entreprise_id) references public.charges_recurrentes(id,entreprise_id) on delete set null(charge_recurrente_id);

create or replace function public.materialiser_charge_recurrente(p_entreprise_id uuid,p_charge_id uuid,p_numero_piece text,p_date_piece date default current_date)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_charge public.charges_recurrentes;v_depense uuid;v_suivante date;
begin
 if auth.role() is distinct from 'anon' and not public.est_membre_actif(p_entreprise_id) then raise exception 'Accès refusé';end if;
 if nullif(btrim(p_numero_piece),'') is null then raise exception 'Numéro de pièce obligatoire';end if;
 select * into v_charge from public.charges_recurrentes where id=p_charge_id and entreprise_id=p_entreprise_id for update;
 if not found or not v_charge.actif then raise exception 'Charge récurrente introuvable ou inactive';end if;
 insert into public.depenses_fournisseurs(entreprise_id,fournisseur_id,chantier_id,numero_piece,categorie,date_piece,date_echeance,montant_ht,montant_tva,notes,charge_recurrente_id)
 values(p_entreprise_id,v_charge.fournisseur_id,v_charge.chantier_id,btrim(p_numero_piece),v_charge.categorie,coalesce(p_date_piece,current_date),greatest(v_charge.prochaine_echeance,coalesce(p_date_piece,current_date)),v_charge.montant_ht,v_charge.montant_tva,'Générée depuis la charge : '||v_charge.libelle,v_charge.id) returning id into v_depense;
 v_suivante:=case v_charge.periodicite when 'mensuelle' then v_charge.prochaine_echeance+interval '1 month' when 'trimestrielle' then v_charge.prochaine_echeance+interval '3 months' else v_charge.prochaine_echeance+interval '1 year' end;
 update public.charges_recurrentes set prochaine_echeance=v_suivante,actif=case when date_fin is not null and v_suivante>date_fin then false else actif end,updated_at=now() where id=v_charge.id;
 return v_depense;
end;$$;
alter table public.charges_recurrentes enable row level security;
create policy charges_recurrentes_membres on public.charges_recurrentes for all to authenticated using(public.est_membre_actif(entreprise_id)) with check(public.est_membre_actif(entreprise_id));
create policy charges_recurrentes_prototype on public.charges_recurrentes for all to anon using(true) with check(true);
grant select,insert,update on public.charges_recurrentes to anon,authenticated;grant execute on function public.materialiser_charge_recurrente(uuid,uuid,text,date) to anon,authenticated;
notify pgrst,'reload schema';
