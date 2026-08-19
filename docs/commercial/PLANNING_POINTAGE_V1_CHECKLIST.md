# PLANNING-POINTAGE-V1 — Checklist

Référence : `docs/commercial/PLANNING_POINTAGE_V1_AUDIT_ELSATIA.md`. Ce lot est un audit — aucune ligne de code fonctionnel n'est modifiée.

## Cartographie

- [x] Tous les objets planning/pointage cartographiés (table, rôle réel, granularité, consommateurs) (§1-2).
- [x] Clarification terminologique : `planning_evenements` (calendrier chantier, sans salarié) vs `affectations` (planning individuel réel, sans horaire précis) — deux objets distincts, aucun nom supposé (§3).
- [x] Découverte : `saisir_son_pointage` est le seul droit de l'application qui ne suit pas le système de permissions par poste (toggle individuel `pointage_personnel_actif`) — a fait échouer la première tentative de reproduction empirique avant d'être identifié.

## Vérifications empiriques réalisées

- [x] Impersonation (§49) : bloquée par RLS, reproduit en Local.
- [x] Double pointage / double session ouverte (§18) : bloqué par contrainte unique, reproduit en Local.
- [x] Snapshot du coût horaire résistant à une correction de durée post-validation (§27-28) : reproduit en Local avec des montants exacts (20€/h conservé après correction 8h→10h, malgré un changement de tarif entre-temps).
- [x] Rejet exclu de la rentabilité (§26) : confirmé par lecture directe du filtre `calculerRentabiliteChantiers`.

## Failles/gaps identifiés (aucun P0)

- [x] Aucune détection de chevauchement horaire — `affectations` ne stocke pas d'horaire, seulement une durée/jour (P1, §5-6).
- [x] Aucune capacité contractuelle par salarié — horaire attendu uniforme entreprise entière (P1, §12).
- [x] Congé approuvé + affectation chantier peuvent coexister sans alerte (P1, §13).
- [x] Aucun contrôle sur chantier terminé/annulé pour affectation/pointage (P1, §34-35).
- [x] Correction de pointage déjà validé non tracée — pas d'auteur, pas d'ancienne valeur (P1, §51).
- [x] Suppression d'un pointage validé possible sans verrou ni trace (P1, §52).
- [x] Branches `auth.role()='anon'` vestigiales dans plusieurs fonctions pointage — inertes aujourd'hui (grants anon absents partout, vérifié), mais motif répété plutôt que centralisé (P1, §53).
- [x] Outils IA non filtrés par permission au niveau liste, protection uniquement par RLS en aval (P2, §45).
- [x] Pas de vue « charge planning » dédiée, pas de validation en masse RPC, pas d'alerte planning>budget (P2/P3, §11, §25, §58-60).

## Non vérifié dans ce lot (explicite)

- [ ] Contrôle visuel UX (bureau, mobile, GPS, pointage) — aucune session authentifiée disponible.
- [ ] Test IA en conditions réelles (question type dirigeant/terrain).
- [ ] Scénarios chiffrés 100/90/80, multi-salariés, multi-chantiers, absence+planning — non exécutés avec des RPC réelles (structure jugée mécaniquement correcte par lecture de code, priorité donnée à la sécurité dans le temps disponible).
- [ ] Test de charge/performance.

## Classification et décision

- [x] Classification P0–P3 complète, aucun P0 (§70).
- [x] GO/NO-GO par segment : planning bureau GO, planning mobile GO sous réserve (non vérifié visuellement), pointage terrain GO, validation GO avec réserve, planning→rentabilité GO (§71).
- [x] Décision globale : **commercialisation possible** pour un premier chantier réel de taille modeste ; les P1 sont des trous de contrôle à traiter avant montée en charge, pas des bugs actifs.

## Hors périmètre respecté

- [x] Aucun correctif fonctionnel appliqué.
- [x] Aucune migration, aucune Production, aucune donnée réelle.
- [x] Toutes les reproductions empiriques faites en transaction annulée (`rollback`), Local uniquement.

## Livrables

- [x] `docs/commercial/PLANNING_POINTAGE_V1_AUDIT_ELSATIA.md`.
- [x] `docs/commercial/PLANNING_POINTAGE_V1_CHECKLIST.md` (ce fichier).
- [ ] Commit dédié `docs(commercial): auditer planning et pointage ELSATIA`.
