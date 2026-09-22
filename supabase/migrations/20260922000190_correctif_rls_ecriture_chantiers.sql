-- Correctif : la migration 20260715000081 a supprimé la policy PERMISSIVE d'origine
-- "membres accèdent aux chantiers" (for all) pour restreindre la lecture terrain, et ne
-- l'a remplacée que par une policy SELECT. Depuis, aucune policy PERMISSIVE ne couvre plus
-- INSERT/UPDATE/DELETE sur public.chantiers : en RLS Postgres, une commande n'est autorisée
-- que si au moins une policy PERMISSIVE l'accorde ET que toutes les policies RESTRICTIVE
-- passent. Sans PERMISSIVE, la commande est refusée pour tout le monde, quel que soit le rôle
-- ou les permissions métier.
--
-- Vérifié sur le SQL actuel de cette branche : `git grep`/recherche exhaustive de
-- "create policy ... on public.chantiers" dans supabase/migrations/ ne trouve, après
-- 20260715000081, que des policies SELECT (chantiers_lecture_selon_droits,
-- lecture_chantiers_selon_permission). src/app/actions/chantiers.ts effectue bien des
-- `supabase.from("chantiers").insert/update(...)` directs (pas de client admin/service_role) :
-- la création, la modification et l'archivage de chantier sont donc bloqués par RLS pour
-- toutes les entreprises, sans exception, tant que ce correctif n'est pas appliqué.
--
-- Porté depuis integration/gp-external-pilot-closure-v1 (commit 8f5fca1's ancestor fee8afa,
-- migration source 20260806000196_correctif_rls_ecriture_chantiers.sql). Le WITH CHECK
-- d'INSERT et d'UPDATE vérifie en plus que client_id référence bien un client de la même
-- entreprise : la seule condition est_membre_actif(entreprise_id) n'empêche pas un membre de
-- B de rattacher un chantier de B à un client_id appartenant à A (la contrainte FK
-- chantiers_client_id_fkey ne vérifie que l'existence de la ligne, jamais l'entreprise
-- propriétaire, et les contraintes FK s'évaluent hors RLS).

drop policy if exists "membres écrivent les chantiers" on public.chantiers;
create policy "membres écrivent les chantiers"
on public.chantiers
as permissive
for insert
to authenticated
with check (
  public.est_membre_actif(entreprise_id)
  and exists (
    select 1 from public.clients c
    where c.id = client_id and c.entreprise_id = chantiers.entreprise_id
  )
);

drop policy if exists "membres modifient les chantiers" on public.chantiers;
create policy "membres modifient les chantiers"
on public.chantiers
as permissive
for update
to authenticated
using (
  public.est_membre_actif(entreprise_id)
)
with check (
  public.est_membre_actif(entreprise_id)
  and exists (
    select 1 from public.clients c
    where c.id = client_id and c.entreprise_id = chantiers.entreprise_id
  )
);

drop policy if exists "membres suppriment les chantiers" on public.chantiers;
create policy "membres suppriment les chantiers"
on public.chantiers
as permissive
for delete
to authenticated
using (
  public.est_membre_actif(entreprise_id)
);

-- Écart volontaire par rapport à la migration source : sur cette branche,
-- contrairement à la branche source, aucune policy RESTRICTIVE n'exige déjà la permission
-- métier `gerer_chantiers` directement sur public.chantiers (vérifié : 20260713000043 en
-- ajoute pour taches/chantier_transferts/contacts_clients/lignes_devis/lignes_factures/
-- paiements, jamais pour chantiers elle-même). Sans elle, restaurer uniquement les policies
-- PERMISSIVE ci-dessus autoriserait tout membre actif — y compris sans `gerer_chantiers` — à
-- créer/modifier/supprimer un chantier par un appel direct à l'API REST Supabase, en
-- contournant le contrôle applicatif (peutGererChantiers()) de src/app/actions/chantiers.ts.
-- Ajoutée ici pour ne pas rouvrir cette lacune en restaurant l'écriture.
drop policy if exists role_gestion_insert on public.chantiers;
create policy role_gestion_insert on public.chantiers as restrictive for insert to authenticated
  with check (public.a_permission(entreprise_id, 'gerer_chantiers'));
drop policy if exists role_gestion_update on public.chantiers;
create policy role_gestion_update on public.chantiers as restrictive for update to authenticated
  using (public.a_permission(entreprise_id, 'gerer_chantiers'))
  with check (public.a_permission(entreprise_id, 'gerer_chantiers'));
drop policy if exists role_gestion_delete on public.chantiers;
create policy role_gestion_delete on public.chantiers as restrictive for delete to authenticated
  using (public.a_permission(entreprise_id, 'gerer_chantiers'));
