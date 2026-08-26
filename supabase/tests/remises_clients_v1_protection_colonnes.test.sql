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

-- Valeur de départ connue via le chemin officiel. Un admin plateforme n'a volontairement
-- aucun bypass RLS direct sur les données d'une entreprise cliente : la fonction security
-- definer contrôlée est le seul chemin autorisé pour accorder une remise.
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'plateforme@invalid.local', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal2"}',
  true
);
select public.plateforme_appliquer_remise(
  'a0000000-0000-0000-0000-000000000001',
  'coupon-test-initial',
  'valeur initiale'
);

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
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal2"}',
  true
);

select lives_ok(
  $$select public.plateforme_appliquer_remise(
      'a0000000-0000-0000-0000-000000000001',
      'coupon-test-final',
      'remise accordée par la plateforme'
    )$$,
  '3. Un admin plateforme peut modifier remise_description via la RPC officielle'
);

-- La session admin plateforme n'a volontairement aucune policy SELECT cross-tenant sur
-- entreprises. La vérification de persistance est donc effectuée par le rôle de test, pas
-- en ajoutant un bypass de lecture silencieux au compte plateforme.
reset role;
select is(
  (select remise_description from public.entreprises where id = 'a0000000-0000-0000-0000-000000000001'),
  'remise accordée par la plateforme',
  '4. La modification par un admin plateforme est bien appliquée'
);

select * from finish();
rollback;
