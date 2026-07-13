-- Synchronisation du pointage GPS avec le planning et détail des heures chantier.
alter table public.pointages add column if not exists affectation_id uuid references public.affectations(id) on delete set null;
create index if not exists pointages_affectation_idx on public.pointages(affectation_id) where affectation_id is not null;

insert into public.permissions_disponibles(cle,module,description) values
 ('voir_heures_chantiers','Chantiers','Consulter les heures planifiées et pointées validées par chantier')
on conflict(cle) do update set module=excluded.module,description=excluded.description;
insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select p.entreprise_id,p.id,'voir_heures_chantiers',lower(p.nom) in ('admin','administrateur','admin/gérant','gérant','conducteur de travaux','chef de chantier','rh / comptable')
from public.postes p on conflict(entreprise_id,poste_id,cle_permission) do nothing;

create or replace function public.peut_consulter_pointage_employe(p_entreprise_id uuid,p_employe_id uuid)
returns boolean language sql security definer stable set search_path=public as $$
 select auth.role()='anon' or public.a_permission(p_entreprise_id,'gerer_pointage')
   or public.a_permission(p_entreprise_id,'voir_heures_chantiers')
   or exists(select 1 from public.employes e where e.id=p_employe_id and e.entreprise_id=p_entreprise_id and e.utilisateur_id=auth.uid() and e.statut not in ('sorti','suspendu'));
$$;

create or replace function public.cloturer_session_pointage(
 p_entreprise_id uuid,p_session_id uuid,p_depart_at timestamptz,p_pause_minutes integer,
 p_latitude numeric,p_longitude numeric,p_precision numeric,p_photo_path text default null
)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_session public.sessions_pointage;v_pointage uuid;v_affectation uuid;
begin
 select * into v_session from public.sessions_pointage where id=p_session_id and entreprise_id=p_entreprise_id;
 if not found then raise exception 'Session de pointage introuvable';end if;
 if not public.peut_pointer_pour_employe(p_entreprise_id,v_session.employe_id) then raise exception 'Accès refusé';end if;
 v_pointage:=public.cloturer_session_pointage_interne(p_entreprise_id,p_session_id,p_depart_at,p_pause_minutes,p_latitude,p_longitude,p_precision,p_photo_path);
 select a.id into v_affectation from public.affectations a where a.entreprise_id=p_entreprise_id and a.employe_id=v_session.employe_id and a.chantier_id=v_session.chantier_id and a.date=(v_session.arrivee_at at time zone 'Europe/Paris')::date and a.type_activite='chantier' order by a.created_at limit 1;
 update public.pointages set affectation_id=v_affectation where id=v_pointage;
 return v_pointage;
end;$$;

create or replace function public.valider_preuve_pointage(p_entreprise_id uuid,p_pointage_id uuid,p_statut text,p_commentaire text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_statut not in('valide','rejete') then raise exception 'Statut invalide';end if;
 if auth.role() is distinct from 'anon' and not public.a_permission(p_entreprise_id,'valider_pointages') then raise exception 'Accès refusé';end if;
 if p_statut='rejete' and nullif(btrim(p_commentaire),'') is null then raise exception 'Le motif du rejet est obligatoire';end if;
 update public.pointages set verification_statut=p_statut,verification_at=now(),verification_par=case when auth.role()='anon' then null else auth.uid() end,commentaire_verification=nullif(btrim(p_commentaire),'') where id=p_pointage_id and entreprise_id=p_entreprise_id;
 if not found then raise exception 'Pointage introuvable';end if;
end;$$;

revoke all on function public.cloturer_session_pointage(uuid,uuid,timestamptz,integer,numeric,numeric,numeric,text) from public;
revoke all on function public.valider_preuve_pointage(uuid,uuid,text,text) from public;
grant execute on function public.cloturer_session_pointage(uuid,uuid,timestamptz,integer,numeric,numeric,numeric,text) to anon,authenticated;
grant execute on function public.valider_preuve_pointage(uuid,uuid,text,text) to anon,authenticated;
notify pgrst,'reload schema';
