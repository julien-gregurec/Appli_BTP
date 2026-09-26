# ELSATIA — Symétrie snapshot SQL ↔ contrat canonique

**Lot** : `ELSATIA-GP-CLIENT-CONTRACTS-SNAPSHOT-INTEGRATION-V1`
**Sources** : `20260908000272_client_document_snapshot_v1.sql` (forme stockée) et
`@elsatia/client-contracts` v1.0.0 (forme d'échange)
**Pont** : `src/lib/client-snapshot-contrat.ts` — **aucune migration**

---

## 1. Le constat qui commande tout le reste

Les deux lots ont produit deux modèles qui portent le même nom et ne partagent **aucun nom de propriété**.

| | Snapshot stocké (migration 272) | Contrat canonique (paquet) |
|---|---|---|
| forme | plat | imbriqué (`legal`, `billingAddress`, `contact`) |
| langue | français `snake_case` | anglais `camelCase` |
| version | `version: 1` (nombre) | `schemaVersion: "elsatia.client.document-recipient-snapshot/1"` (texte) |
| identifiant client | `client_id` | `sourceClientId` |
| locataire | **absent du JSON** (contrainte de capture) | `tenantId` obligatoire |
| horodatage | colonne `client_snapshot_at` | champ `capturedAt` |
| adresse | 5 colonnes à plat | `billingAddress: PostalAddress \| null` |
| nom imprimé | `nom_affiche` | `displayName` |
| provenance | `provenance` + `identite_incertaine` + `herite_de` | *(rien — hors contrat)* |
| statut commercial | `statut` capturé | *(volontairement absent)* |

Un simple `as` entre les deux aurait produit un objet dont **tous** les champs sont `undefined`, et le
validateur du paquet l'aurait accepté sur la seule foi du `schemaVersion` si celui-ci avait été forcé. C'est
précisément le piège que ce lot ferme.

---

## 2. Modèle canonique retenu

**Deux formes, deux rôles, une conversion prouvée. Ni fusion, ni réécriture.**

- **Forme de stockage** : celle de la migration 272, **définitivement**. La migration pose
  `verrouiller_client_snapshot`, qui interdit toute réécriture d'un snapshot renseigné sur *tout* chemin
  d'écriture. Les snapshots déjà capturés et backfillés ne peuvent donc plus changer de forme : leur imposer
  le schéma du contrat exigerait de lever la garde qui fait tout l'intérêt du lot P0. Le mécanisme SQL validé
  n'est pas touché — pas une ligne.
- **Forme d'échange** : `ClientDocumentRecipientSnapshot` du paquet. C'est elle que Réserves, Drone et tout
  futur consommateur liront, elle qui porte la version de schéma, la validation et le rendu autonome.
- **Pont** : `versContratDestinataire()` / `versSnapshotSqlV1()`, purs, totaux, et **réversibles**.

Aucun type n'est dupliqué : `ClientSnapshot` (`src/lib/client-snapshot.ts`) reste la seule déclaration de la
forme stockée, `ClientDocumentRecipientSnapshot` (paquet) la seule de la forme d'échange.

---

## 3. Table de correspondance

Registre exécutable : `CORRESPONDANCE_SNAPSHOT_SQL_V1`. Un test extrait les clés du **texte de la migration
272** et vérifie que le registre les couvre exactement, dans les deux sens — ajouter une colonne à la liste
blanche SQL sans l'inscrire ici fait échouer la suite.

| Clé SQL | Destination | Chemin |
|---|---|---|
| `version` | contrat | `schemaVersion` |
| `client_id` | contrat | `sourceClientId` |
| `nom_affiche` | contrat | `displayName` |
| `reference_interne` | contrat | `reference` |
| `type` | contrat | `category` (+ `kind` dérivé) |
| `nom` / `prenom` | contrat | `lastName` / `firstName` |
| `raison_sociale` | contrat | `legalName` |
| `forme_juridique` | contrat | `legal.legalForm` |
| `siret` | contrat | `legal.siret` |
| `numero_tva` | contrat | `legal.vatNumber` |
| `adresse_facturation` | contrat | `billingAddress.line1` |
| `adresse_complement` | contrat | `billingAddress.line2` |
| `code_postal` / `ville` | contrat | `billingAddress.postalCode` / `.city` |
| `telephone` / `email` | contrat | `phone` / `email` |
| `contact` | contrat | `contact` (`nom`→`displayName`, `fonction`→`jobTitle`) |
| `provenance` | GP | `provenance` |
| `identite_incertaine` | GP | `identiteIncertaine` |
| `herite_de` | GP | `heriteDe` |
| `pays` | hors contrat | `paysFige` (+ alimente `billingAddress.country`) |
| `societe` | hors contrat | `societe` (+ alimente `tradeName`) |
| `nom_commercial` | hors contrat | `nomCommercial` (+ alimente `tradeName`) |
| `statut` | hors contrat | `statut` |
| `conditions_paiement` | hors contrat | `conditionsPaiement` |

**26 clés, 26 destinations. Aucune perte silencieuse.**

Trois clés sont conservées *à la fois* brutes et projetées : `pays`, `societe` et `nom_commercial`. C'est ce
qui rend le retour exact. Sans `paysFige`, on ne saurait plus distinguer « pays non renseigné » (le cas réel
aujourd'hui, la colonne n'existant pas) de « France explicitement figée ».

---

## 4. Écarts traités

### 4.1 `archive` : statut du contrat absent du CHECK SQL — **sans effet**

`CLIENT_STATUSES` du paquet contient `archive` ; le CHECK de `clients.statut` ne connaît que
`prospect | actif | inactif`. **L'écart ne peut pas mordre dans ce lot** : le statut commercial ne franchit
pas le contrat de destinataire — il n'a rien à faire sur une pièce comptable — et voyage verbatim dans
`horsContrat.statut`, typé `string | null`. Un test le démontre en faisant transiter la valeur `archive`.

L'arbitrage reste à rendre dans le lot GP Client Core : soit le CHECK accueille `archive`, soit le contrat
retire la valeur. Le pont, lui, n'aura rien à changer.

### 4.2 Symétrie `normalization.ts` ↔ normalisation SQL — **hors périmètre, non régressée**

Aucune normalisation n'intervient dans la chaîne du snapshot : la migration 272 recopie des valeurs, elle ne
les normalise pas. L'écart appartient entièrement au lot Universal Client Search, où la fonction SQL
`normaliser()` devra être le miroir exact de `normalization.ts` — **et le test de symétrie devra être écrit
avant elle**, faute de quoi une divergence rendra l'index GIN inutile en silence.

Ce lot ne crée aucune normalisation et n'en consomme aucune : rien n'y est ni réglé, ni aggravé.

### 4.3 Coexistence de `sourceClientId` et `client_id` — **même valeur, deux rôles**

Ce sont bien la même donnée. Le contrat la renomme, il ne la double pas, et la table de correspondance
l'inscrit comme une projection unique.

Ce qui **n'est pas** la même chose, en revanche :

- côté SQL, le **locataire** est une *contrainte de capture* — `construire_client_snapshot` ne lit le client
  que s'il appartient à `p_entreprise_id` — mais il n'est pas recopié dans le JSON ;
- côté contrat, `tenantId` est **obligatoire**, parce qu'un snapshot détaché de sa ligne doit rester
  vérifiable.

Le pont exige donc que l'appelant fournisse `tenantId` (l'`entreprise_id` de la ligne du document) et
`capturedAt` (`client_snapshot_at`). Ce ne sont pas des inventions : ce sont deux colonnes de la ligne, que le
JSON n'a jamais eu à porter.

`sourceClientId` reste de **traçabilité pure** : aucune fonction ne le déréférence, et `renderRecipientBlock`
imprime un document complet sans lui.

### 4.4 Version du snapshot — **refus explicite plutôt que lecture optimiste**

`version: 1` (nombre, SQL) ↔ `elsatia.client.document-recipient-snapshot/1` (texte, contrat). Le pont refuse
tout `version` autre que 1 avec `unsupported_schema_version` plutôt que de deviner la sémantique de champs
qu'il ne connaît pas. Un test le couvre.

Le versionnement reste **découplé** : la forme stockée peut passer à `version: 2` sans toucher le contrat, et
réciproquement. Le pont est le seul endroit où les deux se rencontrent.

### 4.5 Champs absents de `public.clients` — **rien à faire ici, et c'est voulu**

Cinq clés de la liste blanche de la migration 272 n'ont pas de colonne : `nom_commercial`, `forme_juridique`,
`numero_tva`, `adresse_complement`, `pays`. Elles sont donc figées à `null` aujourd'hui — la migration les
prévoit exprès, pour qu'ajouter la colonne plus tard n'oblige pas à réécrire la fonction de capture.

Le lot qui les créera existe déjà, **en attente** :
`docs/migrations-proposees/client-legal-fields-v1.sql.proposed`, sur la ligne
`feat/gp-client-document-snapshot-p0-v1`. Il est délibérément hors de `supabase/migrations/` et sans numéro,
bloqué par `ELSATIA-ECOSYSTEM-MIGRATION-LEDGER-RECONCILIATION-P0-V1`.

**Ce lot n'en crée aucune, et n'en a pas besoin.** Trois tests démontrent que le pont est déjà compatible : il
porte les cinq champs dès que la base les renseignera, **sans qu'une ligne du pont change**.

### 4.6 Immuabilité `readonly` TypeScript ↔ immuabilité réelle en base — **deux garanties de nature différente**

| | Portée | Ce que ça arrête |
|---|---|---|
| `readonly` (contrat) | compilation | une réaffectation écrite dans le code TypeScript |
| `verrouiller_client_snapshot` (272) | **table** | tout `UPDATE`, y compris RPC, PostgREST direct, script, session superutilisateur |

Le `readonly` du contrat n'ajoute **rien** à la garantie réelle : il ne survit pas à un `JSON.parse`, et il
n'existe plus à l'exécution. La garantie qui compte est celle de la base, et elle est déjà posée et testée par
le lot GP.

Le pont respecte la division : `versSnapshotSqlV1()` est documentée comme **non destinée à la production** —
la capture reste le fait du déclencheur base, seul point que rien ne contourne. Elle n'existe que pour rendre
la symétrie démontrable par aller-retour.

### 4.7 Données historiques du backfill — **portées, marquées, jamais blanchies**

Les documents antérieurs ont été rattrapés avec l'identité **actuelle** du client, marqués
`provenance = 'backfill_identite_actuelle'` et `identite_incertaine = true`.

Le pont **remonte les deux marqueurs** en champs nommés. Un consommateur du contrat ne peut donc pas prendre
une identité reconstituée pour une identité observée à l'émission — sauf à ignorer délibérément un champ qui
lui est tendu. Deux tests couvrent le cas, dont un aller-retour complet.

Réserve d'honnêteté, héritée du lot GP et non levée ici : ces identités **peuvent différer** de ce qui a été
réellement imprimé à l'époque. `public.clients` n'est pas historisé ; aucun autre matériau n'existait.

---

## 5. Ce que ce lot ne fait pas

- aucune migration, aucune modification de `public.clients`, aucun objet SQL touché ;
- aucune modification de la migration 272, de ses déclencheurs, de son backfill ni de ses assertions pgTAP ;
- aucun basculement des consommateurs GP vers le contrat : `identiteClientDocument` reste le chemin de
  production, et un test prouve que les deux chemins impriment le même destinataire — c'est ce qui autorisera
  la bascule plus tard sans changer un seul document ;
- ni Universal Client Search, ni Réserves Client Adapter, ni Drone Bridge, ni DOE.
