-- Vérifie le correctif de la migration 20260922000197 : une session support
-- plateforme active ne peut plus laisser de trace permanente (appartenance,
-- permission de poste) dans l'entreprise qu'elle assiste.
--
-- Portage adapté (introspection de schéma, `fixtures/isolation_multitenant.inc`
-- absent de ce dépôt) — même style que les autres correctifs RLS de cette
-- branche (correctif_rls_ecriture_chantiers.test.sql,
-- verrou_devis_accepte_et_expiration_essai.test.sql) : aucune base réelle
-- n'est disponible dans cet environnement pour valider un scénario
-- comportemental construit à la main.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select has_function('public', 'est_membre_actif_reel', array['uuid'], 'est_membre_actif_reel existe');

-- est_membre_actif_reel ne doit JAMAIS invoquer est_acces_support_actif : c'est
-- tout le sens du correctif (contrairement à est_membre_actif, qui le fait).
select ok(
  (select prosrc from pg_proc where oid = 'public.est_membre_actif_reel(uuid)'::regprocedure) not like '%est_acces_support_actif%',
  'est_membre_actif_reel ne fait pas OU avec le bypass support'
);
select ok(
  (select prosrc from pg_proc where oid = 'public.est_membre_actif(uuid)'::regprocedure) like '%est_acces_support_actif%',
  'est_membre_actif (lecture/actions réversibles) garde bien le bypass support, lui'
);

-- Les deux policies qui créent une persistance (appartenance, permissions de
-- poste) utilisent désormais est_membre_actif_reel, plus est_membre_actif.
select ok(
  (select with_check from pg_policies where schemaname = 'public' and tablename = 'utilisateurs_entreprises' and policyname = 'bootstrap ou invitation par un membre actif') like '%est_membre_actif_reel%',
  'INSERT sur utilisateurs_entreprises est gaté par est_membre_actif_reel'
);
select ok(
  (select qual from pg_policies where schemaname = 'public' and tablename = 'utilisateurs_entreprises' and policyname = 'admins modifient les appartenances') like '%est_membre_actif_reel%',
  'UPDATE sur utilisateurs_entreprises est gaté par est_membre_actif_reel'
);
select ok(
  (select qual from pg_policies where schemaname = 'public' and tablename = 'permissions_poste' and policyname = 'membres gèrent les permissions') like '%est_membre_actif_reel%',
  'ALL sur permissions_poste est gaté par est_membre_actif_reel'
);

-- Non-régression : les policies de LECTURE restent sur est_membre_actif (le
-- support garde son accès d'assistance en lecture pendant sa session).
select ok(
  (select qual from pg_policies where schemaname = 'public' and tablename = 'utilisateurs_entreprises' and policyname = 'membres voient les appartenances de leur entreprise') like '%est_membre_actif(%',
  'SELECT sur utilisateurs_entreprises reste gaté par est_membre_actif (non régressé)'
);

select * from finish();
rollback;
