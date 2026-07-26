-- Retire la fonction de diagnostic temporaire (20260724000170), plus necessaire :
-- verification faite, cloturer_session_pointage (20260724000169) priorise bien
-- affectations.heures sur l'horaire generique quand une affectation correspondante
-- existe (confirme : 4h planifiees vs 0h generique un dimanche -> v_attendu=4).
drop function if exists public.debug_v_attendu(uuid);
