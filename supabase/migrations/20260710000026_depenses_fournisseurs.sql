-- Factures et dépenses fournisseurs, règlements et coûts réels par chantier.
create table public.depenses_fournisseurs(
 id uuid primary key default gen_random_uuid(), entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 fournisseur_id uuid not null, chantier_id uuid, commande_id uuid, numero_piece text not null check(btrim(numero_piece)<>''),
 categorie text not null default 'materiaux' check(categorie in('materiaux','sous_traitance','location','transport','carburant','outillage','assurance','autre')),
 date_piece date not null default current_date, date_echeance date,
 statut text not null default 'a_payer' check(statut in('a_payer','payee_partiel','payee','litige','annulee')),
 montant_ht numeric(12,2) not null check(montant_ht>=0), montant_tva numeric(12,2) not null default 0 check(montant_tva>=0),
 montant_ttc numeric(12,2) generated always as (montant_ht+montant_tva) stored,
 montant_regle numeric(12,2) not null default 0 check(montant_regle>=0), notes text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(entreprise_id,fournisseur_id,numero_piece),unique(id,entreprise_id),
 foreign key(fournisseur_id,entreprise_id) references public.fournisseurs(id,entreprise_id) on delete restrict,
 foreign key(chantier_id,entreprise_id) references public.chantiers(id,entreprise_id) on delete set null(chantier_id),
 foreign key(commande_id,entreprise_id) references public.commandes_fournisseurs(id,entreprise_id) on delete set null(commande_id),
 check(date_echeance is null or date_echeance>=date_piece),check(montant_ht+montant_tva>0),check(montant_regle<=montant_ht+montant_tva)
);
create index depenses_fournisseurs_liste_idx on public.depenses_fournisseurs(entreprise_id,date_piece desc);
create or replace function public.trg_verifier_depense_fournisseur() returns trigger language plpgsql security definer set search_path=public as $$
declare v_fournisseur uuid;v_chantier uuid;
begin
 if new.commande_id is not null then
  select fournisseur_id,chantier_id into v_fournisseur,v_chantier from public.commandes_fournisseurs where id=new.commande_id and entreprise_id=new.entreprise_id;
  if not found or v_fournisseur<>new.fournisseur_id then raise exception 'La commande et la facture doivent concerner le même fournisseur';end if;
  if new.chantier_id is null then new.chantier_id:=v_chantier;elsif v_chantier is not null and new.chantier_id<>v_chantier then raise exception 'Le chantier ne correspond pas à la commande';end if;
 end if;return new;
end;$$;
create trigger verifier_depense_fournisseur before insert or update of fournisseur_id,chantier_id,commande_id on public.depenses_fournisseurs for each row execute function public.trg_verifier_depense_fournisseur();
create table public.reglements_fournisseurs(
 id uuid primary key default gen_random_uuid(),entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 depense_id uuid not null,montant numeric(12,2) not null check(montant>0),date date not null default current_date,
 mode text not null default 'virement' check(mode in('virement','cheque','especes','cb','prelevement')),
 reference text,created_at timestamptz not null default now(),
 foreign key(depense_id,entreprise_id) references public.depenses_fournisseurs(id,entreprise_id) on delete cascade
);
create index reglements_fournisseurs_depense_idx on public.reglements_fournisseurs(depense_id,date desc);

create or replace function public.trg_verifier_reglement_fournisseur() returns trigger language plpgsql security definer set search_path=public as $$
declare v_ttc numeric;v_statut text;v_deja numeric;
begin
 select montant_ttc,statut into v_ttc,v_statut from public.depenses_fournisseurs where id=new.depense_id and entreprise_id=new.entreprise_id for update;
 if not found then raise exception 'Dépense introuvable';end if;if v_statut in('annulee','litige') then raise exception 'Règlement interdit pour ce statut';end if;
 select coalesce(sum(montant),0) into v_deja from public.reglements_fournisseurs where depense_id=new.depense_id;
 if v_deja+new.montant>v_ttc+0.005 then raise exception 'Le règlement dépasse le reste dû';end if;return new;
end;$$;
create trigger verifier_reglement_fournisseur before insert on public.reglements_fournisseurs for each row execute function public.trg_verifier_reglement_fournisseur();
create or replace function public.recalc_reglements_fournisseur(p_depense_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare v_regle numeric;v_ttc numeric;v_statut text;
begin select montant_ttc,statut into v_ttc,v_statut from public.depenses_fournisseurs where id=p_depense_id for update;if not found then return;end if;
 select round(coalesce(sum(montant),0),2) into v_regle from public.reglements_fournisseurs where depense_id=p_depense_id;
 if v_statut not in('annulee','litige') then v_statut:=case when v_regle=0 then 'a_payer' when v_regle>=v_ttc then 'payee' else 'payee_partiel' end;end if;
 update public.depenses_fournisseurs set montant_regle=v_regle,statut=v_statut,updated_at=now() where id=p_depense_id;
end;$$;
create or replace function public.trg_recalc_reglements_fournisseur() returns trigger language plpgsql security definer set search_path=public as $$begin perform public.recalc_reglements_fournisseur(coalesce(new.depense_id,old.depense_id));return null;end;$$;
create trigger recalc_reglements_fournisseur after insert or update or delete on public.reglements_fournisseurs for each row execute function public.trg_recalc_reglements_fournisseur();

alter table public.depenses_fournisseurs enable row level security;alter table public.reglements_fournisseurs enable row level security;
create policy depenses_fournisseurs_membres on public.depenses_fournisseurs for all to authenticated using(public.est_membre_actif(entreprise_id)) with check(public.est_membre_actif(entreprise_id));
create policy reglements_fournisseurs_membres on public.reglements_fournisseurs for all to authenticated using(public.est_membre_actif(entreprise_id)) with check(public.est_membre_actif(entreprise_id));
create policy depenses_fournisseurs_prototype on public.depenses_fournisseurs for all to anon using(true) with check(true);create policy reglements_fournisseurs_prototype on public.reglements_fournisseurs for all to anon using(true) with check(true);
grant select,insert on public.depenses_fournisseurs to anon,authenticated;revoke update,delete on public.depenses_fournisseurs from anon,authenticated;grant select,insert,delete on public.reglements_fournisseurs to anon,authenticated;
revoke all on function public.trg_verifier_reglement_fournisseur() from public,anon,authenticated;revoke all on function public.recalc_reglements_fournisseur(uuid) from public,anon,authenticated;revoke all on function public.trg_recalc_reglements_fournisseur() from public,anon,authenticated;
revoke all on function public.trg_verifier_depense_fournisseur() from public,anon,authenticated;
notify pgrst,'reload schema';
