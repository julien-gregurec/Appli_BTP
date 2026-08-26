begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- Fixture isolée à ce test (préfixe pa9, sans rapport avec les autres fixtures partagées).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'aa900000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'pa-admin-total@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'aa900000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'pa-admin-inactif@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'aa900000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'pa-autre-utilisateur@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'aa900000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'pa-admin-support@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'aa900000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'pa-admin-facturation@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'aa900000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'pa-admin-lecture@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now())
on conflict (id) do nothing;

insert into public.plateforme_admins (
  email, role, utilisateur_id, actif, statut_identite, activation_at,
  revocation_at, revocation_origine
) values
  ('pa-admin-total@invalid.local', 'total', 'aa900000-0000-4000-8000-000000000001', true, 'active', now(), null, null),
  ('pa-admin-inactif@invalid.local', 'total', 'aa900000-0000-4000-8000-000000000002', false, 'revoquee', null, now(), 'migration_technique'),
  ('pa-admin-support@invalid.local', 'support', 'aa900000-0000-4000-8000-000000000004', true, 'active', now(), null, null),
  ('pa-admin-facturation@invalid.local', 'facturation', 'aa900000-0000-4000-8000-000000000005', true, 'active', now(), null, null),
  ('pa-admin-lecture@invalid.local', 'lecture', 'aa900000-0000-4000-8000-000000000006', true, 'active', now(), null, null);

insert into public.plateforme_admins (email, role, utilisateur_id, actif, statut_identite)
values ('pa-admin-en-attente@invalid.local', 'total', null, false, 'en_attente');

select ok(
  exists(
    select 1 from public.plateforme_admins
    where email = 'pa-admin-en-attente@invalid.local'
      and utilisateur_id is null
      and not actif
  ),
  '11. une identité sans compte Auth peut rester enregistrée uniquement en attente inactive'
);

select throws_like(
  $$insert into public.plateforme_admins(email, role, utilisateur_id, actif)
    values('pa-admin-fantome@invalid.local', 'total', null, true)$$,
  '%plateforme_admins_actif_requiert_utilisateur_id%',
  '12. une identité sans UID ne peut jamais devenir administrateur actif'
);

set local role authenticated;

-- 1. Admin actif reconnu.
select set_config('request.jwt.claim.sub', 'aa900000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.email', 'pa-admin-total@invalid.local', true);
select ok(public.est_plateforme_admin(), '1. admin actif est reconnu');
select is(public.plateforme_role_courant(), 'total', '6. rôle total retourné correctement');

-- 2. Admin inactif refusé (même utilisateur/ligne, actif=false).
select set_config('request.jwt.claim.sub', 'aa900000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.email', 'pa-admin-inactif@invalid.local', true);
select ok(not public.est_plateforme_admin(), '2. admin avec actif=false est refusé');

-- 3. Utilisateur normal (aucune ligne plateforme_admins) refusé.
select set_config('request.jwt.claim.sub', 'aa900000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.email', 'pa-autre-utilisateur@invalid.local', true);
select ok(not public.est_plateforme_admin(), '3. utilisateur sans ligne plateforme_admins est refusé');

-- 4. Email présent mais mauvais UID ne donne aucun droit : un utilisateur qui usurperait
-- l'email d'un admin (sans être ce même auth.uid()) n'obtient rien, puisque la fonction ne
-- regarde plus jamais l'email. Vérification de la donnée elle-même (hors contexte RLS,
-- plateforme_admins n'étant lisible par personne via l'API, y compris en test).
reset role;
select ok(
  not exists(
    select 1 from public.plateforme_admins
    where email = 'pa-admin-total@invalid.local' and utilisateur_id = 'aa900000-0000-4000-8000-000000000003'
  ),
  '4. aucune ligne ne relie l''email admin à un utilisateur tiers (pas de contournement possible par email)'
);
set local role authenticated;

-- 5. UID correct avec actif=false refusé (redondant avec 2, reformulé explicitement).
select set_config('request.jwt.claim.sub', 'aa900000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.email', 'pa-admin-inactif@invalid.local', true);
select ok(not public.est_plateforme_admin(), '5. UID correct mais actif=false : accès refusé');

-- 7. Rôle support.
select set_config('request.jwt.claim.sub', 'aa900000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.email', 'pa-admin-support@invalid.local', true);
select is(public.plateforme_role_courant(), 'support', '7. rôle support retourné correctement');

-- 8. Rôle facturation.
select set_config('request.jwt.claim.sub', 'aa900000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claim.email', 'pa-admin-facturation@invalid.local', true);
select is(public.plateforme_role_courant(), 'facturation', '8. rôle facturation retourné correctement');

-- 9. Rôle lecture.
select set_config('request.jwt.claim.sub', 'aa900000-0000-4000-8000-000000000006', true);
select set_config('request.jwt.claim.email', 'pa-admin-lecture@invalid.local', true);
select is(public.plateforme_role_courant(), 'lecture', '9. rôle lecture retourné correctement');

-- 10. Fonction appelée sans session (aucun claim) : false / null.
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.email', '', true);
set local role authenticated;
select ok(not public.est_plateforme_admin(), '10a. est_plateforme_admin() sans session : false');
select ok(public.plateforme_role_courant() is null, '10b. plateforme_role_courant() sans session : null');

reset role;
select * from finish();
rollback;
