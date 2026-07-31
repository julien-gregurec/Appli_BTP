# Organisation Git — worktrees séparés (31 juillet 2026)

## Contexte

Le dossier `~/Documents/btp-platform` est synchronisé par iCloud Drive (option
« Bureau et Documents »). Deux sessions IA travaillant en parallèle dans ce
même dossier (Claude sur une machine, Codex sur une autre) ont provoqué un
conflit de synchronisation sur un fichier de référence Git
(`refs/heads/release/commercialisation-v1 2`, doublon créé par iCloud), qui a
temporairement bloqué `git fetch`/`git push` sur tout le dépôt. Diagnostic et
correctif documentés dans `RELAIS_CHATGPT.md`. `git fsck --full` reste très
lent dans ce dossier (iCloud matérialise les objets à la demande) — signe
supplémentaire que ce dossier ne doit plus servir de zone de travail active.

Solution : un dépôt Git (un seul `.git`, avec ses objets) reste dans le
dossier iCloud, mais chaque agent travaille désormais dans un **worktree Git
séparé**, situé hors d'iCloud, sur sa propre branche.

## Dossiers

| Rôle | Chemin | Branche |
|---|---|---|
| Codex | `/Users/juliengregurec/Projects/liria-codex` | `release/commercialisation-v1` |
| Claude | `/Users/juliengregurec/Projects/liria-claude` | `claude/developpement-parallele` |
| Historique / archive | `/Users/juliengregurec/Documents/btp-platform` | `main` (checkout de repos, ne plus l'utiliser pour développer) |
| Déploiement (préexistant, non touché) | `/private/tmp/liria-lot2-deploy` | détaché sur `db402ef` |

`~/Users/juliengregurec/Projects` est hors iCloud (vérifié via `brctl monitor` :
« not in a synced location »).

## Règles de non-concurrence

- Une branche = un seul worktree à la fois. Git refuse de toute façon de
  checkouter une branche déjà utilisée ailleurs.
- Codex ne travaille que dans `liria-codex`, sur `release/commercialisation-v1`.
- Claude ne travaille que dans `liria-claude`, sur `claude/developpement-parallele`.
- Personne ne développe plus directement dans `~/Documents/btp-platform`.
  Ce dossier garde son historique et ses médias non suivis
  (`output/guide/`, `output/pub/`, `output/video/`, `scripts/video/orchestre.py`) —
  ne pas les supprimer, ne pas les copier automatiquement ailleurs.
- `main` reste la branche protégée : aucune fusion automatique. Toute
  intégration de `claude/developpement-parallele` ou de
  `release/commercialisation-v1` vers `main` passe par une revue, les
  contrôles habituels (TypeScript, ESLint, tests, build) et une validation
  explicite de Julien.

## Procédure de récupération d'un commit

Les objets Git sont partagés entre tous les worktrees (un seul `.git`, dans
`~/Documents/btp-platform/.git`). Pour retrouver un commit depuis n'importe
quel worktree :

```bash
git log --all --oneline | grep <mot-clé ou hash partiel>
git show <hash>
git merge-base --is-ancestor <hash> <branche>   # vérifie s'il est déjà inclus
```

Aucun risque de perte : supprimer un worktree (`git worktree remove`) ne
supprime jamais les objets Git tant qu'ils restent atteignables par une
branche, un tag ou le reflog.

## Procédure de fusion future

1. Dans le worktree concerné (`liria-claude` ou `liria-codex`), vérifier
   `git status` propre et tous les contrôles verts (tsc, lint, tests, build).
2. Depuis `~/Documents/btp-platform` (le seul endroit où `main` reste
   consultable), fusionner explicitement après revue — jamais
   automatiquement, jamais par un agent seul sans validation de Julien.
3. Après fusion et push, informer l'autre agent (via `RELAIS_CHATGPT.md`)
   pour qu'il rebase ou resynchronise son worktree si nécessaire.

## Interdiction rappelée

Ne jamais checkouter `main`, `release/commercialisation-v1` ou
`claude/developpement-parallele` dans plus d'un endroit à la fois. En cas de
doute, `git worktree list --porcelain` depuis n'importe quel worktree donne
l'état exact de tous les checkouts actifs.
