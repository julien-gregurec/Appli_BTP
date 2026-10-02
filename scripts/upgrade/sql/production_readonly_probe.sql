-- ELSATIA — SONDE PRODUCTION EN LECTURE SEULE pour le preflight V9.x (npm run production:v9x:preflight).
--
-- À exécuter PAR L'OPÉRATEUR habilité, hors de tout script de ce dépôt (SQL Editor ou psql en lecture
-- seule), le jour J, AVANT la fenêtre. Ce fichier ne contient QUE des SELECT dans une transaction
-- READ ONLY : il ne peut rien écrire (toute écriture y lève « cannot execute … in a read-only transaction »).
-- Le harnais et le preflight ne s'y connectent JAMAIS : l'opérateur reporte les résultats dans
-- l'attestation JSON (data_preconditions) et exporte le ledger dans un fichier texte.
--
-- Chaque clé « bloquant_* » DOIT valoir 0 ; « info_* » est consignée (changement de données déclaré).
begin transaction read only;
set local statement_timeout = '30s';

-- 1. Ledger (export : une version par ligne, en-tête « # project_ref=<ref> »).
select version from supabase_migrations.schema_migrations order by version;
select count(*) as ledger_versions, max(version) as ledger_max from supabase_migrations.schema_migrations;

-- 2. UPG-P0-2 — 20260816000204 pose CHECK entreprises_essai_dates_coherentes (essai ≤ 30 jours) après un
--    backfill qui ne touche que les lignes où essai_debut OU essai_fin est NULL. Les lignes déjà complètes
--    hors fenêtre (ex. trial_end Stripe écrit par le webhook de Production, essai prolongé à la main)
--    font ÉCHOUER la migration → upgrade arrêté.
select count(*) as bloquant_essai_hors_fenetre
  from public.entreprises
 where (abonnement_essai_debut is not null and abonnement_essai_fin is not null
        and abonnement_essai_fin not between abonnement_essai_debut and abonnement_essai_debut + 30)
    or (abonnement_essai_debut is null and abonnement_essai_fin is not null and abonnement_essai_fin < created_at::date);
--    Lignes dont 204 TRONQUERA rétroactivement la fin d'essai (debut NULL, fin > création + 30) :
select count(*) as info_essai_tronque
  from public.entreprises
 where abonnement_essai_debut is null and abonnement_essai_fin > created_at::date + 30;
--    Lignes dont 204 RENSEIGNERA debut / fin (NULL aujourd'hui) — changement déclaré :
select count(*) as info_essai_renseigne
  from public.entreprises where abonnement_essai_debut is null or abonnement_essai_fin is null;

-- 2 bis. UPG-P1-1 — « essai perpétuel » : entreprise en statut 'essai' SANS fin d'essai (état réel documenté par
--    20260824000231, « dont l'entreprise réelle ELSATIA elle-même »). 204 renseigne fin = création + 30 j, puis
--    20260928000803 applique l'expiration EN BASE : tous ses membres perdent l'accès à l'upgrade. Doit être
--    régularisé AVANT la fenêtre (décision propriétaire : scripts/upgrade/sql/remediation_essai_perpetuel_PROPOSITION.sql).
select count(*) as bloquant_essai_perpetuel
  from public.entreprises
 where abonnement_statut = 'essai' and abonnement_essai_fin is null
   and coalesce(abonnement_essai_debut, created_at::date) + 30 < current_date;
select id, nom, created_at from public.entreprises
 where abonnement_statut = 'essai' and abonnement_essai_fin is null
   and coalesce(abonnement_essai_debut, created_at::date) + 30 < current_date order by created_at;
--    Information : essais DÉJÀ expirés (fin passée) — coupés en base après upgrade, comme l'application le faisait.
select count(*) as info_essai_expire_coupe_en_base
  from public.entreprises where abonnement_statut = 'essai' and abonnement_essai_fin < current_date;

-- 3. UPG-P0-1 — 20260921000300 backfille lignes_factures.entreprise_id par UPDATE, bloqué par le trigger
--    lignes_factures_brouillon_only dès qu'une facture ÉMISE a des lignes. Bloquant SANS le pont
--    scripts/upgrade/bridges/20260921000298 + 399 (le preflight lit la présence du pont dans le plan qualifié).
select count(*) as lignes_factures_emises
  from public.lignes_factures lf join public.factures f on f.id = lf.facture_id where f.statut <> 'brouillon';

-- 4. Volumétrie (dimensionnement de la fenêtre : comparer aux paliers qualifiés 500 → 100 000).
select relname, n_live_tup from pg_stat_user_tables where schemaname = 'public' order by n_live_tup desc limit 15;

-- 5. Contrats : inventaire des offres réellement souscrites (aucun remappage attendu).
select code_offre, version_tarif, periodicite, prix_contractuel_ht, statut, count(*)
  from public.abonnements_entreprises group by 1, 2, 3, 4, 5 order by 1, 2;

rollback;
