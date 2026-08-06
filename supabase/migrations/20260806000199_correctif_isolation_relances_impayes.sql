-- Correctif : public.relances_impayes.facture_id ne vérifiait jamais que la facture
-- référencée appartient à la même entreprise que la relance elle-même. La policy RLS
-- "gestion_insert" (PERMISSIVE, WITH CHECK a_permission(entreprise_id,'gerer_crm')) et
-- "gestion_update" (même contrôle) protègent uniquement l'appartenance de la ligne
-- elle-même — un gestionnaire de l'entreprise A peut créer ou faire pointer une relance
-- de A vers une facture de B, la contrainte factures_id_fkey (FK simple vers factures(id))
-- ne vérifiant que l'existence de la ligne, jamais son entreprise propriétaire.
--
-- Contrairement à public.pieces_jointes_devis (aucune policy d'écriture, blocage total),
-- relances_impayes autorise l'écriture directe sous authenticated : la seule protection
-- réelle était applicative (Server Action creerRelanceAction, qui relit la facture filtrée
-- par ctx.entrepriseId avant insertion) — contournable par un appel direct à l'API REST ou
-- SQL Supabase avec le même jeton de session.
--
-- Correctif : ajout d'une clé étrangère composite (facture_id, entreprise_id) vers
-- (id, entreprise_id) de factures, sur le modèle déjà en place pour les relations de
-- factures elles-mêmes (migration 20260806000197). L'index unique requis
-- (factures_id_entreprise_unique) existe déjà. facture_id reste NOT NULL : la contrainte
-- s'applique donc à chaque ligne, sans cas particulier NULL à gérer.
--
-- Aucune policy RLS n'est modifiée par cette migration. Aucune relance réelle n'est
-- déclenchée par cette migration (aucun envoi, aucun webhook).

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
