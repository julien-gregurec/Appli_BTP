-- PIECES-JOINTES-V1 : angle mort RLS decouvert lors de l'audit transverse des pieces jointes.
--
-- Les policies "role_gestion_fichiers_insert/update/delete" (RESTRICTIVE, ajoutees plus tard
-- que les buckets eux-memes) narrows correctement INSERT/UPDATE/DELETE sur documents-employes/
-- factures-fournisseurs/pointage-preuves a la permission metier (gerer_employes/gerer_achats/
-- gerer_pointage). Mais aucune policy RESTRICTIVE equivalente n'existe pour SELECT : la lecture
-- (donc la generation de signed URL, utilisee par toutes les routes /api/.../route.ts de ce
-- depot) ne depend encore que de la vieille policy PERMISSIVE "membres X" (est_membre_actif
-- seul). Consequence reelle et confirmee en base live : n'importe quel membre actif de
-- l'entreprise peut lire/telecharger directement (via l'API Storage, sans passer par l'app)
-- la carte BTP, la signature dessinee de n'importe quel salarie (documents-employes), les
-- factures fournisseurs (factures-fournisseurs) et les preuves de pointage (pointage-preuves)
-- d'un autre salarie, sans avoir la permission gerer_employes/gerer_achats/gerer_pointage.
--
-- Cas particulier : la PHOTO d'employe est un cas legitime de lecture ouverte a tout membre
-- actif (affichee dans l'annuaire/la fiche interne, cf. src/app/(app)/employes/[id]/page.tsx)
-- -- volontairement PAS restreinte ici, seules carte_btp/signature (documents sensibles) le
-- sont, via une fonction dediee qui distingue les 3 types de documents stockes dans le meme
-- bucket "documents-employes".

create or replace function public.peut_lire_document_employe_sensible(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when e.photo_storage_path = p_path then true
    when e.carte_btp_storage_path = p_path or e.signature_storage_path = p_path then
      public.a_permission(e.entreprise_id, 'gerer_employes') or e.utilisateur_id = auth.uid()
    else false
  end
  from public.employes e
  where e.photo_storage_path = p_path
     or e.carte_btp_storage_path = p_path
     or e.signature_storage_path = p_path
  limit 1
$$;

revoke all on function public.peut_lire_document_employe_sensible(text) from public, anon;
grant execute on function public.peut_lire_document_employe_sensible(text) to authenticated;

drop policy if exists role_gestion_fichiers_select on storage.objects;
create policy role_gestion_fichiers_select on storage.objects as restrictive for select to authenticated
using(
  case bucket_id
    when 'documents-employes' then public.peut_lire_document_employe_sensible(name)
    when 'factures-fournisseurs' then public.a_permission(((storage.foldername(name))[1])::uuid, 'gerer_achats')
    when 'pointage-preuves' then public.a_permission(((storage.foldername(name))[1])::uuid, 'gerer_pointage')
    else true
  end
);

notify pgrst, 'reload schema';
