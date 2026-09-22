-- Rend explicites, dans les migrations elles-mêmes, les privilèges de table dont
-- `authenticated` a besoin sur le socle comptes (entreprises/utilisateurs/
-- utilisateurs_entreprises), plutôt que de dépendre implicitement des privilèges par
-- défaut posés hors migrations par la plateforme Supabase à la création du projet.
--
-- ORIGINE : découvert en investiguant `27121d3` (integration/gp-external-pilot-closure-v1,
-- 20260731000192_restaurer_privileges_comptes_entreprises.sql), qui documente qu'une
-- « reconstruction complète » (rejeu de `supabase/migrations/` à partir de zéro) laissait
-- `authenticated` sans aucun privilège SQL sur ces trois tables — tous les comptes étaient
-- renvoyés vers l'onboarding, la RLS n'étant jamais atteinte faute de privilège de table.
--
-- VÉRIFIÉ SUR CETTE BRANCHE (pas rapporté par un tiers) : recherche exhaustive dans
-- `supabase/migrations/` — AUCUNE migration n'accorde explicitement SELECT/INSERT/UPDATE à
-- `authenticated` sur `entreprises`, `utilisateurs` ou `utilisateurs_entreprises` (créées par
-- `20260710000001_comptes_entreprises.sql`, jamais depuis). L'application fonctionne
-- aujourd'hui en production parce que ces privilèges proviennent, comme pour `anon` avant la
-- fermeture du 2026-07-14 (`20260714000078_fermeture_acces_anonyme_production.sql`, dont le
-- commentaire dit explicitement « Toutes les policies et tous les privileges du role anon
-- provenaient du prototype »), d'un privilège par défaut posé par la plateforme Supabase à la
-- création du projet — jamais capturé dans une migration versionnée. Ce n'est donc PAS une
-- faille de sécurité active sur la production actuelle (la RLS de ces tables, déjà en place
-- depuis 20260710000001, reste le contrôle réel), mais un gap de reproductibilité réel : toute
-- reconstruction propre de la base (nouveau projet Supabase, restauration hors du gabarit
-- standard, etc.) perdrait silencieusement l'accès applicatif de base, exactement comme
-- documenté par 27121d3 sur la branche source.
--
-- Additif, sans risque de régression : un GRANT ne peut jamais retirer un accès existant ; la
-- RLS déjà en place sur ces trois tables (`20260710000001`) continue de filtrer chaque requête
-- normalement. Le REVOKE sur `anon` est redondant avec le balayage rétroactif de
-- `20260714000078` (qui couvre déjà ces tables, créées avant cette migration) mais est repris
-- ici pour rendre l'intention explicite, comme sur la branche source.

begin;

grant select, insert, update
  on table
    public.entreprises,
    public.utilisateurs,
    public.utilisateurs_entreprises
  to authenticated;

revoke all
  on table
    public.entreprises,
    public.utilisateurs,
    public.utilisateurs_entreprises
  from anon;

commit;
