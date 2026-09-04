# ELSATIA — Gouvernance des branches et des releases

Version 1 — 2026-09-04. Lot `ELSATIA-GITHUB-VERCEL-RELEASE-GUARD-CLOSURE-V1`. **Documentation +
audit.** Aucun déploiement, aucune migration Production, aucun Stripe Live, aucune protection
GitHub appliquée automatiquement (limitation d'outillage expliquée au §7 — commandes prêtes à
exécuter par l'opérateur).

---

## 1. État constaté (audit, 2026-09-04)

Dépôt : `https://github.com/julien-gregurec/Appli_BTP` — **public**, branche par défaut GitHub :
`main`.

### 1.1 Protection des branches (lu via l'API GitHub publique, `GET /repos/.../branches/<nom>`)

| Branche | `protected` | Push direct | Force-push | Suppression | PR obligatoire | Status checks obligatoires | Bypass admin | Review obligatoire | Commits signés |
|---|---|---|---|---|---|---|---|---|---|
| `main` | **false** | possible | possible | possible | non | non | s.o. | non | non |
| `release/commercialisation-v1` | **false** | possible | possible | possible | non | non | s.o. | non | non |
| `feat/elsatia-commercial-canonical-r1-r2-r3-v1` | **false** | possible | possible | possible | non | non | s.o. | non | non |

**Aucune des trois branches n'est protégée.** Rulesets : aucun détecté via `GET
/repos/.../rulesets` (lecture non authentifiée — fiabilité de cette lecture spécifique
incertaine sans jeton ; à reconfirmer par Julien dans *Settings → Rules → Rulesets*).

### 1.2 Status checks disponibles (GitHub Actions)

Un seul workflow existe : **« Contrôles techniques »** (`.github/workflows/ci.yml`), état
`active`.

```yaml
on:
  pull_request:                       # sur toute PR, quelle que soit la branche cible
  push:
    branches: [main, release/commercialisation-v1]   # pas sur la branche commerciale canonique
  schedule: ["17 5 * * 1"]
  workflow_dispatch:

jobs:
  verification:                       # ← nom du job = nom du check
    steps:
      - actions/checkout@v4
      - actions/setup-node@v4 (Node 24)
      - npm ci
      - npm run audit:security        # npm audit --audit-level=high
      - npm run verify                # clean + typecheck + lint + test + verify:migrations
                                       # + verify:secrets + verify:stripe-prices + build
```

**Stabilité** : 30/30 des derniers runs = `success` (dernier déclenché le 2026-08-30, sur des
PR `pull_request` — aucun push récent sur `main`/`release/commercialisation-v1` depuis, donc
aucun run `push` récent, ce qui est normal vu l'activité actuelle concentrée sur la branche
commerciale canonique).

Le check GitHub Actions résultant s'appelle : **`Contrôles techniques / verification`** — c'est
le nom exact de contexte à exiger dans les règles de protection (§2).

### 1.3 Git integration Vercel — projet `elsatia-production`

- **Intégration Git active** : confirmée indirectement — l'historique de déploiements du projet
  contient de nombreuses entrées `Environment: Preview` avec alias `elsatia-production-git-<nom
  de branche>-<hash>.vercel.app`, généré automatiquement par Vercel uniquement quand un dépôt
  Git est connecté. Le dépôt lié n'a pas pu être confirmé par son nom exact via les commandes
  CLI disponibles (voir limite au §7).
- **Aucun déploiement récent avec `Environment: Production`** dans les ~30 dernières entrées
  (couvrant les dernières ~24 h, période où `feat/elsatia-commercial-canonical-r1-r2-r3-v1` a
  reçu plusieurs push de ce lot et des précédents). **Cela indique fortement que la Production
  Branch configurée n'est PAS `feat/elsatia-commercial-canonical-r1-r2-r3-v1`** : si elle
  l'était, chaque push de cette session aurait déclenché un déploiement `Environment:
  Production`, ce qui n'a jamais été observé.
- **Le déploiement Production actuellement en ligne** (`app.elsatia.fr`, id
  `dpl_D3VX5QNQHx6tt6q4H6hrUZef5zau`, créé le 2026-09-02) **ne porte aucune métadonnée Git** —
  cohérent avec un déploiement manuel (`vercel --prod` en CLI), exactement comme pour les
  projets `elsatia-colors`, `elsatia-tools` et `elsatia-site` audités dans les lots précédents.
- **Valeur exacte de « Production Branch » non confirmée** : la CLI Vercel n'expose pas ce
  champ en clair (ni `project inspect`, ni `--debug`, ni de flag `--json` sur cette commande).
  Le lire de façon certaine demande soit `gh`/un jeton GitHub avec accès API Vercel équivalent,
  soit une lecture directe du Dashboard. **Ce point reste un blocage de vérification, pas une
  action non faite** — voir procédure de vérification exacte au §4.4.

**Conclusion prudente** : rien ne prouve que Production Branch = `main`, et un faisceau
d'indices (aucun déploiement Production auto-déclenché malgré des dizaines de push sur la
branche canonique) suggère que ce n'est probablement pas le cas non plus — mais ceci **doit être
confirmé visuellement par Julien** avant de considérer le point fermé (§4.4 donne le chemin
exact).

---

## 2. Cible GitHub — règles à appliquer

### `main`

| Réglage | Valeur cible |
|---|---|
| Push direct | **interdit** (PR obligatoire) |
| Pull request obligatoire | **oui**, ≥ 1 approbation si un second réviseur existe un jour (0 acceptable en solo, mais garder l'option active) |
| Force-push | **interdit** |
| Suppression | **interdite** |
| Status checks obligatoires | `Contrôles techniques / verification` |
| Branches à jour avant merge | recommandé (`strict` status checks) |
| Conversation resolution | recommandé activé |
| Bypass admin (« Do not allow bypassing the above settings ») | **activé** — même le propriétaire passe par une PR |
| Commits signés | optionnel — P2, non bloquant |

### `release/commercialisation-v1`

| Réglage | Valeur cible |
|---|---|
| Force-push | **interdit** |
| Suppression | **interdite** |
| Push direct | toléré si c'est le flux actuel de promotion release (ne pas casser le workflow existant), mais **PR recommandée dès que possible** |
| Status checks | `Contrôles techniques / verification` si le flux passe par PR |

### `feat/elsatia-commercial-canonical-r1-r2-r3-v1`

| Réglage | Valeur cible |
|---|---|
| Force-push | **interdit** |
| Suppression | **interdite** |
| Push direct | **autorisé** — reste une branche de préparation active, le rythme de travail actuel (commits directs) ne doit pas être cassé |
| Status checks | non obligatoires ici (la validation se fait avant promotion vers `release/*`) |

Ces trois cibles respectent la contrainte « ne pas casser le workflow actuel » : seule `main`
devient réellement contraignante (PR + check obligatoires), les deux autres gagnent uniquement
une protection anti-destruction (pas de force-push, pas de suppression).

---

## 3. Status checks — ce qui est rendu obligatoire

**Un seul check existe et est stable : `Contrôles techniques / verification`** (30/30 succès
récents). C'est le seul rendu obligatoire, uniquement sur `main` (§2). Aucun check inexistant
n'est exigé — il n'y a pas de job séparé pour tests/typecheck/lint/build/migrations/secrets/audit
: ils sont tous agrégés dans le même job `verification` via `npm run verify` (qui inclut déjà
`verify:migrations`, `verify:secrets`, `verify:stripe-prices`) et `npm run audit:security`.

---

## 4. Vercel — Production Branch

### 4.1 Constat (voir §1.3)

Intégration Git active, Production Branch non lisible avec certitude via les outils disponibles
dans cette session, mais fortement suspectée de ne pas être la branche commerciale canonique
(aucun déploiement Production auto-déclenché malgré de nombreux push). Le déploiement Production
actuel en ligne a été fait manuellement (`vercel --prod`), pas par promotion Git automatique.

### 4.2 Risque si Production Branch = `main`

`main` porte encore l'ancienne marque **« Liria Gestion Pro V3 »**, une grille tarifaire
obsolète (69/199/399, annuel ×12) et ne contient ni MFA/AAL2, ni réconciliation ACL, ni R1/R2/R3,
ni le correctif de boucle post-login (voir `docs/organisation/NE_PAS_DEPLOYER_MAIN.md`). Si
Production Branch était `main` et qu'un jour quelqu'un pousse dessus (main n'étant aujourd'hui
protégée par rien, cf. §1.1), Vercel **redéploierait automatiquement cette ancienne base en
Production** sans aucune action de cutover délibérée. C'est le risque concret que ce lot doit
fermer.

### 4.3 Cible

Ne **jamais** avoir `main` comme Production Branch. La cible dépend de la stratégie retenue
(§5) : soit `release/commercialisation-v1` (branche de release historique, cohérente avec le nom
du projet Vercel `elsatia-production`), soit une future branche `release/*` dédiée créée au
moment du cutover réel, explicitement nommée dans le runbook de cutover
(`ELSATIA_PRODUCTION_CUTOVER_PREFLIGHT_FINAL_V1.md`).

**Aucun changement de Production Branch n'a été fait dans ce lot** — la valeur actuelle n'a pas
pu être lue avec certitude, et modifier un réglage sans être sûr de l'état de départ serait
irresponsable (cf. consigne « ne pas modifier sans expliquer l'impact d'abord »).

### 4.4 Procédure de vérification (à faire une fois, par Julien, ~2 minutes)

1. https://vercel.com/julien-gregurec1/elsatia-production/settings/git
2. Lire le champ **« Production Branch »**.
3. Si la valeur est `main` → **la changer immédiatement** pour `release/commercialisation-v1`
   (ou la branche de release retenue), en cochant qu'aucun redéploiement automatique intempestif
   n'est déclenché par ce changement seul (changer la Production Branch ne redéploie rien tant
   qu'aucun nouveau push n'arrive sur la nouvelle branche cible).
4. Si la valeur est déjà `release/commercialisation-v1` ou une autre branche de release
   explicite (pas `main`, pas la branche commerciale canonique) → **rien à faire**, le point est
   fermé.
5. Noter la valeur confirmée dans ce document (remplacer la ligne « à confirmer » ci-dessous).

**Résultat de la vérification (à compléter par Julien) : Production Branch = `______________`**
(constaté le ______).

---

## 5. Stratégie de release

```
développement (branche feature, ex. fix/*, feat/*)
        │  PR → check "Contrôles techniques / verification" (si ouverte contre main)
        ▼
QA locale (vitest, typecheck, lint, build, verify:secrets, npm audit)
        │
        ▼
branche commerciale canonique (feat/elsatia-commercial-canonical-r1-r2-r3-v1)
        │  cherry-pick / consolidation, SHA de référence noté à chaque étape
        ▼
validation cutover (drill Fresh/Restore, drift ACL, preuves offline — voir
ELSATIA_PRODUCTION_CUTOVER_PREFLIGHT_FINAL_V1.md)
        │
        ▼
branche release (release/commercialisation-v1, ou nouvelle release/* dédiée)
        │  merge/fast-forward du SHA canonique validé, jamais un rebase destructif
        ▼
déploiement Production (vercel --prod explicite, ou promotion automatique si
Production Branch = cette branche release ET que le push est délibéré)
```

Le **SHA exact déployé doit toujours être traçable** : chaque lot de ce projet documente déjà le
SHA applicatif de référence dans son rapport final (pratique à poursuivre). Avant tout
déploiement Production, vérifier :

```bash
git log -1 --oneline <branche-release>
git rev-parse <branche-release>
```

et comparer au SHA annoncé dans le runbook de cutover en vigueur.

### Interdits (rappel)

- Déployer depuis `main`.
- Déployer depuis un worktree non identifié (toujours vérifier `git rev-parse HEAD` et
  `git status` avant `vercel --prod`).
- Force-push d'une branche de release.
- Redéployer un ancien build sans revérifier son SHA exact (`vercel inspect <url>` → champ
  `created` + comparaison au SHA attendu).

### Qui peut déployer

Aujourd'hui : Julien uniquement (propriétaire du compte Vercel et du dépôt GitHub). Toute
exécution par un outil (Claude, Codex) reste soumise à une autorisation explicite, mission par
mission, jamais implicite.

---

## 6. Rollback

Rollback branche/SHA = revenir au dernier SHA connu-bon de la branche de release (`git log` sur
`release/commercialisation-v1` pour retrouver le SHA pré-incident), puis `vercel --prod` depuis
ce SHA exact (checkout ou worktree dédié), **jamais** un simple « rollback » Vercel one-click
sans vérifier la compatibilité DB (cf. `ELSATIA_PRODUCTION_ROLLBACK_V1.md` — le rollback code
seul est insuffisant après la migration `…000255`).

---

## 7. Limitation constatée dans ce lot

**Aucun outil `gh` (GitHub CLI) n'est installé dans cet environnement, et aucun jeton
d'authentification GitHub (`GH_TOKEN`/`GITHUB_TOKEN`) n'est disponible.** Le seul identifiant
GitHub présent est un identifiant Git stocké dans le trousseau macOS pour l'usage exclusif du
protocole `git` (push/pull) — je ne l'ai pas extrait ni réutilisé pour appeler l'API GitHub,
conformément à la règle de ne jamais manipuler un secret existant en dehors de son usage prévu.

**Conséquence** : l'audit (§1) a été fait intégralement via l'API GitHub **publique, non
authentifiée** (le dépôt étant public, `protected`, la liste des workflows et leur historique de
runs sont lisibles sans jeton) — fiable et vérifié. En revanche, **appliquer** les protections de
branche (§2) nécessite un accès en écriture à l'API, donc soit `gh` authentifié, soit un jeton
avec le scope `repo` (administration de branche).

### Commandes prêtes à l'exécution (à lancer par Julien, ou par un futur lot une fois `gh`
disponible)

```bash
# Installation (une fois) :
brew install gh
gh auth login   # flux navigateur, aucun jeton à copier-coller manuellement

# main — protection forte
gh api -X PUT repos/julien-gregurec/Appli_BTP/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  -f required_status_checks[strict]=true \
  -f 'required_status_checks[contexts][]=Contrôles techniques / verification' \
  -F enforce_admins=true \
  -f required_pull_request_reviews[required_approving_review_count]=0 \
  -F required_pull_request_reviews[dismiss_stale_reviews]=true \
  -f restrictions=null \
  -F allow_force_pushes=false \
  -F allow_deletions=false \
  -F required_conversation_resolution=true

# release/commercialisation-v1 — anti-destruction uniquement
gh api -X PUT "repos/julien-gregurec/Appli_BTP/branches/release%2Fcommercialisation-v1/protection" \
  -H "Accept: application/vnd.github+json" \
  -f required_status_checks=null \
  -F enforce_admins=false \
  -f required_pull_request_reviews=null \
  -f restrictions=null \
  -F allow_force_pushes=false \
  -F allow_deletions=false

# feat/elsatia-commercial-canonical-r1-r2-r3-v1 — anti-destruction uniquement
gh api -X PUT "repos/julien-gregurec/Appli_BTP/branches/feat%2Felsatia-commercial-canonical-r1-r2-r3-v1/protection" \
  -H "Accept: application/vnd.github+json" \
  -f required_status_checks=null \
  -F enforce_admins=false \
  -f required_pull_request_reviews=null \
  -f restrictions=null \
  -F allow_force_pushes=false \
  -F allow_deletions=false
```

**Alternative sans `gh`** : interface web, *Settings → Branches → Add branch ruleset/protection
rule*, en reproduisant exactement les valeurs du tableau §2. Le nom de check exact à saisir est
`Contrôles techniques / verification` (respecter la casse et l'espace autour du `/`).

Si le plan GitHub actuel (public gratuit) limite une option précise (ex. review obligatoire sur
dépôt public solo), **ne pas improviser de contournement** : appliquer le niveau maximal
disponible (force-push/suppression bloqués + check obligatoire restent accessibles sur tous les
plans GitHub, y compris gratuit, pour un dépôt public) et documenter tout écart ici, classé P1
externe.

---

## 8. État de fermeture de ce lot

| Point | État |
|---|---|
| Audit GitHub (protections actuelles) | **fait**, vérifié via API publique |
| Audit status checks | **fait** — un seul check, stable, nommé |
| Protections `main` appliquées | **non appliquées** — commandes prêtes (§7), bloqué par absence de `gh`/jeton |
| Protection `release/commercialisation-v1` appliquée | **non appliquée** — idem |
| Protection branche canonique appliquée | **non appliquée** — idem |
| Vercel Production Branch confirmée ≠ `main` | **non confirmée avec certitude** — fort indice favorable, vérification finale à faire par Julien (§4.4) |
| Documentation | **faite** (ce document) |
| Déploiement Production | **non fait** |
| Supabase Production | **non touché** |
| Stripe Live | **non touché** |

Ce lot ferme la partie **audit + documentation + préparation** du P1 de gouvernance release.
L'**application effective** des protections GitHub et la **confirmation finale** de la Production
Branch Vercel restent deux actions courtes (quelques minutes chacune) à la charge de Julien,
avec toutes les commandes/chemins exacts fournis ci-dessus.
