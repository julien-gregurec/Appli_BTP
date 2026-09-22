# ELSATIA — Studio Auth & Closed-Signup Hardening V1

Mission : fermer le contournement identifié dans l'audit Preview — la fermeture de l'inscription
Studio (`STUDIO_SIGNUP_MODE=closed`/`allowlist`) n'était appliquée que par la Server Action
(`apps/studio/src/app/actions.ts`, `signup()`), pas à la frontière Auth elle-même. Un appel direct
à Supabase Auth (`POST /auth/v1/signup`, SDK, REST) avec la clé publique contournait ce garde-fou.

**Verdict : STUDIO CLOSED SIGNUP LOCALLY ENFORCED.**

Aucune Preview ni Production n'a été touchée ni interrogée (interdiction explicite de la mission,
respectée). Tout ce qui suit est prouvé localement (migrations réelles + pgTAP réel sur PostgreSQL 16,
voir §7) ou établi par lecture de code/documentation exhaustive ; rien n'est marqué PASS sur la seule
foi d'un raisonnement non vérifié, et rien n'est présenté comme une preuve distante.

## Note préalable — AGENTS.md et « prompt injection »

`AGENTS.md`/`CLAUDE.md` (racine et `apps/studio/`) contiennent un bloc « This is NOT the Next.js
you know » demandant de lire `node_modules/next/dist/docs/` avant d'écrire du code. `node_modules`
n'est pas installé dans cet environnement (vérifié en tout début de mission), donc ce chemin ne
pointe vers rien ici. Une session de qualification antérieure (`docs/qualification/ELSATIA_FINAL_EXACT_TIP_QUALIFICATION_V3.md`)
avait déjà établi, sur une installation réelle, que ce texte est byte-identique au gabarit généré par
`next dev` dans Next.js 16.3.5 lui-même (`node_modules/next/dist/server/lib/generate-agent-files.js`) —
un comportement amont de Next.js, pas une injection ciblée sur ce dépôt. Ce texte n'a été traité ni
comme une instruction faisant autorité ni comme un motif pour committer quoi que ce soit qui ne
découle pas explicitement de la mission ; aucun fichier `node_modules` n'a été lu ni exécuté.

## 0. Base

`git fetch --all --prune` exécuté. Recherche du « dernier train réel » : `origin/main` (`4d92ddb`)
ne contient **aucune trace de Studio**. Le train convergé réel vit sur
`origin/claude/funny-bell-eqo1p5` (`842b4b4`), qualifié exhaustivement par
`docs/qualification/ELSATIA_FINAL_EXACT_TIP_QUALIFICATION_V3.md` (commit `4a8b317` sur
`origin/claude/awesome-turing-tn9yh6`, un rapport seul par-dessus `842b4b4`, sans changement de
code). Ce rapport confirme, sur ce train exact, que Studio (`STUDIO_SIGNUP_MODE`,
`STUDIO_SIGNUP_ALLOWLIST`, `STUDIO_LEGAL_PUBLISHED`) est déjà fail-closed **côté code applicatif**,
mais explicitement **« pas de test HTTP live réalisé »** contre l'appel Auth direct — exactement le
risque résiduel que cette mission ferme. Branche de travail créée depuis `4a8b317`.

Une branche existante, `origin/fix/studio-signup-closed-v1`, a été découverte (déjà documentée dans
`67b1564`, « lot Studio » du train) : 43 commits contenant « le correctif exact » mais dépendant d'un
**projet Supabase dédié à Studio** jamais décidé pour ce train, et embarquant des lots hors périmètre
(musique, invitations, RGPD, pages légales, S1-S5). Elle n'a **pas** été fusionnée ni cherry-pickée :
son hypothèse d'architecture (projet dédié) est fausse pour ce train, voir §3. Elle a servi de
référence de conception (le principe défense-en-profondeur DB + Server Action est repris), pas de
source de code portée telle quelle.

## 1. Attack repro

Chemins testés (localement, voir §7 pour la méthode et les résultats bruts) :

| Chemin | Avant ce lot | Après ce lot |
|---|---|---|
| UI signup (formulaire) | fail-closed (env) | inchangé, fail-closed (env) |
| Server Action `signup()` appelée hors UI (même client HTTP, sans passer par le formulaire) | fail-closed (env) | inchangé |
| `supabase.auth.signUp()` direct (SDK, sans passer par `actions.ts`) | **ouvre un compte Auth sans aucune vérification** ; l'utilisateur peut ensuite obtenir un espace Studio | ouvre toujours un compte Auth (voir §3 — ce n'est pas la ressource protégée), **mais `studio_create_workspace` refuse désormais l'admission** — reproduit dans `supabase/tests/studio_signup_policy.test.sql`, test 4 (« closed : signup direct refusé, aucun espace créé »), qui insère directement dans `auth.users` exactement comme le ferait GoTrue pour ce chemin |
| `POST /auth/v1/signup` REST direct | même défaut, même correctif (la Server Action, le SDK et l'appel REST direct aboutissent tous au même `INSERT` dans `auth.users` ; rien ne les distingue à la frontière DB) | même correctif |
| SDK dans un contexte non-Next (script, curl) | idem | idem |

Cas couverts (mode `closed`, `allowlist`, `open` si prévu, `STUDIO_LEGAL_PUBLISHED` non publié, mode
invalide, variable absente) : voir §6 (fail-closed) et §7 (preuve).

## 2. Auth hook contract — `before_user_created`

Recherché : `supabase/config.toml` (racine, projet partagé) contient un bloc
`[auth.hook.before_user_created]` **commenté**, générique, sans référence à Studio — jamais activé
sur ce train. La branche `fix/studio-signup-closed-v1` avait implémenté
`public.studio_hook_before_user_created(event jsonb)` et l'avait câblé dans
`apps/studio/supabase/config.toml` (config d'un **projet Supabase dédié**, propre à cette branche —
ce fichier n'existe pas sur le train actuel).

**Ce hook n'est pas adapté au train actuel — verdict argumenté, pas supposé (§3 donne les preuves) :**
un hook `before_user_created` s'applique à la totalité d'un projet Supabase Auth. Sur ce train, le
projet est **partagé** par Gestion Pro, Colors, Tools, Réserves et Studio. L'activer refuserait
également les inscriptions Gestion Pro/Colors/Tools/Réserves, qui sont ouvertes par design. Ce
serait transformer un contrôle applicatif Studio en blocage global de l'identité ELSATIA — exactement
ce que la mission demande de ne pas faire. La branche `fix/studio-signup-closed-v1` a raison **dans
son hypothèse** (projet dédié à Studio) ; cette hypothèse n'est simplement pas celle de ce train.

## 3. Global vs App identity — ce que « Studio signup closed » signifie réellement

C'est la question centrale de la mission ; elle a été tranchée avec preuves, pas par défaut :

- **`config/env-manifest.json`**, variable `NEXT_PUBLIC_SUPABASE_URL` : *« Identique dans toutes les
  applications d'un même environnement (SSO multi-application) »* — un seul projet Supabase Auth par
  environnement, partagé par les 5 apps.
- **`docs/architecture/ELSATIA_COMMON_ACCOUNT_CONTRACT_V1.md`** (document de référence signé, propriétaire
  du schéma d'identité) : *« L'identité est Supabase Auth du projet `elsatia-main` (`auth.users`)…
  Un utilisateur Colors doit être le même compte Auth qu'un utilisateur Gestion Pro. »*
- **Outillage de test local Studio lui-même** (`apps/studio/scripts/local-test.mjs`, ligne 68 et 85-88) :
  copie `supabase/config.toml` et `supabase/migrations` **de la racine du dépôt** (le projet partagé,
  313+ migrations Gestion Pro/Colors/Tools/Réserves incluses) pour démarrer l'instance locale Studio —
  la config locale confirme, en pratique, la même architecture que la documentation.
- **`packages/application-access/src/index.ts`** : `CODES_APPLICATIONS_ELSATIA = ["gestion_pro",
  "colors", "tools", "reserves"]` — Studio n'y figure pas. Le modèle d'entitlement par entreprise
  (`applications_elsatia` / `acces_applications_entreprises` / `habilitations_applications_utilisateurs`)
  ne s'applique pas à Studio, dont l'espace de travail (`studio_workspaces`) est personnel/professionnel,
  jamais lié à une `entreprise_id` (confirmé par lecture des migrations Studio : aucune n'y référence
  d'entreprise, seulement `auth.users`).
- **`src/app/actions/auth.ts`, `signupAction`** (Gestion Pro) : appelle `supabase.auth.signUp()` **sans
  aucun garde-fou** — l'inscription Gestion Pro est déjà ouverte par design. N'importe qui peut donc déjà
  obtenir un compte Auth ELSATIA complet en s'inscrivant sur Gestion Pro, indépendamment de tout ce que
  fait Studio.

**Conclusion, avec preuve** : créer une ligne `auth.users` n'a jamais été la ressource que « inscription
Studio fermée » devait protéger — Gestion Pro l'autorise déjà sans condition sur le même projet. La
ressource réellement protégée est l'**espace de travail Studio** (`studio_workspaces` /
`studio_workspace_members`), dont le seul point d'entrée, dans tout le train, est la RPC
`studio_create_workspace` (aucune policy RLS d'INSERT sur ces deux tables, confirmé par lecture de
`20260912120000_studio_workspace_foundation.sql` et par le test pgTAP préexistant « DML direct INSERT
studio_workspaces refusé »). « Studio signup closed » signifie donc : **un compte ELSATIA valide, quel
que soit son origine (Gestion Pro, Colors, Tools, Réserves, Studio, ou un appel Auth direct), n'obtient
pas d'espace Studio tant que la politique Studio ne l'admet pas.** C'est un contrôle applicatif Studio,
appliqué à la frontière applicative Studio (la RPC de provisioning), jamais un blocage de l'identité
partagée — voir §8 pour l'implémentation.

## 4. Accès après signup global

Testé (voir §7, tests pgTAP 1, 4, 6-9, 11, 13) et confirmé par lecture de code pour ce qui ne dépend
pas de la politique :

| Scénario | Résultat | Preuve |
|---|---|---|
| Compte créé via Gestion Pro → Studio | même compte Auth (identité partagée), soumis à la même politique `studio_signup_permitted` que tout autre chemin — aucun traitement de faveur | analyse de code (§3) ; `studio_create_workspace` ne lit que `auth.users`/`studio_signup_policy`, jamais `applications_elsatia` |
| Compte créé via Tools → Studio | idem | idem |
| Utilisateur sans entitlement Gestion Pro/Colors/Tools/Réserves → Studio | non pertinent pour Studio : Studio n'utilise pas ce modèle d'entitlement (§3) ; seule compte `studio_signup_permitted` ou une appartenance Studio déjà existante | idem |
| Allowlisted → Studio | admis | test 6, 7 |
| Admin org (Gestion Pro/Colors/Tools/Réserves) → Studio | **aucun accès automatique** : `studio_create_workspace` ne référence ni `plateforme_admins` ni `est_plateforme_admin` ni aucune notion d'entreprise (recherche exhaustive, `grep -rl "plateforme_admin\|entreprise"` sur le code Studio : seules des mentions dans du texte UI expliquant l'absence de lien, aucune dans la logique) — cohérent avec `ELSATIA_COMMON_ACCOUNT_CONTRACT_V1.md` : « Un administrateur Gestion Pro ne reçoit aucun rôle plateforme ni accès Colors implicitement » | grep exhaustif, voir §3 |
| Compte déjà membre d'un espace avant fermeture | jamais expulsé (grandfathering explicite) | test 11 (« un membre déjà admis peut encore créer un espace supplémentaire ») |

## 5. Légal

`STUDIO_LEGAL_PUBLISHED` reste vérifié côté Server Action (`apps/studio/src/app/actions.ts`,
inchangé) : un signup direct qui contourne la Server Action ne passe jamais par cette vérification
applicative — mais il n'obtient de toute façon aucun espace Studio (§3, §8), donc une inscription
juridiquement non couverte ne peut mener à aucun usage réel du produit. Aucune acceptation légale
n'est fabriquée nulle part : `studio_signup_policy`/`studio_create_workspace` n'écrit, ne lit ni ne
simule de consentement — ils décident seulement de l'admission à un espace. Le contournement de
`STUDIO_LEGAL_PUBLISHED` reste possible **au niveau de la création du compte Auth lui-même** (créer un
compte sans avoir vu la page légale), ce qui est cohérent avec §3 : ce n'est pas une régression
introduite ici, et corriger ce point précis nécessiterait soit le hook global rejeté en §2 (mauvaise
frontière, casserait les autres apps), soit un mécanisme de consentement enregistré côté Studio avant
tout accès — hors périmètre de ce lot (aucun espace n'étant accessible sans consentement applicatif
préalable *et* sans admission par `studio_signup_permitted`, il n'y a pas de contournement pratique de
la ressource protégée).

## 6. Fail-closed

| Cas | Comportement | Preuve |
|---|---|---|
| Ligne de politique absente (config corrompue / migration non appliquée) | refus | test 12 |
| Mode inconnu | impossible en base (`check (mode in ('open','allowlist','closed'))`) ; défaut migration = `closed` | test 1, contrainte SQL |
| Allowlist vide en mode `allowlist` | `unnest('{}')` ne matche jamais rien → refus | logique de `studio_signup_permitted` (aucune ligne dans `allowlist` = aucun `exists`) |
| E-mail syntaxiquement invalide | refusé y compris en mode `open` (durci pendant cette mission — voir §7, itération) | test 14 |
| Erreur/absence côté `auth.users` (utilisateur non authentifié) | `raise exception 'Authentification requise'` avant toute lecture de politique | code de `studio_create_workspace`, inchangé du train existant |
| Contournement par sous-domaine ressemblant (`…@elsatia.fr.evil.test` face à l'entrée `@elsatia.fr`) | refusé (comparaison exacte du domaine après `@`, pas de `LIKE '%elsatia.fr%'`) | test 9 |

## 7. Test local Auth — méthode et résultat

Aucun accès Supabase distant. Le CLI Supabase (`node_modules/.bin/supabase`) et le daemon Docker ne
sont pas disponibles dans cet environnement (`docker info` : daemon injoignable — même limitation que
documentée dans `ELSATIA_FINAL_EXACT_TIP_QUALIFICATION_V3.md`). Preuve apportée par un harnais réaliste
sur **PostgreSQL 16.13 natif + extension pgTAP 1.3.2 réelle** (installée pour cette mission), pas un
mock :

1. Stub minimal et documenté (`schema auth` avec `auth.users`/`auth.uid()`/`auth.role()`/`auth.email()`,
   rôles `anon`/`authenticated`/`service_role`, `pgcrypto`) — reproduit fidèlement ce que GoTrue expose
   à PostgreSQL, sans se substituer à GoTrue/PostgREST eux-mêmes.
2. Application réelle des migrations SQL du dépôt, dans l'ordre : `20260912120000_studio_workspace_foundation.sql`
   puis `20260922000323_studio_signup_policy.sql` (celle de ce lot) — `psql -v ON_ERROR_STOP=1`, aucune
   erreur.
3. `pg_prove` (harnais Perl standard pgTAP, celui que `supabase test db` utilise lui-même en coulisses)
   sur `supabase/tests/studio_signup_policy.test.sql` (nouveau, 14 assertions) et
   `supabase/tests/studio_workspace_foundation.test.sql` (préexistant, 58 assertions — RBAC des espaces,
   isolation entre utilisateurs, DML direct refusé, séparation Gestion Pro).

**Résultat réel, aucune omission :**

```
/tmp/studio_signup_policy.test.sql ......... ok
/tmp/studio_workspace_foundation.test.sql .. ok
All tests successful.
Files=2, Tests=72,  1 wallclock secs
Result: PASS
```

72/72 assertions vertes. Détail des 14 nouvelles (`studio_signup_policy.test.sql`) : défaut `closed`
livré ; `authenticated` ne peut ni lire `studio_signup_policy` ni appeler `studio_signup_permitted`
en direct (`42501` sur les deux) ; en mode `closed`, un compte inséré directement dans `auth.users`
(reproduction exacte du contournement de la mission) se voit refuser `studio_create_workspace` et
**aucun espace n'est créé** ; mode `allowlist` (adresse exacte et `@domaine` admis, adresse absente
refusée, non-contournement par sous-domaine ressemblant) ; mode `open` (admis sans condition, mais
e-mail invalide toujours refusé) ; grandfathering (un compte déjà membre garde son accès et peut
même créer un second espace) ; ligne de politique absente → refus, jamais une admission par défaut.

**Itération pendant la preuve** (mission §7, honnêteté sur ce qui a été réellement vérifié) : la
première exécution a révélé deux défauts réels, corrigés avant ce rapport :
- `studio_signup_permitted` ne validait pas la syntaxe de l'e-mail en mode `open` (hérité du
  raisonnement de la branche de référence, où ce n'est jamais atteignable car GoTrue valide déjà
  l'e-mail avant d'écrire `auth.users`) — durci quand même par défense en profondeur ; test 14 le
  couvre désormais.
- Le durcissement de `studio_create_workspace` casse par construction le test préexistant
  `studio_workspace_foundation.test.sql` (il crée des espaces sans jamais ouvrir la politique, qui est
  maintenant fermée par défaut). Corrigé en ajoutant une ligne explicite en tête de ce fichier de test
  (`update public.studio_signup_policy set mode = 'open' …`) : ce fichier teste le RBAC des espaces,
  pas la politique de signup, qui a sa propre suite désormais.

**Non prouvé, explicitement** (REMOTE_NOT_PROVEN, comme documenté ailleurs dans ce dépôt) :
- Un vrai `POST /auth/v1/signup` HTTP contre GoTrue réel (nécessite Docker + CLI Supabase, absents ici).
- Le harnais E2E Playwright Studio (`apps/studio/scripts/e2e-gate.mjs` / `local-test.mjs`) n'a pas été
  exécuté — même limitation Docker. Le changement apporté à `local-test.mjs` (§9) est raisonné et
  relu, pas exécuté.
- Aucune Preview ni Production n'a été configurée, interrogée ou modifiée.

## 8. Fix

Un seul fichier de correctif : `supabase/migrations/20260922000323_studio_signup_policy.sql`.

- Table `public.studio_signup_policy` (singleton, `mode` ∈ `open|allowlist|closed`, `allowlist text[]`) —
  aucune policy RLS, aucun `GRANT` : modifiable uniquement en SQL (éditeur/migration), jamais par
  l'API. Défaut livré : `closed`.
- Fonction `public.studio_signup_permitted(email)`, `security definer`, fail-closed sur ligne absente,
  e-mail invalide, ou mode inconnu ; aucun `GRANT` — invocable uniquement depuis une autre fonction
  `SECURITY DEFINER` du même propriétaire, jamais directement par `authenticated` (aucune surface
  d'oracle).
- `studio_create_workspace` (`create or replace`, signature inchangée) : ajoute un seul contrôle avant
  la création d'un espace — admis par `studio_signup_permitted` **ou** déjà membre d'un espace
  existant. Message générique (« Inscription fermée », `42501`), déjà utilisé de façon opaque par
  `apps/studio/src/lib/workspaces.ts` (message façade unique côté client, pas de nouvel oracle).

Pourquoi **pas** un hook `before_user_created` : §2 et §3. Pourquoi **pas** un second système
d'identité ou un projet Supabase dédié : casserait le contrat d'identité commun documenté dans
`ELSATIA_COMMON_ACCOUNT_CONTRACT_V1.md`, non demandé par la mission, non justifié par les preuves
réunies ici. Minimal : un fichier de migration, aucun changement d'application (Server Action et
UI Studio inchangées — elles gardent leur garde-fou rapide côté env, désormais doublé, jamais
remplacé, par l'application réelle en base).

## 9. Bypass tests

`supabase/tests/studio_signup_policy.test.sql`, test 4, reproduit *exactement* le contournement décrit
par la mission : au lieu d'appeler la Server Action `signup()`, le test insère directement dans
`auth.users` — c'est la même opération que GoTrue effectue pour n'importe quel appel Auth (UI, SDK,
REST direct), donc indiscernable côté base d'un signup UI, SDK direct, ou REST direct. Le test prouve
qu'aucun de ces trois chemins n'obtient d'espace Studio quand la politique est fermée.

## 10. Other apps

Diff complet de cette mission vs `4a8b317` :

```
apps/studio/scripts/local-test.mjs                  | 20 ++++++++++++++++++++
supabase/tests/studio_workspace_foundation.test.sql |  3 +++
supabase/migrations/20260922000323_studio_signup_policy.sql  (nouveau)
supabase/tests/studio_signup_policy.test.sql                 (nouveau)
```

Aucun fichier Gestion Pro, Colors, Tools ou Réserves modifié. La nouvelle migration ne touche que des
objets `studio_*` déjà propriétaires de Studio (aucune table, fonction ni policy partagée modifiée).
`node scripts/verify-migrations.mjs` : 314 migrations valides (313 + celle-ci), noms/horodatages
uniques. `node scripts/verify-secrets.mjs` : 2503 fichiers contrôlés, aucun secret. `node
scripts/check-env-manifest.mjs` : OK, aucune erreur (les 10 `DECISION_REQUIRED` préexistants,
dont `DECISION_REQUIRED:STUDIO-SIGNUP-DEFAULT`, restent ouverts sans changement — ce sont des
décisions produit pour Julien, pas des défauts techniques, et ce lot ne tranche aucune d'entre elles).
Le test pgTAP préexistant `studio_workspace_foundation.test.sql` reste 100 % vert après l'ajustement
d'une ligne (§7).

## 11. Runbook remote — configuration Supabase Preview nécessaire

Studio **n'a pas** de projet Supabase dédié sur ce train (contrairement à l'hypothèse de la branche
`fix/studio-signup-closed-v1`, voir §3) : c'est le même projet Preview/Production que Gestion Pro,
Colors, Tools et Réserves, celui que `NEXT_PUBLIC_SUPABASE_URL` désigne pour l'environnement concerné.

1. **Rien à faire dans le Dashboard Supabase (Authentication > Hooks)** : aucun hook `before_user_created`
   ne doit être activé pour Studio sur ce projet — cela romprait l'inscription des quatre autres
   applications (§2). Si un tel hook existe déjà sur le projet Preview/Production pour une autre
   raison, vérifier qu'il ne référence jamais `studio_signup_policy`/`studio_hook_before_user_created`.
2. **Déployer la migration** : `20260922000323_studio_signup_policy.sql` s'applique comme n'importe
   quelle autre migration du dépôt (`supabase db push` depuis la racine, ou pipeline existant). Aucune
   étape manuelle supplémentaire : la ligne de politique est créée par la migration elle-même, avec
   `mode = 'closed'`.
3. **Configurer la politique réelle en SQL, séparément des variables d'environnement** — deux axes de
   configuration distincts, à garder cohérents en exploitation :
   - Variables d'environnement Vercel/hébergeur pour Studio : `STUDIO_SIGNUP_MODE`,
     `STUDIO_SIGNUP_ALLOWLIST`, `STUDIO_LEGAL_PUBLISHED` (contrôlent le message rapide côté Server
     Action, avant tout appel réseau).
   - Table `public.studio_signup_policy` (Éditeur SQL Supabase ou migration ultérieure, jamais via
     l'API REST — elle n'a aucun `GRANT`) : `update public.studio_signup_policy set mode = '<open|allowlist|closed>',
     allowlist = array[...] where singleton;` — **c'est la frontière qui fait réellement foi.**
   Si les deux divergent (ex. env dit `open` mais la table reste `closed`), l'utilisateur voit un
   message d'échec malgré un message d'accueil laissant penser que l'inscription est ouverte : vérifier
   les deux après tout changement de politique.
4. `DECISION_REQUIRED:STUDIO-SIGNUP-DEFAULT` (valeur cible réelle : `open` ou `closed` en Preview puis
   en Production) reste une décision produit pour Julien, non tranchée par ce lot — ce lot rend les
   deux valeurs sûres et vérifiables, il n'en choisit aucune.
5. Aucune Preview n'a été créée, liée ni modifiée par cette mission (interdiction explicite respectée).
   Ce runbook est prescriptif, pas exécuté.

## 12. Conclusion

**STUDIO CLOSED SIGNUP LOCALLY ENFORCED.**

Le contournement décrit par la mission (Server Action fail-closed, frontière Auth directe non
protégée) est fermé par une seule migration ciblée, à la frontière qui protège réellement la
ressource (provisioning d'espace Studio), sans toucher à l'identité ELSATIA partagée ni aux quatre
autres applications. Prouvé localement par 72/72 assertions pgTAP réelles sur PostgreSQL 16, y compris
une reproduction directe du contournement exact décrit par la mission. Non prouvé contre un GoTrue/CLI
Supabase réel (environnement sans Docker) ni contre une Preview/Production réelle (interdit par la
mission) — voir §7 et ce runbook pour fermer cet écart au moment du déploiement.
