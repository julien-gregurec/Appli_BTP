-- Demandes de congés personnelles, validation responsable et synchronisation planning.

insert into public.permissions_disponibles(cle,module,description) values
 ('demander_ses_conges','Congés','Créer et suivre uniquement ses propres demandes de congés'),
 ('gerer_conges','Congés','Consulter et décider les demandes de congés de l’équipe')
on conflict(cle) do update set module=excluded.module,description=excluded.description;

insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select p.entreprise_id,p.id,'demander_ses_conges',true from public.postes p
on conflict(entreprise_id,poste_id,cle_permission) do update set autorise=true;
insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select p.entreprise_id,p.id,'gerer_conges',lower(p.nom) in ('admin','administrateur','admin/gérant','gérant','rh / comptable','rh','conducteur de travaux','chef de chantier')
from public.postes p on conflict(entreprise_id,poste_id,cle_permission) do nothing;

create table public.demandes_conges(
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  employe_id uuid not null,
  type_conge text not null default 'conges_payes' check(type_conge in ('conges_payes','rtt','sans_solde','maladie','evenement_familial','recuperation','autre')),
  date_debut date not null,
  date_fin date not null,
  demi_jour_debut text not null default 'journee' check(demi_jour_debut in ('journee','matin','apres_midi')),
  demi_jour_fin text not null default 'journee' check(demi_jour_fin in ('journee','matin','apres_midi')),
  commentaire text,
  statut text not null default 'brouillon' check(statut in ('brouillon','soumise','approuvee','refusee','annulee')),
  motif_decision text,
  decide_par uuid references public.utilisateurs(id) on delete set null,
  decide_at timestamptz,
  soumis_at timestamptz,
  created_by uuid not null references public.utilisateurs(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,entreprise_id),
  foreign key(employe_id,entreprise_id) references public.employes(id,entreprise_id) on delete cascade,
  check(date_fin>=date_debut)
);
create index demandes_conges_entreprise_idx on public.demandes_conges(entreprise_id,statut,date_debut desc);
create index demandes_conges_employe_idx on public.demandes_conges(employe_id,date_debut desc);

alter table public.affectations add column if not exists demande_conge_id uuid references public.demandes_conges(id) on delete cascade;
create unique index if not exists affectations_demande_conge_jour_unique on public.affectations(demande_conge_id,date) where demande_conge_id is not null;

create or replace function public.transition_demande_conge(p_demande_id uuid,p_action text,p_message text default null)
returns void language plpgsql security definer set search_path=public as $$
declare d public.demandes_conges;v_propre boolean;v_gere boolean;v_jour date;v_heures numeric;
begin
  select * into d from public.demandes_conges where id=p_demande_id for update;
  if not found or not public.est_membre_actif(d.entreprise_id) then raise exception 'Demande inaccessible';end if;
  v_propre:=public.est_employe_du_compte(d.entreprise_id,d.employe_id);
  v_gere:=public.a_permission(d.entreprise_id,'gerer_conges');
  if p_action='soumettre' and v_propre and d.statut='brouillon' then
    update public.demandes_conges set statut='soumise',soumis_at=now(),updated_at=now() where id=d.id;
  elsif p_action='annuler' and v_propre and d.statut in ('brouillon','soumise') then
    update public.demandes_conges set statut='annulee',updated_at=now() where id=d.id;
  elsif p_action='approuver' and v_gere and d.statut='soumise' then
    update public.demandes_conges set statut='approuvee',motif_decision=nullif(btrim(p_message),''),decide_par=auth.uid(),decide_at=now(),updated_at=now() where id=d.id;
    v_jour:=d.date_debut;
    while v_jour<=d.date_fin loop
      if extract(isodow from v_jour)<6 then
        v_heures:=7;
        if d.date_debut=d.date_fin and (d.demi_jour_debut<>'journee' or d.demi_jour_fin<>'journee') then v_heures:=3.5;
        elsif v_jour=d.date_debut and d.demi_jour_debut<>'journee' then v_heures:=3.5;
        elsif v_jour=d.date_fin and d.demi_jour_fin<>'journee' then v_heures:=3.5;end if;
        insert into public.affectations(entreprise_id,chantier_id,employe_id,date,heures,tache,type_activite,lieu_activite,demande_conge_id)
        values(d.entreprise_id,null,d.employe_id,v_jour,v_heures,'Congé approuvé','conge',null,d.id)
        on conflict(demande_conge_id,date) where demande_conge_id is not null do nothing;
      end if;
      v_jour:=v_jour+1;
    end loop;
  elsif p_action='refuser' and v_gere and d.statut='soumise' then
    if nullif(btrim(p_message),'') is null then raise exception 'Le motif du refus est obligatoire';end if;
    update public.demandes_conges set statut='refusee',motif_decision=btrim(p_message),decide_par=auth.uid(),decide_at=now(),updated_at=now() where id=d.id;
  else raise exception 'Action non autorisée';end if;
end;$$;

alter table public.demandes_conges enable row level security;
create policy demandes_conges_select on public.demandes_conges for select to authenticated using(
  public.est_membre_actif(entreprise_id) and (public.est_employe_du_compte(entreprise_id,employe_id) or public.a_permission(entreprise_id,'gerer_conges'))
);
create policy demandes_conges_insert on public.demandes_conges for insert to authenticated with check(
  public.a_permission(entreprise_id,'demander_ses_conges') and public.est_employe_du_compte(entreprise_id,employe_id) and created_by=auth.uid() and statut='brouillon'
);
create policy demandes_conges_update on public.demandes_conges for update to authenticated using(
  public.est_employe_du_compte(entreprise_id,employe_id) and statut='brouillon'
) with check(public.est_employe_du_compte(entreprise_id,employe_id) and statut='brouillon');

grant select,insert,update on public.demandes_conges to authenticated;
revoke all on function public.transition_demande_conge(uuid,text,text) from public,anon;
grant execute on function public.transition_demande_conge(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
