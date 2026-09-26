-- RENTABILITÉ-V1B, P0 sécurité : employes.cout_horaire était lisible par
-- n'importe quel salarié authentifié (seule policy RLS : "membres accedent
-- aux employes", basée uniquement sur est_membre_actif, sans vérification
-- de permission). Le masquage existant (voir_cout_interne_employe) n'était
-- appliqué que côté UI, contournable par un appel direct à l'API PostgREST.
--
-- La colonne étant une donnée salariale sensible sur une table par ailleurs
-- largement accessible (nom, poste, contact...), la RLS ne peut pas protéger
-- une seule colonne : on l'isole donc dans une table dédiée, avec sa propre
-- policy restrictive gérée par permission — même schéma que les autres
-- modules sensibles (cf. 20260718000113_lecture_modules_selon_permissions.sql).

create table public.employes_cout_horaire (
  employe_id uuid primary key,
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  cout_horaire numeric(10,2) check (cout_horaire is null or cout_horaire >= 0),
  updated_at timestamptz not null default now(),
  foreign key (employe_id, entreprise_id) references public.employes(id, entreprise_id) on delete cascade
);

insert into public.employes_cout_horaire (employe_id, entreprise_id, cout_horaire, updated_at)
select id, entreprise_id, cout_horaire, coalesce(updated_at, now()) from public.employes;

alter table public.employes_cout_horaire enable row level security;

-- Écriture : même périmètre que la table employes elle-même (le contrôle
-- fin gerer_employes reste appliqué au niveau des Server Actions, comme
-- pour le reste de la fiche employé).
create policy "membres gerent cout horaire" on public.employes_cout_horaire
  for all using (public.est_membre_actif(entreprise_id)) with check (public.est_membre_actif(entreprise_id));

-- Lecture : réservée aux postes autorisés à voir le coût interne, ou à
-- l'écran de rentabilité (qui a lui-même besoin du coût réel pour calculer
-- la marge, indépendamment du droit d'affichage sur la fiche employé).
create policy "lecture cout horaire selon permission" on public.employes_cout_horaire
  as restrictive for select to authenticated
  using (
    public.a_permission(entreprise_id, 'voir_cout_interne_employe')
    or public.a_permission(entreprise_id, 'acces_rentabilite')
  );

-- Les policies RLS ne suffisent pas : sans ce grant, `authenticated` n'a
-- aucun privilège de base sur la table (contrairement à `employes`, qui
-- avait hérité du sien du prototype initial).
grant select, insert, update, delete on public.employes_cout_horaire to authenticated;

alter table public.employes drop column cout_horaire;

notify pgrst, 'reload schema';
