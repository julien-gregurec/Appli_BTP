-- Notes de frais : un salarié scanne un justificatif (repas, carburant, péage, fournitures…)
-- qui part directement à la gestion / au comptable. Justificatif stocké dans le bucket privé
-- existant `documents-employes` (chemin entreprise_id/notes-frais/…).
create table public.notes_frais (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  employe_id uuid references public.employes(id) on delete set null,
  date_frais date not null default current_date,
  montant_ttc numeric(12,2) not null check (montant_ttc >= 0),
  categorie text,
  description text,
  justificatif_storage_path text,
  justificatif_nom text,
  justificatif_mime_type text,
  statut text not null default 'soumise' check (statut in ('soumise', 'validee', 'remboursee', 'refusee')),
  created_at timestamptz not null default now()
);
create index notes_frais_entreprise_idx on public.notes_frais(entreprise_id, statut, date_frais desc);

alter table public.notes_frais enable row level security;
create policy "membres notes frais" on public.notes_frais
  for all using (public.est_membre_actif(entreprise_id)) with check (public.est_membre_actif(entreprise_id));
create policy "prototype notes frais" on public.notes_frais
  for all to anon using (true) with check (true);
grant select, insert, update, delete on public.notes_frais to anon, authenticated;

notify pgrst, 'reload schema';
