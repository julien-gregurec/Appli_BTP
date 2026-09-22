-- Exécuté pour de vrai le 2026-09-22 (qualification ELSATIA RGPD purge E2E V1,
-- voir docs/qualification/ELSATIA_RGPD_PURGE_END_TO_END_V1.md) contre un PostgreSQL 16
-- natif reconstruit à partir des vraies migrations (Docker/`supabase test db`
-- indisponible : registre Docker bloqué par la politique réseau de l'organisation).
-- Vérifie l'infrastructure de purge (migration 20260729000184) ET, dans les nouveaux
-- cas ci-dessous, documente sous forme de tests (certains marqués `todo()`, càd
-- attendus en échec) les défauts structurels confirmés par la qualification E2E :
-- confère les sections F1-F8 du rapport pour le détail et la preuve complète sur
-- données réelles (300+ lignes, 61 tables).
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select has_table('public', 'purge_entreprises_progres', 'La table de suivi de purge existe');
select has_column('public', 'entreprises', 'purgee_at', 'entreprises a une marque de purge');
select has_function('public', 'rapport_purge_entreprise', array['uuid'], 'La fonction de rapport existe');
select has_function('public', 'purger_table_entreprise', array['uuid', 'text'], 'La fonction de purge table par table existe');
select has_function('public', 'lister_fichiers_storage_entreprise', array['uuid'], 'La fonction de listing storage existe');
select has_function('public', 'marquer_entreprise_purgee', array['uuid'], 'La fonction de marquage entreprise existe');

-- Les tables comptables/paie/bancaires attendues sont dans la liste conservée.
select ok(
  'factures' = any(public.tables_conservees_purge())
  and 'paiements' = any(public.tables_conservees_purge())
  and 'bulletins_paie' = any(public.tables_conservees_purge())
  and 'journal_activite' = any(public.tables_conservees_purge()),
  'Les tables comptables/paie/audit sont conservees par defaut'
);

-- Personne d'autre que service_role ne peut exécuter les fonctions de purge : c'est la
-- protection principale contre une purge déclenchée en self-service ou par un tiers.
select isnt(
  has_function_privilege('authenticated', 'public.purger_table_entreprise(uuid,text)', 'EXECUTE'),
  true,
  'authenticated ne peut pas purger une table'
);
select isnt(
  has_function_privilege('anon', 'public.purger_table_entreprise(uuid,text)', 'EXECUTE'),
  true,
  'anon ne peut pas purger une table'
);
select isnt(
  has_function_privilege('authenticated', 'public.marquer_entreprise_purgee(uuid)', 'EXECUTE'),
  true,
  'authenticated ne peut pas marquer une entreprise comme purgee'
);

-- La table de suivi n'expose aucune policy : seul service_role (qui contourne la RLS) y accède.
select ok(
  (select relrowsecurity from pg_class where oid = 'public.purge_entreprises_progres'::regclass),
  'RLS est active sur purge_entreprises_progres'
);

-- ─────────────────────────────────────────────────────────────
-- Cas ajoutés suite à la qualification E2E du 2026-09-22 (données réelles,
-- voir docs/qualification/ELSATIA_RGPD_PURGE_END_TO_END_V1.md pour la preuve
-- complète table par table). Fixture minimale : une entreprise jetable.
-- ─────────────────────────────────────────────────────────────
do $$
declare v_entreprise uuid;
begin
  insert into public.entreprises(nom) values ('PGTAP Fixture Echeance') returning id into v_entreprise;
  perform set_config('pgtap.fixture_entreprise', v_entreprise::text, true);
end $$;

select throws_ok(
  format($sql$select public.purger_table_entreprise('%s'::uuid, 'clients')$sql$, current_setting('pgtap.fixture_entreprise')),
  'Purge non autorisee : aucune suppression programmee echue pour cette entreprise',
  'purger_table_entreprise refuse tant que suppression_prevue_at est NULL (jamais programmée)'
);

select lives_ok(
  format($sql$
    update public.entreprises set suppression_prevue_at = now() - interval '1 second' where id = '%s'::uuid;
    select public.purger_table_entreprise('%s'::uuid, 'clients');
  $sql$, current_setting('pgtap.fixture_entreprise'), current_setting('pgtap.fixture_entreprise')),
  'purger_table_entreprise autorise la purge une fois suppression_prevue_at échue, et est idempotent sur une table déjà vide (0 ligne, pas d''erreur)'
);

-- F3 (rapport de qualification) : aucune table CONSERVÉE ne devrait tenir de FK
-- RESTRICT/NO ACTION vers une table éligible à la purge (DELETE) — sinon cette
-- dernière ne peut plus jamais être purgée dès qu'une ligne conservée la
-- référence (ex. confirmé : factures.client_id -> clients, en RESTRICT).
select * from todo(1, 'F3 — connu : plusieurs FK RESTRICT/NO ACTION depuis des tables conservées bloquent définitivement la purge de tables DELETE (factures->clients, ordres_virements->employes/fournisseurs/notes_frais, bulletins_paie->employes)');
select is(
  (
    select count(*)::int from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_class fcl on fcl.oid = con.confrelid
    where con.contype = 'f' and con.confdeltype in ('r','a')
      and cl.relnamespace = 'public'::regnamespace and fcl.relnamespace = 'public'::regnamespace
      and cl.relname = any(public.tables_conservees_purge())
      and fcl.relname <> all(public.tables_conservees_purge())
      and exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=fcl.relname and c.column_name='entreprise_id')
  ),
  0,
  'aucune table conservée ne bloque définitivement une table purgeable via une FK RESTRICT/NO ACTION'
);

-- F4 (rapport de qualification) : la table d'audit de la purge elle-même ne
-- devrait pas être traitée comme une table métier purgeable (sinon la purge
-- efface sa propre preuve avant qu'un opérateur ne puisse la lire).
select * from todo(1, 'F4 — connu : purge_entreprises_progres a une colonne entreprise_id et n''est pas dans tables_conservees_purge(), donc rapport_purge_entreprise/purger_table_entreprise la traitent comme une table métier ordinaire et la purgent, effaçant sa propre piste d''audit en cours de purge');
select ok(
  'purge_entreprises_progres' = any(public.tables_conservees_purge()),
  'la table d''audit de la purge est exclue de la purge (jamais traitée comme donnée métier)'
);

-- F8 (rapport de qualification) : purger une table DELETE ne devrait pas
-- silencieusement modifier le contenu d'une table CONSERVÉE (confirmé :
-- factures.devis_origine_id passe à NULL sur 180/180 factures conservées
-- quand devis est purgé, via ON DELETE SET NULL).
select * from todo(1, 'F8 — connu : factures.devis_origine_id (ON DELETE SET NULL vers devis, purgeable) est silencieusement mis à NULL sur les factures conservées quand devis est purgé — contenu conservé altéré, pas seulement lignes non supprimées');
select is(
  (
    select count(*)::int from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_class fcl on fcl.oid = con.confrelid
    where con.contype = 'f' and con.confdeltype in ('n','d')
      and cl.relnamespace = 'public'::regnamespace and fcl.relnamespace = 'public'::regnamespace
      and cl.relname = any(public.tables_conservees_purge())
      and fcl.relname <> all(public.tables_conservees_purge())
  ),
  0,
  'aucune table conservée ne peut être altérée (SET NULL/SET DEFAULT) par la purge d''une table purgeable'
);

select * from finish();
rollback;
