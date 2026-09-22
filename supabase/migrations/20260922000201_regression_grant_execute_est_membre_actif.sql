-- RÉGRESSION RÉELLE PROUVÉE PAR TEST SUR BASE RÉELLE (qualification GP hardening V1,
-- docs/qualification/ELSATIA_GP_HARDENING_REAL_DB_QUALIFICATION_V1.md) : public.est_membre_actif
-- et public.entreprise_sans_membres, toutes deux SECURITY DEFINER et référencées DIRECTEMENT
-- (pas via un wrapper déjà autorisé) dans plus de 100 policies RLS couvrant la quasi-totalité
-- du schéma (clients, entreprises, postes, employes, utilisateurs_entreprises, devis, factures,
-- storage.objects, etc.), ont perdu tout accès EXECUTE pour `authenticated` dès
-- 20260714000078_fermeture_acces_anonyme_production.sql : ce correctif balaie RÉTROACTIVEMENT
-- « revoke execute on function <sig> from public,anon » sur CHAQUE fonction SECURITY DEFINER
-- déjà créée à cette date (dont est_membre_actif et entreprise_sans_membres, créées dans
-- 20260710000001). Revoquer d'PUBLIC retire l'accès implicite dont `authenticated` héritait
-- (aucun droit direct ne lui avait jamais été accordé) ; contrairement à `a_permission`
-- (20260713000043, `grant execute ... to authenticated` explicite, donc survit au balayage),
-- aucune migration ultérieure ne régrant ces deux fonctions à `authenticated`.
--
-- PRÉEXISTANT À CETTE BRANCHE (présent identique sur `main`, migration antérieure au 2026-09-22 :
-- aucun des 34 correctifs GP hardening n'y touche) : ce n'est donc pas une régression introduite
-- par le hardening lui-même, mais un bug bloquant hérité, révélé ici car cette qualification est
-- la première à rejouer les migrations et à interroger la base avec le rôle `authenticated` réel
-- (SET ROLE + JWT, comme PostgREST) plutôt qu'en superutilisateur ou en lecture de code seule.
--
-- VÉRIFIÉ EMPIRIQUEMENT : sur une base fraîche (195/195 migrations, aucune erreur), `SET ROLE
-- authenticated` puis `SELECT 1 FROM public.clients` (ou entreprises/postes/employes/
-- utilisateurs_entreprises/devis/factures/...) échoue avec `permission denied for function
-- est_membre_actif`, avant même l'évaluation de la policy elle-même — cassant la lecture de
-- base pour tout utilisateur authentifié réel sur la quasi-totalité du produit.
--
-- Correctif minimal, strictement additif : accorde EXECUTE à `authenticated`, exactement comme
-- le fait déjà chaque autre fonction SECURITY DEFINER directement référencée par une policy
-- (a_permission, peut_consulter_chantier, peut_acceder_conversation, etc.). Ne modifie ni le
-- corps ni la définition d'aucune fonction, ne touche à aucune policy : la logique
-- d'autorisation (qui a droit à quoi) est strictement inchangée, seule la CAPACITÉ d'appeler la
-- fonction est restaurée. N'élargit aucun périmètre de sécurité : est_membre_actif et
-- entreprise_sans_membres restent des fonctions de lecture pure (aucun effet de bord), leur
-- résultat ne dépend que de l'état déjà lisible par l'appelant courant.

grant execute on function public.est_membre_actif(uuid) to authenticated;
grant execute on function public.entreprise_sans_membres(uuid) to authenticated;

notify pgrst, 'reload schema';
