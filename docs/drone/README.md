# docs/drone — ELSATIA Drone

Étude d'architecture produite le **2026-09-07**, puis premier lot de code (noyau et contrats)
le **2026-09-07**. Toujours **aucune migration, aucun déploiement, aucune modification
Production** : le ledger de la cible cutover reste figé à 263.

| Livrable | Fichier | Objet |
|---|---|---|
| 1 | [ELSATIA_DRONE_ARCHITECTURE_MVP_V1.md](ELSATIA_DRONE_ARCHITECTURE_MVP_V1.md) | Audit du dépôt, architecture cible A→U, risques, décisions, découpage en 4 conversations |
| 2 | [ELSATIA_DRONE_SDK_COMPATIBILITY_V1.md](ELSATIA_DRONE_SDK_COMPATIBILITY_V1.md) | Matrice factuelle des SDK drone, dont le DJI Mini 3 |
| 3 | [ELSATIA_DRONE_PHOTOGRAMMETRY_OPTIONS_V1.md](ELSATIA_DRONE_PHOTOGRAMMETRY_OPTIONS_V1.md) | Comparatif des moteurs, licences, coûts, recommandation MVP |
| 4 | [ELSATIA_DRONE_DATA_MODEL_V1.md](ELSATIA_DRONE_DATA_MODEL_V1.md) | Entités, provenance des mesures, cycles de vie. Sans migration |
| 5 | [ELSATIA_DRONE_MVP_ROADMAP_V1.md](ELSATIA_DRONE_MVP_ROADMAP_V1.md) | P0 / P1 / P2 / hors MVP, lots parallélisables, critères d'acceptation |
| — | [data-contracts-implementation-v1.md](data-contracts-implementation-v1.md) | **Implémentation** du noyau `packages/drone-core` : types, unités, provenance, idempotence, contrats d'export, interfaces, jeux d'essai |

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
