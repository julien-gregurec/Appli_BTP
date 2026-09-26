-- Correctif : public.devis.client_id ne vérifiait jamais que le client référencé appartient
-- à la même entreprise que le devis lui-même. Contrairement à devis.chantier_id, déjà
-- protégé depuis la migration 20260710000020 par une clé étrangère composite
-- (devis_chantier_entreprise_fkey), devis.client_id ne disposait que d'une clé étrangère
-- simple vers clients(id) et la policy RLS "membres devis" (PERMISSIVE, FOR ALL) ne
-- contrôle que est_membre_actif(entreprise_id) — jamais la cohérence de client_id.
--
-- La RLS protège l'appartenance de la ligne elle-même, pas l'intégrité de ses relations :
-- ce sont deux garanties distinctes. Ici, aucune des deux protections structurelles
-- (contrainte, policy WITH CHECK) ne couvrait client_id, et les fonctions RPC
-- creer_devis_brouillon / modifier_devis_brouillon (security invoker, donc soumises à la
-- RLS de l'appelant) écrivent client_id sans validation propre : elles héritent
-- silencieusement de cette même lacune. Le chemin d'exploitation n'est donc pas limité à un
-- appel direct à l'API REST Supabase : le formulaire normal de création/modification de
-- devis (Server Actions creerDevisAction / modifierDevisAction) peut l'atteindre.
--
-- Correctif : ajout d'une clé étrangère composite (client_id, entreprise_id) vers
-- (id, entreprise_id) de clients, sur le modèle exact déjà en place pour chantier_id.
-- L'index unique requis (clients_id_entreprise_unique) existe déjà. Aucune donnée
-- existante n'est incohérente (vérifié avant application). client_id reste NOT NULL :
-- la contrainte s'applique donc à chaque ligne, sans cas particulier NULL à gérer.
--
-- Aucune policy RLS n'est modifiée par cette migration. La clé étrangère simple existante
-- (devis_client_id_fkey) est volontairement conservée : cette migration est additive.
--
-- Hors périmètre de ce correctif (nécessite une décision et une autorisation séparées) :
-- des devis existent légitimement avec un client différent du client actuel de leur
-- chantier (transfert de chantier vers un nouveau client, chantier_transferts) — ce n'est
-- pas une incohérence inter-entreprises et ce correctif ne s'en préoccupe pas.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'devis_client_entreprise_fkey'
  ) then
    alter table public.devis
      add constraint devis_client_entreprise_fkey
      foreign key (client_id, entreprise_id)
      references public.clients(id, entreprise_id);
  end if;
end $$;
