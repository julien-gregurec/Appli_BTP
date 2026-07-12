-- Espace "propriétaire de la plateforme" : suivi des entreprises clientes et de leur abonnement.
-- Prépare la facturation par entreprise (chaque code = un client facturable).

-- Statut d'abonnement porté par chaque entreprise.
alter table public.entreprises
  add column if not exists abonnement_statut text not null default 'essai'
    check (abonnement_statut in ('essai', 'actif', 'suspendu', 'annule')),
  add column if not exists abonnement_echeance date,
  add column if not exists abonnement_note text;

-- Administrateurs de la plateforme (les seuls à voir toutes les entreprises).
create table if not exists public.plateforme_admins (
  email text primary key,
  created_at timestamptz not null default now()
);
insert into public.plateforme_admins (email) values ('julien.gregurec@gmail.com')
  on conflict (email) do nothing;

alter table public.plateforme_admins enable row level security;
-- Personne ne lit cette table via l'API : seules les fonctions SECURITY DEFINER l'utilisent.

create or replace function public.est_plateforme_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce(auth.email() in (select email from public.plateforme_admins), false);
$$;

-- Liste des entreprises + statistiques (réservé à l'admin plateforme).
create or replace function public.plateforme_entreprises()
returns table (
  id uuid, nom text, code_adhesion text, reference_interne text,
  abonnement_statut text, abonnement_echeance date, abonnement_note text,
  nb_membres bigint, nb_membres_actifs bigint, created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme'; end if;
  return query
    select e.id, e.nom, e.code_adhesion, e.reference_interne,
           e.abonnement_statut, e.abonnement_echeance, e.abonnement_note,
           (select count(*) from public.utilisateurs_entreprises ue where ue.entreprise_id = e.id),
           (select count(*) from public.utilisateurs_entreprises ue where ue.entreprise_id = e.id and ue.statut = 'actif'),
           e.created_at
    from public.entreprises e
    order by e.created_at desc;
end; $$;

create or replace function public.plateforme_modifier_abonnement(
  p_entreprise_id uuid, p_statut text, p_echeance date, p_note text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme'; end if;
  if p_statut not in ('essai', 'actif', 'suspendu', 'annule') then raise exception 'Statut invalide'; end if;
  update public.entreprises
    set abonnement_statut = p_statut, abonnement_echeance = p_echeance,
        abonnement_note = p_note, updated_at = now()
    where id = p_entreprise_id;
end; $$;

revoke all on function public.est_plateforme_admin() from public, anon;
revoke all on function public.plateforme_entreprises() from public, anon;
revoke all on function public.plateforme_modifier_abonnement(uuid, text, date, text) from public, anon;
grant execute on function public.est_plateforme_admin() to authenticated;
grant execute on function public.plateforme_entreprises() to authenticated;
grant execute on function public.plateforme_modifier_abonnement(uuid, text, date, text) to authenticated;

notify pgrst, 'reload schema';
