-- Historique fiable des affectations de véhicules aux employés.
create table public.affectations_vehicules (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  vehicule_id uuid not null,
  employe_id uuid,
  date_debut timestamptz not null default now(),
  date_fin timestamptz,
  note text,
  created_at timestamptz not null default now(),
  foreign key(vehicule_id,entreprise_id) references public.vehicules(id,entreprise_id) on delete cascade,
  foreign key(employe_id,entreprise_id) references public.employes(id,entreprise_id) on delete restrict,
  check(date_fin is null or date_fin>=date_debut)
);
create unique index affectations_vehicules_ouverte_unique on public.affectations_vehicules(entreprise_id,vehicule_id) where date_fin is null;
create index affectations_vehicules_liste_idx on public.affectations_vehicules(vehicule_id,date_debut desc);

insert into public.affectations_vehicules(entreprise_id,vehicule_id,employe_id,note)
select entreprise_id,id,employe_id,'Affectation existante reprise lors de la création de l’historique'
from public.vehicules where employe_id is not null
on conflict do nothing;

create or replace function public.affecter_vehicule(p_entreprise_id uuid,p_vehicule_id uuid,p_employe_id uuid,p_note text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_actuel uuid;
begin
 if auth.role() is distinct from 'anon' and not public.est_membre_actif(p_entreprise_id) then raise exception 'Accès refusé';end if;
 select employe_id into v_actuel from public.vehicules where id=p_vehicule_id and entreprise_id=p_entreprise_id for update;
 if not found then raise exception 'Véhicule introuvable';end if;
 if p_employe_id is not null and not exists(select 1 from public.employes where id=p_employe_id and entreprise_id=p_entreprise_id and statut='actif') then raise exception 'Employé introuvable ou inactif';end if;
 if v_actuel is not distinct from p_employe_id then return;end if;
 update public.affectations_vehicules set date_fin=now() where entreprise_id=p_entreprise_id and vehicule_id=p_vehicule_id and date_fin is null;
 update public.vehicules set employe_id=p_employe_id,updated_at=now() where id=p_vehicule_id and entreprise_id=p_entreprise_id;
 if p_employe_id is not null then insert into public.affectations_vehicules(entreprise_id,vehicule_id,employe_id,note) values(p_entreprise_id,p_vehicule_id,p_employe_id,nullif(btrim(p_note),''));end if;
end;$$;
alter table public.affectations_vehicules enable row level security;
create policy affectations_vehicules_membres on public.affectations_vehicules for select to authenticated using(public.est_membre_actif(entreprise_id));
create policy affectations_vehicules_prototype on public.affectations_vehicules for select to anon using(true);
grant select on public.affectations_vehicules to anon,authenticated;
revoke all on function public.affecter_vehicule(uuid,uuid,uuid,text) from public;
grant execute on function public.affecter_vehicule(uuid,uuid,uuid,text) to anon,authenticated;
notify pgrst,'reload schema';
