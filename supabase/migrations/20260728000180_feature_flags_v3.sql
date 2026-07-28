-- Lot 3 : exposition produit indépendante des permissions métier.
create table if not exists public.entreprise_feature_flags (
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  feature_key text not null,
  statut text not null default 'disabled' check (statut in ('active','beta','experimental','disabled')),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (entreprise_id, feature_key)
);

create index if not exists entreprise_feature_flags_active_idx
  on public.entreprise_feature_flags(entreprise_id, active);

alter table public.entreprise_feature_flags enable row level security;
drop policy if exists feature_flags_select on public.entreprise_feature_flags;
create policy feature_flags_select on public.entreprise_feature_flags
  for select to authenticated
  using (public.est_membre_actif(entreprise_id) or public.est_plateforme_admin());

drop policy if exists feature_flags_manage on public.entreprise_feature_flags;
create policy feature_flags_manage on public.entreprise_feature_flags
  for all to authenticated
  using (
    public.est_plateforme_admin()
    or (public.est_membre_actif(entreprise_id) and public.a_permission(entreprise_id, 'gerer_parametres'))
  )
  with check (
    public.est_plateforme_admin()
    or (public.est_membre_actif(entreprise_id) and public.a_permission(entreprise_id, 'gerer_parametres'))
  );

grant select, insert, update, delete on public.entreprise_feature_flags to authenticated;
notify pgrst, 'reload schema';
