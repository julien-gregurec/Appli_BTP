-- Notifications push navigateur : abonnements par appareil, preferences par type et par
-- utilisateur (defaut active, modele opt-out pour ne rien changer au comportement actuel),
-- et une colonne de suivi d'envoi sur la table de notifications existante.
--
-- Fichier volontairement 100% ASCII (chr() pour les accents) : le copier-coller de
-- caracteres accentues dans l'editeur SQL Supabase corrompt l'encodage, cf.
-- 20260723000129_reparation_mojibake_chr.sql pour le detail du probleme.

create table public.push_abonnements(
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  utilisateur_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  appareil text,
  created_at timestamptz not null default now()
);
create index push_abonnements_utilisateur_idx on public.push_abonnements(utilisateur_id);

alter table public.push_abonnements enable row level security;
create policy push_abonnements_personnels on public.push_abonnements for all to authenticated
  using(utilisateur_id=auth.uid() and public.est_membre_actif(entreprise_id))
  with check(utilisateur_id=auth.uid() and public.est_membre_actif(entreprise_id));
grant select,insert,delete on public.push_abonnements to authenticated;

create table public.preferences_notifications_push(
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  utilisateur_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  actif boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key(utilisateur_id,type)
);

alter table public.preferences_notifications_push enable row level security;
create policy preferences_notifications_push_personnelles on public.preferences_notifications_push for all to authenticated
  using(utilisateur_id=auth.uid() and public.est_membre_actif(entreprise_id))
  with check(utilisateur_id=auth.uid() and public.est_membre_actif(entreprise_id));
grant select,insert,update,delete on public.preferences_notifications_push to authenticated;

alter table public.notifications_utilisateurs add column if not exists push_envoyee_at timestamptz;
create index if not exists notifications_a_pousser_idx on public.notifications_utilisateurs(created_at)
  where push_envoyee_at is null;

notify pgrst, 'reload schema';
