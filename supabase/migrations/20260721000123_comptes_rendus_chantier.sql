-- Comptes-rendus de chantier (dictée vocale structurée par l'IA ou saisie manuelle).

create table public.comptes_rendus_chantier (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  chantier_id uuid not null,
  auteur_id uuid references public.utilisateurs(id) on delete set null,
  titre text not null default 'Compte-rendu' check (btrim(titre) <> ''),
  contenu text not null check (btrim(contenu) <> ''),
  transcription_brute text,
  created_at timestamptz not null default now(),
  foreign key (chantier_id, entreprise_id)
    references public.chantiers(id, entreprise_id) on delete cascade
);

create index comptes_rendus_chantier_liste_idx
  on public.comptes_rendus_chantier(entreprise_id, chantier_id, created_at desc);

alter table public.comptes_rendus_chantier enable row level security;

create policy comptes_rendus_chantier_membres on public.comptes_rendus_chantier
  for all to authenticated
  using (public.est_membre_actif(entreprise_id))
  with check (public.est_membre_actif(entreprise_id));

grant select, insert, update, delete on public.comptes_rendus_chantier to authenticated;
