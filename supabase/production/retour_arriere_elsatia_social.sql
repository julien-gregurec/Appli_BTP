-- Retour arrière de la migration 20261003000184_elsatia_social.
--
-- À utiliser UNIQUEMENT si la migration a échoué à mi-parcours ou si le module
-- doit être retiré AVANT toute donnée réelle. Toutes les données ELSATIA Social
-- (publications, jetons, journal) sont supprimées. Une fois des comptes connectés
-- ou des publications envoyées, préférer une migration corrective (voir
-- docs/DEPLOIEMENT_ET_RETOUR_ARRIERE.md).
--
-- Pendant une connexion active, révoquer d'abord les comptes depuis l'interface
-- (révocation côté Meta et LinkedIn), sinon les autorisations restent chez les plateformes.

begin;

drop table if exists public.social_audit, public.social_quotas, public.social_webhook_evenements,
  public.social_messages, public.social_commentaires, public.social_abonnes, public.social_statistiques,
  public.social_publication_cibles, public.social_publication_medias, public.social_publications,
  public.social_medias, public.social_connexions_en_attente, public.social_identifiants,
  public.social_comptes, public.social_parametres, public.social_membres;

drop function if exists public.social_audit_ajout_seul(), public.social_touch_updated_at(),
  public.social_consommer_quota(text, integer, integer), public.social_verrouiller_cible(uuid),
  public.social_publications_garde_fou(), public.social_role_courant(), public.social_role_de(text);

-- Le bucket privé social-medias est conservé : Supabase interdit sa suppression
-- en SQL (storage.protect_delete). Le supprimer, si besoin, depuis Storage dans le
-- tableau de bord après l'avoir vidé. Une nouvelle application de la migration le
-- réutilise sans erreur (on conflict).

-- Ligne du ledger, pour que la migration puisse être rejouée ensuite.
delete from supabase_migrations.schema_migrations where version = '20261003000184';

commit;
