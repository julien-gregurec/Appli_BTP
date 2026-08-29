begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

\ir fixtures/isolation_multitenant.inc

insert into public.acces_applications_entreprises (
  entreprise_id, application_code, autorise, source
) values (
  'a0000000-0000-0000-0000-000000000001', 'colors', true, 'test'
);

insert into public.habilitations_applications_utilisateurs (
  entreprise_id, utilisateur_id, application_code, role_code
) values (
  'a0000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  'colors',
  'colors_admin_organisation'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);

select ok(
  public.a_acces_application('a0000000-0000-0000-0000-000000000001', 'colors'),
  'colors_admin_organisation donne accès à Colors'
);
select is(
  (select role_code from public.applications_autorisees('a0000000-0000-0000-0000-000000000001') where application_code = 'colors'),
  'colors_admin_organisation',
  'applications_autorisees restitue colors_admin_organisation'
);

reset role;
update public.habilitations_applications_utilisateurs
set role_code = 'colors_gestionnaire_stock'
where entreprise_id = 'a0000000-0000-0000-0000-000000000001'
  and utilisateur_id = '10000000-0000-0000-0000-000000000002'
  and application_code = 'colors';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select ok(public.a_acces_application('a0000000-0000-0000-0000-000000000001', 'colors'), 'colors_gestionnaire_stock donne accès à Colors');
select is((select role_code from public.applications_autorisees('a0000000-0000-0000-0000-000000000001') where application_code = 'colors'), 'colors_gestionnaire_stock', 'applications_autorisees restitue colors_gestionnaire_stock');

reset role;
update public.habilitations_applications_utilisateurs
set role_code = 'colors_utilisateur_depot'
where entreprise_id = 'a0000000-0000-0000-0000-000000000001'
  and utilisateur_id = '10000000-0000-0000-0000-000000000002'
  and application_code = 'colors';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select ok(public.a_acces_application('a0000000-0000-0000-0000-000000000001', 'colors'), 'colors_utilisateur_depot donne accès à Colors');
select is((select role_code from public.applications_autorisees('a0000000-0000-0000-0000-000000000001') where application_code = 'colors'), 'colors_utilisateur_depot', 'applications_autorisees restitue colors_utilisateur_depot');

reset role;
update public.habilitations_applications_utilisateurs
set role_code = 'colors_consultation'
where entreprise_id = 'a0000000-0000-0000-0000-000000000001'
  and utilisateur_id = '10000000-0000-0000-0000-000000000002'
  and application_code = 'colors';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select ok(public.a_acces_application('a0000000-0000-0000-0000-000000000001', 'colors'), 'colors_consultation donne accès à Colors');
select is((select role_code from public.applications_autorisees('a0000000-0000-0000-0000-000000000001') where application_code = 'colors'), 'colors_consultation', 'applications_autorisees restitue colors_consultation');

reset role;
select * from finish();
rollback;
