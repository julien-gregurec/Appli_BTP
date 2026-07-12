-- Module Employes : annuaire RH et couts horaires.
-- Premiere tranche : fiches salaries/prestataires, statuts et lien responsable chantier.

create table public.employes (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  reference_interne text,
  prenom text not null,
  nom text not null,
  email text,
  telephone text,
  poste text,
  type_contrat text not null default 'cdi'
    check (type_contrat in ('cdi', 'cdd', 'interim', 'apprenti', 'stage', 'freelance', 'autre')),
  date_entree date,
  date_sortie date,
  taux_horaire numeric(10,2),
  cout_horaire numeric(10,2),
  statut text not null default 'actif'
    check (statut in ('actif', 'en_conge', 'sorti', 'suspendu')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entreprise_id, reference_interne),
  check (date_sortie is null or date_entree is null or date_sortie >= date_entree)
);

create unique index employes_entreprise_email_unique
  on public.employes (entreprise_id, lower(email))
  where email is not null;

create index employes_entreprise_statut_idx
  on public.employes (entreprise_id, statut);

create or replace function public.trg_ref_employe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reference_interne is null then
    new.reference_interne := public.next_reference(new.entreprise_id, 'employe', 'EMP', 4, false);
  end if;
  return new;
end;
$$;

create trigger set_employe_reference
  before insert on public.employes
  for each row execute function public.trg_ref_employe();

alter table public.employes enable row level security;

create policy "membres accedent aux employes" on public.employes
  for all using (public.est_membre_actif(entreprise_id)) with check (public.est_membre_actif(entreprise_id));

-- Mode prototype sans connexion : cette policy ne donne un effet que si la migration
-- 08_mode_sans_connexion.sql a aussi ete executee.
create policy "prototype acces anonyme" on public.employes
  for all to anon using (true) with check (true);

grant select, insert, update, delete on public.employes to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chantiers_responsable_id_fkey'
  ) then
    alter table public.chantiers
      add constraint chantiers_responsable_id_fkey
      foreign key (responsable_id) references public.employes(id) on delete set null;
  end if;
end;
$$;

insert into public.permissions_disponibles (cle, module, description) values
  ('creer_employe', 'Employes', 'Creer une fiche employe'),
  ('modifier_employe', 'Employes', 'Modifier une fiche employe'),
  ('desactiver_employe', 'Employes', 'Sortir ou suspendre un employe')
on conflict (cle) do nothing;

notify pgrst, 'reload schema';
