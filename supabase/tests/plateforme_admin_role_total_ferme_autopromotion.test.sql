-- Un membre plateforme non-'total' ne peut plus s'auto-promouvoir (ni
-- promouvoir qui que ce soit) via plateforme_ajouter_admin(). Voir
-- 20260922000184_plateforme_admin_role_total_ferme_autopromotion.sql.
--
-- Portage adapté du test source sur `integration/gp-external-pilot-closure-v1`
-- (commit `8f5fca1`, supabase/tests/gp_pilot_plateforme_admin_role_total.test.sql) :
-- ce dépôt ne dispose pas de son fixture `fixtures/isolation_multitenant.inc`
-- (qui dépend en outre d'un GUC `elsatia.capacite_personnes_bypass` propre à
-- la lignée multi-app, absent ici), donc les comptes nécessaires sont créés
-- directement ci-dessous plutôt que via ce fixture. Le motif d'exception pour
-- un appelant hors équipe plateforme est aussi corrigé ici : c'est « Accès
-- réservé à la plateforme » (masculin, sans « e » final), pas « réservée » —
-- le test source utilisait `%réservée%` pour ce cas précis, un motif qui ne
-- l'aurait pas matché ; `%réservé%` (sans e final) matche les deux messages
-- d'erreur de plateforme_exiger_role().
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into public.plateforme_admins (email, role) values
  ('lecture-autopromotion-test@invalid.local', 'lecture'),
  ('total-autopromotion-test@invalid.local', 'total')
on conflict (email) do update set role = excluded.role;

set local role authenticated;

-- Membre 'lecture' : ne peut ni s'auto-promouvoir, ni ajouter qui que ce soit.
select set_config('request.jwt.claim.email', 'lecture-autopromotion-test@invalid.local', true);
select throws_like(
  $$select public.plateforme_ajouter_admin('lecture-autopromotion-test@invalid.local', null, 'total')$$,
  '%réservé%',
  'un membre plateforme en lecture ne peut pas s''auto-promouvoir en total'
);
select throws_like(
  $$select public.plateforme_ajouter_admin('nouveau-autopromotion-test@invalid.local', null, 'lecture')$$,
  '%réservé%',
  'un membre plateforme en lecture ne peut ajouter personne, même avec un rôle mineur'
);
select is(
  (select role from public.plateforme_admins where email = 'lecture-autopromotion-test@invalid.local'),
  'lecture',
  'le rôle du membre lecture est resté inchangé après la tentative'
);

-- Compte hors équipe plateforme : refusé aussi (chemin d'exception différent,
-- voir la note de portage ci-dessus).
select set_config('request.jwt.claim.email', 'hors-plateforme-autopromotion-test@invalid.local', true);
select throws_like(
  $$select public.plateforme_ajouter_admin('hors-plateforme-autopromotion-test@invalid.local', null, 'total')$$,
  '%réservé%',
  'un utilisateur hors plateforme ne peut pas s''ajouter lui-même'
);

-- Membre 'total' : peut toujours ajouter/retirer (non-régression).
select set_config('request.jwt.claim.email', 'total-autopromotion-test@invalid.local', true);
select lives_ok(
  $$select public.plateforme_ajouter_admin('nouveau-support-autopromotion-test@invalid.local', 'Support', 'support')$$,
  'un membre total peut toujours ajouter un membre plateforme'
);
select is(
  (select role from public.plateforme_admins where email = 'nouveau-support-autopromotion-test@invalid.local'),
  'support',
  'le nouveau membre porte bien le rôle demandé'
);

reset role;
select * from finish();
rollback;
