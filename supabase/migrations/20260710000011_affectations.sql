-- Refonte Planning : modele "affectation heures".
-- Remplace l'agenda debut/fin par : un ouvrier affecte a un chantier, une date, un nombre d'heures.
-- L'ancienne table planning_evenements reste en place mais n'est plus utilisee par l'UI.

create table public.affectations (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  chantier_id uuid not null references public.chantiers(id) on delete cascade,
  employe_id uuid not null references public.employes(id) on delete cascade,
  date date not null,
  heures numeric(5,2) not null default 7 check (heures > 0 and heures <= 24),
  tache text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index affectations_entreprise_date_idx on public.affectations (entreprise_id, date);
create index affectations_chantier_idx on public.affectations (chantier_id);
create index affectations_employe_idx on public.affectations (employe_id);

alter table public.affectations enable row level security;

create policy "membres affectations" on public.affectations
  for all using (public.est_membre_actif(entreprise_id)) with check (public.est_membre_actif(entreprise_id));

-- Mode prototype sans connexion.
create policy "prototype acces anonyme" on public.affectations
  for all to anon using (true) with check (true);

grant select, insert, update, delete on public.affectations to anon, authenticated;

notify pgrst, 'reload schema';
