-- Index trigram pour les recherches ILIKE des listes paginées (devis,
-- factures, clients, chantiers).
--
-- Constat (mission perf/gp-capacity-readiness-v1) : `devis_liste_paginee`,
-- `factures_liste_paginee`, `clients_liste_paginee` et
-- `chantiers_liste_paginee` (migrations 118-121) filtrent par
-- `... ilike '%' || v_recherche || '%'` sur plusieurs colonnes (numero,
-- nom, prenom, societe, ville, reference_interne), sans aucun index
-- adapté — seul entreprise_id est indexé. Mesuré : recherche ILIKE sur
-- devis.numero, 1,75 s sur ~5000 devis (Bitmap Heap Scan complet de
-- l'entreprise, filtré ligne à ligne). Le motif '%texte%' (comme le motif
-- utilisé par ces quatre RPC) n'est pas satisfiable par un index btree
-- standard, mais l'est par un index trigram (pg_trgm, extension déjà
-- disponible sur Supabase, non encore utilisée dans ce schéma).
--
-- Ne remplace pas les colonnes déjà bien servies par un btree simple
-- (recherches exactes/préfixe) — vient seulement en complément pour les
-- colonnes réellement recherchées par motif ILIKE dans les quatre RPC de
-- liste. Aucun changement de comportement : mêmes résultats.
--
-- Limite constatée et non résolue ici (documentée dans le rapport, § SQL) :
-- sous le rôle `authenticated` (RLS active), le planner PostgreSQL choisit
-- encore le Bitmap Index Scan sur entreprise_id plutôt que l'index trigram
-- pour `devis_liste_paginee`/`chantiers_liste_paginee` — hors RLS (rôle
-- postgres, ou service_role), l'index trigram est utilisé et la requête
-- passe de ~1,75 s à <1 ms. Cause probable : les policies RESTRICTIVE
-- (a_permission/est_membre_actif, non LEAKPROOF) imposent une barrière de
-- sécurité qui limite les transformations de plan combinant plusieurs index
-- bitmap. Marquer ces fonctions LEAKPROOF lèverait la limite mais est un
-- changement de sécurité que cette mission ne prend pas (§ 26 : aucun
-- changement de sécurité pour gagner du temps) — à qualifier séparément,
-- avec preuve que ces fonctions ne peuvent réellement rien laisser fuir
-- (pas d'erreur dépendant de la valeur, pas d'effet de bord observable).
-- Cette migration reste utile telle quelle : les index servent déjà tout
-- accès hors RLS stricte (RPC SECURITY DEFINER, tâches d'administration,
-- exports) et posent la base d'un futur correctif ciblé sur le planner.
--
-- Création non concurrente (comme le reste du ledger) : acceptable au
-- volume actuel de la RC. Sur une base Production nettement plus volumineuse
-- au moment du déploiement réel, remplacer par CREATE INDEX CONCURRENTLY
-- (hors transaction), un par un.
create extension if not exists pg_trgm with schema extensions;

create index if not exists devis_numero_trgm_idx on public.devis using gin (numero extensions.gin_trgm_ops);
create index if not exists factures_numero_trgm_idx on public.factures using gin (numero extensions.gin_trgm_ops);
create index if not exists clients_nom_trgm_idx on public.clients using gin (nom extensions.gin_trgm_ops);
create index if not exists clients_prenom_trgm_idx on public.clients using gin (prenom extensions.gin_trgm_ops);
create index if not exists clients_societe_trgm_idx on public.clients using gin (societe extensions.gin_trgm_ops);
create index if not exists chantiers_nom_trgm_idx on public.chantiers using gin (nom extensions.gin_trgm_ops);
create index if not exists chantiers_reference_interne_trgm_idx on public.chantiers using gin (reference_interne extensions.gin_trgm_ops);
create index if not exists chantiers_ville_trgm_idx on public.chantiers using gin (ville extensions.gin_trgm_ops);

analyze public.devis, public.factures, public.clients, public.chantiers;
