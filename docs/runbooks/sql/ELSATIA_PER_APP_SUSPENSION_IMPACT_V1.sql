-- ELSATIA — Per-App Commercial Suspension V1 : rapport d'impact AVANT migration.
-- (docs/qualification/ELSATIA_PER_APP_COMMERCIAL_SUSPENSION_V1.md §11)
--
-- À exécuter en LECTURE SEULE sur la base cible AVANT d'appliquer
-- 20260928000804_per_app_commercial_suspension_v1.sql. Liste les comptes dont le
-- comportement CHANGERA. Par construction, la migration ne retire aucun droit :
--   - toutes les lignes existantes reçoivent statut_commercial = 'entitled' ;
--   - aucune suspension globale n'est posée ;
-- donc les seuls changements sont des GAINS : une application non GP autorisée,
-- aujourd'hui fermée PARCE QUE Gestion Pro est fermé (impayé, annulation, essai expiré,
-- suspension programmée échue), redevient accessible. La migration écrit le même
-- résultat dans public.rapport_migration_suspension_par_app_v1 et échoue si une perte
-- est détectée.
--
-- Chaque ligne est à revoir par le propriétaire : si la fermeture GP était en réalité
-- une mesure de sécurité, poser une suspension GLOBALE explicite
-- (plateforme_suspendre_compte_global) APRÈS la migration.

begin transaction read only;

with droits as (
  select ae.entreprise_id, ae.application_code,
         ae.autorise and a.actif
           and (ae.valide_du is null or ae.valide_du <= now())
           and (ae.valide_jusqu_au is null or ae.valide_jusqu_au > now()) as droit_ouvert
  from public.acces_applications_entreprises ae
  join public.applications_elsatia a on a.code = ae.application_code
  where ae.application_code <> 'gestion_pro'
),
gp as (
  select e.id, e.nom, e.abonnement_statut, e.suspension_prevue_at, e.abonnement_essai_fin,
         case
           when e.abonnement_statut = 'annule' then 'annule'
           when e.abonnement_statut = 'suspendu' then 'suspendu'
           when e.suspension_prevue_at is not null and e.suspension_prevue_at <= now() then 'impaye_echu'
           when e.abonnement_statut = 'essai'
                and coalesce(e.abonnement_essai_fin, e.abonnement_essai_debut + 30) < (now() at time zone 'utc')::date
             then 'essai_expire'
         end as fermeture_gp
  from public.entreprises e
)
select gp.id as entreprise_id, gp.nom, d.application_code, gp.fermeture_gp,
       'gain_acces'::text as changement,
       (select count(*) from public.habilitations_applications_utilisateurs h
         where h.entreprise_id = gp.id and h.application_code = d.application_code and h.autorise) as utilisateurs_habilites,
       case when d.application_code = 'reserves' then (
         select count(*) from public.reserves_intervenants i
         where i.entreprise_id = gp.id and i.statut = 'active' and i.entreprise_intervenante_id is not null)
       end as intervenants_reserves_repassant_en_ecriture
from gp
join droits d on d.entreprise_id = gp.id and d.droit_ouvert
where gp.fermeture_gp is not null
order by gp.nom, d.application_code;

-- Synthèse.
select fermeture_gp, application_code, count(*) as comptes
from (
  select e.id,
         case
           when e.abonnement_statut = 'annule' then 'annule'
           when e.abonnement_statut = 'suspendu' then 'suspendu'
           when e.suspension_prevue_at is not null and e.suspension_prevue_at <= now() then 'impaye_echu'
           when e.abonnement_statut = 'essai'
                and coalesce(e.abonnement_essai_fin, e.abonnement_essai_debut + 30) < (now() at time zone 'utc')::date
             then 'essai_expire'
         end as fermeture_gp
  from public.entreprises e
) g
join public.acces_applications_entreprises ae on ae.entreprise_id = g.id and ae.application_code <> 'gestion_pro'
join public.applications_elsatia a on a.code = ae.application_code and a.actif
where g.fermeture_gp is not null and ae.autorise
  and (ae.valide_du is null or ae.valide_du <= now())
  and (ae.valide_jusqu_au is null or ae.valide_jusqu_au > now())
group by 1, 2
order by 1, 2;

rollback;
