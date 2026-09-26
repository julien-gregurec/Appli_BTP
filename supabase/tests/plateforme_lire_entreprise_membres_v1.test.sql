begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

\ir fixtures/isolation_multitenant.inc

insert into public.acces_applications_entreprises(entreprise_id, application_code, autorise, source) values
  ('a0000000-0000-0000-0000-000000000001', 'gestion_pro', true, 'test_rpc')
on conflict(entreprise_id, application_code) do update set autorise = true;

insert into public.habilitations_applications_utilisateurs(
  entreprise_id, utilisateur_id, application_code, role_code, autorise
) values (
  'a0000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  'gestion_pro', 'gestion_pro_utilisateur', true
) on conflict(entreprise_id, utilisateur_id, application_code)
do update set role_code = excluded.role_code, autorise = true;

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'plateforme@invalid.local', true);

select is(
  (select distinct entreprise_nom from public.plateforme_lire_entreprise_membres('a0000000-0000-0000-0000-000000000001')),
  'Entreprise Isolation A',
  '1. admin plateforme lit entreprise A'
);

select is(
  (select count(distinct utilisateur_id) from public.plateforme_lire_entreprise_membres('a0000000-0000-0000-0000-000000000001')),
  6::bigint,
  '2. admin plateforme voit les six membres de A'
);

select is(
  (select count(*) from public.plateforme_lire_entreprise_membres('a0000000-0000-0000-0000-000000000001') where utilisateur_id::text like '20000000-%'),
  0::bigint,
  '3. aucun membre de l’entreprise B ne fuit dans A'
);

select is(
  (select role_code from public.plateforme_lire_entreprise_membres('a0000000-0000-0000-0000-000000000001')
   where utilisateur_id = '10000000-0000-0000-0000-000000000002' and application_code = 'gestion_pro'),
  'gestion_pro_utilisateur',
  '4. l’habilitation applicative existante est retournée'
);

select is(
  (select count(*) from public.plateforme_lire_entreprise_membres('ffffffff-ffff-4fff-8fff-ffffffffffff')),
  0::bigint,
  '5. une entreprise inexistante produit un résultat vide propre'
);

select ok(
  lower(pg_get_function_result('public.plateforme_lire_entreprise_membres(uuid)'::regprocedure))
    !~ '(email|password|token|metadata|secret)',
  '6. la signature n’expose aucun champ sensible'
);

select ok(
  lower(pg_get_functiondef('public.plateforme_lire_entreprise_membres(uuid)'::regprocedure))
    !~ '(insert|update|delete)[[:space:]]',
  '7. la fonction ne contient aucune écriture'
);

select is(
  (select count(*) from public.historique_acces_applications),
  0::bigint,
  '8. les lectures privilégiées n’ajoutent aucun événement d’historique'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);
select throws_ok(
  $$select * from public.plateforme_lire_entreprise_membres('a0000000-0000-0000-0000-000000000001')$$,
  '42501', 'Accès réservé à la plateforme',
  '9. un utilisateur normal est refusé'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select throws_ok(
  $$select * from public.plateforme_lire_entreprise_membres('a0000000-0000-0000-0000-000000000001')$$,
  '42501', 'Accès réservé à la plateforme',
  '10. un admin d’entreprise non plateforme est refusé'
);

reset role;
select * from finish();
rollback;
