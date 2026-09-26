# ELSATIA — Runbook du jour J, cutover Gestion Pro (V1)

**Lot :** `ELSATIA-GP-CUTOVER-DOCUMENTATION-CLOSURE-V1` — 2026-09-06
**Statut : SOURCE UNIQUE OPÉRATOIRE.** En cas de divergence avec n'importe quel autre document
du dépôt, **c'est ce document qui fait foi**. Index des documents cutover et de leur statut :
`docs/runbooks/INDEX_CUTOVER_GP_V1.md`.

---

## Fiche cible — à relire à voix haute avant d'ouvrir la fenêtre

```
CUTOVER TARGET:
996be15c136f09d9977375e700462b503a1720c3

LEDGER:
210 → 263

MIGRATIONS:
53

POINT OF NO RETURN:
20260902000255_acl_reconciliation_v1

PRODUCTION BRANCH:
release/commercialisation-v1

HOTFIX AFTER VALIDATION:
7ba62c5315213bf21b9ed8553408fc678e943327
```

**Aucun autre SHA n'est une cible de déploiement.** `1d15289`, `b371641`, `a81f317`, `c1930ab`
apparaissent dans les documents historiques pour expliquer la **filiation** de la cible : ce sont
d'anciennes cibles annoncées, **jamais des cibles à déployer**. `996be15` est un commit
documentation-only assis au-dessus de `1d15289` — l'arbre applicatif est identique, mais **seul
`996be15` est le SHA contractuel du cutover**.

| Repère | Valeur canonique | Vérification |
|---|---|---|
| SHA applicatif cible | `996be15c136f09d9977375e700462b503a1720c3` | HEAD de `feat/elsatia-commercial-canonical-r1-r2-r3-v1` |
| Ledger Production (dernière vérité connue) | **210** (dernière version `…000231`) | **à relire en direct à T-60 — jamais supposé** |
| Ledger cible | **263** (dernière version `…000265`) | `verify:migrations` = « 263 migrations valides » |
| Migrations à appliquer | **53** | `versions(996be15) − versions(Production)` |
| Nature du gap | **append-only** — 0 migration historique modifiée | `git diff --name-status 5777abb 996be15 -- supabase/migrations/` → 53 A, 0 M, 0 D |
| Point de non-retour | `20260902000255_acl_reconciliation_v1` | §T0 ci-dessous |
| Production Branch Vercel | `release/commercialisation-v1` — **inchangée** | ne jamais basculer sur `main`, `feat/*`, `integration/*` |
| SHA Production actuel | `fcdd4e7c90f32abb15502e825335659f9d57c9a1` | `git ls-remote --heads origin` à T-60 |
| Hotfix pilote post-cutover | `7ba62c5315213bf21b9ed8553408fc678e943327` | promu **après** validation Production, **jamais pendant** |

---

## Rôles — à renseigner par Julien avant T0

**Aucun nom n'est présupposé.** Une personne peut cumuler plusieurs rôles.

| Rôle | Périmètre | Nom | Joignable jusqu'à |
|---|---|---|---|
| **A** — opérateur Git / Vercel | `fetch`, revalidation `origin`, promotion fast-forward, déploiement Vercel, variables d'environnement | `À RENSEIGNER PAR JULIEN` | |
| **B** — opérateur Supabase | lecture ledger, sauvegardes, application des migrations, registry Ed25519, pgTAP | `À RENSEIGNER PAR JULIEN` | |
| **C** — responsable rollback | pilote la restauration DB + le redéploiement coordonné si le rollback est déclenché | `À RENSEIGNER PAR JULIEN` | |
| **D** — validation fonctionnelle | smokes MFA, multitenant, Colors, Tools, Stripe TEST — rapporte PASS/FAIL, ne corrige pas, ne décide pas | `À RENSEIGNER PAR JULIEN` | |
| **E** — second admin `total` / MFA | prouve l'accès admin de secours, indépendant de l'admin principal | `À RENSEIGNER PAR JULIEN` | |
| **Décideur GO/NO-GO** | seule autorité habilitée à dire GO, STOP ou ROLLBACK aux gates T-45 / T0 / T+20 / T+60 | `À RENSEIGNER PAR JULIEN` | |

> ⛔ **VERROU RÔLE C — la fenêtre ne s'ouvre pas sans lui.**
> Le rôle **C** doit être **nommément identifié et joignable avant T0**, même s'il est cumulé
> avec un autre rôle. Il n'existe aucune dérogation : sans un nom écrit dans la case C, le gate
> T0 est **NO-GO** et aucune migration n'est appliquée. Motif : si l'incident survient pendant
> que le décideur est occupé ailleurs, il ne doit y avoir **aucune ambiguïté sur « qui restaure »**.

**Correspondance avec l'ancienne nomenclature** (préflight §14.3, à ne pas lire comme une
contradiction) : l'ancien « A — opérateur technique » est scindé ici en **A (Git/Vercel)** et
**B (Supabase)** ; l'ancien « B — responsable GO/NO-GO » devient la ligne **Décideur GO/NO-GO** ;
C, D et E sont inchangés.

---

## Déroulé chronologique

Chaque ligne : **action**, **attendu**, **GO/STOP**, **responsable**, **preuve à archiver**.
Les repères horaires sont des **cibles d'ordre**, pas des engagements de durée : si un palier
déborde, les suivants glissent — on ne saute jamais une vérification.

---

### J-1 — Prérequis hors fenêtre (aucune Production touchée)

| # | Action | Attendu | GO/STOP | Resp. | Preuve |
|---|---|---|---|---|---|
| J-1.1 | **Vérifier le plan Supabase du projet Production** `exhvuzegsefmoguxoiak` : PITR ou snapshot managé **disponible ET restaurable** | Capacité de restauration **constatée sur le plan du projet** | **STOP si non constaté** | B | Capture/notes du plan et de la rétention |
| J-1.2 | Vérifier l'accès Vercel au projet Production et l'accès au volume DR chiffré | Accès effectifs, volume montable | STOP | A + C | Notes |
| J-1.3 | Renseigner date/heure UTC de la fenêtre et **les noms des rôles A/B/C/D/E + Décideur** | Toutes les cases remplies, **C nommé** | **STOP si C vide** | Julien | Ce document renseigné |
| J-1.4 | Imprimer / ouvrir **ce document** comme unique support | Aucun autre document opératoire ouvert | — | A | — |
| J-1.5 | `node scripts/verify-cutover-docs.mjs` | `PASS` — cohérence documentaire vérifiée | STOP si FAIL | A | Sortie console |

> **§ Supabase Pro / PITR — condition d'ouverture.** Le dépôt ne contient **aucune preuve** que
> le projet Production dispose d'un plan permettant PITR ou snapshot managé. La seule mention
> existante est **budgétaire et prévisionnelle** (`docs/BUDGET_MISE_EN_SERVICE.md` : « Supabase
> Pro — 25 $/mois »). **Un prévisionnel n'est pas une preuve.**
> **Statut : À VÉRIFIER PAR L'OPÉRATEUR.** Sans capacité de restauration constatée, P0-3 est
> infaisable et la stratégie de rollback B est indisponible : **la fenêtre ne s'ouvre pas.**
>
> ⚠ **Ne pas confondre les deux mécanismes — ils n'offrent pas la même garantie.**
>
> | Mécanisme | Ce qu'il donne | Inclus ? |
> |---|---|---|
> | **Sauvegarde managée quotidienne** (plan Pro) | 1 point de restauration par jour, rétention 7 jours | inclus dans Supabase Pro (25 $/mois, `docs/BUDGET_MISE_EN_SERVICE.md`) |
> | **PITR** — restauration à la seconde | un point de restauration **pris à T-30**, donc immédiatement avant les migrations | **option payante séparée, non incluse par défaut** |
>
> Le runbook de rollback suppose un **snapshot pris à T-30**. Une sauvegarde quotidienne
> n'en fournit pas : au mieux elle ramène à la nuit précédente, c'est-à-dire avec **perte des
> écritures métier de la journée**. L'opérateur doit donc trancher explicitement à J-1 :
>
> ☐ **PITR actif** → snapshot T-30 réel, rollback conforme au runbook
> ☐ **Sauvegarde quotidienne seule** → le point de restauration disponible est celui de la nuit
>   précédente. Ce niveau de garantie doit être **accepté explicitement par le décideur avant
>   T0**, ou la fenêtre est reportée jusqu'à activation du PITR. **Ne pas découvrir ce point
>   pendant l'incident.**

---

### T-60 — Gel, revalidation Git, baseline Production

| # | Action | Attendu | GO/STOP | Resp. | Preuve |
|---|---|---|---|---|---|
| T-60.1 | Gel : aucun merge, aucun déploiement concurrent sur la branche canonique | Gel annoncé et effectif | — | A | Message de gel |
| T-60.2 | Rôles A/B/C/D/E présents ou joignables ; **C confirmé présent** | Tous joignables | **STOP si C absent** | Décideur | Ce document |
| T-60.3 | **`git fetch origin`** puis `git ls-remote --heads origin` | `origin/release/commercialisation-v1` = `fcdd4e7c…` ; `feat/elsatia-commercial-canonical-r1-r2-r3-v1` = `996be15…` | STOP si différent | A | Sortie `ls-remote` |
| T-60.4 | Vérifier le fast-forward strict : `git merge-base --is-ancestor origin/release/commercialisation-v1 996be15…` | **vrai** (code de retour 0) | STOP si faux | A | Sortie commande |
| T-60.5 | Confirmer Production Branch Vercel = `release/commercialisation-v1` | Inchangée, **≠ `main`**, **≠ `feat/*`**, **≠ `integration/*`** | STOP | A | Capture réglage Vercel |
| T-60.6 | **P0-1 — lecture baseline Production** (lecture seule, voir carte P0-1) | Ledger, `max(version)`, sentinelles, absence de `…000255` | — | B | **Sortie brute archivée** |
| T-60.7 | Calculer `versions(996be15) − versions(Production)` → liste d'application ordonnée | Liste ordonnée, **53 entrées attendues** | — | B | Liste archivée |

> ⚠ **Ref locale périmée — piège connu.** La branche **locale** `release/commercialisation-v1`
> peut être en retard sur `origin` : constaté le 2026-09-05 à `8fe737e`, soit **3 commits en
> retard** sur `fcdd4e7c` (elle en est un ancêtre, pas une divergence — mais elle n'est pas la
> vérité déployée). **Ne jamais utiliser la ref locale comme vérité sans `git fetch origin`
> préalable.** La promotion se fait depuis `origin/release/commercialisation-v1` revalidé, jamais
> depuis un local non resynchronisé, et **jamais avec `--force`**.

---

### T-45 — GATE P0-1

| # | Action | Attendu | GO/STOP | Resp. | Preuve |
|---|---|---|---|---|---|
| T-45.1 | Confronter la baseline lue aux valeurs canoniques | Ledger observé **210**, dernière version `…000231`, `…000255` **absente** | **GO/STOP** | Décideur | Sortie P0-1 |
| T-45.2 | **Figer le gap** | **53** migrations (valeur canonique : 263 − 210). Noter la valeur **observée** ; tout écart doit être expliqué avant de continuer | **GO/STOP** | Décideur | Gap écrit et archivé |

> **La seule valeur de gap utilisable est 53.** Les valeurs **50 / 51 sont périmées** : elles
> correspondent à d'anciennes cibles (ledger 261 / SHA `c1930ab`) et n'ont plus cours. Si un
> document affiche 50 ou 51 comme gap attendu, **il est obsolète — ne pas l'utiliser**.

**Un seul item KO → STOP. Fenêtre annulée, rien n'est touché.**

---

### T-30 — Sauvegardes (P0-3)

| # | Action | Attendu | GO/STOP | Resp. | Preuve |
|---|---|---|---|---|---|
| T-30.1 | Déclencher le **PITR / snapshot managé** Production | Id + horodatage UTC notés, **restaurabilité vérifiée**, rétention ≥ T0 + 24 h | STOP | B | Id + horodatage |
| T-30.2 | `pg_dump` format custom `--compress=9` → **volume DR chiffré uniquement** | SHA-256 calculé **puis relu** ; jamais de fichier en clair hors volume | STOP | B | Manifeste (taille, SHA-256, TOC count, `backup_id`) |
| T-30.3 | Backup Storage chiffré — **13 buckets** | `verify-storage-backup` PASS, SHA-256 par objet | STOP | B | Manifeste Storage |
| T-30.4 | Relier les manifestes DB + Storage au **même `backup_id`** | Horodatage UTC commun | STOP | B | Manifeste lien |
| T-30.5 | Archiver l'état : ledger (210 attendu), inventaire ACL (`aclexplode` + policies), inventaire admins plateforme, état MFA | Archivés sur le volume DR | — | B | Fichiers d'inventaire |

---

### T-15 — Preuve de restauration

| # | Action | Attendu | GO/STOP | Resp. | Preuve |
|---|---|---|---|---|---|
| T-15.1 | Restaurer le **dump Production chiffré** sur une **base probe jetable** (jamais Preview, jamais Production) | Restauration aboutie | STOP | B | Log de restauration |
| T-15.2 | Comparer les sentinelles avant/après | Sentinelles **identiques**, ledger `…|210|…` exact | **STOP si écart** | B | Sortie comparée |

---

### T0 — GATE GO/NO-GO migration, puis application

**Aucune écriture Production avant que la carte T0 soit intégralement cochée.**

| # | Action | Attendu | GO/STOP | Resp. | Preuve |
|---|---|---|---|---|---|
| T0.1 | Carte **GO-T0** complète (ci-dessous) | Toutes les cases cochées | **GO/NO-GO** | Décideur | Carte signée |
| T0.2 | Appliquer **uniquement** la liste calculée en T-60.7, **ordre lexical strict** du nom de fichier | 53 migrations appliquées, 0 erreur | — | B | Log CLI complet |
| T0.3 | Commande canonique : `supabase migration up --linked --include-all` | Le flag **`--include-all` est REQUIS** | — | B | Log CLI |

> ⛔ **POINT DE NON-RETOUR — `20260902000255_acl_reconciliation_v1`.**
> - **Avant** son application : un rollback frontend seul reste possible selon l'état atteint.
> - **Après** son application : **le rollback code seul est INTERDIT** — il ne suffit plus et ne
>   restaure pas un état cohérent. Le rollback devient obligatoirement :
>   **restauration DB du snapshot T-30 + redéploiement du frontend compatible (`fcdd4e7c`)**,
>   les deux ensemble, jamais l'un sans l'autre.
> - Les migrations 256 → 263 **ne déplacent pas** ce point (append-only, sans REVOKE large
>   supplémentaire) ; elles élargissent seulement le schéma que seul `996be15` sait exploiter.

> **Pourquoi `--include-all` est obligatoire.** Plusieurs migrations du gap portent un
> **horodatage antérieur au `max(version)` déjà présent** sur Production (migrations historiques
> réintégrées par la canonicalisation v2). Sans ce flag, la CLI les rejette — comportement
> confirmé pendant le drill offline dans exactement le même scénario. **Ne jamais remplacer cette
> commande par une variante susceptible d'en sauter**, ne jamais appliquer une migration hors de
> la liste, dans le désordre, ou par édition manuelle du ledger.

---

### T+10 — Contrôles ledger

| # | Action | Attendu | GO/STOP | Resp. | Preuve |
|---|---|---|---|---|---|
| T+10.1 | Lire le ledger | **263**, aucune collision d'horodatage | STOP | B | Sortie `count`/`max` |
| T+10.2 | Vérifier la présence de `20260902000255_acl_reconciliation_v1` | Présente | STOP | B | Sortie |
| T+10.3 | Vérifier la présence de `20260904000263_stripe_subscription_lifecycle_closure_v1` | Présente | STOP | B | Sortie |
| T+10.4 | Rejouer `supabase migration up` une seconde fois | **`applied: []`** — rien à appliquer | **STOP si non vide** | B | Sortie |
| T+10.5 | **Ed25519 étape C+D** : confirmer `…000244` et `…000245` présentes au ledger, **puis seulement** remplir le registry | Registry rempli **après** le ledger, jamais avant | STOP | B | Sortie ledger + confirmation registry |

---

### T+20 — GATE point de décision migration

| # | Action | Attendu | GO/STOP | Resp. | Preuve |
|---|---|---|---|---|---|
| T+20.1 | pgTAP critique | PASS | **GO/ROLLBACK** | B | Sortie pgTAP |
| T+20.2 | Smoke SQL sentinelles | **Inchangées** | **GO/ROLLBACK** | B | Sortie comparée |
| T+20.3 | Décision : continuer vers le déploiement, ou STOP + rollback DB | Décision écrite | **GO/ROLLBACK** | Décideur | Décision consignée |

**Ledger incohérent (≠ 263 propre, collision d'horodatage) → STOP, restaurer le snapshot.**

---

### T+30 — Promotion et déploiement

| # | Action | Attendu | GO/STOP | Resp. | Preuve |
|---|---|---|---|---|---|
| T+30.1 | Re-`fetch` et re-vérifier `origin/release/commercialisation-v1` = `fcdd4e7c` | Inchangé depuis T-60 | STOP si modifié | A | Sortie `ls-remote` |
| T+30.2 | **Promouvoir `996be15` dans `release/commercialisation-v1` en fast-forward strict** | Avance FF pure, **aucun commit de merge**, **jamais `--force`** | STOP | A | Sortie `git push` |
| T+30.3 | Déployer `release/commercialisation-v1` sur Vercel Production | Build vert, déploiement promu | STOP | A | Id de déploiement |
| T+30.4 | Confirmer que la **Production Branch n'a pas été modifiée** | Toujours `release/commercialisation-v1` | STOP | A | Capture Vercel |
| T+30.5 | Premiers contrôles : login, absence de 5xx critique, **absence de boucle de redirection**, `/abonnement`, dashboard, chantier, stock, `/abonnement/module-non-inclus` | Tous nominaux | STOP | D | Notes + captures |

---

### T+45 — Smokes fonctionnels

> **Aucun de ces smokes n'a été exécuté à `996be15`** : ils exigent la Production migrée et les
> habilitations réelles. Ils sont donc **à exécuter pendant la fenêtre**, sans exception.

| # | Action | Attendu | GO/STOP | Resp. | Preuve |
|---|---|---|---|---|---|
| T+45.1 | **MFA** : login AAL1 → challenge TOTP → AAL2 → `/plateforme` → logout/relogin | Parcours complet | STOP | D + E | Notes |
| T+45.2 | Matrice de rôle : non-auth / AAL1 / AAL2 non-admin / AAL2 admin inactif / AAL2 admin `total` actif | Conforme | STOP | D | Notes |
| T+45.3 | **Admin de secours (E)** prouvé indépendamment de l'admin principal | Accès `total` confirmé | STOP | E | Notes |
| T+45.4 | **Multitenant** : entreprise A ne voit rien de B (tables, RPC, documents, Storage, habilitations apps, changement d'entreprise) | Aucune fuite | **STOP immédiat si fuite** | D | Notes |
| T+45.5 | **Colors** : login, contrat multi-app, accès entreprise, callback, cloisonnement des données | Login aboutit réellement | STOP | D | Notes |
| T+45.6 | **Tools** : login, compte partagé, contrat multi-app, callback, accès conforme au catalogue | Nominal | STOP | D | Notes |
| T+45.7 | **Stripe TEST** — carte P0 fenêtre item C | `livemode = false` | **STOP immédiat si `livemode = true`** | D | Observation consignée |
| T+45.8 | R1 compteur « personnes actives » X/Y sur `/abonnement` ; R3 section Modules ; R2 capacité +1/+5/+10 sur Stripe **TEST** | Nominal | STOP | D | Notes |

> **Ne pas ouvrir la facturation Tools.** Le billing Tools n'est pas provisionné en Production
> (P1-7) et **ne doit pas l'être pendant la fenêtre**. Ce cutover ne change aucune décision
> commerciale.

---

### T+60 — GATE GO/NO-GO global

| # | Action | Attendu | GO/STOP | Resp. | Preuve |
|---|---|---|---|---|---|
| T+60.1 | Revue de toutes les lignes ci-dessus | Toutes PASS | **GO/ROLLBACK** | Décideur | Ce document renseigné |
| T+60.2 | Carte **P0 fenêtre** (A Ed25519 / B flags / C mode Stripe) intégralement cochée | 3 items PASS | **Un seul ☐ non coché → NO-GO** | A + B + D | Carte signée |
| T+60.3 | **GO** → fin de maintenance active, ouverture du service (**la souscription payante reste fermée**) | Service ouvert | — | Décideur | Décision consignée |
| T+60.4 | **ROLLBACK** → procédure engagée immédiatement | Restauration snapshot T-30 **+** redéploiement `fcdd4e7c`, coordonnés | — | C | Log de rollback |

---

### T+90 → T+120 — Surveillance et clôture

| # | Action | Attendu | GO/STOP | Resp. | Preuve |
|---|---|---|---|---|---|
| T+90.1 | Surveillance rapprochée : Sentry, 5xx, login/MFA réels, webhooks Stripe TEST, upload/download, RLS | Aucune anomalie | — | D | Relevés |
| T+90.2 | Conserver PITR/snapshot, dump chiffré, backup Storage, hashes, inventaires ACL/admins/MFA, état Stripe | Tout conservé | — | B | Volume DR |
| T+120.1 | Bilan écrit, décision de lever le gel (si GO) ou plan de reprise (si rollback), compte-rendu | Bilan produit | — | Décideur | Bilan |

---

### Post-cutover — Hotfix pilote `7ba62c`

**Ordre imposé, sans variante.** La branche `integration/gp-postcutover-pilot-hotfix-v1`
**n'est pas** la cible du cutover initial.

| # | Action | Attendu | GO/STOP | Resp. | Preuve |
|---|---|---|---|---|---|
| PC.1 | Validation Production du cutover complète et stable | Contrôles nominaux du présent document tous PASS | STOP | Décideur | Ce document |
| PC.2 | **Lever la réserve pgTAP** : démarrer Docker, puis `npm run db:start && npm run test:db` | **PASS exigé.** Aucun résultat n'est revendiqué à ce jour — le lot hotfix n'a jamais pu exécuter `supabase test db` (démon Docker injoignable) | **STOP si non exécuté** | B | Sortie pgTAP |
| PC.3 | Promouvoir `7ba62c` | **Déploiement applicatif seul — aucune migration, ledger reste 263 de bout en bout** | STOP | A | Sortie `git push` + id déploiement |
| PC.4 | **Reprendre la documentation finale** : `docs/gp-cutover-documentation-closure-on-hotfix-v1` | La lignée de release ne doit **pas** réhériter d'une checklist périmée (voir encadré ci-dessous) | STOP | A | Diff docs |
| PC.5 | Ouverture du premier pilote | — | Décideur | — | — |

> **Piège documentaire du hotfix — traité.** `7ba62c` descend de `996be15` mais **pas** des
> commits de runbook `aabe612` / `35d2d2b` : il transporte donc encore la checklist périmée qui
> annonce `1d15289` comme cible. Sans précaution, **promouvoir le hotfix réintroduirait cette
> checklist périmée dans la lignée de release.**
> La branche **`docs/gp-cutover-documentation-closure-on-hotfix-v1`** porte exactement la
> documentation finale de ce lot, **rebasée sur `7ba62c`, sans aucune modification de runtime ni
> de migration**. C'est elle qu'il faut reprendre à l'étape PC.4.

---

## Carte P0-1 — baseline Production (T-60, lecture seule)

Aucune valeur secrète n'est imprimée, aucun QR/seed/code TOTP n'est lu ou consigné.

☐ Ref Production confirmée (`exhvuzegsefmoguxoiak`)
☐ Ledger lu : `count = ____`  `max(version) = ____________`
☐ `…000255_acl_reconciliation_v1` **absente** (attendu)
☐ Gap vers 263 calculé : `____` migrations (**attendu 53**) — noter la valeur observée, ne pas supposer
☐ Sentinelles (entreprises / utilisateurs / clients / chantiers / devis / factures) cohérentes avec le dernier snapshot DR connu
☐ Admins plateforme listés (email / rôle / actif / statut) — au moins 1 `total` actif
☐ État MFA des admins vérifié (facteurs enrôlés / vérifiés)
☐ Aucune anomalie inattendue (schéma / rôle / extension)

**Un seul ☐ non coché → STOP, ne pas passer à T-30.**

---

## Carte GO-T0 — avant toute écriture

☐ **Rôle C nommé et présent** ☐ Décideur GO/NO-GO présent
☐ P0-1 PASS ☐ Gap figé à **53** ☐ P0-3 PASS (restauration prouvée à T-15)
☐ Plan Supabase : PITR / snapshot managé **vérifié restaurable** (J-1.1) — et **niveau de garantie tranché** : PITR actif (snapshot T-30 réel), ou sauvegarde quotidienne seule **explicitement acceptée par le décideur**
☐ `git fetch origin` fait ; `origin/release/commercialisation-v1` = `fcdd4e7c`
☐ `git merge-base --is-ancestor origin/release/commercialisation-v1 996be15` → **vrai** (fast-forward strict, **jamais `--force`**)
☐ ⚠ Ref **locale** `release/commercialisation-v1` **non utilisée** sans resynchronisation (constatée 3 commits en retard le 2026-09-05)
☐ Production Branch Vercel = `release/commercialisation-v1`, **inchangée** (**≠ `main`**, **≠ `feat/*`**, **≠ `integration/*`**)
☐ SHA `996be15` prêt à promouvoir

**Variables — présence par nom uniquement, aucun secret affiché :**

☐ `ABONNEMENTS_PUBLICS_OUVERTS=false`
☐ `FEATURE_BOUTIQUE_ENABLED=false` — ⚠ **fail-open** : son absence l'**active**, la poser explicitement
☐ `FEATURE_CRONS_ENABLED=false` — ⚠ **fail-open** : son absence l'**active**, la poser explicitement
☐ `DISABLE_EMAIL_LOGIN=false`
☐ `ELSATIA_APPLICATION_ENV=production`
☐ `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` présente — **seule** clé publique lue, l'app jette sans elle. **Ne pas chercher `NEXT_PUBLIC_SUPABASE_ANON_KEY`** (non consommée à `996be15`)
☐ `SUPABASE_PROJECT_REF=exhvuzegsefmoguxoiak` cohérent avec l'hôte de `NEXT_PUBLIC_SUPABASE_URL`
☐ `ELSATIA_SUPABASE_PROJECT_NAME=elsatia-production`
☐ `NEXT_PUBLIC_LEGAL_SIRET` renseignée (`850 559 873 00011`, déjà provisionnée et vérifiée)
☐ `NEXT_PUBLIC_LEGAL_TVA` laissée **vide** tant que le régime n'est pas arbitré (repli neutre, P1-6)
☐ `STRIPE_WEBHOOK_EXPECTED_MODE=test` (valeur lisible)
☐ Mode de la clé Stripe : **non vérifiable ici** → reporté au smoke T+45 (carte P0 fenêtre, item C)
☐ Aucun secret **obligatoire** manquant
☐ Variables Vercel Ed25519 provisionnées — **registry DB seulement après T+10.5**
☐ Second admin MFA (E) joignable
☐ Aucun incident Production en cours (monitoring vérifié)

**Un seul ☐ non coché → NO-GO, ne pas migrer.**

---

## Carte P0 fenêtre — environnement (exactement 3 items)

> ⚠ **Variables Vercel de type `sensitive`.** 27 des 46 variables de `elsatia-production` sont
> `sensitive` : leur valeur est **irrécupérable**, y compris via `vercel env pull`. Cela couvre
> les vrais secrets **et** `FEATURE_AI_ENABLED`, `FEATURE_AI_DEVIS_ENABLED`,
> `FEATURE_RELANCES_AUTO_ENABLED`, `STRIPE_SECRET_KEY`, tous les `STRIPE_PRICE_*`,
> `SUPPORT_EMAIL`, `EMAIL_FROM_ADDRESS`.
> **Ne jamais prétendre les « vérifier » par lecture. Ne jamais afficher un secret pour contrôler.**
> Les seules actions légitimes : **réaffirmation explicite**, ou **smoke de comportement**.

### A — Ed25519 : ordre strict, jamais inversé

1. ☐ **Variables Vercel disponibles au plus tard à T0** : `STRIPE_STATE_ATTESTATION_KEY_ID` et
   `STRIPE_STATE_ATTESTATION_PRIVATE_KEY_B64` (Vercel **uniquement** — jamais dans un document,
   un dump ou un log)
2. ☐ **Appliquer les migrations** (T0)
3. ☐ **Confirmer `…000244` et `…000245` présentes au ledger** (T+10.5)
4. ☐ **Seulement ensuite** : remplir `stripe_attestation.configuration` puis
   `stripe_attestation.public_keys` avec `environment = 'test'`
5. ☐ Correspondance `key_id` ↔ clé publique relue et confirmée identique à celle provisionnée dans Vercel
6. ☐ Fichier local contenant la clé privée supprimé

> ⛔ **JAMAIS de registry avant les migrations.**
> ⛔ **JAMAIS de réutilisation du couple `test` pour Live.** Le couple `live` est généré
> séparément au lot P15, avec son propre `key_id` et sa propre ligne `environment = 'live'`.

### B — Réaffirmer les 3 flags non relisibles (réécrire, ne pas « vérifier »)

☐ `FEATURE_AI_ENABLED=false`
☐ `FEATURE_AI_DEVIS_ENABLED=false`
☐ `FEATURE_RELANCES_AUTO_ENABLED=false`

Le fail-closed du code protège contre l'**absence**, pas contre un `true` posé par erreur — et la
valeur n'est pas relisible. **La seule action valide est la réécriture explicite.**

### C — Confirmer le mode Stripe par smoke contrôlé (T+45)

☐ Observation 1 : session Checkout de recette → **`livemode = false`**
☐ Observation 2 : saga de remise attestée cohérente avec le registry `environment = 'test'`
☐ Mode conclu = `test`, les deux observations **concordantes**
☐ Aucune valeur de clé affichée, copiée ou journalisée

> ⛔ **`livemode = true` → STOP IMMÉDIAT.** Pendant tout le cutover, Production reste en
> **mode TEST uniquement**. Aucune clé `sk_live_`, aucun Price Live, aucun webhook Live créé, lu
> ou modifié. **Aucune activation Live, en aucun cas.** Le passage Live est le **lot P15**,
> distinct et hors périmètre, et il exige par ailleurs le KYC Stripe et l'arbitrage du régime de TVA.

**Un seul ☐ non coché sur A, B ou C → NO-GO à T+60.**

---

## Dépendance Colors — ce que le cutover débloque, et ce qu'il reste à faire

**Colors login dépend du ledger 263.** C'est la seule dépendance Colors de ce lot ; **aucun code
Colors n'est intégré ni modifié ici.**

Aujourd'hui, Colors Production est un mur de connexion sans application derrière :
`signInWithPassword` réussit, puis `contexte_application_courant` / `a_acces_application`
n'existent pas au ledger 210 → l'appel échoue → `signOut()` → retour `/login`. Les objets requis
sont apportés par les migrations `…000234` (socle multi-app), `…000246` à `…000249` (cœur Colors,
bucket privé, intégrité, sécurité) — toutes dans le gap de 53.

**Après le cutover, dans cet ordre :**

1. ☐ **Activation entreprise** — accès à l'application Colors ouvert pour l'entreprise concernée
2. ☐ **Habilitation utilisateur** — habilitation applicative posée pour le ou les comptes visés
3. ☐ **Déploiement canonique Colors** — la version canonique de Colors est déployée
4. ☐ **Smoke** — login réel, contrat multi-app, callback, cloisonnement des données

> Réserve connue à porter au smoke : **ELSATIA Tools n'est pas dans le catalogue
> `applications_elsatia`** (seuls `gestion_pro` et `colors` y sont insérés). Le sélecteur
> d'applications de Colors ne proposera donc pas Tools après le cutover.

---

## Note — lot GLOBAL OWNER ALL APPS (`julien@elsatia.fr`)

Une décision produit récente prévoit que **`julien@elsatia.fr` devienne propriétaire global
ELSATIA, avec accès à toutes les applications actuelles et futures**.

**Le lot GLOBAL OWNER ALL APPS doit être appliqué selon son ordre canonique post-cutover, sauf
décision contraire issue de son audit.**

État constaté au 2026-09-06, sans interprétation :

- Ce lot **n'est pas en Production**, et rien dans ce document ne prétend le contraire.
- La branche `feat/gp-global-owner-all-apps-access-v1` existe localement mais **ne porte aucun
  commit propre** : elle pointe exactement sur `7ba62c`. Le lot n'est **pas implémenté**.
- La seule chose acquise côté Production-cible est la migration `20260825000233`, qui déclare
  `julien@elsatia.fr` **administrateur plateforme** (`role = 'total'`) — c'est un rôle plateforme,
  **pas** une propriété globale multi-applications. Cette migration fait partie du gap de 53
  (présente dans l'arbre `fcdd4e7c` mais **jamais appliquée** : elle explique l'écart 211 fichiers
  / 210 versions au ledger).
- **Ce lot est documentaire** : aucune migration, aucune logique d'accès, aucun code applicatif
  n'est modifié ici au titre du GLOBAL OWNER.

---

## Interdictions permanentes pendant la fenêtre

- Aucune activation Stripe **Live**, aucune clé `sk_live_`, aucun Price ou webhook Live.
- Aucun secret affiché, copié ou journalisé — **noms de variables uniquement**.
- Aucune modification des migrations, aucune édition manuelle du ledger.
- Aucune bascule de la **Production Branch** Vercel.
- Aucun `--force` sur `release/commercialisation-v1`.
- Aucun `DELETE FROM auth.mfa_factors` manuel : le déblocage MFA passe par la procédure de
  ré-enrôlement TOTP documentée.
- Aucun provisionnement du billing Tools.
- Aucune ouverture de la souscription payante : `ABONNEMENTS_PUBLICS_OUVERTS` reste `false`.

---

## Références détaillées (non opératoires — ce document prime)

| Sujet | Document |
|---|---|
| Détail de chaque étape, preuves, fiche variables complète | `docs/runbooks/ELSATIA_PRODUCTION_CUTOVER_PREFLIGHT_FINAL_V1.md` |
| Procédure de rollback détaillée, stratégies A/B/C | `docs/runbooks/ELSATIA_PRODUCTION_ROLLBACK_V1.md` |
| Provisioning Ed25519, formats et commandes exactes | `docs/runbooks/ELSATIA_ED25519_ATTESTATION_PROVISIONING_V1.md` |
| Gouvernance des branches et Production Branch | `docs/runbooks/ELSATIA_RELEASE_GOVERNANCE_V1.md` |
| Statut de chaque document cutover | `docs/runbooks/INDEX_CUTOVER_GP_V1.md` |
| Contrôle automatique de cohérence documentaire | `node scripts/verify-cutover-docs.mjs` |

---

Notes / incidents pendant la fenêtre :

_____________________________________________________________________________

_____________________________________________________________________________

_____________________________________________________________________________
