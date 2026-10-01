# ELSATIA GP — Pages lourdes et capacité PDF (V1)

| | |
|---|---|
| Date | 2026-10-01 |
| Base | `integration/elsatia-canonical-train-v8` @ `53b4bc7` (verdict `CANONICAL TRAIN V8 LOCALLY QUALIFIED`, 371 migrations), **non modifiée** |
| Branche | `claude/beautiful-albattani-gbd2h7` (base + 9 commits, aucune migration) |
| Sources étudiées | Mémoire `claude/nice-goodall-3fk873` (correctif Intl `7ac78cd` porté, patch « actions liées » appliqué, harnais repris) ; Performance `claude/brave-carson-cj8ofz` (C2-C4 déjà dans V8, C1 non porté par V8) ; Finance `claude/confident-brown-sndsqb` (**étudiée, non portée** : § 4.4) |
| Serveur mesuré | `next build` (Turbopack, Next 16.3.5) puis `next start`, `NODE_ENV=production`. **Jamais `next dev`.** |
| Machine | conteneur 4 vCPU, 16 Go, sans swap ; Node 22.22.0 ; cgroup v1 |
| Backend | PostgreSQL 16 réel (371 migrations V8) + GoTrue v2.196.0 compilé + PostgREST v12.2.3 (`db-max-rows = 1000`) + proxy local `:54321` (`scripts/local-postgres-bootstrap`) |
| Données | fixture de capacité `scripts/perf/generate_fixture.sql` (tenant A : 38 salariés actifs, 150 chantiers, 5 012 devis, 3 000 factures, 46 587 pointages sur 5 ans ; septembre 2026 : 1 558 pointages) + semaine d'affectations réaliste (`scripts/perf/memory/seed-affectations.sql`, 570 affectations sur 3 semaines) |
| Actions distantes | **Aucune.** Ni Supabase hébergé, ni Vercel, ni Production, ni merge. |

## 0. Verdict

**`ELSATIA GP CAPACITY LOCALLY QUALIFIED`** — sous les 3 conditions d'exploitation du § 0.2.

Les plus gros risques de performance identifiés avant le pilote externe sont fermés, chacun **mesuré avant
et après** sur le même jeu de données, avec des serveurs neufs :

| Risque | V8 @ `53b4bc7` | Après | Preuve |
|---|---|---|---|
| Mémoire native retenue (`new Intl.DateTimeFormat` par appel) — `/planning` seule, 10 VU | RSS max **3 383 Mo**, **3 094 Mo après GC** | 574 Mo, **311 Mo après GC** | § 1 |
| `/planning` (semaine réelle) | 1 281 Ko, 380 actions liées chiffrées, TTFB 918 ms | **688 Ko**, 0, TTFB 586 ms ; markup HTML **identique octet pour octet** | § 2 |
| `/dashboard` (2 686 alertes) | **4 932 Ko**, URL PostgREST ~120 Ko | **207 Ko** (résumé + 30, suite à la demande), aucune alerte perdue | § 3 |
| `/pointage/gestion` (septembre, 1 558 pointages) | **3 540 Ko**, **3 000 actions liées**, 3 003 formulaires | **465 Ko**, **0**, 303 | § 4 |
| PDF : Chromium sans plafond, orphelins | 2 Go + 6 VU PDF : **OOM kill + 6 Chromium orphelins** (1,36 Go) | file bornée : 0 erreur, conteneur vivant, **0 orphelin** (y compris SIGKILL du serveur) | §§ 5-6 |
| Conteneur 1 Go, 25 VU intensifs | **OOM kill** | vivant (pic 865 Mo ; 561 Mo avec heap plafonné) | § 7 |
| Profil réaliste 50 VU | 3,92 req/s, p50 5,3 s, RSS max 1 957 Mo, **1 349 Mo après GC** | **4,72 req/s**, p50 3,1 s, RSS max **982 Mo**, **426 Mo après GC** | § 9 |

### 0.1 Ce qui n'est **pas** fermé (et pourquoi ce n'est pas un bloquant de capacité)

1. **`/pointage/gestion` garde un TTFB de ~3,1 s** (1 utilisateur, mois de 1 558 pointages). Cause précise,
   isolée par `EXPLAIN ANALYZE` sous `authenticated` : la policy RLS `peut_consulter_pointage_employe` est
   évaluée **par ligne** (~1,3 ms/ligne, 57 582 buffers, **2,0 s pour 1 558 lignes**, § 4.2). Le HTML et
   les actions liées ne sont plus en cause. Le correctif qualifié existe : RPC `pointages_equipe_periode`
   (migration `20260928000814`, branche Finance `60e2065`), qui corrige aussi la troncature à 1 000 lignes
   (blocker B2 V8). Il n'est pas porté ici (§ 4.4). La mémoire et la stabilité ne sont pas en jeu (RSS
   après GC 268 Mo sur la route isolée) : c'est une latence d'une page de responsable, pas un risque de
   capacité du serveur.
2. **Le débit plafonne vers 5 req/s** sur 4 vCPU partagés avec Postgres, PostgREST, GoTrue, le générateur
   de charge et Chromium (ELU 0,68 à 50 VU). Les latences sont pessimistes ; ce n'est pas un SLA hébergé.

### 0.2 Conditions d'exploitation

1. **Plafond de heap explicite** : `NODE_OPTIONS=--max-old-space-size=…` selon le tableau du § 7.4. Sans lui,
   un conteneur de 512 Mo est tué par l'OOM killer même à 10 utilisateurs réalistes, après correctifs.
2. **Budget PDF** : `PDF_CONCURRENCE` cohérent avec la mémoire du conteneur (§ 7.4). **Pas de PDF sous
   1 Go.**
3. **Chauffe avant trafic** (`scripts/perf/capacity/warmup.mjs`, ~10 s) : divise par deux la rétention
   après une rafale à froid (§ 8).

Recommandé avant d'accueillir des entreprises de plus de ~1 000 pointages par mois : intégrer la
migration Finance `20260928000814` (§ 4.4).

---

## 1. Formateurs `Intl` (port de `7ac78cd`)

### 1.1 Port

`7ac78cd` (branche Mémoire) a été écrit sur V7. Contexte comparé fichier par fichier entre V7 `547f0b6f`
et V8 `53b4bc7` :

| Fichiers | V7 → V8 | Traitement |
|---|---|---|
| `flotte`, `outillage`, `pointage`, `pointage/gestion`, `tresorerie`, `CommandeEditor`, `lib/employes`, `lib/paie`, `lib/planning`, `lib/version` (10) | **identiques** | version de `7ac78cd` reprise telle quelle |
| `planning/page.tsx` | **divergé** (C3 porté en V8 : `ModifierAffectationDiffere`) | **pas de cherry-pick** : formateurs hissés à la main dans le fichier V8 |
| `src/lib/perf/formateurs-intl.test.ts` | nouveau | garde Vitest repris |

Garde Vitest : **14 emplacements en échec sur V8 @ `53b4bc7`**, 0 après (commit `91adfaf`). Aucun
nouveau motif « par appel » n'est apparu dans `src/` entre V7 et V8. Hors périmètre GP : 2 formateurs
« par appel » dans `apps/tools/src/lib/exports/*pdf.ts` (exports Tools, appelés une fois par document).

### 1.2 Avant / après

Même protocole que le rapport Mémoire § 6 : `/planning` seule (semaine réelle), 10 VU, réflexion 1 s,
120 s, serveur neuf, T+1 puis GC forcé. Seul le correctif Intl diffère entre les deux builds
(`runs/intl-base`, `runs/intl-intl`).

| Build | req/s | p50 | p95 | RSS max | heapUsed max | **RSS après GC** | heapUsed après GC |
|---|---:|---:|---:|---:|---:|---:|---:|
| V8 @ `53b4bc7` | 1,03 | 5 982 ms | 9 828 ms | **3 383 Mo** | 328 Mo | **3 094 Mo** | 97 Mo |
| V8 + Intl (`91adfaf`) | **1,68** | **3 545 ms** | **4 852 ms** | **574 Mo** | 325 Mo | **311 Mo** | 98 Mo |

Le heap JS est identique (97-98 Mo après GC) : les 2,8 Go retenus sont de la mémoire native ICU, comme
mesuré sur V7. Le constat Mémoire est donc **reproduit sur V8**, et le correctif l'efface.

## 2. `/planning`

### 2.1 Constat sur V8

C3 (formulaire rendu à l'ouverture) étant déjà dans V8, le planning n'est plus à 17 Mo mais à **1 281 Ko**
pour la semaine réelle (38 salariés, 190 affectations). Composition mesurée :

| Poste | Taille |
|---|---:|
| Flux RSC (`self.__next_f.push`) | 799 Ko |
| Markup HTML | 475 Ko |
| Actions liées chiffrées (`modifierAffectationAction.bind(null, id)`, une par affectation **et par vue**) | 380 |
| Liste des 7 types d'activité recopiée par instance | 380 copies |
| « Autres affectations du même lot » | recopiées par affectation et par vue (O(n²) sur une saisie groupée) |
| Les deux vues (mobile jour par jour, bureau ouvrier × jour) | encodées **deux fois** (HTML + flux RSC), carte par carte |

Le `<select>` des chantiers n'est plus rendu (C3) : 7 `<option>` seulement (formulaire de création).

### 2.2 Correctif (`d408e4c`)

- **Données d'édition transmises une fois** (`ChantiersPlanningProvider`) : valeurs initiales de chaque
  affectation, lots (clé = mêmes critères d'égalité qu'avant), liste des chantiers, date de retour.
  Chaque bouton « Modifier » ne porte plus que l'identifiant.
- **Action unique** `modifierAffectationFormAction` : identifiant en champ caché `affectation_id`,
  validé (UUID), puis **la même** `modifierAffectationAction` (même mise à jour, même filtre entreprise,
  même RLS). L'autorisation n'a jamais reposé sur le chiffrement des arguments liés : les
  `ids_supplementaires` étaient déjà transmis en clair.
- **Vues rendues par `PlanningSemaineVues`** (composant client) depuis une liste compacte des affectations,
  au lieu de deux arbres RSC carte par carte. **Même JSX, mêmes classes, mêmes formulaires.**
- Heures validées indexées une fois (salarié|jour, salarié|jour|chantier) au lieu d'un filtre de tous
  les pointages par carte ; lots calculés une fois.

**Fonctionnalités conservées à l'identique** :
- markup HTML **octet pour octet identique** à V8 (446 728 octets, hors balises `<script>`, traces Sentry et
  identifiants d'action) ;
- recette Playwright : saisie groupée de 3 ouvriers, « Modifier » rendu à l'ouverture avec 150+ chantiers
  et 7 types, les 2 autres affectations du lot proposées, enregistrement appliqué aux 3, suppression avec
  confirmation ; vue mobile = même nombre de cartes que le tableau (§ 11).

### 2.3 Avant / après

| Mesure (1 utilisateur, chauffé, n = 5) | V8 | V8 + Intl | Après |
|---|---:|---:|---:|
| HTML | 1 281 Ko | 1 281 Ko | **688 Ko** |
| TTFB p50 | 918 ms | 637 ms | **586 ms** |
| Actions liées chiffrées | 380 | 380 | **0** |

Route isolée, 10 VU, réflexion 1 s (`runs/route-planning-*`) :

| | req/s | p50 | p95 | Ko/réponse | RSS max | RSS après GC |
|---|---:|---:|---:|---:|---:|---:|
| V8 | 1,08 | 5 990 ms | 7 322 ms | 1 252 | 3 122 Mo | 2 868 Mo |
| Après | **1,92** | **3 002 ms** | **3 940 ms** | **672** | **516 Mo** | **274 Mo** |

## 3. `/dashboard`

### 3.1 Constat

`dashboard_indicateurs` renvoie toutes les factures en retard et tous les devis expirés ; la page
**sérialisait et rendait les 2 686 alertes** (4 932 Ko : 1,1 Mo de flux RSC + 3,7 Mo de markup), et
filtrait masquages et délégations par `.in("alerte_cle", [2 686 clés])`, soit une URL PostgREST d'environ
120 Ko (au-delà des 8-16 Ko usuels des proxys devant un Supabase hébergé). Le RPC lui-même est rapide :
40 ms pour 490 Ko de JSON.

### 3.2 Correctif (`9967265`)

`src/lib/alertes-operationnelles.ts` :
- **Calcul identique** (mêmes textes, même ordre, mêmes signatures) ; sources sans ordre propre triées
  par id, pour une pagination stable.
- **Résumé exact** calculé sur toutes les alertes : critiques, à anticiper, domaines, ignorées, nombres
  des filtres « Mes alertes » / « Déléguées par moi ». Le briefing du matin reste calculé sur toutes les
  alertes.
- **Pagination** : le client reçoit une première page de **30** ; « Afficher 30 de plus » parcourt la
  liste jusqu'au bout. **Lazy loading** : les filtres et les alertes ignorées sont chargés à l'ouverture
  (`chargerAlertesOperationnellesAction`, mêmes droits, même RLS, lecture seule).
- **Limite** : au plus 200 alertes par appel.
- Les listes ouvertes sont rechargées après « Ignorer », « Rétablir » et « Déléguer ».
- Masquages et délégations lus par entreprise et utilisateur, **par lots de 1 000** (jamais tronqués
  par `max_rows`), sans `.in()` géant. Le détail d'une délégation (noms, commentaire) n'est lu que pour
  les alertes affichées.

**Aucune alerte perdue** :
- Vitest : 3 001 alertes parcourues page par page, sans doublon ni trou, dans l'ordre complet ;
- Vitest : masquages lus au-delà de 1 000 lignes ;
- Playwright : 30 rendues, puis 60 ; « Ignorer » la 45e (chargée à la demande) la retire et le total
  baisse de 1 ; « Rétablir » depuis la liste des ignorées la remet.

### 3.3 Avant / après

| Mesure (1 utilisateur, n = 5) | V8 | Après |
|---|---:|---:|
| HTML | 4 932 Ko | **207 Ko** (÷ 24) |
| Alertes rendues côté serveur | 2 686 | 30 (+ résumé exact sur 2 686) |
| TTFB p50 | 783 ms | **612 ms** |

Route isolée, 10 VU, réflexion 1 s : débit 1,68 → **2,72 req/s**, p50 3 651 → **1 799 ms**, p95 4 191 →
**2 484 ms**, 4 816 → **202 Ko**/réponse. Le RSS max est du même ordre (757 → 846 Mo, pour 61 % de
requêtes servies en plus) ; heapUsed après GC 101 → 94 Mo (rien de retenu).

## 4. `/pointage/gestion`

### 4.1 Causes identifiées

Mesure sur septembre (1 558 pointages du tenant A, 1 000 lus à cause de `max_rows`) :

| Cause | Mesure | Effet |
|---|---|---|
| **Actions liées** : `validerPointageAction.bind(null, id, "valide" / "rejete", mois)` + `supprimerPointageAction.bind(null, id, mois)`, pour **chaque** ancienne saisie (×3) et chaque session à vérifier (×2) | **3 000** `$ACTION_REF` (Next chiffre et sérialise les arguments liés de chaque formulaire à chaque rendu), 3 003 `<form>`, 1,69 Mo de flux RSC | CPU de rendu, 3,5 Mo de HTML |
| **Toutes les lignes rendues** (anciennes saisies dans un `<details>` fermé, sessions) | 1 000 articles | HTML |
| **RLS évaluée par ligne** sur `pointages` | **2 097 ms** d'exécution SQL pour 1 558 lignes (§ 4.2) | TTFB |
| Données inutiles | contrôles GPS de **tout** le mois lus pour un compteur ; détail de toutes les sessions | requêtes |

« Plusieurs milliers d'actions » et « plusieurs dizaines de secondes » : les deux premières causes
expliquent les actions et le HTML ; la troisième croît avec le volume (Finance : 294 s pour 20 000 lignes
en lecture paginée).

### 4.2 RLS : preuve

`docs/qualification/heavy-pages-pdf-v1/explain-pointages-rls.txt` montre la requête de la page sous le
rôle `authenticated`, avec les claims du gérant :
- Bitmap Index Scan : 0,07 ms, 1 558 lignes ;
- puis `Filter: peut_consulter_pointage_employe(entreprise_id, employe_id) AND est_membre_actif(entreprise_id)`
  évalué **sur chaque ligne** (fonctions SQL `SECURITY DEFINER`, non « inlinables ») ;
- **57 582 buffers, 1,99 à 2,10 s.**

Requêtes PostgREST mesurées sous le jeton du gérant :

| Requête | Temps |
|---|---:|
| `pointages` du mois, avec jointures | 2,89 s |
| sans jointure | 2,65 s |
| employés | 0,02 s |
| chantiers | 0,28 s |

### 4.3 Correctif (`bcc24ca`)

- **Actions liées supprimées** : `validerPointageFormAction` / `supprimerPointageFormAction` (patch
  préparé par le rapport Mémoire, jusqu'ici non appliqué). Identifiant, statut et mois arrivent en champs
  cachés, **validés strictement**, puis la **même** RPC `valider_preuve_pointage`, le même contrôle
  `gerer_pointage` et le même filtre entreprise. Vitest : appels métier identiques ; identifiant ou statut
  invalide → aucun appel.
- **Pagination par 100** des sessions et des anciennes saisies (`?page=`, `?anciens=`), avec liens
  précédent / suivant. Toutes restent accessibles. Les totaux par salarié restent calculés sur tout ce
  qui est lu.
- **Requêtes réduites** :
  - sessions : `pointage_id` du mois (léger, pour isoler les anciennes saisies) avec le compte exact,
    puis le détail (jointures, GPS) **de la page affichée** ;
  - contrôles GPS : **ceux de la page** ; le nombre du mois par un simple comptage.

| Mesure (1 utilisateur, n = 5) | V8 | Après |
|---|---:|---:|
| HTML | 3 540 Ko | **465 Ko** |
| Actions liées | 3 000 | **0** |
| `<form>` | 3 003 | 303 |
| TTFB p50 | 3 263 ms | 3 123 ms (RLS, § 4.2) |

Route isolée (`/pointage` + `/pointage/gestion`, 10 VU, réflexion 1 s) :
- débit 1,40 → **1,95 req/s** ;
- `/pointage/gestion` : p50 6 791 → **4 658 ms**, p95 10 416 → **6 246 ms** ;
- 3 457 → **454 Ko**/réponse ;
- RSS max 855 → **565 Mo**.

Sous charge, le coût CPU des 3 000 actions liées pesait sur tout le serveur.

### 4.4 Branche Finance : étudiée, non portée

`claude/confident-brown-sndsqb` @ `60e2065` remplace les lectures de `/pointage/gestion` et `/planning`
par deux RPC `SECURITY DEFINER` (migration `20260928000814`). Les droits y sont évalués une fois par
salarié et par chantier. Mesures de la branche Finance : 20 000 lignes en 3,1 s ; troncature B2 corrigée.

C'est exactement le correctif de la cause § 4.2. Il n'est **pas** porté ici :
1. son pgTAP d'équivalence RLS (`finance_agregats_exactitude_v1`, 237 assertions) couvre les migrations
   813 à 816 **d'un bloc** ; porter 0814 seule, c'est intégrer une RPC de sécurité **sans** sa preuve
   qualifiée, ou réécrire le test ;
2. elle modifie les chiffres du train (`sync:train-expectations`) et appartient à l'intégration de la
   mission Finance ;
3. la base de Finance est V8 @ `53b4bc7`, comme ici.

Pour l'intégration future :
- conflits **textuels** attendus dans `pointage/gestion/page.tsx` et `planning/page.tsx` (blocs de lecture
  des données) ;
- résolution : garder les RPC Finance pour la lecture, et la pagination, l'action unique et le rendu de
  cette branche pour l'affichage ;
- avec la RPC, sessions et contrôles GPS arrivent en entier : paginer en mémoire (déjà le cas des anciennes
  saisies).

## 5. PDF : gestion de concurrence

### 5.1 Avant

`genererPdfDepuisUrl` lançait **un Chromium neuf par PDF, sans plafond** :
- pas de délai global ;
- `close()` non borné ;
- gestionnaires de signaux puppeteer ajoutés à chaque lancement ;
- transport WebSocket.

Rapport Mémoire § 9 : 10 PDF simultanés = 4,1 Go d'arbre de processus, générations bloquées, Chromium
rattachés à init à l'arrêt du serveur.

### 5.2 File (`500165e`, `src/lib/pdf/file-pdf.ts`)

| Mécanisme | Réglage (défaut) |
|---|---|
| **Concurrence** : au plus N navigateurs vivants par instance | `PDF_CONCURRENCE=2` |
| **File** FIFO bornée ; file pleine → refus immédiat **503 + `Retry-After: 10`** | `PDF_FILE_MAX=10` |
| **Attente** maximale en file → 503 | `PDF_ATTENTE_MAX_MS=20000` |
| **Délai global** (lancement compris) → 504 | `PDF_DUREE_MAX_MS=35000` (route : `maxDuration` 60 s) |
| **Annulation** : `request.signal` (client déconnecté), en file comme en cours | — |
| **Arrêt forcé** : `close()` borné, puis `SIGKILL` du **groupe** de processus (Chromium et ses fils) ; groupe vérifié même après un `close()` réussi | `PDF_DELAI_FERMETURE_MS=3000` |
| **Nettoyage** en `finally`, quelle que soit l'issue ; lancement abouti après une interruption → fermé | — |
| **Arrêt du serveur** : gestionnaire `exit` unique, synchrone (`SIGKILL` de tous les navigateurs vivants) ; plus de gestionnaires SIGINT/SIGTERM/SIGHUP par lancement | — |
| **Mort brutale du serveur** (SIGKILL, OOM) : transport par **tube** (`pipe: true`) — Chromium s'arrête quand Node disparaît ; marqueur `--elsatia-pdf-proprietaire=<pid>` et balayage `/proc` des Chromium dont le propriétaire est mort, à chaque lancement | — |
| **Observabilité** : une ligne JSON `pdf_job` par génération (issue, attente, durée, actifs, en file, navigateurs vivants) ; compteurs, p50 / p95 des durées et des attentes ; `pdf` dans `/api/health` en profondeur complète (`CRON_SECRET`) | — |

Routes concernées :
- `/api/documents/devis/[id]/pdf` et `/api/documents/factures/[id]/pdf` : annulation, 503, 504 ;
- `/api/documents/partage/[token]/pdf`, publique : la file la protège aussi d'une rafale non authentifiée ;
- `documents-envoi` : PDF joint à un e-mail ; en cas d'échec, le lien de consultation est envoyé seul,
  comme avant.

## 6. PDF : scénarios d'échec

Vitest, `docs/qualification/heavy-pages-pdf-v1/pdf-tests.log`. Les tests sur vrai Chromium utilisent
`@sparticuz/chromium`, le binaire de production, avec les drapeaux de `generer.ts`. Ils sont opt-in :
`PDF_CHROMIUM_TESTS=1`.

| Scénario | Lanceur factice (12) | Vrai Chromium (8) | Chromium restant |
|---|---|---|---|
| Succès | ✅ | ✅ `%PDF-` | **0** |
| Concurrence (6 simultanés, plafond 2) | ✅ FIFO | ✅ au plus 2 vivants | **0** |
| Saturation (file pleine / attente trop longue) | ✅ 503, aucun lancement | Playwright § 11 | — |
| Délai (page qui ne répond jamais) | ✅ | ✅ `DelaiPdfError` en 3 s | **0** |
| Échec de navigation (connexion refusée) | ✅ | ✅ `ERR_CONNECTION_REFUSED` | **0** |
| Crash du navigateur (`SIGKILL` externe en cours) | — | ✅ erreur, place rendue, file réutilisable | **0** |
| Annulation (client parti), en cours / en file | ✅ ✅ | ✅ | **0** |
| `close()` bloqué | ✅ place rendue après 3 s, `SIGKILL` | — | — |
| Délai pendant le lancement | ✅ navigateur tardif fermé | — | — |
| **Arrêt du serveur `SIGTERM`** en pleine génération | — | ✅ arrêté par le gestionnaire `exit` | **0** |
| **Arrêt du serveur `SIGKILL`** en pleine génération | — | ✅ arrêté seul (tube fermé) | **0** |

Contre-preuve : `pdf-contre-preuve-sigkill.txt`, ancien montage, même scénario `SIGKILL`.
**Chromium orphelin, ppid 1, 133 Mo, toujours vivant 5 s après.**

Sous charge réelle (§ 7.3), V8 d'origine à 2 Go avec 6 VU PDF :
- le serveur est tué par l'OOM killer ;
- **6 Chromium orphelins** (ppid 1, 1 364 Mo au total) sont encore vivants 3 min 47 s après
  (`pdf-orphelins-v8-base-2048.txt`).

Avec la file, dans les mêmes conditions : 0 erreur, 0 orphelin.

## 7. Limite mémoire et `NODE_OPTIONS`

### 7.1 Node ne déduit pas son plafond de heap de la limite du conteneur

Sonde (`sonde-heap-cgroup.txt`, Node 22.22, cgroup v1, hôte 16 Go) :

| Limite cgroup | `process.constrainedMemory()` | `heap_size_limit` sans réglage | avec `NODE_OPTIONS=--max-old-space-size=L/2` |
|---:|---:|---:|---:|
| 512 Mo | 512 Mo | **8 195 Mo** | 259 Mo |
| 1 024 Mo | 1 024 Mo | **8 204 Mo** | 524 Mo |
| 2 048 Mo | 2 048 Mo | **8 216 Mo** | 1 048 Mo |

Node **connaît** la limite, mais V8 dimensionne son heap sur la RAM de l'**hôte**. Le serveur journalise
désormais au démarrage une ligne `memory_config` (`src/lib/perf/configuration-memoire.ts`), avec un
avertissement si le plafond dépasse 75 % de la limite. Mesuré : `"heapLimitMo":8195,"limiteConteneurMo":512,"ok":false`.

### 7.2 512 Mo / 1 Go / 2 Go (cgroup v1 dédié au seul serveur Next, serveur neuf, 180 s)

Charge : « intensif » = 25 VU, réflexion 0,5 s, scénario `mix` ; « réaliste » = 10 VU, réflexion 5 s.
Mois de pointage complet (`--mois 2026-09`).

| Limite | Build | `NODE_OPTIONS` | Charge | Issue | Pic cgroup | req/s | p50 | RSS après GC |
|---:|---|---|---|---|---:|---:|---:|---:|
| 512 Mo | après | — | 10 réalistes | ❌ **OOM kill** | 512 | — | — | — |
| 512 Mo | après | `--max-old-space-size=256` | 10 réalistes | ✅ vivant, 0 erreur | **211** | 1,46 | 383 ms | 232 Mo |
| 512 Mo | après | — | 25 intensifs | ❌ **OOM kill** | 512 | — | — | — |
| 512 Mo | après | 256 | 25 intensifs | ❌ V8 *heap out of memory* | 373 | — | — | — |
| 1 024 Mo | **V8 d'origine** | — | 25 intensifs | ❌ **OOM kill** | 1 024 | — | — | — |
| 1 024 Mo | après | — | 25 intensifs | ✅ vivant | 865 | 5,04 | 3,3 s | 426 Mo |
| 1 024 Mo | après | 512 | 25 intensifs | ✅ vivant | **561** | 4,71 | 3,5 s | 357 Mo |
| 2 048 Mo | après | — | 25 intensifs | ✅ vivant | 953 | 5,04 | 3,3 s | 521 Mo |
| 2 048 Mo | après | 1 024 | 25 intensifs | ✅ vivant | **699** | 5,14 | 3,4 s | 373 Mo |

### 7.3 Budget PDF dans le conteneur

25 VU réalistes (réflexion 2 s) plus des VU PDF sans réflexion, sur les devis de 500 et 1 000 lignes.

| Limite | Build | Réglage | VU PDF | PDF 200 / 503 / erreurs | Erreurs pages | Arbre RSS max | Pic cgroup | Issue |
|---:|---|---|---:|---|---:|---:|---:|---|
| 1 024 Mo | après | heap 384, `PDF_CONCURRENCE=1` | 4 | 22 / 6 / **0** | 0 | 954 Mo | 778 Mo | ✅ vivant |
| 2 048 Mo | après | heap 1 024, `PDF_CONCURRENCE=2` | 6 | 43 / 2 / **0** | 0 | 1 090 Mo | 924 Mo | ✅ vivant |
| 2 048 Mo | V8 d'origine | heap 1 024 | 6 | 0 / 0 / **tout en erreur** | 1 562 | **2 456 Mo** | 2 048 Mo | ❌ **OOM kill + 6 orphelins** |

L'arbre RSS additionne Node et Chromium : un Chromium coûte de 220 à 240 Mo de RSS (processus principal,
`--single-process`).

### 7.4 Stratégie retenue

`NODE_OPTIONS=--max-old-space-size` ≈ **40 à 50 % de la limite du conteneur**. Le reste couvre :
- la mémoire native de Node (allocateur, ~150 à 300 Mo hors heap sous charge) ;
- et **N × 250 à 400 Mo par PDF concurrent**.

| Conteneur | `NODE_OPTIONS` | `PDF_CONCURRENCE` | Mesuré | Usage |
|---:|---|---:|---|---|
| 512 Mo | `--max-old-space-size=256` | **PDF interdits** (aucune place pour un Chromium) | 10 VU réalistes : vivant, pic 211 Mo. Au-delà : mort | maquette, ≤ 10 utilisateurs, sans PDF : **déconseillé en pilote** |
| **1 Go** (minimum avec PDF) | `--max-old-space-size=384` | 1 | 25 VU + 4 VU PDF : vivant, pic 778 Mo | pilote jusqu'à ~25 utilisateurs |
| **2 Go** (recommandé) | `--max-old-space-size=1024` | 2 | 25 VU intensifs : pic 699 Mo ; 25 VU + 6 VU PDF : pic 924 Mo | ~50 utilisateurs, PDF fréquents |

`/tmp` : `@sparticuz/chromium` décompresse ~200 Mo dans `/tmp`. Sur un `/tmp` en `tmpfs`, ces 200 Mo
comptent dans la mémoire du conteneur et doivent être ajoutés au budget.

## 8. Chauffe avant ouverture du trafic

`scripts/perf/capacity/warmup.mjs` :
- un utilisateur, séquentiel, lecture seule ;
- 13 routes (login, santé, dashboard, planning, devis, factures, chantiers, clients, pointage,
  pointage/gestion et 3 fiches), 2 tours ;
- durée **~10 s**.

À brancher sur le hook de démarrage ou la sonde de disponibilité.

Test : rafale de 50 VU intensifs pendant 90 s sur un serveur neuf, à froid ou après chauffe, 2 répétitions
(`runs/froid-*`, `runs/chaud-*`).

| | req/s | p50 | p95 | RSS max | **heapUsed après GC** | **RSS après GC** |
|---|---:|---:|---:|---:|---:|---:|
| Froid 1 | 3,83 | 7,7 s | 12,3 s | 728 Mo | **190 Mo** | 523 Mo |
| Chaud 1 | 3,88 | 7,8 s | 11,9 s | 766 Mo | **95 Mo** | 360 Mo |
| Froid 2 | 4,60 | 6,5 s | 10,9 s | 852 Mo | **194 Mo** | 573 Mo |
| Chaud 2 | 4,19 | 7,0 s | 11,6 s | 705 Mo | **95 Mo** | 359 Mo |

**Bénéfique, à retenir.** La latence d'une rafale ne change pas : le CPU est saturé dans les deux cas.
Mais la chauffe supprime la rétention « rafale à froid » décrite par le rapport Mémoire § 5.3 (cache de
déduplication `fetch` de Next) :
- heap après GC 190-194 Mo → **95 Mo**, soit le niveau d'idle ;
- RSS après GC −160 à −210 Mo.

Premier passage de chauffe : `/dashboard` 846 ms, puis 697 ms au second tour ; `/planning` 839 → 619 ms.

## 9. Charge 10 / 25 / 50 utilisateurs (pages mixtes réalistes)

Scénario `mix` du rapport Mémoire, pondéré :

| Page | Poids |
|---|---:|
| dashboard | 4 |
| devis (fiche) | 3 |
| planning | 2 |
| devis (liste) | 2 |
| factures (liste) | 2 |
| facture (fiche) | 2 |
| pointage | 2 |
| pointage/gestion | 1 |
| chantiers | 1 |
| chantier (fiche) | 1 |
| clients | 1 |

Conditions :
- 28 comptes réels (tenant A, tenant B, pilote) ;
- réflexion moyenne 5 s, paliers de 180 s, serveur neuf ;
- puis T+1 min et GC forcé ;
- mois de pointage complet (`runs/mix-base`, `runs/mix-apres`) ;
- aucune erreur 5xx ; 307 = redirections des comptes sans le droit de la page, ~5 %, identiques avant et
  après.

| Palier | Build | req/s | p50 | p95 | p99 | RSS max | heapUsed max | GC mineur (ms cumulées) | ELU moy |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | V8 | 1,42 | 410 ms | 2,4 s | 4,0 s | 1 647 Mo | 440 Mo | 3 150 | 0,24 |
| 10 | après | 1,48 | **337 ms** | 2,3 s | 3,4 s | **363 Mo** | 181 Mo | 1 665 | 0,14 |
| 25 | V8 | 2,84 | 1 367 ms | 6,1 s | 14,7 s | 1 840 Mo | 554 Mo | 9 549 | 0,56 |
| 25 | après | **3,55** | **464 ms** | **3,1 s** | **4,3 s** | **733 Mo** | 428 Mo | 5 650 | 0,35 |
| 50 | V8 | 3,92 | 5 281 ms | 11,7 s | 13,7 s | 1 957 Mo | 663 Mo | 14 726 | 0,74 |
| 50 | après | **4,72** | **3 147 ms** | **7,6 s** | **9,4 s** | **982 Mo** | 620 Mo | 12 908 | 0,68 |
| après la charge, GC forcé | V8 | | | | | RSS **1 349 Mo** | heap 99 Mo | | |
| après la charge, GC forcé | après | | | | | RSS **426 Mo** | heap 99 Mo | | |

Charge intensive (25 VU, réflexion 0,5 s, `runs/intense-*`) : 3,89 → **5,00 req/s**, p50 4,7 → **3,3 s**,
RSS max 1 644 → **1 056 Mo**, RSS après GC 1 105 → **430 Mo**.

Par page, au palier de 25 VU, p50 avant → après :
- `/dashboard` : 2 186 → **727 ms** ;
- `/planning` : 2 354 → **1 045 ms** ;
- `/pointage/gestion` : 4 952 → **3 127 ms** ;
- `/devis` : 637 → **294 ms**.

## 10. Comparaison (objectifs § 10 : sans seuil arbitraire)

| Axe | Mesure | V8 | Après |
|---|---|---:|---:|
| **TTFB** (1 utilisateur, p50) | dashboard / planning / pointage-gestion | 783 / 918 / 3 263 ms | **612 / 586 / 3 123 ms** |
| **HTML** | dashboard / planning / pointage-gestion | 4 932 / 1 281 / 3 540 Ko | **207 / 688 / 465 Ko** |
| **RSS** | max, réaliste 50 VU | 1 957 Mo | **982 Mo** |
| **RSS** | après GC, réaliste | 1 349 Mo | **426 Mo** |
| **RSS** | après GC, `/planning` 10 VU | 2 868 Mo | **274 Mo** |
| **Heap** | heapUsed après GC | 97-137 Mo | 90-126 Mo (aucune rétention JS) |
| **Heap** | plafond V8 réglé | 8,2 Go par défaut | ≈ 40-50 % du conteneur (`NODE_OPTIONS`) |
| **Débit** | réaliste 50 VU / intensif 25 VU | 3,92 / 3,89 req/s | **4,72 / 5,00 req/s** |
| **Latence** | réaliste 25 VU, p50 / p95 / p99 | 1,37 / 6,1 / 14,7 s | **0,46 / 3,1 / 4,3 s** |
| **PDF** | 2 Go, 6 VU PDF | OOM kill, 6 orphelins | **0 erreur, 0 orphelin** |

## 11. Tests

| Suite | Résultat |
|---|---|
| `tsc --noEmit` | ✅ |
| `verify:train-expectations`, `verify:migrations` | ✅ inchangés (371 migrations, dernière `20260928000812`, 37 contrôles) |
| ESLint (fichiers modifiés) | ✅ 0 erreur, 0 avertissement |
| **Vitest** (`npx vitest run`) | ✅ 209 fichiers, **2 618 tests** (3 fichiers / 44 tests ignorés : opt-in ou pile requise, dont les 8 tests vrai Chromium). Nouveaux : `alertes-operationnelles` (7), `file-pdf` (12), `actions-formulaire` (6), `configuration-memoire` (3), `ModifierAffectationDiffere` (3, mis à jour), `formateurs-intl` (garde) |
| Vitest **vrai Chromium** (`PDF_CHROMIUM_TESTS=1`) | ✅ **8/8** (§ 6) |
| **Playwright** (`tests/e2e/gp-heavy-pages-capacity.spec.ts`, `next start` + pile réelle, `E2E_CAPACITE=1`) | ✅ **6/6** (`playwright.log`) : dashboard (résumé, pages, ignorer / rétablir), poids du dashboard, planning (saisie groupée, modifier, lot, enregistrer, supprimer), vue mobile, pointage / gestion (pagination, validation par l'action unique, 0 action liée), PDF (document, rafale de 16 → 200 ou 503 + `Retry-After`, 0 Chromium restant ; 26 succès + 8 saturations journalisés en `pdf_job`) |
| **Harnais de charge** | 28 runs, serveur neuf à chaque fois : `runs/*`, `synthese.md` |
| **Build de production** | ✅ `next build` (avant, Intl seul, après) |

## 12. Fichiers

| Fichier | Rôle |
|---|---|
| `src/lib/pdf/file-pdf.ts`, `generer.ts` | File PDF, lancement par tube, réponses 503 / 504 |
| `src/lib/alertes-operationnelles.ts`, `src/app/actions/alertes.ts`, `src/components/CentreAlertesOperationnelles.tsx` | Centre d'alertes paginé |
| `src/components/PlanningSemaineVues.tsx`, `ModifierAffectationDiffere.tsx`, `src/app/actions/planning.ts` | Planning |
| `src/app/(app)/pointage/gestion/page.tsx`, `src/app/actions/pointages.ts` | Pointage d'équipe |
| `src/lib/perf/configuration-memoire.ts`, `src/instrumentation.ts` | Diagnostic `memory_config` |
| `scripts/perf/memory/*` | Harnais du rapport Mémoire, porté et étendu (`--mois`, `WARMUP`, `PDF_VU`, cgroup par run) |
| `scripts/perf/capacity/*` | `poids-pages`, `warmup`, `synthese`, `pdf-enfant` |
| `docs/qualification/heavy-pages-pdf-v1/` | Résultats bruts, journaux de tests, EXPLAIN, sonde, contre-preuves |

Aucune migration, aucune policy, aucune RPC modifiée.

## 13. Reproduire

```bash
npm run pilot:acceptance:v3                                  # pile locale (le pas 3 peut échouer : seule la base sert ici)
su postgres -c "psql -d pilot_gp -f scripts/perf/generate_fixture.sql"
su postgres -c "psql -d pilot_gp" < scripts/perf/memory/seed-affectations.sql
# gestes de banc : mot de passe des comptes @perf.invalid, offre business, mode_compte_depot retiré (rapport Mémoire § 1.3)
# .env.local : URL :54321, clés anon / service signées avec le secret GoTrue, RATE_LIMIT_HMAC_KEY
npx next build
node scripts/perf/capacity/poids-pages.mjs --routes /dashboard,/planning,/pointage/gestion?mois=2026-09 --n 5
QUICK=1 LOAD_S=180 LIMIT_MB=1024 SERVER_ENV="NODE_OPTIONS=--max-old-space-size=384 PDF_CONCURRENCE=1" \
  PDF_VU=4 PDF_IDS=<devis> LOADGEN_EXTRA="--mois 2026-09" scripts/perf/memory/run-protocol.sh out 2000 25
node scripts/perf/capacity/synthese.mjs out
PDF_CHROMIUM_TESTS=1 npx vitest run src/lib/pdf
E2E_CAPACITE=1 E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/gp-heavy-pages-capacity.spec.ts --project=desktop-chromium
```
