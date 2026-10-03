-- PROPOSITION de régularisation PRÉ-CUTOVER (UPG-P1-1) — NE PAS EXÉCUTER sans décision écrite du propriétaire.
-- Jamais exécutée par ce dépôt sur la Production ; le harnais l'applique UNIQUEMENT à une copie locale jetable
-- pour prouver qu'elle rend l'upgrade sans perte d'accès (docs/qualification/ELSATIA_PRODUCTION_UPGRADE_HARNESS_V1.md).
--
-- Problème : une entreprise en statut 'essai' sans fin d'essai (antérieure à 231) reçoit de 20260816000204
-- fin = création + 30 j (passée) ; 20260928000803 coupe alors l'accès en base au premier instant de l'upgrade.
-- Option A (ci-dessous) : ouvrir une fenêtre d'essai de 30 jours À COMPTER DU CUTOVER (aucune perte d'accès
--   immédiate ; le cycle Stripe normal prend ensuite le relais). Compatible avec la contrainte 204 (fin = debut + 30).
-- Option B (alternative, non scriptée) : passer en 'actif' les entreprises internes / payantes hors Stripe
--   (ex. entreprise réelle ELSATIA), décision au cas par cas.
-- Préalable obligatoire : la liste exacte (sonde production_readonly_probe.sql §2 bis) validée ligne à ligne.
begin;
update public.entreprises
   set abonnement_essai_debut = current_date,
       abonnement_essai_fin = current_date + 30
 where abonnement_statut = 'essai' and abonnement_essai_fin is null
   and coalesce(abonnement_essai_debut, created_at::date) + 30 < current_date;
commit;
