-- Passage definitif en production authentifiee.
-- Toutes les policies et tous les privileges du role anon provenaient du prototype.

do $$
declare r record;
begin
  for r in
    select schemaname,tablename,policyname
    from pg_policies
    where schemaname in ('public','storage') and 'anon'=any(roles)
  loop
    execute format('drop policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  end loop;
end $$;

revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
revoke usage on schema public from anon;
revoke all privileges on storage.objects from anon;
revoke all privileges on storage.buckets from anon;

-- Une fonction SECURITY DEFINER n'est jamais executable par PUBLIC. Les droits
-- explicites deja accordes a authenticated dans chaque migration sont conserves.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public,anon',r.signature);
  end loop;
end $$;

-- Le contexte sans connexion ne doit plus exister sur la base de production.
do $$
begin
  if to_regprocedure('public.dev_contexte_entreprise()') is not null then
    revoke execute on function public.dev_contexte_entreprise() from public,anon,authenticated;
    drop function public.dev_contexte_entreprise();
  end if;
end $$;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

notify pgrst,'reload schema';
