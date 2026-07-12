-- Module Planning : interventions et rendez-vous lies aux chantiers.
-- Première tranche : agenda semaine, création, statut, suppression.

create table public.planning_evenements (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  chantier_id uuid references public.chantiers(id) on delete set null,
  titre text not null,
  type text not null default 'intervention'
    check (type in ('intervention', 'rdv_client', 'livraison', 'controle', 'absence', 'autre')),
  statut text not null default 'planifie'
    check (statut in ('planifie', 'confirme', 'en_cours', 'termine', 'annule')),
  debut timestamptz not null,
  fin timestamptz not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fin > debut)
);

create index planning_evenements_entreprise_debut_idx
  on public.planning_evenements (entreprise_id, debut);

create index planning_evenements_chantier_idx
  on public.planning_evenements (chantier_id);

alter table public.planning_evenements enable row level security;

create policy "membres planning" on public.planning_evenements
  for all using (public.est_membre_actif(entreprise_id)) with check (public.est_membre_actif(entreprise_id));

-- Mode prototype sans connexion : cette policy ne donne un effet que si la migration
-- 08_mode_sans_connexion.sql a aussi été exécutée.
create policy "prototype acces anonyme" on public.planning_evenements
  for all to anon using (true) with check (true);

grant select, insert, update, delete on public.planning_evenements to anon, authenticated;

notify pgrst, 'reload schema';
