-- Réécrit la policy de lecture du bucket `documents-paie` pour ne plus interroger
-- directement `utilisateurs_entreprises` (table protégée par RLS) depuis l'intérieur d'une
-- policy RLS sur `storage.objects`. Porté depuis integration/gp-external-pilot-closure-v1
-- (commit 87bf61c, 20260729000188_isoler_politiques_storage_paie.sql), vérifié indépendamment
-- contre le SQL actuel de cette branche.
--
-- VÉRIFIÉ SUR LE SQL ACTUEL DE CETTE BRANCHE : la policy `documents_paie_select`
-- (`20260723000141_preparation_paie.sql`, définition actuelle) fait un `exists(select 1 from
-- public.utilisateurs_entreprises ue where ...)` directement dans son `using(...)`, au lieu de
-- passer par une fonction `security definer` bornée comme le fait déjà tout le reste du module
-- paie (`a_permission()`, `est_employe_paie_courant()`, elles-mêmes déjà utilisées plus loin
-- dans cette même policy). PostgreSQL évalue TOUTES les policies PERMISSIVE d'une commande sur
-- `storage.objects`, y compris pour des lectures visant un bucket différent de
-- `documents-paie` — le planificateur ne garantit pas d'évaluer `bucket_id = 'documents-paie'`
-- avant la sous-requête qui la suit dans le `and`. Une sous-requête directe sur une table RLS
-- dans ce contexte est un point de fragilité connu (erreurs de permission ou résultats
-- incorrects selon l'ordre d'évaluation réel choisi par le planificateur), documenté par la
-- branche source comme observé en pratique sur ce même motif. Remplace la sous-requête directe
-- par le même garde qu'utilisent déjà `a_permission()`/`est_employe_paie_courant()`
-- (`security definer`, bornées), sans changer le périmètre d'autorisation (même triplet de
-- conditions : `voir_paie_confidentielle`, `gerer_paie`, ou `est_employe_paie_courant`).
--
-- Fonctions référencées, confirmées présentes avec la même signature sur cette branche :
-- `public.a_permission(uuid, text)`, `public.est_employe_paie_courant(uuid, uuid)`.
--
-- Additif : remplace uniquement la définition de la policy `documents_paie_select`
-- (drop + create, comportement/périmètre inchangé), ne touche ni `documents_paie_insert` ni
-- `documents_paie_delete` (déjà bornées par `a_permission()` seul, sans le motif à risque).

begin;

drop policy if exists documents_paie_select on storage.objects;
create policy documents_paie_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'documents-paie'
    and (
      public.a_permission(
        ((storage.foldername(name))[1])::uuid,
        'voir_paie_confidentielle'
      )
      or public.a_permission(
        ((storage.foldername(name))[1])::uuid,
        'gerer_paie'
      )
      or exists (
        select 1
        from public.pieces_jointes_paie pj
        where pj.storage_path = name
          and public.est_employe_paie_courant(
            pj.entreprise_id,
            pj.employe_id
          )
      )
    )
  );

commit;
