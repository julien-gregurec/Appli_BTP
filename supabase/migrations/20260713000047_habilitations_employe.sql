-- Habilitations / qualifications d'un salarié (SST, CACES, travail en hauteur, habilitation électrique…)
-- avec dates de validité, pour la carte BTP interne.
create table public.habilitations_employe (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  employe_id uuid not null references public.employes(id) on delete cascade,
  type text not null check (type in ('sst', 'caces', 'travail_hauteur', 'habilitation_electrique', 'amiante', 'autre')),
  libelle text,
  date_obtention date,
  date_expiration date,
  created_at timestamptz not null default now()
);
create index habilitations_employe_idx on public.habilitations_employe(employe_id);

alter table public.habilitations_employe enable row level security;
create policy "membres habilitations" on public.habilitations_employe
  for all using (public.est_membre_actif(entreprise_id)) with check (public.est_membre_actif(entreprise_id));
create policy "prototype habilitations" on public.habilitations_employe
  for all to anon using (true) with check (true);
grant select, insert, update, delete on public.habilitations_employe to anon, authenticated;

notify pgrst, 'reload schema';
