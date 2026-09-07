# ELSATIA — CLIENT CONTRACTS CANONICAL V1 — RAPPORT

**Date** : 2026-09-07
**Lot** : `ELSATIA-CLIENT-CONTRACTS-CANONICAL-V1`
**Périmètre** : contrats TypeScript canoniques du client ELSATIA. Aucun adaptateur applicatif, aucune migration, aucun déploiement.

---

## 1. Verdict

## **VALIDÉ**

Le paquet `@elsatia/client-contracts` est livré, testé, poussé. Il définit le client de l'écosystème sans
imposer de base de données commune et sans qu'aucune application soit modifiée.

**Migrations : AUCUNE.** Confirmé explicitement — `git status -- supabase/` est vide, `supabase/migrations/`
n'est pas touché, le ledger reste à **265** sur cette branche, et `public.clients` n'est modifiée d'aucune
manière.

---

## 2. Emplacement choisi et justification architecturale

**`packages/client-contracts/`**, paquet privé `@elsatia/client-contracts`.

### Pourquoi cet emplacement

Le dépôt possédait **déjà** le précédent exact dont ce lot avait besoin : `packages/application-access`
(`@elsatia/application-access`), paquet privé `type: module`, `exports` pointant sur `src/index.ts`, résolu par
un alias dans le `tsconfig.json` racine et par un alias miroir dans `apps/tools/tsconfig.json`, et dont les
tests sont ramassés par le `vitest.config.ts` racine via `packages/**/*.test.ts`. `packages/drone-core` (branche
`feat/drone-core-contracts-v1`) applique le même patron.

Créer une structure partagée « minimale » ailleurs aurait donc été inventer un troisième emplacement là où
l'écosystème en a déjà un, éprouvé et outillé. **Aucun monorepo n'a été forcé** : aucun `workspaces` n'a été
ajouté à `package.json`, aucune application n'a été rendue dépendante du paquet, et le seul changement hors du
paquet est une ligne d'alias dans le `tsconfig.json` racine.

### Absence de dépendance circulaire

Le paquet n'importe **rien** : ni React, ni Next, ni Supabase, ni `server-only`, ni `@/…`, ni un autre paquet
`@elsatia/…`. Un test le vérifie mécaniquement (`public-api.test.ts` → « n'importe aucune dépendance
applicative »), et `package.json` ne déclare ni `dependencies` ni `peerDependencies` — également vérifié par
test. Le sens des dépendances est donc strictement descendant : applications → contrats, jamais l'inverse.

### Nommage

Les identifiants du contrat sont en **anglais camelCase** (`tenantId`, `displayName`, `legalName`) conformément
au brief de ce lot, alors que `drone-core` emploie du `snake_case` calqué sur les colonnes SQL. La divergence est
assumée et documentée : ce contrat n'est pas une projection de table, il est indépendant du stockage. Les
**valeurs** d'énumération restent en revanche en français (`particulier`, `professionnel`, `collectivite`,
`syndic`, `promoteur`, `prospect`, `actif`, `inactif`) — ce sont celles que l'écosystème emploie déjà dans
`clients.type` et `clients.statut`, et les traduire aurait créé une table de correspondance à maintenir dans
chaque adaptateur, pour un gain nul. Une table de correspondance complète contrat ↔ colonnes GP figure au §6 de
la documentation d'architecture.

---

## 3. Dépôts et branches inspectés

| Dépôt / worktree | Branche | SHA | Usage |
|---|---|---|---|
| `Appli_BTP` (racine) | `audit/cutover-operator-readiness-v1` | `a083c37` | worktree de départ, **non modifié** |
| `Appli_BTP` | `integration/gp-postcutover-precommercial-ops-v1` | `4266ba6` | référence GP de l'audit, **lecture seule** |
| `.worktrees/drone-core-contracts` | `feat/drone-core-contracts-v1` | `8dcf5b8` | `ExternalReference`, `ids.ts`, `common.ts` — **lecture seule** |
| `Appli_BTP` | `main` | `4d92ddb` (2026-07-29) | **stale**, écarté (cf. §4) |

Un seul dépôt est concerné : `git@github.com:julien-gregurec/Appli_BTP.git`. Le site vitrine (`elsatia-site`)
est hors périmètre — il ne porte aucun modèle client.

**Rapport d'audit trouvé et exploité** : `docs/audits/ELSATIA_CANONICAL_CLIENT_MODEL_AND_SEARCH_AUDIT_V1.md`
(1 099 lignes, daté 2026-09-07, référence GP `4266ba6`, ledger 265/267). Ses conclusions §8 (snapshot
documentaire), §11–13 (recherche et normalisation), §16–18 (contrats cibles), §19–23 (par application) et §20
(doctrine FK inter-applications) structurent le livrable.

---

## 4. Audit Git initial et choix de la base

### État constaté au démarrage

- **Branche** : `audit/cutover-operator-readiness-v1` @ `a083c37`
- **Working tree : SALE** — 8 fichiers modifiés (WIP SEO de `apps/tools`, `.claude/launch.json`), 1 suppression
  (`output/video/…mp4`), 20 fichiers non suivis (rapports d'audit et documents d'organisation)
- **Stashes** : 3, tous sans rapport avec ce lot (`tools-pwa-offline`, `tools-production-workflow`,
  `common-account-gestion-pro`)
- **Worktrees** : 47 recensés
- **Commits non poussés** : la branche courante n'a pas de remote de suivi

**Conséquence** : travailler dans ce worktree aurait mélangé le lot contrats à du WIP Tools et à des rapports
d'audit non commités. Un worktree dédié a donc été créé.

### Base retenue : `996be15` — et pourquoi pas `main`

`main` (`4d92ddb`, 2026-07-29) est **obsolète de 329 commits** : la ligne de développement réelle vit sur les
branches de fonctionnalité. Partir de `main` aurait produit une branche irrécupérable.

`996be15` (*docs(ops): refresh cutover target to 1d15289*, 2026-09-05) est le **plus proche ancêtre commun** des
trois lignes que ce lot doit pouvoir rejoindre sans friction :

- `integration/gp-postcutover-precommercial-ops-v1` (`4266ba6`) — GP, 9 commits au-dessus ;
- `feat/drone-core-contracts-v1` (`8dcf5b8`) — Drone, dont le paquet `drone-core` est basé sur ce même point ;
- `audit/cutover-operator-readiness-v1` (`a083c37`) — le worktree de départ, 38 commits au-dessus.

Une base neutre à cette intersection garantit que le paquet fusionnera plus tard dans n'importe laquelle des
trois sans y traîner ni les opérations post-cutover GP, ni les documents de cutover, ni le WIP Tools. C'est aussi
la base qu'a retenue le lot Drone pour la même raison.

### Audit Git final

```
Branche      feat/client-contracts-canonical-v1
Base         996be15c136f09d9977375e700462b503a1720c3
Commit       fdeaaf43bcda93f6dc7685dcc5ba0f65b535d935
Working tree propre après commit (hors ce rapport)
supabase/    aucun fichier modifié
Merge        aucun
Déploiement  aucun
```

Le worktree de départ `audit/cutover-operator-readiness-v1` est resté **strictement inchangé** : ses 8
modifications, sa suppression et ses 20 fichiers non suivis sont exactement dans l'état où ils étaient au
démarrage. Les 3 stashes sont intacts.

---

## 5. Branche et SHA

| | |
|---|---|
| **Branche finale** | `feat/client-contracts-canonical-v1` |
| **SHA de base** | `996be15c136f09d9977375e700462b503a1720c3` |
| **SHA final complet poussé** | `fdeaaf43bcda93f6dc7685dcc5ba0f65b535d935` |
| **Remote** | `git@github.com:julien-gregurec/Appli_BTP.git` |
| **Poussé** | oui, `origin/feat/client-contracts-canonical-v1` |
| **Fusionné** | **non** — aucun merge, aucune PR ouverte |

> Ce rapport est ajouté ensuite dans un commit de documentation distinct sur la même branche. Le livrable
> technique — paquet, documentation d'architecture, alias — est intégralement contenu dans
> `fdeaaf4`.

---

## 6. Fichiers créés / modifiés

### Créés — 31 fichiers

| Fichier | Rôle |
|---|---|
| `packages/client-contracts/package.json` | `@elsatia/client-contracts`, privé, aucune dépendance |
| `packages/client-contracts/README.md` | entrée de lecture, renvoi vers la doc d'architecture |
| `src/ids.ts` | identifiants marqués (`TenantId`, `ClientId`, `ClientAddressId`, `ClientContactId`, `ActorId`) |
| `src/primitives.ts` | ISO 8601 UTC, code pays ISO-3166-1, texte nullable, latitude/longitude |
| `src/errors.ts` | anomalies structurées, `ClientValidationResult`, `ClientContractError`, `IssueCollector` |
| `src/version.ts` | version de paquet, versions de schéma, règle de compatibilité ascendante |
| `src/normalization.ts` | normalisation de référence (miroir du futur SQL), jetons, document de recherche |
| `src/legal-identifiers.ts` | Luhn SIREN/SIRET, exception La Poste, clé TVA FR, APE, code postal |
| `src/address.ts` | `PostalAddress`, `ClientAddress`, rôles, invariants de collection |
| `src/contact.ts` | `ClientContact`, rôles, statut, invariants de collection |
| `src/identity.ts` | catégorie, nature dérivée, nom d'affichage, identité légale |
| `src/client.ts` | `ClientSummary`, `ClientDetails`, `ClientCreateInput`, `ClientUpdateInput`, garde de locataire |
| `src/reference.ts` | `ClientReference` — lien faible inter-applications |
| `src/document-snapshot.ts` | `ClientDocumentRecipientSnapshot`, capture, rendu, diff |
| `src/search.ts` | `ClientSearchQuery`, `ClientSearchResult`, `ClientSearchPlan` |
| `src/sync.ts` | enveloppes, portées, `ClientSyncConflict`, détection pure |
| `src/serialization.ts` | sérialisation déterministe, parsing validé |
| `src/fixtures.ts` | jeux d'essai, **hors API publique** |
| `src/index.ts` | barillet d'exports — la surface publique |
| `src/*.test.ts` (11 fichiers) | 147 tests |
| `docs/architecture/ELSATIA_CLIENT_CONTRACTS_CANONICAL_V1.md` | documentation, exemples, correspondance GP |

### Modifiés — 1 fichier

| Fichier | Diff |
|---|---|
| `tsconfig.json` | **une ligne** : alias `"@elsatia/client-contracts": ["./packages/client-contracts/src/index.ts"]` |

### Non modifiés — vérifié

`supabase/**` · `src/**` (Gestion Pro) · `apps/tools/**` · `apps/colors/**` · `packages/application-access/**` ·
`packages/drone-core/**` · toute branche Réserves · `package.json` racine · `vitest.config.ts` ·
`eslint.config.mjs`.

---

## 7. API publique

Version de contrat **`1.0.0`**. Versions de schéma :

```
elsatia.client.summary/1
elsatia.client.details/1
elsatia.client.reference/1
elsatia.client.document-recipient-snapshot/1
elsatia.client.search-result/1
elsatia.client.sync-envelope/1
```

### Types

**Identité** — `ClientCategory`, `ClientKind`, `ClientStatus`, `ClientLegalIdentity`, `ClientIdentity`
**Adresse** — `PostalAddress`, `GeoCoordinates`, `ClientAddressRole`, `ClientAddress`, `ClientAddressInput`
**Contact** — `ClientContactRole`, `ClientContactStatus`, `ClientContact`, `ClientContactInput`
**Fiche** — `ClientSummary`, `ClientDetails`, `ClientCreateInput`, `ClientUpdateInput`
**Référence** — `ClientSourceApplication`, `ClientLinkStatus`, `ClientReferenceOrigin`, `ClientReference`
**Snapshot** — `ClientDocumentRecipientSnapshot`, `SnapshotLegalIdentity`, `SnapshotContact`, `CaptureRecipientOptions`
**Recherche** — `ClientSearchField`, `ClientSearchSort`, `ClientSearchFilters`, `ClientSearchQuery`, `ClientSearchHit`, `ClientSearchResult`, `ClientSearchPlan`
**Synchronisation** — `ClientSyncOperation`, `ClientSyncScope`, `ClientSyncActor`, `ClientSyncEnvelopeBase`, `ClientSyncCreateEnvelope`, `ClientSyncUpdateEnvelope`, `ClientSyncArchiveEnvelope`, `ClientSyncUnlinkEnvelope`, `ClientSyncEnvelope`, `ClientSyncConflictKind`, `ClientSyncResolution`, `ClientSyncConflict`, `ClientRemoteState`
**Socle** — `TenantId`, `ClientId`, `ClientAddressId`, `ClientContactId`, `ActorId`, `IsoDateTime`, `IsoDate`, `CountryCode`, `NullableText`, `ClientValidationCode`, `ClientValidationIssue`, `ClientValidationResult`

### Fonctions

**Validation** — `validateClientIdentity`, `validateClientAddress`, `validateClientAddressCollection`,
`validateClientContact`, `validateClientContactCollection`, `validateClientDetails`, `validateClientSummary`,
`validateClientCreateInput`, `validateClientUpdateInput`, `validateClientReference`,
`validateDocumentRecipientSnapshot`, `validateClientSearchQuery`, `validateClientSearchResult`,
`validateClientSyncEnvelope`, `assertClientTenant`, `unwrapClientContract`

**Dérivation** — `deriveClientKind`, `computeClientDisplayName`, `computeContactDisplayName`,
`previewDisplayName`, `toClientSummary`

**Adresses / contacts** — `hasAddressRole`, `findPrimaryAddress`, `resolveBillingAddress`, `listSiteAddresses`,
`toPostalAddress`, `isPostalAddressEmpty`, `formatPostalAddress`, `hasContactRole`, `findPrimaryContact`,
`resolveBillingContact`, `listSiteContacts`

**Snapshot** — `captureDocumentRecipient`, `renderRecipientBlock`, `diffSnapshotAgainstClient`

**Recherche** — `buildClientSearchPlan`, `escapeLikePattern`, `tokenizeSearchTerm`, `buildSearchDocument`

**Normalisation** — `normalizeSearchText`, `normalizePhoneNumber`, `normalizeEmail`, `normalizePostalCode`,
`normalizeVatNumber`, `normalizeActivityCode`, `normalizeCountryCode`, `keepDigits`, `toNullableText`

**Identifiants légaux** — `isValidSiren`, `isValidSiret`, `sirenFromSiret`, `computeFrenchVatKey`,
`buildFrenchVatNumber`, `isValidVatNumber`, `isValidActivityCode`, `isValidPostalCode`, `isPlausibleEmail`,
`isPlausiblePhoneNumber`

**Référence / synchronisation** — `isClientReferenceUnlinked`, `markReferenceDesynchronized`,
`refreshClientReference`, `createSyncEnvelopeBase`, `buildIdempotencyKey`, `canWriteDirectly`,
`detectClientSyncConflict`

**Sérialisation** — `serializeStable`, `serializeClientDetails`, `serializeDocumentRecipientSnapshot`,
`serializeClientReference`, `serializeClientSyncEnvelope`, `parseClientDetails`,
`parseDocumentRecipientSnapshot`, `parseClientReference`, `parseClientSyncEnvelope`

**Constantes** — `CLIENT_CONTRACT_VERSION`, `CLIENT_SCHEMA_VERSIONS`, `CLIENT_CATEGORIES`, `CLIENT_KINDS`,
`CLIENT_STATUSES`, `CLIENT_ADDRESS_ROLES`, `CLIENT_CONTACT_ROLES`, `CLIENT_SOURCE_APPLICATIONS`,
`CLIENT_AUTHORITATIVE_APPLICATION`, `CLIENT_LINK_STATUSES`, `CLIENT_REFERENCE_UNLINKED`,
`CLIENT_SEARCH_FIELDS`, `CLIENT_SYNC_SCOPES`, `EMPTY_POSTAL_ADDRESS`, `EMPTY_LEGAL_IDENTITY`,
`DEFAULT_COUNTRY_CODE`, `SEARCH_MAX_TOKENS`

**Absent de l'API publique, volontairement** : `IssueCollector` (interne), et l'intégralité de `fixtures.ts`.
Un test le vérifie.

---

## 8. Décisions de conception structurantes

### 8.1 Le snapshot documentaire est un type disjoint, pas une convention

C'est le P0 de l'audit (§8, risques R1–R4). La séparation n'est pas documentaire, elle est **structurelle** :

- `ClientDocumentRecipientSnapshot` ne porte ni `status`, ni `notes`, ni `addresses`, ni `contacts`, ni
  `references`, ni `createdAt` — un test énumère les clés et l'exige ;
- son adresse est un `PostalAddress` **nu** (6 champs : `line1`, `line2`, `postalCode`, `city`, `region`,
  `country`) — ni identifiant, ni rôle, ni horodatage, donc rien qui pointe vers un enregistrement mutable ;
  un test énumère ces 6 clés exactement ;
- `renderRecipientBlock(snapshot)` n'accepte **que** le snapshot : sa signature démontre qu'imprimer un document
  n'exige aucune résolution de `sourceClientId`, qui reste de traçabilité pure ;
- toutes les propriétés sont `readonly` et **il n'existe aucune fonction de mise à jour**. `captureDocumentRecipient`
  est la seule porte d'entrée, et c'est une fonction pure (`capturedAt` est fourni par l'appelant, pas lu à
  l'horloge) ;
- `diffSnapshotAgainstClient` permet de **constater** la dérive sans jamais la corriger.

Le test décisif : on capture, on modifie ensuite raison sociale, SIRET et adresse de la fiche, et on vérifie que
`renderRecipientBlock` rend exactement la même chose.

### 8.2 Rôles plutôt que types d'adresse distincts

Suivant §18 de l'audit, il n'existe **pas** de `BillingAddress` ni de `SiteAddress` : une seule `ClientAddress`
portant un **ensemble** de rôles (`primary` | `billing` | `site`). L'adresse unique qui sert de siège et de
facturation porte `["primary", "billing"]`, ce qui remplace le booléen `facturation_identique_principale` par un
fait directement lisible, sans champ conditionnellement obligatoire.

Invariants vérifiés au niveau **collection** : au plus une `primary`, au plus une `billing`, autant de `site`
que voulu, identifiants uniques, locataire homogène. `resolveBillingAddress` replie explicitement sur l'adresse
principale — règle du contrat, et non improvisation d'appelant : sans elle, deux consommateurs factureraient à
des adresses différentes.

Même construction pour les contacts, avec une nuance : un contact **archivé** ne consomme pas un rôle unique,
ce qui permet de remplacer l'interlocuteur principal sans supprimer physiquement le précédent.

### 8.3 `kind` et `displayName` sont dérivés — et le validateur l'impose

`kind` doit valoir `deriveClientKind(category)`, `displayName` doit valoir `computeClientDisplayName(...)`. Les
deux figurent quand même dans la charge utile pour qu'un consommateur n'embarque pas la logique, mais une valeur
divergente est refusée (`invariant_violated`). C'est ce qui les empêche de devenir des sources de vérité
concurrentes.

`computeClientDisplayName` corrige au passage le défaut relevé par l'audit sur `nomClient` : la catégorie
commande. Pour un particulier, l'état civil prime **même si** une société traîne dans la fiche.

### 8.4 Généralisation de `ExternalReference`, pas concurrence

`ClientReference` reprend de `packages/drone-core/src/common.ts` les mêmes noms de champs (`sourceApp`,
`syncStatus`, `synchronizedAt`), les mêmes trois statuts (`not_linked` | `linked` | `desynchronized`) et la même
constante « non liée ». Il ajoute ce que l'audit lui reproche d'omettre : le **locataire** (sans lequel la
référence n'est pas vérifiable) et le **libellé** (sans lequel il faut appeler GP pour afficher un nom).
`CLIENT_SOURCE_APPLICATIONS` élargit la liste à `drone` et `colors`, faute de quoi Drone ne pourrait pas se
désigner lui-même comme source.

`CLIENT_REFERENCE_UNLINKED` est une référence **valide** : c'est le test d'acceptation du mode standalone.

### 8.5 Asymétrie d'autorité, vérifiée et non seulement documentée

Seule `gestion_pro` peut porter la portée `client:write` ; une application tierce ne peut que `client:propose`.
Le validateur d'enveloppe **refuse** une enveloppe `reserves` ou `drone` portant `client:write`
(`invariant_violated`). Il n'existe **aucune opération de suppression** : le besoin réel derrière « supprimer »
est `unlink`.

L'ordre de détection des conflits est délibéré — locataire, puis permissions, puis existence, puis archivage,
puis version : répondre « version périmée » à une enveloppe visant un autre locataire divulguerait l'existence
de la fiche visée.

### 8.6 Compatibilité ascendante par tolérance aux champs inconnus

Les validateurs **ignorent** les champs qu'ils ne connaissent pas. Un ajout de champ optionnel ne change donc
pas le majeur, et une charge utile 1.1 reste lisible par un lecteur 1.0. Retirer un champ ou changer le sens
d'un champ incrémente le majeur, et le lecteur refuse alors explicitement (`unsupported_schema_version`) plutôt
que de deviner. Deux tests couvrent les deux sens.

---

## 9. Tests et résultats exacts

### Suite dédiée

```
$ npx vitest run packages/client-contracts
 Test Files  11 passed (11)
      Tests  147 passed (147)
   Duration  306ms
```

| Fichier | Couverture |
|---|---|
| `identity.test.ts` | catégorie/nature dérivée, nom d'affichage (particulier, professionnel, repli sur référence), particulier minimal, professionnel complet, cohérence SIREN↔SIRET, clé fausse, APE, collecte multi-anomalies, création |
| `address.test.ts` | rôle double, facturation identique, facturation **différente**, plusieurs chantiers, doublons de rôle unique, code postal FR/étranger, pays non ISO, coordonnées hors bornes, rendu imprimable, **fuite de locataire** |
| `contact.test.ts` | plusieurs contacts, rôles distincts, repli facturation, doublon de rôle actif, contact archivé remplacé, doublon d'identifiant, **fuite de locataire**, contact sans identité |
| `legal-identifiers.test.ts` | SIREN/SIRET valides et mis en forme, clés fausses, **exception La Poste**, clé TVA FR, TVA étrangère, APE avec point, codes postaux |
| `normalization.test.ts` | accents, ligatures, tiret/apostrophe/point, espaces, téléphone (4 écritures → 1 forme), international, TVA/APE/chiffres, jetons, plafond, terme vide, document de recherche |
| `document-snapshot.test.ts` | capture professionnel/particulier, adresse de facturation et non de chantier, pureté, **autonomie du rendu**, **immuabilité face à une fiche modifiée**, diff, absence des champs de fiche vivante, adresse nue à 6 clés, validation, aller-retour JSON |
| `search.test.ts` | plan conjonctif, mode liste, bornes, **échappement `LIKE`**, requête sans locataire, champ inconnu, filtre inconnu, **fuite de locataire dans un résultat**, dépassement de limite, version de schéma |
| `sync.test.ts` | proposition tierce, aller-retour JSON, charge utile d'un autre locataire, acteur d'un autre locataire, **`client:write` refusé à une application tierce**, accordé à GP, clé d'idempotence, archivage sans `clientId`, version périmée, **priorité du locataire sur les autres conflits**, permission, cible inexistante, fiche archivée |
| `reference.test.ts` | **référence entièrement nulle valide**, liaison complète, liaison sans locataire/sans identité, identifiant externe non-UUID, contradiction `not_linked`, cycle désynchronisation/rafraîchissement, aller-retour |
| `serialization.test.ts` | ordre stable, `undefined` → `null`, `NaN`, allers-retours (complet, minimal, multi-adresses/contacts), JSON illisible, **compatibilité de version dans les deux sens**, garde de locataire |
| `public-api.test.ts` | **aucun `any` dans le paquet**, aucune dépendance applicative importée, aucune dépendance déclarée, fixtures et `IssueCollector` non exportés, présence des validateurs, versions parsables |

Correspondance avec les cas exigés par le brief : particulier ✓ · professionnel ✓ · minimal ✓ · complet ✓ ·
plusieurs contacts ✓ · plusieurs adresses ✓ · facturation différente ✓ · plusieurs chantiers ✓ · SIRET au format
attendu ✓ · données invalides ✓ · sérialisation/désérialisation ✓ · compatibilité de version ✓ · snapshot
documentaire ✓ · enveloppe de synchronisation ✓ · conflit ✓ · absence de fuite tenant ✓ · absence de `any` dans
l'API publique ✓.

### Suite complète du dépôt

```
$ npx vitest run
 Test Files  103 passed (103)
      Tests  953 passed (953)
   Duration  2.25s
```

806 tests préexistants + 147 nouveaux = 953. **Aucune régression.**

### TypeScript

```
$ npx tsc --noEmit --incremental false
(aucune sortie — 0 erreur)
```

### Lint

```
$ npx eslint
✖ 3 problems (0 errors, 3 warnings)
```

Les 3 avertissements sont **préexistants** et sans rapport avec ce lot (`@next/next/no-img-element` dans
`src/app/(app)/boutique/…` et `src/components/SignatureEmploye.tsx`). Aucun fichier du paquet n'est signalé.

### Non exécuté, et pourquoi

`npm run build` (Next.js + build `apps/tools`) et `npm run test:e2e` (Playwright) n'ont pas été lancés : ce lot
n'ajoute aucun composant, aucune route, aucun import applicatif, et aucune application ne consomme encore le
paquet. Le typecheck racine couvre déjà `packages/**` et valide donc intégralement le nouveau code. Les
vérifications `verify:migrations`, `verify:secrets` et `verify:stripe-prices` sont sans objet — aucune
migration, aucun secret, aucun prix touché.

---

## 10. Exemples d'utilisation

Les exemples complets et exécutables figurent au **§4 de
`docs/architecture/ELSATIA_CLIENT_CONTRACTS_CANONICAL_V1.md`** :

1. création d'un particulier ;
2. création d'une entreprise (SIREN/SIRET/TVA/APE vérifiés et cohérents entre eux) ;
3. adresse de facturation distincte ;
4. adresses de chantier multiples ;
5. capture et rendu d'un snapshot de destinataire ;
6. recherche (plan, motifs indexables, garde de locataire) ;
7. synchronisation standalone → Gestion Pro (enveloppe, portées, conflit) ;
8. consommation future par Réserves et Drone.

Un aperçu, le plus court possible, du point critique :

```ts
const snapshot = captureDocumentRecipient(details, { capturedAt: emisLe });
// … des années plus tard, sans aucune lecture de la fiche client :
renderRecipientBlock(snapshot);
```

---

## 11. Limites

1. **Aucune application ne consomme encore le paquet.** L'alias `tsconfig.json` racine le rend disponible à
   Gestion Pro ; `apps/tools` et `apps/colors` devront ajouter le leur au moment où ils l'utiliseront. Rien ne
   prouve donc *à l'usage* que le contrat épouse les besoins réels de GP — ce sera l'objet du lot « GP Client
   Core ».
2. **La normalisation n'a pas encore de miroir SQL.** `normalization.ts` est l'implémentation de référence ;
   tant que la fonction SQL `normaliser()` n'existe pas, rien ne garantit **automatiquement** leur symétrie. Or
   une asymétrie rend l'index inutile en silence. C'est le premier test à écrire dans le lot « Universal Client
   Search ».
3. **Les identifiants sont marqués statiquement.** À l'exécution ce sont des chaînes : une valeur venue du
   réseau n'est sûre qu'après `asTenantId()` ou un validateur. Le marquage protège du mélange à la compilation,
   pas de la donnée non validée.
4. **Validation légale de forme et de clé, jamais d'existence.** Aucun appel réseau, aucune consultation de base
   entreprise : un SIRET syntaxiquement valide peut désigner un établissement fermé.
5. **TVA non française vérifiée sur le format seul**, et clés TVA françaises **alphabétiques** acceptées sans
   contrôle (algorithme non public).
6. **`contacts_clients` est gelée côté GP** (grants PostgREST révoqués) : le contrat décrit les contacts, mais
   un consommateur d'aujourd'hui verra `contacts: []`. Décrire l'état gelé aurait obligé à sortir une version 2
   le jour du dégel.
7. **La recherche transverse (chantiers, devis, factures) n'est pas contractualisée** — délibérément : mélanger
   l'adresse de chantier au moteur client produit des faux positifs incompréhensibles.
8. **Aucune règle de fusion / dédoublonnage de clients** n'est fournie. `duplicate_identity` existe comme type
   de conflit, mais la politique de résolution appartient à GP.

---

## 12. Risques

| # | Risque | Gravité | Atténuation en place |
|---|---|---|---|
| C1 | Divergence entre la normalisation TS et la future `normaliser()` SQL → index silencieusement inutile | **P1** | implémentation de référence documentée et testée ; test de symétrie exigé dans le lot recherche |
| C2 | Un adaptateur persiste `ClientDetails` chez un tiers au lieu d'un `ClientReference` | **P1** | règle écrite dans `client.ts` et dans la doc ; à faire respecter en revue du lot adaptateur |
| C3 | Un adaptateur imprime un document depuis la fiche vivante malgré le snapshot | **P0 si réalisé** | `renderRecipientBlock` n'accepte que le snapshot ; test d'immuabilité ; mais rien n'empêche techniquement un contournement — c'est un point de revue obligatoire du lot GP |
| C4 | Le contrat s'écarte des besoins réels de GP, découvert tard | **P2** | correspondance colonne à colonne au §6 de la doc ; premier lot consommateur volontairement GP |
| C5 | Deux doctrines FK opposées (Réserves utilise une vraie FK, Drone une référence faible) | **P2** | doctrine tranchée par l'audit et rappelée dans `reference.ts` : FK admise dans un même schéma, référence faible **obligatoire** dès qu'on franchit une frontière de déploiement. Aucune implémentation existante n'est à refaire |
| C6 | `archive` ajouté à `CLIENT_STATUSES` n'existe pas dans le CHECK de `clients.statut` | **P2** | l'écart est documenté ; il devra être porté par la migration du lot GP Client Core, ou le contrat devra retirer la valeur |
| C7 | Ajout de champ mal jugé « mineur » cassant un consommateur déployé | **P2** | règle de versionnement écrite et testée dans les deux sens |

**Risques non couverts par ce lot, et qui restent entiers** : R1 à R4 de l'audit (facture au destinataire
mutable, devis sans snapshot d'émetteur, empreinte de signature ne couvrant pas le destinataire, lien externe
servant un document muté). Ce lot fournit **l'outil** qui les ferme ; il ne les ferme pas. Tant que Gestion Pro
n'appelle pas `captureDocumentRecipient` à l'émission, le comportement de production est inchangé.

---

## 13. Migrations

**AUCUNE.**

Confirmation explicite :

- `git status --short -- supabase/` → vide ;
- aucun fichier ajouté dans `supabase/migrations/` ;
- ledger inchangé à **265** sur la base `996be15` ;
- `public.clients` n'est pas modifiée — ni colonne, ni contrainte, ni index, ni grant, ni policy ;
- `contacts_clients`, `chantiers`, `devis`, `factures` : non touchées ;
- aucun accès Supabase distant, local ou de prévisualisation n'a été ouvert ;
- aucune dépendance npm ajoutée ; `package-lock.json` inchangé.

---

## 14. Prochaines étapes recommandées

Dans cet ordre — chaque étape suppose la précédente.

### 1. GP Client Core
Migration d'enrichissement de `public.clients` (`siren`, `numero_tva`, `code_ape`, `rcs`, `forme_juridique`,
`capital_social`, `pays`, `complement_adresse`, `civilite`, `telephone_normalise`), réhabilitation de
`raison_sociale` et arbitrage du doublon `societe`/`raison_sociale`, **et surtout** création du snapshot
destinataire sur `devis` et `factures` avec appel à `captureDocumentRecipient` à l'émission. Adaptateur GP ↔
contrat, arbitrage du statut `archive`. C'est ce lot qui ferme R1–R4.

### 2. Universal Client Search
Fonction SQL `normaliser()` **miroir** de `normalization.ts` — avec un test de symétrie sur un corpus partagé
avant toute autre chose —, colonne `recherche_document` générée, index GIN `gin_trgm_ops`, RPC
`clients_recherche` consommant `ClientSearchPlan`, tests pgTAP cross-tenant. À jouer dans une base clonée
jetable, pas via `db reset`.

### 3. GP Client UX / Adresses
Dégel de `contacts_clients` (grants + RLS), table d'adresses normalisée portant les rôles, formulaire client
différencié particulier / professionnel, écran de gestion des adresses et contacts, affichage de la divergence
snapshot ↔ fiche sur les documents émis.

### 4. Réserves Client Adapter
`ClientReference` facultatif sur `reserves_chantiers`, alimenté depuis le chantier GP lié. Le mode standalone
reste le mode nominal : une réserve s'émet sans client.

### 5. Drone Client & Quote Bridge
Remplacement de `DroneProject.client_name` par un `ClientReference` et de `DroneProject.address` par un
`PostalAddress` ; implémentation de `GestionProDronePort.publishProjectSummary` en `ClientSyncEnvelope` de portée
`client:propose` ; préparation de devis GP depuis un relevé.

### 6. QA transverse
Recette bout en bout multi-applications : création d'un client dans GP, rattachement depuis Réserves et Drone,
émission d'un devis puis d'une facture, **modification de la fiche client après émission**, et vérification que
les documents émis n'ont pas bougé. Tests cross-tenant sur les cinq applications. C'est la recette qui atteste
que les risques R1–R4 sont réellement fermés.

---

## 15. Conformité au brief

| Exigence | État |
|---|---|
| Indépendance vis-à-vis de Réserves V4, du correctif P0 snapshot, du futur adaptateur Réserves, du futur pont Drone | ✓ worktree et branche dédiés, base neutre `996be15`, aucun fichier de ces périmètres touché |
| Sécurité Git : dépôts, audit, branche, SHA, worktrees, WIP, stashes, commits non poussés | ✓ §3 et §4 |
| Ne pas repartir de `main` sans justification | ✓ justifié : `main` obsolète de 329 commits |
| Ne pas modifier la production | ✓ aucun déploiement, aucun accès distant |
| Aucune migration SQL | ✓ §13 |
| Ne pas modifier `public.clients` | ✓ §13 |
| Ne pas réaliser les adaptateurs applicatifs | ✓ aucune application modifiée |
| Emplacement partagé sûr, sans monorepo forcé ni dépendance circulaire | ✓ §2 |
| Contrats demandés (identité, pro, adresse, contact, référence, résumé, détail, inputs, recherche, sync, conflit, snapshot, erreurs, version) | ✓ §7 |
| Éviter `any`, types trop génériques, React, Supabase, dépendances applicatives, logique UI, dépendance à `public.clients` | ✓ vérifié par test |
| Recherche et synchronisation préparées sans base serveur | ✓ §8.5, plan pur et enveloppes typées |
| Standalone sans appel à GP à chaque lecture | ✓ `CLIENT_REFERENCE_UNLINKED` valide, testé |
| Tests exigés | ✓ §9, les 17 cas couverts |
| Documentation avec exemples | ✓ §10 |
| Audit Git final, commit, push, aucun merge, aucun déploiement | ✓ §4 et §5 |
