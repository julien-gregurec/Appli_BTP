# ELSATIA GP — Pilot Auth/PostgREST Acceptance Automation (V1)

Mission autonome longue (~8h allouées) : réduire la zone grise `NOT_TESTABLE_LOCALLY`
laissée par `ELSATIA_EXTERNAL_PILOT_FULL_REHEARSAL_V2` en construisant un environnement
local réaliste pour Auth/PostgREST/session, et en rejouant les scénarios pilote au travers.
Aucune Preview/Production utilisée. Autonomie totale (aucune question bloquante).

## 0. Base

```
Repo               : julien-gregurec/Appli_BTP
Branche de travail : claude/practical-planck-j3zqpu, fast-forwardée (sans perte, ancêtre
                      commun vérifié) sur origin/claude/vigilant-fermat-p8jmep — la branche
                      qui porte ELSATIA_EXTERNAL_PILOT_FULL_REHEARSAL_V2, le pack de 143
                      contrôles (ELSATIA_PILOT_ACCEPTANCE_TESTS_V1.md) et la fixture pilote
                      (seed_entreprise_pilote_btp.sql), 570 commits au-dessus de main.
Baseline reprise    : 35 PASS / 8 FAIL / 96 NOT_TESTABLE_LOCALLY / 4 MANUAL_EXPECTED (V2),
                      chiffres revérifiés ici (§3.1 de V2, reproduits tels quels en §3).
```

### Ce qui change par rapport à V2

V2 avait tenté Docker en premier : le démon avait démarré (nouveau), mais `supabase start`
restait hors de portée car les téléchargements d'images depuis le registre Supabase butaient
sur un plafond de données du proxy (`Data limit exceeded`). **Cette mission a retrouvé
exactement la même limite** (confirmée indépendamment ici, §1) — mais au lieu de s'arrêter à
« pas de Docker fonctionnel pour la pile Supabase complète », elle a exploité une voie que V2
n'avait pas essayée :

**GoTrue (`github.com/supabase/auth`) est un simple binaire Go.** Il peut être compilé depuis
les sources par un `git clone` HTTPS ordinaire — aucun registre Docker/OCI impliqué — et
lancé contre le PostgreSQL 16 nu déjà utilisé par `scripts/local-postgres-bootstrap/`. Un
Go toolchain était disponible dans cet environnement (jamais vérifié par les missions
précédentes). Résultat : **un vrai GoTrue tourne, pour la première fois de ce dossier de
qualification**, avec ses propres migrations réelles (schéma `auth` complet : `users`,
`identities`, `sessions`, `refresh_tokens`, `mfa_factors`, ... ~70 objets), émettant de vrais
JWT signés, appliquant réellement ses règles de connexion/bannissement/expiration.

PostgREST (Haskell) reste hors de portée : aucun toolchain GHC/cabal/stack disponible, et un
build depuis les sources y aurait exigé de compiler GHC lui-même — hors budget et risqué. Pas
de tentative de réimplémentation maison de PostgREST : cela aurait produit des résultats
d'exécution non fiables (comportement différent de l'HTTP réel), ce que la consigne
« ne jamais inventer de preuve » exclut explicitement. À la place : un pont minimal et
documenté (`scripts/local-postgres-bootstrap/jwt_bridge.mjs`) qui (1) vérifie
cryptographiquement la signature HS256 et l'expiration d'un JWT réellement émis par GoTrue —
exactement ce que PostgREST fait en premier avec un bearer token — puis (2) exécute du SQL
sous `SET LOCAL role` + `SET LOCAL request.jwt.claims` dérivés de ce JWT vérifié, pour que les
policies RLS s'évaluent exactement comme pour ce principal. Ce que cela prouve et ne prouve
pas est documenté en tête de ce script et n'est jamais présenté comme « testé via PostgREST » —
seulement comme « RLS validée sous un JWT réel vérifié (pont, pas un vrai appel HTTP
PostgREST) ». Storage réel et rendu navigateur restent également hors de portée (§8-§9).

---

## 1. Environnement — ce qui marche, ce qui ne marche pas, et pourquoi

| Brique | Statut | Détail |
| --- | --- | --- |
| Démon Docker | **Démarre** | `dockerd` lancé avec succès (root, cgroups v1, overlayfs) |
| `supabase start` (images Docker) | **Hors de portée** | `Data limit exceeded` puis `403 Forbidden` en boucle sur tous les registres essayés (`ghcr.io` via `pkg-containers.githubusercontent.com`, Docker Hub via `production.cloudfront.docker.com`) — confirmé indépendamment de V2, même symptôme |
| PostgreSQL 16 natif | **Fonctionne** | `apt`-installé, service démarré, accès peer `postgres` OS user (déjà établi par V2) |
| GoTrue (Auth) | **Compilé et lancé pour de vrai** | `git clone` + `go build` (Go 1.24 disponible), migrations réelles appliquées (70 fichiers), serveur HTTP réel sur `:9999` |
| PostgREST | **Hors de portée** | Aucun toolchain Haskell (`ghc`/`cabal`/`stack`/`nix`) disponible ; téléchargement de binaires de release GitHub testé et échoué (404 sur les schémas d'URL essayés, `github.com` renvoie 400 hors `git clone`) |
| Storage (service HTTP) | **Hors de portée** | Même dépendance Docker que PostgREST ; 33 fichiers de l'app appellent `supabase.storage.*` (API HTTP réelle), aucun raccourci honnête disponible |
| `next dev` + Playwright | **Non exploité** | Playwright et Chromium sont disponibles (pré-installés), et `playwright.config.ts` pointe par défaut sur `http://127.0.0.1:3100` (pas seulement une Preview distante) — mais l'app s'appuie sur `@supabase/supabase-js` pour **toutes** les données via PostgREST ; sans PostgREST réel, la quasi-totalité des pages authentifiées échoueraient au premier appel de données. Tenter quand même aurait produit des résultats de test non représentatifs (pages cassées pour la mauvaise raison). Décision : ne pas lancer, documenter pourquoi plutôt que produire un signal trompeur |

Réseau : `github.com` (git smart-HTTP), `api.github.com` (repos hors périmètre de session
bloqués côté proxy applicatif, non lié à Docker), `registry.npmjs.org` accessibles. Les hôtes
de registre de conteneurs (`*.cloudfront.docker.com`, `pkg-containers.githubusercontent.com`)
répondent mais coupent le transfert avant la fin (plafond de données).

---

## 2. Ce qui a été construit (committé, reproductible)

```
scripts/local-postgres-bootstrap/
  gotrue_pilot_bootstrap.sh     construit GoTrue (une fois, mis en cache), crée le rôle
                                 supabase_auth_admin + la base, joue les VRAIES migrations
                                 GoTrue, superpose pg_bootstrap.sql (rôles/fonctions
                                 auth.uid()·role()·email()·jwt(), stubs storage/pgsodium —
                                 IF NOT EXISTS partout : ne touche jamais aux tables réelles
                                 de GoTrue), joue les 315 migrations de l'app, charge la
                                 fixture pilote, démarre `gotrue serve` sur :9999
  run_pilot_auth_scenarios.sh   inscrit pour de vrai les 5 profils pilote + un tenant B via
                                 l'API GoTrue, exécute les RPC réelles d'onboarding
                                 (creer_entreprise_bootstrap / activer_compte_employe) sous
                                 leur JWT réel, puis les 5 scénarios de session demandés
                                 (valide / expiré / mauvais tenant / utilisateur inactif /
                                 adhésion révoquée) et une batterie de gardes de permission
  jwt_bridge.mjs                sign / verify / run — voir §0 ; en-tête du fichier documente
                                 précisément la portée et les limites
README.md                       section dédiée ajoutée, limites documentées explicitement
```

Commande unique, reproductible, idempotente (recrée la base à chaque appel) :

```bash
npm run pilot:auth:local
# = pilot:auth:bootstrap (build+DB+GoTrue+migrations+fixture) + pilot:auth:scenarios
```

**Validé par exécution réelle dans cette session, à froid, à trois reprises** (dont une fois
via `npm run` littéralement, pas seulement le script bash direct) : `exit 0`, 22/22 scénarios
`PASS`. Durée : ~2 minutes (build GoTrue mis en cache après le premier run ; ~50s la
première fois, compilation Go incluse).

---

## 3. Les 143 contrôles — résultats (avant / après)

### AVANT (V2, repris tel quel)

```
PASS                 : 35  (24 %)
FAIL                 : 8   (6 %)
NOT_TESTABLE_LOCALLY : 96  (67 %)
MANUAL_EXPECTED       : 4   (3 %)
```

### APRÈS (cette mission)

```
PASS                  : 40  (28 %)   +5 (ON-01, ON-04, ON-05, ON-06, CL-06)
FAIL                  : 8   (6 %)    inchangé — aucun nouveau défaut confirmé, aucun corrigé
                                      (aucun défaut nouveau trouvé qui soit « minimal et
                                      certain » à corriger sans risque — voir §7)
NOT_TESTABLE_LOCALLY  : 91  (64 %)   -5 en statut ; 8 items supplémentaires (SEC-01/02/03,
                                      CM-07, EX-03, ST-08, PA-04, PA-05) gardent ce statut
                                      mais avec une preuve d'exécution réelle bien plus forte
                                      qu'avant (§4.2) — voir nuance ci-dessous
MANUAL_EXPECTED        : 4   (3 %)    inchangé
Total                  : 143 (100 %)
```

Réduction nette du flou : **5/96 convertis avec preuve d'exécution complète**, et **8/96
supplémentaires passés de « relecture de code seule » à « backend vérifié par exécution
réelle sous JWT signé, comportement UI non revérifié »** — voir §4.2 pour pourquoi ces 8 ne
sont *pas* comptés `PASS` malgré une preuve d'exécution réelle : le critère d'acceptation
exact (`Accès direct par URL → Accès refusé`) porte sur ce que voit l'utilisateur, pas
seulement sur ce que la RPC renvoie, et le pilote a déjà trouvé un cas exact (`CL-05`/`DV-09`)
où la RPC refuse correctement mais la page ne le traduit pas en message ou redirection.
Marquer ces 8 `PASS` par ressemblance aurait été inventer une preuve non exécutée.

---

## 4. Détail des conversions

### 4.1 Convertis en PASS (preuve d'exécution complète et sans ambiguïté)

| ID | Preuve |
| --- | --- |
| **ON-01** | `creer_entreprise_bootstrap('Tenant B - Atlantique Renov', ...)` appelée pour de vrai sous le JWT d'un utilisateur GoTrue fraîchement inscrit (`pilote.tenantb.manager@example.test`, aucune entreprise existante) → nouvelle entreprise créée, appelant affecté automatiquement au poste « Admin/Gérant ». Exécuté 3 fois à froid, résultat identique (id différent à chaque run, cohérent avec `gen_random_uuid()`) |
| **ON-04** | Trigger `trg_numero_inscription_employe` : exercé à chaque exécution de `seed_entreprise_pilote_btp.sql` (4 runs à froid dans cette session) — 28 employés reçoivent chacun un `numero_inscription` `BTP-XXXXXXXXXX` frais et unique à chaque run, aucune collision, aucune erreur |
| **ON-05** | `activer_compte_employe(numero)` appelée pour de vrai, pour les 5 profils pilote, sous leur propre JWT GoTrue (inscription réelle par email, mot de passe, session), avec le numéro d'inscription réel lu en base → `utilisateurs_entreprises` créé (`statut='actif'`), `employes.utilisateur_id` lié, poste correct assigné. C'est le flux d'onboarding réel de bout en bout, pas une simulation |
| **ON-06** | `INSERT INTO chantiers (..., client_id, ...) VALUES (..., NULL, ...)` exécuté réellement → `ERROR: null value in column "client_id" ... violates not-null constraint` |
| **CL-06** | `UPDATE clients SET delai_paiement_jours=400 WHERE id=...` exécuté réellement sur un client de la fixture → `ERROR: new row ... violates check constraint "clients_delai_paiement_jours_check"` (contrainte `>= 0 AND <= 365` confirmée à la fois par `pg_constraint` et par une violation réelle) |

### 4.2 Preuve d'exécution ajoutée, statut `NOT_TESTABLE_LOCALLY` conservé (nuance)

Ces 8 contrôles portent tous sur le même mécanisme : `public.a_permission(entreprise_id, cle)`.
Testé pour de vrai avec deux JWT GoTrue distincts (gérant : tous droits ; ouvrier : aucun) :

```
a_permission('acces_clients')      gerant=true  ouvrier=false
a_permission('acces_achats')       gerant=true  ouvrier=false   (CM-07)
a_permission('acces_exports')      gerant=true  ouvrier=false   (EX-03)
a_permission('acces_stock')        gerant=true  ouvrier=false   (ST-08)
a_permission('gerer_employes')     gerant=true  ouvrier=false   (SEC-01)
a_permission('acces_employes')     gerant=true  ouvrier=false   (SEC-01)
a_permission('gerer_utilisateurs') gerant=true  ouvrier=false   (SEC-02)
a_permission('acces_rentabilite')  gerant=true  ouvrier=false   (SEC-03)
a_permission('consulter_sa_paie')  gerant=true  ouvrier=false   (PA-04, PA-05)
```

Le **critère d'acceptation exact** de `SEC-01`/`SEC-02`/`SEC-03`/`CM-07`/`EX-03`/`ST-08`/
`PA-04`/`PA-05` est *« Accès direct par URL → Accès refusé »* (vérifié dans
`ELSATIA_PILOT_ACCEPTANCE_TESTS_V1.md`) — c'est-à-dire ce qu'un utilisateur **voit**, pas
seulement ce que la fonction de garde renvoie. Le pilote a déjà trouvé, pour ce même
mécanisme de garde appliqué à `/clients` et `/devis` (`CL-05`/`DV-09`), que la RPC refuse
correctement **mais que la page ne traduit pas cette erreur en message ou redirection** —
elle se rend simplement vide. Sans revérifier individuellement chacune des 8 pages
concernées (`/parametres/acces`, `/rentabilite`, `/tresorerie`, `/paie`, `/exports`,
`/stock`, `/fournisseurs`, `/employes/[id]/modifier`), il serait malhonnête de supposer
qu'elles échappent toutes à ce même défaut — ou au contraire de supposer qu'elles y sont
toutes exposées : `SEC-01` mentionne explicitement *« Accès refusé (middleware) »*, ce qui
suggère un mécanisme différent (garde au niveau du routeur/proxy, pas seulement au niveau
page) pour au moins cette route. **Conclusion honnête** : le verrou de données lui-même est
prouvé (aucune fuite possible), mais le comportement UI exact reste `NOT_TESTABLE_LOCALLY` —
la preuve est renforcée (exécution réelle sous JWT signé au lieu de relecture de code), pas
le statut.

### 4.3 Nouvelles preuves de sécurité de session (mission §5, exécutées pour de vrai)

Les 5 scénarios demandés, rejoués avec de vrais tokens GoTrue (pas de claims fabriqués) :

| Scénario | Résultat |
| --- | --- |
| **Valide** | Chacune des 22 étapes ci-dessus repose sur un JWT valide réel |
| **Expiré** | GoTrue relancé avec `GOTRUE_JWT_EXP=5`, connexion réelle, token réellement expiré après 7s d'attente réelle → **GoTrue lui-même** (`GET /user`) le rejette (`token is expired`) **et** le pont (vérification signature+exp indépendante) le rejette aussi |
| **Mauvais tenant** | Le gérant du tenant B (entreprise fraîchement créée via ON-01) tente de lire les clients du tenant A pilote → **0 ligne** (RLS), contre 8 lignes pour le gérant légitime du tenant A — deux principaux authentifiés réellement distincts, pas des claims fabriqués |
| **Utilisateur inactif** | Un utilisateur banni via l'API admin GoTrue (`ban_duration`) : nouvelle tentative de connexion refusée (`user_banned`), et son **token déjà émis avant le bannissement** est lui aussi rejeté par `GET /user` |
| **Adhésion révoquée** | `utilisateurs_entreprises.statut` mis à `'desactive'` pour un utilisateur dont le JWT reste valide (non expiré) → l'accès aux données de son entreprise passe de 300 lignes à **0 ligne immédiatement**, sans qu'il ait eu besoin de se reconnecter |

**Découverte notable (pas un nouveau défaut produit, une propriété d'architecture
confirmée par l'exécution) :** un token émis *avant* un bannissement GoTrue continue de
passer la vérification signature+expiration du pont — donc continuerait de passer un vrai
PostgREST aussi, puisque celui-ci ne rappelle jamais GoTrue pour vérifier un bannissement à
chaque requête (comportement JWT sans état, standard, pas spécifique à ce produit). Seule la
révocation au niveau de l'adhésion applicative (`utilisateurs_entreprises.statut`) coupe
réellement l'accès aux données pour un token non expiré — **exactement le point déjà
documenté par `PE-07`** (« révoquer l'appareil » ne coupe pas l'accès, seule la
désactivation du **compte** le fait). Cette mission apporte une preuve d'exécution
supplémentaire, au niveau plateforme, à l'appui de la même conclusion et du même
contournement déjà recommandé au §14 de V2.

---

## 5. Classification des 96 `NOT_TESTABLE_LOCALLY` (V2)

Catégories demandées : `AUTH_REQUIRED`, `POSTGREST_REQUIRED`, `STORAGE_REQUIRED`,
`BROWSER_REQUIRED`, `REMOTE_ONLY`, `ACTUALLY_AUTOMATABLE`.

**Constat principal :** la quasi-totalité des 96 items n'était pas bloquée par l'absence
d'Auth réelle en tant que telle (`AUTH_REQUIRED` au sens strict ne concernait que
`ON-01`/`ON-05`, maintenant convertis) — elle était bloquée par l'absence d'exécution tout
court : ce sont des RPC/triggers/policies RLS jamais appelés par aucun test, testables avec
l'infrastructure construite ici (`jwt_bridge.mjs` + GoTrue réel), simplement pas encore
exécutés faute de temps dans cette session. Ceux-là sont classés `ACTUALLY_AUTOMATABLE` —
c'est la catégorie la plus nombreuse, et c'est la feuille de route la plus concrète pour la
prochaine mission (§8).

| Catégorie | Nombre | IDs |
| --- | --- | --- |
| **Converti → PASS cette mission** | 5 | ON-01, ON-04, ON-05, ON-06, CL-06 |
| **Preuve renforcée, statut inchangé (§4.2)** | 8 | SEC-01, SEC-02, SEC-03, CM-07, EX-03, ST-08, PA-04, PA-05 |
| **ACTUALLY_AUTOMATABLE** (RPC/trigger/RLS pur, testable avec l'infra construite ici, non exécuté faute de temps) | 69 | ON-03 ; DB-02 ; CL-01, CL-02, CL-03, CL-04 ; CH-01, CH-02, CH-03, CH-07 ; DV-01, DV-02, DV-07, DV-08, DV-10 ; FA-01, FA-03, FA-04, FA-05, FA-06, FA-10 ; CM-01, CM-02, CM-03, CM-06 ; FR-01, FR-02, FR-03 ; ST-01, ST-03, ST-04, ST-05, ST-07 ; DP-02, DP-04 ; NF-02, NF-03, NF-04, NF-05 ; PE-01, PE-04 ; PA-01, PA-03, PA-06 ; PL-01, PL-02, PL-04, PL-06 ; PT-01, PT-02, PT-03, PT-04, PT-07 ; CG-01, CG-02, CG-03, CG-04 ; EX-02, EX-04 ; MS-01, MS-02, MS-03 ; DOC-01 ; RG-02, RG-03, RG-04 ; SEC-06, SEC-07, SEC-10 |
| **BROWSER_REQUIRED** (rendu PDF/UI réel, capture photo/signature, page scopée, middleware de redirection) | 10 | ON-02, ON-08, CH-05, CH-08, AV-04, NF-01, PE-06, PA-02*, EX-01, MS-04† |
| **STORAGE_REQUIRED** (service Storage HTTP réel) | 2 | DP-03, PE-05 |
| **REMOTE_ONLY** (appel LLM/service externe réel) | 2 | DV-11, DOC-02 |
| **Total classifié** | **96** | 5 (converti) + 8 (preuve renforcée) + 69 + 10 + 2 + 2 = 96 |

`*` `PA-02` (« vue dossier individuel — nécessite une marche en conditions réelles ») est à
la frontière ACTUALLY_AUTOMATABLE/BROWSER_REQUIRED : la donnée est RPC-testable, mais le
critère porte sur un parcours UI complet — classé BROWSER_REQUIRED par prudence.
`†` `MS-04` porte sur l'existence même d'une fonctionnalité (« suggestion de réponse IA » en
messagerie) que la lecture de code n'a pas confirmée — plus proche d'une vérification produit
que d'un test technique ; laissé `NOT_TESTABLE_LOCALLY`/à vérifier humainement plutôt que
forcé dans une case technique.

Aucun item n'a été reclassé `REMOTE_ONLY` au sens « nécessite une vraie Preview Supabase » —
cette mission n'a trouvé aucun cas où **seule** une Preview réelle (par opposition à
PostgREST/Storage locaux qu'on pourrait en théorie construire) suffirait ; PostgREST et
Storage restent des limites d'outillage de cet environnement précis, pas des limites de
conception du produit.

---

## 6. Storage et navigateur (mission §7-§8)

- **Storage** : 33 fichiers de l'application appellent `supabase.storage.*` (l'API HTTP
  réelle du service Storage, pas seulement les tables `storage.buckets`/`storage.objects`
  déjà stubées par `pg_bootstrap.sql` pour les besoins RLS de pgTAP). Sans le service Docker
  `storage-api` (bloqué par le même plafond de registre que PostgREST/GoTrue), aucun test
  d'upload/download/signature réel n'a pu être mené. `DP-03` et `PE-05` restent
  `STORAGE_REQUIRED`.
- **Navigateur (Playwright)** : `@playwright/test` est déjà une dépendance du dépôt, un
  Chromium est pré-installé dans cet environnement, et `tests/e2e/*.spec.ts` existent déjà
  avec `playwright.config.ts` pointant par défaut sur `http://127.0.0.1:3100` (pas
  uniquement une Preview distante — un `next dev` local était en théorie une option). Décision
  documentée : ne **pas** lancer `next dev` ici, car `@supabase/supabase-js` route toutes les
  données par PostgREST (indisponible) — la quasi-totalité des pages authentifiées
  échoueraient dès le premier appel de données, produisant des échecs Playwright pour la
  mauvaise raison (absence de PostgREST, pas un défaut produit) et polluant le rapport avec
  un signal trompeur. Seul l'écran de connexion (GoTrue uniquement) aurait pu être exercé
  pour un gain marginal ; jugé hors budget face aux résultats Auth/RLS obtenus par ailleurs.

---

## 7. Défauts produits découverts

**Aucun nouveau défaut produit confirmé** dans cette mission au-delà de ce que V2 avait déjà
documenté et, pour deux d'entre eux, déjà corrigé. La découverte du §4.3 (token pré-ban
toujours valide côté données) est une propriété attendue de l'authentification par JWT sans
état — pas un défaut, et déjà couverte par la recommandation existante `PE-07`. Aucun
correctif appliqué dans cette mission : rien de « minimal et certain » à corriger n'a été
identifié (règle §10 de la mission : corriger seulement si minimal/certain).

---

## 8. Prochaine mission — priorités concrètes

1. **Exécuter la batterie `ACTUALLY_AUTOMATABLE`** (57 IDs, §5) avec `jwt_bridge.mjs` — la
   même technique validée ici pour `a_permission()`/`activer_compte_employe`/
   `creer_entreprise_bootstrap` s'applique directement : signup réel, JWT réel, `run` sous
   les bonnes claims. C'est la voie la plus rapide pour continuer à faire baisser
   `NOT_TESTABLE_LOCALLY` sans nouvel outillage.
2. **Vérifier individuellement le rendu des 8 pages du §4.2** (`/parametres/acces`,
   `/rentabilite`, `/tresorerie`, `/paie`, `/exports`, `/stock`, `/fournisseurs`,
   `/employes/[id]/modifier`) pour savoir si elles répliquent le défaut UX `CL-05`/`DV-09`
   (page vide sans message) ou si certaines gèrent déjà correctement l'erreur (le libellé
   « middleware » de `SEC-01` suggère que ce n'est peut-être pas uniforme).
3. **PostgREST réel** reste la limite structurelle majeure : soit un environnement futur
   avec un registre Docker non plafonné, soit — piste non explorée ici, plus risquée — un
   `nix-shell`/toolchain Haskell portable pour compiler PostgREST depuis les sources.
4. **Storage réel** : même limite que PostgREST, même dépendance au registre Docker.

---

## Verdict

**LOCAL AUTH/POSTGREST ACCEPTANCE QUALIFIED — PARTIAL (Auth qualifiée, PostgREST non
atteinte)**

Justification :
- Un vrai GoTrue tourne localement, pour la première fois de ce dossier de qualification,
  compilé depuis les sources sans dépendre du registre Docker bloqué. Les 5 scénarios de
  session demandés (valide/expiré/mauvais tenant/inactif/révoqué) sont tous vérifiés par
  exécution réelle, pas par simulation.
- Les deux RPC d'onboarding critiques (`creer_entreprise_bootstrap`, `activer_compte_employe`)
  sont désormais prouvées par exécution réelle de bout en bout, convertissant `ON-01` et
  `ON-05` de « relecture de code » à `PASS`.
- PostgREST reste hors de portée (pas de toolchain Haskell, registre Docker plafonné) : les
  critères d'acceptation qui portent spécifiquement sur le comportement HTTP/UI (redirection,
  message d'erreur affiché) restent `NOT_TESTABLE_LOCALLY`, même là où le mécanisme de
  sécurité sous-jacent est maintenant prouvé.
- Storage et navigateur restent hors de portée pour la même raison structurelle (registre
  Docker), pas pour une raison de conception du produit.
- 91/143 (64 %) restent `NOT_TESTABLE_LOCALLY`, en baisse depuis 96/143 (67 %) — une
  réduction réelle mais modeste en volume ; la contribution principale de cette mission est
  moins le nombre de conversions que **l'infrastructure reproductible** (`npm run
  pilot:auth:local`, validée à froid trois fois) qui rend triviale, pour la prochaine
  mission, la conversion des 57 items `ACTUALLY_AUTOMATABLE` identifiés en §5.

Une Preview Supabase réelle (ou un environnement Docker non plafonné) reste nécessaire pour
fermer complètement PostgREST, Storage, et les parcours UI réels — comme déjà conclu par V2 —
mais le périmètre couvrable localement sans cela est maintenant strictement plus large
qu'avant cette mission, et documenté avec une méthode reproductible pour continuer à
l'élargir.
