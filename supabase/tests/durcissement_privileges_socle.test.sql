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
