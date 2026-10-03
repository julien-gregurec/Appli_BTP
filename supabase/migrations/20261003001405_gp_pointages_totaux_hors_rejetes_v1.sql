-- ELSATIA GP BUSINESS HARDENING V9.1 — portage sémantique de la recette métier GP
-- (source : claude/loving-heisenberg-ygkjck, rapport ELSATIA_GP_END_TO_END_BUSINESS_ACCEPTANCE_V1.md).
-- Rapport : docs/qualification/ELSATIA_GP_BUSINESS_HARDENING_V9_1.md — témoin : supabase/tests/gp_business_hardening_v9_1.test.sql
--
-- B37 : « Total par employé » (gestion des pointages) comptait les pointages
-- rejetés (19 h affichées pour 7 h retenues). Règle minimale sûre : un rejeté
-- ne compte jamais. « À vérifier » reste compté (PENDING vs VALIDATED :
-- DECISION_REQUIRED, non tranché).

CREATE OR REPLACE FUNCTION public.pointages_gestion_totaux_mois(p_entreprise_id uuid, p_debut date, p_fin date)
 RETURNS TABLE(employe_id uuid, prenom text, nom text, nb_pointages bigint, heures_normales numeric, heures_supplementaires numeric, heures_total numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_entreprise_id is null or p_debut is null or p_fin is null then
    raise exception 'POINTAGES_TOTAUX_PARAMETRES' using errcode = '22023';
  end if;
  if p_fin < p_debut or p_fin - p_debut > 366 then
    raise exception 'POINTAGES_TOTAUX_PERIODE' using errcode = '22023';
  end if;
  if auth.uid() is null or not public.est_membre_actif(p_entreprise_id) then
    raise exception 'POINTAGES_TOTAUX_REFUSES' using errcode = '42501';
  end if;

  -- MATERIALIZED : sans lui, le planner pousse le filtre de visibilité (qui ne
  -- porte que sur la colonne de regroupement) dans le parcours des pointages,
  -- et l'évalue de nouveau ligne à ligne (mesuré : 21 s à 20 000 pointages).
  return query
  with agregat as materialized (
    select p.employe_id,
           count(*) as nb,
           sum(p.heures_normales) as hn,
           sum(p.heures_supplementaires) as hs
    from public.pointages p
    where p.entreprise_id = p_entreprise_id
      and p.date between p_debut and p_fin
      -- B37 : un pointage rejeté n'est pas du temps travaillé.
      and p.verification_statut is distinct from 'rejete'
    group by p.employe_id
  )
  select a.employe_id, e.prenom, e.nom, a.nb, a.hn, a.hs, a.hn + a.hs
  from agregat a
  join public.employes e on e.id = a.employe_id and e.entreprise_id = p_entreprise_id
  where public.peut_consulter_pointage_employe(p_entreprise_id, a.employe_id)
  order by e.nom, e.prenom, a.employe_id;
end;
$function$;
