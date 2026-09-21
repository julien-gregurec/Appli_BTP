-- Correctif : quatre relations de public.factures ne vérifiaient jamais que la ressource
-- référencée appartient à la même entreprise que la facture elle-même : client_id,
-- devis_origine_id, facture_origine_id, facture_parente_id. Seule chantier_id était déjà
-- protégée par une clé étrangère composite incluant entreprise_id
-- (factures_chantier_entreprise_fkey).
--
-- Les policies RLS de public.factures (PERMISSIVE "membres factures" et RESTRICTIVE
-- "role_gestion_insert"/"role_gestion_update") ne contrôlent que factures.entreprise_id
-- lui-même — elles garantissent qu'un utilisateur écrit bien dans SA propre entreprise,
-- mais ne garantissent jamais que les ressources liées (client, devis, factures
-- d'origine/parente) appartiennent à cette même entreprise. La RLS protège
-- l'appartenance de la ligne, pas l'intégrité de ses relations : ce sont deux garanties
-- distinctes, et seule une contrainte structurelle (clé étrangère) peut garantir la
-- seconde de façon fiable, y compris face à un appel direct à l'API REST Supabase qui
-- contournerait tout contrôle applicatif.
--
-- Correctif : ajout de clés étrangères composites (colonne, entreprise_id) vers
-- (id, entreprise_id) de la table référencée, sur le modèle exact déjà en place pour
-- chantier_id. Les quatre colonnes concernées sont nullables (facture manuelle sans
-- devis, sans facture d'origine, sans facture parente) : une clé étrangère composite
-- n'est jamais vérifiée lorsque l'une de ses colonnes est NULL, donc ces cas restent
-- pleinement fonctionnels sans traitement particulier.
--
-- Aucune policy RLS n'est modifiée par cette migration : la RLS continue de garantir
-- l'appartenance de la ligne elle-même, la nouvelle contrainte garantit la cohérence de
-- ses relations. Les deux mécanismes sont complémentaires, pas redondants.
--
-- Les clés étrangères simples existantes (client_id -> clients(id), etc.) sont
-- volontairement conservées : cette migration est additive.

create unique index if not exists devis_id_entreprise_unique
  on public.devis(id, entreprise_id);

create unique index if not exists factures_id_entreprise_unique
  on public.factures(id, entreprise_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'factures_client_entreprise_fkey'
  ) then
    alter table public.factures
      add constraint factures_client_entreprise_fkey
      foreign key (client_id, entreprise_id)
      references public.clients(id, entreprise_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'factures_devis_origine_entreprise_fkey'
  ) then
    alter table public.factures
      add constraint factures_devis_origine_entreprise_fkey
      foreign key (devis_origine_id, entreprise_id)
      references public.devis(id, entreprise_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'factures_facture_origine_entreprise_fkey'
  ) then
    alter table public.factures
      add constraint factures_facture_origine_entreprise_fkey
      foreign key (facture_origine_id, entreprise_id)
      references public.factures(id, entreprise_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'factures_facture_parente_entreprise_fkey'
  ) then
    alter table public.factures
      add constraint factures_facture_parente_entreprise_fkey
      foreign key (facture_parente_id, entreprise_id)
      references public.factures(id, entreprise_id);
  end if;
end $$;
