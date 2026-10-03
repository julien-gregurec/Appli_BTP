-- ELSATIA — Pack opérateur V9 : export du ledger de migrations (LECTURE SEULE).
--
-- Produit UNE ligne JSON « elsatia-ledger-v1 » lue par scripts/preview/v9/check-ledger-v9.mjs :
--   entries      : supabase_migrations.schema_migrations (version, name), triées par version ;
--   marqueur_813 : la 813 au ledger contient-elle le corps ORIGINAL (`abonnement_statut_effectif`) ?
--                  (null si la colonne `statements` n'existe pas dans ce ledger) ;
--   fonction_813 : la fonction réellement déployée (pg_proc) est-elle l'originale, ou la
--                  reconstruction 23153716 (commentaire interne « HOTFIX 813 ») ?
-- Aucune donnée métier, aucun secret. Le pack ajoute `project_ref` d'après l'URL de connexion
-- déjà validée par la garde de cible.
--
-- Usage (session forcée en lecture seule) :
--   PGOPTIONS='-c default_transaction_read_only=on' psql "$ELSATIA_PREVIEW_DB_URL" -X -At \
--     -v ON_ERROR_STOP=1 -f docs/runbooks/sql/ELSATIA_V9_LEDGER_EXPORT.sql > ledger-brut.json

select json_build_object(
  'format', 'elsatia-ledger-v1',
  'source', 'supabase_migrations.schema_migrations',
  'exported_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'fonction_813', (
    select json_build_object(
      'original', coalesce(bool_or(p.prosrc like '%abonnement_statut_effectif%'), false),
      'non_original', coalesce(bool_or(p.prosrc like '%HOTFIX 813%'), false))
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'plateforme_annuaire_entreprises'),
  'entries', coalesce((
    select json_agg(json_build_object(
        'version', m.version,
        'name', to_jsonb(m) ->> 'name',
        'marqueur_813', case
          when m.version = '20261002000813' and (to_jsonb(m) ? 'statements') and (to_jsonb(m) ->> 'statements') is not null
          then (to_jsonb(m) ->> 'statements') like '%abonnement_statut_effectif%'
        end)
      order by m.version)
    from supabase_migrations.schema_migrations m), '[]'::json)
);
