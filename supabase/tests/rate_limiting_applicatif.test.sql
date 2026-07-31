begin;
select plan(8);

select has_table('public', 'rate_limits_applicatifs', 'table de compteurs présente');
select has_table('public', 'journal_abus_securite', 'journal d abus présent');
select has_function('public', 'consommer_rate_limit', array['text', 'text', 'integer', 'integer'], 'fonction atomique présente');
select table_privs_are('public', 'rate_limits_applicatifs', 'anon', array[]::text[], 'anon sans accès direct aux compteurs');
select table_privs_are('public', 'journal_abus_securite', 'authenticated', array[]::text[], 'utilisateur sans accès au journal');

set local role service_role;
select ok((select autorise from public.consommer_rate_limit('test:limite', repeat('a', 64), 60, 2)), 'première requête autorisée');
select ok((select autorise from public.consommer_rate_limit('test:limite', repeat('a', 64), 60, 2)), 'deuxième requête autorisée');
select isnt((select autorise from public.consommer_rate_limit('test:limite', repeat('a', 64), 60, 2)), true, 'troisième requête refusée');

select * from finish();
rollback;
