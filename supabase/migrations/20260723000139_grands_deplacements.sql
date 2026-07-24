-- Grands déplacements : choix de l'entreprise entre frais réels et forfait URSSAF.
-- Les montants enregistrés sur une mission sont un instantané du barème appliqué.

alter table public.entreprises
  add column if not exists mode_grand_deplacement text not null default 'frais_reels',
  add column if not exists bareme_grand_deplacement_annee integer not null default 2026,
  add column if not exists bareme_grand_deplacement jsonb not null default '{"phase1":{"repas":21.40,"logement_paris":76.60,"logement_province":56.80},"phase2":{"repas":18.20,"logement_paris":65.10,"logement_province":48.30},"phase3":{"repas":15.00,"logement_paris":53.60,"logement_province":39.80}}'::jsonb;

alter table public.entreprises drop constraint if exists entreprises_mode_grand_deplacement_check;
alter table public.entreprises add constraint entreprises_mode_grand_deplacement_check
  check (mode_grand_deplacement in ('frais_reels','forfait_urssaf'));

create table if not exists public.grands_deplacements (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  employe_id uuid not null references public.employes(id) on delete restrict,
  chantier_id uuid references public.chantiers(id) on delete set null,
  date_origine_mission date not null,
  date_debut date not null,
  date_fin date not null,
  destination text not null,
  zone_logement text not null default 'province',
  mode_calcul text not null,
  nombre_repas numeric(8,2) not null default 0,
  nombre_nuits numeric(8,2) not null default 0,
  taux_repas numeric(10,2) not null default 0,
  taux_logement numeric(10,2) not null default 0,
  phase_bareme text,
  budget_manuel numeric(12,2),
  montant_calcule numeric(12,2) not null default 0,
  statut text not null default 'brouillon',
  commentaire text,
  distance_aller_km numeric(10,2) not null default 0,
  transport_public_aller_minutes integer not null default 0,
  eligibilite_standard boolean not null default false,
  conditions_confirmees boolean not null default false,
  justification_eligibilite text,
  cree_par uuid not null references auth.users(id) on delete restrict,
  valide_par uuid references auth.users(id) on delete set null,
  valide_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grands_deplacements_dates_check check(date_origine_mission<=date_debut and date_debut<=date_fin),
  constraint grands_deplacements_zone_check check(zone_logement in ('paris','province')),
  constraint grands_deplacements_mode_check check(mode_calcul in ('frais_reels','forfait_urssaf')),
  constraint grands_deplacements_phase_check check(phase_bareme is null or phase_bareme in ('phase1','phase2','phase3')),
  constraint grands_deplacements_statut_check check(statut in ('brouillon','soumis','valide','refuse')),
  constraint grands_deplacements_montants_check check(nombre_repas>=0 and nombre_nuits>=0 and taux_repas>=0 and taux_logement>=0 and montant_calcule>=0 and (budget_manuel is null or budget_manuel>=0))
);

alter table public.grands_deplacements
  add column if not exists distance_aller_km numeric(10,2) not null default 0,
  add column if not exists transport_public_aller_minutes integer not null default 0,
  add column if not exists eligibilite_standard boolean not null default false,
  add column if not exists conditions_confirmees boolean not null default false,
  add column if not exists justification_eligibilite text;

alter table public.grands_deplacements drop constraint if exists grands_deplacements_eligibilite_check;
alter table public.grands_deplacements add constraint grands_deplacements_eligibilite_check check(
  distance_aller_km>=0
  and transport_public_aller_minutes>=0
  and (not conditions_confirmees or eligibilite_standard or nullif(btrim(justification_eligibilite),'') is not null)
);

create or replace function public.verifier_coherence_grand_deplacement()
returns trigger language plpgsql set search_path=public as $$
begin
  if not exists(select 1 from public.employes e where e.id=new.employe_id and e.entreprise_id=new.entreprise_id) then
    raise exception 'Employé et entreprise incohérents';
  end if;
  if new.chantier_id is not null and not exists(select 1 from public.chantiers c where c.id=new.chantier_id and c.entreprise_id=new.entreprise_id) then
    raise exception 'Chantier et entreprise incohérents';
  end if;
  return new;
end;$$;

drop trigger if exists grands_deplacements_coherence on public.grands_deplacements;
create trigger grands_deplacements_coherence before insert or update on public.grands_deplacements
for each row execute function public.verifier_coherence_grand_deplacement();

create index if not exists grands_deplacements_entreprise_date_idx
  on public.grands_deplacements(entreprise_id,date_debut desc);
create index if not exists grands_deplacements_employe_idx
  on public.grands_deplacements(entreprise_id,employe_id,date_debut desc);
create index if not exists grands_deplacements_chantier_idx
  on public.grands_deplacements(entreprise_id,chantier_id,date_debut desc);

alter table public.notes_frais
  add column if not exists grand_deplacement_id uuid references public.grands_deplacements(id) on delete set null;
create index if not exists notes_frais_grand_deplacement_idx
  on public.notes_frais(entreprise_id,grand_deplacement_id) where grand_deplacement_id is not null;

alter table public.grands_deplacements enable row level security;

drop policy if exists grands_deplacements_select on public.grands_deplacements;
drop policy if exists grands_deplacements_insert on public.grands_deplacements;
drop policy if exists grands_deplacements_update on public.grands_deplacements;
drop policy if exists grands_deplacements_delete on public.grands_deplacements;

create policy grands_deplacements_select on public.grands_deplacements for select to authenticated using(
  public.est_membre_actif(entreprise_id)
  and (
    public.a_permission(entreprise_id,'gerer_notes_frais')
    or (public.a_permission(entreprise_id,'saisir_ses_notes_frais') and public.est_employe_du_compte(entreprise_id,employe_id))
  )
);
create policy grands_deplacements_insert on public.grands_deplacements for insert to authenticated with check(
  public.est_membre_actif(entreprise_id)
  and public.a_permission(entreprise_id,'saisir_ses_notes_frais')
  and public.est_employe_du_compte(entreprise_id,employe_id)
  and cree_par=auth.uid()
  and exists(select 1 from public.employes e where e.id=employe_id and e.entreprise_id=entreprise_id)
  and (chantier_id is null or exists(select 1 from public.chantiers c where c.id=chantier_id and c.entreprise_id=entreprise_id))
);
create policy grands_deplacements_update on public.grands_deplacements for update to authenticated
  using(public.a_permission(entreprise_id,'gerer_notes_frais'))
  with check(public.a_permission(entreprise_id,'gerer_notes_frais'));
create policy grands_deplacements_delete on public.grands_deplacements for delete to authenticated
  using(public.a_permission(entreprise_id,'gerer_notes_frais'));

create or replace function public.transition_grand_deplacement(p_id uuid,p_statut text)
returns void language plpgsql security definer set search_path=public as $$
declare v public.grands_deplacements;
begin
  select * into v from public.grands_deplacements where id=p_id for update;
  if not found or not public.est_membre_actif(v.entreprise_id) then raise exception 'Déplacement inaccessible'; end if;
  if p_statut='soumis' and v.statut='brouillon' and public.est_employe_du_compte(v.entreprise_id,v.employe_id) then
    update public.grands_deplacements set statut='soumis',updated_at=now() where id=p_id;
  elsif p_statut in ('valide','refuse') and v.statut='soumis' and public.a_permission(v.entreprise_id,'gerer_notes_frais') then
    update public.grands_deplacements set statut=p_statut,valide_par=auth.uid(),valide_at=now(),updated_at=now() where id=p_id;
  else
    raise exception 'Transition non autorisée';
  end if;
end;$$;

revoke all on function public.transition_grand_deplacement(uuid,text) from public,anon;
grant execute on function public.transition_grand_deplacement(uuid,text) to authenticated;
grant select,insert,update,delete on public.grands_deplacements to authenticated;

notify pgrst,'reload schema';
