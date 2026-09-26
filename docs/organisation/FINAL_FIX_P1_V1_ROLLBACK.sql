-- FINAL-FIX-P1-V1 — Rollback préparé pour les migrations 221 et 222,
-- NON exécuté par défaut. À n'appliquer qu'en cas d'anomalie réelle
-- constatée après déploiement, via la méthode isolée
-- (supabase db query --linked -f), jamais via db push.
--
-- Note : P1-1, P1-2 et P1-5 sont du code applicatif / de la vérification
-- pure, sans migration DB — leur rollback est un simple retour de commit
-- Git (revert), pas un script SQL.

begin;

-- Migration 20260822000222 (P1-4) : retire le déclencheur d'immutabilité
-- des factures émises. Ne retire PAS trg_lignes_factures_brouillon_only
-- (préexistant à ce lot, hors périmètre).
drop trigger if exists verrou_facture_emise on public.factures;
drop function if exists public.verrouiller_facture_emise();

-- Migration 20260822000221 (P1-3) : réintroduirait le motif anon vestigial
-- retiré des 16 fonctions. Ce rollback n'est PAS recommandé (il
-- réintroduirait le point de vigilance identifié par l'audit) — fourni
-- uniquement pour complétude, à n'utiliser qu'en dernier recours si l'une
-- de ces 16 fonctions montrait un comportement inattendu après migration.
-- Les définitions précédentes exactes sont dans le commit Git parent de
-- 4211014 (fix(securite): retirer le motif de contournement anon vestigial).

commit;
