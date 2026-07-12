-- Outillage traçable : registre, affectations et historique atomique.
create unique index if not exists employes_id_entreprise_unique
  on public.employes(id, entreprise_id);

create table public.outils (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  reference text not null,
  designation text not null check (btrim(designation) <> ''),
  categorie text not null default 'electroportatif'
    check (categorie in ('electroportatif','manuel','mesure','securite','levage','autre')),
  marque text,
  modele text,
  numero_serie text,
  statut text not null default 'disponible'
    check (statut in ('disponible','affecte','maintenance','hors_service','perdu')),
  etat text not null default 'bon' check (etat in ('neuf','bon','usage','abime','hors_service')),
  employe_id uuid,
  chantier_id uuid,
  date_achat date,
  prix_achat_ht numeric(12,2) check (prix_achat_ht is null or prix_achat_ht >= 0),
  prochaine_verification date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entreprise_id, reference),
  unique (id, entreprise_id),
  foreign key (employe_id, entreprise_id)
    references public.employes(id, entreprise_id) on delete set null (employe_id),
  foreign key (chantier_id, entreprise_id)
    references public.chantiers(id, entreprise_id) on delete set null (chantier_id),
  check ((statut = 'affecte') = (employe_id is not null or chantier_id is not null))
);
create unique index outils_numero_serie_unique
  on public.outils(entreprise_id, numero_serie) where numero_serie is not null;

create or replace function public.trg_outil_reference()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.reference is null or btrim(new.reference) = '' then
    new.reference := public.next_reference(new.entreprise_id, 'outil', 'OUT', 4, false);
  end if;
  return new;
end; $$;
create trigger outil_reference before insert on public.outils
  for each row execute function public.trg_outil_reference();

create table public.mouvements_outillage (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  outil_id uuid not null,
  type text not null check (type in ('affectation','retour','maintenance','remise_service','hors_service','perte')),
  statut_avant text not null,
  statut_apres text not null,
  employe_id uuid,
  chantier_id uuid,
  etat text not null check (etat in ('neuf','bon','usage','abime','hors_service')),
  note text,
  date_mouvement date not null default current_date,
  created_at timestamptz not null default now(),
  foreign key (outil_id, entreprise_id) references public.outils(id, entreprise_id) on delete cascade,
  foreign key (employe_id, entreprise_id) references public.employes(id, entreprise_id) on delete restrict,
  foreign key (chantier_id, entreprise_id) references public.chantiers(id, entreprise_id) on delete restrict
);
create index mouvements_outillage_liste_idx on public.mouvements_outillage(outil_id, created_at desc);

create or replace function public.enregistrer_mouvement_outillage(
  p_entreprise_id uuid, p_outil_id uuid, p_type text,
  p_employe_id uuid default null, p_chantier_id uuid default null,
  p_etat text default 'bon', p_note text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare v_avant text; v_apres text; v_employe uuid; v_chantier uuid;
begin
  if auth.role() is distinct from 'anon' and not public.est_membre_actif(p_entreprise_id) then
    raise exception 'Accès refusé';
  end if;
  if p_etat not in ('neuf','bon','usage','abime','hors_service') then raise exception 'État invalide'; end if;
  select statut into v_avant from public.outils
  where id = p_outil_id and entreprise_id = p_entreprise_id for update;
  if not found then raise exception 'Outil introuvable'; end if;

  case p_type
    when 'affectation' then
      if v_avant <> 'disponible' then raise exception 'Seul un outil disponible peut être affecté'; end if;
      if p_employe_id is null and p_chantier_id is null then raise exception 'Choisissez un employé ou un chantier'; end if;
      if p_employe_id is not null and not exists (select 1 from public.employes where id=p_employe_id and entreprise_id=p_entreprise_id and statut='actif') then raise exception 'Employé introuvable ou inactif'; end if;
      if p_chantier_id is not null and not exists (select 1 from public.chantiers where id=p_chantier_id and entreprise_id=p_entreprise_id) then raise exception 'Chantier introuvable'; end if;
      v_apres := 'affecte'; v_employe := p_employe_id; v_chantier := p_chantier_id;
    when 'retour' then
      if v_avant <> 'affecte' then raise exception 'Cet outil n’est pas affecté'; end if;
      v_apres := 'disponible';
    when 'maintenance' then
      if v_avant in ('maintenance','perdu') then raise exception 'Transition non autorisée'; end if;
      v_apres := 'maintenance';
    when 'remise_service' then
      if v_avant not in ('maintenance','hors_service') then raise exception 'Transition non autorisée'; end if;
      v_apres := 'disponible';
    when 'hors_service' then
      if v_avant = 'perdu' then raise exception 'Transition non autorisée'; end if;
      v_apres := 'hors_service'; p_etat := 'hors_service';
    when 'perte' then
      if v_avant = 'perdu' then raise exception 'Outil déjà déclaré perdu'; end if;
      v_apres := 'perdu';
    else raise exception 'Type de mouvement invalide';
  end case;

  update public.outils set statut=v_apres, etat=p_etat,
    employe_id=v_employe, chantier_id=v_chantier, updated_at=now()
  where id=p_outil_id and entreprise_id=p_entreprise_id;
  insert into public.mouvements_outillage(
    entreprise_id,outil_id,type,statut_avant,statut_apres,employe_id,chantier_id,etat,note
  ) values (p_entreprise_id,p_outil_id,p_type,v_avant,v_apres,p_employe_id,p_chantier_id,p_etat,nullif(btrim(p_note),''));
end; $$;

alter table public.outils enable row level security;
alter table public.mouvements_outillage enable row level security;
create policy outils_membres on public.outils for all to authenticated using (public.est_membre_actif(entreprise_id)) with check (public.est_membre_actif(entreprise_id));
create policy mouvements_outillage_membres on public.mouvements_outillage for select to authenticated using (public.est_membre_actif(entreprise_id));
create policy outils_prototype on public.outils for all to anon using (true) with check (true);
create policy mouvements_outillage_prototype on public.mouvements_outillage for select to anon using (true);
grant select, insert on public.outils to anon, authenticated;
revoke update, delete on public.outils from anon, authenticated;
grant select on public.mouvements_outillage to anon, authenticated;
grant execute on function public.enregistrer_mouvement_outillage(uuid,uuid,text,uuid,uuid,text,text) to anon, authenticated;
revoke all on function public.trg_outil_reference() from public, anon, authenticated;
notify pgrst, 'reload schema';
