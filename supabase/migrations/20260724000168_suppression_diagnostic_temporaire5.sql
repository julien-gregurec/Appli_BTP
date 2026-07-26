-- Retire la fonction de diagnostic temporaire (20260724000167), plus necessaire :
-- verification faite, le calcul jour-ouvre d'absences_paie (20260724000166) est
-- confirme correct (2 jours / 15h sur un vendredi-lundi couvrant un week-end, au lieu
-- de 4 jours / 28h avec l'ancien calcul calendaire x 7h forfaitaire).
drop function if exists public.debug_absence_jours_ouvres(uuid,date,date);
