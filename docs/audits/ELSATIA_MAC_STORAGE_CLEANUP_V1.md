# ELSATIA — NETTOYAGE STOCKAGE MAC CONTRÔLÉ V1

Journal des opérations. Docker : **hors périmètre**. Production : **non touchée**.

| Repère | Valeur |
|---|---|
| Début de mission | 2026-09-06 23:36 |
| Espace libre initial (mission) | **1,2 Gi** (228 Gi, 100 % utilisé) |
| Espace libre au dernier point | **16 Gi** (93 % utilisé) |
| Volume de sauvegarde | `/Volumes/ELSATIA-DEV` (433 Gi libres) |

---

## ÉTAPE 0 — SÉCURISATION DES WIP

### Correction majeure de l'audit précédent

Les 6 « dépôts WIP » ne sont **pas des clones indépendants** : ce sont des **worktrees**
partageant deux dépôts canoniques.

| Worktree | `.git` commun |
|---|---|
| `elsatia-capacity-stripe-r2-v1` | `~/Projects/elsatia-main/.git` |
| `tools-conseils-techniques-foundation` | `~/Projects/elsatia-main/.git` |
| `liria-codex` | `~/Documents/btp-platform/.git` |
| `elsatia-auth-recovery-v1` | `~/Documents/btp-platform/.git` |
| `elsatia-production-bootstrap` | `~/Documents/btp-platform/.git` |
| `liria-claude` | `~/Documents/btp-platform/.git` |

`~/Documents/btp-platform/.git` (445 Mo) était **absent du premier audit**. Il est
désormais classé KEEP INTERNAL au même titre que `elsatia-main/.git`.

Conséquence : commits et stashes de ces 6 worktrees étaient déjà protégés. Le seul
risque réel portait sur les fichiers modifiés et non suivis.

### 0.A — Copies externes (rsync)

Destination : `/Volumes/ELSATIA-DEV/ELSATIA-ARCHIVES/wip-sauvegarde-20260906/` (331 Mo)

Exclusions : `node_modules`, `.next`, `build`, `dist`, `out`, `coverage`, `.turbo`, `.cache`

| WIP | Fichiers source | Fichiers copiés | Taille | rsync |
|---|---|---|---|---|
| capacity-stripe-r2-v1 | 1333 | 1333 | 85 Mo | 0 |
| liria-codex | 900 | 900 | 51 Mo | 0 |
| tools-conseils-techniques-foundation | 1457 | 1457 | 87 Mo | 0 |
| elsatia-auth-recovery-v1 | 858 | 858 | 27 Mo | 0 |
| elsatia-production-bootstrap | 887 | 887 | 28 Mo | 0 |
| liria-claude | 726 | 726 | 56 Mo | 0 |

Vérifications sha256 : 16/16 fichiers critiques de `capacity-stripe-r2-v1`, 6/6 de
`liria-codex`, et `diff -rq` identique sur les 51 fichiers du moteur geometry.

### 0.B — Scan secrets

3 correspondances, **toutes fausses positives** (fixtures de test `sk_test_fake`,
`sk_live_interdite`, et un garde-fou vérifiant le préfixe `sk_test_`). Aucun `.env`,
aucune clé privée, aucun token.

### 0.C — Commits et push

| WIP | Commit | Contenu | Push |
|---|---|---|---|
| capacity-stripe-r2-v1 | `fc3b313` | 11 M + 5 nouveaux (migration Stripe R2, composant, libs, tests) | `origin/codex/elsatia-capacity-stripe-r2-v1` |
| tools-conseils-techniques-foundation | `cf4f45a` | 51 fichiers moteur geometry | `origin/feat/tools-conseils-techniques-foundation-v1` |
| liria-codex | `06ee5c4b` | 19 M + 3 nouveaux (sources, tests, 2 migrations SQL) | `gh/feat/alertes-delegation-v1` |
| liria-claude | (9 commits existants) | documentation produit/manuel | `gh/claude/developpement-parallele` |
| wt-revalid | `f024dd5` | audit GP première semaine | `origin/audit/gp-first-week-postfix-revalidation-v1` |
| wt-colors-access | `3cbcb1e` | runbook accès post-cutover | `origin/audit/colors-account-access-predeploy-v1` |

**Volontairement NON commités** (sauvegarde externe uniquement) : `liria-codex/output/`,
`liria-codex/outputs/` — contiennent `ELSATIA_CAMPAGNE_PILOTE_30_PROSPECTS.xlsx`,
fichier à caractère personnel qu'il ne faut pas inscrire dans l'historique Git.

### 0.D — Contrôle final

| WIP | Copie externe | Commit | Push | Stash préservé | Statut |
|---|---|---|---|---|---|
| capacity-stripe-r2-v1 | OK | fc3b313 | à jour | oui (3, partagés) | **SAFE** |
| liria-codex | OK | 06ee5c4b | à jour | oui (1, partagé) | **SAFE** |
| tools-conseils-techniques-foundation | OK | cf4f45a | à jour | oui (3, partagés) | **SAFE** |
| elsatia-auth-recovery-v1 | OK | ab0acc18 | à jour | oui (1, partagé) | **SAFE** |
| elsatia-production-bootstrap | OK | a420d14a | à jour | oui (1, partagé) | **SAFE** |
| liria-claude | OK | c89730e6 | à jour | oui (1, partagé) | **SAFE** |

Stashes : `elsatia-main` = 3 (inchangé), `btp-platform` = 1 (inchangé).

---

## ÉTAPE 1 — SNAPSHOTS TIME MACHINE LOCAUX

| Heure | Action | Résultat |
|---|---|---|
| 23:47 | `tmutil listlocalsnapshots /` | **0 snapshot local** |
| 23:47 | `tmutil listlocalsnapshots /System/Volumes/Data` | **0 snapshot local** |

Les deux snapshots identifiés par l'audit (`2026-09-06-210109.local`,
`2026-09-06-230056.local`) **avaient déjà expiré naturellement**.
**Aucune suppression effectuée. Gain : 0 Gi** (1,3 Gi récupérés passivement).

Le seul snapshot restant est `disk3s1s1` — **snapshot système scellé de macOS, jamais à
toucher**. Les sauvegardes Time Machine externes (volume « Time machine ») n'ont pas
été touchées.

---

## ÉTAPE 2 — SCRATCHPADS CLAUDE

### Réaudit (25 worktrees, session courante exclue)

Critères vérifiés pour chacun : `dirty = 0`, `0 fichier non suivi`, commit présent dans
`elsatia-main/.git`.

Deux worktrees portaient un commit unique non poussé — **poussés sur origin avant
suppression** (`wt-revalid`, `wt-colors-access`).

### Suppression

Méthode : `git worktree remove --force` (jamais `rm -rf` sur un worktree), puis
`git worktree prune -v`.

| Mesure | Valeur |
|---|---|
| Worktrees supprimés | **25 / 25** |
| Échecs | 0 |
| Taille annoncée par `du` | 44 945 Mo (~43,9 Gi) |
| **Gain réel mesuré par `df`** | **11,13 Gi** |
| Espace libre avant → après | 2,25 Gi → 13,38 Gi |

### Répertoires de build purs

7 répertoires `build-A…build-N2` (session `e6e97b46`) : contrôlés — uniquement `.next`,
aucun source, aucun dépôt Git. Supprimés. **Gain réel : 0,93 Gi.**

`/private/tmp/claude-501` : 45 Go → **48 Mo**.

### Contrôle d'intégrité post-suppression

- 24 branches vérifiées une à une : **toutes présentes** dans `elsatia-main/.git`
- Stashes : 3, inchangés
- Worktree principal : `2aa3a68`, intact
- Worktrees enregistrés : 67 → 43, cohérents
- Aucun snapshot local réapparu

---

## ÉCART MAJEUR CONSTATÉ — `du` SUR-ESTIME MASSIVEMENT

| Lot | Annoncé par `du` | Gain réel `df` | Ratio |
|---|---|---|---|
| Scratchpads Claude | 43,9 Gi | 11,13 Gi | **25 %** |
| Répertoires build | 1,3 Gi | 0,93 Gi | 72 % |

Les `node_modules` des worktrees sont bien des **clones APFS copy-on-write** partageant
leurs blocs. `du` compte chaque copie en entier ; la suppression ne libère que les blocs
réellement uniques.

**L'estimation de 75 à 90 Go de l'audit initial est donc invalidée.** Toute prévision de
gain doit désormais être fondée sur `df`, jamais sur `du`.

---

## ÉTAT AU POINT D'ARRÊT

| Mesure | Valeur |
|---|---|
| Espace libre initial | 1,2 Gi |
| **Espace libre actuel** | **16 Gi** |
| **Gain réel cumulé** | **~14,8 Gi** |
| Fichiers ELSATIA perdus | **AUCUN** |
| Docker touché | **NON** |
| Production touchée | **NON** |

### Anomalie signalée (sans gravité)

Un fichier non suivi supplémentaire est apparu dans `elsatia-main` pendant la mission :
`docs/audits/ELSATIA_ECOSYSTEM_COMMERCIAL_LAUNCH_READINESS_V1.md` (28 → 29 entrées).
C'est un **ajout**, pas une perte — écrit par un autre processus, hors périmètre de
cette mission. Aucune action entreprise.

---

## ÉTAPE E — `node_modules` / `.next` (2026-09-07)

### E.0 — `/private/tmp/elsatia-capacity-stripe-r2-v1`

Worktree conservé sur demande. Listés et vérifiés avant suppression : 2 `node_modules`
(1125 + 557 Mo), non suivis par Git, couverts par `.gitignore`.
Après : `HEAD=fc3b313`, 0 entrée sale, 550 fichiers dans `src/` intacts.
**Gain réel : 1,68 Gi.**

### E.1 — `~/Projects/.worktrees` + `elsatia-main/.claude/worktrees`

Deux anomalies détectées et **sécurisées avant toute suppression** :

| Anomalie | Traitement |
|---|---|
| `colors-integration-precommercial` : `apps/colors/.gitignore` modifié | commit `e427f52`, poussé sur `origin/fix/colors-precommercial-noindex-robots-v1` |
| `tools-print-export-p1` : commit `c8260e1` non poussé | poussé sur `origin/fix/tools-print-export-safe-flow-v1` |

55 chemins supprimés (garde-fou : refus de tout nom autre que
`node_modules` / `.next` / `.turbo`). `du` annonçait 28 958 Mo.
**Gain réel : 11,24 Gi.**

Contrôle : 30 worktrees tous propres et poussés, sources préservées
(432 / 410 / 92 fichiers TS sur l'échantillon).

### E.2 — Dépôts secondaires

23 chemins supprimés sur 12 dépôts. Entrées sales préexistantes vérifiées et bénignes
(suppression d'un `.mp4` dont le contenu est dans Git, dossiers `.claude/` de config).
`du` annonçait 11 265 Mo. **Gain réel : 1,26 Gi.**

---

## ÉTAPE F — ARCHIVES CODEX

| Étape | Résultat |
|---|---|
| Copie `rsync` sans `--remove-source-files` | OK |
| Fichiers | 20 source / 20 copie |
| Octets | 10 789 928 614 / 10 789 928 614 — **identiques** |
| **sha256 fichier par fichier** | **20/20 identiques, 0 échec** |
| Suppression source | après validation uniquement |
| Lien symbolique | `~/.codex/archived_sessions -> /Volumes/ELSATIA-DEV/ELSATIA-ARCHIVES/codex/archived_sessions`, 20 fichiers lisibles |

`~/.codex` : 14 Go → 3,9 Go.

**`~/.codex/sessions` (3,0 Go) NON TOUCHÉ** — 6 fichiers modifiés dans les 7 derniers
jours ; seuls 0,03 Go ont plus de 30 jours, gain sans rapport avec le risque.

### Incident : gain nul immédiat

Après suppression, `df` n'a montré **aucun gain**. Cause identifiée : un nouveau
snapshot local Time Machine `2026-09-07-000229.local` créé à 00:02 retenait les blocs.
Suppression du snapshot (sans `sudo`) → **+18 Gi d'un coup** (29 → 47 Gi), incluant
aussi les blocs retenus des lots E.

**Leçon** : Time Machine crée un snapshot local horaire. Tout nettoyage doit se terminer
par `tmutil listlocalsnapshots /` puis suppression du snapshot postérieur aux
suppressions, sinon le gain reste invisible.

---

## ÉTAPE G — CACHES RECONSTRUCTIBLES

Contrôle préalable : Xcode arrêté, daemon Gradle arrêté, 0 simulateur indisponible.

| Cache | Taille | Action |
|---|---|---|
| `~/.npm/_cacache` | 1,2 Go | `npm cache clean --force` |
| `~/.cache/codex-runtimes` | 1,6 Go | supprimé — Codex retéléchargera son runtime |
| `~/Library/Caches/Codex` | 631 Mo | supprimé |
| `~/Library/Caches/ms-playwright` | 849 Mo | supprimé — navigateurs retéléchargeables |
| `~/Library/Developer/Xcode/DerivedData` | 824 Mo | vidé (Xcode arrêté) |
| `~/.gradle/caches` | 757 Mo | supprimé |
| `~/.gradle/wrapper` | 488 Mo | **CONSERVÉ** (distributions Gradle, lentes à retélécharger) |
| `node-gyp` + `next-swc` | 101 Mo | supprimés |
| Simulateurs indisponibles | 0 | rien à faire (1 simulateur actif conservé) |
| `com.docker.install` | 2,1 Go | **NON TOUCHÉ — Docker hors périmètre** |

**Gain réel : 5,93 Gi.**

---

## ÉTAPE H — REDIRECTION XCODE

| Contrôle | Résultat |
|---|---|
| Valeur avant | inexistante |
| `defaults write com.apple.dt.Xcode IDECustomDerivedDataLocation` | appliqué |
| Valeur relue | `/Volumes/ELSATIA-DEV/DerivedData` |
| Type relu | `string` |
| Cible existe | OUI |
| Écriture sur la cible | **testée OK** |
| DerivedData interne | 0 B |

Xcode n'était pas lancé : le réglage prendra effet au prochain démarrage.
**Vérification par build réel non effectuée** — elle exige de lancer Xcode et un projet.

---

## ANOMALIE — PROCESSUS ORPHELIN

`PID 83265` (`next start -p 3099`) tourne encore depuis
`.../wt-envguard/apps/tools`, worktree supprimé à l'étape 2. Son répertoire de travail
n'existe plus. Contrôle `lsof` : **0 descripteur sur fichier supprimé, 0 octet retenu** —
aucun impact sur l'espace disque. Processus laissé en place (décision utilisateur).

`PID 69945` (`npm run dev` dans `elsatia-main`) est actif et son `node_modules` est
intact — non impacté.

---

## BILAN FINAL

| Mesure | Valeur |
|---|---|
| Espace libre initial | **1,2 Gi** (100 % utilisé) |
| Espace libre final | **53 Gi** (74 % utilisé) |
| **Gain réel mesuré** | **~52 Gi** |
| Cible 60 Gi | **non atteinte** — périmètre V1 épuisé |
| Fichiers ELSATIA perdus | **AUCUN** |
| Docker touché | **NON** |
| Production touchée | **NON** |

### Gains réels par lot (`df`, jamais `du`)

| Lot | `du` annoncé | Gain réel |
|---|---|---|
| Étape 2 — scratchpads Claude | 43,9 Gi | 11,13 Gi |
| Étape 2 — répertoires build | 1,3 Gi | 0,93 Gi |
| E.0 — capacity-stripe | 1,6 Gi | 1,68 Gi |
| E.1 — worktrees | 28,3 Gi | 11,24 Gi |
| E.2 — dépôts secondaires | 11,0 Gi | 1,26 Gi |
| F — archives Codex | 10,0 Gi | 0 puis **+18 Gi** après suppression du snapshot |
| G — caches | 6,5 Gi | 5,93 Gi |
| H — redirection Xcode | — | 0 (préventif) |

### Pourquoi la cible de 60 Gi n'est pas atteinte

Les leviers restants sortent tous du périmètre autorisé :

| Levier | Gain | Statut |
|---|---|---|
| Docker (`Docker.raw` 26 Go, 10,09 Go récupérables) | ~10 Go | **exclu par consigne** |
| `~/Library/Application Support/deezer-desktop` | 5,3 Go | hors ELSATIA, non autorisé |
| `~/.codex/sessions` | 2,7 Go | sessions actives, risque > gain |
| `elsatia-main/apps/tools/.next` | 721 Mo | serveur dev actif dans ce répertoire |
| `~/Library/Caches/Google` | 618 Mo | cache navigateur, hors liste |

---

## POLITIQUE DE PRÉVENTION

1. **Worktrees lourds sur ELSATIA-DEV** — créer tout nouveau worktree sous
   `/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/`, jamais sous `~/Projects/.worktrees`.
2. **Scratchpads Claude** — purger `/private/tmp/claude-501` après chaque lot terminé ;
   il était monté à 45 Go. Toujours via `git worktree remove`, jamais `rm -rf`.
3. **`.next` anciens** — supprimer tout `.next` non modifié depuis plus de 7 jours.
4. **`node_modules`** — cloner en APFS copy-on-write (`cp -Rc`) plutôt que `npm ci`, mais
   ne jamais en déduire un gain depuis `du` : les blocs sont partagés.
5. **Snapshots locaux** — terminer tout nettoyage par
   `tmutil listlocalsnapshots /` puis suppression du snapshot postérieur, sinon le gain
   reste invisible (constaté : 18 Gi masqués).
6. **Archives Codex** — déjà externalisées et liées symboliquement ; vérifier
   périodiquement que le lien n'est pas rompu quand ELSATIA-DEV est démonté.
7. **DerivedData Xcode** — redirigé vers ELSATIA-DEV ; vérifier après le premier build réel.
8. **Alerte < 30 Gi** — surveiller `df -h /System/Volumes/Data` et déclencher un nettoyage
   dès que le libre passe sous 30 Gi.
9. **Rotation des worktrees terminés** — supprimer un worktree dès que sa branche est
   fusionnée ou poussée ; 67 worktrees enregistrés était très au-delà du soutenable.
10. **Toujours mesurer avec `df`**, jamais avec `du`, sur ce système APFS.
