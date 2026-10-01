# ELSATIA — Next.js : mémoire et capacité (V1)

| | |
|---|---|
| Date | 2026-09-30 → 2026-10-01 |
| Base | `integration/elsatia-canonical-train-v7` @ `547f0b6f` (**non modifiée**) |
| Branche | `claude/nice-goodall-3fk873` (base + harnais de mesure + 1 correctif + ce rapport) |
| Serveur mesuré | `next build` (Turbopack, Next 16.3.5) puis `next start`, `NODE_ENV=production`. **Jamais `next dev`.** |
| Machine | conteneur local, 4 vCPU, 16 Go RAM, sans swap ; Node 22.22.0 ; glibc (Ubuntu 24.04) |
| Backend | PostgreSQL 16 réel (359 migrations V7) + GoTrue v2.196.0 + PostgREST v12.2.3 + proxy local `:54321` (`scripts/local-postgres-bootstrap`, pile `pilot:acceptance:v3`) |
| Actions distantes | **Aucune.** Ni Supabase hébergé, ni Vercel, ni Production, ni merge. |

## 0. Verdict

**`ELSATIA MEMORY BASELINE ESTABLISHED`** — avec le correctif `7ac78cd` de cette branche.

Le constat Performance est **reproduit et expliqué**. Sur V7 tel quel (`547f0b6f`), la page `/planning`
fait monter `next start` à **~3 Go de RSS**, et cette mémoire **reste retenue après un GC forcé**. Le heap JS,
lui, ne retient que ~91 Mo. Cette mémoire native vient d'une seule cause, mesurée et isolée : un
`new Intl.DateTimeFormat(...)` construit **à chaque appel** d'un formateur de date, appelé par cellule du
planning. **Sur V7 tel quel, c'est un bloquant mémoire confirmé.** Avec le correctif, la même charge
retombe à 255 Mo après GC (§ 8).

Ce n'est **pas une fuite mémoire** au sens du § 10 de la mission :
- la mémoire est retenue après GC, mais dans l'allocateur natif (glibc), pas dans des objets JS ;
- sur des snapshots comparables, aucun objet identifiable n'augmente d'un cycle de charge à l'autre :
  4 cycles identiques donnent des comptes **strictement identiques** (§ 5).

Résumé chiffré (détails et fichiers bruts aux §§ 2-12) :

| Mesure | Avant (V7) | Après (`7ac78cd`) |
|---|---:|---:|
| `/planning` seule, 10 VU — RSS max | **3 092 Mo** | **550 Mo** |
| `/planning` seule, 10 VU — RSS après GC forcé | **2 773 Mo** | **255 Mo** |
| `/planning` + semaine d'affectations réaliste — RSS max / après GC | 2 609 / 1 585 Mo | 1 464 / 459 Mo |
| Micro-banc 200 000 formats — RSS après GC | 2 350 Mo (`new` par appel) | 58 Mo (instance réutilisée) |
| Profil réaliste mixte 25 VU — RSS max | 1 119 Mo | 744 Mo |
| Profil réaliste après 50 VU — RSS à T+15 après GC forcé | 615 Mo | 356 Mo |
| Profil réaliste 50 VU — p50 · débit | 6,2 s · 3,42 req/s | 1,3 s · 5,83 req/s |

Conditions attachées au verdict :
1. **Le correctif `7ac78cd` doit monter dans le train.** Sans lui, le verdict sur V7 est
   `ELSATIA MEMORY BLOCKER CONFIRMED`.
2. **Le plafond du heap V8 doit être explicite** (`--max-old-space-size`). V8 ignore la limite du cgroup :
   sous 512 Mo, on passe d'un OOM kill à 70 s à un pic de 292 Mo (§ 12).
3. **Le budget mémoire du conteneur doit inclure les PDF** : +300 à 400 Mo par PDF concurrent, hors
   processus Node (§ 9).

Estimation locale (§ 14, pas un SLA) :
- **1 Go** pour 25 utilisateurs réalistes ;
- **2 Go** conseillés à 50 utilisateurs, ou sous charge intensive ;
- avant cela, la limite CPU est atteinte.

Les autres constats mesurés n'ont **pas** été corrigés : ce sont des amplificateurs, pas la cause de la
rétention. Ils sont listés au § 13 avec leurs preuves :
- payload HTML de 17 Mo sur `/planning` ;
- 4,8 Mo sur `/dashboard` ;
- 4 645 actions liées sur `/pointage/gestion` ;
- Chromium PDF sans plafond de concurrence ;
- rétention unique après une rafale sur serveur froid.

---

## 1. Méthode

### 1.1 Build et démarrage

```
next build                       # build de production (Turbopack)
node --expose-gc -r scripts/perf/memory/sampler.cjs node_modules/next/dist/bin/next start -p 3000
```

`next start` tourne dans **un seul processus** (`next-server (v16.3.5)`), sans worker ni processus fils hors
PDF (vérifié avec `ps --forest`). `--expose-gc` ne sert qu'au GC forcé des mesures « après GC ». Il ne
modifie pas le comportement du GC.

### 1.2 Harnais (versionné dans `scripts/perf/memory/`)

| Fichier | Rôle |
|---|---|
| `sampler.cjs` | Préchargé dans le serveur. Une ligne JSON par seconde avec `rss`, `heapUsed`, `heapTotal`, `external`, `arrayBuffers`, `RssAnon`/`RssFile` (`/proc/self/status`), délai de boucle d'événements (p50/p99/max, `monitorEventLoopDelay`), ELU, et nombre et durée des GC mineurs et majeurs (`PerformanceObserver('gc')`). Commandes par fichier : `gc` (GC forcé) et `snap:<label>` (GC puis `v8.writeHeapSnapshot`). |
| `loadgen.mjs` | Utilisateurs virtuels (VU) authentifiés par une **vraie session GoTrue**, avec le cookie `@supabase/ssr` reconstruit (base64url, découpage en morceaux). Chaque VU enchaîne des GET de pages RSC réelles avec un temps de réflexion aléatoire (0,5×–1,5× la valeur). Aucune écriture. Scénarios : `mix`, `dashboard`, `planning`, `devis`, `factures`, `pointages`, `chantiers`, `pdf`. |
| `run-protocol.sh` | Fait tourner un serveur neuf à chaque mesure : idle 60 s → paliers de charge → T+0/T+1/T+5/T+15 → GC forcé → snapshot (option). Options : `LIMIT_MB` (cgroup), `SERVER_ENV` (allocateur), `NODE_EXTRA`, `APP_DIR`, `QUICK`, `CYCLES`. Enregistre aussi le RSS de l'arbre de processus (serveur + Chromium) toutes les 2 s. |
| `campaign.sh` | Campagnes reprenables : `routes`, `pdf`, `stress`, `leak`, `cold`, `limits`, `alloc`. |
| `analyze.mjs`, `summary.mjs` | Tableaux par phase et par run (ceux de ce rapport). |
| `heapdiff.mjs` / `heapdiff.py` | Différence de heap snapshots par (type, constructeur). La version Python sert au-delà de 512 Mo (limite de chaîne de Node). |
| `retainers.py`, `rootpath.py` | Chaînes de rétention, et plus court chemin depuis la racine GC (BFS sur les arêtes non faibles). |
| `intl-bench.mjs` | Micro-banc de la cause (§ 7). |
| `pdf-repro.mjs`, `pdf-hang-repro.mjs` | Reproductions PDF isolées (§ 9). |
| `seed-affectations.sql` | Semaine de planning réaliste (§ 8.2). |
| `restart-stack.sh` | Relance la pile Supabase locale sans reconstruire la base. |

Les données brutes de chaque run sont dans `docs/qualification/memory-v1/` : échantillons `mem.jsonl.gz`,
`phases.jsonl`, `tree.jsonl`, résultats `load-*.json`, tableaux `analyse.md`, et sorties des différences de
snapshots et des chemins de rétention.

### 1.3 Jeu de données

`scripts/perf/generate_fixture.sql` (fixture de qualification de capacité existante), sur la base du pilote :

| Tenant | Données |
|---|---|
| A (« BTP Fixture Principale ») | 40 salariés (38 actifs), 20 comptes, 173 chantiers, 5 323 devis / 78 890 lignes (dont 3 × 1 000 et 3 × 500 lignes), 3 210 factures / 27 982 lignes, 52 240 pointages, 5 025 événements planning, 28 408 entrées de journal |
| B | Tenant secondaire réduit |
| Pilote | Les 5 profils du pilote |

Comptes VU : 20 comptes du tenant A, 4 du tenant B et 4 du pilote. Au-delà de 28 VU, on ouvre plusieurs
sessions sur les mêmes comptes, comme plusieurs appareils.

Gestes propres au banc, non versionnés :
- mot de passe GoTrue posé sur les comptes de la fixture ;
- `abonnement_offre='business'` ;
- permission `mode_compte_depot` retirée au poste de la fixture : elle accordait **toutes** les permissions,
  et donc le mode « borne » qui redirige tout vers `/stock/borne`.

### 1.4 Écarts assumés

- **Sentry désactivé** : il n'y a pas de DSN localement (`enabled: NODE_ENV==='production' && dsn`). En
  production, `tracesSampleRate: 0.1` ajoute l'instrumentation OpenTelemetry, qui n'est pas mesurée ici.
- **Plafond du heap V8 = 8,6 Go** (`heap_size_limit`). V8 le dérive de la RAM de l'hôte (16 Go) quand aucun
  plafond n'est fixé : V8 laisse alors grossir le heap avant de collecter. Voir § 12 pour l'effet sous cgroup.
- PostgreSQL 16 au lieu de 17, et backend local dans le même conteneur. Le CPU est partagé entre Next,
  Postgres, PostgREST, GoTrue, le générateur de charge et Chromium. **Les latences sont donc pessimistes ; les
  mémoires du processus Next ne sont pas affectées.**
- Le conteneur de session a redémarré deux fois. Les runs interrompus (R1, et R2 après le cycle 2) sont
  conservés et signalés comme tels. Aucun chiffre de ce rapport ne vient d'un run interrompu sans le
  signaler.

---

## 2. Baseline : idle, 1, 10, 25, 50 utilisateurs (profil réaliste)

Scénario `mix` (poids par page) :

| Page | Poids |
|---|---:|
| dashboard | 4 |
| planning | 2 |
| devis liste | 2 |
| devis fiche | 3 |
| factures liste | 2 |
| facture fiche | 2 |
| pointage | 2 |
| pointage/gestion | 1 |
| chantiers | 1 |
| chantier fiche | 1 |
| clients | 1 |

Temps de réflexion moyen **5 s**. Paliers de 180 s, serveur neuf.

### 2.1 Avant correctif — run R2 (`docs/qualification/memory-v1/R2/`)

| Phase | RSS max | RSS fin | heapUsed max | heapTotal max | external max | arrayBuffers max | GC mineur n / ms | GC majeur n / ms | ELD p99 max | ELU moy |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| idle (60 s) | 231 | 204 | 96 | 126 | 5 | 1 | 1 / 1 | 3 / 26 | 33 ms | 0,00 |
| 1 VU | 646 | 641 | 192 | 219 | 28 | 25 | 99 / 2 204 | 14 / 268 | 433 ms | 0,04 |
| 10 VU | 1 004 | 937 | 524 | 563 | 62 | 58 | 541 / 20 102 | 21 / 668 | 719 ms | 0,29 |
| 25 VU | 1 119 | 1 119 | 613 | 645 | 91 | 87 | 995 / 38 911 | 25 / 1 470 | 670 ms | 0,60 |
| 50 VU | 1 231 | 1 182 | 678 | 723 | 140 | 136 | 1 149 / 48 485 | 32 / 2 076 | 1 149 ms | 0,76 |

Mémoires en Mo.

| Palier | req/s | p50 | p95 | p99 |
|---|---:|---:|---:|---:|
| 1 VU | 0,17 | 299 ms | 3,3 s | 4,3 s |
| 10 VU | 1,50 | 459 ms | 3,4 s | 5,7 s |
| 25 VU | 2,96 | 1,2 s | 5,9 s | 9,9 s |
| 50 VU | 3,42 | 6,2 s | 15,9 s | 20,2 s |

Le run R1 (même protocole, interrompu à T+5 par un redémarrage du conteneur) donne les mêmes ordres de
grandeur :
- RSS 766 / 882 / 963 / 1 304 Mo aux paliers ;
- après charge : heapUsed retombé à 105 Mo, RSS 750 Mo.

### 2.2 Après correctif — run R3 (`docs/qualification/memory-v1/R3-apres/`)

Même protocole que R2 (build après correctif, serveur neuf, même fixture). Mémoires en Mo.

| Phase | RSS max | RSS fin | heapUsed max | heapTotal max | external max | arrayBuffers max | GC mineur n / ms | GC majeur n / ms | ELD p99 max | ELU moy |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| idle (60 s) | 246 | 221 | 96 | 126 | 5 | 1 | 1 / 1 | 3 / 24 | 52 ms | 0,00 |
| 1 VU | **305** | 249 | 116 | 157 | 26 | 22 | 195 / 356 | 18 / 172 | 106 ms | 0,03 |
| 10 VU | **583** | 583 | 370 | 400 | 47 | 41 | 414 / 2 064 | 10 / 130 | 121 ms | 0,15 |
| 25 VU | **744** | 704 | 479 | 511 | 73 | 69 | 866 / 5 912 | 12 / 832 | 418 ms | 0,35 |
| 50 VU | **1 001** | 999 | 649 | 691 | 121 | 117 | 1 319 / 12 969 | 24 / 1 574 | 707 ms | 0,67 |

| Palier | req/s | p50 | p95 | p99 |
|---|---:|---:|---:|---:|
| 1 VU | 0,19 | 249 ms | 797 ms | 908 ms |
| 10 VU | 1,63 | 248 ms | 701 ms | 895 ms |
| 25 VU | 3,70 | 351 ms | 1,2 s | 6,0 s |
| 50 VU | **5,83** | 1,3 s | 4,8 s | 13,7 s |

Avant → après, par palier :

| Palier | RSS max | p50 | Débit | Temps de GC mineur |
|---|---|---|---|---|
| 1 VU | 646 → 305 Mo | | | 2 204 → 356 ms |
| 10 VU | 1 004 → 583 Mo | | | 20 102 → 2 064 ms |
| 25 VU | 1 119 → 744 Mo | 1,2 s → 351 ms | | 38 911 → 5 912 ms |
| 50 VU | 1 231 → 1 001 Mo | 6,2 s → 1,3 s | 3,42 → 5,83 req/s (+70 %) | 48 485 → 12 969 ms |

Le correctif rend aussi du CPU : une construction de `Intl.DateTimeFormat` coûte ~58 µs (§ 7).

### 2.3 Lecture

Le constat de départ (« 3,2 Go avec 25 utilisateurs, ne redescend pas ») est cohérent avec le mécanisme du
§ 7. La RSS **ne dépend pas du nombre d'utilisateurs, mais du nombre de rendus de `/planning`** (et, avec des
données réelles, des affectations qu'ils contiennent : § 8.2).

Le profil mixte à 5 s de réflexion ne touche `/planning` qu'environ 1 fois sur 10. La route isolée à 10 VU
(§ 6) suffit à atteindre 3 Go. Un vrai planning (affectations) multiplie le nombre de formateurs par rendu
par environ 7 (§ 8.2) ; 25 utilisateurs réels qui consultent le planning reproduisent donc l'ordre de
grandeur observé.

---

## 3. Métriques : que représente la RSS ?

Exemple : run R2, T+15 après 50 VU, après GC forcé.

| Mesure | Valeur | Commentaire |
|---|---:|---|
| RSS | 615 Mo | |
| heapUsed | 101 Mo | idle : 91 Mo, donc +10 Mo (code JIT, § 5) |
| heapTotal | 107 Mo | V8 a rendu ses pages |
| external / arrayBuffers | 5 / 1 Mo | aucun Buffer retenu |
| RssAnon | 535 Mo | idle : 126 Mo, donc **+409 Mo de mémoire native anonyme** hors V8 |

`/proc/<pid>/smaps` pendant la charge :
- 444 Mo dans des pages V8 (< 1 Mo chacune) ;
- **251 Mo dans `[heap]`** (arène principale glibc) ;
- 171 Mo dans des mappings anonymes de 1 à 60 Mo ;
- 15 threads.

La mémoire qui « ne redescend pas » est **de la mémoire native libérée par l'application mais conservée par
l'allocateur**. V8, lui, a rendu la sienne.

## 4. Après la charge : T+0, T+1, T+5, T+15

Mémoires en Mo.

| Run | Point | RSS | heapUsed | heapTotal | external | RssAnon |
|---|---|---:|---:|---:|---:|---:|
| R2 avant (50 VU, réaliste) | T+0 | 1 182 | 219 | 643 | 105 | 1 103 |
| | T+1 | 614 | 102 | 107 | 5 | 534 |
| | T+5 | 615 | 101 | 107 | 5 | 535 |
| | T+15 | 615 | 101 | 107 | 5 | 535 |
| | T+15 + GC forcé | **615** | **101** | 107 | 5 | 535 |
| R3 après (50 VU, réaliste) | T+0 | 999 | 573 | 635 | 100 | 917 |
| | T+1 | 364 | 99 | 106 | 5 | 282 |
| | T+5 | 364 | 99 | 105 | 5 | 282 |
| | T+15 | 356 | 98 | 105 | 5 | 275 |
| | T+15 + GC forcé | **356** | **98** | 105 | 5 | 275 |

À T+1 le heap JS est revenu au niveau d'idle, avant comme après le correctif. **Le GC forcé ne change rien** :
rien de collectable n'est retenu côté JS. La RSS reste stable ensuite ; elle ne croît pas.

La mémoire native retenue (RssAnon − idle) passe de **409 Mo à 149 Mo** avec le correctif. Le reste est le
comportement normal de glibc après des pics d'allocation (§ 12).

## 5. Heap snapshots et critère de fuite

### 5.1 Idle → après charge réaliste (R2)

Différence `idle` → `c1` (T+15 après 50 VU, après GC), `R2/heapdiff-idle-c1.txt` :
- +13,8 Mo et +54 000 objets ;
- dont +7,4 Mo de `(code)` : code optimisé par le JIT, échauffement ;
- et quelques Mo de formes et chaînes ;
- **aucun objet de requête, aucun client Supabase, aucune donnée métier, aucun Buffer**.

### 5.2 Test de fuite : 4 cycles identiques (`docs/qualification/memory-v1/leak/`)

Protocole : 50 VU intensifs (réflexion 0,5 s, 120 s) → T+1 → GC forcé → snapshot, répété 4 fois, sur un
serveur neuf. Comptes d'objets identifiables par snapshot :

| Snapshot | heapUsed (après GC) | `Immediate` | `_Response` (undici) | `ServerResponse` |
|---|---:|---:|---:|---:|
| c1 | 306 Mo | 13 595 | 11 248 | 441 |
| c2 | 307 Mo | 13 595 | 11 248 | 441 |
| c3 | 309 Mo | 13 595 | 11 248 | 441 |
| c4 | 309 Mo | 13 595 | 11 248 | 441 |

Différence c2 → c4 (`leak/diff-c2-c4.txt`) : **+1,3 Mo, exclusivement du code JIT.**

**Critère du § 10 : non rempli.** De la mémoire reste retenue après GC (§ 5.3), mais aucun objet identifiable
n'augmente entre snapshots comparables. **Pas de fuite mémoire.**

### 5.3 Rétention unique après une rafale sur serveur froid (`cold-froid/`, `cold-rechauffe/`)

Les 441 `ServerResponse` figés de c1 viennent du **premier** palier : 50 VU d'un coup sur un serveur qui n'a
encore rendu aucune page. Expérience dédiée, avec un serveur neuf pour chaque cas :

| Démarrage | heapUsed après GC | `ServerResponse` retenus | RSS après GC |
|---|---:|---:|---:|
| Froid, rafale de 50 VU | 228 Mo | 229 | 708 Mo |
| Réchauffé (1 VU pendant 90 s), puis 50 VU | **97 Mo** (idle 91) | **0** | 552 Mo |

Plus court chemin depuis la racine GC (`cold-froid/rootpath-serverresponse.txt`) :

```
global.fetch (fetch patché par Next) ._nextOriginalFetch
  → fermeture de createDedupeFetch (React.cache, node_modules/next/dist/server/lib/dedupe-fetch.js)
  → WeakMap → Promise (store AsyncLocalStorage de la requête) → afterContext.onClose → ServerResponse
```

Il s'agit du cache de déduplication `fetch` par requête interne à Next 16. Lors d'une rafale sur serveur
froid, certaines portées de requête restent atteignables. La rétention est :
- **bornée** : identique de c1 à c4 ;
- **unique** : elle n'est pas recréée par les rafales suivantes ;
- **évitée par un échauffement**.

Elle relève du framework, pas d'ELSATIA. Recommandation d'exploitation : envoyer quelques requêtes de chauffe
(sonde de disponibilité) avant d'ouvrir le trafic (§ 13).

### 5.4 Artefact de mesure à connaître

`v8.writeHeapSnapshot()` sur un heap de ~300 Mo fait passer le processus de **820 Mo à 5 047 Mo de RSS** (68 s,
`leak/`). Cette mémoire reste retenue par l'allocateur ensuite. Les chiffres « 5 Go » des cycles c2-c4 du test
de fuite sont donc **un artefact du snapshot, pas de l'application** : les mesures valides sont celles
d'avant le snapshot.

**Ne jamais prendre de heap snapshot sur un serveur de production en service.**

### 5.5 Inventaire demandé

Résultat des snapshots et de l'inventaire du code (§ 5.6) :

| Catégorie | Constat |
|---|---|
| Caches | aucun cache applicatif en mémoire de processus |
| Closures | aucune croissance |
| Clients Supabase | aucun singleton ; créés par requête ; aucun retenu hors § 5.3 |
| Caches React / Next | `React.cache` limité à la requête ; seule rétention : celle du § 5.3 |
| Images | `sharp` n'est importé nulle part dans `src/` |
| PDF | Buffers non retenus ; mémoire hors processus (§ 9) |
| Grands tableaux | non retenus ; ce sont des pics par requête (§ 13) |
| Données de requête | non retenues hors § 5.3 |
| Timers | aucun `setInterval` côté serveur ; `handles` revenu à 1 au repos |

### 5.6 Inventaire des caches applicatifs (mission § 7)

Recherche exhaustive dans `src/` :
- `new Map/Set/WeakMap` au niveau module ;
- `unstable_cache`, `'use cache'`, `cacheLife`, `cacheTag`, `React.cache` ;
- `globalThis`, LRU ;
- timers au niveau module ;
- singletons de clients.

`next.config.ts` ne définit ni `cacheComponents`, ni `cacheHandler`, ni `cacheMaxMemorySize`, et le layout
racine est `force-dynamic`.

| Cache (fichier, dernière modif.) | Clé | Tenant dans la clé ? | TTL | Taille max | Éviction |
|---|---|---|---|---|---|
| `lib/elsatia-identity/config.ts` `let cache` (2026-09-27) | variables d'environnement (émetteur et clés) | non (aucune donnée tenant) | jusqu'à un changement d'environnement | **1 entrée** | remplacement |
| `lib/push.ts` `configure` (2026-09-11) | aucune (booléen VAPID) | sans objet | processus | 1 booléen | — |
| `getContexteEntreprise` = `React.cache` (`lib/entreprise.ts`, 2026-09-20) | arguments, **portée d'une requête** | contexte de la requête | fin de requête | une requête | GC |
| `permissionsUtilisateur` = `React.cache` (`lib/permissions.ts`, 2026-09-27) | identité du contexte, portée d'une requête | oui (par contexte) | fin de requête | une requête | GC |
| `activeFeaturesForCompany` = `React.cache` (`lib/feature-flags.ts`, 2026-07-28) | entreprise, portée d'une requête | oui | fin de requête | une requête | GC |
| `lireEtatAssistance` = `React.cache` (`lib/assistance-server.ts`, 2026-09-08) | portée d'une requête | contexte | fin de requête | une requête | GC |
| `api/referentiels/vehicules` `fetch(…, { next: { revalidate: 604800 } })` (2026-07-31) | URL NHTSA (marque validée) | non (donnée publique) | 7 jours | Data Cache Next par défaut (en mémoire, borné par le `cacheMaxMemorySize` par défaut) | LRU Next |
| Cache de déduplication `fetch` de Next (`createDedupeFetch`, framework) | URL, par requête | portée de la requête | fin de requête | une requête | GC ; voir l'exception du § 5.3 |

Les autres `Map`/`Set` de niveau module sont des **constantes** construites une fois à partir de littéraux
(listes de permissions, tarifs, catégories) et ne croissent pas. Il n'y a aucun client Supabase, OpenAI ou
Stripe singleton, ni de stockage mémoire pour le rate limit (RPC `consommer_rate_limit`).

**Aucun cache récent ne présente de clé tenant manquante, de TTL absent sur une donnée tenant, ni de
croissance sans borne.**

## 6. Routes testées séparément

Paramètres : 10 VU, réflexion 1 s, 120 s, serveur neuf, puis T+1 et GC forcé.
Fichiers : `avant/routes-summary.md` et `apres/`.

| Route (avant) | req/s | p50 | p95 | Ko / réponse | RSS max | heapUsed max | RSS après GC | heapUsed après GC |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `/dashboard` | 2,17 | 2,9 s | 3,4 s | **4 812** | 744 | 401 | 345 | 91 |
| `/planning` | 4,03 | 982 ms | 1,6 s | 166 | **3 092** | 382 | **2 773** | **91** |
| `/devis` + fiches | 6,17 | 269 ms | 584 ms | 124 | 600 | 396 | 260 | 92 |
| `/factures` + fiches | 6,63 | 228 ms | 433 ms | 85 | 557 | 367 | 245 | 91 |
| `/pointage` + `/pointage/gestion` | 1,40 | 5,7 s | 9,1 s | **3 154** | 1 058 | 728 | 366 | 96 |
| `/chantiers` + fiches | 2,64 | 599 ms | 1,2 s | 376 | 921 | 576 | 293 | 91 |
| Réserves | — | | | | | | | |

Mémoires en Mo.

Réserves : pas de page Réserves dans Gestion Pro. Seule la route de synchronisation
`chantiers/[id]/reserves` (POST) existe ; Réserves est une application séparée (`apps/reserves`), hors du
périmètre de ce serveur.

**Seule `/planning` retient de la mémoire après GC** : 2,7 Go natifs, avec un heap revenu à 91 Mo. Les autres
routes reviennent à 245-366 Mo.

`/dashboard` et `/pointage/gestion` produisent les plus gros pics de heap et de CPU, parce que leurs réponses
font 3 à 5 Mo. Mais elles ne retiennent rien : ce sont des amplificateurs de pic et de latence (§ 13), pas la
cause de la rétention.

## 7. Cause : `new Intl.DateTimeFormat` à chaque appel

`src/app/(app)/planning/page.tsx` (V7) :

```ts
const iso = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(d);
const dateFr = (d: Date, large = false) => new Intl.DateTimeFormat("fr-FR", …).format(d);
```

Ces helpers sont appelés dans des boucles :
- `employés × 7 jours × (clé + « aujourd'hui ? » + filtre par affectation)` ;
- `7 × affectations` pour le message de partage ;
- `iso(debut)` par carte.

Ordre de grandeur par rendu :
- ~570 constructions avec la fixture (0 affectation) ;
- **~4 000** pour une semaine réelle de 40 salariés (190 affectations).

Chaque `Intl.DateTimeFormat` :
- enveloppe des objets ICU natifs (format, calendrier, fuseau, générateur de motifs) ;
- n'est libéré que lorsque le GC collecte son enveloppe JS ;
- or cette enveloppe est minuscule : V8 ne « voit » pas la pression mémoire native ;
- puis glibc conserve les pages libérées.

Micro-banc hors Next (`scripts/perf/memory/intl-bench.mjs`, Node 22) :

| Mode | Durée | RSS fin de boucle | RSS après GC | RSS GC + 2 s |
|---|---:|---:|---:|---:|
| `new Intl.DateTimeFormat(...).format()` × 200 000 | 11 696 ms | 2 930 Mo | 2 821 Mo | **2 350 Mo** |
| Instance réutilisée × 200 000 | **182 ms** | 58 Mo | 58 Mo | **58 Mo** |
| `toLocaleDateString(locale, options)` × 100 000 | 5 800 ms | — | 136 Mo | 136 Mo |
| `new Intl.NumberFormat(...)` × 100 000 | 2 598 ms | — | 124 Mo | 124 Mo |
| `toLocaleString` nombre × 100 000 | 2 506 ms | — | 61 Mo | 61 Mo |

Seul `new Intl.DateTimeFormat` construit par appel est pathologique : heapUsed reste à 27 Mo tandis que la RSS
dépasse 2,9 Go. Les autres formes sont lentes, mais ne retiennent pas.

Autres helpers du même type trouvés dans `src/` :
- `pointage/page.tsx` et `pointage/gestion/page.tsx` (`heure`, `dateHeure`, par session et par contrôle) ;
- `lib/employes.ts` (`formatDateFr`) ;
- `lib/planning.ts` ;
- `lib/paie.ts` (`formaterMois`) ;
- `lib/version.ts` ;
- `flotte`, `outillage`, `tresorerie` ;
- `CommandeEditor`.

## 8. Correctif et avant / après

### 8.1 Correctif (`7ac78cd`)

Les formateurs sont hissés en **constantes de module**, avec des locales et options identiques. Les
instances `Intl.DateTimeFormat` sont immuables et sans état : on peut les partager entre requêtes et entre
tenants, car elles ne contiennent aucune donnée.

- **Fichiers corrigés** : 11. Ce sont toutes les formes « par appel » de `src/`, et pas seulement `/planning`
  (même cause).
- **Fichiers non modifiés** : les appels uniques (`dashboard` : 6 libellés de mois, `assistant` : une date).
- **Garde** : `src/lib/perf/formateurs-intl.test.ts`. Elle échoue sur V7 (14 emplacements) et passe après.
- **Vérifications** : `tsc --noEmit` OK ; ESLint des fichiers modifiés OK ; Vitest `src/lib` 123 fichiers,
  1 462 tests OK ; `next build` OK.
- **Hors correctif** : le patch « actions liées » de `/pointage/gestion` a été préparé, mais **n'est pas
  appliqué**. Il n'agit pas sur la rétention (§ 13). Il est conservé pour mémoire dans
  `docs/qualification/memory-v1/pointage-gestion-actions-liees.patch.txt`. Ce fichier est un diff combiné :
  ses parties `Intl` sont celles déjà livrées dans `7ac78cd` ; seules les parties `.bind` → champs cachés
  restent non appliquées.

### 8.2 Avant / après (même build hormis le correctif, même protocole, serveur neuf)

Fichiers : `avant-apres-planning.md`, `avant/`, `apres/`.

| Cas | Build | req/s | p50 | RSS max | heapUsed max | RSS après GC | RssAnon après GC |
|---|---|---:|---:|---:|---:|---:|---:|
| `/planning`, fixture (0 affectation), 10 VU | avant | 4,03 | 982 ms | 3 092 | 382 | **2 773** | 2 694 |
| | **après** | 4,34 | 884 ms | **550** | 356 | **255** | 174 |
| `/planning` + semaine réaliste (570 affectations sur 3 semaines), 10 VU | avant | 0,49 | 15,3 s | 2 609 | 913 | **1 585** | 1 503 |
| | **après** | 0,63 | 12,0 s | **1 464** | 776 | **459** | 378 |

Mémoires en Mo.

Le pic qui subsiste dans le cas réaliste (1,4 Go, p50 12 s) vient du **second amplificateur** de `/planning`,
mesuré et non corrigé (§ 13.1) : un HTML de 17,4 Mo par page.

## 9. PDF (grosses générations)

Le moteur est `src/lib/pdf/generer.ts` :
- `puppeteer-core` + `@sparticuz/chromium` (drapeaux Lambda : `--single-process`, `--no-zygote`) ;
- **un Chromium neuf par PDF**, sans réutilisation ni plafond de concurrence ;
- Chromium navigue vers `/imprimer/devis/[id]`, servi par le même serveur.

Test : devis de 500 et 1 000 lignes du tenant A (PDF de 1,6 à 1,8 Mo), réflexion 0 (`avant/pdf/`).

| Concurrence | PDF/s | p50 | Processus Next : RSS max | **Arbre de processus : RSS max** | Bloqués (> 300 s) |
|---|---:|---:|---:|---:|---:|
| 1 | 0,40 | 1,7 s | 338 Mo | 681 Mo | 0 / 36 |
| 5 | 0,38 | 2,8 s | 510 Mo | **2 101 Mo** | 1 / 118 |
| 10 | 0,27 | 4,9 s | 510 Mo | **4 137 Mo** | 5 / 96 |

Le processus Next reste sous 510 Mo et retombe à 368 Mo après GC. **La mémoire du PDF est dans Chromium**,
hors du processus Node : environ 290 à 430 Mo par instance (processus principal) plus ses fils. Elle est donc
**invisible dans `process.memoryUsage()`, mais pas dans la limite du conteneur**.

Ce qui a été observé :
- 6 générations sur 250 sont restées bloquées jusqu'au délai du client (300 s), Chromium vivant pendant tout
  ce temps ;
- à l'arrêt du serveur, **3 Chromium (~290 Mo chacun) ont été rattachés à `init`** ;
- ils ignoraient `SIGTERM`, et seul `SIGKILL` les a arrêtés.

La reproduction isolée **n'a pas** reproduit le blocage :
- 10 Chromium concurrents × 4 tours sur du contenu statique : 0 blocage ;
- `goto` en échec suivi de `close()` : se ferme en 57 ms.

La cause exacte du blocage **n'est pas établie**, et aucun correctif n'est appliqué faute de cause prouvée.
Recommandations au § 13.

Pour mémoire, `@sparticuz/chromium` décompresse un binaire de 200 Mo dans `/tmp`. Sur un `/tmp` en `tmpfs`,
ces 200 Mo comptent comme de la mémoire du conteneur.

## 10. Concurrence 10 / 25 / 50 (scénarios réalistes)

Voir le § 2 (réflexion 5 s) et le test de fuite du § 5.2 (réflexion 0,5 s, 50 VU). Le serveur est **limité
par le CPU avant de l'être par la mémoire** : ELU 0,6 à 25 VU et 0,76 à 50 VU. À 50 VU intensifs :
- p50 de 8 à 17 s ;
- débit de 1 à 3,6 req/s ;
- en partie à cause des pages de 3 à 17 Mo (§ 13).

Charge intensive (réflexion 0,5 s) :

| Run | Build | VU | req/s | p50 | p95 | RSS max | heapUsed après GC |
|---|---|---:|---:|---:|---:|---:|---:|
| `leak` c1 | avant | 50 | 3,64 | 8,4 s | 18,2 s | 932 Mo avant snapshot | 306 Mo (rafale froide, § 5.3) |
| `limit-2048-defaut` | après | 25 | 6,02 | 2,8 s | 5,0 s | 1 110 Mo | 112 Mo |
| `alloc-glibc` | après | 25 | 6,58 | 2,7 s | 4,3 s | 1 038 Mo | 165 Mo |
| `limit-1024-intense-50` | après | 50 | 6,55 | 5,4 s | 10,7 s | 965 Mo (cgroup au plafond de 1 Go) | 496 Mo (rafale froide) |

Le débit plafonne à ~6,5 req/s : c'est la saturation CPU (4 vCPU partagés avec toute la pile). La mémoire,
elle, ne croît plus au-delà de ~1,1 Go.

## 11. Critère de fuite (§ 10 de la mission)

| Condition | Résultat |
|---|---|
| Mémoire retenue après GC | **Oui** : native, dans l'allocateur (§ 3, § 7) ; plus 137 à 215 Mo de heap après une rafale à froid (§ 5.3) |
| Objets ou références identifiables qui augmentent entre snapshots | **Non** : c1 = c2 = c3 = c4 (§ 5.2) |

**Conclusion : pas de « memory leak ».** C'est une rétention native causée par un motif de code mesuré (§ 7),
corrigée (§ 8).

## 12. Limite de conteneur simulée (512 Mo / 1 Go / 2 Go)

Méthode : un cgroup v1 `memory` est dédié au seul serveur Next et à ses fils
(`memory.limit_in_bytes = memsw`, swappiness 0). Le reste du conteneur n'est pas concerné, et l'OOM killer ne
peut toucher que ce serveur. Charge : 25 VU, réflexion 0,5 s, scénario `mix`, 180 s, build **après correctif**.

Données : `apres/limit-*`, `apres/limites-allocateur-summary.md`.

**Constat préalable : V8 ignore la limite du cgroup.** `heap_size_limit` reste à ~8,2 Go même sous 512 Mo
(Node 22, cgroup v1). Sans `--max-old-space-size`, V8 laisse donc le heap grossir comme s'il disposait de la
RAM de l'hôte, et ne collecte pas assez tôt.

| Limite | Plafond heap V8 | Charge | Issue | Pic cgroup | RSS max | heapUsed max | req/s | p50 |
|---|---|---|---|---:|---:|---:|---:|---:|
| 2 048 Mo | défaut (8,2 Go) | 25 VU intensifs | ✅ survit | 1 114 Mo | 1 110 | 708 | 6,02 | 2,8 s |
| 1 024 Mo | défaut | 25 VU intensifs | ✅ survit | 943 Mo | 1 001 | 680 | 6,10 | 2,9 s |
| 1 024 Mo | défaut | 50 VU intensifs | ✅ survit, **au plafond** (1 024 Mo) | 1 024 Mo | 965 | 645 | 6,55 | 5,4 s |
| 512 Mo | défaut | 25 VU intensifs | ❌ **OOM kill** à 43 s | 512 Mo | 532 | 271 | — | — |
| 512 Mo | 307 Mo | 25 VU intensifs | ❌ **V8 heap out of memory** à 124 s (live ≈ 292 Mo) | 512 Mo | 491 | 296 | — | — |
| 512 Mo | défaut | 25 VU réalistes (5 s) | ❌ **OOM kill** à 47 s | 512 Mo | 546 | 316 | — | — |
| 512 Mo | défaut | 10 VU réalistes (5 s) | ❌ **OOM kill** à 70 s | 512 Mo | 573 | 372 | — | — |
| 512 Mo | **256 Mo** | 10 VU réalistes (5 s) | ✅ **survit** | **292 Mo** | 341 | 156 | 1,61 | 297 ms |

« Intensifs » : réflexion 0,5 s, scénario `mix`. Les morts surviennent pendant l'échauffement (43 à 70 s
après le début de la charge).

Les compteurs `oom_kill` des fichiers `cgroup.json` sont cumulatifs par répertoire cgroup : le run
« 512 / 307 Mo » réutilise le cgroup du run précédent. Sa propre mort est l'abandon V8
(`server-fatal.txt`), pas un second OOM kill.

**Allocateur natif** (25 VU intensifs, après correctif, serveur neuf, `apres/alloc-*`) :

| Allocateur | RSS max | RSS après GC | heapUsed après GC |
|---|---:|---:|---:|
| glibc | 1 038 Mo | 501 Mo | 165 Mo |
| `MALLOC_ARENA_MAX=2` | 1 108 Mo | 450 Mo | 119 Mo |
| jemalloc 5.3 (`LD_PRELOAD`) | 1 118 Mo | 583 Mo | 339 Mo |

Une fois le correctif appliqué, les écarts sont faibles et dominés par la rétention « rafale à froid »
(§ 5.3), dont l'ampleur varie d'un run à l'autre (heapUsed après GC de 119 à 339 Mo). **Aucun changement
d'allocateur n'est recommandé** sur ces données.

## 13. Autres constats mesurés (non corrigés) et recommandations

### 13.1 `/planning` : 17,4 Mo de HTML par page avec une semaine réelle

Mesure : **60 047 `<option>`**, 762 `<form>` et 388 `<details>` par page.

Cause : chaque affectation rend `FormulaireModifierAffectation`, qui contient un `<select>` de tous les
chantiers ouverts (158). Ce formulaire est rendu **deux fois**, dans la vue mobile et dans la vue tableau.

Conséquence : p50 de 12 à 15 s et heap de 776 à 913 Mo à 10 VU sur cette seule route.

Recommandation : un seul formulaire d'édition partagé (dialogue), ou un chargement à la demande.
C'est un changement d'interface, hors du périmètre d'un correctif ciblé.

### 13.2 `/dashboard` : 4,8 Mo, 2 686 alertes

`dashboard_indicateurs` renvoie **toutes** les factures en retard et tous les devis expirés, et la page
sérialise toutes les alertes. Avec 5 ans d'historique, on obtient 1 492 alertes de facturation et
1 194 alertes commerciales.

Constat annexe : `.in("alerte_cle", [2 686 ids])` génère une URL PostgREST d'environ 120 Ko. Cela passe ici,
mais dépasse les limites d'URL usuelles des proxys (8 à 16 Ko) devant un Supabase hébergé.

Recommandation : borner les alertes renvoyées (top N par domaine, plus un compteur).

### 13.3 `/pointage/gestion` : 4 645 actions serveur liées par rendu

Avec 40 salariés : ~1 550 pointages par mois × 3 `.bind()`. Next chiffre les arguments liés de chaque
formulaire, à chaque rendu.

Conséquence : 3,1 à 5,3 Mo de HTML par page et un p50 de 3 à 5,7 s, que la latence est mesurée seule (1 VU)
ou sous charge.

Ce coût porte sur le CPU et la latence, pas sur la rétention : RSS après GC de 366 Mo. Un patch prêt
(champs cachés + action unique, autorisation inchangée côté serveur) est fourni, non appliqué.

### 13.4 PDF

Recommandations :
1. **Plafond de concurrence par instance** (sémaphore, 2 par exemple) : chaque PDF concurrent coûte de 300 à
   400 Mo hors processus Node.
2. **Chien de garde** : délai global, puis `browser.process().kill('SIGKILL')` si `close()` ne rend pas la
   main.
3. À terme, envisager un worker PDF séparé du serveur web.

### 13.5 Exploitation

- Réchauffer chaque instance avant de lui envoyer du trafic (§ 5.3).
- Fixer `--max-old-space-size` en cohérence avec la limite du conteneur (§ 12). Sous 512 Mo, ce réglage
  fait la différence entre un OOM kill à 70 s et un pic à 292 Mo.
- Ne pas prendre de heap snapshot en production (§ 5.4).
- Allocateur : voir § 12.

## 14. Limite d'exploitation estimée localement

Il s'agit d'une **estimation locale, pas d'un SLA hébergé**. Elle est mesurée sur 4 vCPU partagés avec la base
et les services, avec une fixture d'environ 40 salariés.

Hypothèses :
- une instance `next start` ;
- build avec correctif ;
- scénario mixte ;
- 4 vCPU partagés avec la base et les services.

| Charge | Mémoire de conteneur suffisante (mesurée) | Latence p50 (après) | Commentaire |
|---|---|---|---|
| 1 à 10 utilisateurs réalistes | **512 Mo avec `--max-old-space-size=256`** (pic 292 Mo) | ~250-300 ms | 512 Mo sans plafond de heap : OOM |
| 25 utilisateurs réalistes | **1 Go** (RSS max 744 Mo, R3) | ~350 ms | |
| 50 utilisateurs réalistes | **1 Go**, juste (RSS max 1 001 Mo, R3) ; **2 Go** conseillés | ~1,3 s | Limite CPU atteinte (ELU 0,67) |
| 25-50 utilisateurs intensifs | 1 Go tient, au plafond ; **2 Go** conseillés | 2,8 à 5,4 s | Limité par le CPU |
| PDF | **+300 à 400 Mo par PDF concurrent**, hors processus Node | | 10 PDF concurrents = 4,1 Go d'arbre. Plafonner (§ 13.4). |

Sans le correctif, aucune de ces enveloppes n'est stable : la mémoire grimpe avec le nombre de rendus de
`/planning` (2,7 Go retenus à 10 VU sur cette seule route, jusqu'à ~4 000 formateurs par rendu avec un vrai
planning).

**Réglage recommandé** : `NODE_OPTIONS=--max-old-space-size=<~50-60 % de la limite du conteneur>`, en plus du
budget PDF. Raison : V8 ne lit pas la limite cgroup v1 (§ 12).

## 15. Reproduire

```bash
# pile locale (une fois) puis fixture
npm run pilot:acceptance:v3
psql -d pilot_gp -f scripts/perf/generate_fixture.sql      # + gestes du § 1.3
scripts/perf/memory/restart-stack.sh                         # après un redémarrage du conteneur
next build
scripts/perf/memory/run-protocol.sh <out> 5000 1 10 25 50   # baseline réaliste
scripts/perf/memory/campaign.sh <out> routes pdf leak cold limits alloc
node scripts/perf/memory/analyze.mjs <out>                  # tableaux par phase
node --expose-gc scripts/perf/memory/intl-bench.mjs par-appel 200000
```
