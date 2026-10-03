-- ELSATIA Social : exécution d'une demande de suppression de données d'un tiers
-- (personne ayant commenté ou écrit à une page ELSATIA), conformément à
-- docs/juridique/suppression-donnees-comptes-connectes.md (page /suppression-donnees).
--
-- Usage (éditeur SQL du projet ciblé, après avoir vérifié le nom du projet) :
--   1. Renseigner :reseau et :auteur_id (identifiant fourni par la plateforme,
--      visible dans /plateforme/social/commentaires ou /messages) ;
--   2. Exécuter d'abord la partie « Aperçu », vérifier les lignes ;
--   3. Exécuter la transaction de suppression ; confirmer par e-mail au demandeur.
-- Le journal social_audit (ajout seul) trace la suppression sans recopier les contenus.
--
-- psql : psql -v reseau=facebook -v auteur_id=1234567890 -f supprimer_donnees_tiers_elsatia_social.sql

-- Aperçu
select 'commentaire' as type, id, reseau, auteur_nom, left(contenu, 80) as extrait, publie_externe_at
from public.social_commentaires where reseau = :'reseau' and auteur_external_id = :'auteur_id'
union all
select 'message', id, reseau, auteur_nom, left(contenu, 80), envoye_externe_at
from public.social_messages where reseau = :'reseau' and auteur_external_id = :'auteur_id';

begin;

with commentaires as (
  delete from public.social_commentaires
  where reseau = :'reseau' and auteur_external_id = :'auteur_id'
  returning id
), conversations as (
  select distinct external_conversation_id from public.social_messages
  where reseau = :'reseau' and auteur_external_id = :'auteur_id'
), messages as (
  -- Toute la conversation (messages reçus et réponses ELSATIA) est supprimée.
  delete from public.social_messages m
  using conversations c
  where m.reseau = :'reseau' and m.external_conversation_id = c.external_conversation_id
  returning m.id
), evenements as (
  -- Notifications techniques contenant l'identifiant de l'auteur.
  delete from public.social_webhook_evenements
  where fournisseur = case when :'reseau' = 'linkedin' then 'linkedin' else 'meta' end
    and payload::text like '%"' || :'auteur_id' || '"%'
  returning id
)
insert into public.social_audit (acteur, action, reseau, details)
select 'operateur-rgpd', 'donnees_tiers_supprimees', :'reseau',
       jsonb_build_object('commentaires', (select count(*) from commentaires),
                          'messages', (select count(*) from messages),
                          'notifications', (select count(*) from evenements));

commit;
