-- ═══════════════════════════════════════════════════════════════════════════
-- ELSATIA — TRAIN CANONIQUE V8 : CONVERGENCE MODE SÛR × LOTS POST-V7 (V1)
--
-- Rapport : docs/qualification/ELSATIA_CANONICAL_TRAIN_V8_CONVERGENCE_V1.md (§4).
--
-- Migration propre au train V8 (aucune migration de lot modifiée). Elle résout deux
-- interactions entre lots qualifiés séparément sur V6 :
--
-- 1. Gardes du mode sûr sur les tables créées APRÈS la migration Incident.
--    `20260928000807_incident_safe_mode_v1` installe `incident_garde_ecriture` sur chaque
--    table du schéma public EXISTANTE et exige que toute migration qui crée une table
--    rappelle `incident_installer_gardes()` (pgTAP incident_safe_mode_v1, test 23). Les
--    Lots 8 (…0809) et 9 (…0810), qualifiés sans le lot Incident, créent 4 tables
--    (tools_releves_metre_ajustements, tools_releves_ouvrages,
--    tools_releves_ouvrages_bibliotheque, tools_releves_quantitatif_ajustements) qui
--    resteraient écrivables en lecture seule. Preuve : sur le train V8 sans cette
--    migration, le test 23 échoue (have: 4, want: 0).
--
-- 2. Portée des tables de l'état commercial PAR APPLICATION (Per-App Suspension, …0804).
--    `incident_application_table` range toute table inconnue dans `gestion_pro`. Or
--    `evenements_commerciaux_applications` (webhooks d'application Colors / Réserves /
--    Tools) et `rapport_migration_suspension_par_app_v1` portent l'état commercial de
--    TOUTES les applications : une lecture seule limitée à Gestion Pro y bloquerait la
--    synchronisation commerciale des autres applications, contraire à la règle Per-App
--    (« un incident GP ne coupe que GP »). Elles rejoignent le socle partagé, gelé
--    uniquement par la portée globale, comme `acces_applications_entreprises`.
--
-- Additive : aucune donnée lue ni écrite ; seules la fonction de classement (IMMUTABLE,
-- aucun rôle d'API) et les triggers de garde sont (ré)installés. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.incident_application_table(p_table text)
returns text language sql immutable set search_path = public as $$
  select case
    when p_table like 'reserves\_%' or p_table = 'reserves' then 'reserves'
    when p_table like 'studio\_%' then 'studio'
    when p_table like 'tools\_%' then 'tools'
    when p_table like 'colors\_%' or p_table = 'article_teintes' then 'colors'
    when p_table in ('entreprises','utilisateurs','utilisateurs_entreprises','applications_elsatia',
                     'acces_applications_entreprises','habilitations_applications_utilisateurs',
                     'roles_applications_elsatia','entitlements_utilisateurs_elsatia',
                     'historique_entitlements_elsatia','historique_acces_applications',
                     'abonnement_evenements','abonnements_entreprises','factures_abonnement',
                     'contrats_abonnement','historique_contrats_abonnement','plans_abonnement',
                     'options_abonnement_entreprises','modules_entreprises','historique_modules_entreprises',
                     'stripe_webhook_events','stripe_evenements_ordre','stripe_objets_ordre',
                     'stripe_subscriptions_remplacees','stripe_essai_ecarts','operations_capacite_stripe',
                     'communications','communications_audiences','communications_journal',
                     'communications_lectures','communications_pieces_jointes','communications_preferences',
                     'support_messages','notifications_utilisateurs','push_abonnements',
                     'preferences_notifications_push',
                     -- Convergence V8 : état commercial PAR APPLICATION (Per-App Suspension, …0804).
                     'evenements_commerciaux_applications','rapport_migration_suspension_par_app_v1')
      or p_table like 'plateforme\_%' or p_table like 'assistance\_%' then 'socle'
    else 'gestion_pro'
  end;
$$;
revoke all on function public.incident_application_table(text) from public, anon, authenticated, service_role;

-- Réinstalle la garde sur chaque table du schéma public (tables Lots 8 et 9 comprises) avec
-- le classement ci-dessus. Idempotent (drop + create par table).
select public.incident_installer_gardes();
