# ELSATIA Drone — Prototype de pipeline photogrammétrique V1

> Branche `feat/drone-photogrammetry-pipeline-v1`, greffée sur
> `feat/drone-core-contracts-v1` (noyau `packages/drone-core`).
> **Aucune Production, aucune migration canonique, aucun secret, aucun serveur facturé.**
>
> Documents liés :
> [risque de licence ODM](ODM_LICENSE_RISK.md) ·
> [noyau et contrats](data-contracts-implementation-v1.md) ·
> [options photogrammétriques](ELSATIA_DRONE_PHOTOGRAMMETRY_OPTIONS_V1.md) ·
> [architecture MVP](ELSATIA_DRONE_ARCHITECTURE_MVP_V1.md) ·
> [modèle de données](ELSATIA_DRONE_DATA_MODEL_V1.md)

---

## 0. Verdicts demandés

| Question | Réponse | Fondement |
|---|---|---|
| **ODM TECHNICALLY VIABLE** | **OUI, sous réserve de mesure** | L'API NodeODM couvre les cinq opérations du port du noyau (description, soumission, interrogation, annulation, résultat) et ses sorties se rangent sans perte dans les six emplacements d'artefacts. L'adaptateur est écrit et testé contre un transport simulé. **Aucune reconstruction réelle n'a été exécutée** : la viabilité *de performance et de précision* reste non démontrée. |
| **ODM COMMERCIALLY CLEARED** | **NON** | Aucun conseil PI saisi. Voir [ODM_LICENSE_RISK.md](ODM_LICENSE_RISK.md). Ce non est indépendant de la qualité technique et prime sur elle. |
| **METASHAPE FALLBACK VIABLE** | **OUI sur le plan de l'architecture, NON vérifié en exploitation** | La substitution est prouvée par test : le code client ne change pas. Mais aucune licence n'est acquise, aucun binaire n'a été exécuté, et l'adaptateur s'arrête volontairement au contrat. |

Ces trois lignes tiennent en une phrase : **le pipeline tient debout, personne ne l'a
encore fait tourner sur un vrai GPU, et le sujet bloquant n'est pas technique.**

---

## 1. Ce que le prototype est, et n'est pas

**Est** : un pipeline complet, typé et testé, de l'octet téléversé jusqu'à l'artefact rangé
dans le stockage, exécutable sans GPU, sans réseau et sans base de données.

**N'est pas** : une reconstruction réelle, une mesure de performance, une mesure de
précision, un déploiement, un tarif.

| Interdit posé au lot | Respect |
|---|---|
| Pas de Production, pas de migration canonique, pas de secret | Aucune migration SQL, aucune variable d'environnement, aucun appel réseau sortant |
| Ne pas introduire prématurément une infrastructure Production | File en mémoire derrière un port `DepotTravaux`, stockage derrière `EcrivainBlocs` ; aucun pgmq, aucun worker, aucun cron |
| Pas de tarif par crédits avant benchmarks | `convertirEnCredits()` **lève une erreur** tant que les mesures ne sont pas réelles |
| Pas de serveur facturé sans autorisation | Aucun compte, aucune instance, aucun tarif codé en dur |
| Ne pas conclure juridiquement | Le document de licence pose des questions, il ne répond pas |
| Pas `main`, pas Production | Branche dédiée sur la cible cutover, aucun fichier applicatif existant modifié |

---

## 2. Architecture

### Le port appartient au noyau

`ReconstructionEngineAdapter` est défini **une seule fois**, dans
`packages/drone-core/src/ports/reconstruction-engine.ts` :

```ts
interface ReconstructionEngineAdapter {
  describe(): EngineDescriptor;
  submit(submission: EngineSubmission): Promise<EngineJobHandle>;
  poll(handle: EngineJobHandle): Promise<EngineProgress>;
  cancel(handle: EngineJobHandle): Promise<void>;
  fetchOutcome(handle: EngineJobHandle): Promise<EngineOutcome>;
}
```

`packages/drone-photogrammetry` **implémente** ce port ; il ne le redéfinit pas. Les
statuts, les transitions autorisées, les catégories d'erreur, la clé d'idempotence, les
références de stockage et la forme des artefacts viennent tous du noyau. Un second port
homonyme aurait créé deux architectures pour une seule application.

```
        ┌──────────────────────────────────────────────────────────────┐
        │        Client ELSATIA Drone — ne connaît que le port          │
        └───────────────┬──────────────────────────────────────────────┘
                        │
  ingestion            file de travaux                       sortie
  ─────────            ───────────────                       ──────
  televersement  ──►   soumettre (clé du noyau)        ┌──►  normalisation
  securite       ──►   demarrerProchain ────── submit ─┤     (6 emplacements)
  exif           ──►   rafraichir ──────────── poll  ──┤     rapatriement
  qualite        ──►   annuler ─────────────── cancel ─┤     (stockage + sha256)
  empreinte      ──►   reessayer (borné)  fetchOutcome ┘     couts
                                  │
                        ┌─────────┴──────────┬──────────────────┐
                        ▼                    ▼                  ▼
                 adaptateur ODM      adaptateur Metashape   moteur de démo
                 (NodeODM HTTP)      (contrat seulement)    (tests, §23)
```

### Fichiers

`packages/drone-photogrammetry/` — 17 modules, 15 fichiers de test, 101 tests.

| Module | Rôle |
|---|---|
| [`moteur/base.ts`](../../packages/drone-photogrammetry/src/moteur/base.ts) | Socle des adaptateurs : erreurs porteuses de contexte, logs, horloge, validation de soumission, lecture des paramètres |
| [`moteur/odm.ts`](../../packages/drone-photogrammetry/src/moteur/odm.ts) | Adaptateur NodeODM expérimental, transport et stockage injectés |
| [`moteur/metashape.ts`](../../packages/drone-photogrammetry/src/moteur/metashape.ts) | Configuration et refus explicite, sans implémentation |
| [`moteur/demo.ts`](../../packages/drone-photogrammetry/src/moteur/demo.ts) | Moteur `demo` déterministe |
| [`file/file-locale.ts`](../../packages/drone-photogrammetry/src/file/file-locale.ts) | File, idempotence, retry borné, lettre morte, transitions du noyau |
| [`ingestion/televersement.ts`](../../packages/drone-photogrammetry/src/ingestion/televersement.ts) | Téléversement par morceaux reprenable (esprit TUS) |
| [`ingestion/empreinte.ts`](../../packages/drone-photogrammetry/src/ingestion/empreinte.ts) | sha256 des contenus et déduplication exacte |
| [`ingestion/exif.ts`](../../packages/drone-photogrammetry/src/ingestion/exif.ts) | Lecteur EXIF autonome (GPS, appareil, focale, orientation) |
| [`ingestion/qualite.ts`](../../packages/drone-photogrammetry/src/ingestion/qualite.ts) | Contrôle qualité, blocages, `MediaQualityFlags` du noyau |
| [`securite/entrees.ts`](../../packages/drone-photogrammetry/src/securite/entrees.ts) | Type réel par octets, références de stockage générées |
| [`sortie/normalisation.ts`](../../packages/drone-photogrammetry/src/sortie/normalisation.ts) | Formats, emplacements d'artefacts, complétude, métriques ODM |
| [`sortie/rapatriement.ts`](../../packages/drone-photogrammetry/src/sortie/rapatriement.ts) | Téléchargement des sorties moteur vers le stockage, empreintes |
| [`couts/estimation.ts`](../../packages/drone-photogrammetry/src/couts/estimation.ts) | Formule de coût, garde-fou de tarification |
| [`benchmark/mesure.ts`](../../packages/drone-photogrammetry/src/benchmark/mesure.ts) | Jeux, harnais de mesure, relevé (**aucune mesure réelle**) |
| [`demo/`](../../packages/drone-photogrammetry/src/demo/) | Fixtures JPEG+EXIF construites octet par octet, scénario complet |

---

## 3. Modèle de travail

Statuts et transitions viennent du noyau (`reconstruction.ts`) :

```
queued ──► uploading ──► processing ──► quality_check ──► completed
   │            │             │               │
   │            └─────────────┴───────────────┴──► failed ──► queued (retry borné)
   └────────────────────────────────────────────► cancelled
```

`completed` et `cancelled` sont terminaux. `failed → queued` est la reprise bornée par
`attempts` ; au-delà, le travail reste `failed` en lettre morte. La file **n'a pas sa
propre machine à états** : chaque changement passe par
`peutTransitionnerReconstruction()` du noyau.

Correspondance avec les statuts persistés décrits dans le
[modèle de données](ELSATIA_DRONE_DATA_MODEL_V1.md) — aucune migration n'est écrite :

| Noyau | Persistance envisagée |
|---|---|
| `queued` | `en_attente` |
| `uploading`, `processing`, `quality_check` | `traitement` |
| `completed` | `termine` |
| `failed` | `erreur` |
| `cancelled` | `annule` |

**Progression** : `percent` de 0 à 100, ou `null` quand le moteur ne sait pas estimer —
jamais une valeur inventée. **Logs** : conservés ligne à ligne avec niveau et horodatage.

### Idempotence

La clé est calculée **par le noyau**, sur la charge utile canonique
`(projet, jeu de médias trié et dédoublonné, moteur, version moteur, paramètres normalisés)`.
La file l'obtient elle-même à partir du `describe()` de l'adaptateur : l'appelant ne peut
pas se tromper de moteur ou de version. Deux soumissions de même clé retournent **le même
travail** ; changer un paramètre en crée un nouveau sans détruire le précédent.

### Échecs

Un échec conserve la **catégorie** du noyau (`engine_failure`, `input_insufficient`,
`timeout`, `storage_unavailable`, `cancelled_by_user`, `unknown`), le **message brut du
moteur**, les **logs** et les **artefacts partiels**. La file interroge le moteur pour
récupérer ce contexte plutôt que de le reconstituer de l'extérieur.

Retry borné (3 tentatives par défaut) **uniquement** sur les erreurs marquées réessayables
— une entrée invalide n'est jamais rejouée.

---

## 4. Ingestion

### Téléversement

Sémantique TUS sans le protocole : session, offset courant, blocs séquentiels, reprise
après coupure, rejeu du dernier bloc toléré, clôture vérifiée par sha256. La session porte
une `StorageObjectRef` du noyau, pas un chemin libre. Le stockage est un port ;
l'implémentation fournie est en mémoire. **Aucun bucket Production n'est requis.**

### Sécurité

- Le type réel est décidé par le **nombre magique** (JPEG/PNG/TIFF) ; le `Content-Type`
  annoncé ne sert qu'à détecter une incohérence.
- Les références de stockage sont **générées** via `buildStoragePath()` du noyau :
  `<entreprise_id>/<project_id>/<media_id>.jpg`, l'entreprise en premier segment comme
  l'exigent les policies `storage.objects`. `../../../DJI_0001.JPG` ne produit pas un
  chemin, il produit un nom d'affichage assaini. Les identifiants non-UUID sont refusés.
- Aucune commande shell n'est construite à partir d'une entrée utilisateur : les moteurs
  sont pilotés en HTTP. Le nom envoyé à NodeODM est `image-00001.jpg`, généré à partir du
  rang.

### EXIF

Lecteur autonome, sans dépendance ajoutée au dépôt : IFD0, ExifIFD, GPSIFD. Il lit marque,
modèle, objectif, focale (et focale 35 mm), orientation, dimensions, horodatage, latitude,
longitude, altitude — et conserve les étiquettes reconnues telles quelles.

**Limite assumée** : ni MakerNote, ni XMP. Or c'est dans le XMP que DJI place le yaw/pitch/
roll de la nacelle. À instruire avant tout calcul métrologique.

### Contrôle qualité

| Anomalie | Verdict | Note |
|---|---|---|
| `doublon_exact` | rejeté | même sha256 ; l'original est tracé dans `duplicate_of` |
| `resolution_insuffisante` | rejeté | seuil par défaut 3 Mpx |
| `exif_absent` / `gps_absent` / `focale_absente` / `horodatage_absent` | douteux | qualifie, ne supprime pas |
| `flou_probable` | douteux | **seulement** si une netteté mesurée est fournie |
| `nettete_indeterminee` | exploitable | état par défaut, honnête |

Sur le flou, le prototype refuse de bluffer : la variance du laplacien est implémentée
(`mesurerNettete`), mais elle exige des pixels décodés. Tant qu'aucun décodeur n'alimente
la mesure, le rapport dit « indéterminé ». Un détecteur de flou qui devine sans pixels
serait un faux signal, et un faux signal sur une photo utile coûte plus cher qu'une
reconstruction un peu bruitée.

Le résultat se traduit en `MediaQualityFlags` du noyau, où `usable` reste une **décision**
corrigeable : un média douteux reste utilisable tant qu'un humain n'a pas tranché.

Blocages globaux : moins de 8 images exploitables, ou moins de 80 % d'images géolocalisées
(mise à l'échelle métrique non garantie — pour un métré de toiture, c'est rédhibitoire).

---

## 5. Sorties, formats et rapatriement

Le noyau n'a que six emplacements : `point_cloud`, `mesh`, `texture`, `orthophoto`,
`digital_surface_model`, `lightweight_glb`. Chacun est une **référence de stockage**, jamais
une URL — une URL NodeODM ne survit pas à l'arrêt de la machine, et la persister
reviendrait à publier des médias de chantier.

`rapatrierArtefacts()` fait le travail qui manque entre le moteur et le noyau : télécharger,
confirmer le format par les octets, écrire au stockage, empreindre. Un fichier absent
(option non demandée) est signalé, il ne fait pas échouer le travail.

Formats reconnus, **par signature d'octets puis par extension** : `laz`, `las`, `ply`,
`obj`, `glb`, `geotiff`, `png`, `jpeg`, `json`, `pdf`, `zip`, `inconnu`.

| Format | État de la vérification |
|---|---|
| GLB | Signature `glTF` détectée et testée ; **aucun GLB réel produit par ODM n'a été ouvert** |
| OBJ | Détecté par extension ; ODM le livre dans `textured_model.zip` |
| GeoTIFF | Signature TIFF détectée et testée ; **la conformité GeoTIFF elle-même — clés de géoréférencement — n'est pas vérifiée** |
| LAZ / LAS | Signature `LASF` commune aux deux ; l'extension tranche |
| PLY | Signature `ply` détectée et testée |

Autrement dit : la **plomberie** de format est faite et testée ; la **conformité réelle des
fichiers produits par ODM** ne l'est pas, faute d'exécution.

`verifierCompletude()` confronte les emplacements obtenus aux artefacts demandés et retourne
les manques. Un résultat incomplet reste un résultat, mais il n'est jamais présenté comme
complet.

---

## 6. Benchmarks — protocole prêt, **aucune mesure**

**Aucun benchmark n'a été exécuté.** Aucune machine GPU n'a été louée. Ce qui existe : les
trois jeux définis, le harnais de mesure, et le format de relevé.

| Jeu | Description | Photos cibles | Mpx/photo | Source envisagée |
|---|---|---|---|---|
| `small` | Toiture unique, orbite simple | 40 | 12 | capture ELSATIA anonyme ou jeu public ODM |
| `medium` | Bâtiment + annexes, double grille et obliques | 150 | 20 | capture ELSATIA anonyme ou jeu public ODM |
| `large` | Ensemble de bâtiments, quadrillage dense | 500 | 20 | jeu public de cartographie aérienne |

Licence des sources : **à confirmer avant tout usage**. Aucune donnée client ne peut servir
de jeu de test sans consentement explicite.

Mesures relevées par `executerBenchmark()` : photos, mégapixels totaux, temps, pic RAM, pic
VRAM, pic disque, volume de sortie ; indicateurs dérivés : s/photo, s/Mpx, Mo de sortie par
photo.

**La VRAM n'est pas mesurable depuis Node** : le champ existe et reste `null` tant qu'une
sonde externe (`nvidia-smi` sur la machine de test) ne l'alimente pas. C'est une limite,
pas un oubli.

Chaque relevé porte un drapeau `reelle`. Un relevé produit par le moteur de démonstration
vaut **zéro** pour la tarification, et le code l'interdit explicitement.

---

## 7. Coûts

```
coût = (durée GPU × prix horaire GPU)
     + (volume stocké × rétention × prix stockage)
     + (volume sortant × prix egress)
```

Deux garde-fous dans le code, pas dans un commentaire :

1. **Aucun tarif codé en dur.** `TARIFS_NON_RELEVES` est volontairement inutilisable ;
   `estimerCout()` lève `ErreurTarifManquant` tant que les prix et leur date de relevé ne
   sont pas fournis. Le prototype ne prétend pas connaître les prix pratiqués.
2. **Aucun tarif par crédits avant benchmarks.** `convertirEnCredits()` lève tant que les
   mesures ne sont pas réelles, tant qu'il y a moins de trois jeux mesurés, ou tant que la
   valeur du crédit n'est pas définie.

Conséquence directe : **aucun prix de vente ne peut être annoncé aujourd'hui**, et le code
rend cette annonce impossible par construction.

---

## 8. Hébergement — Scaleway et OVH

**Aucun compte ouvert, aucune instance créée, aucun euro engagé.** Ce qui suit décrit la
démarche, pas un choix.

### Contraintes qui s'imposent avant tout comparatif

| Contrainte | Origine | Conséquence |
|---|---|---|
| Hébergement et traitement en UE | §47/§48 du brief Drone | Toute région hors UE élimine l'option, quel que soit son prix |
| Aucune réutilisation des médias clients | §49 | Interdit les offres dont les CGU réservent un droit d'usage des données traitées |
| Reconstruction asynchrone longue | nature du calcul | Machine à la demande ou file de tâches ; une instance allumée en permanence est un gouffre |
| Vercel héberge le web, pas le GPU | audit du dépôt | Le GPU est une infrastructure **nouvelle**, séparée, à administrer |

### Ce qu'il faut vérifier chez chaque fournisseur, avant toute décision

1. **Familles d'instances GPU disponibles**, avec VRAM et vCPU associés — `[?]` non vérifié
   à la date de ce document.
2. **Prix horaire réel**, facturation à la seconde ou à l'heure entamée, et prix des
   instances arrêtées mais conservées — `[?]`.
3. **Prix du stockage objet** et de l'egress — `[?]`. L'egress est le poste qui surprend :
   un maillage texturé et une orthophoto se comptent en dizaines de Mo par projet, et le
   client les télécharge.
4. **Régions** effectivement disponibles pour la famille GPU retenue (une offre peut être
   annoncée « UE » mais indisponible dans la région voulue).
5. **Délai d'approvisionnement** d'une instance GPU en heure de pointe : il conditionne le
   temps d'attente perçu par l'utilisateur.
6. **Conditions contractuelles** sur les données traitées.

### Forme de déploiement envisagée, indépendante du fournisseur

- Une image conteneur NodeODM **non modifiée**, exécutée sur une machine GPU.
- Un stockage objet pour les médias d'entrée et les artefacts.
- L'orchestrateur ELSATIA (ce prototype) appelant NodeODM en HTTP sur un réseau privé.
- Aucune exposition publique de NodeODM.

Ce montage est identique chez Scaleway et chez OVH ; **le choix se fera sur les prix relevés
et les conditions contractuelles, pas sur l'architecture.** C'est pourquoi ce document n'en
recommande aucun.

---

## 9. ODM — ce qui est fait, ce qui ne l'est pas

**Fait** : l'adaptateur enchaîne `POST /task/new/init` → envoi des images par lots →
`POST /task/new/commit`, lit `GET /task/:uuid/info` (codes 10/20/30/40/50 traduits dans le
vocabulaire du noyau), lit `GET /task/:uuid/output` pour les logs d'échec, annule par
`POST /task/cancel`, puis télécharge les assets et les range dans le stockage ELSATIA. Le
transport HTTP et le stockage sont injectés : les tests le pilotent sans réseau.

**Pas fait** : aucune exécution contre une instance NodeODM réelle. Les points à confirmer
au premier essai réel :

- la forme exacte des réponses `/info` selon la version de NodeODM déployée ;
- la liste des assets réellement disponibles au téléchargement selon les options ;
- la récupération de `stats.json` (l'extraction des métriques est écrite et testée, mais la
  structure du fichier varie selon les versions d'ODM/OpenSfM) ;
- le comportement sous charge : envoi de 500 images, expiration de session, reprise.

---

## 10. Metashape

Interface et configuration seulement. `verifierConfigMetashape()` énumère ce qui manque —
aujourd'hui : licence Service Provider, serveur de licences, binaire, répertoire de projets,
version. L'adaptateur satisfait le port, se décrit normalement, et **échoue bruyamment**
plutôt que de laisser croire à un traitement en cours. Configuration complète mais
implémentation absente : le message le dit explicitement. La distinction est testée.

---

## 11. Substitution de moteur — prouvée

Le test [`moteur/abstraction.test.ts`](../../packages/drone-photogrammetry/src/moteur/abstraction.test.ts)
définit une fonction client qui ne connaît que le port, puis la fait tourner **inchangée**
sur trois moteurs : le moteur de démonstration, l'adaptateur ODM (transport simulé) et un
moteur tiers au vocabulaire différent. Les trois remplissent les emplacements demandés, et
produisent trois clés d'idempotence distinctes — le moteur fait partie de la clé. Le même
test exécute ensuite le client sur l'adaptateur Metashape : le client ne bouge pas, c'est
l'adaptateur qui refuse, faute de licence.

C'est la démonstration que la réponse du conseil PI ne coûtera qu'un adaptateur.

---

## 12. Risques

| Risque | Gravité | Parade en place | Reste à faire |
|---|---|---|---|
| **Licence AGPL non tranchée** | Bloquant commercial | Abstraction moteur, ODM non modifié, isolation HTTP | Saisir un conseil PI |
| **Aucune mesure de performance** | Élevée — le pricing en dépend | Harnais prêt, garde-fou tarifaire | Louer une machine GPU, exécuter les trois jeux |
| **Précision métrologique inconnue** | Élevée — c'est la valeur du produit | Métriques du noyau prévues (reprojection, GSD, caméras calibrées) | Campagne de mesure sur toiture réelle avec référence |
| **Coût GPU inconnu** | Élevée | Formule écrite, aucun tarif inventé | Relever les prix Scaleway/OVH |
| **Orientation nacelle absente de l'EXIF** | Moyenne | Limite documentée | Lire le XMP DJI |
| **File en mémoire non durable** | Moyenne | Port `DepotTravaux` prêt pour une implémentation persistante | Choisir le support après mesure de charge |
| **Volume de stockage** | Moyenne | Coût modélisé, rétention paramétrable | Politique de rétention à décider |
| **Jeux de test non constitués** | Moyenne | Sources envisagées, licences signalées à confirmer | Constituer les jeux, vérifier les licences |

---

## 13. Tests

101 tests, 15 fichiers, exécution en moins d'une seconde, sans réseau ni GPU.

```bash
npx vitest run packages/drone-photogrammetry
```

| Fichier | Ce qu'il couvre |
|---|---|
| `moteur/odm.test.ts` | Soumission par lots, noms générés, traduction des codes NodeODM, rapatriement réel des artefacts, assets absents, métriques, échecs réessayables ou non |
| `moteur/metashape.test.ts` | Manques de configuration, description du moteur, refus explicite |
| `moteur/demo.test.ts` | Cycle complet, artefacts conformes aux paramètres, échec avec artefacts partiels, annulation, gardes d'entrée |
| `moteur/abstraction.test.ts` | Même client, trois moteurs, clés d'idempotence distinctes |
| `file/file-locale.test.ts` | Idempotence (ordre des médias indifférent), cycle nominal, retry borné, lettre morte, annulation |
| `ingestion/exif.test.ts` | GPS N/S/E/W, altitude négative, absence d'EXIF, contenu non-JPEG |
| `ingestion/empreinte.test.ts` | sha256, déduplication exacte |
| `ingestion/televersement.test.ts` | Blocs, reprise, rejeu, offset incohérent, dépassement, corruption, abandon |
| `ingestion/qualite.test.ts` | Chaque anomalie, blocages, netteté, traduction en `MediaQualityFlags` |
| `securite/entrees.test.ts` | Exécutable déguisé, type incohérent, octet nul, identifiants non-UUID, traversée de chemin |
| `sortie/normalisation.test.ts` | Signatures, emplacements ODM, complétude, métriques défensives |
| `sortie/rapatriement.test.ts` | Écriture au stockage, empreintes, fichiers ignorés et absents |
| `couts/estimation.test.ts` | Formule, tarifs manquants, refus de tarification prématurée |
| `benchmark/mesure.test.ts` | Harnais, indicateurs dérivés, relevé incomplet |
| `demo/scenario.test.ts` | Démonstration de bout en bout, avec et sans échec |

---

## 14. Ce que ce prototype **ne** prouve **pas**

À lire avant toute décision fondée sur ce document :

1. **Qu'ODM reconstruit correctement une toiture.** Aucune reconstruction n'a été exécutée.
2. **Que la précision suffit pour un métré commercial.** Aucune mesure, aucune référence.
3. **Combien coûte une reconstruction.** Aucun tarif, aucune durée mesurée.
4. **Que l'infrastructure tient la charge.** Aucun test de charge, file en mémoire.
5. **Qu'ODM est exploitable commercialement.** Question ouverte, conseil PI non saisi.

---

## 15. Recommandation et suite

**Recommandation : poursuivre, dans cet ordre, et ne pas inverser.**

1. **Saisir le conseil PI** ([questions prêtes](ODM_LICENSE_RISK.md#3-action-conseil-pi)).
   C'est le seul point qui peut rendre tout le reste inutile — il doit passer en premier, et
   il ne consomme aucune ressource technique.
2. **Louer une machine GPU européenne à l'heure** (sur autorisation explicite), déployer
   NodeODM non modifié, exécuter les trois jeux avec le harnais existant. Objectif : trois
   relevés réels.
3. **Relever les prix** Scaleway et OVH le même jour, les injecter dans `estimerCout()`.
4. **Campagne de précision** sur une toiture avec mesures de référence : c'est ce qui décide
   si le produit existe.
5. Ensuite seulement : persistance de la file, industrialisation, tarification.

Les étapes 1 et 2 sont indépendantes et peuvent avancer en parallèle — à condition que
l'étape 2 reste strictement expérimentale et non commerciale.

**Arbitrage rappelé** : ce lot reste subordonné à ELSATIA-UI-V2 et au cutover Production.
Le prototype ne consomme aucune ressource d'exploitation tant qu'il n'est pas déployé.
