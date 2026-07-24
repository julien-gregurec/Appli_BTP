-- 20260717000096_collaboration_appels_offres_doe.sql (posterieure au verrouillage
-- anonyme du 2026-07-14) a copie-colle le motif "prototype" pre-verrouillage sur
-- 6 tables + 1 bucket de stockage : appels_offres, fiches_techniques_articles,
-- doe_generations, connexions_email (references de secrets OAuth), emails_chantier,
-- ecritures_comptables_importees, et le bucket storage "fiches-techniques".
-- Verifie en direct via curl avec la cle anon publique : les 6 tables retournaient
-- des donnees reelles sans aucune authentification, tous tenants confondus.
--
-- Cette migration retire l'acces anonyme, meme motif que 20260724000146 (boutique).

drop policy if exists appels_offres_prototype on public.appels_offres;
drop policy if exists fiches_techniques_prototype on public.fiches_techniques_articles;
drop policy if exists fiches_techniques_storage_prototype on storage.objects;
drop policy if exists doe_prototype on public.doe_generations;
drop policy if exists connexions_email_prototype on public.connexions_email;
drop policy if exists emails_chantier_prototype on public.emails_chantier;
drop policy if exists ecritures_import_prototype on public.ecritures_comptables_importees;

revoke all on public.appels_offres from anon;
revoke all on public.fiches_techniques_articles from anon;
revoke all on public.doe_generations from anon;
revoke all on public.connexions_email from anon;
revoke all on public.emails_chantier from anon;
revoke all on public.ecritures_comptables_importees from anon;

notify pgrst, 'reload schema';
