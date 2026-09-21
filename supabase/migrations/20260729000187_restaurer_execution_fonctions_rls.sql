-- Phase 1 commercialisation :
-- restaure uniquement l'exécution des fonctions appelées directement par les
-- politiques RLS. La fermeture globale des fonctions SECURITY DEFINER avait
-- retiré ces droits sans les réattribuer à authenticated, ce qui empêchait
-- PostgreSQL d'évaluer les politiques concernées.

grant execute on function public.est_membre_actif(uuid)
  to authenticated;

grant execute on function public.entreprise_sans_membres(uuid)
  to authenticated;

grant execute on function public.peut_voir_document_chantier(uuid)
  to authenticated;

-- Le rôle anonyme reste explicitement exclu.
revoke execute on function public.est_membre_actif(uuid)
  from public, anon;

revoke execute on function public.entreprise_sans_membres(uuid)
  from public, anon;

revoke execute on function public.peut_voir_document_chantier(uuid)
  from public, anon;

notify pgrst, 'reload schema';
