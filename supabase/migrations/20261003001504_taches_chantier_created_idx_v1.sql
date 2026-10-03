-- ELSATIA PERFORMANCE HARDENING V9.1 — index taches(chantier_id, created_at).
--
-- La page chantier (src/app/(app)/chantiers/[id]/page.tsx) lit les tâches d'UN chantier
-- triées par created_at ; taches était la seule table « lignes » sans index sur sa clé de
-- rattachement : Seq Scan de toute la table (tous tenants) à chaque affichage
-- (docs/qualification/ELSATIA_SOAK_PERFORMANCE_V1.md § 6, reproduit et mesuré sur V9.1 :
-- docs/qualification/ELSATIA_PERFORMANCE_HARDENING_V9_1.md § Index). Le même index sert
-- aussi la policy de taches (jointure chantiers) et les suppressions en cascade d'un
-- chantier (clé étrangère taches.chantier_id).
--
-- Création non CONCURRENTLY (migration transactionnelle) : verrou SHARE bref sur une
-- table de quelques dizaines de Mo au plus ; les lectures continuent.
--
-- Retour arrière : drop index if exists public.taches_chantier_created_idx;

create index if not exists taches_chantier_created_idx
  on public.taches (chantier_id, created_at);
