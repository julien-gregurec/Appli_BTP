-- Diagnostic temporaire (à supprimer juste après usage) : vérifier si les policies
-- RESTRICTIVE de 20260718000113_lecture_modules_selon_permissions.sql (jamais commitée
-- en git, marquée "applied" lors du repair de l'historique des migrations) sont réellement
-- présentes en base, ou si le repair a marqué comme faite une migration jamais exécutée.
create or replace function public.debug_check_policy(p_table text, p_policy text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from pg_policies where schemaname='public' and tablename=p_table and policyname=p_policy);
$$;
revoke all on function public.debug_check_policy(text,text) from public,anon,authenticated;
grant execute on function public.debug_check_policy(text,text) to service_role;
