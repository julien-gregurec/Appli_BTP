# ELSATIA — GP CLIENT CONTRACTS / SNAPSHOT INTEGRATION — RAPPORT

**Date** : 2026-09-07
**Lot** : `ELSATIA-GP-CLIENT-CONTRACTS-SNAPSHOT-INTEGRATION-V1`
**Périmètre** : intégrer `@elsatia/client-contracts` dans la lignée GP Snapshot. Aucune migration, aucune fusion, aucun déploiement.

---

## 1. Verdict

## **VALIDÉ**

Le paquet est intégré dans la lignée GP Snapshot **sans conflit Git, sans duplication de type, et sans toucher
une ligne du mécanisme SQL validé**. La migration 272, ses déclencheurs, son backfill et ses 1245 assertions
pgTAP sont intacts et rejoués avec succès.

**Réserve importante, non bloquante pour ce lot** : l'audit a établi que les deux modèles portent le même nom
et ne partagent **aucun nom de propriété**. Ils n'ont pas été fusionnés — ils ont été **pontés**, et la
symétrie est démontrée par test. Le détail est au §5.

---

## 2. Stratégie Git

**Cherry-pick sur une branche d'intégration issue du lot GP Snapshot validé.**

```
dfb6f35 (feat/gp-client-document-snapshot-p0-v1, SHA fourni)
   │
   ├── worktree dédié → integration/gp-client-contracts-snapshot-v1
   │
   ├── cherry-pick fdeaaf4  → d8f9aa7   (paquet + doc + alias tsconfig)
   ├── cherry-pick e7f837b  → 06fb69c   (rapport Client Contracts)
   └── commit                 4980334   (pont + tests + doc de symétrie)
```

Pourquoi le cherry-pick plutôt qu'un merge : les deux lots partagent l'ancêtre `996be15`, mais la ligne GP
porte **12 commits** que la ligne contrats n'a pas (opérations post-cutover, propriétaire global plateforme,
notifications support). Un merge aurait mêlé deux historiques pour deux commits utiles. Le cherry-pick prend
exactement les deux commits du lot contrats, dans l'ordre, sur la base validée.

**Aucune option de résolution forcée n'a été employée** : ni `-X ours`, ni `-X theirs`, ni `--strategy`. Les
deux cherry-picks se sont appliqués proprement.

---

## 3. SHA sources et branche finale

| | |
|---|---|
| **Source A — Client Contracts** | `e7f837b9c369c7867b22c20958e4ca97be9b6bc2` — vérifié présent, poussé sur `origin/feat/client-contracts-canonical-v1` |
| **Source B — GP Client Document Snapshot** | `dfb6f35c9b14acbda2f17e1de3fee9fdf62c181a` — vérifié présent, poussé sur `origin/feat/gp-client-document-snapshot-p0-v1` |
| **Ancêtre commun** | `996be15c136f09d9977375e700462b503a1720c3` |
| **Divergence** | contrats : 2 commits · GP : 12 commits |
| **Branche finale** | `integration/gp-client-contracts-snapshot-v1` |
| **SHA final complet poussé** | `4980334a3659cde79d1bbb1a90f357f9e9af82fb` |
| **Remote** | `git@github.com:julien-gregurec/Appli_BTP.git` |
| **Fusionné / déployé** | **non** — aucun merge, aucune PR, aucun déploiement |

### Signalement : la branche source B a avancé

`feat/gp-client-document-snapshot-p0-v1` est aujourd'hui à `253d23e`, soit **2 commits au-delà** du SHA
fourni, et ces commits **sont poussés**. Il s'agit du lot
`ELSATIA-GP-DOCUMENT-RESEND-OVERRIDE-AND-CLIENT-LEGAL-FIELDS-V1`, mené en parallèle : surcharge d'adresse de
renvoi, et **proposition** de migration pour les champs légaux client.

Cette intégration part bien de `dfb6f35`, le SHA désigné comme validé. Conséquence à connaître avant toute
fusion : ce lot parallèle **modifie le même fichier pgTAP** (`client_document_snapshot_v1.test.sql`, porté de
21 à 26 assertions). Le conflit est prévisible, localisé et bénin — deux jeux d'assertions additifs dans un
même fichier — mais il existera. Voir §10, P1-1.

---

## 4. Conflits rencontrés

**Aucun conflit Git.** Vérifié avant de brancher : l'intersection des fichiers touchés par les deux lots est
**vide**.

| Risque anticipé | Réalité |
|---|---|
| `tsconfig.json` (alias) | le lot GP ne l'a pas touché → application propre |
| `supabase/migrations/` | le lot contrats n'en a créé aucune → aucun conflit de ledger |
| `docs/audits/` | noms de fichiers distincts |
| `src/lib/` | le lot contrats ne touche que `packages/` |

En revanche, **trois incompatibilités fonctionnelles** que le Git ne pouvait pas voir ont été trouvées et
corrigées :

1. **`vitest.config.ts` n'aliasait pas `@elsatia/*`.** Next.js résout les `paths` du tsconfig, Vitest non. Le
   premier fichier GP important le paquet échouait au chargement (`Cannot find package`). Les 147 tests du
   paquet ne l'avaient pas révélé : ils utilisent des imports relatifs. Alias ajouté pour
   `client-contracts` **et** `application-access`, qui était latent avec le même défaut.
2. **`ClientSnapshot` sous-déclarait la forme stockée.** Le type omettait `type`, `statut` et
   `conditions_paiement`, pourtant présents dans la liste blanche de la migration 272 et donc bel et bien
   dans le JSON en base. Le type était plus étroit que la donnée réelle. Complété — sans dupliquer : il reste
   la seule déclaration de la forme stockée.
3. **Les horodatages PostgreSQL ne passent pas le validateur du contrat.** PostgREST rend un `timestamptz`
   sous la forme `2026-09-08T20:26:04.123456+00:00` ; le contrat exige un `Z` et au plus trois décimales.
   Sans normalisation, **tout snapshot réel** aurait échoué la validation alors que sa donnée est correcte.
   `versIsoUtc()` traite le cas, et un test le pin.

---

## 5. Modèle canonique retenu

### 5.1 Le constat

Les deux lots ont produit deux modèles qui portent le même nom et ne partagent **aucun nom de propriété**.

| | Stocké (migration 272) | Contrat (paquet) |
|---|---|---|
| forme | plat | imbriqué (`legal`, `billingAddress`, `contact`) |
| langue | français `snake_case` | anglais `camelCase` |
| version | `version: 1` (nombre) | `schemaVersion: "…/1"` (texte) |
| client | `client_id` | `sourceClientId` |
| locataire | **absent du JSON** | `tenantId` obligatoire |
| horodatage | colonne `client_snapshot_at` | champ `capturedAt` |
| adresse | 5 clés à plat | `billingAddress: PostalAddress \| null` |
| nom imprimé | `nom_affiche` | `displayName` |
| provenance | `provenance`, `identite_incertaine`, `herite_de` | *(absent)* |
| statut commercial | `statut` capturé | *(volontairement absent)* |

Un simple transtypage entre les deux aurait produit un objet dont **tous** les champs valent `undefined`.

### 5.2 La décision

**Deux formes, deux rôles, une conversion prouvée. Ni fusion, ni réécriture.**

- **Forme de stockage : celle de la migration 272, définitivement.** La garde `verrouiller_client_snapshot`
  interdit toute réécriture d'un snapshot renseigné, sur tout chemin d'écriture. Les snapshots déjà capturés
  et backfillés **ne peuvent plus changer de forme** : leur imposer le schéma du contrat exigerait de lever la
  garde qui fait tout l'intérêt du lot P0. Migrer la forme aurait donc coûté la garantie qu'on cherche à
  protéger.
- **Forme d'échange : `ClientDocumentRecipientSnapshot`.** C'est elle que Réserves, Drone et tout futur
  consommateur liront — elle porte la version de schéma, la validation et le rendu autonome.
- **Pont : `src/lib/client-snapshot-contrat.ts`**, pur, total, réversible.

**Aucun type n'est dupliqué** : `ClientSnapshot` reste la seule déclaration de la forme stockée,
`ClientDocumentRecipientSnapshot` la seule de la forme d'échange. Le pont ne redéclare rien.

---

## 6. Symétrie SQL / TypeScript

### 6.1 Le test qui empêche la dérive

`CORRESPONDANCE_SNAPSHOT_SQL_V1` est un registre exécutable de 26 entrées. Un test **lit le texte de la
migration 272**, en extrait la liste blanche `v_champs`, les clés de `jsonb_build_object`, plus
`identite_incertaine` (backfill) et `herite_de` (héritage d'avoir), et vérifie que le registre les couvre
**exactement, dans les deux sens**.

Ajouter une colonne à la liste blanche SQL sans l'inscrire dans le registre fait échouer la suite. C'est la
seule protection réelle contre une dérive silencieuse entre les deux dépôts de vérité.

Un second test confronte les cinq valeurs de `CLIENT_CATEGORIES` au CHECK de `clients.type` lu dans
`20260710000004_clients_chantiers.sql` : elles correspondent exactement.

### 6.2 Vérification contre une base réelle

Le jeu de clés du registre a été confronté à un snapshot **réellement produit par PostgreSQL** sur la pile
isolée (§8.4). Les 25 clés du cas nominal, plus `herite_de` dans le cas avoir, soit **26** :

```
adresse_complement, adresse_facturation, client_id, code_postal, conditions_paiement,
contact, email, forme_juridique, identite_incertaine, nom, nom_affiche, nom_commercial,
numero_tva, pays, prenom, provenance, raison_sociale, reference_interne, siret, societe,
statut, telephone, type, version, ville  (+ herite_de)
```

### 6.3 Aucune perte silencieuse

Chacune des 26 clés est **soit** portée par le contrat, **soit** un champ nommé de `IdentiteDestinataireGP`
(`provenance`, `identiteIncertaine`, `heriteDe`), **soit** conservée verbatim dans `horsContrat`
(`statut`, `conditionsPaiement`, `societe`, `nomCommercial`, `paysFige`).

Trois clés sont conservées **à la fois** brutes et projetées — `pays`, `societe`, `nom_commercial` — parce que
leur projection est destructrice : sans `paysFige`, on ne distinguerait plus « pays non renseigné » (le cas
réel, la colonne n'existant pas) de « France explicitement figée ». C'est ce qui rend l'aller-retour exact.

Quatre tests d'aller-retour le démontrent : professionnel complet, particulier minimal, document backfillé,
avoir hérité. Un cinquième couvre la distinction `nom_commercial` / `societe`.

### 6.4 Deux choix de conversion explicitement conservateurs

- **`displayName` n'est jamais recalculé.** Le contrat sait composer un nom d'affichage — mais seulement sur
  une fiche vivante. Sur un snapshot, `nom_affiche` est repris **tel qu'imprimé**. Un document émis avant
  l'arbitrage particulier/professionnel doit continuer d'afficher ce qu'il affichait.
- **Le SIREN n'est pas dérivé du SIRET figé.** Il le serait pourtant sans ambiguïté. Mais imprimer demain une
  mention absente du document d'hier serait exactement la dérive que ce lot combat. `legal.siren` vaut `null`,
  et un test le pin.

---

## 7. Écarts traités

Le détail argumenté est dans `docs/architecture/ELSATIA_CLIENT_SNAPSHOT_SYMETRIE_SQL_CONTRAT_V1.md`. Synthèse :

| Écart | Traitement | Statut |
|---|---|---|
| `archive` dans le contrat, absent du CHECK SQL | **sans effet ici** : le statut ne franchit pas le contrat de destinataire, il voyage verbatim dans `horsContrat.statut` (`string \| null`). Test avec la valeur `archive`. Arbitrage renvoyé à GP Client Core | traité |
| Symétrie `normalization.ts` ↔ normalisation SQL | **hors périmètre** : la migration 272 recopie, elle ne normalise pas. Rien n'est réglé ni aggravé. Appartient à Universal Client Search, où le test de symétrie doit précéder la fonction SQL | documenté |
| Coexistence `sourceClientId` / `client_id` | même donnée, renommée, projection unique au registre. Ce qui diffère vraiment : le locataire est une *contrainte de capture* côté SQL et une *donnée obligatoire* côté contrat — le pont l'exige donc de l'appelant, depuis la ligne du document | traité |
| Version du snapshot | découplée : `version: 1` (nombre) ↔ `schemaVersion` (texte). Le pont **refuse** toute autre version (`unsupported_schema_version`) plutôt que de deviner | traité |
| Champs absents de `public.clients` | **aucune migration créée**, conformément à la consigne. Le lot existe déjà en attente : `docs/migrations-proposees/client-legal-fields-v1.sql.proposed`, sans numéro, bloqué par la réconciliation du ledger. Trois tests démontrent que le pont portera les cinq champs **sans qu'une ligne change** | préparé, sans collision |
| Immuabilité `readonly` TS | garantie de **compilation** seulement : ne survit pas à un `JSON.parse`, n'existe pas à l'exécution | documenté |
| Immuabilité réelle en base | garantie de **table** : `verrouiller_client_snapshot` refuse tout `UPDATE`, y compris en session superutilisateur — **revérifié sur base réelle** (§8.4) | vérifié |
| Données historiques du backfill | `provenance` et `identite_incertaine` sont remontés en champs nommés : un consommateur ne peut pas prendre une identité reconstituée pour une identité observée. Réserve héritée non levée : ces identités **peuvent différer** de ce qui a été imprimé à l'époque | traité, réserve maintenue |

---

## 8. Tests — résultats exacts

### 8.1 Vitest

```
$ npx vitest run
 Test Files  114 passed (114)
      Tests  1201 passed (1201)
```

| Périmètre | Tests |
|---|---|
| Client Contracts (paquet, isolé) | **147** — inchangés |
| GP Snapshot + envoi + pont | **66** |
| dont **pont et symétrie (nouveaux)** | **42** |
| Total dépôt | **1201** = 1012 (GP) + 147 (paquet) + 42 (pont) |

Les 42 tests du pont couvrent, comme demandé : noms de champs · types · valeurs nullables · version ·
particulier · professionnel · adresse · contact · devis · facture · avoir · documents backfillés · plus le
confinement de locataire et la compatibilité ascendante.

### 8.2 pgTAP — exécution réelle

```
$ supabase test db
All tests successful.
Files=57, Tests=1245, 263 wallclock secs
Result: PASS
```

**1245/1245**, strictement le compte du lot GP. Aucune régression : `client_document_snapshot_v1.test.sql`,
`verrouiller_facture_emise.test.sql` et les 55 autres passent.

### 8.3 Fresh install isolé

```
$ supabase db reset --no-seed      # exit 0
266 migrations appliquées, ledger de tête 20260908000272
```

**Pile Docker dédiée et neuve**, créée pour ce lot : `project_id = elsatia-gp-contracts-snapshot-int-dbtest`,
ports 546xx, répertoire `/Volumes/ELSATIA-DEV/dbtest/gp-contracts-snapshot-int`.

La pile `elsatia-gp-client-snapshot-dbtest` du lot GP **n'a délibérément pas été réutilisée** : elle est
occupée par le lot parallèle Renvoi / Champs légaux (son fichier pgTAP y est déjà à 26 assertions). La base
locale `btp-platform` (jeu de test multi-app) **n'a pas été touchée** : aucun `db reset` n'a été joué dessus.

### 8.4 Upgrade depuis le canon GP — sur données réelles

Scénario joué sur la pile isolée, dans une transaction annulée : déclencheur de capture neutralisé, devis émis
inséré sans snapshot (l'état exact qu'aurait laissé une base au ledger 267), puis backfill de la migration 272
rejoué tel quel.

| Vérification | Résultat |
|---|---|
| Avant backfill | `client_snapshot = NULL` |
| Après backfill | 1 ligne pourvue, `nom_affiche = UPGRADE SARL`, `type = professionnel` |
| Marquage | `provenance = backfill_identite_actuelle`, `identite_incertaine = true` |
| Idempotence — second passage | **0 ligne touchée** |
| Immuabilité — falsification en superutilisateur | **refusée** : « L'identité du destinataire figée à l'émission de ce document ne peut plus être modifiée. » |
| Clés produites | les 25 attendues (26 avec `herite_de`) |

### 8.5 Chaîne PDF / e-mail / export sans relecture de `public.clients`

Test demandé, implémenté par **fiche client piégée** : un `Proxy` dont toute lecture de propriété lève. Passé
à la place de la jointure `clients`, il transforme « le code ne devrait pas relire la fiche » en fait vérifié
mécaniquement.

| Consommateur | Vérifié |
|---|---|
| PDF | en-tête composé entièrement depuis le snapshot, `origine = figee` |
| Bloc destinataire canonique | `renderRecipientBlock()` rend 5 lignes sans aucune fiche |
| E-mail | repart vers l'adresse **figée**, pas l'adresse courante |
| Export comptable | ligne construite depuis le contrat seul |
| **Accord des deux chemins** | `identiteClientDocument` (GP) et le contrat impriment le **même** destinataire — nom, adresse, code postal, ville, SIRET — y compris sur un particulier backfillé |

Ce dernier point est ce qui autorisera plus tard la bascule des consommateurs vers le contrat **sans changer
un seul document**.

### 8.6 Qualité

| Contrôle | Résultat |
|---|---|
| `tsc --noEmit --incremental false` | **0 erreur** |
| `eslint` | **0 erreur**, 3 avertissements préexistants (`no-img-element`), aucun sur les fichiers de ce lot |
| `npm run build` (Next + apps/tools) | **succès** |
| `npm run verify:migrations` | **266 migrations valides, noms et horodatages uniques** |
| `git diff --check` | propre |

### 8.7 NON EXÉCUTÉ

| Contrôle | Raison |
|---|---|
| `npm run test:e2e` (Playwright) | ce lot n'ajoute aucune route, aucun composant, aucun parcours ; les fonctions livrées sont pures et couvertes unitairement |
| `npm run verify:secrets` / `verify:stripe-prices` | sans objet : aucun secret, aucun prix touché |
| pgTAP sur `btp-platform` | **délibérément non joué** : la base locale porte le jeu de test multi-app et un `db reset` le détruirait |
| Recette sur environnement déployé | hors périmètre : aucun déploiement dans ce lot |

---

## 9. Migration 272 et ledger

**Migration 272 : PRÉSERVÉE À L'IDENTIQUE.**

```
$ git diff dfb6f35..4980334 -- supabase/
(vide)
```

Aucun fichier de `supabase/` n'est modifié : ni la migration 272, ni ses déclencheurs
(`capturer_client_snapshot`, `verrouiller_client_snapshot`), ni son backfill, ni l'extension de
`verrouiller_facture_emise`, ni aucune de ses 21 assertions pgTAP.

**Aucune nouvelle migration.** La nécessité imprévue prévue par le brief ne s'est pas présentée : la
conversion demandée est entièrement réalisable en TypeScript, en lecture seule sur le JSON déjà stocké.

**Ledger observé**

| Numéro | Lot | Ligne |
|---|---|---|
| 265 | essai 30 jours modules catalogue | ancêtre commun `996be15` |
| 266 | propriétaire global plateforme | ligne GP post-cutover |
| 267 | destinataire notification support | ligne GP post-cutover |
| **268–271** | **Réserves** (v1, v2 terrain, v3 collaboration, v5 offline) | `feat/reserves-v4-…`, hors de cette ligne |
| **272** | **client document snapshot** | ce lot, préservé |
| 273 | *libre* | premier numéro disponible |

Le trou 268–271 n'est pas une anomalie : il est occupé par la ligne Réserves, vérifié dans son worktree. Ce
lot n'en revendique aucun. `verify:migrations` compte **266 migrations valides** sur cette branche, noms et
horodatages uniques.

---

## 10. P0 / P1 / P2

### P0 — aucun

Aucun défaut bloquant. Le mécanisme SQL est intact, la conversion est prouvée sans perte, le confinement de
locataire est vérifié dans les deux sens.

### P1

| # | Point | Détail |
|---|---|---|
| **P1-1** | **Conflit prévisible avec le lot parallèle** | `feat/gp-client-document-snapshot-p0-v1` a avancé à `253d23e` (poussé) et porte `client_document_snapshot_v1.test.sql` de 21 à 26 assertions. La fusion des deux lignes conflictera sur ce fichier. Conflit additif, localisé, sans risque logique — mais il doit être résolu **à la main**, jamais par `-X ours/theirs` : les deux jeux d'assertions sont légitimes. |
| **P1-2** | **Les consommateurs de production n'utilisent pas encore le contrat** | `chargerDonnees*Imprimable` passe toujours par `identiteClientDocument`. Le pont existe et l'accord des deux chemins est prouvé, mais la bascule n'est pas faite — délibérément : la faire ici aurait touché la chaîne de rendu d'un lot P0 tout juste validé. |
| **P1-3** | **La jointure `clients` subsiste dans les requêtes de chargement** | `chargerDonneesDevisImprimable` sélectionne toujours `client:clients!…(…)`, nécessaire au repli brouillon. Sur un document émis la valeur est ignorée, mais elle est **lue**. Le rendu est correct ; c'est la requête qui est plus large que nécessaire. Suppression possible en scindant la requête par statut. |
| **P1-4** | **Réserve du backfill, non levée** | Les identités des documents antérieurs viennent de la fiche **actuelle** et peuvent différer de ce qui fut imprimé. `identite_incertaine = true` le signale, le pont le remonte, mais aucune reconstitution fidèle n'est possible : `public.clients` n'est pas historisé. Réserve héritée du lot GP, à assumer par écrit avant commercialisation. |

### P2

| # | Point | Détail |
|---|---|---|
| **P2-1** | `archive` hors du CHECK `clients.statut` | sans effet tant que le statut ne franchit pas le contrat. À trancher dans GP Client Core : élargir le CHECK, ou retirer la valeur du contrat. |
| **P2-2** | Cinq clés figées à `null` faute de colonnes | `nom_commercial`, `forme_juridique`, `numero_tva`, `adresse_complement`, `pays`. Le pont est déjà prêt (3 tests). Dépend du lot légal en attente, lui-même dépendant de la réconciliation du ledger. |
| **P2-3** | `versSnapshotSqlV1` non destinée à la production | fonction inverse, écrite pour rendre la symétrie démontrable. La capture doit rester le fait du déclencheur base, seul point que rien ne contourne. Documenté dans le code ; à surveiller en revue. |
| **P2-4** | `sourceClientUpdatedAt` toujours `null` | `clients.updated_at` n'est pas dans la liste blanche de 272 : l'âge de la fiche au moment de la capture n'a pas été observé. À ajouter à la liste blanche si le besoin d'audit apparaît. |

---

## 11. Prochain lot recommandé

### **GP Client Core — bascule des consommateurs sur le contrat**

Dans cet ordre :

1. **Réconciliation du ledger** (`ELSATIA-ECOSYSTEM-MIGRATION-LEDGER-RECONCILIATION-P0-V1`) — préalable
   bloquant : c'est elle qui attribuera son numéro au lot des champs légaux.
2. **GP Client Legal Fields** — appliquer `client-legal-fields-v1.sql.proposed` avec le numéro attribué. Les
   cinq clés cessent d'être nulles ; **aucune ligne du pont ne change**, trois tests l'attestent déjà.
3. **Bascule des consommateurs** — `chargerDonnees*Imprimable` produit un `ClientDocumentRecipientSnapshot`
   plutôt qu'un `ClientEntete`, et la jointure `clients` n'est conservée que sur le chemin brouillon (ferme
   P1-2 et P1-3). L'accord des deux chemins étant déjà prouvé, la bascule ne doit changer aucun document.
4. **Arbitrage `archive`** (P2-1) et `societe` / `raison_sociale`.

Puis, et seulement ensuite : Universal Client Search — en écrivant **le test de symétrie
`normalization.ts` ↔ `normaliser()` avant la fonction SQL**, faute de quoi une divergence rendra l'index GIN
inutile en silence.

Ne pas engager Réserves Client Adapter ni Drone Bridge avant que la bascule (3) soit faite : ils
consommeraient un contrat que Gestion Pro ne produit pas encore lui-même.

---

## 12. Conformité au brief

| Exigence | État |
|---|---|
| Vérifier présence et push des deux SHA, ancêtres, différences | ✓ §3 |
| Compatibilité tsconfig | ✓ §4 — et défaut Vitest corrigé |
| Comparer les types de snapshot des deux lots | ✓ §5.1 — **incompatibles**, aucun nom de propriété commun |
| Schéma JSON produit par SQL, validateur TS, obligatoires/nullables, versionnement, noms de propriétés | ✓ §5, §6 |
| Compatibilité devis / factures / avoirs | ✓ §8.1, §8.4 — aller-retour dédié pour l'avoir hérité |
| Branche d'intégration issue du lot GP validé | ✓ `dfb6f35` |
| Cherry-pick ou méthode Git sûre | ✓ deux cherry-picks, zéro conflit, aucune résolution forcée |
| Ne rien perdre : migration 272, trigger, tests GP, 147 tests contrats, alias TS, immuabilité | ✓ §8, §9 |
| Contrat unique pour `ClientDocumentRecipientSnapshot` | ✓ §5.2 — forme d'échange unique, forme de stockage inchangée |
| Symétrie SQL / TypeScript | ✓ §6 — registre confronté au **texte de la migration** et à une **base réelle** |
| Tests de symétrie (12 axes demandés) | ✓ §8.1 |
| Aucune conversion silencieuse ne perd un champ | ✓ §6.3 — 26 clés, 26 destinations, 5 allers-retours |
| Écarts à traiter ou documenter (8 points) | ✓ §7 |
| Ne pas créer les colonnes manquantes ; préparer sans collision | ✓ §7, §9 — aucune migration, lot en attente identifié |
| Relancer les 11 contrôles | ✓ §8.1–8.6 ; non exécutés déclarés en §8.7 |
| Test PDF / e-mail / export sans relire `public.clients` | ✓ §8.5 |
| Aucune fusion, aucun déploiement | ✓ §3 |
