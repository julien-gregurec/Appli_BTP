# ELSATIA — Remédiation des blocages sécurité identifiés par la qualification V1

**Périmètre** : traiter UNIQUEMENT les blocages sécurité réellement identifiés par
`docs/qualification/ELSATIA_CONVERGENCE_EXACT_TIP_QUALIFICATION_V1.md`. Aucune fonctionnalité
nouvelle, aucune logique métier modifiée sans nécessité démontrée, aucun déploiement, aucun test
masqué, aucun contrôle de sécurité affaibli pour obtenir du vert.

```
SHA de départ (qualifié)       = 76ec759fc97533bc27da864ce8128626ac2e0e62
SHA final (correctifs + merge) = d081886f5b82fae576a0b2a73ef10b3bd6b42d11
Branche                        = claude/compassionate-euler-5j6avr
```

## 0. Note préalable — la branche a avancé deux fois pendant cette session

Au moment de reprendre le travail (`git fetch`), `origin/claude/compassionate-euler-5j6avr`
n'était plus à `76ec759` mais à `69fcf10` (11 commits, lots **ENV manifest** et **DR/release gate**
intégrés par une autre session — exactement les deux lots que le rapport de qualification listait
comme *"non intégrés à ce SHA"*). Vérifié avant tout correctif : `git diff --stat 76ec759 69fcf10`
ne touche ni `supabase/migrations/` ni les dépendances (`package.json` ne fait qu'ajouter des
scripts npm) — les deux blocages sécurité identifiés (js-yaml, `plateforme_admins`) sont donc
strictement inchangés entre `76ec759` et `69fcf10`. Correctifs construits et commités sur `69fcf10`
(3 commits : `6940fb5`, `5d861eb`, `95e80a3`), pas sur `76ec759` directement.

**Une seconde fois**, juste avant de pousser (`git fetch` de vérification), la branche avait de
nouveau avancé : `69fcf10` → `6eaaafa` (34 commits, lots **Colors — voie restante** et **Reserves
v6** — les deux derniers lots que le rapport de qualification listait comme non intégrés — dont un
correctif CVE Next.js/sharp sur `apps/reserves`, indépendant de cette mission). **Fusionné** (merge
commit, jamais de rebase/réécriture sur une branche partagée) plutôt que poussé en force : un seul
conflit réel, `apps/reserves/package.json` (leur bump `sharp: 0.35.4` contre mon ajout `js-yaml:
4.3.2` dans le même bloc `overrides`) — résolu en conservant les deux. Les 3 lockfiles concernés
(`package-lock.json` racine, `apps/colors`, `apps/reserves`) régénérés proprement par `npm install`
après fusion. **Toute la requalification du §4 ci-dessous est rejouée après cette fusion**, sur
l'arbre final réellement poussé — pas sur l'état intermédiaire d'avant fusion.

Aucune réécriture d'historique sur cette branche partagée dans les deux cas. Autorisation explicite
obtenue avant d'écrire sur cette branche (contrainte système par défaut : pousser uniquement sur
`claude/practical-archimedes-ajd588`).

---

## 1. js-yaml / npm audit — analyse

| Champ | Valeur |
|---|---|
| Package | `js-yaml` |
| Version installée (avant) | `4.3.1` (racine, `apps/colors`, `apps/reserves` — `apps/tools` avait déjà `4.3.2` par hasard de résolution de graphe) |
| Dépendance directe ou transitive | **Transitive** (`isDirect: false` dans `npm audit --json`) |
| Chaîne complète | `eslint@9.39.x → @eslint/eslintrc@3.3.x → js-yaml@4.3.1` |
| CVE / advisory | [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh) — *"js-yaml: maxTotalMergeKeys does not limit CPU use for empty merge sources"*, CWE-400/407, CVSS 7.5 (`AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H`) |
| Plage vulnérable | `>=4.0.0 <4.3.2` |
| Exploitabilité réelle dans ELSATIA | **Aucune en pratique** — `eslint` est une `devDependency`, jamais exécutée au runtime ni packagée ; `js-yaml` n'est atteint que par le chargement de fichiers de config ESLint (`.eslintrc`/flat config) au moment du lint/CI, jamais sur une entrée utilisateur ou un chemin serveur |
| Workspaces concernés | Racine, `apps/colors`, `apps/reserves` (`apps/tools` non concerné, déjà sur le correctif) |
| Runtime / build-time / dev-only | **Dev-only** (chaîne ESLint uniquement) |
| Version corrigée | `>=4.3.2`, satisfaite par la contrainte `^4.1.1` déjà déclarée par `@eslint/eslintrc` — aucun bump majeur nécessaire |

**Correctif appliqué** : `npm audit fix` (non forcé) a échoué avec une erreur interne npm
(*"Cannot read properties of null (reading 'edgesOut')"*, bug connu de résolution de graphe).
Correctif appliqué à la place via le mécanisme `overrides` de `package.json`, **déjà utilisé
ailleurs dans ces mêmes fichiers** pour épingler des transitives (`sharp`, `postcss`, `next`) :
ajout de `"js-yaml": "4.3.2"` dans `overrides` (racine, `apps/colors`, `apps/reserves`), puis
`npm install` pour régénérer les 3 lockfiles proprement. Aucun `--force`, aucun bump hors plage.

**Vérifications rejouées** :
- `npm ls js-yaml` (×3) → `js-yaml@4.3.2 overridden` partout.
- `npm run audit:security` (racine, = `npm audit --audit-level=high`, **le gate CI exact**) →
  **exit 0** (2 vulnérabilités modérées préexistantes et sans rapport — `@vitest/mocker`,
  inchangées, hors périmètre).
- `apps/colors` : `npm audit --audit-level=high` → **0 vulnérabilité** (était vulnérable via
  js-yaml uniquement).
- ESLint revérifié fonctionnel après le bump : mêmes 5 avertissements pré-existants qu'avant
  (`no-img-element` ×2, `no-location-assign-relative-destination`, `no-unused-vars` test e2e),
  **0 erreur**.

**Hors périmètre, non touché** : `apps/reserves` conserve 2 vulnérabilités préexistantes et
**sans rapport** (`next`/`sharp`, 1 haute + 1 critique, `GHSA-p293-qw3h-jr36` / RCE Windows AVIF),
qui nécessiteraient `npm audit fix --force` (bump majeur hors plage déclarée). Non demandées par
cette qualification (qui ne nommait que le finding `js-yaml`), non corrigées à l'aveugle —
documentées ici comme risque résiduel (§13).

---

## 2. SECURITY DEFINER accessibles à `anon` — analyse

Détectées par requête directe sur une base fraîchement migrée (harnais PostgreSQL/pgTAP
indépendant, même méthode que la qualification V1) :

```sql
select n.nspname, p.proname, ... from pg_proc p ...
where prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE')
  and proname not in ('document_commercial_par_token', 'reserves_invitation_consulter')
```
→ `construire_entreprise_snapshot(uuid)`, `est_membre_actif_reel(uuid)`.

### 2.1 — `construire_entreprise_snapshot(uuid)`

| Champ | Valeur |
|---|---|
| Schéma / nom / signature | `public.construire_entreprise_snapshot(p_entreprise_id uuid) returns jsonb` |
| Propriétaire | `postgres` |
| `search_path` | `SET search_path TO 'public'` (fixé, correct) |
| Grants (avant) | **Aucun ACL explicite** — donc `EXECUTE TO PUBLIC` implicite Postgres, jamais révoqué |
| Callers connus | (1) `capturer_entreprise_snapshot_devis()` — trigger `SECURITY DEFINER`, propriétaire `postgres` ; (2) un `UPDATE` de rétro-remplissage exécuté par la migration `20260922000308` elle-même (rôle propriétaire). **Aucun appel direct côté application** (`grep` exhaustif sur `src/`, `supabase/`) |
| Rôle fonctionnel | Projection jsonb complète d'une fiche entreprise (nom, raison sociale, **SIRET**, adresse, **numéros d'assurance décennale/RC pro**, style documentaire) pour figer l'identité émettrice sur un document émis |
| Raison historique probable du grant | Absence de `revoke ... from public` explicite lors de la création (`20260922000308`), contrairement à la convention déjà suivie dans le même fichier pour `document_commercial_public_par_token` (qui, elle, révoque bien PUBLIC/anon/authenticated puis grant explicitement `service_role`) — omission, pas une décision |
| Exposition réelle | **Fuite cross-tenant réelle si exposée en RPC PostgREST** : aucune vérification d'appartenance interne à la fonction — un appelant `anon` pouvait lire ces données pour N'IMPORTE QUEL `entreprise_id`, par simple appel `/rest/v1/rpc/construire_entreprise_snapshot` |
| Escalade / contournement RLS | Oui par construction (`SECURITY DEFINER`, table `entreprises` protégée par RLS que la fonction contourne volontairement pour son usage interne légitime — c'est précisément ce contournement qui devient dangereux une fois exposé sans contrôle) |

**Décision : `anon` n'est pas nécessaire** (aucun consommateur réel, tous les appelants réels sont
eux-mêmes `SECURITY DEFINER` propriétaire `postgres`, donc jamais dépendants d'un grant
PUBLIC/anon). **Migration minimale appliquée** : `revoke execute ... from public;`, sans
remplacement (aucun rôle n'en a besoin directement aujourd'hui).

### 2.2 — `est_membre_actif_reel(uuid)`

| Champ | Valeur |
|---|---|
| Schéma / nom / signature | `public.est_membre_actif_reel(p_entreprise_id uuid) returns boolean` |
| Propriétaire | `postgres` |
| `search_path` | `SET search_path TO 'public'` (fixé, correct) |
| Grants (avant) | Même défaut PUBLIC implicite, jamais révoqué |
| Callers connus | Exclusivement dans 2 policies RLS (`utilisateurs_entreprises`, `permissions_poste`, migration `20260922000309`) — **aucun appel direct côté application** |
| Rôle fonctionnel | Vérifie `auth.uid()` + statut d'appartenance réel (sans le OU « accès support temporaire »), réservée aux policies qui créent un état **permanent** (empêche une session support d'auto-attribuer une appartenance ou une permission qui survivrait à sa fermeture) |
| Raison historique probable du grant | Même omission de `revoke ... from public` que 2.1, introduite par la même migration (`20260922000309`) |
| Exposition réelle | **Faible aujourd'hui** : la fonction lit `auth.uid()` en interne, qui vaut `NULL` pour une session `anon` — la condition `ue.utilisateur_id = auth.uid()` ne matche donc jamais, la fonction renvoie toujours `false` pour `anon`. Aucune fuite de donnée démontrée par cette voie précise. Vérifié indépendamment : `anon` n'a **aucun** grant table sur `utilisateurs_entreprises`/`permissions_poste` (seuls 4 catalogues tarifaires publics en ont, lecture seule — cohérent avec `PRODUCTION_CHECKLIST.md`), donc `anon` n'atteint jamais les policies RLS que cette fonction gate |
| Escalade / contournement RLS | Pas de scénario d'exploitation identifié aujourd'hui, mais exposition inutile d'une primitive `SECURITY DEFINER` sans nécessité démontrée — à corriger par principe de moindre privilège, cohérent avec la convention du dépôt |

**Décision : `anon` n'est pas nécessaire, `authenticated` l'est** (ses propres requêtes RLS sur les
deux tables en dépendent). **Migration minimale appliquée** : `revoke execute ... from public;`
puis `grant execute ... to authenticated;`.

**Test de non-régression ajouté** : `supabase/tests/security_remediation_anon_execute_revocation_v1.test.sql`
(7 assertions) — révocation confirmée pour `anon` sur les deux fonctions ; `authenticated` confirmé
conserver l'accès sur `est_membre_actif_reel` ; aucune autre fonction `SECURITY DEFINER` métier
exposée à `anon` (requête large, hors les 2 exceptions déjà documentées) ; le trigger de capture du
snapshot entreprise fonctionne toujours (insertion + vérification que `entreprise_snapshot` est
bien renseigné) ; la policy RLS gatée par `est_membre_actif_reel` reste modifiable par
`authenticated`. **7/7 PASS.**

---

## 3. Deux suites pgTAP sécurité — analyse et correctifs

### 3.1 — Root cause commune : `plateforme_ajouter_admin`/`plateforme_retirer_admin`

La migration `20260922000314` (dernier commit du SHA qualifié) corrige une auto-promotion de rôle
**réellement exploitable** (un membre plateforme `lecture` pouvait s'auto-promouvoir `total` via
`plateforme_ajouter_admin`) — correction légitime, **intégralement conservée**. Mais en réécrivant
les deux fonctions de zéro plutôt qu'en patchant, elle a silencieusement fait régresser **quatre**
protections déjà établies par deux migrations antérieures (`20260826000237`, `20260906000266`),
jamais retouchées entre-temps :

| # | Fonction | Protection perdue | Détectée par |
|---|---|---|---|
| 1 | `plateforme_ajouter_admin` | `actif=false` explicite (DEFAULT colonne = `true`) — sans elle, **tout** INSERT viole `plateforme_admins_actif_requiert_utilisateur_id`/`plateforme_admins_statut_coherent_check` : l'onboarding d'un nouvel admin était cassé à 100% | `platform_support_uid_security_v1` tests 21/23 (« died: violates check constraint »), `platform_aal2_role_integrity_v1` test 11 |
| 2 | `plateforme_ajouter_admin` | `plateforme_exiger_session_aal2()` — un appelant `total` en AAL1 pouvait ajouter un admin sans step-up MFA | `platform_aal2_role_integrity_v1` tests 8-10 (JWT AAL1, claim `aal` malformé, claim absent — plus aucune exception levée) et test 79 (inventaire systémique : recense toute fonction `plateforme_%` mutante sans `plateforme_exiger_session_aal2` dans son corps) |
| 3 | `plateforme_ajouter_admin` | `plateforme_verrouiller_mutations_admin()` (verrou advisory partagé) | Cascade dans les deux fichiers (tests dépendant d'un état transactionnel cohérent) |
| 4 | `plateforme_ajouter_admin` | Garde « identité déjà rattachée » — remplacée par un `INSERT ... ON CONFLICT DO UPDATE` inconditionnel : un appel répété changeait silencieusement le rôle d'un admin **déjà actif**, hors circuit dédié (`plateforme_modifier_role_admin`) | `platform_aal2_role_integrity_v1` test 25 (attend `%déjà rattachée%`, aucune exception) |
| 5 | `plateforme_retirer_admin` | `plateforme_exiger_session_aal2()` — la **révocation** d'un admin (action la plus sensible) ne demandait plus de MFA | `platform_aal2_role_integrity_v1` test 3 (« total AAL1 : révocation refusée », attend `%AAL2%`, « no exception thrown ») |
| 6 | `plateforme_retirer_admin` | Même verrou (fenêtre de compétition sur la garde « dernier total actif ») | `platform_aal2_role_integrity_v1` test 57 (vérifie littéralement, par lecture du code source de la fonction, que `plateforme_verrouiller_mutations_admin` y est appelée) |
| 7 | `plateforme_retirer_admin` | Garde `v_proprietaire` (introduite par `20260906000266`, postérieure à 237) — le propriétaire global ELSATIA redevenait révocable comme n'importe quel admin | `platform_global_owner_all_apps_v1` test 34 (fichier non listé par la mission comme cible, mais dans le même train de régression — corrigé en cascade, sans modification de test, voir §3.3) |

**Classification** — aucune des quatre options proposées (A/B/C/D) ne couvre exactement ce cas de
figure, signalé plutôt que forcé dans une mauvaise case :
- Les points 2, 5, 6, 7 (AAL2/verrou/propriétaire) sont des **vulnérabilités réelles (A)** : des
  contrôles de sécurité établis et testés ont été silencieusement retirés par une réécriture, sans
  intention documentée de les retirer — écart démontré, pas un invariant volontaire ni de la dette
  inoffensive.
- Le point 1 (`actif` par défaut) n'est **pas une vulnérabilité** au sens strict — la contrainte
  CHECK fait exactement son travail en rejetant un état incohérent — mais un **défaut fonctionnel
  réel** dans un chemin sécurité-critique (onboarding totalement cassé), qui masquait les points
  2/3/4 derrière une erreur de contrainte plutôt que le vrai comportement attendu.
- Le point 4 (garde de doublon) est à la frontière A/C : pas d'accès non autorisé à un tiers, mais
  une élévation de rôle silencieuse et non tracée par le circuit prévu — traité comme réel et
  corrigé.

Les tests eux-mêmes n'ont **jamais été modifiés** : ils étaient déjà corrects et ont fait
exactement leur travail. **Correctif** (`20260922000315`) : restaure le corps exact de
`plateforme_ajouter_admin` tel que défini par `20260826000237` (jamais retouchée par une migration
intermédiaire) et le corps exact de `plateforme_retirer_admin` tel que défini par `20260906000266`
(dernière version avant 314 à porter la garde `v_proprietaire`), en conservant intégralement
l'exigence de rôle `'total'` ajoutée par 314 (déjà présente dans les deux versions restaurées,
jamais retirée par cette restauration).

### 3.2 — Résultats avant/après, fichier par fichier

| Fichier | Avant (SHA qualifié) | Après correctif |
|---|---|---|
| `platform_support_uid_security_v1.test.sql` | 31/38 (7 échecs) | **38/38 PASS** |
| `platform_aal2_role_integrity_v1.test.sql` | 64/80 (16 échecs) | **80/80 PASS** |
| `isolation_multitenant_surface.test.sql` | 9/10 (1 échec — cf. §2) | **10/10 PASS** |
| `platform_global_owner_all_apps_v1.test.sql` | 37/40 (3 échecs — hors périmètre nommé, corrigé en cascade) | **40/40 PASS** |

### 3.3 — `platform_global_owner_all_apps_v1` : correction en cascade, non demandée mais vérifiée sûre

Ce fichier n'était pas l'une des deux suites nommées par cette mission, mais partage exactement la
même fonction (`plateforme_retirer_admin`) et la même cause racine (garde `v_proprietaire`
manquante, point 7 ci-dessus). Sa correction est un effet de bord **directement vérifié**, pas une
extension de périmètre décidée séparément : 37/40 → 40/40, aucune modification de test.

### 3.4 — Ce qui reste inchangé, volontairement non touché

`gp_pilot_plateforme_admin_role_total.test.sql` (0/6, INSERT direct dans `plateforme_admins` sans
passer par `plateforme_ajouter_admin`, donc non affecté par ce correctif), `document_partage_public_par_jeton_v1.test.sql` (10/42), `gp_pilot_notification_devis_accepte.test.sql`
(4/7), `gp_pilot_rgpd_manifeste_fichiers.test.sql` (1/9), `platform_audit_log_bounded_v1.test.sql`
(6/12 exécutés) : **strictement identiques** à l'état qualifié (§9 du rapport de qualification),
confirmés par re-test, non touchés — hors périmètre de cette mission (pas de contrainte
préexistante commune aux deux suites nommées), aucune tentative de les faire passer au vert.
`platform_stripe_state_attestation_r72.test.sql` : toujours `BLOCKED` (pgsodium propriétaire, non
installable localement — inchangé, attendu).

---

## 4. Requalification — environnement propre, comparaison avec le SHA qualifié

Nouveau worktree Git détaché, PostgreSQL 16 + pgTAP réinstallés dans un service propre, harnais
Fresh/pgTAP reconstruit à l'identique de la méthode de qualification V1 (mêmes rôles/schémas/
fonctions — voir ce rapport pour le détail complet du harnais).

| Contrôle | SHA qualifié (`76ec759`) | Après correctifs + fusion (arbre final poussé) |
|---|---|---|
| Install déterministe (4 apps) | PASS | **PASS** (`npm ci`/`npm install` sans erreur, 3 lockfiles régénérés proprement après fusion) |
| `verify:migrations` (statique) | PASS, 296 migrations | **PASS, 299 migrations** (296 + 2 migrations de correctif + 1 migration Colors fusionnée depuis `6eaaafa`, sans rapport) |
| Fresh replay indépendant | PASS, 296/296, 0 erreur SQL | **PASS, 299/299, 0 erreur SQL** — rejoué 3 fois de zéro au total (harnais reconstruit à chaque fois), aucune erreur |
| Typecheck (4 apps) | PASS (4/4) | **PASS (4/4)**, 0 erreur |
| Lint (4 apps) | PASS (4/4) | **PASS (4/4)**, mêmes 5 avertissements pré-existants, 0 erreur |
| Tests unitaires (4 apps) | 1777+1992+154+264 PASS | **1786+1992+154+427 PASS** (racine +9 tests via `69fcf10` ; Colors +163 tests via `6eaaafa`, lot « Colors voie restante » — aucun des deux sans rapport avec ce correctif) |
| Builds localement exécutables | GP PASS, Reserves PASS, Colors/Tools bloqués par garde-fou volontaire | **Identique** : GP PASS, Reserves PASS, Colors bloqué par le même garde-fou (variables `NEXT_PUBLIC_*` absentes du sandbox), Tools bloqué pareil mais reconfirmé sain en build diagnostique local |
| pgTAP complet (81 fichiers) | 69 PASS / 9 FAIL / 1 BLOCKED (sur 79) | **75 PASS / 5 FAIL / 1 BLOCKED (sur 81)** — voir détail §3.2/3.4 ; le fichier fusionné depuis `6eaaafa` (`colors_finition_reference_nuancier_v15`) est pleinement vert |
| `npm audit` (racine, `--audit-level=high`) | ÉCHEC réel (1 haute js-yaml, 2 modérées) | **PASS, exit 0** (2 modérées préexistantes sans rapport restantes) |
| `npm audit` (`apps/colors`) | 1 haute (js-yaml) | **0 vulnérabilité** |
| `npm audit` (`apps/reserves`) | 1 haute + 1 critique (next/sharp, sans rapport) + 1 haute (js-yaml) | **0 vulnérabilité** — le correctif next/sharp fusionné depuis `6eaaafa` (`5f720ef`, indépendant de cette mission) combiné à mon épinglage js-yaml résout l'intégralité de l'audit sur cette app |
| Tests spécifiques `SECURITY DEFINER` | — | **7/7 PASS** (nouveau fichier, §2) |
| Tests spécifiques aux corrections `plateforme_admins` | — | **118/118 PASS** (38+80, §3.2) |

**Aucune régression fonctionnelle, DB, sécurité ou isolation multi-tenant détectée** : tous les
contrôles verts au SHA qualifié le restent ; tous les contrôles précédemment en échec et hors
périmètre restent identiques (mêmes fichiers, mêmes comptes d'assertions) ; les seuls changements
sont des passages au vert directement expliqués par les correctifs ci-dessus.

---

## 5. Stripe / CI — vérification, aucun secret fabriqué

Aucun secret Stripe n'a été créé ni simulé. Confirmation, sans y toucher, que le blocage déjà
documenté par la qualification V1 est **exclusivement** dû à l'absence du secret dans ce sandbox :

| Champ | Détail |
|---|---|
| Job | `verification` (`.github/workflows/ci.yml`) |
| Étape | *« Tarifs Stripe Test alignés sur le contrat canonique (strict) »* — `npm run verify:stripe-prices` avec `STRIPE_PRICES_VERIFY_STRICT=1` |
| Variable requise | `STRIPE_SECRET_KEY` (portée par l'environnement GitHub `ci-verification`, jamais au niveau du dépôt — commentaire du workflow : *"un secret de dépôt serait lisible par n'importe quel job, y compris un futur job de déploiement Production"*) — valeur attendue : clé Stripe **Test** (`sk_test_…`), le script refuse explicitement une clé Live |
| Pourquoi nécessaire | Compare les Price ID Stripe réellement configurés au contrat canonique versionné (`config/stripe-prices.test.json`) ; en mode strict, une configuration Stripe absente est un **échec**, pas un avertissement — comportement volontaire du gate (commentaire du workflow : *"c'est exactement ce qui a laissé vivre la divergence TARIFS-V2"*) |
| Constat rejoué cette session | `STRIPE_PRICES_VERIFY_STRICT=1 npm run verify:stripe-prices` → *"aucun accès Stripe (STRIPE_SECRET_KEY absent, CLI stripe absente). Mode strict → échec."*, exit 1 — identique à la qualification V1, aucun changement |
| Ce qui reste à vérifier ailleurs | Seul un environnement autorisé disposant du vrai `STRIPE_SECRET_KEY` Test (l'environnement GitHub `ci-verification`, ou une session avec ce secret injecté) peut confirmer si le gate passe réellement une fois le secret présent — non vérifiable, non simulable, non fabriqué depuis ce sandbox |

---

## 6. Risques résiduels

1. **5 fichiers pgTAP toujours en échec + 1 bloqué**, tous confirmés strictement inchangés et hors
   périmètre de cette mission (§3.4) — restent à traiter séparément.
2. ~~`apps/reserves` : 2 vulnérabilités `npm audit` next/sharp~~ — **résolu**, mais pas par cette
   mission : la fusion de `6eaaafa` (commit `5f720ef`, autre session) a corrigé ce CVE
   indépendamment pendant que cette remédiation était en cours. `apps/reserves` est à 0
   vulnérabilité dans l'arbre final poussé (confirmé §4).
3. **Gate CI Stripe** non confirmé vert en conditions réelles (secret absent du sandbox, §5).
4. **`logoutAction` portée globale** — décision produit non tranchée, signalée par la qualification
   V1, non concernée par cette mission (pas un blocage sécurité identifié comme tel), inchangée.
5. Les correctifs de `plateforme_ajouter_admin`/`plateforme_retirer_admin` restaurent des
   comportements déjà écrits et testés par des migrations antérieures (237/266) — aucune nouvelle
   logique inventée, risque de régression jugé minimal et vérifié empiriquement (§4), mais toute
   fusion future qui réécrirait ces deux fonctions à nouveau devrait repartir de `20260922000315`,
   pas d'une version antérieure à 237/266.
6. Aucun accès Preview/Production/Stripe/Vercel réel dans cette session — tout ce qui était
   `NOT_PROVEN_REMOTE` dans la qualification V1 le reste.

---

## 7. Verdict

```
SECURITY BLOCKERS REMEDIATED
```

Les trois blocages sécurité nommés par la qualification V1 sont corrigés, vérifiés par des tests
existants (jamais modifiés) et de nouveaux tests dédiés, sans régression détectée sur l'ensemble de
la requalification (migrations, 4 apps, pgTAP complet, npm audit). Un quatrième fichier pgTAP
(`platform_global_owner_all_apps_v1`) partageant la même cause racine a été corrigé en cascade,
sans extension de périmètre décidée séparément. Les 5 échecs pgTAP restants et les 2 vulnérabilités
`npm audit` d'`apps/reserves` sont confirmés hors périmètre, inchangés, et documentés comme risques
résiduels (§6) plutôt que silencieusement laissés de côté. Le gate CI Stripe reste non confirmé en
conditions réelles, faute d'accès à un secret que cette mission n'avait pas pour instruction de
fabriquer.
