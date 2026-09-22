-- Ferme un angle mort RLS réel sur la LECTURE des documents RH/fournisseurs/pointage
-- sensibles. Porté depuis integration/gp-external-pilot-closure-v1 (commit a67ceab,
-- 20260824000224_pieces_jointes_v1_rls_lecture_sensible.sql), vérifié indépendamment contre le
-- SQL actuel de cette branche.
--
-- VÉRIFIÉ SUR LE SQL ACTUEL DE CETTE BRANCHE (pas rapporté par un tiers) :
-- `20260713000043_permissions_rls_gestion.sql` ajoute des policies RESTRICTIVE
-- (`role_gestion_fichiers_insert/update/delete`) qui bornent correctement l'ÉCRITURE sur les
-- buckets `documents-employes`, `factures-fournisseurs` et `pointage-preuves` à la permission
-- métier (`gerer_employes`/`gerer_achats`/`gerer_pointage`). Mais AUCUNE policy équivalente
-- n'existe pour SELECT sur ces trois buckets (confirmé : recherche exhaustive de
-- `as restrictive for select` sur `storage.objects` dans tout `supabase/migrations/` — rien
-- pour ces trois buckets). La lecture (donc `createSignedUrl`, utilisée par toutes les routes
-- de téléchargement) ne dépend donc encore que des policies PERMISSIVE d'origine
-- (`20260710000033_pointage_preuves.sql`, `20260713000042_carte_btp_employes.sql`,
-- `20260710000037_depenses_actifs_documents.sql`), qui n'exigent que
-- `est_membre_actif(entreprise_id)` — sans aucune permission métier. Conséquence réelle : sur
-- cette branche aujourd'hui, n'importe quel membre actif d'une entreprise peut lire/télécharger
-- directement (via l'API Storage, sans passer par l'UI) la carte BTP ou la signature dessinée
-- de n'importe quel autre salarié de la MÊME entreprise (`employes.carte_btp_storage_path`,
-- `employes.signature_storage_path`, colonnes confirmées présentes —
-- `20260713000042_carte_btp_employes.sql`, `20260717000099_signature_employe.sql`), les
-- factures fournisseurs (`factures-fournisseurs`) et les preuves de pointage
-- (`pointage-preuves`), SANS détenir la permission `gerer_employes`/`gerer_achats`/
-- `gerer_pointage`. C'est une élévation de privilège intra-entreprise réelle (pas
-- cross-tenant : bornée à `est_membre_actif`, mais sans le contrôle de permission métier que
-- l'écriture applique déjà).
--
-- Cas particulier conservé à l'identique (comme sur la branche source) : la PHOTO d'employé
-- (`employes.photo_storage_path`, colonne confirmée — `20260716000085_admin_pointage_photos_appareils.sql`)
-- reste volontairement lisible par tout membre actif (annuaire/fiche interne), seules
-- carte_btp/signature sont restreintes, via une fonction dédiée qui distingue les 3 types de
-- documents stockés dans le même bucket `documents-employes`.
--
-- Fonctions référencées, confirmées présentes avec la même signature sur cette branche :
-- `public.a_permission(uuid, text)`, `public.est_membre_actif(uuid)`.
--
-- Additif : ajoute une fonction et remplace une policy RESTRICTIVE inexistante sur cette
-- branche (aucune policy retirée ne fournissait de protection en lecture) — les policies
-- PERMISSIVE existantes ne sont pas modifiées, cette policy RESTRICTIVE vient s'y combiner en
-- ET logique (comportement standard RLS : une policy RESTRICTIVE réduit toujours le périmètre
-- déjà accordé par les policies PERMISSIVE, jamais l'inverse).

begin;

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

commit;
