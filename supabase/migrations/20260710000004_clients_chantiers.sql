-- Module Clients & Chantiers
-- Socle métier : clients, contacts, types de chantier, chantiers, tâches, transferts.

-- Types de chantier personnalisables par entreprise (pré-remplis à la création).
create table public.types_chantier (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  nom text not null,
  created_at timestamptz not null default now(),
  unique (entreprise_id, nom)
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  reference_interne text,
  type text not null default 'particulier'
    check (type in ('particulier', 'professionnel', 'collectivite', 'syndic', 'promoteur')),
  nom text,
  prenom text,
  societe text,
  raison_sociale text,
  siret text,
  adresse_facturation text,
  code_postal text,
  ville text,
  adresse_chantier_defaut text,
  telephone text,
  email text,
  conditions_paiement text,
  statut text not null default 'prospect' check (statut in ('prospect', 'actif', 'inactif')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entreprise_id, reference_interne)
);

create table public.contacts_clients (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  nom text not null,
  fonction text,
  telephone text,
  email text,
  principal boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.chantiers (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  reference_interne text,
  client_id uuid not null references public.clients(id) on delete restrict,
  nom text not null,
  adresse text,
  code_postal text,
  ville text,
  type_chantier_id uuid references public.types_chantier(id),
  statut text not null default 'prospect'
    check (statut in ('prospect', 'devis_envoye', 'accepte', 'a_preparer', 'en_attente_validation',
                      'en_commande_materiel', 'en_cours', 'en_pause', 'termine', 'facture', 'archive', 'annule')),
  date_debut_prevue date,
  date_fin_prevue date,
  date_debut_reelle date,
  date_fin_reelle date,
  budget_previsionnel numeric,
  responsable_id uuid, -- fk employes ajoutée au module Planning & Employés
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entreprise_id, reference_interne)
);

create table public.taches (
  id uuid primary key default gen_random_uuid(),
  chantier_id uuid not null references public.chantiers(id) on delete cascade,
  libelle text not null,
  statut text not null default 'a_faire' check (statut in ('a_faire', 'fait')),
  echeance date,
  created_at timestamptz not null default now()
);

create table public.chantier_transferts (
  id uuid primary key default gen_random_uuid(),
  chantier_id uuid not null references public.chantiers(id) on delete cascade,
  ancien_client_id uuid not null references public.clients(id),
  nouveau_client_id uuid not null references public.clients(id),
  date timestamptz not null default now(),
  utilisateur_id uuid references public.utilisateurs(id)
);

-- Génération des références internes (CLI-0001, CHA-2026-001) via trigger, en réutilisant next_reference.
create or replace function public.trg_ref_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reference_interne is null then
    new.reference_interne := public.next_reference(new.entreprise_id, 'client', 'CLI', 4, false);
  end if;
  return new;
end;
$$;

create or replace function public.trg_ref_chantier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reference_interne is null then
    new.reference_interne := public.next_reference(new.entreprise_id, 'chantier', 'CHA', 3, true);
  end if;
  return new;
end;
$$;

create trigger set_client_reference
  before insert on public.clients
  for each row execute function public.trg_ref_client();

create trigger set_chantier_reference
  before insert on public.chantiers
  for each row execute function public.trg_ref_chantier();

-- Un seul contact principal par client.
create or replace function public.trg_contact_principal_unique()
returns trigger
language plpgsql
as $$
begin
  if new.principal then
    update public.contacts_clients
    set principal = false
    where client_id = new.client_id and id <> new.id and principal;
  end if;
  return new;
end;
$$;

create trigger contact_principal_unique
  after insert or update of principal on public.contacts_clients
  for each row when (new.principal)
  execute function public.trg_contact_principal_unique();

-- Types de chantier standard pré-remplis à la création d'une entreprise.
create or replace function public.trg_seed_types_chantier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.types_chantier (entreprise_id, nom)
  values (new.id, 'Rénovation'), (new.id, 'Neuf'), (new.id, 'Dépannage'), (new.id, 'Entretien'), (new.id, 'Autre');
  return new;
end;
$$;

create trigger seed_types_chantier
  after insert on public.entreprises
  for each row execute function public.trg_seed_types_chantier();

alter table public.types_chantier enable row level security;
alter table public.clients enable row level security;
alter table public.contacts_clients enable row level security;
alter table public.chantiers enable row level security;
alter table public.taches enable row level security;
alter table public.chantier_transferts enable row level security;

create policy "membres accèdent aux types de chantier" on public.types_chantier
  for all using (public.est_membre_actif(entreprise_id)) with check (public.est_membre_actif(entreprise_id));

create policy "membres accèdent aux clients" on public.clients
  for all using (public.est_membre_actif(entreprise_id)) with check (public.est_membre_actif(entreprise_id));

create policy "membres accèdent aux contacts" on public.contacts_clients
  for all using (exists (
    select 1 from public.clients c
    where c.id = contacts_clients.client_id and public.est_membre_actif(c.entreprise_id)
  )) with check (exists (
    select 1 from public.clients c
    where c.id = contacts_clients.client_id and public.est_membre_actif(c.entreprise_id)
  ));

create policy "membres accèdent aux chantiers" on public.chantiers
  for all using (public.est_membre_actif(entreprise_id)) with check (public.est_membre_actif(entreprise_id));

create policy "membres accèdent aux tâches" on public.taches
  for all using (exists (
    select 1 from public.chantiers ch
    where ch.id = taches.chantier_id and public.est_membre_actif(ch.entreprise_id)
  )) with check (exists (
    select 1 from public.chantiers ch
    where ch.id = taches.chantier_id and public.est_membre_actif(ch.entreprise_id)
  ));

create policy "membres accèdent aux transferts" on public.chantier_transferts
  for all using (exists (
    select 1 from public.chantiers ch
    where ch.id = chantier_transferts.chantier_id and public.est_membre_actif(ch.entreprise_id)
  )) with check (exists (
    select 1 from public.chantiers ch
    where ch.id = chantier_transferts.chantier_id and public.est_membre_actif(ch.entreprise_id)
  ));

-- Backfill : entreprises déjà créées avant cette migration reçoivent les types de chantier standard.
insert into public.types_chantier (entreprise_id, nom)
select e.id, t.nom
from public.entreprises e
cross join (values ('Rénovation'), ('Neuf'), ('Dépannage'), ('Entretien'), ('Autre')) as t(nom)
where not exists (
  select 1 from public.types_chantier tc where tc.entreprise_id = e.id
);
