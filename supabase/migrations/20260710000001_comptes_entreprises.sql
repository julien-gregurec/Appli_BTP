-- Module Comptes & Entreprises
-- Socle transversal : entreprises, utilisateurs, postes, permissions, accès.

create extension if not exists "pgcrypto";

-- Compteur générique de référence interne, réutilisé par tous les modules.
-- entreprise_id utilise un sentinel (uuid nul) pour les compteurs globaux à la plateforme (ex. référence entreprise elle-même),
-- car une clé primaire composite ne peut pas contenir de NULL en Postgres.
create table public.compteurs_reference (
  entreprise_id uuid not null default '00000000-0000-0000-0000-000000000000',
  type text not null,
  dernier_numero int not null default 0,
  primary key (entreprise_id, type)
);

create table public.entreprises (
  id uuid primary key default gen_random_uuid(),
  reference_interne text unique,
  nom text not null,
  raison_sociale text,
  siret text,
  adresse text,
  code_postal text,
  ville text,
  logo_url text,
  couleur_accent text,
  gabarit_pdf text default 'classique',
  texte_entete text,
  texte_pied_page text,
  assurance_decennale_numero text,
  assurance_decennale_assureur text,
  assurance_rc_pro_numero text,
  taux_penalites_retard numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.postes (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  nom text not null,
  created_at timestamptz not null default now(),
  unique (entreprise_id, nom)
);

-- Profil applicatif lié à auth.users (Supabase Auth gère email/mot de passe).
create table public.utilisateurs (
  id uuid primary key references auth.users(id) on delete cascade,
  nom text,
  prenom text,
  entreprise_active_id uuid references public.entreprises(id),
  deux_facteurs_actif boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.utilisateurs_entreprises (
  utilisateur_id uuid not null references public.utilisateurs(id) on delete cascade,
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  poste_id uuid references public.postes(id),
  statut text not null default 'actif' check (statut in ('actif', 'invite', 'en_attente_validation', 'desactive')),
  client_id uuid, -- addendum Portail client (V2), rattaché plus tard via fk differée
  created_at timestamptz not null default now(),
  primary key (utilisateur_id, entreprise_id)
);

-- Référentiel fixe des droits disponibles dans la plateforme (géré par la plateforme, pas par l'entreprise).
create table public.permissions_disponibles (
  cle text primary key,
  module text not null,
  description text not null
);

create table public.permissions_poste (
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  poste_id uuid not null references public.postes(id) on delete cascade,
  cle_permission text not null references public.permissions_disponibles(cle),
  autorise boolean not null default false,
  primary key (entreprise_id, poste_id, cle_permission)
);

create table public.codes_acces (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  code text not null unique,
  statut text not null default 'actif' check (statut in ('actif', 'revoque')),
  created_at timestamptz not null default now()
);

create table public.cles_api (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  cle_hash text not null,
  nom text not null,
  statut text not null default 'actif' check (statut in ('actif', 'revoque')),
  derniere_utilisation timestamptz,
  created_at timestamptz not null default now()
);

create table public.acces_support_log (
  id uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null references public.utilisateurs(id),
  entreprise_id uuid not null references public.entreprises(id),
  date timestamptz not null default now(),
  motif text
);

-- Génère la prochaine référence interne d'un type donné pour une entreprise (ou globale si entreprise_id est null).
create or replace function public.next_reference(p_entreprise_id uuid, p_type text, p_prefix text, p_largeur int default 4, p_avec_annee boolean default false)
returns text
language plpgsql
as $$
declare
  v_numero int;
  v_annee text := to_char(now(), 'YYYY');
  v_scope uuid := coalesce(p_entreprise_id, '00000000-0000-0000-0000-000000000000');
begin
  insert into public.compteurs_reference (entreprise_id, type, dernier_numero)
  values (v_scope, p_type, 1)
  on conflict (entreprise_id, type)
  do update set dernier_numero = public.compteurs_reference.dernier_numero + 1
  returning dernier_numero into v_numero;

  if p_avec_annee then
    return p_prefix || '-' || v_annee || '-' || lpad(v_numero::text, p_largeur, '0');
  else
    return p_prefix || '-' || lpad(v_numero::text, p_largeur, '0');
  end if;
end;
$$;

create or replace function public.trg_set_entreprise_reference()
returns trigger
language plpgsql
as $$
begin
  new.reference_interne := public.next_reference(null, 'entreprise', 'ENT', 3, false);
  return new;
end;
$$;

create trigger set_entreprise_reference
  before insert on public.entreprises
  for each row
  when (new.reference_interne is null)
  execute function public.trg_set_entreprise_reference();

-- Fonction utilitaire RLS : l'utilisateur courant appartient-il activement à cette entreprise ?
create or replace function public.est_membre_actif(p_entreprise_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.utilisateurs_entreprises ue
    where ue.entreprise_id = p_entreprise_id
      and ue.utilisateur_id = auth.uid()
      and ue.statut = 'actif'
  );
$$;

-- Fonction utilitaire RLS : l'entreprise n'a-t-elle encore aucun membre ? (fenêtre de bootstrap juste après création)
create or replace function public.entreprise_sans_membres(p_entreprise_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select not exists (
    select 1 from public.utilisateurs_entreprises ue where ue.entreprise_id = p_entreprise_id
  );
$$;

alter table public.entreprises enable row level security;
alter table public.postes enable row level security;
alter table public.utilisateurs enable row level security;
alter table public.utilisateurs_entreprises enable row level security;
alter table public.permissions_poste enable row level security;
alter table public.codes_acces enable row level security;
alter table public.cles_api enable row level security;
alter table public.acces_support_log enable row level security;

create policy "membres voient leur entreprise" on public.entreprises
  for select using (public.est_membre_actif(id));
create policy "membres modifient leur entreprise" on public.entreprises
  for update using (public.est_membre_actif(id));
create policy "un utilisateur crée une entreprise" on public.entreprises
  for insert with check (auth.uid() is not null);

create policy "membres voient les postes" on public.postes
  for select using (public.est_membre_actif(entreprise_id) or public.entreprise_sans_membres(entreprise_id));
create policy "membres gèrent les postes" on public.postes
  for all using (public.est_membre_actif(entreprise_id) or public.entreprise_sans_membres(entreprise_id));

create policy "un utilisateur voit son profil" on public.utilisateurs
  for select using (id = auth.uid());
create policy "un utilisateur modifie son profil" on public.utilisateurs
  for update using (id = auth.uid());
create policy "un utilisateur crée son profil" on public.utilisateurs
  for insert with check (id = auth.uid());

create policy "membres voient les appartenances de leur entreprise" on public.utilisateurs_entreprises
  for select using (public.est_membre_actif(entreprise_id) or utilisateur_id = auth.uid());
-- Auto-bootstrap (premier utilisateur) ou invitation créée par un admin déjà membre.
-- Simplification V1 : n'importe quel membre actif peut inviter — l'affinage par droit gerer_utilisateurs
-- (permissions_disponibles) se fera au niveau applicatif dans un second temps.
create policy "bootstrap ou invitation par un membre actif" on public.utilisateurs_entreprises
  for insert with check (
    (utilisateur_id = auth.uid() and public.entreprise_sans_membres(entreprise_id))
    or public.est_membre_actif(entreprise_id)
  );
create policy "admins modifient les appartenances" on public.utilisateurs_entreprises
  for update using (public.est_membre_actif(entreprise_id));

create policy "membres voient les permissions" on public.permissions_poste
  for select using (public.est_membre_actif(entreprise_id) or public.entreprise_sans_membres(entreprise_id));
create policy "membres gèrent les permissions" on public.permissions_poste
  for all using (public.est_membre_actif(entreprise_id) or public.entreprise_sans_membres(entreprise_id));

create policy "membres voient les codes d'accès" on public.codes_acces
  for select using (public.est_membre_actif(entreprise_id));
create policy "membres gèrent les codes d'accès" on public.codes_acces
  for all using (public.est_membre_actif(entreprise_id));

create policy "membres voient leurs clés API" on public.cles_api
  for select using (public.est_membre_actif(entreprise_id));
create policy "membres gèrent leurs clés API" on public.cles_api
  for all using (public.est_membre_actif(entreprise_id));

create policy "membres voient le journal d'accès support" on public.acces_support_log
  for select using (public.est_membre_actif(entreprise_id));

-- Droits de base pré-remplis, regroupés par module (liste volontairement incrémentale, complétée au fil des modules).
insert into public.permissions_disponibles (cle, module, description) values
  ('creer_client', 'Clients & Chantiers', 'Créer une fiche client'),
  ('modifier_client', 'Clients & Chantiers', 'Modifier une fiche client'),
  ('archiver_client', 'Clients & Chantiers', 'Archiver un client'),
  ('creer_chantier', 'Clients & Chantiers', 'Créer un chantier'),
  ('modifier_chantier', 'Clients & Chantiers', 'Modifier un chantier'),
  ('archiver_chantier', 'Clients & Chantiers', 'Archiver un chantier'),
  ('transferer_chantier', 'Clients & Chantiers', 'Changer le client d''un chantier existant'),
  ('gerer_utilisateurs', 'Comptes & Entreprises', 'Inviter, désactiver, changer le poste des membres'),
  ('voir_ca', 'Tableau de bord', 'Voir le chiffre d''affaires'),
  ('voir_rentabilite', 'Rentabilité', 'Voir la rentabilité par chantier');
