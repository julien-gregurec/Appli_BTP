-- Retire la fonction de diagnostic temporaire (20260724000173), plus necessaire :
-- verification faite sur donnees reelles, le garde-fou de surfacturation
-- (20260724000172) fonctionne correctement (devis vierge accepte 60% et 100% pile,
-- devis deja a 100% bloque tout ajout meme minime).
drop function if exists public.debug_garde_fou_devis(uuid,numeric);
