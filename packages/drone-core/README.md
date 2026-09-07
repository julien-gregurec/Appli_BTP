# `@elsatia/drone-core`

Noyau typé et contrats d'**ELSATIA Drone**. Package privé, consommé par une future
application `apps/drone` et par les services qui produisent ou consomment ses exports.

## Ce que ce package contient

| Domaine | Fichiers |
|---|---|
| Unités canon, WGS84, conversions | `src/units.ts` |
| Identifiants typés | `src/ids.ts` |
| Types transverses, lien faible inter-applications | `src/common.ts` |
| Provenance et qualité de mesure | `src/provenance.ts`, `src/quality.ts` |
| Entités métier | `src/project.ts`, `src/mission.ts`, `src/device.ts`, `src/media.ts`, `src/reconstruction.ts`, `src/roof.ts`, `src/measurement.ts`, `src/solar.ts`, `src/inspection.ts`, `src/export-artifact.ts` |
| Sérialisation stable et idempotence | `src/serialization.ts`, `src/idempotency.ts` |
| Contrats d'export versionnés | `src/exports/` |
| Interfaces (stockage, drone, moteur, écosystème) | `src/ports/` |
| Validation runtime | `src/validation/` |
| Jeux d'essai anonymes | `src/fixtures/` |

## Ce qu'il ne contient pas, et ne doit pas contenir

- **Aucune migration SQL.** Le ledger de la cible cutover Production reste figé à 263.
- Aucun accès réseau, aucun client Supabase, aucun secret.
- Aucune implémentation DJI, ODM ou Metashape — seulement leurs interfaces.
- Aucune interface utilisateur : Drone héritera de la cible UI-V2.

## Règles à ne pas contourner

1. **Aucune valeur sans provenance.** Toute grandeur porte son origine, sa nature
   (`MESURÉ` / `CALCULÉ` / `ESTIMÉ`) et sa qualité, jusqu'au PDF client.
2. **Le maillon faible gagne.** `combineOrigins` ne se réécrit pas ailleurs.
3. **Ne jamais inventer une précision.** `uncertainty_value: null` est une valeur correcte, et
   aucune fonction de ce package ne dérive un niveau de qualité à partir de métriques : les
   seuils sont la sortie d'une campagne métrologique qui n'a pas eu lieu.
4. **ELSATIA propose, l'utilisateur valide.** Une géométrie détectée reste une proposition
   tant que `validated_by` est nul.
5. **Le mode standalone est un test, pas une intention.** Un projet dont toutes les références
   externes sont nulles doit fonctionner à 100 %.

## Tests

Les tests sont exécutés par la configuration Vitest de la racine
(`include: ["src/**/*.test.ts", "packages/**/*.test.ts"]`).

```bash
npx vitest run packages/drone-core
```

Documentation : [`docs/drone/data-contracts-implementation-v1.md`](../../docs/drone/data-contracts-implementation-v1.md).
