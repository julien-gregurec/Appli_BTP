-- Autorise le gestionnaire du devis à relire le fichier juste téléversé avant
-- que sa ligne de métadonnées ne soit créée. Sans cette branche, la
-- finalisation était circulaire : la lecture exigeait déjà la métadonnée que
-- la finalisation devait précisément enregistrer.
drop policy if exists devis_medias_lecture on storage.objects;
create policy devis_medias_lecture on storage.objects
  for select to authenticated using(
    bucket_id = 'devis-medias'
    and (
      exists(
        select 1
        from public.pieces_jointes_devis p
        where p.storage_path = name
          and public.peut_lire_devis(p.devis_id)
      )
      or (
        public.est_membre_actif(((storage.foldername(name))[1])::uuid)
        and public.a_permission(
          ((storage.foldername(name))[1])::uuid,
          'gerer_devis'
        )
      )
    )
  );

notify pgrst, 'reload schema';
