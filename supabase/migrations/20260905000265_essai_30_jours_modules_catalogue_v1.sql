-- ELSATIA-TRIAL-MODULES-POLICY-CLOSURE-V1
--
-- Constat (recette premier client) : une entreprise en essai sans offre choisie
-- (abonnement_offre IS NULL, l'état normal de toute nouvelle entreprise avant
-- souscription) disposait d'un accès total à absolument toutes les permissions
-- « porte d'entrée » de module, sans aucune borne temporelle ni dérivation du
-- catalogue. Cause exacte : `permissionIncluseDansOffre` (src/lib/tarification.ts)
-- retourne `true` pour TOUTE permission dès que `codeOffre` est vide — un repli
-- délibéré pour ne jamais retirer un droit à un poste (voir permissions.ts), mais
-- que le proxy applicatif (src/lib/supabase/proxy.ts) consommait AUSSI comme
-- porte d'entrée de module, sans jamais retomber sur `acces_module_pour_permission`
-- dans ce cas. Décision produit (ELSATIA-TRIAL-MODULES-POLICY-CLOSURE-V1) :
-- essai = 30 jours calendaires (déjà garanti par entreprises_essai_dates_coherentes
-- et le trigger initialiser_essai_entreprise, inchangés ici), accès pendant l'essai
-- borné aux seuls modules dont `statut_catalogue = 'actif'` — jamais bientot,
-- interne ou non_vendable — dérivé du catalogue, sans liste codée en dur.
--
-- Ce fichier ne modifie AUCUNE migration historique. `tarification.ts` et le
-- comportement de `permissionsUtilisateur()` (filtrage des droits de poste) ne
-- sont PAS touchés : seul le contrat serveur d'entrée de module change, dans
-- proxy.ts (fichier applicatif, hors périmètre SQL) et ici, dans les deux RPC
-- ci-dessous.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. acces_module_pour_permission : ajoute une branche « essai actif », dérivée
--    du catalogue (statut_catalogue = 'actif'), bornée à 30 jours calendaires
--    depuis abonnement_essai_debut si abonnement_essai_fin n'a jamais été
--    renseignée (repli défensif, ne modifie aucune ligne existante). N'élargit
--    jamais l'accès aux modules bientot/interne/non_vendable : la jointure
--    exige toujours statut_catalogue = 'actif', comme la branche entitlement
--    existante ci-dessous, inchangée.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.acces_module_pour_permission(
  p_entreprise_id uuid,
  p_permissions text[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.modules_entreprises me
      join public.modules_gestion_pro m on m.code = me.module_code
      where me.entreprise_id = p_entreprise_id
        and me.actif
        and me.valide_du <= current_date
        and (me.valide_jusqu is null or me.valide_jusqu >= current_date)
        and m.statut_catalogue = 'actif'
        and m.permissions_couvertes && coalesce(p_permissions, '{}')
    )
    or exists (
      select 1
      from public.entreprises e
      join public.modules_gestion_pro m on m.statut_catalogue = 'actif'
      where e.id = p_entreprise_id
        and e.abonnement_statut = 'essai'
        and current_date <= coalesce(
              e.abonnement_essai_fin,
              coalesce(e.abonnement_essai_debut, e.created_at::date) + 30
            )
        and m.permissions_couvertes && coalesce(p_permissions, '{}')
    );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. contexte_abonnement_courant : expose abonnement_essai_debut, nécessaire
--    côté application pour bornir l'essai à 30 jours même quand
--    abonnement_essai_fin est historiquement absente (repli défensif identique
--    à celui du point 1, jamais d'écriture rétroactive).
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.contexte_abonnement_courant();
create function public.contexte_abonnement_courant()
returns table(
  entreprise_id uuid,
  nom text,
  reference_interne text,
  logo_url text,
  abonnement_statut text,
  abonnement_echeance date,
  abonnement_essai_debut date,
  abonnement_essai_fin date,
  suspension_prevue_at timestamptz,
  impaye_message text,
  acces_support boolean
)
language sql security definer stable set search_path=public as $$
  select e.id,e.nom,e.reference_interne,e.logo_url,e.abonnement_statut,
         e.abonnement_echeance,e.abonnement_essai_debut,e.abonnement_essai_fin,
         e.suspension_prevue_at,e.impaye_message,public.est_acces_support_actif(e.id)
  from public.utilisateurs u
  join public.entreprises e on e.id=u.entreprise_active_id
  where u.id=auth.uid();
$$;

revoke all on function public.contexte_abonnement_courant() from public,anon,authenticated;
grant execute on function public.contexte_abonnement_courant() to authenticated;

notify pgrst, 'reload schema';

commit;
