# ELSATIA — Gouvernance des branches et des releases

Version 2 — 2026-09-05. Lot `ELSATIA-GITHUB-VERCEL-RELEASE-GUARD-CLOSURE-V2`, fermant le P1 de
gouvernance release ouvert par `ELSATIA-GITHUB-VERCEL-RELEASE-GUARD-CLOSURE-V1` (2026-09-04,
NO-GO — protections auditées et documentées mais pas encore appliquées). Depuis, Julien a
appliqué les trois rulesets GitHub et confirmé la Production Branch Vercel. **Aucun
déploiement, aucune migration Production, aucun Stripe Live, aucune modification de code
métier dans ce lot** — audit de confirmation et mise à jour documentaire uniquement.

---

## 1. État constaté (audit de confirmation, 2026-09-05)

Dépôt : `https://github.com/julien-gregurec/Appli_BTP` — **public**, branche par défaut GitHub :
`main`.

### 1.1 Protection des branches — confirmée via l'API GitHub publique (Rulesets)

Le dépôt étant public, l'API GitHub Rulesets est lisible **sans authentification** pour son
contenu structurel (liste des rulesets, règles effectives par branche) ; seule la liste des
« bypass actors » d'un ruleset (qui peut le contourner) reste masquée aux requêtes anonymes —
voir réserve au §1.4.

Confirmé par `GET /repos/julien-gregurec/Appli_BTP/rulesets` (3 rulesets, tous `"enforcement":
"active"`) puis `GET /repos/julien-gregurec/Appli_BTP/rules/branches/<branche>` (règles
effectivement appliquées à chaque branche cible) :

| Branche | `protected` (branche) | Ruleset | Enforcement | Suppression | Force-push | PR obligatoire | Approbations | Stale reviews dismissed | Conversation resolution | Check obligatoire |
|---|---|---|---|---|---|---|---|---|---|---|
| `main` | **true** | `Protect main` (id `22299244`) | **active** | **interdite** | **interdit** | **oui** | **1** | **oui** | **oui** | **`Contrôles techniques / verification`** |
| `release/commercialisation-v1` | **true** | `Protect release` (id `22299555`) | **active** | **interdite** | **interdit** | non exigée | — | — | — | — |
| `feat/elsatia-commercial-canonical-r1-r2-r3-v1` | **true** | `Protect commercial canonical` (id `22299867`) | **active** | **interdite** | **interdit** | non exigée | — | — | — | — |

Détail brut confirmé pour `main` (`GET /rulesets/22299244`, HTTP 200, lecture publique) :
- `conditions.ref_name.include = ["refs/heads/main"]` — cible exacte, aucune autre branche visée ;
- `rules: [deletion, non_fast_forward, pull_request{required_approving_review_count:1,
  dismiss_stale_reviews_on_push:true, require_code_owner_review:true,
  required_review_thread_resolution:true}, required_status_checks{required_status_checks:
  [{context:"Contrôles techniques / verification"}], strict_required_status_checks_policy:false}]`.

Détail brut confirmé pour `release/commercialisation-v1` (ruleset `22299555`) et
`feat/elsatia-commercial-canonical-r1-r2-r3-v1` (ruleset `22299867`) : chacun expose exactement
`rules: [deletion, non_fast_forward]` — anti-destruction uniquement, aucune exigence de PR/check,
conforme à la cible du §2 (ne pas casser le rythme de travail actuel sur ces deux branches).

**Note technique** : l'endpoint legacy `GET /repos/.../branches/<nom>` (utilisé dans l'audit V1)
renvoie toujours `protection.enabled: false` pour les trois branches — cet endpoint ne reflète
que l'ancien système *Branch protection rules*, pas les *Rulesets* (nouveau système utilisé ici).
Le champ `protected: true` au niveau racine de la même réponse, lui, reflète bien les deux
systèmes confondus et confirme la protection réelle. C'est l'API Rulesets dédiée (ci-dessus) qui
fait foi pour le détail des règles.

### 1.2 Bypass (« qui peut contourner »)

Julien indique, pour les trois rulesets : bypass accordé à **`Repository admin`**, mode **`Always
allow`**. **Ce point précis n'a pas pu être vérifié de façon indépendante** : l'API publique non
authentifiée renvoie le contenu complet d'un ruleset (conditions, règles, cible) mais **omet
systématiquement le champ `bypass_actors`**, y compris sur un dépôt public — GitHub ne l'expose
qu'aux requêtes authentifiées avec un accès en lecture au dépôt. Aucun jeton GitHub ni CLI `gh`
n'étant disponible dans cette session (cf. §7), cette valeur repose sur la déclaration de Julien,
non sur une lecture API indépendante. Cohérent avec le comportement observé : les pushes de ce
lot et des précédents sur `feat/elsatia-commercial-canonical-r1-r2-r3-v1` (dont le ruleset est
actif) continuent de réussir sans PR ni check, ce qu'un bypass admin actif explique entièrement.

### 1.3 Status checks disponibles (GitHub Actions)

Inchangé depuis l'audit V1. Un seul workflow existe : **« Contrôles techniques »**
(`.github/workflows/ci.yml`), état `active`, job `verification` (nom exact du contexte de check :
`Contrôles techniques / verification`, exigé sur `main` — confirmé identique au §1.1).

### 1.4 Vercel — Production Branch

Julien confirme explicitement, projet `elsatia-production` : **Production Branch =
`release/commercialisation-v1`**, **≠ `main`**. Aucun outil Vercel (CLI non installée dans cette
session, aucun jeton d'API Vercel disponible pour le projet `elsatia-production` — le seul
fichier `.vercel/project.json` présent localement pointe vers un projet distinct,
`elsatia-preview`, et ne peut ni confirmer ni infirmer ce réglage) ne permet de relire ce champ de
façon indépendante depuis cette session. Cette valeur repose donc sur la déclaration explicite de
l'opérateur, cohérente avec :
- le nom du projet Vercel (`elsatia-production`) et le nom de la branche (`release/…`) ;
- l'absence historique de déploiements `Environment: Production` auto-déclenchés malgré des
  dizaines de push sur `feat/elsatia-commercial-canonical-r1-r2-r3-v1` (constatée en V1, toujours
  vraie — si Production Branch avait été cette branche canonique, chaque push l'aurait
  redéployée) ;
- le risque explicite documenté en V1 (`main` porte encore l'ancienne base « Liria Gestion Pro
  V3 ») n'ayant jamais été concrétisé.

**Conclusion** : Production Branch ≠ `main` est confirmé par déclaration opérateur directe et
reste cohérent avec tous les indices indirects disponibles côté GitHub. Aucun élément recueilli
dans ce lot ne contredit cette confirmation.

---

## 2. Règles appliquées (référence — inchangé depuis V1, désormais actif)

### `main`

| Réglage | Valeur cible | État |
|---|---|---|
| Push direct | interdit (PR obligatoire) | **appliqué** |
| Pull request obligatoire | oui, ≥ 1 approbation | **appliqué** (`required_approving_review_count: 1`) |
| Force-push | interdit | **appliqué** |
| Suppression | interdite | **appliqué** |
| Status checks obligatoires | `Contrôles techniques / verification` | **appliqué** |
| Stale reviews dismissed | activé | **appliqué** |
| Conversation resolution | activé | **appliqué** |
| Bypass | `Repository admin` / `Always allow` | déclaré par Julien, non vérifiable par API publique (§1.2) |

### `release/commercialisation-v1`

| Réglage | Valeur cible | État |
|---|---|---|
| Force-push | interdit | **appliqué** |
| Suppression | interdite | **appliqué** |
| PR/check | non exigés (flux de promotion actuel préservé) | **appliqué** (aucune règle PR/check dans le ruleset) |
| Bypass | `Repository admin` / `Always allow` | déclaré par Julien, non vérifiable par API publique (§1.2) |

### `feat/elsatia-commercial-canonical-r1-r2-r3-v1`

| Réglage | Valeur cible | État |
|---|---|---|
| Force-push | interdit | **appliqué** |
| Suppression | interdite | **appliqué** |
| Push direct | autorisé (branche de préparation active) | **appliqué** (aucune règle PR/check dans le ruleset) |
| Bypass | `Repository admin` / `Always allow` | déclaré par Julien, non vérifiable par API publique (§1.2) |

---

## 3. Status checks — ce qui est rendu obligatoire

Inchangé : **`Contrôles techniques / verification`** est le seul check existant et stable,
désormais **effectivement exigé sur `main`** par le ruleset `Protect main` (confirmé §1.1 —
`required_status_checks.required_status_checks[0].context = "Contrôles techniques /
verification"`, correspondance exacte caractère pour caractère avec le nom du job CI).

---

## 4. Vercel — Production Branch

Fermé (§1.4). Production Branch = `release/commercialisation-v1`, confirmée ≠ `main` par
déclaration opérateur directe. Le risque documenté en V1 (redéploiement accidentel de l'ancienne
base `main` en Production) est écarté sur les deux plans qui le rendaient possible : `main` est
désormais protégée contre tout push direct (§1.1), et Production Branch ne pointe de toute façon
pas dessus (§1.4).

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
- Force-push d'une branche de release — **techniquement bloqué désormais** par le ruleset
  `Protect release` (§1.1), au-delà de la simple consigne.
- Redéployer un ancien build sans revérifier son SHA exact (`vercel inspect <url>` → champ
  `created` + comparaison au SHA attendu).

### Qui peut déployer

Aujourd'hui : Julien uniquement (propriétaire du compte Vercel et du dépôt GitHub, seul détenteur
du bypass `Repository admin` sur les rulesets GitHub). Toute exécution par un outil (Claude,
Codex) reste soumise à une autorisation explicite, mission par mission, jamais implicite.

---

## 6. Rollback

Rollback branche/SHA = revenir au dernier SHA connu-bon de la branche de release (`git log` sur
`release/commercialisation-v1` pour retrouver le SHA pré-incident), puis `vercel --prod` depuis
ce SHA exact (checkout ou worktree dédié), **jamais** un simple « rollback » Vercel one-click
sans vérifier la compatibilité DB (cf. `ELSATIA_PRODUCTION_ROLLBACK_V1.md` — le rollback code
seul est insuffisant après la migration `…000255`).

---

## 7. Limitation constatée dans ce lot

Inchangé depuis V1 : **aucun outil `gh` (GitHub CLI) n'est installé dans cet environnement,
aucun jeton d'authentification GitHub (`GH_TOKEN`/`GITHUB_TOKEN`) n'est disponible, et aucune CLI
ou jeton Vercel valide pour le projet `elsatia-production` n'est disponible.** Le seul identifiant
GitHub présent reste un identifiant Git stocké dans le trousseau macOS pour l'usage exclusif du
protocole `git` (push/pull) — non extrait ni réutilisé pour appeler l'API GitHub, conformément à
la règle de ne jamais manipuler un secret existant en dehors de son usage prévu.

**Conséquence pour ce lot de clôture** : contrairement au lot V1 (audit seul, rien à appliquer),
ce lot n'avait **rien à appliquer** — les protections ont été mises en place manuellement par
Julien (hors session) — et se limitait à **confirmer** cet état par lecture. Cette confirmation a
pu être menée **intégralement via l'API GitHub Rulesets publique et non authentifiée** (§1.1),
qui s'est révélée strictement plus complète et fiable que l'ancien endpoint *branch protection*
utilisé en V1 pour ce même usage. Seuls deux points précis restent hors de portée d'une
vérification indépendante par API/CLI depuis cette session, tous deux pour la même raison
(absence de jeton authentifié) :
- le détail des `bypass_actors` de chaque ruleset GitHub (§1.2) ;
- la valeur exacte du champ Vercel *Production Branch* (§1.4).

Les deux reposent sur la déclaration directe de Julien dans le contexte de ce lot, corroborée par
des indices indirects concordants (comportement observé des pushes récents pour le premier ;
absence de déploiements Production auto-déclenchés pour le second).

---

## 8. État de fermeture de ce lot

| Point | État |
|---|---|
| Audit GitHub (protections actuelles) | **fait**, confirmé via API Rulesets publique |
| Audit status checks | **fait** — un seul check, stable, nommé, exigé sur `main` |
| Protection `main` appliquée | **CONFIRMÉE ACTIVE** — ruleset `Protect main` (id `22299244`) |
| Protection `release/commercialisation-v1` appliquée | **CONFIRMÉE ACTIVE** — ruleset `Protect release` (id `22299555`) |
| Protection branche canonique appliquée | **CONFIRMÉE ACTIVE** — ruleset `Protect commercial canonical` (id `22299867`) |
| Bypass admin des trois rulesets | déclaré par Julien (`Repository admin` / `Always allow`), non vérifiable par API publique |
| Vercel Production Branch confirmée ≠ `main` | **CONFIRMÉE** — `release/commercialisation-v1`, par déclaration opérateur directe |
| Documentation | **faite** (ce document, v2) |
| Déploiement Production | **non fait** |
| Supabase Production | **non touché** |
| Stripe Live | **non touché** |

Le P1 de gouvernance release ouvert en V1 est **fermé** : les trois branches critiques sont
protégées contre suppression et force-push, `main` exige en plus une PR avec revue et le check CI
`Contrôles techniques / verification`, et la Production Branch Vercel est confirmée distincte de
`main`. Les deux réserves documentaires (§1.2, §1.4, §7) ne bloquent pas la fermeture : elles
portent sur des détails de configuration déclarés par l'opérateur et cohérents avec tous les
indices vérifiables indépendamment, pas sur l'existence même des protections.
