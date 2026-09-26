# ELSATIA — Studio video worker : qualification réelle sur la bonne baseline (V2)

## Contexte et correction de la mission V1

Une mission précédente a conclu à tort que `workers/studio-video` n'existait
pas. Cause racine confirmée dans cette session : elle a travaillé sur la
branche `claude/zen-goodall-n3opdc` telle qu'elle existait alors, qui était
**strictement identique à `main`** (`4d92ddbe`, 0 commit de différence,
vérifié par `git diff`/`git log` avant toute action) — un dépôt mono-app
« liria-gestion-pro » sans `workers/`, sans `apps/studio/`, sans
`config/env-manifest.json`. Le worker n'y est effectivement pas : la
conclusion V1 était correcte *pour cette branche*, mais la branche elle-même
n'était pas la bonne base pour qualifier Studio.

`git fetch --all --prune` (231 branches distantes) confirme que le
monorepo réel — avec `workers/studio-video/`, `apps/studio/` et
`config/env-manifest.json` — existe sur de nombreuses branches
(`feat/elsatia-studio-v1`, les trains `claude/studio-*`,
`integration/elsatia-*`, etc.). La branche la plus récente et la plus
convergée est `origin/integration/elsatia-post-qualification-fix-convergence-v1`
(dernier commit `3cfbcd70`, 2026-09-22 09:01 UTC — quelques heures avant
cette session), explicitement citée par la mission comme référence de
comparaison.

**Action prise :** `claude/zen-goodall-n3opdc` ne portait aucun commit
propre (identique à `main`) — reset sans perte possible, vérifié avant
exécution. La branche désignée a été réinitialisée avec
`git reset --hard origin/integration/elsatia-post-qualification-fix-convergence-v1`.

**SHA exact de cette qualification : `3cfbcd70f7e44b6762d35a03a3f664122aeab90e`**,
branche `claude/zen-goodall-n3opdc`.

---

## Verdict

# STUDIO WORKER LOCALLY QUALIFIED

Le worker existe, est intégralement implémenté (rendu, templates/texte,
analyse vision optionnelle, nettoyage, réconciliation, healthcheck), et
tout ce qui a pu être exécuté réellement dans ce bac à sable est passé au
vert : typecheck worker et Studio, lint Studio, 260/260 tests unitaires
Studio, build Studio, et 26/26 tests réels du worker (rendus FFmpeg
effectifs) une fois pointé sur un binaire FFmpeg complet. La revue de code
et SQL n'a révélé aucun défaut de sécurité bloquant.

Ce n'est **pas** « READY FOR PREVIEW DEPLOYMENT » : la recette complète du
projet (`apps/studio/scripts/e2e-gate.mjs`, qui provisionne Supabase et
Redis via des conteneurs Docker) n'a pas pu être exécutée dans ce bac à
sable — la politique réseau sortante y bloque le CDN de Docker Hub
(reproductible, voir §3). Il ne s'agit pas d'un défaut du worker mais d'une
limite d'environnement de qualification ; elle est documentée honnêtement
plutôt que contournée ou présentée comme passée.

---

## 1. Inventaire du worker

| Élément | Constat |
|---|---|
| `workers/studio-video/package.json` | `@elsatia/studio-video`, ESM, dépend de `@elsatia/studio-domain` (interne, `file:`), `bullmq@6.3.4`, `ioredis@6.0.0`, `@supabase/supabase-js`, `fontkit`. Dev : `ffmpeg-static`, `ffprobe-static`, `tsx`, `vitest@4`, `typescript`. Aucun script `build` — exécuté directement via `tsx` (process long, pas une app Next.js). |
| `Dockerfile` | Contexte = racine du dépôt (nécessaire pour copier `packages/studio-domain`). Installe FFmpeg **Debian** (pas `ffmpeg-static`) avec une assertion de build explicite `drawtext`/`drawbox`/`overlay`. Commentaire dans le Dockerfile lui-même : le binaire `ffmpeg-static` s'est déjà révélé incomplet dans un bac à sable de qualification antérieur — **exactement le défaut reproduit indépendamment dans cette session (§3)**, déjà connu et déjà mitigé. `HEALTHCHECK` sur Redis uniquement, `STOPSIGNAL SIGTERM`, utilisateur non-root, `npm ci` (pas de `dist/`, `tsx` en prod assumé). |
| Queue | BullMQ (`studio-renders-v1`), alimentée par un **outbox Postgres** relu toutes les 2 s (`studio_render_dispatch`), pas par un push direct — Redis est un transport reconstructible, pas la source de vérité. |
| Redis | `ioredis`, `maxRetriesPerRequest: null` (retry indéfini plutôt qu'échec prématuré d'une commande — voir §6). |
| FFmpeg | Invoqué exclusivement via `spawn`/`execFile` avec tableaux d'arguments (jamais de chaîne shell). `ffprobe` restreint par `-protocol_whitelist file,pipe` et `-format_whitelist`. |
| Storage | Supabase Storage, bucket privé `studio-renders` (RLS `bucket_id<>'studio-renders'` bloque tout accès direct anon/authenticated), assets sources dans `studio-originals`. |
| Callbacks/progress | RPCs Postgres `SECURITY DEFINER` (`studio_claim_render`, `studio_render_progress`, `studio_complete_render`) avec jeton de bail (`lease_token`) — voir §5/§9. |
| Env | `.env.example` complet ; `config/env-manifest.json` référence les variables du worker (`STUDIO_*`). Un lot dédié antérieur (`ELSATIA_STUDIO_ENV_MANIFEST_FIX_V1.md`) a déjà fermé 37 erreurs de gabarit — non retouché ici. |

---

## 2. Build

- `npm ci --prefix workers/studio-video` : **109 paquets installés, 0 vulnérabilité**.
- `npm ci --prefix apps/studio` : **421 paquets installés, 0 vulnérabilité**.
- `npm run typecheck` (worker, `tsc --noEmit`) : **PASS**, aucune sortie.
- Docker : `dockerd` démarré localement (root, sandbox isolé), `docker build -f workers/studio-video/Dockerfile .` échoue à l'étape `FROM node:24-bookworm-slim` — voir §3 pour la preuve que c'est un blocage réseau, pas un défaut du Dockerfile.

---

## 3. FFmpeg — défaut réel trouvé, root-causé et déjà mitigé par le projet

`npm test` du worker (binaires npm par défaut, `ffmpeg-static@5.3.0`) donne
**3 échecs sur 26** : `drawtext`/`xfade` real short render, fade, et le
rendu de template texte échouent avec `RENDER_FAILED`.

**Root cause confirmée :**
```
$ node_modules/ffmpeg-static/ffmpeg -h filter=drawtext
Unknown filter 'drawtext'.
```
Le binaire statique embarqué par `ffmpeg-static@5.3.0` dans ce bac à sable
(build `johnvansickle.com`, ffmpeg 7.0.2) ne fournit pas `drawtext` malgré
des flags de configuration qui le laissent croire (`--enable-libfreetype`
présent mais le filtre n'est pas lié). `xfade` échoue séparément
(« inputs needs to be a constant frame rate »).

**Ce défaut est déjà connu du projet** : le `Dockerfile` du worker le
documente explicitement et bascule sur le FFmpeg Debian avec une assertion
de build. Vérification indépendante : `apt-get install ffmpeg` (paquet
Ubuntu 24.04, `ffmpeg 6.1.1-3ubuntu5`) fournit bien `drawtext`, `drawbox`,
`overlay`, `xfade`, `concat`. En substituant temporairement ce binaire
système à `ffmpeg-static`/`ffprobe-static` (diagnostic seulement — binaires
restaurés ensuite, aucun fichier du dépôt modifié) :

```
Test Files  1 failed | 4 passed (5)   # échec = analysis.test.ts, cause différente (§ci-dessous)
Tests  22 passed | 4 skipped (26)
```

Le seul échec restant (`analysis.test.ts`, 4 tests skippés) est dû à
l'absence d'OpenCV, une dépendance Python **optionnelle**
(`STUDIO_AI_ANALYSIS=0` par défaut). Après `python3 -m venv` +
`pip install -r analysis/requirements.txt` (opencv-python-headless réel) :

```
Test Files  1 passed (1)
Tests  4 passed (4)
```

**Résultat consolidé, worker complet, binaires qualifiés : 26/26 tests
réels PASS.** Ceci confirme que le code du worker est correct ; le seul
défaut est la fourniture du binaire de développement `ffmpeg-static` dans
cet environnement précis, déjà mitigée en Preview/Production par le
Dockerfile (FFmpeg Debian + assertion de build) et par les variables
`STUDIO_FFMPEG_PATH`/`STUDIO_FFPROBE_PATH` documentées dans le README pour
tout hébergeur cible.

**Build Docker non exécutable dans ce bac à sable (réseau, pas le Dockerfile) :**
```
docker pull node:24-bookworm-slim
→ Forbidden (production.cloudfront.docker.com, 403), reproductible ×3
docker pull public.ecr.aws/docker/library/node:24-bookworm-slim
→ Forbidden (autre CDN cloudfront), même symptôme
docker pull mcr.microsoft.com/dotnet/runtime:8.0
→ succès (couche de contrôle : le registre lui-même fonctionne)
```
La politique réseau sortante de ce bac à sable bloque spécifiquement le CDN
de Docker Hub (et les miroirs basés sur CloudFront), pas Docker en général.
La logique du Dockerfile (FFmpeg Debian + assertion `drawtext`/`drawbox`/`overlay`
au build) a donc été validée par équivalent natif (§ci-dessus), pas par
exécution du `docker build` lui-même.

---

## 4. Revue de sécurité (code + SQL)

Aucun défaut bloquant trouvé sur le périmètre revu. Points vérifiés :

- **Pas d'injection shell** : tout appel FFmpeg/ffprobe/Python passe par
  `spawn`/`execFile` avec un tableau d'arguments (`src/render.ts:106-161`,
  jamais de chaîne interprétée par un shell).
- **Environnement enfant minimal** : `command()` ne transmet que `PATH`/`HOME`
  aux sous-processus FFmpeg — aucune credential Supabase/Redis n'y fuit.
- **Path traversal / propriété tenant** : `worker.ts:136-141` exige
  `storage_bucket==='studio-originals'`, préfixe `studio/${workspace_id}/`
  strict, et rejette tout `storage_key` contenant `..`. Vérifié par un test
  direct sur le prédicat exact (4 cas : autre tenant → bloqué, `..` → bloqué,
  mauvais bucket → bloqué, cas légitime → autorisé — les 4 résultats sont
  corrects).
- **SSRF / format ffprobe** : `-protocol_whitelist file,pipe` et
  `-format_whitelist` explicites (`render.ts:171-174`) empêchent de sonder
  une URL ou un protocole arbitraire via un média forgé.
- **Injection dans les filtres FFmpeg** : toutes les valeurs interpolées
  dans un `-filter_complex` sont validées avant usage — couleur carte et
  texte `^#[0-9a-f]{6}$` (`presentation.ts:152`, `validateTimeline` appelé
  en tête de `renderTimeline`), énumérations strictes (crop mode, transition,
  position, alignement), bornes numériques (volume 0–1, échelle 1–2, etc.).
  Le **texte utilisateur n'est jamais interpolé dans une expression** : il
  est écrit dans un fichier privé et référencé via `textfile=` avec
  `expansion=none` (désactive l'expansion `%{...}` de FFmpeg), et les seuls
  champs interpolés directement (chemin de fichier, police) sont échappés
  (`text-layout.ts:136-140`, échappement `\`, `:`, `'`). Le test dédié
  (« UTF8 never interpreted as filter syntax ») passe avec un FFmpeg complet
  (§3).
- **Concat demuxer** : noms de fichiers échappés selon la convention du
  format concat (`render.ts:427`, `'\\''`), avant écriture dans `concat.txt`.
- **RLS et isolation tenant (SQL)** : lecture des jobs/outputs restreinte à
  `studio_my_role(workspace_id) is not null` (`20260913010000_studio_render_engine.sql:31-32`).
  Bucket `studio-renders` privé, policy restrictive bloquant tout accès direct
  anon/authenticated. Fonctions techniques (`dispatch`/`claim`/`progress`/`complete`)
  `security definer`, `search_path=''`, **exécutables uniquement par
  `service_role`** — jamais par un utilisateur authentifié ; `request`/`cancel`
  sont les seules RPC ouvertes aux utilisateurs, et re-vérifient l'appartenance
  au projet/workspace à chaque appel.
- **Signed URLs** : téléchargement d'un rendu (`apps/studio/src/lib/renders.ts:150-156`)
  passe par `authorizeProject` (client RLS, donc filtré par tenant) avant de
  générer une URL signée **60 s**, jamais d'URL publique permanente.

Aucune fuite de secret constatée dans les logs (`worker.ts`, `healthcheck.ts`) :
uniquement des identifiants de job, codes d'erreur et métriques — jamais de
clé de service, d'URL Supabase ou de jeton.

---

## 5. Queue — claim / duplicate / stale / retry (revue SQL + test direct)

Le mécanisme d'idempotence réel est en base, pas dans le code JS du worker :

- **Claim atomique** : `studio_claim_render` fait un
  `UPDATE ... WHERE status='queued' RETURNING *` — une seule des deux
  livraisons concurrentes d'un même `jobId` peut réussir ; l'autre reçoit
  `null` et `worker.ts:81` (`if (!job) return;`) ne fait rien. C'est un
  verrou par comparaison-et-échange sur la ligne, pas une hypothèse de
  livraison unique de BullMQ.
- **Bail / fencing** : `studio_render_progress` et `studio_complete_render`
  vérifient `lease_token` à chaque écriture ; un worker zombie dont le job a
  été repris par un autre (après timeout, voir ci-dessous) ne peut plus
  écrire d'état sous son ancien bail.
- **Stale / redémarrage worker** : `studio_render_dispatch` marque `failed`
  (ou `cancelled` si annulation demandée) tout job actif dont
  `heartbeat_at < now() - 60s`, puis ne redistribue que les jobs `queued` —
  auto-guérison sans intervention si un worker meurt en cours de rendu.
- **Retry** : `studio_request_render` plafonne à `retry_count>=3` et exige
  `status='failed'` sur le job d'origine.
- **Duplicate à la demande** : clé d'idempotence
  `unique(workspace_id, requested_by, request_id)` — une même requête
  client renvoie l'`id` du job existant plutôt que d'en créer un second.

**Test direct réalisé (Redis natif, sans Postgres — voir §6)** : un `jobId`
BullMQ déjà traité et complété peut être **réintroduit et retraité** par un
second `queue.add()` avec le même `jobId` — BullMQ ne déduplique que les
jobs encore en attente/actifs, pas ceux déjà terminés. C'est précisément
pourquoi l'architecture ne fait *pas* reposer l'idempotence sur BullMQ : la
garantie réelle vient du `WHERE status='queued'` côté Postgres (ci-dessus),
qui aurait rejeté ce même scénario en le renvoyant `null`. Cette
observation confirme un choix d'architecture correct plutôt qu'un défaut.

**Non exécuté dans ce bac à sable** : `studio_claim_render` /
`studio_render_progress` / `studio_complete_render` n'ont pas pu être
appelés en conditions réelles (nécessite Postgres avec la migration
`20260913010000_studio_render_engine.sql` appliquée ; `supabase start`
provisionne cela via des conteneurs Docker, bloqués pour la raison réseau
du §3 — aucun binaire serveur Postgres natif n'est disponible dans ce bac à
sable, seul le client `psql`). La revue ci-dessus est une lecture directe et
complète du SQL livré, pas une preuve d'exécution.

---

## 6. Redis — reconnexion, timeout, livraison dupliquée (test réel)

Redis natif (`redis-server 7.0.15`, disponible dans ce bac à sable) démarré
localement, worker BullMQ minimal connecté avec les mêmes options que
`worker.ts` (`maxRetriesPerRequest: null`) :

1. Job ajouté et traité normalement (`ready` → `processed`) — connexion de
   base validée.
2. `redis-cli shutdown nosave` pendant que le process reste vivant : la
   librairie tente une reconnexion en boucle (`reconnecting` répété), sans
   jamais faire planter le process worker/queue (aucune exception non
   interceptée). Une commande émise pendant la coupure reste en attente
   indéfiniment (comportement voulu de `maxRetriesPerRequest: null` :
   ne jamais perdre silencieusement une commande plutôt qu'échouer vite) —
   à noter comme compromis opérationnel documenté, pas un bug : une panne
   Redis prolongée bloque `dispatch()` plutôt que de le faire échouer.
3. Redis relancé sur le même port : une fois la connexion rétablie, le job
   dupliqué (§5) est bien retraité, confirmant la reprise réelle après
   coupure.

---

## 7. Concurrence et ressources (test réel, direct sur `renderTimeline`)

`renderTimeline()` ne dépend pas de Postgres/Redis — 4 rendus (270×480,
3 s, image statique) lancés en parallèle via `Promise.allSettled` :

| Mesure | Valeur |
|---|---|
| Jobs | 4/4 réussis |
| Temps mur (4 en parallèle) | 1,53 s |
| Temps individuel par job | 1,47–1,53 s (quasi identique — vrai parallélisme, pas de sérialisation cachée) |
| RSS process Node (échantillonné) | pic 111,8 Mio |

Le worker en production tourne avec `concurrency: 1` par processus BullMQ
(un rendu à la fois par conteneur, cf. Dockerfile/README) — la montée en
charge est horizontale (plusieurs conteneurs), pas un pool interne. La
mesure ci-dessus qualifie le pipeline FFmpeg lui-même sous parallélisme réel
CPU-bound, pas le comportement `concurrency:1` de `worker.ts` (qui nécessite
Postgres pour être exercé fidèlement, cf. §5).

---

## 8. Injection de pannes (test réel, direct sur `renderTimeline`)

| Panne injectée | Résultat observé |
|---|---|
| Abort mid-render (équivalent kill) 150 ms après le lancement d'un rendu 1080×1920/10 s | `RenderError("CANCELLED")` propre ; **aucun process FFmpeg orphelin** (`pgrep -af ffmpeg` vide après coup — `child.kill("SIGKILL")` sur abort fonctionne) |
| Média corrompu (PNG forgé, octets invalides) | `ASSET_UNREADABLE` (rejeté par `probe()`) |
| Asset manquant (chemin inexistant) | `ASSET_UNREADABLE` |
| Path traversal / tenant croisé sur `storage_key` | Bloqué dans les 3 cas testés, cas légitime toujours autorisé (§4) |

**Non testé dans ce bac à sable** (nécessite l'infrastructure conteneurisée
bloquée au §3) : panne Storage (échec d'upload vers Supabase Storage réel),
panne callback (RPC Postgres indisponible pendant un rendu en cours — le
code le gère via le `catch(() => undefined)` de la RPC finale
`studio_render_progress` en cas d'échec, `worker.ts:265-271`, mais ce
chemin n'a pas été déclenché en conditions réelles), panne Redis pendant un
rendu déjà en cours plutôt qu'au démarrage.

---

## 9. Idempotence

Couverte par construction : voir §5 (verrou `WHERE status='queued'`,
bail fencing, dédoublonnage `request_id`) et le test direct de livraison
dupliquée BullMQ (§5/§6) qui démontre que la garantie réelle est en base,
pas dans la queue.

---

## 10. Limites

Déjà implémentées dans le code livré, non réinventées ici :

| Limite | Valeur | Où |
|---|---|---|
| Durée totale timeline | 600 000 ms (10 min) | `render.ts:46` **et** `studio_request_render` (SQL, défense en profondeur) |
| Nombre de clips | 1 000 max | `render.ts:46` |
| Résolution source (probe) | ≤16384×16384 et ≤100 Mpx | `render.ts:188-190` |
| Résolution de sortie | Fixée côté SQL (1920×1080 ou 1080×1920/1350 selon ratio, moitié en `preview`) — jamais arbitraire côté client | `studio_request_render:57-59` |
| Taille par asset téléchargé | doit correspondre exactement à `file_size_bytes` déclaré | `worker.ts:164,187` |
| Taille totale téléchargée par job | 5 Gio | `worker.ts:164` |
| Taille de sortie | 1 Gio | `worker.ts:213` |
| Espace disque scratch par job | 10 Gio | `worker.ts:127` |
| RSS du process FFmpeg enfant | 1,5 Gio (kill au-delà) | `render.ts:130` |
| Timeout de rendu | 30–3600 s configurable (`STUDIO_RENDER_TIMEOUT_SECONDS`, clampé) | `worker.ts:108-114` |
| Concurrence | 1 rendu/processus (scaling horizontal par conteneur) | `worker.ts:299`, Dockerfile |
| Relances | 3 max par job | `studio_request_render:47` |

Aucun choix commercial n'a été fait ici (conformément à l'instruction) —
ce tableau documente l'existant.

---

## 11. Observabilité

- **Healthcheck** (`src/healthcheck.ts`) : vérifie uniquement Redis (la
  seule dépendance dont la perte doit tuer le process ; Supabase/FFmpeg
  indisponibles remontent en échec par-job, pas en `HEALTHCHECK` conteneur —
  choix documenté en commentaire dans le fichier).
- **Logs structurés JSON** : `completed`/`failed`/`dispatch_unavailable`/
  `queue_unavailable`, avec `job.id`, code d'erreur (classe de panne),
  `renderMs`, RSS Node/enfant. **Aucun secret** (clé service, URL Supabase,
  jeton) trouvé dans aucune ligne de log revue.
- **Écart réel constaté** : le `workspace_id`/tenant n'apparaît **pas**
  directement dans les lignes de log `completed`/`failed` (seul `job.id`
  y figure) — une corrélation par tenant nécessite une jointure a posteriori
  côté Postgres par `job.id`. À signaler comme amélioration mineure, pas un
  défaut bloquant : le tenant reste traçable, juste pas en un seul saut sur
  les logs bruts.

---

## 12. Studio — non-régression (exécution réelle)

```
npm ci --prefix apps/studio        → 421 paquets, 0 vulnérabilité
npm run typecheck (apps/studio)    → PASS
npm run lint (apps/studio)         → PASS
npm test (apps/studio)             → 260/260 PASS, 15 fichiers, 3,66 s
npm run build (apps/studio)        → PASS, 30,9 s réelles, 17 routes generées,
                                      TypeScript de build inclus, 0 erreur
```

Aucune régression détectée sur l'application Studio.

---

## 13. Ce qui n'a pas pu être vérifié ici, et pourquoi

Cause unique et confirmée par un test de contrôle croisé (§3) : la
politique réseau sortante de ce bac à sable bloque le CDN de Docker Hub
(`production.cloudfront.docker.com` et son miroir `public.ecr.aws`,
403 reproductible), alors qu'un autre registre (`mcr.microsoft.com`)
fonctionne normalement — ce n'est donc pas une panne réseau générale.
Conséquences en cascade, toutes dépendantes de conteneurs Docker Hub :

- `docker build` du Dockerfile du worker (base `node:24-bookworm-slim`).
- `apps/studio/scripts/e2e-gate.mjs`, qui lance `docker run redis:7.4.2-alpine`
  et `supabase start` (Postgres/GoTrue/Storage via conteneurs) — donc aussi
  toute exécution live de `studio_claim_render`/`studio_render_dispatch`/
  `studio_complete_render`, tout test E2E navigateur (Playwright) du Studio,
  et toute mesure de concurrence/charge au niveau `worker.ts` réel (avec
  Postgres) plutôt qu'au niveau `renderTimeline()` isolé (§7).
- Panne Storage/callback en conditions réelles (§8).

Ces points ne sont pas présentés comme passés — ils sont listés ici comme
la condition explicite manquante avant un verdict « READY FOR PREVIEW
DEPLOYMENT », conformément à la rigueur déjà appliquée par les lots
précédents de ce projet (Lots A–H : « Les passages intermédiaires rouges ne
sont pas présentés comme réussis »).

---

## 14. Recommandation

1. Qualifier l'accès à un environnement où `docker pull` depuis Docker Hub
   fonctionne (ou pré-provisionner les images `node:24-bookworm-slim` et
   `redis:7.4.2-alpine` dans un registre déjà autorisé par la politique
   réseau), puis exécuter `docker build` et
   `node apps/studio/scripts/e2e-gate.mjs` en entier pour couvrir §5/§7/§8
   en conditions réelles.
2. Envisager d'ajouter `workspace_id` aux lignes de log `completed`/`failed`
   du worker pour une corrélation tenant directe (§11) — amélioration
   mineure, non bloquante.
3. Aucune action de sécurité requise sur le périmètre revu (§4) : le code
   déjà livré applique correctement les protections attendues (pas de
   shell, chemins/tenant validés, filtres FFmpeg non injectables, RLS et
   séparation de privilèges SQL correctes, URLs signées courtes).

---

## Clôture

Commit de ce rapport : sur `claude/zen-goodall-n3opdc`, au-dessus de
`3cfbcd70` (baseline `integration/elsatia-post-qualification-fix-convergence-v1`).
Aucun autre fichier du dépôt modifié — tous les binaires substitués pour le
diagnostic FFmpeg (§3) ont été restaurés à l'identique avant ce commit, et
tous les scripts de sonde utilisés dans cette session sont restés hors du
dépôt (répertoire de scratch de la session, jamais copiés dans Git).
