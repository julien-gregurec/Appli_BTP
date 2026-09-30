-- ELSATIA-SECURITY-REDTEAM-V2-HARDENING-V1 — preuve d'exécution réelle.
-- Migration : 20260928000701_security_redteam_v2_hardening_v1.sql
-- Rapport : docs/qualification/ELSATIA_MULTI_APP_SECURITY_RED_TEAM_V2.md
--
--   §1 fonctions sur-exposées : révoquées à authenticated, gardées à service_role
--   §2 Réserves : rattachement inter-tenant refusé (négatif) / même tenant OK (positif)

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

\ir fixtures/isolation_multitenant.inc

-- ── §1. ACL des deux fonctions SECURITY DEFINER ──────────────────────────────
select ok(
  not has_function_privilege('authenticated', 'public.construire_client_snapshot(uuid,uuid,text)', 'execute'),
  'construire_client_snapshot : NON exécutable par authenticated (REDTEAM-V2)'
);
-- construire_client_snapshot n'a jamais été accordée qu'à authenticated
-- (migration 272) ; ses seuls appelants réels sont des triggers SECURITY DEFINER
-- qui s'exécutent sous le propriétaire. Après révocation, elle reste inerte pour
-- tous les rôles clients tout en restant appelable par ces triggers.
select ok(
  (select prosecdef from pg_proc where oid = 'public.construire_client_snapshot(uuid,uuid,text)'::regprocedure),
  'construire_client_snapshot : reste SECURITY DEFINER (appelable par les triggers de capture)'
);
select ok(
  not has_function_privilege('anon', 'public.construire_client_snapshot(uuid,uuid,text)', 'execute'),
  'construire_client_snapshot : jamais exécutable par anon'
);
select ok(
  not has_function_privilege('authenticated', 'public.capacite_stripe_operations_a_reprendre(integer)', 'execute'),
  'capacite_stripe_operations_a_reprendre : NON exécutable par authenticated (REDTEAM-V2)'
);
select ok(
  has_function_privilege('service_role', 'public.capacite_stripe_operations_a_reprendre(integer)', 'execute'),
  'capacite_stripe_operations_a_reprendre : toujours exécutable par service_role'
);

-- ── §2. Cohérence tenant ↔ chantier (Réserves) ───────────────────────────────
insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source) values
  ('a0000000-0000-0000-0000-000000000001','reserves', true, 'test'),
  ('b0000000-0000-0000-0000-000000000001','reserves', true, 'test');
insert into public.habilitations_applications_utilisateurs (entreprise_id, utilisateur_id, application_code, role_code) values
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','reserves','reserves_admin_organisation');

-- B possède un chantier ; A possède le sien.
insert into public.reserves_chantiers (id, entreprise_id, nom, created_by) values
  ('bccccccc-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','Chantier de B','20000000-0000-0000-0000-000000000001'),
  ('accccccc-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Chantier de A','10000000-0000-0000-0000-000000000001');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- Négatif : A ne peut pas rattacher un intervenant au chantier de B.
select throws_ok(
  $$insert into public.reserves_intervenants (entreprise_id, chantier_id, nom, statut)
    values ('a0000000-0000-0000-0000-000000000001','bccccccc-0000-0000-0000-000000000001','Injecté','invitee')$$,
  '42501',
  'Le chantier appartient à une autre organisation',
  'REDTEAM-V2 : rattachement d''un intervenant au chantier d''un autre tenant refusé'
);

-- Positif : A rattache un intervenant à SON propre chantier (fonctionnel).
select lives_ok(
  $$insert into public.reserves_intervenants (entreprise_id, chantier_id, nom, statut)
    values ('a0000000-0000-0000-0000-000000000001','accccccc-0000-0000-0000-000000000001','Légitime','invitee')$$,
  'Rattachement d''un intervenant au chantier de sa propre organisation : toujours autorisé'
);

-- Les deux triggers existent (intervenants + plans).
select ok(
  exists(select 1 from pg_trigger where tgname = 'reserves_intervenants_meme_tenant'
         and tgrelid = 'public.reserves_intervenants'::regclass),
  'trigger de cohérence présent sur reserves_intervenants'
);
select ok(
  exists(select 1 from pg_trigger where tgname = 'reserves_plans_meme_tenant'
         and tgrelid = 'public.reserves_plans'::regclass),
  'trigger de cohérence présent sur reserves_plans'
);

select * from finish();
rollback;
