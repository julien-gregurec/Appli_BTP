-- Train canonique V9 — convergence Export RGPD (V6) × Employés (V8), migration 20261002001203.
-- Contre-épreuve : sans 1203 (corps de 20261002001201), les tests 1 et 3 échouent ; la suite
-- employes_donnees_personnelles_acces_v1 échoue sur ses tests 50-54 et 56.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select ok(
  (select prosrc from pg_proc where oid = 'public.exporter_donnees_entreprise(uuid)'::regprocedure)
    like '%export_rgpd_section_autorisee%',
  'exporter_donnees_entreprise garde le retrait des sections RH sensibles (Employés, 0806)');
select ok(
  (select prosrc from pg_proc where oid = 'public.exporter_donnees_entreprise(uuid)'::regprocedure)
    like '%est_acces_support_actif%',
  'exporter_donnees_entreprise refuse une session d''assistance plateforme (export RGPD V1, 1201)');
select ok(
  (select prosrc from pg_proc where oid = 'public.exporter_donnees_entreprise(uuid)'::regprocedure)
    like '%sections_restreintes%',
  'l''export déclare les sections retirées (pas de trou silencieux)');
select ok(
  has_function_privilege('authenticated', 'public.exporter_donnees_entreprise(uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.exporter_donnees_entreprise(uuid)', 'EXECUTE'),
  'droits inchangés : authenticated seul');

select * from finish();
rollback;
