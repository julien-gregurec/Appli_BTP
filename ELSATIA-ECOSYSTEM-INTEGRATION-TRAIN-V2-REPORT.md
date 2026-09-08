# ELSATIA — Train d'intégration écosystème V2 (Réserves V5 + GP Renvoi + champs clients légaux)

**Verdict : VALIDÉ** pour le contenu du train — sous les réserves nommées au §9, dont deux
tests **NON EXÉCUTÉS** faute d'outil sur la machine.

**Production touchée : NON.** Aucune migration appliquée en Production, aucun déploiement,
aucune fusion, aucun accès Supabase distant, aucun worktree ni stash supprimé.
`/Volumes/ELSATIA-PRODUCTION-DR` et la base locale `btp-platform` n'ont pas été ouverts.

---

## 1. Identité du lot

| Élément | Valeur |
|---|---|
| Branche | `integration/elsatia-ecosystem-train-v2-reserves-gp-v1` |
| SHA de base | `4f1f17044a38beba3b09e6937b2f8f626a8d87e0` |
| SHA final | *(renseigné au commit de ce rapport — voir §11)* |
| Worktree | `/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/train-v2-reserves-gp` |
| Ledger | **272 fichiers**, numéro fonctionnel maximal **274** |
| Delta depuis la baseline Production | **62 migrations** |

### 1.1 SHA sources — tous vérifiés présents sur `origin`

| Lot | Référence | SHA |
|---|---|---|
| Train global intermédiaire | `integration/elsatia-ledger-reconciliation-p0-v1` | `4f1f17044a38beba3b09e6937b2f8f626a8d87e0` |
| Client Contracts + Snapshot | `integration/gp-client-contracts-snapshot-v1` | `0bfebd8891526edb39170d66e51a8353fa695048` |
| GP Renvoi — commit du lot | `feat/gp-client-document-snapshot-p0-v1` | `12909d395e9f75a840990245e8445d1291428ec1` |
| GP Renvoi — **tête distante, SHA complet retrouvé** | idem | **`253d23e431dc92b8e45a0aaee4417cb235909db0`** |
| GP Renvoi — base Snapshot | idem | `dfb6f35c9b14acbda2f17e1de3fee9fdf62c181a` |
| Réserves — base V4 | `feat/reserves-v4-e2e-offline-pdf-print` | `cb9df18946b4a2d4ff04a55fe78de3d3a2ca7055` |
| Réserves — code V5 | idem | `7c0fc3d158a0f7b6a3de27eaba8b4be47cb60b00` |
| Réserves — tête poussée | idem | `3db106d84de2454401fe207e9fc3e970b3554d40` |

Le SHA abrégé `253d23e` annoncé dans la commande était le seul manquant. Il a été retrouvé
par `git rev-parse` sur la branche et **confirmé identique côté `origin`**
(`git ls-remote`) : `253d23e431dc92b8e45a0aaee4417cb235909db0`.

### 1.2 Reprise d'un travail antérieur — signalé, pas masqué

La branche cible **existait déjà** au démarrage, avec quatre commits produits entre 05:15 et
05:17 par la session `local_4e39265c` (« Elsatia ecosystem integration train V2 »), **arrêtée**
et non poussée. Il s'agissait d'un premier passage du même lot. Plutôt que d'ouvrir un doublon,
son travail a été **repris et intégralement revérifié** — pas cru sur parole : équivalence
octet à octet du code Réserves V5 avec sa source, comparaison de la migration renumérotée à la
candidate, contrôle du fichier pgTAP partagé, recomptage du ledger. Les Phases B et C sont
donc pour partie l'œuvre de ce premier passage ; les Phases D, E et F, la totalité des tests et
ce rapport sont l'œuvre du second.

---

## 2. Migrations — ce qui entre, et sous quel numéro

| Ancien identifiant | Nouvel identifiant canonique | Objet |
|---|---|---|
| `20260907000271_reserves_v5_offline_idempotence_v1.sql` (candidate, jamais appliquée) | **`20260908000273_reserves_v5_offline_idempotence_v1.sql`** | Idempotence des mutations différées Réserves V5 |
| `docs/migrations-proposees/client-legal-fields-v1.sql.proposed` (hors répertoire des migrations) | **`20260908000274_client_legal_fields_v1.sql`** | Champs d'identité légale sur `public.clients` |

### 2.1 Pourquoi la candidate Réserves ne pouvait pas garder son numéro

La position fonctionnelle **271 est occupée** par `20260908000271_colors_activity_history_v14.sql`
et **272** par `20260908000272_client_document_snapshot_v1.sql`. La candidate a été renumérotée
en **273**, premier libre après 272, vérifié sur **l'ensemble des références locales et
distantes** du dépôt (aucune migration de numéro ≥ 273 nulle part avant ce lot).

**Elle n'a jamais été appliquée en Production** — ni ailleurs qu'en base jetable de recette.
La renuméroter ne réécrit donc l'histoire d'aucune installation : ce n'est pas la modification
d'une migration canonique, c'est la création de la seule qui l'ait jamais été. La branche
source `feat/reserves-v4-e2e-offline-pdf-print` **n'a pas été réécrite**.

**Correspondance documentée** : le fichier 273 porte en tête un bloc « PROVENANCE ET
RENUMÉROTATION » qui nomme la candidate, sa branche, le SHA du code V5 et la raison du
changement. Son **contenu métier est repris sans modification** — le diff avec la candidate se
réduit à ce bloc de commentaires.

**Le code ne dépend pas du nom du fichier** : la seule occurrence de `20260907000271` hors des
migrations est une phrase du rapport Réserves V5, qui décrit l'état de sa branche d'origine.

### 2.2 Champs clients légaux — prémisses vérifiées avant d'écrire

La proposition SQL a été auditée, pas recopiée. Chaque affirmation a été contrôlée :

- `public.clients` est créée par `20260710000004` et n'a reçu depuis que `latitude`/`longitude`
  (`20260715000080`) et `relance_auto_exclue` (`20260824000230`). Les quatre colonnes ajoutées
  sont donc **réellement absentes**.
- Les homonymes existants portent sur d'**autres tables** : `entreprises.forme_juridique`
  (`20260716000089`), `fournisseurs.numero_tva` (`20260718000111`). Aucune n'est touchée.
- `clients.raison_sociale` **existe depuis `20260710000004`** et n'était lue ni écrite nulle
  part : toutes les occurrences de `raison_sociale` dans `src/` portaient sur `entreprises`.

Règles appliquées, conformes à l'arbitrage :

| Règle | Application |
|---|---|
| `clients.societe` = nom commercial | conservé, inchangé ; c'est le `tradeName` du contrat |
| `clients.raison_sociale` = raison sociale légale | **activée** dans le formulaire, les actions et la fiche ; c'est le `legalName` |
| ne pas créer `nom_commercial` | **non créée** — vérifié en base après migration |
| colonnes réellement absentes uniquement | 4 colonnes, toutes vérifiées absentes |
| `numero_tva`, `forme_juridique`, `adresse_complement` facultatifs | oui, `null` autorisé |
| `pays` avec valeur et normalisation cohérentes | ISO 3166-1 alpha-2 majuscule ; **défaut FR appliqué à la lecture, jamais écrit** |
| ne jamais inventer une donnée au backfill | **aucun backfill** — il n'existe aucune source pour reconstituer ces champs |
| snapshots historiques immuables | inchangés ; la liste blanche de `construire_client_snapshot` portait déjà ces clés |

---

## 3. Dernier lot GP Renvoi — ce qui a été repris

Entre la base Snapshot `dfb6f35` et la tête `253d23e`, la branche ne porte que **deux commits**,
tous deux **absents** du train de base :

| SHA | Objet | Repris |
|---|---|---|
| `12909d395e9f…` | surcharge tracée de l'adresse de renvoi | oui (`c8574a6`) |
| `253d23e431dc…` | consigne le SHA du lot renvoi et champs légaux | oui (`bcf74bb`) |

Contrôle d'équivalence : **tous les fichiers** touchés par le lot GP sont identiques entre
`253d23e` et la tête du train, **à deux exceptions volontaires** — `document-resend-override.ts`
(substitution du validateur, §4) et `client_document_snapshot_v1.test.sql` (plan porté à 28
par la migration 274). Rien n'a été écrasé : le pont SQL/TypeScript, les tests de symétrie,
`@elsatia/client-contracts`, la migration 272 et les améliorations Réserves sont intacts.

### 3.1 Conflit sur le fichier pgTAP partagé — résolution additive

`supabase/tests/client_document_snapshot_v1.test.sql` a évolué dans plusieurs branches :

| Référence | Lignes | Plan |
|---|---|---|
| Base Snapshot `dfb6f35` | 260 | `plan(21)` |
| Client Contracts `0bfebd8` | 260 | `plan(21)` — **ne touchait pas ce fichier** |
| GP Renvoi `253d23e` | 318 | `plan(26)` — +5 assertions |
| **Train V2** | 360 | **`plan(28)`** — +2 assertions (migration 274) |

Résolution **additive**, jamais `ours` ni `theirs` : toutes les assertions pertinentes sont
conservées et le plan est **recalculé** à chaque étape. Le nombre d'assertions du fichier a été
recompté et vérifié égal au plan déclaré.

Les assertions 23 et 24 **constataient l'absence** des colonnes légales (« partie 2 bloquée par
le ledger »). La migration 274 les rendant fausses, elles ont été **reformulées, pas
supprimées** : 24 vérifie désormais que les quatre colonnes existent **et** que `nom_commercial`
reste volontairement absente. Deux assertions ont été ajoutées : capture réelle d'une valeur par
le snapshot, et refus d'un `pays` hors ISO alpha-2.

---

## 4. Validateurs partagés et garde-fou email

Le garde-fou de format email « temporaire » de `document-resend-override.ts` a été **remplacé
par `isPlausibleEmail`** de `@elsatia/client-contracts`. Il n'existe donc plus qu'une seule
définition d'« adresse plausible » dans l'écosystème.

La **borne de 320 caractères est conservée** et n'est pas un reliquat : c'est la limite
d'adresse de la RFC 5321, une contrainte de transport que `isPlausibleEmail` ne porte pas — et
ne doit pas porter. Supprimer la borne au motif que « le validateur partagé remplace tout »
aurait retiré un contrôle que le validateur n'assure pas.

La validation du numéro de TVA passe elle aussi par le contrat partagé (`isValidVatNumber`,
clé de contrôle française comprise) : `lireIdentiteLegale` refuse `FR00303265045` (clé fausse)
et accepte `fr 40 303 265 045`, qu'elle normalise en `FR40303265045`.

---

## 5. Réserves V5 — préservation vérifiée

Le code V5 est **identique octet pour octet** à sa source `3db106d` : sur les 36 fichiers du
lot, seuls diffèrent la migration (renumérotée) et le rapport Réserves (note de renumérotation).
Mécanismes contrôlés présents : service worker (150 lignes), cache de coquille, IndexedDB
séparé par identité, file offline, idempotence, photos, commentaires, conflits, purge à la
déconnexion, et **protection d'une levée déjà validée** — la migration 273 refuse et rend la
main plutôt que d'écraser une décision (« Écraser une levée déjà validée par une action
préparée hors ligne ferait disparaître une décision »).

---

## 6. Recette — résultats exacts

### 6.1 Environnement

Le **CLI Supabase est inutilisable sur cette machine** : le binaire se bloque indéfiniment,
y compris sur `supabase --version`. `supabase start`, `db reset` et `test db` sont donc hors
d'atteinte. La recette SQL a été menée sur **conteneurs PostgreSQL jetables**
(`supabase/postgres:17.6.1.143`, un conteneur par scénario), précédés d'un **prélude** qui
reproduit le socle plateforme qu'un conteneur nu ne porte pas : tables `storage`, `auth.jwt()`,
`auth.mfa_factors`, colonnes GoTrue modernes de `auth.users`, et repli des claims JSON dans
`auth.uid/role/email`. Le prélude n'accorde **aucun droit applicatif** : ce sont les migrations
du dépôt qui accordent et révoquent ceux de `anon` et `authenticated`, ce que plusieurs suites
pgTAP vérifient précisément. Ni `btp-platform`, ni les piles des autres conversations, ni
`/Volumes/ELSATIA-PRODUCTION-DR` n'ont été touchés.

### 6.2 Migrations

| Scénario | Volume | Résultat |
|---|---|---|
| `npm run verify:migrations` | 272 | **PASS** — noms et horodatages uniques |
| Fresh install | 272 migrations | **PASS** |
| Upgrade depuis la baseline Production | 210 → +62 | **PASS** |
| Upgrade depuis le ledger 263 | 263 → +9 | **PASS** |
| Upgrade depuis le canon GP 270, pas à pas | +`000273` puis +`000274` | **PASS** |
| Rejeu de `20260908000274` (×2) | — | **PASS** — idempotente |
| Rejeu de `20260908000273` | — | **ÉCHEC** — voir P2-1 |
| Rejeu du train complet | — | **ÉCHEC attendu** — le train n'est pas globalement rejouable |
| `git diff --check` | — | **PASS** |

Après migration : les quatre colonnes existent, les deux contraintes de forme sont posées,
`nom_commercial` est absente, et le backfill est vide — comme voulu.

### 6.3 pgTAP

**67 fichiers PASS sur 68, 1 870 assertions réussies.**

L'unique échec, `reserves_v2_terrain_capture.test.sql` assertion 26, est **prouvé
environnemental** : le même fichier passe **92/92** dès lors que `authenticated` perd le
privilège `DELETE` sur `storage.objects`. Voir P2-2 — la cause est réelle et mérite un
arbitrage, mais elle ne concerne pas les migrations ajoutées par ce lot.

### 6.4 Suites applicatives

| Suite | Résultat |
|---|---|
| Vitest racine (GP + Client Contracts) | **117 fichiers / 1 242 tests PASS** |
| `apps/tools` | **20 fichiers / 108 tests PASS** |
| `apps/reserves` | **8 fichiers / 106 tests PASS** |
| `apps/colors` | **6 fichiers / 27 tests PASS** |
| `npm run typecheck` (GP, Tools, Réserves) + Colors | **PASS** |
| `npm run lint` (GP, Tools, Réserves) + Colors | **PASS** — 0 erreur, 4 avertissements préexistants |
| Build GP | **PASS** |
| Build Tools | **PASS** |
| Build Réserves | **PASS** |
| Build Colors | **PASS** |
| **E2E offline (Playwright, 47 scénarios)** | **NON EXÉCUTÉ** — voir P1-1 |

Sur un premier passage à charge élevée, `xlsx.test.ts` et
`stripe-discount-legacy-surface.test.ts` ont échoué par **dépassement du délai de 5 000 ms**.
Rejoués isolément puis en suite complète à charge normale : **1 242/1 242 PASS**. C'est
l'instabilité sous charge déjà mesurée et consignée par le lot GP (`dfb6f35`), pas une
régression — mais elle est signalée plutôt que tue.

---

## 7. Ledger réel et delta de cutover

### 7.1 Le compte

| Repère | Fichiers | Dernière migration | Delta depuis Production |
|---|---|---|---|
| Baseline Production | **210** appliquées | `20260824000231` (rang 223) | — |
| Ancienne cible du préflight | 263 | `20260905000265` | 53 |
| Train intermédiaire ledger P0 | 270 | `20260908000272` | 60 |
| **Cible de ce lot** | **272** | **`20260908000274`** | **62** |

Le préflight annonçait **53** ; le train intermédiaire en comptait **60** jusqu'à 272 ; les
deux migrations ajoutées ici portent le total à **62**.

### 7.2 Pourquoi 210 et non 223

La Production compte **210 lignes** dans `supabase_migrations.schema_migrations` pour un rang
maximal de **223** : les rangs **195 → 207** (ligne TARIFS-V2 / admin / avenants, 13 migrations)
n'y ont jamais été appliqués. `194 + 16 = 210`. Le delta de 62 se décompose donc en **13
migrations à horodatage antérieur** au `max(version)` Production, rattrapées par
`--include-all`, **plus 49 postérieures**. Le scénario d'upgrade a reproduit exactement cette
baseline, trous compris — ce n'est pas « les 210 premiers fichiers ».

### 7.3 Numéro fonctionnel ≠ rang — piège à ne pas répéter

Le numéro fonctionnel n'est **ni unique ni monotone** : le dépôt porte six doublons
(`000200`, `000236` à `000240`), dont trois appliqués en Production, et l'ordre alphabétique
des fichiers rompt quatre fois l'ordre des numéros. Seul le **préfixe à 14 chiffres** est
unique et ordonnant — c'est celui que Supabase applique, et celui que toute découpe doit
utiliser. Le « point de non-retour 255 » est le **numéro fonctionnel** de
`20260902000255_acl_reconciliation_v1.sql`, qui occupe le **rang 253**.

### 7.4 Préflight actualisé

`docs/runbooks/ELSATIA_PRODUCTION_CUTOVER_PREFLIGHT_FINAL_V1.md` a été mis à jour selon la
convention déjà en vigueur dans ce document (bloc de rebasage daté qui supersède les chiffres
antérieurs, plutôt qu'une réécriture des 1 044 lignes de procédure opérateur) :

- **bloc « Rebasage 2026-09-08 »** : cible ledger 272, dernière `…000274`, delta **62** ;
- **§2.1** : ligne de volume corrigée (210 → 272, **62**), l'ancienne valeur restant lisible
  dans l'historique Git ;
- **§2.1bis (nouveau)** : décomposition du delta, les deux migrations ajoutées, l'explication
  210/223, l'ordre d'application, le point de non-retour, la sauvegarde préalable, la
  restauration obligatoire après la 255, l'incompatibilité d'un rollback frontend seul, les
  contrôles avant fenêtre, et les preuves d'exécution de ce lot.

Points de cutover **inchangés et reconfirmés** : point de non-retour à `…000255` ; sauvegarde
datée obligatoire **avant la première migration**, pas avant la 255 ; après la 255, un rollback
**exige la restauration du snapshot** (les ~1 220 `REVOKE` ciblés ne s'inversent pas par
script) ; **un rollback frontend seul est incompatible**, le frontend Production ne connaissant
ni l'ACL 255, ni Colors, ni Tools, ni Réserves, ni les colonnes de la 274.

**Le cutover n'a pas été effectué.**

---

## 8. Conflits rencontrés et résolutions

| Conflit | Résolution |
|---|---|
| Candidate Réserves `000271` vs Colors `000271` déjà canonique | Renumérotation en `000273`, correspondance documentée en tête de fichier, branche source non réécrite |
| `client_document_snapshot_v1.test.sql` modifié dans plusieurs branches | Résolution **additive** : version GP retenue (Contracts ne touchait pas le fichier), puis plan recalculé 26 → 28. Jamais `ours` ni `theirs` |
| Assertions 23-24 rendues fausses par la migration 274 | Reformulées pour constater l'état voulu, et complétées par deux assertions de capture réelle |
| `lireIdentiteLegale` exporté depuis un module `"use server"` | Build en échec ; logique déplacée dans `src/lib/client-identite-legale.ts`, où elle a sa place |
| Numéro fonctionnel non monotone, découpe des upgrades faussée | Découpe refaite sur le **rang** et le préfixe 14 chiffres |

---

## 9. Réserves — P0 / P1 / P2

### P0
**Aucun P0 imputable au contenu du train.** Les P0 de cutover déjà connus (relecture du ledger
Production en direct, sauvegardes datées, fenêtre et responsable nommés) restent ouverts et
hors du périmètre de ce lot.

### P1

**P1-1 — E2E offline NON EXÉCUTÉS.** Les 47 scénarios Playwright exigent l'application servie
sur `127.0.0.1:3100` **et** une pile Supabase complète (auth, REST, storage). Le CLI Supabase
étant bloqué sur cette machine, la pile ne peut pas démarrer. Le hors-ligne réel de Réserves V5
n'a donc **pas été rejoué ici** ; il l'a été par le lot d'origine au SHA `7c0fc3d`. À rejouer
sur une machine où le CLI fonctionne, **avant de considérer Réserves V5 comme recetté au sein
du train**.

**P1-2 — CLI Supabase inutilisable.** `supabase --version` lui-même ne rend pas la main. Toute
la recette SQL a dû être reconstruite sur conteneurs nus avec un prélude de socle. Ce prélude
est une **approximation fidèle mais approximative** du socle plateforme : il explique à lui seul
l'échec pgTAP résiduel (§6.3). À diagnostiquer — sans quoi aucune recette SQL fidèle n'est
possible sur ce poste.

**P1-3 — dépendances absentes du worktree.** `apps/tools` et `apps/colors` n'avaient pas de
`node_modules` ; leurs typecheck, lint, tests et builds étaient impossibles jusqu'à copie depuis
le dépôt principal. Un lot qui se serait arrêté au premier échec aurait conclu à tort à une
régression Capacitor.

### P2

**P2-1 — `20260908000273` n'est pas rejouable.** Elle crée `reserves_mutations_appliquees_select`
sans `drop policy if exists` préalable ; un second passage échoue. Le défaut vient de la
candidate d'origine et **a été conservé sciemment** : Supabase ne rejoue jamais une migration,
le reste du train n'est pas davantage rejouable, et modifier le corps du fichier aurait rompu la
propriété d'audit demandée — un contenu métier repris *sans modification* depuis la candidate.
À corriger dans un lot dédié si l'on veut rendre le train globalement rejouable.

**P2-2 — contradiction latente sur `storage.objects`.**
`20260907000269_reserves_v2_terrain_capture_v1.sql` (ligne 825) accorde explicitement
`delete on storage.objects to authenticated`, alors que sa propre suite pgTAP affirme
qu'« aucune photo ne peut être effacée du stockage depuis l'application » et attend un `42501`.
Les deux ne tiennent ensemble que parce que, sur une pile Supabase réelle, `postgres` n'est pas
propriétaire de `storage.objects` et le `grant` **ne transmet pas** le privilège. L'assertion
passe donc par accident de configuration, pas par intention exprimée. À arbitrer : soit retirer
le `delete` du `grant`, soit reformuler l'assertion.

**P2-3 — suppression d'un fichier non suivi pendant la session.** La migration `…000274`,
écrite puis vérifiée sur disque, a **disparu** du worktree quelques minutes plus tard — signature
d'un `git clean` lancé depuis l'extérieur, plusieurs sessions travaillant en parallèle sur ce
dépôt. Elle a été restaurée depuis une copie et **commitée immédiatement**. Recommandation :
commiter tout nouveau fichier de migration dès son écriture.

**P2-4 — instabilité Vitest sous charge**, déjà consignée par le lot GP (`dfb6f35`) : deux tests
dépassent le délai de 5 000 ms quand la machine est chargée, et passent sinon.

---

## 10. Branches — état recommandé

| Branche | État | Recommandation |
|---|---|---|
| `integration/elsatia-ecosystem-train-v2-reserves-gp-v1` | **nouveau canon** | à retenir comme cible de cutover |
| `integration/elsatia-ledger-reconciliation-p0-v1` | ancêtre direct du canon | **obsolète** — entièrement contenue |
| `integration/gp-client-contracts-snapshot-v1` | ancêtre direct du canon | **obsolète** — entièrement contenue |
| `feat/gp-client-document-snapshot-p0-v1` | contenu repris par cherry-pick | conserver comme **source historique**, ne plus alimenter |
| `feat/reserves-v4-e2e-offline-pdf-print` | contenu repris, migration renumérotée | conserver comme **source historique** ; sa candidate `000271` ne doit plus jamais être intégrée telle quelle |

Aucune branche n'a été supprimée, aucune fusion effectuée, aucun worktree ni stash retiré.

---

## 11. Procédure de reprise

```bash
cd /Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/train-v2-reserves-gp
git log --oneline -7          # 7 commits depuis 4f1f170
npm run verify:migrations     # attendu : 272 migrations valides
```

Recette SQL (le CLI Supabase étant hors service, voir P1-2) :

```bash
source /Volumes/ELSATIA-DEV/ELSATIA-STACKS/train-v2-dbtest/harness.sh
bash /Volumes/ELSATIA-DEV/ELSATIA-STACKS/train-v2-dbtest/scenarios2.sh   # fresh + 3 upgrades
bash /Volumes/ELSATIA-DEV/ELSATIA-STACKS/train-v2-dbtest/pgtap.sh tv2-s1 # 68 suites pgTAP
```

Le harnais, le prélude de socle et les journaux sont conservés dans
`/Volumes/ELSATIA-DEV/ELSATIA-STACKS/train-v2-dbtest/` — hors du dépôt, donc non commités.

Reste à faire avant de considérer le lot clos :

1. rejouer les **E2E offline** sur une machine où le CLI Supabase fonctionne (P1-1) ;
2. arbitrer **P2-2** (`grant delete` vs assertion pgTAP) ;
3. décider si le train doit devenir globalement rejouable (**P2-1**) ;
4. reprendre les P0 de cutover déjà ouverts : relecture du ledger Production en direct,
   sauvegardes datées et restauration vérifiée, fenêtre et responsable nommés.

---

## 12. Commits du lot

| SHA | Objet | Auteur |
|---|---|---|
| `c8574a6` | surcharge tracée de l'adresse de renvoi (cherry-pick de `12909d39`) | premier passage |
| `bcf74bb` | consigne le SHA du lot renvoi (cherry-pick de `253d23e`) | premier passage |
| `edd349e` | code hors-ligne Réserves V5, sans sa migration candidate | premier passage |
| `8316a38` | migration canonique **273** — idempotence hors-ligne Réserves | premier passage |
| `bfb5e7b` | migration canonique **274** — champs clients légaux | ce passage |
| `86e4825` | activation de l'identité légale et branchement des validateurs partagés | ce passage |
| `f88dd16` | sortie de `lireIdentiteLegale` du module Server Actions (correctif de build) | ce passage |
