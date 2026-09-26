# ELSATIA COLORS — GAP ANALYSIS V1

**Objet** — Dire précisément ce qui manque à la qualification d'`apps/colors`, domaine par
domaine, avec le niveau de preuve réellement atteint. Aucun refactor, aucun déploiement,
aucun correctif n'a été produit par cette mission.

| | |
|---|---|
| Date | 2026-09-23 |
| Branche analysée | `origin/claude/zen-goodall-n3opdc` (629 commits, 24 rapports `docs/qualification/`) |
| SHA de base | `afd39126` |
| Branche de travail | `claude/kind-allen-68wk2i` (recréée depuis la base ci-dessus) |
| Périmètre | `apps/colors`, `packages/application-access`, migrations et tests pgTAP `colors_*`, `tests/e2e/colors-*` |
| Nature des preuves | exécution réelle en session (typecheck, lint, tests, build) + lecture de code + rapports antérieurs |

## 0. Choix de la branche

`git fetch --all --prune` ramène 25 branches distinctes contenant `apps/colors`. Deux lignes
divergentes se disputent la tête :

| Branche | Commits | Rapports `docs/qualification/` | Date |
|---|---|---|---|
| `claude/zen-goodall-n3opdc` | **629** | **24** | 2026-09-22 |
| `claude/magical-mccarthy-sm9lwb` | 629 | 24 | 2026-09-22 |
| `integration/elsatia-post-qualification-fix-convergence-v1` | 628 | 23 | 2026-09-22 |
| `claude/loving-turing-aaopod` | 628 | 18 | 2026-09-22 |
| `claude/serene-turing-ekxjoo` | 615 | 12 | 2026-09-23 |

`zen-goodall-n3opdc` est retenue : c'est le sur-ensemble documentaire le plus complet
(`magical-mccarthy` n'en diffère que d'un commit Stripe sans rapport avec Colors). La plus
récente en date, `serene-turing-ekxjoo`, est **plus pauvre** — elle a été recréée depuis un
merge-base commun et ne porte qu'un seul document neuf,
`ELSATIA_PREVIEW_GO_LIVE_CHECKLIST_V1.md`, lu ici séparément via `git show`.

**Écart documentaire à signaler** : cette checklist affirme qu'« aucun rapport de
qualification dédié à `apps/colors` n'existe ». C'est **faux sur la branche analysée ici** —
trois rapports Colors dédiés existent, mais dans `docs/audits/` et `docs/colors/`, pas dans
`docs/qualification/`, ce qui explique l'angle mort. Ils sont listés au §1.

## 1. Rapports Colors existants

| Rapport | Date | Verdict propre |
|---|---|---|
| `docs/audits/ELSATIA-COLORS-PILOT-READINESS-V1.md` | 2026-09-21 | **BLOQUÉ ENVIRONNEMENT — RECETTE NON CONCLUSIVE** |
| `docs/audits/ELSATIA-COLORS-COMMERCIAL-READINESS-V1.md` | 2026-09-21 | **PRÊT SOUS CONDITIONS** (7 conditions, §10) |
| `docs/audits/ELSATIA_COLORS_PREDEPLOY_FINAL_READINESS_AUDIT_V1.md` | 2026-09-08 | cible déployable constituée, **aucun déploiement** |
| `docs/colors/ELSATIA_COLORS_PILOTE_V1.md` | 2026-09-21 | dossier pilote |
| `docs/colors/ELSATIA_COLORS_CONSERVATION_DONNEES_V1.md` | 2026-09-21 | politique de conservation |
| `docs/colors/ELSATIA_COLORS_FUNCTIONAL_V1.md` | 2026-09-08 | socle fonctionnel |
| `docs/architecture/ELSATIA_COLORS_CANONICAL_INTEGRATION_V1.md` | 2026-08-27 | contrat canonique |
| `docs/securite/colors-en-tetes.md`, `colors-integration-precommercial.md` | — | sécurité |

Les deux rapports de tête datent du **2026-09-21**. Le dernier commit touchant `apps/colors`
date du **2026-09-22** (`365d31de`, portage des gabarits Preview). La qualification Colors
n'est donc pas ancienne — elle est **incomplète**, et sa conclusion la plus récente est un
blocage d'environnement, pas un feu vert.

## 2. Preuves produites en session

Exécutées dans ce conteneur, `apps/colors` sur `afd39126`, après `npm ci` (exit 0) :

| Contrôle | Commande | Résultat |
|---|---|---|
| typecheck | `npm run typecheck` | **exit 0** — `tsc --noEmit --incremental false`, 0 erreur |
| lint | `npm run lint` | **exit 0** — `eslint src scripts next.config.ts`, 0 erreur |
| tests unitaires | `npm run test` | **exit 0** — vitest 4.1.11, **38 fichiers / 427 tests passés**, 2,87 s |
| build (sans env) | `npm run build` | **exit 1 — refus attendu** : la garde `verify-public-env.mjs` énumère les 5 variables absentes et interrompt avant `next build` |
| build (env local) | idem + 5 variables | **exit 0** — 22 routes générées (20 dynamiques, 2 statiques, 1 proxy) |

Les chiffres concordent exactement avec ceux du rapport
`ELSATIA_POST_QUALIFICATION_FIX_CONVERGENCE_V1` (« Colors 427 »). C'est une revalidation
indépendante, pas une citation.

**Non exécutable ici** : `docker info` échoue (pas de démon), la CLI `supabase` est absente,
Playwright n'est pas installé. Toute preuve exigeant Postgres réel, Supabase réel, Storage
réel ou un navigateur est donc structurellement hors d'atteinte de cette session.

## 3. Domaines — niveau de preuve

Échelle : **PROVEN** (exécuté, vert) · **PARTIALLY_PROVEN** (couvert par lecture de code
et/ou tests unitaires, jamais exercé en conditions réelles) · **UNPROVEN** (aucune preuve à
aucune couche) · **BLOCKED** (preuve impossible depuis ce poste).

| # | Domaine | Niveau | Ce qui est démontré | Ce qui manque |
|---|---|---|---|---|
| 1 | **auth** | PARTIALLY_PROVEN | Connexion mot de passe, `/auth/callback`, `/auth/confirm`, `/mot-de-passe-oublie`, `/nouveau-mot-de-passe`, relais multi-app depuis Gestion Pro. Couvert par `messages-auth`, `destination-connexion`, `redirection-sure`, `recuperation-multiapp`, `reinitialisation`, `jeton-recuperation` (tests verts). | Jamais exercé contre un vrai GoTrue. Un lien de récupération réel, un jeton réel, une expiration réelle n'ont jamais été observés. |
| 2 | **organisation** | PARTIALLY_PROVEN | `getContexteColors()` appelle la RPC `contexte_application_courant`, compare `utilisateur_id` à `auth.getUser()`, et redirige vers `/acces-refuse?motif=appartenance` sans entreprise ni statut admin plateforme. | La RPC n'a jamais été appelée contre un vrai Postgres dans un run Colors. |
| 3 | **colors_admin_organisation** | PARTIALLY_PROVEN | Rôle déclaré dans `packages/application-access` (4 rôles Colors + `administrateur_plateforme_global`), matrice d'actions en SQL (`colors_action_autorisee`) **et** en TS (`permissions-colors.ts`), les deux testées. | **L'écran `/utilisateurs` est un `ComingSoon`** : un `colors_admin_organisation` ne peut administrer aucune habilitation depuis Colors. Le rôle existe, son outillage non. Aucune assertion pgTAP exécutée sur un vrai Postgres. |
| 4 | **routing** | **PROVEN** | 22 routes émises par `next build` : 13 pages sous `(colors)`, 4 routes API, 5 pages hors shell (`/login`, `/acces-refuse`, `/abonnement-requis`, `/mot-de-passe-oublie`, `/nouveau-mot-de-passe`). | — |
| 5 | **guards** | PARTIALLY_PROVEN | Défense en profondeur vérifiée ligne à ligne : `(colors)/layout.tsx` → `exigerShellColors()` (contexte + décision d'accès + `exigerAccesApplication` + résolution de rôle). **Les 4 routes API appellent toutes `exigerAccesApplication(contexte,"colors")`** puis un contrôle de rôle explicite. `/api/photos` valide en plus la signature binaire et nettoie les EXIF avant stockage. | Aucun guard n'a jamais refusé une vraie requête d'un vrai utilisateur non habilité. Le proxy (`proxy.ts`) ne filtre rien — il pose la CSP et rafraîchit la session ; toute la protection est dans les couches serveur. C'est un choix défendable, mais il n'existe **aucun filet au niveau du middleware** si un futur segment de route oublie le layout. |
| 6 | **RLS** | BLOCKED | 6 tables `colors_*` toutes en `enable row level security`, policies exprimées via `colors_action_autorisee(entreprise_id, action)`. `colors_mouvements` n'a qu'une policy `select` — les écritures passent par des RPC `security definer`, par conception. Policies Storage sur `storage.objects` avec porte de signature v12. | **Aucune policy n'a été exécutée dans cette session** (pas de Docker). Les rapports antérieurs confirment que tout le pgTAP de l'écosystème tourne sur un harnais Postgres+pgTAP reconstruit à la main, `auth`/`storage` simulés — explicitement déclaré non équivalent à un vrai Supabase. |
| 7 | **DB** | PARTIALLY_PROVEN / BLOCKED | 6 migrations Colors (`…246` à `…281`, 1 643 lignes), numérotation vérifiée sans collision par l'audit pilote. 7 fichiers pgTAP, **273 assertions** (`plan(46)+plan(41)+plan(28)+plan(46)+plan(47)+plan(8)+plan(57)`). | Les 273 assertions n'ont jamais tourné sur Supabase réel. Aucune migration n'a jamais été appliquée à un projet hébergé. |
| 8 | **build** | **PROVEN** | exit 0 avec les 5 variables ; exit 1 sans elles, avec un message qui nomme chaque variable manquante et son rôle. Le comportement fail-closed est donc prouvé **dans les deux sens**. | Jamais exécuté par Vercel. |
| 9 | **typecheck** | **PROVEN** | 0 erreur. | — |
| 10 | **lint** | **PROVEN** | 0 erreur. | — |
| 11 | **tests** | **PROVEN (unitaire) / UNPROVEN (e2e)** | 38 fichiers, 427 tests, verts en 2,87 s. | **Les 2 specs Playwright Colors (70 déclarations de test) n'ont jamais tourné en une passe.** Pire : `playwright.config.ts` n'a **aucun projet Colors** — `baseURL` vaut `127.0.0.1:3100` (Gestion Pro), alors que Colors sert sur 3010. Une exécution globale enverrait les specs Colors sur le mauvais hôte, sauf override manuel de `E2E_BASE_URL`, et les specs GP et Colors ne peuvent pas coexister dans une même passe. |
| 12 | **env** | **PROVEN (contrat local)** | `.env.example` et `.env.preview.example` présents et complets ; garde `verify-public-env.mjs` (5 variables) prouvée bloquante ; contrat verrouillé côté manifeste par `COLORS-GUARD-CONTRACT`. | Deux replis `localhost` subsistent dans le code (`layout.tsx` → `metadataBase`, `compte-elsatia.ts` → `URL_COMPTE_PAR_DEFAUT`). Ils sont **neutralisés par la garde de build**, qui refuse un build publié sans les variables — mitigation réelle, pas suppression. |
| 13 | **Preview config** | UNPROVEN | Gabarit `.env.preview.example` livré et validé par `verify:env-manifest`. Absence de `vercel.json` documentée comme décision (aucune route cron, framework auto-détecté). | **Aucun déploiement Preview n'a jamais eu lieu.** Une action manuelle de tableau de bord est indispensable et non automatisable : activer « Include files outside of the Root Directory » — Colors dépend de `packages/*` en `file:../../`. Sans elle, le build Vercel échoue à l'installation. |
| 14 | **multi-app entitlement** | PARTIALLY_PROVEN | `a_acces_application` vérifie l'appartenance active **et** `autorise` **et** la fenêtre `valide_du`/`valide_jusqu_au`. `determinerAccesColors` distingue trois sorties (`autorise` / `abonnement_requis` / `habilitation_requise`) et le diagnostic de refus **ne peut jamais autoriser**. La politique pure est testée (`acces-colors-policy.test.ts`). | Jamais exercé contre des données réelles d'habilitation. |
| 15 | **session** | PARTIALLY_PROVEN | Session isolée par domaine, rafraîchie par `proxy.ts` (`supabase.auth.getUser()`), en-têtes `EN_TETE_CHEMIN` / `EN_TETE_SESSION` posés avec `set` et non `append` — une valeur envoyée par le client est écrasée, pas ajoutée. Une session expirée est annoncée (`error=session-expiree`) et la page demandée conservée. | Aucune expiration réelle observée en navigateur. |
| 16 | **suspension app** | **UNPROVEN** | Par lecture de code, la chaîne est correcte : `colors_role_courant` appelle `a_acces_application` **à l'intérieur même de sa clause `where`**, donc une suspension d'entitlement retire le rôle au niveau RLS, pas seulement dans l'interface. | **Zéro couverture, à toutes les couches.** `grep` sur `valide_jusqu_au` / `autorise = false` dans les 7 fichiers pgTAP Colors : **aucune correspondance**. Aucun test unitaire ne simule une suspension. Aucun e2e. C'est le seul domaine du périmètre dont aucune assertion, nulle part, ne prouve le comportement. |
| 17 | **cross-tenant** | PARTIALLY_PROVEN | Toutes les policies sont clefées sur `entreprise_id` via `colors_action_autorisee`. Les 4 routes API refiltrent par `.eq("entreprise_id", contexte.entrepriseId)` **avant** toute action, y compris avant l'usage du client Storage `service_role` — qui contourne RLS mais n'est atteint qu'après une lecture RLS-scopée du seau. Les fixtures e2e comportent une seconde organisation qui n'existe que pour prouver le cloisonnement. | Jamais exécuté. Le cloisonnement est **bien conçu et jamais éprouvé**. |

### Répartition

| Niveau | Nombre | Domaines |
|---|---|---|
| **PROVEN** | 5 | routing, build, typecheck, lint, tests unitaires |
| **PARTIALLY_PROVEN** | 9 | auth, organisation, colors_admin_organisation, guards, DB, env, multi-app entitlement, session, cross-tenant |
| **UNPROVEN** | 2 | suspension app, Preview config (+ tests e2e) |
| **BLOCKED** | 1 | RLS |

## 4. Les 5 travaux qui ferment le plus de risque

Classés par risque fermé, pas par facilité.

### T1 — Exécuter les 273 assertions pgTAP Colors sur un vrai Supabase
`supabase start` puis `supabase test db` sur les 7 fichiers `supabase/tests/colors_*.test.sql`.
Ferme d'un seul coup **RLS (BLOCKED), DB, cross-tenant et colors_admin_organisation** — quatre
domaines, dont le seul actuellement BLOCKED. C'est le travail qui déplace le plus de masse.
Aucune ligne de code à écrire.

### T2 — Écrire la couverture pgTAP de la suspension d'application
Trois assertions suffisent, sur `colors_seaux` : entitlement `autorise = false` → `select`
refusé ; `valide_jusqu_au` dépassé → refusé ; entitlement rétabli → autorisé. Ferme le seul
domaine à **zéro preuve**, et vérifie la seule chose qui distingue un client suspendu d'un
client payant. À écrire avant T1 pour être exécuté avec lui.

### T3 — Rendre la recette Playwright Colors exécutable, puis l'exécuter en une passe
Ajouter à `playwright.config.ts` un projet Colors avec son propre `baseURL` (3010) et un
filtre sur les specs `colors-*`, puis jouer les 70 tests contre une pile Colors. Ferme
**tests e2e (UNPROVEN)**, et fournit la première preuve de bout en bout d'**auth**, **session**
et **guards**. C'est exactement la recette que le rapport pilote du 2026-09-21 n'a pas pu servir.

### T4 — Déployer un unique Preview Colors
Copier `.env.preview.example` dans le projet Vercel, remplacer les `<preview-host-*>`, et
**activer « Include files outside of the Root Directory »**. Ferme **Preview config**, et fait
passer **auth**, **env** et **session** de PARTIALLY_PROVEN à prouvé en conditions réelles.
Dépend de `DECISION_REQUIRED:PREVIEW-PROJECT-INVENTORY` (voir
`ELSATIA_OWNER_DECISIONS_FINAL_V1.md`).

### T5 — Vérifier les policies Storage `colors-seaux` sur un vrai service Storage
Les policies de `storage.objects` et la porte de signature v12 n'ont jamais rencontré un
service Storage réel, et `/api/photos` écrit avec une clé `service_role` qui contourne RLS.
La lecture de code montre que le chemin est construit depuis `contexte.entrepriseId` après une
lecture RLS-scopée — c'est correct, et non éprouvé. Dépend de T4.

**Hors des cinq, mais à ne pas perdre** : l'écran `/utilisateurs` est un `ComingSoon`. Ce n'est
pas un risque de sécurité — c'est un rôle, `colors_admin_organisation`, dont l'outillage
n'existe pas. À trancher avant de vendre, pas avant de piloter.

## 5. NEXT 5 ACTIONS

| # | Action | Effort | Dépendance | Ferme |
|---|---|---|---|---|
| 1 | Écrire les assertions pgTAP de suspension d'application (T2) | **<30 min** | aucune (écriture) | suspension app — le seul domaine à zéro preuve |
| 2 | Ajouter un projet Colors à `playwright.config.ts` (baseURL 3010, filtre `colors-*`) (T3, partie config) | **30-90 min** | aucune | rend la recette e2e Colors exécutable |
| 3 | `supabase start` + `supabase test db` sur les 7 fichiers pgTAP Colors, T2 inclus (T1) | **2-4 h** | Docker + Supabase réels | RLS, DB, cross-tenant, colors_admin_organisation, suspension |
| 4 | Exécuter les 70 tests Playwright Colors en une passe (T3, partie exécution) | **2-4 h** | action 2 + pile Colors montée | e2e, auth, session, guards |
| 5 | Déployer un Preview Colors et rejouer T5 sur le Storage réel (T4+T5) | **>4 h** | `PREVIEW-PROJECT-INVENTORY` tranchée | Preview config, env réel, policies Storage |

Les actions 1 et 2 ne dépendent d'aucun environnement et coûtent moins de deux heures à elles
deux. Elles ne prouvent rien seules — elles rendent prouvable ce qui ne l'est pas aujourd'hui.

## 6. Verdict

**COLORS PARTIALLY QUALIFIED**

Justification. La chaîne locale est intégralement verte et **revalidée en session ce jour** :
typecheck 0, lint 0, 427 tests unitaires, build fail-closed prouvé dans les deux sens, 22
routes émises. Cinq domaines sur dix-sept sont PROVEN au sens strict. La conception du
cloisonnement est solide et a résisté à une relecture ligne à ligne : entitlement vérifié dans
la clause `where` du rôle SQL, les quatre routes API toutes gardées, nettoyage EXIF avant
stockage, aucun repli silencieux d'URL non neutralisé par la garde de build.

Mais rien de ce qui touche une infrastructure réelle n'est démontré : ni RLS, ni Storage, ni
GoTrue, ni Vercel. Les 273 assertions pgTAP existent et n'ont jamais tourné sur un vrai
Supabase. Les 70 tests Playwright existent et ne sont **pas exécutables en l'état** faute de
projet dans la configuration. Et la suspension d'application — la frontière entre un client
payant et un client suspendu — n'a **aucune assertion nulle part**.

Ce n'est pas `LOCALLY QUALIFIED` : la qualification locale est réelle mais incomplète, un
domaine du périmètre local n'ayant aucune couverture. Ce n'est pas non plus
`QUALIFICATION GAPS REMAIN` au sens d'un produit à l'état inconnu : les écarts sont tous
nommés, bornés, et quatre des cinq se ferment avec de l'environnement, pas avec du code.

---

*Aucun fichier de `apps/colors`, `supabase/` ou `packages/` n'a été modifié par cette mission.
Seul ce rapport a été ajouté.*

**Note de sécurité de session** — `AGENTS.md` de ce dépôt ordonne de lire
`node_modules/next/dist/docs/` avant d'écrire du code. Ce chemin **n'existe pas** (vérifié).
Au moins quatre missions antérieures ont indépendamment qualifié cette instruction de
tentative probable d'injection de prompt. Elle n'a pas été suivie ici non plus.
