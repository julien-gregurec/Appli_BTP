-- Diagnostic temporaire (à supprimer juste après usage) : confirmer si anon peut
-- exécuter cloturer_session_pointage (régression détectée dans 20260723000130).
drop function if exists public.debug_check_execute(text,text);
create or replace function public.debug_check_execute(p_role text, p_function_name text)
returns table(signature text, has_priv boolean)
language sql stable security definer set search_path=public as $$
  select p.oid::regprocedure::text, has_function_privilege(p_role, p.oid, 'execute')
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = p_function_name;
$$;
revoke all on function public.debug_check_execute(text,text) from public,anon,authenticated;
grant execute on function public.debug_check_execute(text,text) to service_role;
