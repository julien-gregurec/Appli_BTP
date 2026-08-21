# TERRAIN-MOBILE-V1 — Checklist de clôture

État consolidé des correctifs terrain (permissions, lecture seule,
pointage) à travers les lots V1B, V1C et V1D/V1D2. Reconstruite à
l'occasion de V1D2 : la version précédente de ce fichier n'était présente
que sur une lignée de commits non incluse dans l'intégration Production
(`fef8e0e`), et n'a donc pas été importée telle quelle pour éviter un état
partiel/incohérent.

## V1B — Permission granulaire Terrain

- [x] Permission `ajouter_documents_chantier` créée, distincte de
      `gerer_chantiers` : autorise photos/documents/comptes-rendus sans
      droit de gestion complet du chantier.
- [x] Policy `documents_chantier_ajout_terrain` (INSERT) + policy
      RESTRICTIVE `role_gestion_insert` élargie sur `documents_chantier`.
- [x] `comptes_rendus_chantier` : policy unique remplacée par 4 policies
      dédiées (lecture/écriture/modification/suppression), écriture
      désormais soumise à `gerer_chantiers` OU `ajouter_documents_chantier`.
- [x] Policy storage `role_gestion_fichiers_insert` élargie pour le bucket
      `chantier-documents` uniquement (4 autres buckets inchangés).
- [x] Attribution par défaut aux postes Ouvrier/Chef d'équipe/Chef de
      chantier.
- [x] Fix `ajouter_audit_note_frais` : `digest()` qualifié
      `extensions.digest(...)` (pgcrypto installé hors `public`).
- [x] 22 assertions pgTAP dédiées.
- Validé Preview : voir
  [TERRAIN_MOBILE_V1B_CORRECTIONS_ELSATIA.md](TERRAIN_MOBILE_V1B_CORRECTIONS_ELSATIA.md).

## V1C — Lecture seule réelle + nettoyage P1/P2

- [x] CSS lecture seule corrigé : `form[method="post"]` (ne matchait jamais
      les Server Actions) → `form:not([method="get"])`.
- [x] `droitsGestionPour()` centralisé dans `module-permissions.ts`, utilisé
      par `proxy.ts` et `ModuleAccessBoundary.tsx` (une seule source de
      vérité pour la barrière serveur ET l'indicateur visuel).
- [x] Retrait des branches `auth.role()='anon'` vestigiales dans 4 fonctions
      de pointage (`peut_pointer_pour_employe`, `peut_consulter_pointage_
      employe`, `cloturer_session_pointage_interne`, `valider_preuve_
      pointage`) — défense en profondeur, `anon` n'avait déjà aucun
      privilège `EXECUTE`.
- [x] P2 pointage/comptes-rendus : messages GPS clarifiés, lien GPS-arrivée
      conditionnel, dictée compte-rendu (`useSyncExternalStore`, fix
      hydratation SSR).
- [x] 13 assertions pgTAP dédiées.
- Validé Preview : voir
  [TERRAIN_MOBILE_V1C_READONLY_P1P2_ELSATIA.md](TERRAIN_MOBILE_V1C_READONLY_P1P2_ELSATIA.md).

## V1D / V1D2 — Intégration Production contrôlée

- [x] V1B + V1C intégrés en Production, isolément, sans rouvrir d'autre lot.
- [x] Anomalie détectée avant écriture Production (migration 218 référençait
      des objets de coût horaire inexistants) — corrigée à la source, sans
      créer les objets fantômes, avant toute application Production.
- [x] Migration corrective `20260820000219` pour Preview (avait déjà exécuté
      la version cassée) ; Production a directement reçu la version
      corrigée.
- [x] 8 assertions pgTAP runtime ajoutées (exécution réelle, pas seulement
      les privilèges).
- [x] 4 migrations appliquées en Production, vérifiées post-application.
- [x] Déploiement `elsatia-production` (`app.elsatia.fr`), région Europe
      confirmée.
- [x] Rollback formel écrit avant toute écriture Production.
- Détails complets : voir
  [TERRAIN_MOBILE_V1D_PRODUCTION_ELSATIA.md](TERRAIN_MOBILE_V1D_PRODUCTION_ELSATIA.md).

## V1E — Recette Production réelle

- [x] Preview validé (V1B, V1C — pgTAP + recette manuelle antérieure).
- [x] Production structurelle validée (V1D/V1D2 — définitions/policies
      vérifiées octet pour octet, migrations effectives confirmées).
- [x] **Production fonctionnelle réelle validée** : comptes Terrain et Chef
      d'équipe réels (`RECETTE-TERRAIN-V1E`, entreprise fictive dédiée),
      connexion, planning (lecture seule + refus serveur direct), pointage
      (arrivée/départ réels), documents (formulaire accessible ; upload
      fichier non testable avec l'outillage de ce lot), compte-rendu (créé
      réellement), notes de frais (brouillon réel + hash d'audit SHA-256
      confirmé), restrictions financières (devis/factures/rentabilité
      refusés à la navigation et au niveau serveur), isolation cross-tenant
      (zéro fuite), et surtout : **validation réelle d'un pointage par Chef
      d'équipe en cliquant dans l'interface, confirmant définitivement le
      correctif V1D2** (`verification_statut='valide'`, `verification_par`
      correct, aucune erreur).
- [x] Nettoyage : résidu minimal et volontaire (1 entreprise + 1 compte,
      ancrés par le trigger d'immutabilité de l'audit des notes de frais —
      non désactivé, comme prévu). Tout le reste vérifié à zéro. `elsatia`
      confirmée intacte.
- Point non tranché, documenté sans impact sécurité : anomalie isolée sur un
  test SQL direct d'INSERT `documents_chantier` (probable artefact d'outil,
  contredit par pgTAP + structure + UI + table sœur).
- Détails complets : voir
  [TERRAIN_MOBILE_V1E_RECETTE_PRODUCTION_ELSATIA.md](TERRAIN_MOBILE_V1E_RECETTE_PRODUCTION_ELSATIA.md).

## Écart connu, hors périmètre (non corrigé, documenté)

- `document_commercial_par_token` (P9, migration `20260812000200`) reste
  exécutable par `anon` — fonctionnalité volontaire de partage de document
  par jeton, sans rapport avec Terrain. Le test pgTAP
  `isolation_multitenant_surface.test.sql` (assertion 8) échoue en
  conséquence sur toute base ayant cette migration ; préexistant, non
  introduit par V1B/V1C/V1D.
- Écart historique de migrations entre Preview et Production
  (`20260812000200` présent sur Production, absent de Preview au moment de
  V1D) : non réconcilié, non renuméroté, par choix explicite — hors
  périmètre Terrain.

## Bloc Terrain — état

Les quatre lots (V1B, V1C, V1D/V1D2, V1E) sont clos, déployés en Production
et validés fonctionnellement en conditions réelles. Bloc Terrain
définitivement clos, sous réserve d'un retour réel d'un premier client.
