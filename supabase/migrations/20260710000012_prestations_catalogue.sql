-- Catalogue de prestations réutilisables dans les devis.

create table public.prestations_catalogue (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  designation text not null check (length(trim(designation)) > 0),
  description text,
  type text not null default 'main_oeuvre'
    check (type in ('main_oeuvre', 'fourniture', 'sous_traitance', 'deplacement', 'forfait')),
  unite text not null default 'h',
  prix_unitaire_ht numeric(12,2) not null default 0 check (prix_unitaire_ht >= 0),
  taux_tva numeric(5,2) not null default 20 check (taux_tva >= 0),
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entreprise_id, designation)
);

create index prestations_catalogue_entreprise_actif_idx
  on public.prestations_catalogue (entreprise_id, actif, designation);

alter table public.prestations_catalogue enable row level security;

create policy "membres prestations catalogue" on public.prestations_catalogue
  for all
  using (public.est_membre_actif(entreprise_id))
  with check (public.est_membre_actif(entreprise_id));

-- Le projet fonctionne actuellement en mode prototype sans connexion (migration 08).
grant select, insert, update, delete on public.prestations_catalogue to anon, authenticated;

create policy "prototype acces anonyme" on public.prestations_catalogue
  for all to anon using (true) with check (true);

-- Un petit catalogue immédiatement exploitable pour les entreprises existantes.
insert into public.prestations_catalogue
  (entreprise_id, designation, description, type, unite, prix_unitaire_ht, taux_tva)
select e.id, p.designation, p.description, p.type, p.unite, p.prix, p.tva
from public.entreprises e
cross join (values
  ('Pose cloison placo', 'Pose de cloison en plaques de plâtre, hors fournitures', 'main_oeuvre', 'm²', 38.00, 10.00),
  ('Dépose ancienne cloison', 'Dépose et évacuation de la cloison existante', 'main_oeuvre', 'm²', 22.00, 10.00),
  ('Ratissage murs', 'Préparation et ratissage complet des murs', 'main_oeuvre', 'm²', 18.00, 10.00),
  ('Peinture plafond', 'Préparation et application de deux couches', 'main_oeuvre', 'm²', 24.00, 10.00),
  ('Fourniture plaque BA13', 'Plaque de plâtre standard BA13', 'fourniture', 'u', 14.50, 20.00)
) as p(designation, description, type, unite, prix, tva)
on conflict (entreprise_id, designation) do nothing;

notify pgrst, 'reload schema';
