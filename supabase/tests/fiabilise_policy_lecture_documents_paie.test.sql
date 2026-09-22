-- La policy de lecture de documents-paie ne doit plus dépendre d'une sous-requête
-- directe sur utilisateurs_entreprises (table protégée par RLS) évaluée depuis
-- storage.objects. Voir 20260922000188_fiabilise_policy_lecture_documents_paie.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select ok(
  exists(
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'documents_paie_select' and cmd = 'SELECT'
  ),
  'la policy de lecture documents-paie existe toujours'
);

select ok(
  (
    select qual not like '%utilisateurs_entreprises%'
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'documents_paie_select'
  ),
  'la policy ne fait plus de sous-requête directe sur utilisateurs_entreprises'
);

select * from finish();
rollback;
