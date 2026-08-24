-- ROADMAP-CLEANUP-V1 §13 : proteger_colonnes_remise_entreprise() (20260823000223_remises_clients_v1.sql)
-- n'avait aucun test pgTAP dedie -- gap identifie lors de l'audit de couverture cross-tenant.
-- Le trigger ne leve pas d'exception : il reinitialise silencieusement les colonnes remise_*
-- a leur ancienne valeur si l'appelant n'est pas admin plateforme (est_plateforme_admin()).
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

\ir fixtures/isolation_multitenant.inc

-- Correctif local au fixture partagé : plateforme_role_courant() (donc
-- est_plateforme_admin()) filtre sur plateforme_admins.utilisateur_id = auth.uid(), mais
-- fixtures/isolation_multitenant.inc n'insère que la colonne email -- utilisateur_id y
-- reste donc NULL et l'admin plateforme de la fixture n'est jamais reconnu comme tel par
-- ce mécanisme. Corrigé ici localement (pas dans le fixture partagé, pour ne rien changer
-- aux ~15 autres fichiers qui le réutilisent) -- signalé séparément comme dette de fixture.
update public.plateforme_admins set utilisateur_id = '30000000-0000-0000-0000-000000000001', actif = true, role = coalesce(role, 'total')
where email = 'plateforme@invalid.local';

-- Valeur de depart connue. Le trigger proteger_colonnes_remise s'applique a TOUT UPDATE,
-- y compris celui-ci : il faut donc seeder sous contexte admin plateforme (comme pour le
-- test 3/4 plus bas), pas en connexion brute service_role (auth.uid() y est null, donc
-- est_plateforme_admin() y est faux et le trigger réinitialiserait silencieusement le seed).
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'plateforme@invalid.local', true);
update public.entreprises set remise_description = 'valeur initiale' where id = 'a0000000-0000-0000-0000-000000000001';

-- ===== Admin A (membre actif, PAS admin plateforme) =====
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

select lives_ok(
  $$update public.entreprises set remise_description = 'tentative non autorisee' where id = 'a0000000-0000-0000-0000-000000000001'$$,
  '1. Un membre actif (non admin plateforme) peut techniquement lancer l''UPDATE (RLS générique) sans erreur...'
);

select is(
  (select remise_description from public.entreprises where id = 'a0000000-0000-0000-0000-000000000001'),
  'valeur initiale',
  '2. ...mais la colonne remise_description reste inchangée (silencieusement réinitialisée par le trigger)'
);

-- ===== Admin plateforme =====
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'plateforme@invalid.local', true);

select lives_ok(
  $$update public.entreprises set remise_description = 'remise accordée par la plateforme' where id = 'a0000000-0000-0000-0000-000000000001'$$,
  '3. Un admin plateforme peut modifier remise_description'
);

select is(
  (select remise_description from public.entreprises where id = 'a0000000-0000-0000-0000-000000000001'),
  'remise accordée par la plateforme',
  '4. La modification par un admin plateforme est bien appliquée'
);

select * from finish();
rollback;
