-- Index préventif : journal_activite(entreprise_id, created_at desc).
--
-- journal_activite n'a aujourd'hui aucun lecteur applicatif (grep sur
-- src/ : uniquement des INSERT, depuis documents-envoi.ts et
-- signatures-documents.ts — aucune page ne liste ce journal). Ce n'est donc
-- pas un P0/P1 mesuré en usage réel.
--
-- Mais la seule requête de consultation plausible (« derniers événements »,
-- tri par date, page paginée — motif identique à toutes les autres listes de
-- ce schéma) ferait aujourd'hui un Seq Scan complet même avec LIMIT, faute
-- d'index couvrant le tri : mesuré 9,9 s pour `... where entreprise_id = $1
-- order by created_at desc limit 50` sur 28 400 lignes (mission
-- perf/gp-capacity-readiness-v1). Ajouté par prudence avant qu'un écran
-- d'audit ne soit construit sur cette table, en suivant le motif déjà en
-- place pour clients/chantiers/devis/factures/pointages/notifications
-- (entreprise_id, colonne de tri desc).
create index if not exists journal_activite_entreprise_created_idx
  on public.journal_activite(entreprise_id, created_at desc);

analyze public.journal_activite;
