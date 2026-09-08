# docs/drone — ELSATIA Drone

Étude d'architecture produite le **2026-09-07**, puis premier lot de code (noyau et contrats),
puis prototype de pipeline photogrammétrique. Toujours **aucune migration, aucun déploiement,
aucune modification Production** : le ledger de la cible cutover reste figé à 263.

| Livrable | Fichier | Objet |
|---|---|---|
| 1 | [ELSATIA_DRONE_ARCHITECTURE_MVP_V1.md](ELSATIA_DRONE_ARCHITECTURE_MVP_V1.md) | Audit du dépôt, architecture cible A→U, risques, décisions, découpage en 4 conversations |
| 2 | [ELSATIA_DRONE_SDK_COMPATIBILITY_V1.md](ELSATIA_DRONE_SDK_COMPATIBILITY_V1.md) | Matrice factuelle des SDK drone, dont le DJI Mini 3 |
| 3 | [ELSATIA_DRONE_PHOTOGRAMMETRY_OPTIONS_V1.md](ELSATIA_DRONE_PHOTOGRAMMETRY_OPTIONS_V1.md) | Comparatif des moteurs, licences, coûts, recommandation MVP |
| 4 | [ELSATIA_DRONE_DATA_MODEL_V1.md](ELSATIA_DRONE_DATA_MODEL_V1.md) | Entités, provenance des mesures, cycles de vie. Sans migration |
| 5 | [ELSATIA_DRONE_MVP_ROADMAP_V1.md](ELSATIA_DRONE_MVP_ROADMAP_V1.md) | P0 / P1 / P2 / hors MVP, lots parallélisables, critères d'acceptation |
| — | [data-contracts-implementation-v1.md](data-contracts-implementation-v1.md) | **Implémentation** du noyau `packages/drone-core` : types, unités, provenance, idempotence, contrats d'export, interfaces, jeux d'essai |
| — | [ODM_LICENSE_RISK.md](ODM_LICENSE_RISK.md) | AGPL-3.0, clause réseau, questions à poser au conseil PI. **Ne conclut rien juridiquement** |
| — | [PHOTOGRAMMETRY_PIPELINE_PROTOTYPE_V1.md](PHOTOGRAMMETRY_PIPELINE_PROTOTYPE_V1.md) | **Prototype** `packages/drone-photogrammetry` : adaptateurs ODM/Metashape/démo, file, ingestion, coûts, protocole de benchmark, verdicts |

## Seconde génération — lot architecture Scan (2026-09-08)

Lot `ELSATIA-DRONE-SCAN-ARCHITECTURE-MASTER-V1`, branche
`audit/elsatia-drone-scan-architecture-master-v1`, base `698eb54`.
Ces documents **n'annulent aucun des précédents** : ils les auditent, rejouent leurs
vérifications externes et comblent le manque. Toujours aucune migration, aucun code.

| Livrable | Fichier | Objet |
|---|---|---|
| A | [ELSATIA-DRONE-SCAN-ARCHITECTURE-AUDIT-REPORT.md](ELSATIA-DRONE-SCAN-ARCHITECTURE-AUDIT-REPORT.md) | Audit de l'existant Drone avec SHA complets, sept constats, verdict |
| B | [ELSATIA-DRONE-SCAN-FUNCTIONAL-SPECIFICATION-V1.md](ELSATIA-DRONE-SCAN-FUNCTIONAL-SPECIFICATION-V1.md) | **Arbitrage Drone / Scan**, 8 rôles, 22 types de missions |
| C | [ELSATIA-DRONE-SDK-HARDWARE-COMPATIBILITY-V1.md](ELSATIA-DRONE-SDK-HARDWARE-COMPATIBILITY-V1.md) | Matrice **R2** au 2026-09-08 — correction majeure sur Parrot |
| D | [ELSATIA-DRONE-MISSION-FLIGHT-DATA-MODEL-V1.md](ELSATIA-DRONE-MISSION-FLIGHT-DATA-MODEL-V1.md) | Dossier d'intervention, checklist, provenance des données |
| E | [ELSATIA-DRONE-OFFLINE-MEDIA-SYNC-V1.md](ELSATIA-DRONE-OFFLINE-MEDIA-SYNC-V1.md) | Hors-ligne réel, idempotence, double clé média |
| F | [ELSATIA-DRONE-MEASUREMENT-PHOTOGRAMMETRY-V1.md](ELSATIA-DRONE-MEASUREMENT-PHOTOGRAMMETRY-V1.md) | Six niveaux de mesure, protocole d'étalonnage, IA |
| G | [ELSATIA-DRONE-GP-RESERVES-DOE-BRIDGES-V1.md](ELSATIA-DRONE-GP-RESERVES-DOE-BRIDGES-V1.md) | Les trois ponts + le port DOE manquant |
| H | [ELSATIA-DRONE-SECURITY-PRIVACY-COMPLIANCE-V1.md](ELSATIA-DRONE-SECURITY-PRIVACY-COMPLIANCE-V1.md) | Sécurité, vie privée, **réglementation datée post-2026** |
| I | [ELSATIA-DRONE-BUSINESS-MODEL-V1.md](ELSATIA-DRONE-BUSINESS-MODEL-V1.md) | Trois modèles, branchés sur le moteur commercial |
| J | [ELSATIA-DRONE-IMPLEMENTATION-ROADMAP-V1.md](ELSATIA-DRONE-IMPLEMENTATION-ROADMAP-V1.md) | 15 lots, préalables hors développement, estimation |
| K | [ELSATIA-DRONE-TEST-STRATEGY-V1.md](ELSATIA-DRONE-TEST-STRATEGY-V1.md) | 50 tests spécifiés, non exécutés |
| L | [ELSATIA-DRONE-WIREFRAMES-V1.md](ELSATIA-DRONE-WIREFRAMES-V1.md) | 8 schémas fonctionnels originaux |
| M | [ELSATIA-DRONE-SCAN-MASTER-FINAL-REPORT-V1.md](ELSATIA-DRONE-SCAN-MASTER-FINAL-REPORT-V1.md) | Rapport final, verdict, décisions demandées |

### Trois faits nouveaux du 2026-09-08

1. **Parrot expose Ground SDK iOS (Swift), une Web API REST et une licence BSD-3** — seule
   voie connue vers un mode connecté sur iPhone. DJI ferme cette porte par construction.
2. **La réglementation française a changé au 1ᵉʳ janvier 2026** : fin des scénarios nationaux
   S-1/S-2/S-3, invalidation des brevets par déclaration sur l'honneur.
3. **La doctrine de provenance du noyau cite un fichier absent du train canonique** —
   `apps/tools/src/lib/tracing/measurement-origin.ts` n'existe ni à `996be15`, ni à `1fc1331`,
   ni sur `main`.

---

Les fichiers thématiques annoncés au §122 du brief (`sdk-compatibility.md`,
`photogrammetry.md`, `measurement-quality.md`, `solar.md`, `privacy.md`,
`integration-contracts.md`) ne sont pas créés en doublon : leur contenu est porté par les
cinq livrables ci-dessus, qui portent les noms imposés par les §125 à §129.

## Trois conclusions à retenir

1. **Le socle multi-app ELSATIA est réutilisable sans seconde architecture** auth / tenant /
   rôles / facturation. `applications_elsatia` accepte n'importe quel code applicatif.
2. **Le pilotage DJI ne peut pas porter la valeur du produit** : MSDK V5 est Android
   uniquement, la gamme Mini n'accepte que les radiocommandes sans écran, et le Mini 3 Pro
   n'a pas de missions waypoint. L'import après vol est le mode nominal.
3. **L'infrastructure de traitement asynchrone n'existe pas dans le dépôt** — ni file, ni
   worker, ni GPU. C'est le poste le plus lourd et le plus incertain.

## Avant tout code

- Arbitrage de priorité face à **ELSATIA-UI-V2** et au **cutover Production** (ledger figé
  à 263 migrations).
- Conseil en propriété intellectuelle sur l'**AGPL-3.0** d'OpenDroneMap.
- **Test matériel réel** Mini 3 + RC-N1 + Android avant toute promesse de mode connecté.

## Où en est le prototype photogrammétrique

`packages/drone-photogrammetry` **implémente** le port `ReconstructionEngineAdapter` du
noyau : adaptateur NodeODM expérimental, contrat Metashape sans implémentation, moteur de
démonstration déterministe, file locale, ingestion (téléversement par morceaux, EXIF,
qualité, sécurité), rapatriement des artefacts et formule de coût. Exécutable sans GPU ni
réseau.

Trois verdicts :

- **ODM techniquement viable : oui**, sous réserve de mesure — aucune reconstruction réelle
  n'a été exécutée.
- **ODM commercialement autorisé : non** — conseil PI non saisi.
- **Metashape en repli : viable sur le plan de l'architecture** (substitution prouvée par
  test), non vérifié en exploitation — aucune licence acquise.

Aucun benchmark n'a été exécuté et aucun tarif n'est calculable : le code refuse de
convertir un coût en crédits tant que les mesures réelles n'existent pas.
