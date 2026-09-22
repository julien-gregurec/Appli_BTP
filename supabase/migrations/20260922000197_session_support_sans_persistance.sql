-- Une session support plateforme temporaire ne doit jamais pouvoir se créer
-- une persistance permanente dans l'entreprise qu'elle assiste.
--
-- Constat : `est_membre_actif(entreprise_id)` (20260714000075) fait OU avec
-- `est_acces_support_actif(entreprise_id)` — un opérateur support avec une
-- session ouverte (`plateforme_acces_entreprises`, `plateforme_admins.role`
-- in ('total','support')) est donc traité comme un membre actif PARTOUT où
-- cette fonction gate une policy. Deux endroits précis créent un état qui
-- SURVIT à la fin de la session support :
--   - `utilisateurs_entreprises` (policy "bootstrap ou invitation par un
--     membre actif", 20260710000001) : INSERT gaté par `est_membre_actif`
--     seul — un support actif peut donc s'ajouter (ou ajouter n'importe quel
--     compte) comme membre PERMANENT de l'entreprise, sans limite de durée ;
--   - `permissions_poste` (policy "membres gèrent les permissions", même
--     migration) : ALL (donc aussi INSERT/UPDATE) gaté par `est_membre_actif`
--     seul — un support actif peut donc s'accorder n'importe quelle
--     permission PERMANENTE sur n'importe quel poste.
-- Une fois la session support terminée (`termine_at` renseigné sur
-- `plateforme_acces_entreprises`), la ligne ajoutée reste : la persistance a
-- bien survécu à la session — c'est une élévation de privilège réelle,
-- ouvrant un accès permanent et non auditée comme telle à un opérateur
-- support qui n'aurait dû avoir qu'un accès temporaire tracé.
--
-- Porté depuis integration/gp-external-pilot-closure-v1 (9d55fd7,
-- migration 20260916000304_gp_pilot_support_session_no_permanent_role.sql).
-- Seule la partie utilisateurs_entreprises/permissions_poste est portée ici :
-- le reste de ce commit source (relance_finaliser, relances_documents)
-- appartient à une fonctionnalité de relances automatiques qui n'existe pas
-- sur cette branche (`relances_documents`/`relance_reclamer` absents —
-- recherche exhaustive négative), et n'est donc pas applicable.
--
-- Correctif minimal, sans toucher au reste du modèle de permissions ni à la
-- simplification V1 documentée (« n'importe quel membre RÉEL actif peut
-- inviter » reste inchangé, c'est un choix produit assumé, pas le sujet ici) :
-- une nouvelle fonction `est_membre_actif_reel`, identique à `est_membre_actif`
-- MOINS le OU support, utilisée uniquement pour ces deux policies qui créent
-- de la persistance. Tout le reste de `est_membre_actif` (lecture, actions
-- métier réversibles pendant la session) est inchangé : le support garde son
-- accès d'assistance normal, il perd seulement la capacité de laisser une
-- trace permanente derrière lui.
create or replace function public.est_membre_actif_reel(p_entreprise_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.utilisateurs_entreprises ue
    join public.entreprises e on e.id = ue.entreprise_id
    where ue.entreprise_id = p_entreprise_id
      and ue.utilisateur_id = auth.uid()
      and ue.statut = 'actif'
      and e.abonnement_statut not in ('suspendu', 'annule')
      and (e.suspension_prevue_at is null or e.suspension_prevue_at > now())
  );
$$;

comment on function public.est_membre_actif_reel(uuid) is
  'Comme est_membre_actif, sans le OU support (est_acces_support_actif) : réservé aux policies qui créent un état PERMANENT (appartenance, permissions de poste), pour qu''une session support temporaire ne puisse jamais laisser de trace après sa fin.';

drop policy if exists "bootstrap ou invitation par un membre actif" on public.utilisateurs_entreprises;
create policy "bootstrap ou invitation par un membre actif" on public.utilisateurs_entreprises
  for insert with check (
    (utilisateur_id = auth.uid() and public.entreprise_sans_membres(entreprise_id))
    or public.est_membre_actif_reel(entreprise_id)
  );

drop policy if exists "admins modifient les appartenances" on public.utilisateurs_entreprises;
create policy "admins modifient les appartenances" on public.utilisateurs_entreprises
  for update using (public.est_membre_actif_reel(entreprise_id));

drop policy if exists "membres gèrent les permissions" on public.permissions_poste;
create policy "membres gèrent les permissions" on public.permissions_poste
  for all using (public.est_membre_actif_reel(entreprise_id) or public.entreprise_sans_membres(entreprise_id));

notify pgrst, 'reload schema';
