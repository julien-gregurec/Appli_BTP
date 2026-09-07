# @elsatia/drone-photogrammetry

Prototype de pipeline de reconstruction photogrammétrique asynchrone pour ELSATIA Drone.

Ce paquet **implémente** ; il ne redéfinit rien. Le port `ReconstructionEngineAdapter`, les
statuts, les transitions, les catégories d'erreur, la clé d'idempotence, les références de
stockage et la forme des artefacts appartiennent à
[`@elsatia/drone-core`](../drone-core/README.md).

**Prototype, pas produit.** Aucune Production, aucune migration canonique, aucun secret,
aucun serveur facturé, aucun appel réseau sortant. Rapport complet et verdicts :
[`docs/drone/PHOTOGRAMMETRY_PIPELINE_PROTOTYPE_V1.md`](../../docs/drone/PHOTOGRAMMETRY_PIPELINE_PROTOTYPE_V1.md).

> ⚠️ **OpenDroneMap n'est pas validé commercialement.** Licence AGPL-3.0, conseil en
> propriété intellectuelle non saisi. Voir
> [`docs/drone/ODM_LICENSE_RISK.md`](../../docs/drone/ODM_LICENSE_RISK.md) avant tout usage
> autre qu'expérimental.

## Trois implémentations du même port

| Fabrique | Moteur | État |
|---|---|---|
| `creerAdaptateurOdm` | `odm` | Expérimental : parle l'API NodeODM, transport et stockage injectés |
| `creerAdaptateurMetashape` | `metashape` | Contrat seulement : refuse explicitement, faute de licence |
| `creerMoteurDemo` | `demo` | Déterministe, sans GPU ni réseau — démonstration et tests |

## Démonstration sans GPU

```ts
import { executerScenarioDemo } from "@elsatia/drone-photogrammetry";

const rapport = await executerScenarioDemo();
// téléversement par blocs → validation → EXIF → contrôle qualité → file →
// moteur de démonstration → artefacts rangés au stockage
console.log(rapport.travail.statut, rapport.qualite.resume, rapport.avertissements);
```

## Tests

```bash
npx vitest run packages/drone-photogrammetry
```

## Organisation

| Dossier | Contenu |
|---|---|
| `src/moteur/` | Socle des adaptateurs, ODM, contrat Metashape, moteur de démonstration |
| `src/file/` | File de travaux : idempotence, retry borné, lettre morte |
| `src/ingestion/` | Téléversement par morceaux, empreintes, EXIF, contrôle qualité |
| `src/securite/` | Validation par nombre magique, références de stockage générées |
| `src/sortie/` | Formats, emplacements d'artefacts, rapatriement vers le stockage |
| `src/couts/` | Formule de coût, refus de tarifer sans benchmarks |
| `src/benchmark/` | Jeux small/medium/large et harnais de mesure (**aucune mesure réelle**) |
| `src/demo/` | Fixtures JPEG+EXIF construites octet par octet, scénario complet |

## Ce que ce paquet ne fait pas

Il ne reconstruit rien tout seul, ne mesure aucune performance, n'estime aucun prix de vente
et ne persiste rien. La file est en mémoire derrière un port `DepotTravaux` ; le stockage est
un port `EcrivainBlocs`. Les implémentations durables viendront quand les mesures les
justifieront.
