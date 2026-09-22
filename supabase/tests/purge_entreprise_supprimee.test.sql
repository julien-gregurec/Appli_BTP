-- Exécuté pour de vrai le 2026-09-22 (qualification ELSATIA RGPD purge E2E V1,
-- voir docs/qualification/ELSATIA_RGPD_PURGE_END_TO_END_V1.md) contre un PostgreSQL 16
-- natif reconstruit à partir des vraies migrations (Docker/`supabase test db`
-- indisponible : registre Docker bloqué par la politique réseau de l'organisation).
-- Vérifie l'infrastructure de purge (migration 20260729000184).
--
-- MISE À JOUR (architecture V2, migration 20260729000185, voir docs/qualification/
-- ELSATIA_RGPD_PURGE_ARCHITECTURE_CLOSURE_V2.md) : les cas F3/F4/F8 ci-dessous étaient
-- marqués `todo()` (attendus en échec) suite à la qualification E2E V1. Ils sont
-- désormais des assertions normales (F3/F4/F8 corrigés par la V2) — voir
-- supabase/tests/purge_entreprise_architecture_v2.test.sql pour la couverture V2
-- complète (F1/F2/F5/F6/F7, ANONYMIZE, service_role uniquement sur toutes les nouvelles
-- fonctions, mauvais tenant, double purge, retry, échéance avant/après/expirée).
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

select hasnt_table('public', 'purge_entreprises_progres', 'La table de suivi V1 a été remplacée par platform.purge_audit (F4) — ne doit plus exister');
select has_column('public', 'entreprises', 'purgee_at', 'entreprises a une marque de purge');
select has_function('public', 'rapport_purge_entreprise', array['uuid'], 'La fonction de rapport existe');
select has_function('public', 'purger_table_entreprise', array['uuid', 'text', 'uuid'], 'La fonction de purge table par table existe (V2 : run_id en 3e argument)');
select has_function('public', 'lister_fichiers_storage_entreprise', array['uuid'], 'La fonction de listing storage existe');
select has_function('public', 'marquer_entreprise_purgee', array['uuid', 'uuid'], 'La fonction de marquage entreprise existe (V2 : run_id en 2e argument)');

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
  has_function_privilege('authenticated', 'public.purger_table_entreprise(uuid,text,uuid)', 'EXECUTE'),
  true,
  'authenticated ne peut pas purger une table'
);
select isnt(
  has_function_privilege('anon', 'public.purger_table_entreprise(uuid,text,uuid)', 'EXECUTE'),
  true,
  'anon ne peut pas purger une table'
);
select isnt(
  has_function_privilege('authenticated', 'public.marquer_entreprise_purgee(uuid,uuid)', 'EXECUTE'),
  true,
  'authenticated ne peut pas marquer une entreprise comme purgee'
);

-- Le nouveau registre d'audit (platform.purge_audit, F4) n'est accessible qu'au
-- service_role, et RLS y est activée en ceinture-bretelles (aucune policy).
select ok(
  (select relrowsecurity from pg_class where oid = 'platform.purge_audit'::regclass),
  'RLS est active sur platform.purge_audit'
);
select isnt(
  has_table_privilege('authenticated', 'platform.purge_audit', 'SELECT'),
  true,
  'authenticated ne peut pas lire platform.purge_audit directement'
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

-- F1 (rapport de qualification) : purger_table_entreprise ne relance plus d'exception
-- (V2) — le refus "pas encore échu" est désormais un résultat normal (ok=false),
-- observable ET consigné dans l'audit (platform.purge_audit), pas une exception qui
-- annulerait la transaction PostgREST et donc l'écriture de l'audit avec elle.
select lives_ok(
  format($sql$select public.purger_table_entreprise('%s'::uuid, 'clients')$sql$, current_setting('pgtap.fixture_entreprise')),
  'purger_table_entreprise ne relance plus d''exception (F1) même quand la purge est refusée'
);
select is(
  (select ok from public.purger_table_entreprise(current_setting('pgtap.fixture_entreprise')::uuid, 'clients')),
  false,
  'purger_table_entreprise refuse (ok=false) tant que suppression_prevue_at est NULL (jamais programmée)'
);
select is(
  (select count(*)::int from platform.purge_audit where entreprise_id = current_setting('pgtap.fixture_entreprise')::uuid and ok = false),
  2, -- un par appel ci-dessus (lives_ok en a déjà fait un premier)
  'F1 : le refus est consigné dans platform.purge_audit malgré l''absence d''exception'
);

select lives_ok(
  format($sql$
    update public.entreprises set suppression_prevue_at = now() - interval '1 second' where id = '%s'::uuid;
    select public.purger_table_entreprise('%s'::uuid, 'clients');
  $sql$, current_setting('pgtap.fixture_entreprise'), current_setting('pgtap.fixture_entreprise')),
  'purger_table_entreprise autorise la purge une fois suppression_prevue_at échue, et est idempotent sur une table déjà vide (0 ligne, pas d''erreur)'
);

-- F3 (rapport de qualification, corrigé V2) : aucune table CONSERVÉE ne devrait tenir
-- de FK RESTRICT/NO ACTION vers une table encore classée DELETE. Les tables ANONYMIZE
-- (clients/employes/fournisseurs) sont le mécanisme de résolution voulu pour ce cas
-- (F3 : ligne conservée, PII vidée) — elles sont donc exclues de la recherche de
-- violation, pas incluses dedans.
select is(
  (
    select count(*)::int from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_class fcl on fcl.oid = con.confrelid
    where con.contype = 'f' and con.confdeltype in ('r','a')
      and cl.relnamespace = 'public'::regnamespace and fcl.relnamespace = 'public'::regnamespace
      and cl.relname = any(public.tables_conservees_purge())
      and fcl.relname <> all(public.tables_conservees_purge())
      and fcl.relname <> all(public.tables_anonymisees_purge())
      and exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=fcl.relname and c.column_name='entreprise_id')
  ),
  0,
  'F3 : aucune table conservée ne bloque définitivement une table encore classée DELETE via une FK RESTRICT/NO ACTION'
);

-- F4 (corrigé V2) : l'audit vit dans platform.purge_audit, hors du schéma public
-- scanné dynamiquement par rapport_purge_entreprise — il ne peut plus être purgé par
-- sa propre exécution, par construction (pas besoin de l'ajouter à une liste blanche).
select hasnt_column('platform', 'purge_audit', 'nonexistent_marker', 'sanity : platform.purge_audit existe bien dans un schéma séparé');
select isnt(
  exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'purge_audit'),
  true,
  'F4 : aucune table purge_audit dans le schéma public scanné par rapport_purge_entreprise'
);

-- F8 (corrigé V2) : purger une table DELETE ne doit plus silencieusement modifier le
-- contenu d'une table CONSERVÉE sans laisser de trace. Les FK SET NULL/SET DEFAULT
-- depuis une table conservée vers une table DELETE existent toujours dans le schéma
-- (c'est la contrainte réelle) — mais chaque table conservée concernée porte désormais
-- une colonne purge_snapshot (vérifié table par table, pas juste "0 violation").
select ok(
  (
    -- con.conrelid (cl) = table ENFANT qui porte la colonne FK nullable et serait donc
    -- silencieusement modifiée ; con.confrelid (fcl) = table PARENTE référencée, celle
    -- qui est réellement supprimée. F8 : cl doit être une table conservée, fcl une table
    -- encore classée DELETE — et c'est cl (pas fcl) qui doit porter purge_snapshot.
    select bool_and(exists(
      select 1 from information_schema.columns c2
      where c2.table_schema = 'public' and c2.table_name = cl.relname and c2.column_name = 'purge_snapshot'
    ))
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_class fcl on fcl.oid = con.confrelid
    where con.contype = 'f' and con.confdeltype in ('n','d')
      and cl.relnamespace = 'public'::regnamespace and fcl.relnamespace = 'public'::regnamespace
      and cl.relname = any(public.tables_conservees_purge())
      and fcl.relname <> all(public.tables_conservees_purge())
      and fcl.relname <> all(public.tables_anonymisees_purge())
      -- Seules les tables entreprise_id sont jamais candidates à la purge réelle
      -- (rapport_purge_entreprise ne scanne que celles-là) : une table sans
      -- entreprise_id (ex. utilisateurs, plateforme) n'est jamais purgée par ce
      -- mécanisme, donc son FK SET NULL depuis une table conservée n'est pas un F8.
      and exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=fcl.relname and c.column_name='entreprise_id')
  ),
  'F8 : toute table conservée référençant (SET NULL/SET DEFAULT) une table encore DELETE porte une colonne purge_snapshot'
);

select * from finish();
rollback;
