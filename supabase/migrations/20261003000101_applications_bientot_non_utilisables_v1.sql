-- ELSATIA SATELLITES PREVIEW READINESS V1 — A-05 : une application « bientot » n'est
-- utilisable par personne.
--
-- Constat (ELSATIA_V9_SATELLITE_APPS_PREVIEW_QUALIFICATION_V1, A-05) : un administrateur
-- plateforme — propriétaire ou simple délégué « support » — recevait Drone
-- (statut_produit = 'bientot', aucune URL dans aucun environnement) par
-- `a_acces_application` et `applications_autorisees`. Les trois lanceurs (Gestion Pro,
-- Colors, Réserves) le lui présentaient comme une application à ouvrir (« URL à configurer »).
-- Aucune donnée n'était exposée, mais une application annoncée était présentée comme
-- utilisable.
--
-- Règle produit retenue (ELSATIA_SATELLITES_PREVIEW_READINESS_V2 §A-05) :
--   disponible → ouverte selon les droits ; interne → ouverte selon les droits (c'est le
--   statut d'une application en service restreint, ex. Réserves) ; bientot → annoncée,
--   fermée à tous. Pour ouvrir une application en avant-première, on la passe en « interne ».
--
-- Ce qui ne change PAS :
--   - Drone reste au catalogue (`applications_elsatia`), lisible et administrable par la
--     plateforme (/plateforme/applications) ;
--   - la règle « le propriétaire global accède à toute application active » vaut toujours
--     pour toute application publiée, y compris une application future inconnue
--     (supabase/tests/platform_global_owner_all_apps_v1.test.sql) ;
--   - la branche client est inchangée hormis le même filtre (défense en profondeur : un
--     client ne pouvait déjà pas être habilité sur Drone, faute de rôle) ;
--   - signatures, SECURITY DEFINER, search_path et privilèges : CREATE OR REPLACE à
--     l'identique, aucun GRANT/REVOKE.
-- Corps repris tels qu'en vigueur après 20260928000804 (per_app_commercial_suspension_v1).

create or replace function public.a_acces_application(p_entreprise_id uuid, p_application_code text)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select auth.uid() is not null
    and (
      (
        public.est_plateforme_admin()
        and exists(select 1 from public.applications_elsatia a
                    where a.code=p_application_code and a.actif and a.statut_produit <> 'bientot')
      )
      or (
        p_entreprise_id is not null
        and public.est_membre_plateforme_actif(p_entreprise_id)
        and public.application_commercialement_ouverte(p_entreprise_id, p_application_code)
        and exists(
          select 1 from public.acces_applications_entreprises ae
          join public.applications_elsatia a
            on a.code=ae.application_code and a.actif and a.statut_produit <> 'bientot'
          where ae.entreprise_id=p_entreprise_id
            and ae.application_code=p_application_code
            and ae.autorise
            and (ae.valide_du is null or ae.valide_du<=now())
            and (ae.valide_jusqu_au is null or ae.valide_jusqu_au>now())
        )
        and exists(
          select 1 from public.habilitations_applications_utilisateurs hu
          join public.roles_applications_elsatia r
            on r.application_code=hu.application_code and r.code=hu.role_code and r.actif
          where hu.entreprise_id=p_entreprise_id
            and hu.utilisateur_id=auth.uid()
            and hu.application_code=p_application_code
            and hu.autorise
            and (hu.valide_du is null or hu.valide_du<=now())
            and (hu.valide_jusqu_au is null or hu.valide_jusqu_au>now())
        )
      )
    );
$function$;

create or replace function public.applications_autorisees(p_entreprise_id uuid)
returns table(application_code text, nom text, role_code text, url_locale text, url_preview text,
              url_production text, icone text, est_admin_plateforme boolean)
language sql
stable security definer
set search_path to 'public'
as $function$
  select a.code,a.nom,'administrateur_plateforme_global'::text,
         a.url_locale,a.url_preview,a.url_production,a.icone,true
  from public.applications_elsatia a
  where a.actif and a.statut_produit <> 'bientot' and public.est_plateforme_admin()

  union all

  select a.code,a.nom,hu.role_code,
         a.url_locale,a.url_preview,a.url_production,a.icone,false
  from public.applications_elsatia a
  join public.habilitations_applications_utilisateurs hu
    on hu.application_code=a.code
   and hu.entreprise_id=p_entreprise_id
   and hu.utilisateur_id=auth.uid()
  where not public.est_plateforme_admin()
    and a.statut_produit <> 'bientot'
    and public.a_acces_application(p_entreprise_id,a.code)
  order by 1;
$function$;

comment on function public.a_acces_application(uuid, text) is
  'Décision d''accès applicatif. Une application statut_produit=bientot est fermée à tous, administrateurs plateforme compris (A-05, 20261003000101).';
comment on function public.applications_autorisees(uuid) is
  'Lanceur multi-applications de l''utilisateur courant. Exclut les applications statut_produit=bientot (A-05, 20261003000101).';
