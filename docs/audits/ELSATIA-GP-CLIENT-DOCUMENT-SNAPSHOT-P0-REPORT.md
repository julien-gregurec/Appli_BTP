# ELSATIA-GP-CLIENT-DOCUMENT-SNAPSHOT-P0-REPORT

> Verdict, résultats de tests et SHA final : voir §12 et §13. Ce rapport est
> auto-porteur : il ne suppose la lecture d'aucun autre rapport.

---

## 1. Verdict

**VALIDÉ** — la faille est réelle, confirmée par lecture du code et du schéma,
corrigée de bout en bout (base + application), et prouvée par exécution.

Détail des preuves en §10 ; réserves et arbitrages restants en §11.

---

## 2. Cause racine

`public.devis` et `public.factures` ne portaient **aucune** identité du
destinataire : seulement une clé étrangère `client_id` vers `public.clients`.

Tout le rendu d'un document commercial relisait donc la fiche client **en
direct**, par jointure PostgREST :

- `src/lib/documents-commerciaux.ts:48` (devis) et `:120` (factures) —
  `client:clients!..._client_id_fkey(nom,prenom,societe,email,adresse_facturation,code_postal,ville,siret)` ;
- ce chargeur unique alimente **toutes** les sorties : page `/imprimer/devis/[id]`
  et `/imprimer/factures/[id]`, génération PDF serveur, page publique client
  `/document/[token]`, page d'impression partagée `/imprimer/partage/[token]`,
  et l'e-mail d'envoi/de renvoi (`src/lib/documents-envoi.ts`) — corps, adresse
  destinataire et PDF joint ;
- les exports comptables (`src/app/api/exports/comptabilite/route.ts`, journaux
  ventes et règlements) relisaient eux aussi la fiche client ;
- les relances (`src/lib/relances-moteur.ts`) affichaient le nom courant.

**Conséquence :** renommer un client, corriger son SIRET ou changer son adresse
de facturation réécrivait rétroactivement l'identité imprimée sur **tous** ses
documents déjà émis, factures comptabilisées comprises. Un duplicata émis six
mois après une facture n'était pas une copie de cette facture.

### Ce qui existait déjà — et qui rend la faille d'autant plus nette

L'identité de l'**émetteur** était, elle, correctement figée depuis
`20260812000200_documents_commerciaux_p9.sql` : `factures.entreprise_snapshot`,
capturé à la sortie du brouillon et rendu immuable par le déclencheur
`verrouiller_facture_emise` (`20260822000222`).

Le produit gelait donc « qui a émis », jamais « à qui ». Le présent lot applique
au destinataire exactement le principe déjà retenu pour l'émetteur, et l'étend
aux devis — qui n'avaient aucun snapshot du tout.

---

## 3. Architecture avant / après

### Avant

```
public.clients  ──(client_id, lecture directe à CHAQUE affichage)──►  devis
       │                                                              factures
       │                                                              avoirs
       └──► PDF / e-mail / portail client / exports  (identité D'AUJOURD'HUI)

factures.entreprise_snapshot  ──►  identité de l'ÉMETTEUR figée  ✔
(rien d'équivalent pour le DESTINATAIRE)                          ✘
```

### Après

```
                       ┌──────────── émission (statut ≠ brouillon) ───────────┐
public.clients ────────┤  déclencheur base capturer_client_snapshot()          │
   (fiche vivante)     └──► devis.client_snapshot / factures.client_snapshot ──┘
       │                                    │  + client_snapshot_at
       │                                    │  immuable (verrouiller_client_snapshot)
       │                                    │
       │                                    └──► PDF / e-mail / duplicata /
       │                                         portail client / exports
       │                                         (identité DE L'ÉMISSION)
       │
       └──► brouillons uniquement (lecture directe, annoncée à l'utilisateur)

client_id conservé séparément : lien CRM, navigation, relance — jamais l'identité imprimée.
```

**Point de conception clé.** La capture est faite **en base**, par déclencheur,
et non côté application comme `entreprise_snapshot`. La capture applicative
(`changerStatutFactureAction`) reste contournable par tout chemin d'écriture qui
ne passe pas par cette action serveur : RPC `creer_facture_avancee`, écriture
PostgREST directe, script d'import. Une identité destinataire manquante sur une
facture émise n'est pas rattrapable a posteriori — la capture devait donc se
situer au seul point que rien ne contourne.

---

## 4. Canon GP identifié — et preuve

Le canon historique fourni par la mission a été **vérifié, pas supposé**.

| Élément | Valeur |
|---|---|
| Dépôt | `git@github.com:julien-gregurec/Appli_BTP.git` (mono-dépôt ; GP est la racine `src/`, les autres applications sont sous `apps/`) |
| Chemin de travail principal | `/Users/juliengregurec/Projects/elsatia-main` |
| Branche canon GP | `integration/gp-postcutover-precommercial-ops-v1` |
| SHA canon | `4266ba6ce347ed3a4f379430442b341b67df516e` |
| Date du canon | 2026-09-06 22:04:42 +0200 |
| Poussé | oui (`origin/integration/gp-postcutover-precommercial-ops-v1` = même SHA) |
| Ledger réel du canon | **267** (dernier numéro de séquence `20260906000267`), et non 265 |

### Méthode de recherche d'un canon plus récent

1. `git for-each-ref --sort=-committerdate refs/heads` filtré sur `gp|gestion` :
   `integration/gp-postcutover-precommercial-ops-v1` est la branche GP la plus
   récente. Toutes les branches GP suivantes lui sont antérieures.
2. Test d'ascendance de chaque branche GP sur `4266ba6` :
   `feat/gp-global-owner-all-apps-access-v1`,
   `integration/gp-postcutover-migration-train-v1`,
   `integration/gp-postcutover-pilot-hotfix-v1`,
   `fix/gp-trial-expiry-p1-closure-v1`,
   `feat/gp-platform-second-admin-operability-p1-v1` — **toutes contenues**.
3. Branches GP non contenues, examinées une par une :
   - `feat/gp-precommercial-ops-p1-closure-v1` (`3285e23`) et
     `feat/gp-support-reply-email-p1-closure-v1` (`4010179`) : le diff
     `4266ba6 → branche` **retire** ~4 550 lignes (migrations 266/267, verrous
     AAL2, pgTAP associés). Ce sont les **sources** réconciliées dans le canon,
     pas des états plus avancés.
   - `docs/gp-cutover-documentation-closure-on-hotfix-v1` : 2 commits, docs
     d'exploitation uniquement, aucun code ni migration.
   - `feat/gp-safe-demo-capture-build-v1` : 66 commits d'avance, mais son
     historique est celui de la ligne **Tools** (atelier, vectorisation, SEO) ;
     ce n'est pas un canon GP.
4. `git stash list` : 3 stashes, tous antérieurs et étrangers au périmètre
   (Tools PWA, workflow production, routage admin plateforme). **Aucun touché.**
5. `git worktree list` : 47 worktrees. **Aucun supprimé, aucun nettoyé,
   aucun WIP modifié.** Le worktree de ce lot est nouveau et distinct.

**Conclusion : `4266ba6` est bien le canon GP le plus récent.** Aucun canon plus
récent n'existe.

### Ce qui n'a pas été touché

- La Production Branch Vercel n'a pas été consultée ni modifiée.
- Aucun déploiement, aucune fusion, aucun push sur une branche existante.
- La base locale `btp-platform` (jeu de test multi-app, ledger 265) n'a **pas**
  été réinitialisée : les tests base tournent sur une pile Docker isolée dédiée
  (§10.2).

---

## 5. Branches et SHA

| | |
|---|---|
| Branche de départ | `integration/gp-postcutover-precommercial-ops-v1` |
| SHA de départ (complet) | `4266ba6ce347ed3a4f379430442b341b67df516e` |
| Branche finale | `feat/gp-client-document-snapshot-p0-v1` |
| Worktree | `/Volumes/ELSATIA-DEV/worktrees/gp-client-document-snapshot-p0-v1` (conservé) |
| SHA du lot (complet) | `8743af230f39a218a0241a3f75181db4e7958d38` |
| Tête de branche | commit de clôture documentaire, voir §13 |

---

## 6. Migration

| | |
|---|---|
| Fichier | `supabase/migrations/20260908000272_client_document_snapshot_v1.sql` |
| Numéro de séquence | **272** |
| Ledger avant | 265 fichiers, dernier numéro `20260906000267` |
| Ledger après | 266 fichiers, dernier numéro `20260908000272` |
| `npm run verify:migrations` | `266 migrations valides, noms et horodatages uniques.` |

### Justification du numéro 272

Numéros déjà revendiqués au-delà du canon GP, relevés en balayant **toutes** les
branches locales (`git ls-tree` sur `supabase/migrations`) :

| Numéro | Lot | Branche |
|---|---|---|
| `20260906000266` | Propriétaire global | canon GP (appliqué) |
| `20260906000267` | Support reply e-mail | canon GP (appliqué) |
| `20260906000268` | Réserves V1 | `feat/reserves-v1-foundation-workflow` |
| `20260907000269` | Réserves V2 | `feat/reserves-v2-terrain-capture` |
| `20260907000270` | Réserves V3 | `feat/reserves-v3-collaboration-livrables` |
| `20260908000271` | Colors historique d'activité | `feat/colors-product-activity-history-v1` |

**272** est le premier libre. Le préfixe `20260908` place la migration après
`20260908000271` en ordre lexicographique : aucune insertion rétrograde, le cas
précisément diagnostiqué par
`ELSATIA_GP_POSTCUTOVER_MIGRATION_TRAIN_RECONCILIATION_V1`.

**Aucune migration canonique n'a été modifiée.** La seule fonction existante
redéfinie est `verrouiller_facture_emise()`, remplacée par `create or replace`
dans la nouvelle migration — le fichier `20260822000222` est intact.

---

## 7. Comportement canonique implémenté

### 7.1 Tant que le document est un brouillon

- Aucun snapshot n'est posé. Le rendu lit la fiche client, donc le brouillon
  reflète toujours les données à jour — l'« actualisation depuis le client » est
  permanente et implicite, sans bouton ni action à déclencher.
- L'utilisateur en est informé : les fiches devis et facture affichent
  *« Brouillon : l'identité affichée est lue en direct sur la fiche client et
  sera figée à l'émission. »*
- Aucune actualisation silencieuse n'est possible après émission : le
  déclencheur ne réécrit jamais un snapshot posé.

### 7.2 À l'émission

Déclencheurs `capturer_client_snapshot_devis` / `capturer_client_snapshot_factures`
(BEFORE INSERT OR UPDATE), déclenchés dès que `statut <> 'brouillon'` et que
`client_snapshot IS NULL` :

- snapshot complet du destinataire (identité, adresse de facturation, SIRET,
  coordonnées, conditions de paiement, contact principal avec son e-mail) ;
- `nom_affiche` **calculé et figé** — la chaîne exacte imprimée, jamais
  recomposée à la lecture ;
- `client_id` conservé séparément dans sa colonne d'origine ;
- horodatage `client_snapshot_at` ;
- `provenance` explicite dans le snapshot.

### 7.3 Après émission

Le snapshot est la source **unique** pour : consultation (fiches devis/facture),
PDF, page publique client `/document/[token]`, page d'impression partagée,
duplicata imprimé, renvoi e-mail, export comptable (journal des ventes, journal
des règlements), nom rappelé par une relance.

Modifier `public.clients` ne modifie **aucun** document déjà émis.

### 7.4 Facture issue d'un devis

Une facture est un document légal distinct, avec sa propre date d'émission :
elle capture l'identité **à sa propre émission** (`provenance: "emission"`), et
non celle du devis. La traçabilité vers le devis reste assurée par
`factures.devis_origine_id`, dont le propre snapshot demeure lisible et figé —
l'écart éventuel entre les deux identités est donc constatable, jamais masqué.

### 7.5 Avoir — règle explicite

Un avoir **hérite** du snapshot de la facture qu'il crédite dès que
`facture_origine_id` est renseigné : un avoir annule une écriture déjà émise, il
n'ouvre pas une identité nouvelle. L'héritage est tracé dans le snapshot
(`provenance: "herite_facture_origine"`, `herite_de: {facture_id, numero}`) et
affiché à l'utilisateur (*« reprise de la facture FAC-… »*).

Un avoir sans facture d'origine capture normalement à sa propre émission.

Dans les deux cas : **aucune dépendance dynamique à la fiche client actuelle.**

### 7.6 Duplication — deux notions distinctes, deux règles

| Geste | Règle |
|---|---|
| **Duplicata** d'un document émis (réimpression, PDF regénéré, renvoi, lien client) | Identité **figée** du document d'origine. |
| **Bouton « Dupliquer »** (RPC `dupliquer_devis`) | Crée un **nouveau brouillon**. Il ne copie pas le snapshot ; le nouveau devis capturera l'identité **à sa propre émission**. Comportement correct et vérifié : la RPC énumère ses colonnes et n'inclut pas `client_snapshot`. |

### 7.7 Relance — règle documentée et volontairement asymétrique

- **Identité rappelée** (nom du destinataire dans le message) : snapshot du
  document relancé.
- **Adresse de destination et exclusions** (`relance_auto_exclue`) : fiche client
  **courante**. Une relance n'est pas une copie du document ; c'est une action de
  recouvrement émise aujourd'hui, qui doit atteindre le client d'aujourd'hui et
  respecter ses préférences actuelles.

Cette asymétrie est un choix, pas un oubli : elle est commentée dans
`src/lib/relances-moteur.ts` et soumise à arbitrage en §11.

---

## 8. Règles d'immuabilité

| Règle | Mécanisme |
|---|---|
| Un snapshot posé ne peut plus être modifié | `verrouiller_client_snapshot()` — déclencheurs `verrou_client_snapshot_devis` et `verrou_client_snapshot_factures`, BEFORE UPDATE sur les deux tables |
| Un snapshot posé ne peut pas être effacé (`= null`) | même déclencheur (`is distinct from` couvre le passage à NULL) |
| L'horodatage suit le snapshot | `client_snapshot_at` couvert par le même test |
| Aucun contournement par l'API | Le verrou est au niveau **table** : RPC `security definer`, PostgREST direct, `service_role` et script d'import y sont tous soumis |
| Le snapshot d'une facture émise est aussi couvert par le verrou général | `verrouiller_facture_emise()` étendu : `client_snapshot` et `client_snapshot_at` rejoignent `entreprise_snapshot` dans l'exemption « tant que l'ancienne valeur est nulle » — la capture initiale et le rattrapage passent, toute réécriture ultérieure est refusée |
| Un devis « envoyé » est désormais protégé | `verrouiller_devis_accepte` ne verrouillait qu'au statut `accepte` : la nouvelle garde couvre **tous** les statuts dès que le snapshot est posé |
| Le brouillon reste libre | Aucun snapshot ⇒ aucune garde ; un brouillon reste pleinement modifiable |

**Ordre des déclencheurs** (BEFORE ROW, ordre alphabétique PostgreSQL) :
`capturer_client_snapshot_*` → `set_*_numero` → `verrou_client_snapshot_*` →
`verrou_facture_emise` / `verrou_devis_accepte`. La capture précède donc toujours
la garde : elle n'est jamais bloquée par elle. Le nommage n'est pas fortuit.

**Étanchéité multi-tenant.** `construire_client_snapshot(client_id, entreprise_id)`
est `security definer` (elle doit pouvoir écrire même quand la RLS masquerait la
ligne) mais ne lit le client **que** s'il appartient à l'entreprise du document.
Un `client_id` d'un autre tenant rend `NULL` — jamais l'identité de ce tenant.
`anon` n'a aucun droit d'exécution ; seul `authenticated` l'a. Aucune nouvelle
table n'est créée : les colonnes héritent des policies RLS existantes de `devis`
et `factures`.

---

## 9. Stratégie de backfill des données historiques

### Cas distingués

| Cas | Traitement |
|---|---|
| Document **brouillon** | Aucun snapshot. Rien à figer : il n'a pas été émis. Il capturera à sa propre émission. |
| Document **émis, client toujours présent** | Snapshot reconstitué depuis l'identité **actuelle**, marqué `provenance: "backfill_identite_actuelle"` **et** `identite_incertaine: true`. |
| Document **émis, client disparu** | Aucun snapshot. `construire_client_snapshot` rend `NULL`, la ligne reste sans snapshot et le rendu retombe sur la lecture directe — exactement le comportement d'avant le lot, sans régression ni invention. Cas aujourd'hui impossible (`clients.id` est référencé `on delete restrict`), traité par prudence. |

### Aucune identité inventée

Le dépôt ne conserve **nulle part** l'identité passée d'un client :
`public.clients` n'est pas historisée et `journal_activite` ne journalise pas les
modifications de fiche client. Il n'existe donc aucun matériau permettant de
reconstituer une identité réellement observée à l'émission.

Le backfill ne prétend donc rien : il pose l'identité actuelle **explicitement
étiquetée comme incertaine**. L'application le répercute à l'écran :
*« Identité reconstituée depuis la fiche client lors de la reprise des documents
antérieurs : elle peut différer de celle réellement imprimée à l'époque. »*
`identiteClientDocument()` distingue trois origines — `figee`,
`figee_reconstituee`, `fiche_client` — pour qu'aucun lecteur, humain ou code, ne
confonde les deux premières.

### Propriétés

| Propriété | Comment elle est obtenue | Preuve |
|---|---|---|
| Idempotent | `where client_snapshot is null` | pgTAP : 1 ligne au 1ᵉʳ passage, **0** au 2ᵉ |
| Auditable | `provenance` + `identite_incertaine` + `client_snapshot_at` dans chaque snapshot | inspection SQL directe |
| Compatible fresh install | Aucun document en base ⇒ 0 ligne touchée | `db reset` sur pile vierge (§10.2) |
| Compatible restore/upgrade | Rejoué sur une base déjà migrée ⇒ 0 ligne touchée | même mécanisme d'idempotence |
| Sans fuite inter-tenant | `construire_client_snapshot` contraint l'appartenance à l'entreprise | pgTAP dédié |
| Testé | scénario complet en pgTAP | §10.2 |

### Ordonnancement dans la migration

1. colonnes → 2. `construire_client_snapshot` → 3. déclencheurs de capture →
4. **extension de `verrouiller_facture_emise`** → 5. **backfill** →
6. gardes d'immuabilité.

L'ordre 4 → 5 → 6 est nécessaire : le backfill écrit sur des factures déjà
émises (il faut d'abord exempter la capture initiale) et doit s'exécuter avant la
pose des gardes, qui refuseraient sa propre écriture.

---

## 10. Résultats de tests

### 10.1 Couverture demandée, point par point

| # | Exigence de la mission | Où c'est prouvé | Résultat |
|---|---|---|---|
| 1 | Création d'un devis avec identité A | pgTAP `client_document_snapshot_v1` #1-2 | ✅ |
| 2 | Émission du devis | pgTAP #3-5 (nom, SIRET, e-mail du contact figés) | ✅ |
| 3 | Modification du client vers identité B | pgTAP, bloc « identité A → B » | ✅ |
| 4 | Le devis émis affiche toujours A | pgTAP #6-7 | ✅ |
| 5 | Un nouveau devis affiche B | pgTAP #8 | ✅ |
| 6 | La facture émise conserve son snapshot | pgTAP #9 | ✅ |
| 7 | L'avoir conserve son snapshot | pgTAP #10-11 (hérité de la facture créditée, traçé) | ✅ |
| 8 | Le PDF historique conserve A | Vitest `client-snapshot` + chemin unique `chargerDonnees*Imprimable` → PDF | ✅ |
| 9 | Le renvoi e-mail historique conserve A | Vitest « adresse un renvoi ou un duplicata à l'e-mail figé » | ✅ |
| 10 | Duplicata / export conservent A selon règle documentée | §7.6 + Vitest `nomClientDocument` (exports) | ✅ |
| 11 | Aucune lecture inter-tenant | pgTAP #16-17 | ✅ |
| 12 | Aucun utilisateur non autorisé ne modifie le snapshot | pgTAP #12-14 (verrou table) + #18 (`anon` sans droit) | ✅ |
| 13 | L'API directe ne contourne pas l'immuabilité | pgTAP #12-14 : l'`UPDATE` SQL brut, sous session superutilisateur, est refusé | ✅ |
| 14 | Backfill rejoué deux fois sans duplication | pgTAP #19-20 : 1 ligne puis **0** | ✅ |
| 15 | Fresh install | `supabase db reset` sur pile vierge : 266 migrations appliquées, 0 erreur | ✅ |
| 16 | Upgrade depuis le ledger canonique | Le train complet part du même ledger canonique et applique 272 en dernier ; le backfill est écrit pour être neutre sur base déjà migrée | ✅ (voir réserve §11.4) |
| 17 | RLS et permissions | pgTAP #16-18 + aucune nouvelle table (policies existantes héritées) | ✅ |
| 18 | TypeScript, lint, build | §10.3 | ✅ |

Le point le plus fort du dispositif est le #13 : le verrou est posé sur la
**table**, donc l'`UPDATE` de test — exécuté par pgTAP en session
superutilisateur, la position la plus privilégiée possible — est refusé. Aucun
chemin applicatif ne peut faire mieux.

### 10.2 pgTAP — exécution réelle

**Environnement.** Pile Docker **isolée et dédiée** :
`project_id = elsatia-gp-client-snapshot-dbtest`, ports 545xx, répertoire
`/Volumes/ELSATIA-DEV/dbtest/gp-client-snapshot`. La base locale `btp-platform`
(jeu de test multi-app) **n'a pas été touchée** : aucun `db reset` n'a été joué
dessus.

```
$ supabase db reset --no-seed        # fresh install, 266 migrations
Finished supabase db reset on branch main.

$ supabase test db
Files=57, Tests=1245, 7 wallclock secs
Result: PASS
```

**Les 21 assertions du fichier `supabase/tests/client_document_snapshot_v1.test.sql` :**

```
ok  1 - un devis brouillon ne fige aucune identité destinataire
ok  2 - un devis brouillon n'est pas horodaté
ok  3 - l'émission fige le nom du destinataire
ok  4 - l'émission fige le SIRET du destinataire
ok  5 - l'émission fige l'e-mail du contact destinataire
ok  6 - le devis déjà émis conserve l'identité A après modification de la fiche client
ok  7 - le devis déjà émis conserve l'adresse de facturation d'origine
ok  8 - un devis émis après le changement porte l'identité B
ok  9 - une facture fige l'identité du destinataire à sa propre émission
ok 10 - un avoir reprend l'identité figée de la facture qu'il crédite
ok 11 - l'héritage d'identité d'un avoir est explicitement tracé
ok 12 - l'identité figée d'un devis émis ne peut pas être réécrite par UPDATE direct
ok 13 - l'identité figée d'une facture émise ne peut pas être réécrite par UPDATE direct
ok 14 - l'identité figée d'un devis émis ne peut pas être effacée
ok 15 - un devis brouillon reste librement modifiable malgré la garde d'immuabilité
ok 16 - aucune identité d'un autre tenant ne peut être capturée sur un document
ok 17 - la capture fonctionne pour un client du même tenant
ok 18 - anon ne peut pas exécuter construire_client_snapshot
ok 19 - le backfill rattrape le document historique au premier passage
ok 20 - le backfill rejoué une seconde fois ne retouche aucune ligne
ok 21 - une identité reconstituée est marquée comme telle, jamais présentée comme observée à l'émission
```

**Aucune régression** sur les 56 autres fichiers pgTAP, dont
`verrouiller_facture_emise.test.sql` — le fichier qui couvre précisément la
fonction que ce lot redéfinit — et `relances_auto_v1_reclamation.test.sql`.

> Note d'honnêteté : au premier passage, ce fichier a rapporté `Bad plan. You
> planned 20 tests but ran 21` — un `plan(20)` sous-évalué, les 21 assertions
> étant toutes `ok`. Le plan a été corrigé à 21 et la suite rejouée
> intégralement : `Result: PASS`. Aucune assertion n'a été retirée, désactivée
> ni assouplie.

### 10.3 TypeScript, lint, tests unitaires, build

| Commande | Résultat |
|---|---|
| `npm run typecheck` (racine GP **+** `apps/tools`) | **0 erreur** |
| `npm run lint` (racine GP **+** `apps/tools`) | code de sortie **0** — **0 erreur**, 3 avertissements, tous préexistants et hors de ce lot (`@next/next/no-img-element` dans `boutique/[produitId]`, `boutique` et `SignatureEmploye`) ; `npx eslint` sur les 7 fichiers touchés par ce lot : **0 problème** |
| `npx vitest run` (racine GP) | **102 fichiers, 1012 tests, tous passants** |
| dont `src/lib/client-snapshot.test.ts` | **13 tests, tous passants** (nouveau fichier) |
| `npm run verify:migrations` | `266 migrations valides, noms et horodatages uniques.` |
| `npx next build` | **succès** (code de sortie 0, manifeste de routes complet émis) — bâti contre la pile Docker isolée via un `.env.local` local et gitignoré, jamais contre Production ni Preview |

#### Instabilité constatée — et attribuée par mesure, pas par supposition

Sous charge (Docker + une seconde suite Vitest en parallèle sur le même volume
externe), deux tests sortent par `Test timed out in 5000ms` :
`src/lib/xlsx.test.ts` et `src/lib/stripe-discount-legacy-surface.test.ts`.

Plutôt que de les déclarer « sans rapport », la cause a été **mesurée** : la
suite complète a été rejouée sur le **canon `4266ba6` non modifié**, dans le même
worktree de référence, sous exactement la même charge concurrente.

| Exécution | Résultat |
|---|---|
| Ce lot, machine au repos | 102 fichiers / **1012 tests, tous passants** |
| Ce lot, sous charge | 1 à 2 échecs, tous `Test timed out in 5000ms` |
| **Canon `4266ba6` (aucune modification), sous charge** | **même échec** : `stripe-discount-legacy-surface`, `Test timed out in 5000ms` (101 fichiers / 999 tests) |
| Les 2 tests isolés, sur ce lot | 3/3 passants en 2,0 s |
| Les 2 tests isolés, sur le canon | 3/3 passants en 0,2 s |

**L'instabilité est donc préexistante au lot et d'origine environnementale**
(délai d'E/S sur `/Volumes/ELSATIA-DEV` et plafond Vitest de 5 s par test), et
non introduite par cette correction. L'écart de volumétrie entre les deux
colonnes (102/1012 contre 101/999) correspond exactement au fichier ajouté par
ce lot, `src/lib/client-snapshot.test.ts` et ses 13 tests.

Aucun test n'a été modifié, allongé en délai, désactivé ni assoupli pour obtenir
un résultat vert. Une piste corrective pour un lot séparé, si la gêne persiste :
relever `testTimeout` dans `vitest.config.ts`, ou déplacer les worktrees hors du
volume externe.

### 10.4bis Fichiers modifiés

**Ajoutés (4)**

| Fichier | Rôle |
|---|---|
| `supabase/migrations/20260908000272_client_document_snapshot_v1.sql` | Colonnes, construction du snapshot, capture, immuabilité, backfill |
| `supabase/tests/client_document_snapshot_v1.test.sql` | 21 assertions pgTAP |
| `src/lib/client-snapshot.ts` | Règle de lecture unique : snapshot d'abord, fiche client en repli |
| `src/lib/client-snapshot.test.ts` | 13 tests unitaires de cette règle |

**Modifiés (5)**

| Fichier | Modification |
|---|---|
| `src/lib/documents-commerciaux.ts` | Chargeur unique (impression, PDF, portail client, e-mail) : lit `client_snapshot`, expose `clientOrigine` et `clientSnapshotAt` |
| `src/app/(app)/devis/[id]/page.tsx` | Affiche l'identité figée + la mention d'origine ; l'aperçu e-mail vise l'adresse figée |
| `src/app/(app)/factures/[id]/page.tsx` | Idem pour factures et avoirs |
| `src/app/api/exports/comptabilite/route.ts` | Journaux ventes et règlements : nom et référence client issus du snapshot |
| `src/lib/relances-moteur.ts` | Nom rappelé issu du snapshot ; adresse et exclusions restent courantes (§7.7) |

**Le rapport lui-même** : `docs/audits/ELSATIA-GP-CLIENT-DOCUMENT-SNAPSHOT-P0-REPORT.md`.

Aucune migration existante n'a été éditée. Aucun test existant n'a été modifié,
désactivé ni assoupli.

### 10.4 Ce qui n'a PAS été exécuté

- **Playwright (`npm run test:e2e`)** : **NON EXÉCUTÉ**. La suite E2E exige un
  serveur Next et un jeu de comptes applicatifs ; hors périmètre de ce lot, qui
  se prouve au niveau base et unitaire.
- **`npm run verify:secrets` / `verify:stripe-prices`** : **NON EXÉCUTÉS**. Ils
  contrôlent des secrets d'environnement et le catalogue Stripe, sans rapport
  avec ce lot et sans environnement configuré ici.
- **Vérification sur données de Production** : **NON EXÉCUTÉE**, volontairement.
  Aucune connexion à la base de Production n'a été ouverte. Le volume réel de
  documents à backfiller en Production n'est donc **pas connu** — voir §11.4.
- **Recette visuelle du PDF rendu** : **NON EXÉCUTÉE**. Le chemin de données est
  prouvé, le rendu visuel relève de la recette humaine (§13).

---

## 11. Risques restants et arbitrages

### 11.1 — P1 — L'e-mail figé peut être obsolète lors d'un renvoi

**Décision appliquée :** conforme à la mission — l'e-mail destinataire fait
partie de l'identité figée, donc un renvoi ou un duplicata d'un document émis
repart vers l'adresse à laquelle il avait été adressé.

**Le risque qui en découle, à arbitrer explicitement par Julien :** si le contact
du client a changé depuis l'émission, ce renvoi part vers une adresse périmée —
il n'atteint pas le client, et peut atteindre un ancien salarié du client. C'est
la contrepartie directe de l'exactitude juridique.

**Options :** (a) conserver la règle actuelle ; (b) afficher l'adresse figée avec
possibilité de la remplacer explicitement au moment du renvoi, l'écart étant
journalisé. **Recommandation : (b)**, en lot P1 séparé — elle conserve
l'exactitude du document tout en rendant l'envoi effectif.

### 11.2 — P2 — Asymétrie assumée sur les relances

Une relance rappelle le **nom figé** mais part vers l'**adresse courante** et
respecte les exclusions **courantes** (§7.7). C'est un choix cohérent avec la
nature de l'acte (recouvrement émis aujourd'hui), mais il diffère de la règle du
renvoi (§11.1). À trancher en même temps que 11.1, pour une règle unique.

### 11.3 — P1 — Champs d'identité demandés mais absents du modèle de données

La mission cite `nom_commercial`, `forme_juridique`, `numero_tva`,
`adresse_complement` et `pays`. Ces colonnes **n'existent pas** dans
`public.clients` (schéma vérifié : `20260710000004_clients_chantiers.sql`). Elles
ne peuvent donc être ni capturées ni imprimées aujourd'hui.

Ce n'est pas contourné en silence : `construire_client_snapshot` les liste déjà
dans sa liste blanche et les rend à `null`. Le jour où elles sont ajoutées à
`public.clients`, elles sont capturées **sans aucune modification de code**. Le
numéro de TVA intracommunautaire étant une mention obligatoire sur facture en
B2B, l'ajout de ces colonnes mérite un lot P1 dédié.

### 11.4 — P1 — Volume et nature du backfill en Production inconnus

Le backfill n'a été exécuté que sur base de test. Avant application en
Production, il faut **compter** les documents concernés :

```sql
select 'devis' as table, count(*) from public.devis
  where statut <> 'brouillon' and client_snapshot is null
union all
select 'factures', count(*) from public.factures
  where statut <> 'brouillon' and client_snapshot is null;
```

Tous ces documents recevront une identité marquée
`identite_incertaine: true`. **C'est honnête, mais ce n'est pas la vérité
historique** : si un client a été renommé depuis, le document historique portera
désormais le nom actuel, étiqueté comme incertain. L'alternative — ne rien poser
— laisserait ces documents en lecture dynamique, c'est-à-dire dans l'état
défaillant d'aujourd'hui. Le marquage est le meilleur compromis disponible en
l'absence d'historisation de `public.clients`.

### 11.5 — P2 — `devis` n'a toujours pas de snapshot de l'ÉMETTEUR

`entreprise_snapshot` n'existe que sur `factures`. Un devis émis affiche donc
encore l'identité **actuelle** de l'entreprise émettrice. Hors périmètre de cette
mission (destinataire), mais c'est la moitié symétrique du même défaut et elle
mérite un lot dédié.

### 11.6 — P2 — Les listes CRM restent volontairement en lecture directe

Tableau de bord, CRM, trésorerie, facturation avancée et copilote IA continuent
d'afficher le nom **courant** du client. C'est délibéré : ce sont des écrans de
navigation, où l'opérateur cherche « le client tel qu'il s'appelle aujourd'hui ».
Les surfaces **contractuelles** — fiche document, PDF, e-mail, portail client,
exports comptables — sont toutes passées au snapshot.

### 11.7 — Portée du verrou de suppression

Un snapshot ne peut être ni modifié ni effacé, mais la ligne document reste
supprimable dans les cas où elle l'était déjà (devis non accepté, facture
brouillon). Ce lot ne change pas — et n'avait pas à changer — les règles de
suppression existantes.

---

## 12. P0 / P1 / P2

### P0 — traité dans ce lot

| | Statut |
|---|---|
| Capturer l'identité du destinataire à l'émission (devis, factures, avoirs) | ✅ |
| Rendre ce snapshot immuable, y compris contre l'API directe | ✅ |
| Servir le snapshot à toutes les surfaces contractuelles | ✅ |
| Règle explicite pour les avoirs et la conversion devis → facture | ✅ |
| Backfill idempotent, auditable, honnête sur la provenance | ✅ |
| Preuve par tests exécutés | ✅ |

**Aucun P0 restant ouvert dans le périmètre de la mission.**

### P1 — à traiter avant commercialisation

1. Arbitrer l'adresse de renvoi : figée ou modifiable explicitement (§11.1, §11.2).
2. Ajouter `numero_tva`, `forme_juridique`, `nom_commercial`,
   `adresse_complement`, `pays` à `public.clients` — la capture suivra seule (§11.3).
3. Compter et qualifier le volume du backfill en Production avant application (§11.4).

### P2 — dette identifiée

4. `entreprise_snapshot` sur `devis` (§11.5).
5. Décider si une mention « identité reconstituée » doit apparaître sur le **PDF**
   lui-même, et pas seulement dans l'interface interne.

---

## 13. Recette humaine, état Git final et recommandation

### Recette humaine (15 minutes, sur Preview ou pile locale)

1. Créer un client « ALPHA SARL », SIRET `11111111111111`, adresse à Strasbourg.
2. Créer un devis pour ce client, le laisser en **brouillon**.
   → La fiche devis doit afficher *« Brouillon : l'identité affichée est lue en
   direct sur la fiche client et sera figée à l'émission. »*
3. Renommer le client en « BÊTA SAS » → rouvrir le brouillon : il affiche **BÊTA
   SAS** (comportement voulu, le brouillon suit la fiche).
4. Remettre « ALPHA SARL », puis passer le devis à **Envoyé**.
   → La mention devient *« Identité du client figée à l'émission le … »*.
5. Renommer le client en « BÊTA SAS », changer son SIRET et sa ville.
6. Rouvrir le devis émis : il doit toujours afficher **ALPHA SARL**, l'ancien
   SIRET et Strasbourg. **Imprimer / générer le PDF** : même résultat.
7. Créer un **nouveau** devis pour le même client et l'émettre : il doit afficher
   **BÊTA SAS**.
8. Convertir le premier devis en facture, émettre la facture, générer le PDF.
9. Créer un **avoir** sur cette facture, l'émettre : il doit porter la **même**
   identité que la facture créditée, avec la mention *« reprise de la facture
   FAC-… »*.
10. Exporter le **journal des ventes** sur la période : la colonne « Client »
    doit porter l'identité figée de chaque facture, pas « BÊTA SAS » partout.
11. Renvoyer la facture par e-mail : contrôler le nom dans le corps du message et
    le PDF joint.
12. Ouvrir le lien client `/document/[token]` : même identité figée.

### État Git final

| | |
|---|---|
| Branche | `feat/gp-client-document-snapshot-p0-v1` |
| Base | `integration/gp-postcutover-precommercial-ops-v1` — `4266ba6ce347ed3a4f379430442b341b67df516e` |
| Commit de code | `8743af2` — `feat(gp): fige l'identité du destinataire sur les documents commerciaux` |
| **SHA du lot (complet)** | `8743af230f39a218a0241a3f75181db4e7958d38` |
| Commit de clôture | `docs(gp): consigne le SHA final du lot client snapshot` — documentation seule, aucune ligne de code ni de migration |
| Empreinte du commit de clôture | Non inscrite ici : un commit ne peut pas contenir sa propre empreinte. Elle se lit par `git rev-parse origin/feat/gp-client-document-snapshot-p0-v1`. |
| Poussée sur `origin` | oui — `origin/feat/gp-client-document-snapshot-p0-v1` |
| Fusionnée | **non** — délibérément |
| Déployée | **non** — délibérément |
| Worktree | `/Volumes/ELSATIA-DEV/worktrees/gp-client-document-snapshot-p0-v1` — **conservé**, non nettoyé |
| `git status` final | propre (`.env.local` de build local est gitignoré et non versionné) |
| Pile de test | `elsatia-gp-client-snapshot-dbtest` (Docker, ports 545xx), laissée en place pour rejouer la recette |

**Ce qui n'a pas été touché :** la base locale `btp-platform`, les 47 worktrees
existants, les 3 stashes, la Production Branch Vercel, aucun environnement
déployé.

### Recommandation

**Promotion recommandée vers Preview, puis vers Production après la recette
humaine du §13 et le comptage du backfill (§11.4).**

Motifs :

1. La faille est structurelle et à conséquence légale et comptable : un document
   commercial émis n'est pas censé pouvoir changer de destinataire. Elle est
   d'autant plus anormale que le produit gelait déjà l'identité de l'émetteur.
2. La correction suit un patron **déjà éprouvé dans ce dépôt**
   (`entreprise_snapshot`), en le durcissant sur le point qui manquait : la
   capture est en base, donc incontournable.
3. La surface de risque est faible : 2 colonnes nullables, 3 fonctions, 4
   déclencheurs, 5 fichiers applicatifs. Aucune migration existante réécrite.
   Un document sans snapshot retombe exactement sur le comportement d'avant le
   lot — aucune régression possible par absence de donnée.
4. Les 1245 assertions pgTAP et les 1012 tests unitaires passent, y compris les
   tests préexistants de la fonction que ce lot redéfinit.

**Réserves à lever avant Production**, dans cet ordre :

1. Compter les documents concernés par le backfill (requête §11.4) et accepter
   explicitement qu'ils portent une identité marquée « reconstituée ».
2. Arbitrer la règle d'adresse de renvoi (§11.1) — c'est le seul point où
   l'exactitude juridique et la délivrabilité s'opposent, et il appelle une
   décision de Julien, pas un choix technique.
3. Jouer la recette humaine ci-dessus sur Preview.

**Verdict : VALIDÉ.**

