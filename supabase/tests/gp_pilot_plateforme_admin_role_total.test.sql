-- GP-EXTERNAL-PILOT-CLOSURE-V1 — un membre plateforme non-'total' ne peut
-- plus s'auto-promouvoir (ni promouvoir qui que ce soit) via
-- plateforme_ajouter_admin(). Voir 20260916000309_gp_pilot_plateforme_admin_role_total.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

\ir fixtures/isolation_multitenant.inc

insert into public.plateforme_admins (email, role)
values ('lecture@invalid.local', 'lecture')
on conflict (email) do update set role = excluded.role;

set local role authenticated;

-- ── Membre 'lecture' : ne peut ni s'auto-promouvoir, ni ajouter qui que ce soit ──
select set_config('request.jwt.claim.email', 'lecture@invalid.local', true);
select throws_like(
  $$select public.plateforme_ajouter_admin('lecture@invalid.local', null, 'total')$$,
  '%réservée%',
  'un membre plateforme en lecture ne peut pas s''auto-promouvoir en total'
);
select throws_like(
  $$select public.plateforme_ajouter_admin('nouveau@invalid.local', null, 'lecture')$$,
  '%réservée%',
  'un membre plateforme en lecture ne peut ajouter personne, même avec un rôle mineur'
);
select is(
  (select role from public.plateforme_admins where email = 'lecture@invalid.local'),
  'lecture',
  'le rôle du membre lecture est resté inchangé après la tentative'
);

-- ── Un compte hors plateforme (gérant A) : refusé aussi ──
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select throws_like(
  $$select public.plateforme_ajouter_admin('admin-a@invalid.local', null, 'total')$$,
  '%réservée%',
  'un utilisateur hors plateforme ne peut pas s''ajouter lui-même'
);

-- ── Membre 'total' : peut ajouter/retirer normalement (non-régression) ──
select set_config('request.jwt.claim.email', 'plateforme@invalid.local', true);
select lives_ok(
  $$select public.plateforme_ajouter_admin('nouveau-support@invalid.local', 'Support', 'support')$$,
  'un membre total peut toujours ajouter un membre plateforme'
);
select is(
  (select role from public.plateforme_admins where email = 'nouveau-support@invalid.local'),
  'support',
  'le nouveau membre porte bien le rôle demandé'
);

reset role;
select * from finish();
rollback;
