# ELSATIA — Contrats client canoniques V1

**Paquet** : `@elsatia/client-contracts` (`packages/client-contracts/`)
**Version de contrat** : `1.0.0`
**Statut** : contrats TypeScript uniquement. Aucune migration, aucun adaptateur applicatif, aucun changement de `public.clients`.
**Référence d'analyse** : `docs/audits/ELSATIA_CANONICAL_CLIENT_MODEL_AND_SEARCH_AUDIT_V1.md`

---

## 1. Ce que ce paquet est, et ce qu'il n'est pas

Il **décrit** le client de l'écosystème ELSATIA. Il ne le stocke pas, ne l'interroge pas, ne l'affiche pas.

| Il fournit | Il ne fournit pas |
|---|---|
| des types TypeScript stricts, sans `any` | un schéma de base de données |
| des validateurs à l'exécution, sans dépendance | un client Supabase ou une requête SQL |
| une normalisation de référence | un moteur de recherche |
| une détection de conflit pure | une file de synchronisation |
| une capture de snapshot documentaire | un rendu PDF |

Aucune dépendance de production n'est déclarée : ni React, ni Supabase, ni Next. Un test le vérifie (`public-api.test.ts`).

---

## 2. Les cinq notions, et pourquoi elles ne se confondent pas

| Notion | Type | Durée de vie | Qui l'écrit |
|---|---|---|---|
| fiche vivante | `ClientIdentity` / `ClientDetails` | mutable | l'application faisant autorité |
| adresse | `ClientAddress` | mutable, rattachée à la fiche | idem |
| contact | `ClientContact` | mutable, rattaché à la fiche | idem |
| référence externe | `ClientReference` | cache de liaison, périssable | l'application consommatrice |
| **snapshot documentaire** | `ClientDocumentRecipientSnapshot` | **figé à vie** | l'émetteur du document, une fois |

La dernière ligne est la raison d'être du paquet. L'audit établit (§8) que Gestion Pro fige aujourd'hui
l'**émetteur** de ses factures (`factures.entreprise_snapshot`) mais **jamais le destinataire** : le bloc
« Facturé à » est reconstruit à chaque rendu depuis la ligne `clients` courante. Corriger une faute de frappe
dans un nom réécrit donc rétroactivement toutes les factures des années précédentes, le lien de partage externe
sert un document muté après envoi, et l'empreinte de signature n'atteste pas ce que le PDF montre.

Le contrat répond par une **séparation de types**, pas par une convention :

- `ClientDocumentRecipientSnapshot` ne porte ni `status`, ni `notes`, ni `addresses`, ni `contacts`, ni
  `createdAt` — rien qui appartienne à la fiche vivante ;
- son adresse est un `PostalAddress` **nu** : ni identifiant, ni rôle, ni horodatage, donc rien qui pointe vers
  un enregistrement susceptible de bouger ;
- `renderRecipientBlock(snapshot)` n'accepte **que** le snapshot. Sa seule signature démontre qu'imprimer un
  document n'exige aucune résolution de `sourceClientId` ;
- toutes ses propriétés sont `readonly` et il n'existe aucune fonction de mise à jour. Un document émis se
  réémet, il ne se corrige pas.

`diffSnapshotAgainstClient()` permet de **constater** la dérive (« la fiche a changé depuis l'émission ») sans
jamais la corriger.

---

## 3. Emplacement et consommation

```
packages/
  application-access/     ← précédent : paquet partagé privé
  client-contracts/       ← ce lot
    package.json          @elsatia/client-contracts, private, exports → src/index.ts
    src/
      ids.ts                identifiants marqués (TenantId, ClientId, …)
      primitives.ts         ISO 8601, code pays, texte nullable
      errors.ts             anomalies structurées, ClientValidationResult
      version.ts            versionnement et compatibilité ascendante
      normalization.ts      normalisation de référence (miroir du futur SQL)
      legal-identifiers.ts  SIREN, SIRET, TVA, APE, code postal
      address.ts            adresses et rôles
      contact.ts            contacts et rôles
      identity.ts           identité, catégorie, nom d'affichage
      client.ts             résumé, détail, création, mise à jour, garde de locataire
      reference.ts          lien faible inter-applications
      document-snapshot.ts  snapshot destinataire figé
      search.ts             requête, résultat, plan d'exécution
      sync.ts               enveloppe, permissions, conflits
      serialization.ts      sérialisation déterministe, parsing validé
      fixtures.ts           jeux d'essai (hors API publique)
```

Résolution : alias `@elsatia/client-contracts` ajouté à `tsconfig.json` racine, exactement comme
`@elsatia/application-access`. Une application autonome (`apps/tools`, `apps/colors`) ajoutera le même alias
dans son propre `tsconfig.json` **le jour où elle consommera le paquet** — ce lot ne modifie aucune application.

---

## 4. Exemples

### 4.1 Créer un particulier

```ts
import { asTenantId, previewDisplayName, validateClientCreateInput } from "@elsatia/client-contracts";

const input = {
  tenantId: asTenantId(entrepriseId),
  category: "particulier",
  civility: "M.",
  firstName: "Jean",
  lastName: "Dupont",
  email: "jean.dupont@example.fr",
  phone: "06 12 34 56 78",
  addresses: [
    { roles: ["primary", "billing"], line1: "8 rue du Marché", postalCode: "67000", city: "Strasbourg" },
  ],
} as const;

const result = validateClientCreateInput(input);
if (!result.ok) return result.issues;      // [{ path, code, message }]
previewDisplayName(input);                  // "Jean Dupont"
```

Un particulier ne porte **pas** d'identité légale : `legal` doit rester absent. Le validateur refuse un `legal`
sur un particulier (`invariant_violated`), ce qui ferme le défaut relevé par l'audit — un SIRET saisi par erreur
sur un particulier finissait imprimé sur sa facture.

### 4.2 Créer une entreprise

```ts
const input = {
  tenantId: asTenantId(entrepriseId),
  category: "professionnel",
  legalName: "MENUISERIE MULLER",       // raison sociale
  tradeName: "Muller Agencement",       // nom commercial
  email: "contact@muller.example.fr",
  legal: {
    legalForm: "SAS",
    siren: "732829320",
    siret: "73282932000009",
    vatNumber: "FR44732829320",
    activityCode: "43.32A",             // normalisé en 4332A
  },
} as const;
```

Vérifications appliquées : clé de Luhn du SIREN et du SIRET, **cohérence entre les deux** (le SIRET doit
commencer par le SIREN déclaré), clé de TVA française, format APE. L'exception documentée de La Poste
(SIREN `356000000`, somme des chiffres multiple de 5) est acceptée.

`displayName` vaut ici `MENUISERIE MULLER` : pour un professionnel la raison sociale prime, pour un particulier
c'est l'état civil — quoi qu'il y ait dans les autres champs.

### 4.3 Adresse de facturation distincte, et plusieurs chantiers

```ts
const addresses = [
  { roles: ["primary"],  line1: "12 rue des Tanneurs", postalCode: "67000", city: "Strasbourg" },
  { roles: ["billing"],  label: "Service comptabilité", line1: "5 avenue de la Paix", postalCode: "68000", city: "Colmar" },
  { roles: ["site"],     label: "Chantier Nord", line1: "ZA des Pins", postalCode: "67500", city: "Haguenau" },
  { roles: ["site"],     label: "Chantier Sud", line1: "42 rue Neuve",  postalCode: "68100", city: "Mulhouse" },
];
```

Il n'y a **pas** de type `BillingAddress` ni `SiteAddress` distinct : ce qui est typé, c'est le **rôle**. Une
adresse unique servant de siège et de facturation porte simplement `["primary", "billing"]`, ce qui remplace le
booléen `facturation_identique_principale` par un fait directement lisible.

`resolveBillingAddress()` se replie explicitement sur l'adresse principale quand aucune ne porte le rôle
`billing`. Ce repli est une **règle du contrat** : sans lui, chaque consommateur écrirait la sienne, et deux
d'entre eux factureraient à des adresses différentes.

Invariants vérifiés sur la collection : au plus une adresse `primary`, au plus une `billing`, autant de `site`
que nécessaire, identifiants uniques, locataire homogène.

### 4.4 Figer le destinataire d'un document

```ts
import { captureDocumentRecipient, renderRecipientBlock } from "@elsatia/client-contracts";

// À l'émission, une fois. `capturedAt` est fourni par l'appelant : la fonction est pure.
const snapshot = captureDocumentRecipient(details, { capturedAt: new Date().toISOString() });

// Au rendu, des années plus tard, sans la moindre lecture de la fiche client :
renderRecipientBlock(snapshot);
// [ "MENUISERIE MULLER",
//   "À l'attention de Claire Muller (Conductrice de travaux)",
//   "12 rue des Tanneurs",
//   "67000 Strasbourg",
//   "SIRET : 73282932000009",
//   "TVA : FR44732829320" ]
```

Le snapshot se sérialise en JSON déterministe (`serializeDocumentRecipientSnapshot`), ce qui le rend
empreintable : le jour où la signature électronique couvrira le bloc destinataire — risque R3 de l'audit —
elle aura la sérialisation stable dont elle a besoin.

### 4.5 Rechercher

```ts
import { buildClientSearchPlan, validateClientSearchResult } from "@elsatia/client-contracts";

const plan = buildClientSearchPlan({ tenantId, term: "MARTIN Strasbourg", limit: 25 });
// plan.tokens    → ["martin", "strasbourg"]
// plan.patterns  → ["%martin%", "%strasbourg%"]   ← LIKE ALL(array), indexable en GIN gin_trgm_ops
// plan.isListing → false

const check = validateClientSearchResult(reponseDuMoteur);  // refuse toute ligne d'un autre locataire
```

Sémantique : **ET entre les jetons, OU entre les champs**. Jetons plafonnés à 6, jetons d'un caractère ignorés,
métacaractères `LIKE` échappés (sans quoi `100%` cherche « tout ce qui commence par 100 » à l'insu de
l'opérateur). Terme vide = comportement de liste, pas de recherche.

L'adresse de chantier est **volontairement absente** des champs interrogeables : remonter un client de Colmar
parce qu'il a un chantier à Strasbourg produit des faux positifs incompréhensibles. Le chantier relève d'une
recherche transverse distincte, hors de ce lot.

`normalization.ts` est l'**implémentation de référence** de la normalisation : la future fonction SQL
`normaliser()` devra produire exactement la même sortie sur les mêmes entrées. Une asymétrie entre la
normalisation d'indexation et celle de la requête rend l'index inutile en silence.

### 4.6 Synchroniser depuis une application standalone vers Gestion Pro

```ts
import { createSyncEnvelopeBase, detectClientSyncConflict } from "@elsatia/client-contracts";

const envelope = {
  ...createSyncEnvelopeBase({
    idempotencyKey: "drone:projet-17:create",
    sourceApp: "drone",
    targetApp: "gestion_pro",
    tenantId,
    actor: { actorId, tenantId, scopes: ["client:propose"] },  // jamais "client:write"
    occurredAt: new Date().toISOString(),
    externalReference: "projet-17",
  }),
  operation: "create",
  payload: { tenantId, category: "professionnel", legalName: "TOITURE VOSGES" },
} as const;

const conflit = detectClientSyncConflict(envelope, etatDistant);  // null si tout va bien
```

Règles portées par le validateur, pas seulement par la documentation :

- seule l'application faisant autorité (`gestion_pro`) peut porter la portée `client:write`. Une application
  tierce ne peut que **proposer**, et un humain valide dans Gestion Pro ;
- l'acteur doit appartenir au locataire de l'enveloppe, et la charge utile aussi ;
- il n'existe **aucune opération de suppression**. Le besoin réel derrière « supprimer » est `unlink` : je ne
  veux plus que mon objet pointe vers ce client ;
- l'ordre de détection des conflits est délibéré — locataire, puis permissions, puis existence, puis archivage,
  puis version. Répondre « version périmée » à une enveloppe visant un autre locataire divulguerait l'existence
  de la fiche visée.

### 4.7 Consommation future par Réserves et Drone

Aucune des deux applications n'est modifiée par ce lot. Ce qui est **préparé** :

**Réserves.** Le mode nominal reste standalone : `reserves_chantiers` inchangé, aucun client. Le mode connecté
ajoutera un `ClientReference` **facultatif** sur le chantier, alimenté depuis le chantier Gestion Pro lié, pour
afficher « pour le compte de Dupont » sur un PV. Une réserve s'émet sans client.

**Drone.** `ClientReference` est la généralisation de `ExternalReference`
(`packages/drone-core/src/common.ts`) : mêmes noms de champs, mêmes trois statuts, même constante « non liée ».
Ce que l'audit lui reproche d'omettre y est ajouté — le **locataire**, sans lequel la référence n'est pas
vérifiable, et le **libellé**, sans lequel il faut appeler Gestion Pro pour afficher un nom. Le champ plat
`DroneProject.client_name` deviendra le `label` d'un `ClientReference`, ce qui ajoute `clientId` et `syncStatus`
sans rien retirer ; `DroneProject.address` deviendra un `PostalAddress` — c'est une adresse de site, pas une
adresse client.

**Tools et Colors.** Rien n'est prévu, et c'est délibéré. Le locataire de Tools est `auth.users.id`, pas
`entreprises.id` : y introduire un client ferait fusionner les annuaires de deux entreprises dans l'espace d'un
utilisateur membre des deux. Colors ne traite aujourd'hui aucune donnée personnelle de tiers. Dans les deux cas,
« uniformiser » serait un recul RGPD sans contrepartie fonctionnelle.

**Le point d'acceptation du standalone** : `CLIENT_REFERENCE_UNLINKED` est une référence valide. Une application
dont aucun objet n'est rattaché à un client fonctionne pleinement, et n'a jamais besoin de contacter Gestion Pro
pour lire.

---

## 5. Versionnement et compatibilité ascendante

Deux niveaux distincts :

1. `CLIENT_CONTRACT_VERSION` (`1.0.0`) — version du **paquet**, transportée à titre de provenance. Elle ne
   conditionne aucune décision de lecture.
2. Les **versions de schéma**, une par type transportable, ne portant qu'un entier majeur :
   `elsatia.client.details/1`, `elsatia.client.summary/1`, `elsatia.client.reference/1`,
   `elsatia.client.document-recipient-snapshot/1`, `elsatia.client.search-result/1`,
   `elsatia.client.sync-envelope/1`.

Règle : **ajouter un champ optionnel ne change pas le majeur**. Les validateurs ignorent les champs inconnus,
donc une charge utile produite par un émetteur 1.1 reste lisible par un lecteur 1.0. **Retirer un champ,
restreindre une énumération ou changer le sens d'un champ incrémente le majeur**, et le lecteur refuse alors
explicitement (`unsupported_schema_version`) plutôt que de deviner.

Seuls les types franchissant une frontière portent une version. Une adresse ou un contact n'en porte pas : ils
circulent toujours dans l'un des six contenants, dont la version les couvre. Un numéro de version par objet
imbriqué serait décoratif — jamais vérifié, jamais incrémenté ensemble.

---

## 6. Correspondance avec le modèle Gestion Pro actuel

À titre indicatif pour le futur lot « GP Client Core ». **Aucune migration n'est écrite ni impliquée par ce lot.**

| Contrat | `public.clients` aujourd'hui | Écart |
|---|---|---|
| `identity.id` | `id` | — |
| `identity.tenantId` | `entreprise_id` | — |
| `identity.reference` | `reference_interne` | — |
| `identity.category` | `type` | mêmes cinq valeurs |
| `identity.kind` | — | dérivé, non stocké |
| `identity.displayName` | — | calculé, non stocké |
| `identity.legalName` | `raison_sociale` | colonne **morte** à réhabiliter |
| `identity.tradeName` | `societe` | doublon sémantique à trancher |
| `identity.status` | `statut` | `archive` en plus |
| `legal.siret` | `siret` | aucun format contraint en base |
| `legal.siren` / `vatNumber` / `activityCode` / `registrationNumber` / `legalForm` / `shareCapital` | — | **colonnes absentes** |
| `addresses[primary+billing]` | `adresse_facturation`, `code_postal`, `ville` | une seule adresse, deux sémantiques selon l'écran |
| `addresses[].line2` / `region` / `country` | — | absents |
| `addresses[].coordinates` | `latitude`, `longitude` | colonnes **mortes** |
| `addresses[site]` | `chantiers.adresse` | porté par le chantier, pas par le client |
| `contacts[]` | `contacts_clients` | table **gelée** (grants révoqués) |
| `ClientDocumentRecipientSnapshot` | — | **n'existe pas** — le P0 de l'audit |

Champs restant propres à Gestion Pro et volontairement **hors** du contrat canonique :
`conditions_paiement`, `delai_paiement_jours`, `relance_auto_exclue`, notes internes, tarification, encours.
Ce sont des règles commerciales d'une application, pas l'identité d'un client.

---

## 7. Limites assumées

- Les identifiants sont marqués **statiquement** : à l'exécution ce sont des chaînes. Le JSON est inchangé, le
  coût runtime est nul, mais une valeur arrivant du réseau ne devient sûre qu'après `asTenantId()` ou un
  validateur.
- La validation d'identifiants légaux est **de forme et de clé**, jamais d'existence : aucun appel réseau,
  aucune consultation de base entreprise. Un SIRET syntaxiquement valide peut désigner un établissement fermé.
- Les clés de TVA **non françaises** ne sont vérifiées que sur le format : inventer vingt-six algorithmes
  nationaux non vérifiables serait une fausse garantie.
- Les clés de TVA françaises **alphabétiques** (attribuées à certaines entreprises) sont acceptées sur le format
  seul : leur algorithme n'est pas public.
- `isPlausibleEmail` n'implémente pas la RFC 5322, délibérément : la validation exhaustive produit surtout des
  faux négatifs.
- La normalisation est une implémentation de référence **non encore mise en miroir en SQL**. Tant que la
  fonction SQL n'existe pas, rien ne garantit automatiquement leur symétrie — c'est le premier test à écrire
  dans le lot « Universal Client Search ».
