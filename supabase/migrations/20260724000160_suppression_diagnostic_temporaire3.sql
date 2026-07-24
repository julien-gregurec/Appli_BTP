-- Retire les fonctions de diagnostic temporaire (20260724000159), plus necessaires :
-- verification faite, la logique de correspondance email/entreprise de
-- plateforme_verifier_et_journaliser_reinitialisation resout correctement un
-- utilisateur reel et rejette bien une entreprise incorrecte.
drop function if exists public.debug_verifier_lookup_reinit(uuid,text);
drop function if exists public.debug_email_utilisateur(uuid);
