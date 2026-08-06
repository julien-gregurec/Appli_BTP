-- Correctif : la migration 20260715000081 a supprimé la policy PERMISSIVE d'origine
-- "membres accèdent aux chantiers" (for all) pour restreindre la lecture terrain, et ne
-- l'a remplacée que par une policy SELECT. Depuis, aucune policy PERMISSIVE ne couvre plus
-- INSERT/UPDATE/DELETE sur public.chantiers : en RLS Postgres, une commande n'est autorisée
-- que si au moins une policy PERMISSIVE l'accorde ET que toutes les policies RESTRICTIVE
-- passent. Sans PERMISSIVE, la commande est refusée même si les RESTRICTIVE sont satisfaites.
--
-- Les policies RESTRICTIVE existantes (role_gestion_insert / role_gestion_update /
-- role_gestion_delete, ajoutées par 20260713000043) exigeant déjà
-- a_permission(entreprise_id,'gerer_chantiers') restent inchangées et continuent de
-- s'appliquer par-dessus : ce correctif ne fait que restaurer le socle PERMISSIVE fondé sur
-- l'appartenance active, il n'élargit aucun droit métier.
--
-- Le SELECT n'est volontairement pas touché : les policies de lecture existantes
-- (chantiers_lecture_selon_droits, lecture_chantiers_selon_permission) restent telles quelles.
--
-- Écart volontaire par rapport au contenu initialement esquissé : le WITH CHECK d'INSERT et
-- d'UPDATE vérifie en plus que client_id référence bien un client de la même entreprise.
-- Sans cela, la seule condition est_membre_actif(entreprise_id) n'empêche pas un membre de B
-- de rattacher un chantier de B à un client_id appartenant à A (la contrainte FK
-- chantiers_client_id_fkey ne vérifie que l'existence de la ligne, jamais l'entreprise
-- propriétaire, et les contraintes FK s'évaluent hors RLS). C'est exigé par le scénario de
-- recette « Gérant B ne peut pas rattacher un chantier à un client A ».

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
