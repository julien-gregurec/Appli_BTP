-- Le journal IA peut contenir des métadonnées et erreurs propres aux entreprises.
-- Un administrateur plateforme ne doit pas lire ces données par défaut.

drop policy if exists "journal_ia_select" on public.journal_ia;

create policy "journal_ia_select"
  on public.journal_ia
  for select
  to authenticated
  using (
    utilisateur_id = auth.uid()
    or (
      public.est_membre_actif(entreprise_id)
      and public.a_permission(entreprise_id, 'gerer_parametres')
    )
  );

notify pgrst, 'reload schema';
