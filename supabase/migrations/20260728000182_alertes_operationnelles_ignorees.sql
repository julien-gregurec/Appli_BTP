create table if not exists public.alertes_operationnelles_ignorees (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  utilisateur_id uuid not null references auth.users(id) on delete cascade,
  alerte_cle text not null check (char_length(alerte_cle) between 1 and 120),
  signature text not null check (char_length(signature) between 1 and 1000),
  titre text,
  ignoree_at timestamptz not null default now(),
  unique (entreprise_id, utilisateur_id, alerte_cle)
);

create index if not exists alertes_operationnelles_ignorees_utilisateur_idx
  on public.alertes_operationnelles_ignorees (entreprise_id, utilisateur_id, ignoree_at desc);

alter table public.alertes_operationnelles_ignorees enable row level security;

drop policy if exists alertes_operationnelles_ignorees_lecture on public.alertes_operationnelles_ignorees;
create policy alertes_operationnelles_ignorees_lecture
  on public.alertes_operationnelles_ignorees
  for select
  to authenticated
  using (
    utilisateur_id = auth.uid()
    and public.est_membre_actif(entreprise_id)
  );

drop policy if exists alertes_operationnelles_ignorees_ajout on public.alertes_operationnelles_ignorees;
create policy alertes_operationnelles_ignorees_ajout
  on public.alertes_operationnelles_ignorees
  for insert
  to authenticated
  with check (
    utilisateur_id = auth.uid()
    and public.est_membre_actif(entreprise_id)
  );

drop policy if exists alertes_operationnelles_ignorees_modification on public.alertes_operationnelles_ignorees;
create policy alertes_operationnelles_ignorees_modification
  on public.alertes_operationnelles_ignorees
  for update
  to authenticated
  using (
    utilisateur_id = auth.uid()
    and public.est_membre_actif(entreprise_id)
  )
  with check (
    utilisateur_id = auth.uid()
    and public.est_membre_actif(entreprise_id)
  );

drop policy if exists alertes_operationnelles_ignorees_suppression on public.alertes_operationnelles_ignorees;
create policy alertes_operationnelles_ignorees_suppression
  on public.alertes_operationnelles_ignorees
  for delete
  to authenticated
  using (
    utilisateur_id = auth.uid()
    and public.est_membre_actif(entreprise_id)
  );

revoke all on public.alertes_operationnelles_ignorees from anon;
grant select, insert, update, delete on public.alertes_operationnelles_ignorees to authenticated;

comment on table public.alertes_operationnelles_ignorees is
  'Masquages personnels des alertes calculées du tableau de bord. Une nouvelle signature rend automatiquement l''alerte visible.';

notify pgrst, 'reload schema';
