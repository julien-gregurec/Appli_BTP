-- Train canonique V1 : test repris de claude/amazing-pascal-7lddkv (d42df217) SANS sa migration
-- GP : la propriété vérifiée est déjà portée par le tronc (preuve : ce test passe sur le train,
-- voir docs/qualification/ELSATIA_CANONICAL_TRAIN_EXECUTION_V1.md §STEP 6).
-- TRUNCATE/TRIGGER/REFERENCES retirés à anon/authenticated sur toutes les tables
-- publiques, et entreprise_sans_membres() fixe désormais son search_path. Voir
-- 20260922000186_durcissement_privileges_socle.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select ok(
  not has_table_privilege('authenticated', 'public.entreprises', 'TRUNCATE'),
  'authenticated ne peut plus TRUNCATE les tables publiques'
);
select ok(
  not has_table_privilege('anon', 'public.entreprises', 'TRUNCATE'),
  'anon ne peut plus TRUNCATE les tables publiques'
);
select ok(
  exists(
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'entreprise_sans_membres'
      and p.proconfig is not null
      and 'search_path=public' = any(p.proconfig)
  ),
  'entreprise_sans_membres() fixe explicitement son search_path'
);

select * from finish();
rollback;
