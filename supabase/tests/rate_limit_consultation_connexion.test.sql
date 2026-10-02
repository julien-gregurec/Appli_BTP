begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select has_function('public', 'consulter_rate_limit', array['text', 'text', 'integer', 'integer'], 'lecture de compteur présente');
select function_privs_are('public', 'consulter_rate_limit', array['text', 'text', 'integer', 'integer'], 'anon', array[]::text[], 'anon ne lit pas les compteurs');
select function_privs_are('public', 'consulter_rate_limit', array['text', 'text', 'integer', 'integer'], 'authenticated', array[]::text[], 'utilisateur ne lit pas les compteurs');

set local role service_role;
select ok((select autorise from public.consulter_rate_limit('test:lecture', repeat('b', 64), 600, 2)), 'compteur absent : budget disponible');
select ok((select autorise from public.consulter_rate_limit('test:lecture', repeat('b', 64), 600, 2)), 'la lecture ne consomme rien');
select ok((select autorise from public.consommer_rate_limit('test:lecture', repeat('b', 64), 600, 2)), 'premier échec consommé');
select is((select restant from public.consulter_rate_limit('test:lecture', repeat('b', 64), 600, 2)), 1, 'la lecture voit l échec consommé');
select public.consommer_rate_limit('test:lecture', repeat('b', 64), 600, 2);
select isnt((select autorise from public.consulter_rate_limit('test:lecture', repeat('b', 64), 600, 2)), true, 'budget épuisé : lecture bloquante');

select * from finish();
rollback;
