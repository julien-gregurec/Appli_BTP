-- GP-EXTERNAL-PILOT-CLOSURE-V1 — vue annuaire à colonnes réduites pour
-- `employes` (mission §16).
--
-- Constat : la policy "membres accedent aux employes" (FOR ALL) laisse
-- N'IMPORTE QUEL membre actif lire TOUTES les colonnes de TOUS les employés
-- de l'entreprise, y compris taux_horaire/cout_horaire (paie), email/
-- telephone (coordonnées personnelles) et notes (potentiellement RH
-- sensibles) — confirmé : aucune restriction de colonne n'a jamais été
-- ajoutée depuis la création de la table, seules des restrictions
-- d'écriture (INSERT/UPDATE/DELETE) existent (20260713000043).
--
-- Correctif appliqué CE SOIR (sûr, additif, ne change AUCUN comportement
-- existant) : une vue `employes_annuaire`, colonnes réduites à ce que
-- pointage/planning/devis/interventions lisent réellement (id, prenom, nom,
-- poste, statut, type_contrat, dates d'entrée/sortie, reference_interne),
-- à substituer progressivement aux lectures directes de `employes` qui n'ont
-- besoin que de l'identité. `security_invoker = true` : la RLS de la table de
-- base continue de s'appliquer normalement (aucun contournement).
--
-- NON fait ce soir, à traiter dans un lot dédié (trop de points de lecture
-- pour être audités un par un cette nuit sans risque de casser pointage/
-- planning, qui lisent parfois des colonnes plus larges via `select *`) :
-- restreindre la policy SELECT de la table `employes` elle-même pour exiger
-- une permission (ex. `gerer_employes`/`voir_couts_horaires`) sur les
-- colonnes sensibles, et migrer chaque appelant identifié vers cette vue
-- (ou une RPC dédiée) avant de fermer l'accès direct. Ce point reste donc
-- OUVERT — cette vue est la fondation du correctif complet, pas sa clôture.
create or replace view public.employes_annuaire
with (security_invoker = true) as
select
  id, entreprise_id, reference_interne, prenom, nom, poste,
  type_contrat, statut, date_entree, date_sortie, created_at, updated_at
from public.employes;

comment on view public.employes_annuaire is
  'Annuaire employés à colonnes réduites (identité + poste + statut, sans taux/coût horaire, coordonnées ni notes). security_invoker : la RLS de public.employes s''applique normalement. À utiliser pour tout affichage qui n''a besoin que de l''identité (pointage, planning, sélecteurs) — voir 20260922000312 pour le contexte et ce qui reste à faire.';

grant select on public.employes_annuaire to authenticated;

notify pgrst, 'reload schema';
