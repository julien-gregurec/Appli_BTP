# ELSATIA COLORS — FULL QUALIFICATION V2

**Objet** — Fermer localement tout ce que `ELSATIA_COLORS_GAP_ANALYSIS_V1.md` laissait ouvert
(verdict V1 : **COLORS PARTIALLY QUALIFIED**) : suspension d'application, câblage Playwright,
authentification et session de bout en bout, cloisonnement de toutes les opérations, Storage,
build fail-closed. Chaque chiffre ci-dessous a été produit dans cette session.

| | |
|---|---|
| Branche de base | `origin/claude/kind-allen-68wk2i` (`a941c40f`, lignée monorepo Colors retenue par la V1) |
| Branche de travail | `claude/quirky-franklin-mb6eth` (recréée depuis la base ci-dessus) |
| Moteur de base | PostgreSQL 16.13 réel + pgTAP, train complet de **321 migrations** rejoué depuis zéro |
| Navigateur | Chromium (Playwright 1.62.1), `retries: 0`, `workers: 1` |
| Docker | démon démarrable, mais **tirage d'images refusé** (`Data limit exceeded` / 403) ; GitHub Releases refusé (403) → ni `supabase start`, ni binaires GoTrue/PostgREST officiels |

## 0. Verdict

**COLORS LOCALLY QUALIFIED**

Tout le périmètre exécutable sans infrastructure hébergée est désormais prouvé, en conditions
réelles de base et de navigateur : 442 assertions pgTAP Colors, 431 tests unitaires, **73 tests
Playwright verts sur quatre passes consécutives** contre l'application compilée, build prouvé
dans les deux sens. La suspension d'application, seul domaine à zéro preuve en V1, est couverte
à toutes les couches (DB/RLS, RPC, Storage, gardes serveur, routes, API, session ouverte).

La qualification a trouvé et corrigé **cinq défauts produit réels**, dont un de sécurité (§2).

Ce n'est **pas** `READY FOR PREVIEW` : aucune preuve n'a touché un vrai Supabase hébergé
(GoTrue, PostgREST, Storage), ni Vercel. La pile e2e est une passerelle locale fidèle (§4),
explicitement non équivalente à un projet hébergé. Le déploiement Preview reste suspendu à
`DECISION_REQUIRED:PREVIEW-PROJECT-INVENTORY`.

## 1. Tableau de bord

| # | Domaine (V1) | V1 | V2 | Preuve V2 |
|---|---|---|---|---|
| 1 | auth | PARTIALLY | **PROVEN (local)** | login, logout, refus mot de passe, refus sans habilitation, lien profond, session révoquée ailleurs, cookies d'une session fermée, rafraîchissement de jeton observé — e2e |
| 2 | organisation | PARTIALLY | **PROVEN** | `contexte_application_courant` appelée par l'app sur vrai Postgres ; bascule appartenance → contexte vide (pgTAP E) |
| 3 | colors_admin_organisation | PARTIALLY | **PROVEN (droits)** | 11 actions autorisées chez soi, 0 chez l'autre (pgTAP V17) ; écran `/utilisateurs` toujours `ComingSoon` (inchangé, hors sécurité) |
| 4 | routing | PROVEN | PROVEN | 27 routes émises par `next build` |
| 5 | guards | PARTIALLY | **PROVEN** | refus réels d'utilisateurs suspendus / non habilités / anonymes sur pages, URL directes, 3 routes API (e2e) |
| 6 | RLS | BLOCKED | **PROVEN (Postgres réel)** | 442 assertions, rôles `authenticated` réels, claims JWT ; mutation détectée (§3.3) |
| 7 | DB | PARTIALLY/BLOCKED | **PROVEN (Postgres réel)** | 321 migrations rejouées sans erreur ; pas de projet hébergé |
| 8 | build | PROVEN | PROVEN | exit 1 sans env (5 variables nommées), exit 0 avec env |
| 9–10 | typecheck / lint | PROVEN | PROVEN | 0 / 0 |
| 11 | tests | unit PROVEN / e2e UNPROVEN | **PROVEN** | 431 unitaires ; **73/73 e2e ×4** |
| 12 | env | PROVEN (contrat) | PROVEN | manifeste : 0 erreur, 58/58 tests |
| 13 | Preview config | UNPROVEN | **UNPROVEN** | aucun déploiement — hors d'atteinte locale |
| 14 | multi-app entitlement | PARTIALLY | **PROVEN** | 5 formes de retrait testées (pgTAP + e2e) |
| 15 | session | PARTIALLY | **PROVEN (local)** | session révoquée, rafraîchissement, cookies rejoués, changement de compte sans fuite |
| 16 | suspension app | **UNPROVEN** | **PROVEN** | 90 assertions pgTAP + 6 parcours e2e, sans reconnexion |
| 17 | cross-tenant | PARTIALLY | **PROVEN** | 79 assertions pgTAP sur toutes les opérations + e2e (404 par URL exacte, export, navigateur) |

## 2. Défauts trouvés et corrigés

| # | Gravité | Défaut | Preuve avant | Correctif | Preuve après |
|---|---|---|---|---|---|
| D1 | **Sécurité (P1)** | Un membre disposant de `gerer_parametres` pouvait **annuler sa propre suspension programmée pour impayé** : `update entreprises set suspension_prevue_at = null` → `UPDATE 1`. `proteger_facturation_entreprise()` ne protégeait pas les colonnes de préavis ; or `est_membre_actif()` — donc l'accès à Colors, Réserves, Tools **et Gestion Pro** — coupe l'accès sur cette date. | pgTAP V16 tests 63, 64, 66 rouges sur une base sans le correctif | migration `20260923000330_proteger_suspension_entreprise.sql` : reprise à l'identique + `impaye_signale_at`, `suspension_prevue_at`, `impaye_message`, `dernier_reglement_at` | 90/90 ; suite pgTAP complète : ensemble d'échecs **identique** avant/après (§3.2) |
| D2 | P1 fonctionnel | **Aucune déconnexion possible sur téléphone** : sous 900 px la barre latérale (seul porteur du bouton) est masquée et le tiroir mobile n'en avait pas. | e2e `colors-mobile` « connexion puis déconnexion » rouge | bouton « Se déconnecter » (44 px) en pied du tiroir mobile | vert |
| D3 | P2 intégrité | **Double envoi du formulaire de création = deux seaux**. | e2e « double envoi » : 2 cartes au lieu d'1 | UUID du seau fixé au rendu (champ caché, `identifiantEnvoi`) ; le second envoi heurte la clé primaire et renvoie au seau existant **uniquement s'il est lisible sous RLS** (pas d'oracle d'existence) | vert ×4 + 3 tests unitaires |
| D4 | P2 API | Sous suspension, `/api/export/inventaire`, `/api/photos`, `/api/ocr` levaient `AccesApplicationRefuseError` non interceptée → **HTTP 500** (fermé, sans donnée, mais journalisé comme panne). | journal serveur + e2e | `refusAccesRouteApi()` → **403** explicite, garde statique étendue sans affaiblissement | e2e : export suspendu = 403 |
| D5 | P3 accessibilité | Avatar de compte 36 px au-delà de 900 px (une tablette tactile y est) | e2e « utilisable au doigt » rouge sur desktop | 44 px partout | vert |

### Résidu consigné, non corrigé

- **R1 (P2, UX)** — une *server action* envoyée depuis un formulaire déjà affiché **après** la
  suspension lève la même erreur : l'utilisateur voit l'écran d'erreur Next au lieu d'être
  renvoyé vers `/abonnement-requis`. **Aucune écriture n'a lieu** (prouvé : e2e « tenant
  suspendu… aucune écriture ne passe »). Correctif proposé : dans `contexteAction`
  (`actions-metier.ts`), appeler `determinerAccesColors` et rediriger comme le shell.

## 3. Base de données — pgTAP sur PostgreSQL 16 réel

Harnais : `scripts/local-postgres-bootstrap/` (amorce `auth`/`storage` minimale + train complet).
RLS réellement appliquée : `set role authenticated`, `request.jwt.claim.sub`, aucun superuser.

### 3.1 Suites Colors

| Fichier | Assertions | Statut |
|---|---|---|
| 7 suites existantes (V1 → V15) | 273 | ✅ (jamais exécutées auparavant sur un moteur réel dans un run Colors) |
| **`colors_suspension_application_v16`** (nouveau) | **90** | ✅ |
| **`colors_cross_tenant_operations_v17`** (nouveau) | **79** | ✅ |
| **Total** | **442** | **PASS** |

**V16 — suspension**, toujours dans la *même session* (claims inchangés, seul le service bascule) :
entitlement `autorise=false` ; `valide_jusqu_au` échu ; `valide_du` futur ; entitlement supprimé ;
tenant `suspendu`, `annule`, `suspension_prevue_at` échue ; habilitation individuelle retirée ou
échue ; appartenance désactivée ; application désactivée globalement. Pour chacun : `a_acces_application`,
`colors_role_courant`, RLS sur seaux / emplacements / mouvements / Storage, RPC lecture et
écriture, insert direct, et **retour à l'accès sans reconnexion**. Plus : tentatives
d'auto-réactivation (update/insert entitlement, auto-habilitation, levée de suspension) toutes
refusées, témoin T jamais affecté.

**V17 — cloisonnement** : l'attaquant est l'**admin Colors de B** qui connaît tous les UUID de A.
Couvre les 11 actions de `colors_action_autorisee`, les 6 tables, les 17 RPC exposées
(lecture, écriture, OCR, nettoyage photo, paramètres), l'écriture directe hors RPC (insert,
update, delete, transfert d'emplacement, parent étranger, seau B rangé chez A), Storage direct
(upload sous préfixe A, préfixe B pointant un seau A, delete, renommage). Puis **empreinte
octet pour octet de A relue côté service**, et 10 témoins positifs (chaque opération refusée à
B réussit pour A).

### 3.2 Suite pgTAP complète (tous produits)

101 fichiers, 2 428 assertions exécutées. **8 fichiers en échec, tous préexistants et hors
Colors** — ensemble strictement identique sur une base reconstruite **sans** la migration D1 :

| Fichier(s) | Cause |
|---|---|
| `platform_stripe_state_attestation_r72` | exige un vrai `pgsodium` (stub documenté par le harnais) |
| 6 × `studio_*` | fixtures antérieures au durcissement « Inscription fermée » de Studio |
| `elsatia_tools_cloud_sync_entitlement_closure_v1` | `permission denied for table tools_projects` |

### 3.3 Les tests détectent-ils une régression ?

Mutation volontaire sur une base jetable : `colors_role_courant` ne vérifie plus ni l'entreprise
ni `a_acces_application`. Résultat : **V16 54/90 en échec, V17 33+ en échec**. La migration D1
retirée : V16 **3 échecs** exactement sur les assertions visées.

## 4. Recette e2e — pile locale

### 4.1 Pourquoi une passerelle, et ce qu'elle vaut

Docker ne peut tirer aucune image et GitHub Releases est refusé : ni `supabase start`, ni
binaires officiels. `tests/e2e/colors-pile-locale/passerelle.mjs` sert **uniquement** les appels
que Colors émet (relevés dans le code : 5 routes GoTrue, PostgREST `select/insert/rpc` avec
`eq/neq/lte/is/not/in/ilike`, `order`, `range`, `count`, ressource embarquée ; 5 routes Storage),
au-dessus du **vrai** Postgres :

- REST/RPC/Storage connectés en `authenticator` (le rôle de PostgREST), `set local role` vers le
  rôle du JWT, claims posés comme PostgREST : **RLS, `security definer`, GRANT et triggers sont
  ceux de la base**, la passerelle ne décide d'aucun accès ;
- mot de passe vérifié par `crypt()` contre `auth.users` ; JWT HS256 avec `exp` et `session_id` ;
  rafraîchissement **rotatif** (jeton tourné révoqué, fenêtre de réutilisation 10 s, réutilisation
  tardive = session révoquée) ; déconnexion globale qui invalide les jetons d'accès de la session ;
- Storage : `allowed_mime_types` et `file_size_limit` du bucket appliqués ; une URL signée n'est
  émise que si l'appelant **peut sélectionner l'objet sous RLS** ; tout endpoint non servi répond
  501, jamais un faux succès.

**Ne prouve pas** : GoTrue/PostgREST/Storage hébergés eux-mêmes (formats d'erreur exacts,
limites de débit, e-mails, MFA, redimensionnement réel d'image — l'original est servi, ce qui
rend le contrôle EXIF plus strict, pas moins), Kong, pooler, Vercel.

Parité de base ajoutée par `preparer-base.sh` et rien d'autre : `GRANT ALL` Storage que pose le
service Storage hébergé ; colonnes texte de GoTrue sur `auth.users` que le jeu de recette
normalise. Nuancier : `tests/e2e/fixtures/colors-nuancier-recette.json`, **fictif**, aucune donnée
RAL ni fabricant (il manquait au dépôt ; la spec l'exigeait).

### 4.2 Câblage Playwright (T3)

`playwright.config.ts` :

| | Gestion Pro (`npm run test:e2e`) | Colors (`npm run test:e2e:colors`) |
|---|---|---|
| sélection | défaut | `E2E_APP=colors` |
| specs | tout **sauf** `colors-*` | `colors-*` seulement |
| baseURL | `E2E_BASE_URL` ou `127.0.0.1:3100` (inchangé) | `E2E_COLORS_BASE_URL` ou `localhost:3010` |
| projets | 4 projets inchangés | `colors` (Desktop Chrome), `colors-mobile` (Pixel 7, `@responsive`) |
| webServer | aucun (inchangé) | passerelle (santé `/__recette/sante`) puis `next start` Colors |

Gestion Pro : **124 tests / 13 fichiers avant comme après** ; les 78 déclarations Colors
qu'elle embarquait à tort (envoyées sur le port 3100) en sont sorties. `localhost` et non
`127.0.0.1` pour Colors : le service worker n'est enregistré que sur `https` ou l'hôte nommé
`localhost` (`ServiceWorkerRegister.tsx`). `PLAYWRIGHT_CHROMIUM_EXECUTABLE` (facultatif) permet
d'utiliser un Chromium préinstallé d'une autre révision — sans la variable, rien ne change.

### 4.3 Résultats

| Passe | Arbre | Résultat |
|---|---|---|
| 1 | câblage initial | 7/62 — Chromium 1234 absent (environnement) |
| 2 | premier vrai run | **56/62** — 6 échecs analysés : D2, D3, D5 (produit), 2 défauts de spec, 1 hôte (SW) |
| 3 | correctifs D2, D3, D5 + specs + nouvelle spec | **73/73** |
| 4 | même arbre, jeu rechargé | **73/73** |
| 5 | serveurs démarrés **par Playwright** | **73/73** |
| 6 | arbre final (D4, assertion 403) | **73/73** |

Défauts **de spec** corrigés (jamais exécutée auparavant) : sélecteur « Enregistrer » ambigu
(la fiche porte aussi « Enregistrer la finition ») ; test « session terminée » qui effaçait
**tous** les cookies puis attendait `session-expiree` — impossible par conception (sans cookie,
rien ne distingue une expiration d'une première visite). Remplacé par une vraie session
terminée **ailleurs** (déconnexion globale depuis un second navigateur) + un test séparé
« sans cookie → `next` conservé, pas d'annonce ». Aide `seDeconnecter` : ouvre le tiroir sous
900 px.

### 4.4 Nouvelle spec `colors-suspension-session.spec.ts` (11 tests)

Suspension **pendant une session ouverte, sans reconnexion** (bascule par le service via
`E2E_DATABASE_URL`) : `autorise=false` → `/abonnement-requis` sur page, **URL directe d'une
fiche**, export API **403**, puis réouverture avec les mêmes cookies ; `valide_jusqu_au` échu ;
entitlement supprimé ; tenant suspendu (un formulaire déjà affiché n'écrit rien, vérifié après
rétablissement) ; habilitation retirée → `/acces-refuse` ; **changement de rôle** gestionnaire →
consultation pris en compte à la requête suivante. Session : **rafraîchissement de jeton**
réellement observé au journal de la passerelle (jeton 95 s) ; cookies d'une session fermée
rejoués → `session-expiree` ; anonyme sur 5 URL directes + 2 routes API → rien ; compte sans
habilitation refusé à la connexion puis sur URL directe.

## 5. Storage

| Contrôle | Couche | Résultat |
|---|---|---|
| upload direct client fermé (porte de signature v12) | pgTAP | ✅ |
| upload / delete / renommage sous préfixe étranger | pgTAP V17 | ✅ 0 objet atteint |
| lecture d'un objet étranger | pgTAP + passerelle (signature refusée sans visibilité RLS) | ✅ |
| suspension → 0 objet visible, rétablissement → visible | pgTAP V16 | ✅ |
| upload réel via `/api/photos` (clé service), fichier servi par URL signée, **EXIF/GPS/ICC absents** | e2e | ✅ |
| fichier non-image refusé, rien stocké | e2e | ✅ |
| service Storage **hébergé** | — | ❌ non prouvé |

## 6. Build, statique, env

| Contrôle | Commande | Résultat |
|---|---|---|
| build sans env | `env -i … npm run build` (apps/colors) | **exit 1**, les 5 variables nommées, arrêt avant `next build` |
| build env complet | `npm run build` | **exit 0**, 27 routes + proxy |
| typecheck Colors / racine | `npm run typecheck` / `tsc --noEmit` | 0 / 0 |
| lint Colors / racine | `npm run lint` / `eslint` | 0 erreur / 0 erreur (6 avertissements préexistants) |
| vitest Colors | `npm run test` | **431/431**, 39 fichiers |
| manifeste env | `verify:env-manifest` / `test:env-manifest` | 0 erreur / 58/58 (11 variables de recette déclarées) |
| migrations | `verify:migrations` | 321 valides |
| secrets | `verify:secrets` | aucun secret reconnu |

Non rejoué : suite vitest racine (Gestion Pro) — aucun fichier de `src/` n'a été modifié.

## 7. Ce qui reste pour READY FOR PREVIEW

1. Trancher `DECISION_REQUIRED:PREVIEW-PROJECT-INVENTORY`, déployer un Preview Colors
   (« Include files outside of the Root Directory » activé), appliquer la migration
   `20260923000330` au projet Supabase.
2. Rejouer **sans modification** `npm run test:e2e:colors` contre ce Preview
   (`E2E_COLORS_BASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `E2E_DATABASE_URL`), en retirant le
   webServer passerelle — les 73 tests sont indépendants de la passerelle, sauf le test de
   rafraîchissement qui pilote la durée de jeton (à adapter à la durée du projet).
3. `supabase test db` sur le projet pour les 442 assertions Colors.
4. R1 (redirection des server actions suspendues) et l'écran `/utilisateurs` (`ComingSoon`).

## 8. Reproduire

```bash
service postgresql start
export MDP_RECETTE=… PASSERELLE_MDP_DB=… PASSERELLE_SECRET_JWT=…
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=… SUPABASE_SERVICE_ROLE_KEY=…
tests/e2e/colors-pile-locale/preparer-base.sh colors_e2e
(cd tests/e2e/colors-pile-locale && npm ci)
export PASSERELLE_DATABASE_URL=postgres://authenticator:$PASSERELLE_MDP_DB@127.0.0.1:5432/colors_e2e
export PASSERELLE_ADMIN_DATABASE_URL=postgres://supabase_admin:$PASSERELLE_MDP_DB@127.0.0.1:5432/colors_e2e
export E2E_DATABASE_URL=$PASSERELLE_ADMIN_DATABASE_URL
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_COLORS_URL=http://localhost:3010 \
       NEXT_PUBLIC_ELSATIA_ACCOUNT_URL=http://127.0.0.1:3000/abonnement ELSATIA_APPLICATION_ENV=local \
       COLORS_NUANCIER_FICHIER=$PWD/tests/e2e/fixtures/colors-nuancier-recette.json
npm --prefix apps/colors run build && npm run test:e2e:colors

# pgTAP Colors
scripts/local-postgres-bootstrap/rebuild_db.sh pgtap_colors
su postgres -c "psql -d pgtap_colors -c 'create extension pgtap'"
cd supabase/tests && su postgres -c "pg_prove -d pgtap_colors colors_*.test.sql"
```

Rejouer le jeu avant chaque passe e2e (`colors-pilote.sql` est rejouable) : les parcours
modifient l'état initial.

---

**Note sur `AGENTS.md`** — la V1 affirmait que `node_modules/next/dist/docs/` n'existe pas et
rapportait qu'il avait été qualifié d'injection probable. Il **existe** dès que les dépendances
sont installées (`npm ci`) : les missions précédentes l'ont cherché avant installation. Il a été
lu ici (guides `testing/playwright`, conventions `proxy`) ; rien n'y contredit ce qui a été fait.
