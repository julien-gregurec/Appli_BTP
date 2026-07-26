-- Retire la fonction de diagnostic temporaire (20260724000178), plus necessaire :
-- verification faite, la validation "meme devis, pas un avoir" fonctionne
-- correctement (true pour une facture du bon devis, false pour un autre devis).
drop function if exists public.debug_validation_facture_origine(uuid,uuid,uuid);
