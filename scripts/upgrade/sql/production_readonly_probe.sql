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
--    Parmi elles, essais EN COURS chez Stripe que la troncature rend EXPIRÉS (matrice UPG-P0-2, cas A6) : l'accès
--    est coupé en base à l'upgrade (803) alors que l'essai Stripe court encore. Décision propriétaire requise.
select count(*) as bloquant_essai_tronque_expire
  from public.entreprises
 where abonnement_statut = 'essai' and abonnement_essai_debut is null
   and abonnement_essai_fin >= current_date and created_at::date + 30 < current_date;
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

-- 3 bis. Phase 0 (pont du train 20261003000201, versions postérieures à V9.1) : après la phase 0, toutes les
--    lignes de factures émises doivent porter l'entreprise_id de leur facture, sinon 300 retoucherait ces lignes
--    (trigger brouillon_only → échec). Lecture tolérante à l'absence de la colonne (to_jsonb : clé absente = NULL).
--    AVANT la phase 0 : = lignes_factures_emises (attendu) ; AVANT la phase principale : DOIT valoir 0.
select count(*) as bloquant_lignes_factures_emises_non_preparees
  from public.lignes_factures lf join public.factures f on f.id = lf.facture_id
 where f.statut <> 'brouillon' and (to_jsonb(lf) ->> 'entreprise_id') is distinct from f.entreprise_id::text;
select count(*) as info_lignes_devis_non_preparees
  from public.lignes_devis ld join public.devis d on d.id = ld.devis_id
 where (to_jsonb(ld) ->> 'entreprise_id') is distinct from d.entreprise_id::text;
select version as phase0_au_ledger from supabase_migrations.schema_migrations where version = '20261003000201';

-- 3 ter. UPG-P0-2 détaillé (matrice : statut × dates d'essai) — aucune régularisation automatique.
select abonnement_statut,
       case when abonnement_essai_debut is null and abonnement_essai_fin is null then 'sans_dates'
            when abonnement_essai_debut is null then 'debut_null'
            when abonnement_essai_fin is null then 'fin_null'
            when abonnement_essai_fin < abonnement_essai_debut then 'fin_avant_debut'
            when abonnement_essai_fin > abonnement_essai_debut + 30 then 'fin_hors_fenetre'
            else 'dans_fenetre' end as forme_dates,
       (abonnement_essai_fin < current_date) as fin_passee,
       count(*)
  from public.entreprises group by 1, 2, 3 order by 1, 2, 3;

-- 4. Volumétrie (dimensionnement de la fenêtre : comparer aux paliers qualifiés 500 → 100 000).
select relname, n_live_tup from pg_stat_user_tables where schemaname = 'public' order by n_live_tup desc limit 15;

-- 5. Contrats : inventaire des offres réellement souscrites (aucun remappage attendu).
select code_offre, version_tarif, periodicite, prix_contractuel_ht, statut, count(*)
  from public.abonnements_entreprises group by 1, 2, 3, 4, 5 order by 1, 2;

rollback;
