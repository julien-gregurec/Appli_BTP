-- ELSATIA-RESERVES-PHOTOS-IMMUABLES-V1
--
-- Rendre EXPLICITE la garantie « une photo de réserve déposée ne peut être ni
-- écrasée ni effacée depuis l'application ».
--
-- ÉTAT AVANT CETTE MIGRATION. La garantie tenait déjà, mais par ABSENCE : aucune
-- policy permissive ne couvrait `reserves-photos` en `delete` ni en `update`, et
-- PostgreSQL refuse donc l'opération faute de policy autorisante. La protection
-- reposait ainsi sur ce que le ledger ne contient pas — c'est-à-dire sur le fait
-- que personne n'ajoute un jour une policy permissive large. Les deux policies
-- restrictives existantes (`role_gestion_fichiers_delete` avec son `else true`,
-- `colors_photos_delete_signature_gate_v12` avec son `bucket_id <> colors-seaux`)
-- ne protègent PAS ce bucket : étant restrictives, leur rôle est de ne pas gêner
-- les autres buckets, pas d'en autoriser un.
--
-- Une garantie de produit ne doit pas dépendre d'une absence. Cette migration
-- l'écrit : deux policies RESTRICTIVES qui, quoi qu'on ajoute plus tard, ferment
-- la suppression et la réécriture des objets de `reserves-photos`.
--
-- Ce qu'elle ne fait PAS : elle ne touche ni au dépôt (`insert`) ni à la lecture
-- (`select`), qui restent gouvernés par `reserves_storage_photo_autorisee()`.
-- Aucun code applicatif ne supprime de photo de réserve — vérifié sur les quatre
-- applications — donc rien ne régresse.

begin;

-- Restrictive : elle s'ajoute en ET à toute policy permissive présente ou future.
-- Aucune suppression n'est donc possible dans ce bucket, quelle que soit la policy
-- permissive qu'un lot ultérieur viendrait à écrire.
drop policy if exists reserves_photos_jamais_supprimables on storage.objects;
create policy reserves_photos_jamais_supprimables on storage.objects
  as restrictive for delete to authenticated
  using (bucket_id <> 'reserves-photos');

-- Même raisonnement pour la réécriture : un fichier de preuve dont on peut changer
-- le contenu n'est plus une preuve.
drop policy if exists reserves_photos_jamais_reecrites on storage.objects;
create policy reserves_photos_jamais_reecrites on storage.objects
  as restrictive for update to authenticated
  using (bucket_id <> 'reserves-photos')
  with check (bucket_id <> 'reserves-photos');

-- Pas de `comment on policy` ici, et c'est délibéré : commenter un objet exige d'en
-- être PROPRIÉTAIRE, or `storage.objects` appartient à `supabase_storage_admin` sur une
-- pile Supabase réelle. Créer une policy ne le demande pas — la commenter, si. Cette
-- migration échouait donc sur une vraie pile tout en passant sur un conteneur PostgreSQL
-- nu, où le prélude de recette crée la table sous un autre rôle. La justification vit
-- dans l'en-tête de ce fichier, qui n'a pas ce défaut.

commit;
