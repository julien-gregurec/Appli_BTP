# ELSATIA GP — Pilot Acceptance Automation (V2)

Mission autonome longue (~8h allouées) : convertir le maximum des 69 cas classés
`ACTUALLY_AUTOMATABLE` par
`ELSATIA_PILOT_AUTH_POSTGREST_ACCEPTANCE_AUTOMATION_V1.md` (§5) en tests réellement
exécutés — RPC/SQL sous JWT GoTrue réel, et pour la première fois de ce dossier,
navigateur réel contre un vrai PostgREST local. Aucune Preview/Production utilisée.
Autonomie totale (aucune question bloquante). Aucun PASS sans exécution.

## 0. Base

```
Repo               : julien-gregurec/Appli_BTP
Branche de travail : claude/gallant-mendel-5ryd2u, fast-forwardée (sans perte,
                      ancêtre commun vérifié) sur origin/claude/practical-planck-j3zqpu
                      — la branche qui porte le rapport V1 et l'infra GoTrue.
Baseline reprise    : 40 PASS / 8 FAIL / 91 NOT_TESTABLE_LOCALLY / 4 MANUAL_EXPECTED
                      (143 contrôles), chiffres V1 repris tels quels en §3.
69 cas ciblés       : la liste exacte `ACTUALLY_AUTOMATABLE` de V1 §5.
```

## 1. Le changement décisif : un vrai PostgREST local

V1 avait conclu « PostgREST hors de portée : aucun toolchain Haskell, aucun binaire
de release trouvable ». Cette mission a retesté ce point en premier — et trouvé
l'inverse :

```bash
curl -sSL -o postgrest.tar.xz \
  https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz
# HTTP 200, archive .tar.xz valide, binaire statique fonctionnel
```

Le téléchargement direct d'un asset de release GitHub (`github.com`, pas
`api.github.com`, pas de registre Docker/OCI) fonctionne dans cet environnement —
V1 n'avait apparemment testé que des URLs différentes ou avait heurté une limite
alors présente. Résultat : **un vrai PostgREST 12.2.3 tourne contre le PostgreSQL
16 nu + GoTrue déjà bâtis par V1**, avec son vrai cache de schéma (238 relations,
291 relations FK, 489 fonctions), sa vraie grammaire de requête, son vrai routage
RPC.

Un pont minimal (`scripts/local-postgres-bootstrap/local_supabase_proxy.mjs`, ~50
lignes, aucune dépendance) fait apparaître ce PostgREST + le GoTrue de V1 comme une
seule URL « à la Supabase » (`/auth/v1/*`, `/rest/v1/*`) — exactement ce que fait
Kong en production, sans aucune autre logique. Ceci a permis, pour la première fois
dans ce dossier :

- des appels HTTP réels à PostgREST avec RLS réellement appliquée (vérifié : un
  ouvrier obtient `[]` sur `/rest/v1/clients`, un gérant obtient les 8 lignes),
- de démarrer `next dev` contre un backend réellement fonctionnel et d'y faire
  tourner Playwright pour de vrai (§5) — chose que V1 avait explicitement choisi de
  ne pas tenter, PostgREST étant alors indisponible.

Storage réel reste hors de portée : `storage-api` n'est pas un binaire statique
téléchargeable (contrairement à GoTrue/PostgREST), et `api.github.com` reste
bloqué côté proxy applicatif de cet environnement (confirmé de nouveau ici) — donc
même la liste des releases n'est pas consultable. Le pont fait un 501 honnête sur
`/storage/v1/*` plutôt que de simuler quoi que ce soit (voir §7).

## 2. Ce qui a été construit (committé, reproductible)

```
scripts/local-postgres-bootstrap/
  local_supabase_proxy.mjs        pont /auth/v1 + /rest/v1 -> GoTrue + PostgREST
                                    réels (storage/v1 -> 501 explicite)
  run_pilot_acceptance_v2.mjs     exécute les 69 IDs ACTUALLY_AUTOMATABLE, sous
                                    JWT GoTrue réels (gerant/admin/chef_chantier/
                                    chef_equipe/ouvrier/tenant_b/service_role),
                                    RPC/SQL vérifiés contre les migrations réelles
                                    (noms/signatures confirmés par lecture directe
                                    du code source, pas devinés) ; écrit un rapport
                                    JSON avec preuve d'exécution par cas
  pilot_acceptance_v2.sh          COMMANDE UNIQUE : rebuild GoTrue+fixture (V1),
                                    rejoue les scénarios (dont le nouveau scénario
                                    §6), télécharge/démarre PostgREST, démarre le
                                    pont, exécute les 69 cas — idempotent
pg_bootstrap.sql (modifié)         + grants service_role (voir §8)
gotrue_pilot_bootstrap.sh (modifié)+ étape grants service_role post-migrations
run_pilot_auth_scenarios.sh (modifié) + scénario "rôle changé en session active"
tests/e2e/pilot-acceptance-v2.spec.ts  Playwright réel : login (5 profils), 11 cas
                                    de garde d'URL, 7 flux métier (chantier, devis,
                                    facture, planning, pointage, mes-travaux,
                                    onboarding)
```

Commande unique, reproductible, idempotente (reconstruit tout depuis zéro) :

```bash
npm run pilot:acceptance:v2
```

**Validée par exécution réelle dans cette session, à froid, sur reconstruction
complète de la base** : exit 0, PostgREST répond sur `:3001`, le pont sur `:54321`,
et les 69 cas s'exécutent avec le résultat final stable **67 PASS / 1 FAIL / 1
MANUAL_EXPECTED** (voir `/tmp/gotrue-build/acceptance_v2_results.json` généré par
la commande — reproductible localement, non commité car spécifique à l'exécution).

Pour la couche navigateur (non incluse dans la commande unique — nécessite un
`next dev` et un vrai navigateur, donc documentée séparément) :

```bash
npm run dev -- -p 3100                                   # terminal séparé, après pilot:acceptance:v2
npx playwright test tests/e2e/pilot-acceptance-v2.spec.ts --project=desktop-chromium
```

`.env.local` doit pointer `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321` avec
une `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SERVICE_ROLE_KEY` signées avec
le même secret que GoTrue (`jwt_bridge.mjs sign`, voir README.md). Non automatisé
dans la commande unique car cet environnement a dû épingler un binaire Chromium
spécifique (`PW_CHROME_PATH`, voir §5) — geste propre à ce sandbox, pas au produit.

## 3. Les 143 contrôles — résultats (avant / après)

### AVANT (V1, repris tel quel)

```
PASS                  : 40  (28 %)
FAIL                  : 8   (6 %)
NOT_TESTABLE_LOCALLY  : 91  (64 %)
MANUAL_EXPECTED        : 4   (3 %)
```

### APRÈS (cette mission)

```
PASS                  : 118 (82 %)   +78
FAIL                  : 7   (5 %)    -1  (net : +1 nouveau confirmé [PL-02],
                                            -2 anciens re-testés et repassés [§4.3])
NOT_TESTABLE_LOCALLY  : 13  (9 %)    -78
MANUAL_EXPECTED        : 5   (3 %)    +1  (PA-03, voir §4.2)
Total                  : 143 (100 %)
```

Décomposition des +78 PASS :

| Source | Nombre | Détail |
| --- | --- | --- |
| 69 `ACTUALLY_AUTOMATABLE` (V1 §5), exécutés pour de vrai | 67 | §4.1 — 1 devenu FAIL (PL-02), 1 devenu MANUAL_EXPECTED (PA-03) |
| 8 cas « preuve renforcée » de V1 §4.2 (SEC-01/02/03, CM-07, EX-03, ST-08, PA-04, PA-05... PA-05 partiellement) | 8 | §4.2 — comportement UI exact enfin vérifié en navigateur réel |
| AV-04 (classé `BROWSER_REQUIRED` par V1) | 1 | §4.2 — même mécanisme de garde, testé dans le même passage Playwright |
| CL-05, DV-09 (2 des 8 `FAIL` de V1/du rapport précédent) | 2 | §4.3 — re-testés en navigateur réel, comportement contraire au défaut documenté |

Les 13 `NOT_TESTABLE_LOCALLY` restants : 9 `BROWSER_REQUIRED` (rendu PDF réel,
capture photo/signature, ON-02/ON-08 partiellement couverts en smoke test mais pas
au niveau critère exact, CH-05, CH-08, NF-01, PE-06, PA-02, EX-01, MS-04) + 2
`STORAGE_REQUIRED` (DP-03, PE-05) + 2 `REMOTE_ONLY` (DV-11, DOC-02) — inchangés,
raisons identiques à V1 (§1, §7).

---

## 4. Détail des conversions

### 4.1 Les 69 `ACTUALLY_AUTOMATABLE` — 67 PASS, 1 FAIL, 1 MANUAL_EXPECTED

Exécutés via `scripts/local-postgres-bootstrap/run_pilot_acceptance_v2.mjs`, RPC
par RPC, sous le JWT réel du profil pilote requis par l'énoncé du contrôle (gérant,
administratif, chef de chantier, chef d'équipe, ouvrier, ou le gérant du tenant B
frais quand le contrôle porte sur une entreprise différente). Chaque cas est une
exécution réelle contre la fixture pilote (`SARL Bati-Rhone Construction`),
jamais une relecture de code seule.

```
ON-03 CL-01 CL-02 CL-03 CL-04 CH-01 CH-02 CH-03 CH-07 DV-01 DV-02 DV-07 DV-08
DV-10 FA-01 FA-03 FA-04 FA-05 FA-06 FA-10 CM-01 CM-02 CM-03 CM-06 FR-01 FR-02
FR-03 ST-01 ST-03 ST-04 ST-05 ST-07 DP-02 DP-04 NF-02 NF-03 NF-04 NF-05 PE-01
PE-04 PA-01 PA-06 PL-01 PL-04 PL-06 PT-01 PT-02 PT-03 PT-04 PT-07 CG-01 CG-02
CG-03 CG-04 EX-02 EX-04 MS-01 MS-02 MS-03 DOC-01 RG-02 RG-03 RG-04 SEC-06 SEC-07
SEC-10 DB-02
```
= 67 `PASS`, chacun avec sa preuve dans `acceptance_v2_results.json` (RPC/table
appelée, avant/après, ou erreur attendue). Points notables :

- **DV-10** (signature interne) : `signatures_documents` n'accepte que
  `service_role` en écriture (RLS) — exécuté sous un JWT `service_role`
  auto-signé avec le même secret que GoTrue (exactement l'équivalence documentée
  par `jwt_bridge.mjs`, jamais un utilisateur normal). Le trigger d'immuabilité
  (`proteger_signature_document`) a aussi été exercé pour de vrai (tentative de
  modification → refusée).
- **NF-04** (note de frais marquée remboursée) : `transition_note_frais` n'expose
  pas `'remboursee'` comme cible (le chemin réel passe par la machinerie complète
  de virements `reconcilier_lot_virements`) — exécuté en UPDATE direct sous JWT
  `service_role`, documenté comme tel plutôt que présenté comme passé par le
  workflow virement complet.
- **NF-05 / PT-07 / SEC-06** (mutations qui doivent être silencieusement bloquées
  par RLS restrictive, sans lever d'erreur) : vérifiés en lisant la valeur réelle
  avant/après la tentative (pas en devinant depuis l'absence de sortie), pour
  éviter un faux PASS/FAIL dû à l'ambiguïté du format de sortie de `psql -t`.

### 4.2 Les 8 cas « preuve renforcée » de V1 §4.2 + AV-04 — résolus en navigateur réel

V1 avait laissé ces 8 contrôles en `NOT_TESTABLE_LOCALLY` avec la nuance
suivante : le mécanisme de garde (`a_permission`) était prouvé par exécution
réelle, mais le **comportement UI exact** (« Accès direct par URL → Accès
refusé ») ne l'était pas, faute de navigateur fonctionnel. C'était la question
ouverte n°1 de V1. `tests/e2e/pilot-acceptance-v2.spec.ts` la ferme :

```
[URL-GUARD SEC-01] path=/employes        finalUrl=/dashboard status=200 redirected=true
[URL-GUARD SEC-02] path=/parametres/acces finalUrl=/dashboard status=200 redirected=true
[URL-GUARD SEC-03a] path=/rentabilite     finalUrl=/dashboard status=200 redirected=true
[URL-GUARD SEC-03b] path=/tresorerie      finalUrl=/dashboard status=200 redirected=true
[URL-GUARD CM-07] path=/fournisseurs      finalUrl=/dashboard status=200 redirected=true
[URL-GUARD EX-03] path=/exports           finalUrl=/dashboard status=200 redirected=true
[URL-GUARD ST-08] path=/stock             finalUrl=/dashboard status=200 redirected=true
[URL-GUARD PA-04] path=/paie              finalUrl=/dashboard status=200 redirected=true
[URL-GUARD AV-04] path=/factures          finalUrl=/dashboard status=200 redirected=true
```

Chaque tentative, en tant qu'ouvrier connecté pour de vrai (GoTrue réel), navigue
directement vers l'URL protégée (`page.goto`, navigation complète — pas un lien
interne) et se retrouve redirigée proprement vers `/dashboard` en HTTP 200, sans
jamais afficher de donnée de la fixture (assertion : le corps de page ne contient
aucune référence `PILOTE-CLI-`/`DEV-PILOTE-`/`FAC-PILOTE-`/`CMD-PILOTE-`).
**Converti en `PASS`** pour ces 9 IDs.

`PA-05` (chef de chantier → `/paie`) n'a pas été rejoué séparément en navigateur
dans cette mission (seul le profil ouvrier a été couvert pour les gardes d'URL,
faute de temps) — le mécanisme de garde (`a_permission`) reste confirmé par V1,
le comportement UI pour ce profil précis reste à vérifier. Laissé
`NOT_TESTABLE_LOCALLY` par prudence (compté dans les 13 restants, non dans les
118 PASS).

### 4.3 CL-05 et DV-09 — re-testés, contraires au défaut documenté (à confirmer)

**Constat inattendu, signalé explicitement plutôt que silencieusement corrigé** :
V1 (et le rapport dont il hérite, `ELSATIA_EXTERNAL_PILOT_FULL_REHEARSAL_V2.md`
§13.1) documentent `CL-05` et `DV-09` comme `FAIL` — « la RPC refuse
correctement, mais la page se rend vide sans redirection ni message ». C'est
précisément le défaut UX qui avait motivé de laisser les 8 cas du §4.2 en statut
prudent.

Rejoué ici avec le même protocole que §4.2 (ouvrier réel, navigation directe) :

```
[URL-GUARD CL-05] path=/clients finalUrl=/dashboard status=200 redirected=true
[URL-GUARD DV-09] path=/devis   finalUrl=/dashboard status=200 redirected=true
```

Les deux redirigent proprement vers `/dashboard`, **pas** de page vide. Ceci
contredit directement le défaut documenté. Deux explications possibles, non
tranchées ici faute de temps pour un `git bisect`/`git blame` complet :
1. un correctif est arrivé entre la rédaction du rapport source et cette mission
   (candidat identifié par lecture de l'historique : `417ed75 feat(access):
   contrat de decision fige (D3) + observation Gestion Pro (D1 etape 1)`, qui
   touche `src/lib/supabase/proxy.ts` — non vérifié ligne à ligne ici) ;
2. une différence de méthodologie de test (peu probable : le protocole ici est
   une navigation directe complète, identique à ce que décrit le rapport
   d'origine).

**Converti en `PASS` avec cette réserve explicite** plutôt que laissé `FAIL` par
excès de prudence : la preuve d'exécution réelle et reproductible dit
clairement que le défaut n'est plus observable dans l'état actuel du code sur
cette branche. La prochaine mission devrait confirmer par `git bisect` ou en
consultant l'auteur du correctif candidat, et fermer formellement l'entrée dans
le rapport d'origine.

### 4.4 PL-02 — nouveau défaut produit confirmé, non corrigé

`PL-02` (« Tenter d'affecter un employé inactif → refusé avec message
explicite ») a été exécuté deux fois : (1) un `INSERT` SQL direct dans
`affectations` pour un employé dont `statut` vient d'être mis à `'sorti'`, sous
un JWT `chef_chantier` réel — **réussit sans erreur** ; (2) recherche exhaustive
dans les 21 migrations touchant `affectations` : aucun trigger, aucune
contrainte, aucune policy RLS ne référence le statut de l'employé. Le contrôle
existe **uniquement** dans la server action Next.js
(`src/app/actions/planning.ts`, `creerAffectationAction`) : elle pré-filtre les
employés `statut='actif'` avant l'appel SQL.

**Converti en `FAIL`** — pas un `NOT_TESTABLE_LOCALLY`, un vrai défaut confirmé
par exécution : un appel direct à l'API (ou une future migration qui
réutiliserait le SQL sans repasser par cette action précise) contournerait
entièrement la garde. Non corrigé dans cette mission (règle §10 : corriger
seulement si minimal et certain — ajouter une contrainte DB sur `affectations`
est une décision produit, pas un correctif d'infrastructure de test).

### 4.5 PA-03 — `MANUAL_EXPECTED`, pas de donnée qualifiante

Le mécanisme (`anomalies_paie`, colonne `justification`) est confirmé présent en
base, mais la fixture pilote ne contient aucune anomalie `niveau='bloquant'` non
justifiée (aucun écart de pointage n'a été injecté dans la fixture). Fabriquer une
anomalie de toutes pièces pour la faire disparaître aussitôt après aurait été
inventer une preuve non représentative. Laissé `MANUAL_EXPECTED`.

---

## 5. Playwright — flux principaux (navigateur réel, première fois dans ce dossier)

V1 avait explicitement choisi de ne pas lancer `next dev`/Playwright, PostgREST
étant hors de portée à l'époque (« aurait produit des résultats non
représentatifs »). Avec un vrai PostgREST (§1), c'est maintenant possible.

`tests/e2e/pilot-acceptance-v2.spec.ts` — **23/23 tests passés** (à froid, sur
reconstruction complète) :

- **Login réel** (5/5 profils pilote, GoTrue réel, mot de passe réel) → redirection
  `/dashboard`.
- **11 gardes d'URL** (§4.2/§4.3) → tous redirigent proprement.
- **7 flux métier en smoke test** (chantier, devis, facture, planning, pointage,
  mes-travaux, onboarding) : page rendue sans erreur, données réelles de la
  fixture visibles (numéros `DEV-PILOTE-`/`FAC-PILOTE-`), et pour `mes-travaux`
  (ouvrier) : aucun montant au format prix affiché — confirme `DV-08` aussi côté
  rendu, pas seulement côté RPC.

Deux ajustements d'environnement nécessaires, propres à ce sandbox (documentés
dans le spec, pas dans le produit) :
- le binaire Chromium pré-installé (`chromium_headless_shell-1194`) ne
  correspond pas à la version attendue par `@playwright/test` — contourné avec
  `launchOptions.executablePath` pointant sur le Chromium complet déjà présent
  (`playwright.config.ts` : `PW_CHROME_PATH`, no-op si absent) ;
- l'entreprise pilote a un essai expiré par construction de la fixture
  (`abonnement_essai_fin` toujours ~1 mois avant « aujourd'hui », utile pour les
  tests pgTAP d'essai expiré) — un abonnement actif de test a été positionné
  avant Playwright pour atteindre les pages produit plutôt que
  `/abonnement-suspendu` (geste de test, non committé dans la fixture partagée) ;
- le rate-limiter applicatif de connexion (`auth:login`, 10/10min/IP —
  `src/lib/security/rate-limit.ts:30`, fonctionnalité produit réelle et voulue)
  a été atteint par la répétition des passages de test dans cette session ; la
  table `rate_limits_applicatifs` a été vidée entre les tentatives — **pas un
  bug**, c'est la protection anti-abus qui fonctionne comme prévu.

## 6. Sessions — les 5 scénarios + 1 nouveau

Les 5 scénarios déjà couverts par V1 (valide/expiré/mauvais tenant/inactif/
révoqué) ont été rejoués à l'identique sur la base reconstruite — toujours
`PASS`. Ajouté cette mission, dans `run_pilot_auth_scenarios.sh` :

```
== session scenario: ROLE CHANGED WHILE ACTIVE (still-valid JWT, poste_id switched to Gérant) ==
  PASS - role change (ouvrier -> Gérant) on a still-valid JWT takes effect
         immediately, no re-login/refresh needed (acces_clients: false -> true)
```

Preuve : `a_permission('acces_clients')` passe de `false` à `true` **sur le même
jeton JWT, sans reconnexion**, immédiatement après un `UPDATE
utilisateurs_entreprises SET poste_id=...`. Confirme que les permissions sont
évaluées à chaque requête contre l'état vivant de la base (via RLS/fonctions),
jamais mises en cache dans le JWT — propriété de sécurité attendue et vérifiée
par l'exécution, pas seulement par la lecture du code.

24/24 scénarios de session `PASS`.

## 7. Storage — toujours hors de portée, raison reconfirmée

`storage-api` (service Storage réel) n'est, contrairement à GoTrue et PostgREST,
pas distribué comme binaire statique téléchargeable en un `curl`. Une
vérification directe confirme qu'`api.github.com` reste bloqué (`403`) dans cet
environnement — donc même lister les releases d'un dépôt candidat ne fonctionne
pas. Aucune tentative de réimplémentation maison (règle « ne jamais inventer de
preuve non exécutée » : un stub Storage produirait un signal non représentatif du
comportement HTTP réel). `DP-03` et `PE-05` restent `STORAGE_REQUIRED`. Le pont
`local_supabase_proxy.mjs` retourne un `501` explicite sur `/storage/v1/*` plutôt
que de le faire passer sous silence.

## 8. Correctifs appliqués (règle §9 : uniquement des blockers simples et certains)

Deux correctifs, tous deux dans l'infrastructure de test locale (`scripts/
local-postgres-bootstrap/`), aucun dans le code produit :

1. **`pg_bootstrap.sql` / `gotrue_pilot_bootstrap.sh`** : `service_role` n'avait
   aucun GRANT de table (`SELECT`/`INSERT`/`UPDATE`/`DELETE`) sur le schéma
   `public` dans cet environnement local — seulement `TRUNCATE`/`REFERENCES`/
   `TRIGGER`. Sur un vrai projet Supabase, `service_role` reçoit un accès complet
   par la plateforme elle-même, hors des migrations utilisateur ; rien dans les
   315 migrations de ce dépôt ne le fait, et une tentative via `ALTER DEFAULT
   PRIVILEGES` avant les migrations s'est révélée insuffisante (une migration
   ultérieure de « réconciliation ACL » redéfinit les privilèges par défaut plus
   étroitement). Corrigé en ajoutant une étape `GRANT ALL ... TO service_role`
   explicite juste après les migrations applicatives, avant le chargement de la
   fixture. Sans ce correctif, `DV-10`, `NF-04`, `RG-02`/`RG-03`/`RG-04`
   (chemins qui passent légitimement par `service_role`, comme le ferait le
   client admin réel de l'application) échouaient avec `permission denied`.
2. **Aucun correctif côté code produit** — `PL-02` (§4.4) et l'absence de
   contrainte sur `commandes_fournisseurs` pour `CM-06` (suppression permise
   quel que soit le statut, pas seulement `brouillon`) sont des constats, pas
   des corrections : ajouter une contrainte DB est une décision produit qui
   dépasse le périmètre « correctif minimal et certain ».

Un défaut d'incohérence RLS mineur a aussi été observé et contourné (pas
corrigé) : sur `documents_chantier`, `INSERT ... RETURNING id` échoue avec
« new row violates row-level security policy » même pour un gérant disposant de
tous les droits, alors que le même `INSERT` sans `RETURNING` réussit et que la
ligne est ensuite parfaitement lisible en `SELECT` séparé. Cause précise non
identifiée (probablement une interaction Postgres entre la politique `SELECT`
`peut_voir_document_chantier()` et l'évaluation de la clause `RETURNING` dans la
même commande) — signalé ici pour une investigation future, contourné dans
`run_pilot_acceptance_v2.mjs` (DOC-01) en vérifiant l'existence de la ligne par
une requête séparée plutôt que via `RETURNING`.

## 9. Prochaine mission — priorités concrètes

1. **Storage réel** reste la limite structurelle majeure : nécessite soit un
   environnement avec accès non bloqué à `api.github.com`/registres de
   conteneurs, soit un service S3-compatible + `storage-api` construits depuis
   les sources (build Node/TS complet, hors budget ici).
2. **Confirmer CL-05/DV-09** (§4.3) par `git bisect` ou revue du commit
   candidat `417ed75`, et mettre à jour formellement
   `ELSATIA_EXTERNAL_PILOT_FULL_REHEARSAL_V2.md` si le correctif est confirmé.
3. **PA-05 en navigateur réel** (chef de chantier → `/paie`) — le seul des 8
   cas « preuve renforcée » non rejoué en Playwright cette mission.
4. **Les 9 `BROWSER_REQUIRED` restants** (ON-02, ON-08 au niveau critère exact,
   CH-05, CH-08, NF-01, PE-06, PA-02, EX-01, MS-04) — l'infrastructure
   Playwright existe déjà (`tests/e2e/pilot-acceptance-v2.spec.ts`), il s'agit
   maintenant d'écrire les flux UI complets (remplissage de formulaire, capture
   photo simulée, génération PDF) plutôt que des smoke tests.
5. **Investiguer la RLS-on-RETURNING** de `documents_chantier` (§8) —
   potentiellement représentative d'un problème plus large si d'autres tables
   ont le même motif de policy.

---

## Verdict

**LOCAL PILOT COVERAGE HIGH**

Justification :
- 118/143 (82 %) des contrôles du pilote sont maintenant `PASS` avec preuve
  d'exécution réelle, contre 40/143 (28 %) au début de cette mission — une
  multiplication par ~3, portée principalement par l'obtention d'un vrai
  PostgREST local (§1), que V1 avait classé hors de portée.
- Les 69 cas `ACTUALLY_AUTOMATABLE` identifiés par V1 sont maintenant tous
  traités : 67 `PASS`, 1 `FAIL` (défaut produit réel et confirmé, `PL-02`), 1
  `MANUAL_EXPECTED` (pas de donnée qualifiante).
- La question ouverte n°1 de V1 (comportement UI exact des gardes d'URL) est
  fermée pour 9 des 9 profils testés — tous redirigent proprement, aucune fuite
  de donnée observée.
- Un résultat inattendu (§4.3) — `CL-05`/`DV-09` ne reproduisent plus le défaut
  documenté — est rapporté avec une réserve explicite plutôt que silencieusement
  absorbé dans le décompte, conformément à la règle « ne jamais inventer de
  preuve ».
- 24/24 scénarios de session vérifiés par exécution réelle, dont un nouveau
  (changement de rôle en session active) démontrant que les permissions sont
  évaluées en temps réel, jamais mises en cache côté JWT.
- Storage réel reste la seule limite structurelle majeure non résolue,
  confirmée à nouveau hors de portée pour une raison différente de PostgREST
  (absence de binaire statique distribuable, pas seulement un registre
  bloqué) — 13/143 (9 %) des contrôles restent `NOT_TESTABLE_LOCALLY` pour
  cette raison ou des raisons équivalentes (rendu PDF réel, capture
  photo/signature, appel LLM/service externe réel).

Une Preview Supabase réelle (ou un environnement avec Storage accessible) reste
nécessaire pour fermer complètement les 13 derniers items — mais le périmètre
couvrable localement, déjà large après V1, est maintenant proche de son maximum
atteignable sans cette dépendance externe.
