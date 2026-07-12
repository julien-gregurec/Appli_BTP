-- Flotte automobile : véhicules, kilométrage et échéances.
create table public.vehicules (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  immatriculation text not null check (btrim(immatriculation) <> ''),
  marque text not null check (btrim(marque) <> ''),
  modele text not null check (btrim(modele) <> ''),
  type text not null default 'utilitaire' check (type in ('utilitaire','voiture','poids_lourd','autre')),
  statut text not null default 'actif' check (statut in ('actif','maintenance','hors_service','vendu')),
  date_mise_circulation date,
  kilometrage integer not null default 0 check (kilometrage >= 0),
  controle_technique_echeance date,
  assurance_echeance date,
  prochain_entretien_date date,
  prochain_entretien_km integer check (prochain_entretien_km is null or prochain_entretien_km >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entreprise_id, immatriculation),
  unique (id, entreprise_id)
);

create table public.releves_kilometrage (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  vehicule_id uuid not null,
  date_releve date not null default current_date,
  kilometrage integer not null check (kilometrage >= 0),
  note text,
  created_at timestamptz not null default now(),
  foreign key (vehicule_id, entreprise_id) references public.vehicules(id, entreprise_id) on delete cascade
);
create index releves_kilometrage_liste_idx on public.releves_kilometrage(vehicule_id, date_releve desc, created_at desc);

create or replace function public.trg_releve_kilometrage()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_km integer;
begin
  select kilometrage into v_km from public.vehicules
  where id = new.vehicule_id and entreprise_id = new.entreprise_id for update;
  if not found then raise exception 'Véhicule introuvable'; end if;
  if new.kilometrage < v_km then raise exception 'Le kilométrage ne peut pas diminuer'; end if;
  update public.vehicules set kilometrage = new.kilometrage, updated_at = now()
  where id = new.vehicule_id and entreprise_id = new.entreprise_id;
  return new;
end; $$;
create trigger releve_kilometrage_avant_ajout before insert on public.releves_kilometrage
  for each row execute function public.trg_releve_kilometrage();

alter table public.vehicules enable row level security;
alter table public.releves_kilometrage enable row level security;
create policy vehicules_membres on public.vehicules for all to authenticated
  using (public.est_membre_actif(entreprise_id)) with check (public.est_membre_actif(entreprise_id));
create policy releves_km_membres on public.releves_kilometrage for all to authenticated
  using (public.est_membre_actif(entreprise_id)) with check (public.est_membre_actif(entreprise_id));
create policy vehicules_prototype on public.vehicules for all to anon using (true) with check (true);
create policy releves_km_prototype on public.releves_kilometrage for all to anon using (true) with check (true);
grant select, insert, update, delete on public.vehicules, public.releves_kilometrage to anon, authenticated;
revoke all on function public.trg_releve_kilometrage() from public, anon, authenticated;
