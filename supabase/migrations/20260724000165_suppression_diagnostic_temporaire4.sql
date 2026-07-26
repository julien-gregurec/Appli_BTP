-- Retire les fonctions de diagnostic temporaire (20260724000163/164), plus necessaires :
-- verification faite, notifier_pointages_manquants_et_a_valider fonctionne correctement
-- (la partie "heures a valider" a cree une vraie notification poussee automatiquement ;
-- la partie "pointage manquant" a ete confirmee correcte sur un cas reel positif un jeudi,
-- et correctement silencieuse sur un samedi sans horaire attendu).
drop function if exists public.debug_pointage_manquant();
drop function if exists public.debug_pointage_manquant(date);
