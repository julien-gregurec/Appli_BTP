-- Correctif : public.relances_impayes.facture_id ne vérifiait jamais que la facture
-- référencée appartient à la même entreprise que la relance elle-même. Les policies RLS
-- "gestion_insert"/"gestion_update" (migration 20260715000080, PERMISSIVE, WITH CHECK
-- a_permission(entreprise_id,'gerer_crm')) protègent uniquement l'appartenance de la ligne
-- elle-même — un gestionnaire de l'entreprise A peut créer ou faire pointer une relance de A
-- vers une facture de B, la clé étrangère simple existante (facture_id -> factures(id)) ne
-- vérifiant que l'existence de la ligne, jamais son entreprise propriétaire.
--
-- relances_impayes autorise l'écriture directe sous authenticated (contrairement à des
-- tables sans aucune policy d'écriture) : la seule protection réelle était applicative
-- (Server Action creerRelanceAction, qui relit la facture filtrée par ctx.entrepriseId avant
-- insertion) — contournable par un appel direct à l'API REST ou SQL Supabase avec le même
-- jeton de session.
--
-- Correctif : ajout d'une clé étrangère composite (facture_id, entreprise_id) vers
-- (id, entreprise_id) de factures, sur le modèle déjà en place pour les relations de
-- factures elles-mêmes (migration 20260922000191). L'index unique requis
-- (factures_id_entreprise_unique) a été créé par cette même migration. facture_id reste NOT
-- NULL (vérifié sur supabase/migrations/20260715000080_suite_metier_complete.sql) : la
-- contrainte s'applique donc à chaque ligne, sans cas particulier NULL à gérer.
--
-- Aucune policy RLS n'est modifiée par cette migration.
--
-- Porté depuis integration/gp-external-pilot-closure-v1 (ancêtre du commit 8f5fca1, 0747237,
-- migration source 20260806000199_correctif_isolation_relances_impayes.sql).

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'relances_impayes_facture_entreprise_fkey'
  ) then
    alter table public.relances_impayes
      add constraint relances_impayes_facture_entreprise_fkey
      foreign key (facture_id, entreprise_id)
      references public.factures(id, entreprise_id);
  end if;
end $$;
