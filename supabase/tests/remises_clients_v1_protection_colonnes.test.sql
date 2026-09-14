-- ROADMAP-CLEANUP-V1 §13 : proteger_colonnes_remise_entreprise() (20260823000223_remises_clients_v1.sql)
-- n'avait aucun test pgTAP dedie -- gap identifie lors de l'audit de couverture cross-tenant.
-- Le trigger ne leve pas d'exception : il reinitialise silencieusement les colonnes remise_*
-- a leur ancienne valeur si l'appelant n'est pas admin plateforme (est_plateforme_admin()).
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

\ir fixtures/isolation_multitenant.inc

-- GP_V1_RC : le correctif local historique (mise à jour de `plateforme_admins.utilisateur_id`)
-- ne s'applique plus ici (colonne absente du schéma de ce périmètre, migration 235+, hors
-- périmètre GP V1). Mais l'accès réel d'un admin plateforme à une entreprise donnée ne passe
-- pas par `est_plateforme_admin()` seul : les policies RLS d'`entreprises` (héritées de
-- `est_membre_actif`/`a_permission`) ne s'ouvrent que via `est_acces_support_actif()`, qui
-- exige une session active dans `plateforme_acces_entreprises` (table et fonction déjà dans la
-- 211-baseline, migration 20260714000075 -- ni l'une ni l'autre ajoutée par GP V1). Le fixture
-- partagé ne seedait déjà aucune session de ce type ; ce n'est pas propre à cette RC (constaté :
-- le fichier baseline échoue à la même ligne, avec ou sans migration GP, faute de la colonne
-- `utilisateur_id` qu'il tentait d'écrire). Séance ouverte ici, localement à ce test. Une seule
-- session active par admin plateforme à la fois
-- (`plateforme_acces_entreprise_session_unique`, sur plateforme_user_id) : ce test n'agit que
-- sur l'entreprise A, une seule ligne suffit.
insert into public.plateforme_acces_entreprises (plateforme_user_id, entreprise_id, motif)
values ('30000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'test pgTAP');

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
