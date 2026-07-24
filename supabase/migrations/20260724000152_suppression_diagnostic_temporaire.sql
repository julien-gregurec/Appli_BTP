-- Retire la fonction de diagnostic temporaire (20260724000151), plus nécessaire :
-- vérification faite, les policies RESTRICTIVE de 20260718000113 sont bien en place.
drop function if exists public.debug_check_policy(text,text);
