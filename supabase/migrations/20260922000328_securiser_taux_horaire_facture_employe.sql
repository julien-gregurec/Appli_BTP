-- ELSATIA-EXTERNAL-PILOT-FULL-REHEARSAL-V2, P1 sécurité : employes.taux_horaire
-- (taux facturé client) était lisible par n'importe quel salarié authentifié
-- de l'entreprise — seule policy RLS : "membres accedent aux employes", basée
-- uniquement sur est_membre_actif, sans vérification de permission. Le
-- masquage existant (voir_taux_facture_employe, cf.
-- 20260722000127_separer_droits_taux_cout_employe.sql) n'était appliqué que
-- côté UI (`peutVoirTauxFacture` dans employes/[id]/page.tsx), contournable
-- par un appel direct à l'API PostgREST. Vérifié par exécution réelle lors de
-- cette mission (`select taux_horaire from employes ...` sous le rôle d'un
-- ouvrier renvoie la valeur d'un collègue) — déjà documenté comme réserve
-- structurelle connue (P1-5 / O9bis) dans
-- ELSATIA_EXTERNAL_PILOT_ACCEPTANCE_PACK_V1.md, non fermée jusqu'ici.
--
-- Même traitement, exactement, que le coût interne
-- (20260818000205_securiser_cout_horaire_employe.sql) : la colonne est sur
-- une table par ailleurs largement accessible (nom, poste, contact...), la
-- RLS ne peut pas protéger une seule colonne, donc on l'isole dans une table
-- dédiée avec sa propre policy restrictive gérée par permission.

create table public.employes_taux_facture (
  employe_id uuid primary key,
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  taux_horaire numeric(10,2) check (taux_horaire is null or taux_horaire >= 0),
  updated_at timestamptz not null default now(),
  foreign key (employe_id, entreprise_id) references public.employes(id, entreprise_id) on delete cascade
);

insert into public.employes_taux_facture (employe_id, entreprise_id, taux_horaire, updated_at)
select id, entreprise_id, taux_horaire, coalesce(updated_at, now()) from public.employes;

alter table public.employes_taux_facture enable row level security;

-- Écriture : même périmètre que la table employes elle-même (le contrôle
-- fin gerer_employes reste appliqué au niveau des Server Actions, comme
-- pour le reste de la fiche employé, et comme employes_cout_horaire).
create policy "membres gerent taux facture" on public.employes_taux_facture
  for all using (public.est_membre_actif(entreprise_id)) with check (public.est_membre_actif(entreprise_id));

-- Lecture : réservée aux postes autorisés à voir le taux facturé — même
-- permission que le masquage UI existant.
create policy "lecture taux facture selon permission" on public.employes_taux_facture
  as restrictive for select to authenticated
  using (public.a_permission(entreprise_id, 'voir_taux_facture_employe'));

-- Les policies RLS ne suffisent pas : sans ce grant, `authenticated` n'a
-- aucun privilège de base sur la table.
grant select, insert, update, delete on public.employes_taux_facture to authenticated;

alter table public.employes drop column taux_horaire;

notify pgrst, 'reload schema';
