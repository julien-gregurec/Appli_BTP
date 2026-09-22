-- Non exécuté pendant la qualification RGPD (pas de daemon Docker accessible dans le
-- conteneur de qualification) : à lancer avec `supabase test db` avant toute purge en
-- production. Vérifie l'infrastructure de purge (migration 20260729000184), PAS une
-- purge réelle contre des données de production.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

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

select * from finish();
rollback;
