-- Retire la fonction de diagnostic temporaire (20260724000153), plus necessaire :
-- panne de production identifiee et corrigee par 20260724000154
-- (cloturer_session_pointage a 9 arguments manquant + grant anon corrige).
drop function if exists public.debug_check_execute(text,text);
