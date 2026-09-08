# ELSATIA-ECOSYSTEM-INTEGRATION-TRAIN-V2-RESERVES-V5-GP-LATEST-V1 — RAPPORT

## Verdict

**VALIDÉ SOUS RÉSERVE.**

L'intégration est complète et vérifiée : le train assemble le train global, le code
Réserves V5, sa migration renumérotée en **273**, l'intégration Client Contracts/Snapshot
(déjà présente) et le dernier lot GP de renvoi d'adresse. Le ledger est validé sur quatre
chemins (installation neuve et trois upgrades), pgTAP passe intégralement, et
typecheck / lint / builds / unitaires sont verts.

**La réserve porte sur un seul point :** la recette E2E hors-ligne n'a pas atteint une
passe complète 14/14 en un seul run. Meilleure passe enregistrée : **13/14**, et
**chacun des 14 scénarios est passé au moins une fois**. La cause du 14ᵉ échec a été
identifiée et corrigée (§7-3). Le poste de recette tournait à une charge moyenne de
**42 à 48** avec **60 conteneurs** appartenant à d'autres sessions : les échecs restants
sont des dépassements de délai, pas des régressions. Une passe de confirmation sur une
machine au repos est exigée avant de lever la réserve (§10, P1).

---

## 1. Branche et SHA

| | |
|---|---|
| Branche d'intégration | `integration/elsatia-train-v2-reserves-gp-isole-v1` |
| SHA de base (train global) | `4f1f17044a38beba3b09e6937b2f8f626a8d87e0` |
| SHA final complet poussé | `80093c29726693e4fdc959d83d9b15b74c797d5f` (rapport) — code : `0fda7d2` |

**Sources intégrées**

| Lot | SHA | État |
|---|---|---|
| Train global | `4f1f17044a38beba3b09e6937b2f8f626a8d87e0` | base |
| Réserves V5 (code) | `7c0fc3d158a0f7b6a3de27eaba8b4be47cb60b00` | repris **sans** sa migration candidate |
| GP Client Contracts / Snapshot | `0bfebd8891526edb39170d66e51a8353fa695048` | **déjà dans le train** (vérifié : ancêtre de `4f1f170`) |
| GP renvoi d'adresse | `253d23e431dc92b8e45a0aaee4417cb235909db0` | intégré (2 commits) |

> **SHA complet du lot GP renvoi retrouvé comme demandé :** l'abrégé `253d23e` résout en
> `253d23e431dc92b8e45a0aaee4417cb235909db0`. Le lot confirme ses annonces : **aucune
> migration** (`git diff --name-status 4f1f170...253d23e -- supabase/migrations` est vide),
> et le SQL des champs légaux reste hors du train, dans
> `docs/migrations-proposees/client-legal-fields-v1.sql.proposed`.

Réserves V4 (`cb9df18`) était **déjà** dans le train : seuls les commits V5 restaient.

---

## 2. Liste exacte des migrations

**271 fichiers**, numéro fonctionnel maximal **273**. Les trois derniers :

| Fichier | Origine |
|---|---|
| `20260908000271_colors_activity_history_v14.sql` | Colors — inchangé, déjà au train |
| `20260908000272_client_document_snapshot_v1.sql` | GP Snapshot — inchangé, déjà au train |
| `20260908000273_reserves_v5_offline_idempotence_v1.sql` | **créée par ce train** |

`verify:migrations` : **271 migrations valides, noms et horodatages uniques.**

---

## 3. Correspondance candidate → canonique

| | |
|---|---|
| Candidate de branche | `20260907000271_reserves_v5_offline_idempotence_v1.sql` |
| Portée par | `feat/reserves-v4-e2e-offline-pdf-print` (code V5 `7c0fc3d`) |
| **Canonique du train** | `20260908000273_reserves_v5_offline_idempotence_v1.sql` |
| Contenu SQL métier | **repris sans modification** (diff hors en-tête : néant) |

**Pourquoi 273, et pourquoi ce n'est pas une réécriture.** Le 271 du train appartient à
Colors, le 272 à `client_document_snapshot`. La candidate Réserves vivait sur une branche
isolée, **jamais fusionnée**, appliquée nulle part ailleurs que sur une base jetable de
recette : aucune installation ne la connaît sous l'ancien identifiant. Le train ne modifie
donc aucune migration canonique — il crée la seule qui l'ait jamais été. La provenance est
écrite en tête du fichier.

**Audit du numéro.** 273 a été retenu après examen de **toutes** les références locales et
distantes du dépôt : aucune migration de numéro fonctionnel ≥ 273 n'existe nulle part.

**Non-application en production vérifiée** : la candidate n'apparaît que sur deux
références (la branche Réserves locale et son homologue distante), sur aucune branche
d'intégration ni sur `main`, et n'a été jouée que sur la pile jetable
`elsatia-reserves-v4-dbtest`. Aucune connexion à une base de production n'a eu lieu.

**Aucune fonction V5 ne référence le nom du fichier historique** : recherche de
`20260907000271` et de `reserves_v5_offline_idempotence_v1` dans `apps/`, `src/`, `tests/`,
`supabase/` et `docs/` — aucune occurrence. La seule mention d'un numéro de migration dans
le code Réserves est `admin.ts` citant « migration 00270 », qui est canonique et exacte.

---

## 4. Champs clients légaux — non intégrés, conformément au cadrage

Leur SQL **n'entre pas** dans ce train. Les quatre exigences sont néanmoins vérifiées :

| Exigence | État |
|---|---|
| `clients.societe` reste le nom commercial | ✅ existe depuis `20260710000004`, peuplée, saisie au formulaire |
| `clients.raison_sociale` devient le nom légal | ✅ existe depuis `20260710000004`, jusqu'ici inexploitée |
| Aucun troisième champ `nom_commercial` | ✅ **aucune colonne créée** — les occurrences trouvées sont des entrées de liste blanche du snapshot (272) et de la proposition, qui refuse explicitement cette colonne |
| Champs manquants facultatifs | ✅ la proposition n'ajoute que `numero_tva`, `forme_juridique`, `adresse_complement`, `pays`, toutes en `add column if not exists … text`, donc nullables |

---

## 5. Ledger réel et tests de migration

Base jetable `elsatia-reserves-v4-dbtest` (ports 5732x). **Aucune production touchée.**

| Test | Résultat |
|---|---|
| **Installation neuve** (271 migrations) | ✅ ledger `20260908000273`, 271 lignes |
| **Upgrade 210 → 273** | ✅ départ `20260818000210` (202 migrations) → 69 appliquées → 271 |
| **Upgrade 263 → 273** | ✅ départ `20260904000263` (261 migrations) → 10 appliquées → 271 |
| **Upgrade 272 → 273** | ✅ départ `20260908000272` (270 migrations) → 1 appliquée → 271 |

Objets V5 vérifiés **après le chemin d'upgrade**, pas seulement après installation neuve :
table `reserves_mutations_appliquees`, colonne `reserves_messages.origine_client_id`,
fonction `reserves_transition_differee`, `reserves_commenter` en arité 4, index unique.

---

## 6. Tests

| Suite | Résultat |
|---|---|
| **pgTAP** (installation neuve) | **68 fichiers, 1 869 tests — PASS** |
| **pgTAP** (après upgrade 210 → 273) | **68 fichiers, 1 861 tests — PASS** |
| Unitaires GP | 1 236 tests — 1 234 au budget par défaut, **1 236 avec un délai réaliste** (§7-5) |
| Unitaires Réserves | **109 tests — PASS** |
| `verify:migrations` | **PASS** — 271 valides, horodatages uniques |
| Typecheck (GP + Tools + Réserves) | **PASS** |
| Lint (GP + Tools + Réserves) | **PASS**, 0 erreur 0 avertissement |
| Build GP | **PASS** (7,0 min) |
| Build Tools | **PASS** |
| Build Réserves | **PASS** (2,5 min) |
| **E2E hors-ligne Réserves** | **13/14 à la meilleure passe** — voir la réserve |

Les suites pgTAP couvrent d'un seul tenant les tests GP, Réserves et Client
Contracts/Snapshot : elles sont dans le même dossier et jouées ensemble.

### Contrôles demandés

- **Numéros fonctionnels** : maximum 273, aucune collision introduite. Six doublons
  **préexistants** au train (§9-1).
- **Préfixes complets** : les 271 fichiers respectent `^\d{14}_[a-z0-9_]+\.sql$`, avec
  horodatage 14 chiffres unique — contrôlé par `verify:migrations`.
- **Blobs et dépendances** : aucun octet nul, aucune migration vide. Les dépendances
  déclarées sont complètes ; l'absence initiale de `@capacitor/*` venait de mon
  environnement, pas du train (§9-2).

---

## 7. Anomalies

**1. Session concurrente sur la branche d'intégration — ARBITRÉE PAR JULIEN.**
Une autre session travaillait simultanément sur
`integration/elsatia-ecosystem-train-v2-reserves-gp-v1`, la branche que j'avais créée. Elle
y a commité `bfb5e7b` (migration **274**, champs clients légaux) 17 minutes après mon
dernier commit, et y avait des modifications non commitées (`ClientForm.tsx`,
`actions/clients.ts`, `clients/[id]/page.tsx`, un test d'identité légale). Un fichier `274`
que j'avais écarté du dossier des migrations y est réapparu.

Cela contredisait mon cadrage — *« ne pas intégrer encore leur SQL »*, *« préparer le numéro
suivant uniquement après validation de la migration Réserves »*, la 273 n'étant pas encore
validée. **Je me suis arrêté et j'ai demandé l'arbitrage.** Décision retenue : poursuivre
**isolé, sans la 274**, sur `integration/elsatia-train-v2-reserves-gp-isole-v1`, créée à
partir de mon commit `8316a38`. **Le travail de l'autre session n'a été ni modifié, ni
reverté, ni écrasé.**

**2. `reserves_appliquer_transition` est privée — un test V4 ne prouvait rien.**
Elle n'est pas accordée au rôle `authenticated` ; l'application passe par les enveloppes
publiques (`reserves_demander_levee`, `reserves_statuer_levee`…). Un test V4 l'appelait
directement et acceptait un 403 : il ne prouvait donc que le caractère privé de la
fonction, jamais la règle métier. Corrigé lors du lot V5, confirmé ici.

**3. Quatre défauts applicatifs trouvés et corrigés (commit `0fda7d2`).** Tous de la même
famille : confondre « le serveur ne répond pas » avec un état définitif.
 - un service d'authentification expiré faisait répondre **401** aux routes de
   synchronisation, et la file annonçait « Session expirée : reconnectez-vous » à un
   utilisateur dont la session était valide → **503** désormais, et message adapté ;
 - une panne réseau plaçait la mutation en `echec`, état repris seulement sur clic : une
   coupure de trente secondes exigeait un geste humain → les pannes transitoires
   retournent en file et repartent seules, plafonnées ; un refus métier attend toujours
   une décision ;
 - la coquille applicative ne synchronisait qu'au montage et au retour de `online` : si la
   première tentative échouait, plus rien ne la relançait → reprise périodique partagée
   avec la coquille hors-ligne (c'était la cause du 14ᵉ échec) ;
 - la fixture `request` de Playwright subit `setOffline` : les vérifications serveur faites
   pendant une coupure ne testaient que l'émulation → constats déplacés avant la coupure,
   et actions d'un « autre appareil » passées par un contexte d'API indépendant.

**4. Une réserve créée juste avant la mise en cache n'y figure pas.** Le semeur ne mémorise
que ce que l'écran a listé ; le tableau de bord n'affiche pas forcément la toute dernière.
Sans conséquence fonctionnelle, mais un test s'appuyait dessus par un repli silencieux qui
visait alors une autre réserve — corrigé (P2 §10).

**5. Instabilité Vitest sous charge, déjà mesurée par le lot GP** (`dfb6f35`). Deux tests
GP dépassent le budget par défaut de 5 s : un balayage de fichiers sources qui prend 14,3 s
sur volume externe, et une génération de classeur. Avec un délai réaliste, **les 1 236
tests passent**. Environnement, non régression.

**6. Le CLI Supabase échoue par intermittence sous charge** (`Connection timed out`,
conteneur `storage` jugé `unhealthy`) alors que la base est saine et migrée. Les verdicts
de ledger ont donc été lus **en base**, jamais sur le code de sortie du CLI, et la suite
pgTAP a aussi été jouée directement dans le conteneur pour confirmation.

---

## 8. Branches désormais obsolètes

| Branche | Statut |
|---|---|
| `feat/reserves-v4-e2e-offline-pdf-print` | **obsolète pour l'intégration** — son code est au train ; sa migration candidate `20260907000271` ne doit **jamais** être fusionnée telle quelle |
| `integration/gp-client-contracts-snapshot-v1` | **obsolète** — déjà absorbée par `4f1f170` |
| `feat/gp-client-document-snapshot-p0-v1` | **obsolète** — ses deux commits sont au train |
| `integration/elsatia-ledger-reconciliation-p0-v1` | **superséée** par ce train |
| `integration/elsatia-ecosystem-train-v2-reserves-gp-v1` | **à arbitrer** — branche de la session concurrente, porte la migration 274 non validée (§7-1) |

---

## 9. Points relevés, non corrigés (hors périmètre)

**1. Six doublons de numéro fonctionnel, préexistants au train** : 200, 236, 237, 238, 239,
240 — même numéro, préfixes de date différents. Exemple : `20260826000236_platform_support_uid_security_v1`
et `20260830000236_elsatia_tools_r8_comptes_entitlements_sync`. L'ordre d'application reste
déterministe (tri sur le nom complet) et `verify:migrations` n'exige l'unicité que du
timestamp 14 chiffres. **Je ne les ai pas renumérotés** : ils sont appliqués sur des
installations existantes, et les renommer réécrirait l'histoire de bases réelles — exactement
ce que la règle du lot interdit. À traiter par une convention, pas par un renommage.

**2. `@capacitor/*` absent de `node_modules`** au premier typecheck : dépendance de
`apps/tools`, jamais installée dans mon plan de travail. Résolu par installation. Le
`package.json` du train est correct et inchangé.

---

## 10. Reste à faire

**P0 — aucun.**

**P1**
- **Confirmer la recette E2E hors-ligne en 14/14 sur une machine au repos.** Meilleure
  passe ici : 13/14, chaque scénario passé au moins une fois, cause du 14ᵉ corrigée après
  coup mais non revérifiée en passe complète (charge 42–48, 60 conteneurs concurrents).
- **Arbitrer la migration 274** (champs clients légaux) de la session concurrente : la
  valider et l'intégrer, ou la reprendre dans un train ultérieur. Elle est prête et son
  contenu a été relu (aucun `nom_commercial`, colonnes nullables), mais elle n'entre pas
  ici par cadrage.

**P2**
- Pré-charger explicitement les réserves récentes dans le cache hors-ligne (§7-4).
- Convention de numérotation pour empêcher de nouveaux doublons de numéro fonctionnel (§9-1).

---

## 11. Nouveau canon recommandé

**`integration/elsatia-train-v2-reserves-gp-isole-v1`**, ledger **271 fichiers**, numéro
fonctionnel maximal **273**.

C'est le canon recommandé **une fois la réserve du §10 levée** : une passe E2E hors-ligne
complète sur machine au repos, et l'arbitrage de la 274.

**Aucune fusion. Aucun déploiement. Aucune écriture en production.**
La pile de développement `btp-platform` n'a jamais été touchée (263 migrations, vérifiée).
