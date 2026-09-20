-- GP-EXTERNAL-PILOT-CLOSURE-V1 — notifier_devis_accepte() journalise et
-- notifie les responsables (gerer_devis) d'une entreprise, jamais ceux d'une
-- autre, et refuse un appel sans droit. Voir
-- 20260916000306_gp_pilot_notification_devis_accepte.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

\ir fixtures/isolation_multitenant.inc

insert into public.devis (
  id, entreprise_id, numero, client_id, chantier_id, statut,
  montant_ht, montant_tva, montant_ttc
) values (
  'd9000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001',
  'TEST_A_DEV_ACC', 'a3000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001',
  'envoye', 300, 60, 360
);

select has_function('public', 'notifier_devis_accepte', array['uuid'], 'la fonction existe');

-- Ouvrier A (sans gerer_devis) : refusé.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);
select throws_like(
  $$select public.notifier_devis_accepte('d9000000-0000-0000-0000-000000000009')$$,
  '%Accès refusé%',
  'un membre sans gerer_devis ne peut pas déclencher la notification'
);

-- Gérant B, ciblant un devis de A : refusé (le devis n'appartient pas à son entreprise).
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
select throws_like(
  $$select public.notifier_devis_accepte('d9000000-0000-0000-0000-000000000009')$$,
  '%Accès refusé%',
  'le gérant d''une autre entreprise ne peut pas déclencher la notification sur ce devis'
);

-- Gérant A (gerer_devis) : autorisé, journalise et notifie.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select lives_ok(
  $$select public.notifier_devis_accepte('d9000000-0000-0000-0000-000000000009')$$,
  'un gérant avec gerer_devis peut déclencher la notification'
);

reset role;
select is(
  (select count(*)::int from public.journal_activite
    where entreprise_id = 'a0000000-0000-0000-0000-000000000001'
      and action = 'devis_accepte' and ressource_id = 'd9000000-0000-0000-0000-000000000009'),
  1,
  'une entrée journal_activite est bien créée'
);
select ok(
  (select count(*)::int from public.notifications_utilisateurs
    where entreprise_id = 'a0000000-0000-0000-0000-000000000001'
      and type = 'devis_accepte' and utilisateur_id != '10000000-0000-0000-0000-000000000001') > 0,
  'au moins un responsable (hors auteur du changement) est notifié'
);
select is(
  (select count(*)::int from public.notifications_utilisateurs
    where entreprise_id = 'a0000000-0000-0000-0000-000000000001'
      and type = 'devis_accepte' and utilisateur_id = '10000000-0000-0000-0000-000000000001'),
  0,
  'l''auteur du changement n''est pas notifié de sa propre action'
);

select * from finish();
rollback;
