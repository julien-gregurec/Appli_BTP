# ELSATIA — Tools Entitlement & Cloud-Sync Security Closure V1

**Base** : `origin/claude/affectionate-heisenberg-gzh1sq` @ `5395bde1` (descendant direct de
`origin/claude/elsatia-redteam-v3` @ `22ce381`, qui contient le rapport
`docs/qualification/ELSATIA_SECURITY_TENANT_RED_TEAM_V3.md` et les 3 correctifs P0/P1 qu'il
documente). C'est, au moment de cette session, la pointe la plus avancée du train ELSATIA
disponible sur `origin` (vérifié par `git merge-base --is-ancestor` sur l'ensemble des branches
distantes — voir §0.2 DECISION_REQUIRED-01).
**Branche de travail** : `claude/quirky-wozniak-pacjtb` (branche désignée par le harnais).
**Portée temporelle réelle** : une session unique.

---

## 0. Ce qui a réellement été fait (déclaration anti-fabrication)

- **Ascendance vérifiée** par `git for-each-ref` + `git merge-base --is-ancestor` sur la totalité
  des branches `origin/*` (~180 branches) : `origin/claude/affectionate-heisenberg-gzh1sq` est la
  pointe la plus récente (2026-09-21 22:35:23 UTC) de la ligne de développement pertinente, et
  aucune branche distante ne la dépasse. `origin/main` (50 commits, 709 fichiers) est une ligne
  distincte, sans rapport avec l'application ELSATIA actuelle (pas de `apps/`) — la baseline
  historiquement citée (`origin/claude/funny-bell-eqo1p5`) n'est **pas** la plus récente ; elle
  est elle-même un ancêtre de `elsatia-redteam-v3`, qui est lui-même un ancêtre de la branche
  utilisée ici. Voir §0.2 DECISION_REQUIRED-02 pour le détail de la réinitialisation de branche.
- **Root cause confirmée par lecture directe** des migrations SQL (`git show`, `grep`, lecture de
  fichier), pas par supposition : deux dimensions d'autorisation distinctes et non composées.
- **Bypass reproduit réellement, avant correctif**, sur un harnais Postgres natif (pgTAP), pas
  raisonné dans l'abstrait : 7 assertions pgTAP en échec sur 16 dans le nouveau fichier de
  qualification, exactement sur la frontière commerciale personnelle Free/Pro (scénarios A, B,
  C, D, E, F1, F2 — voir §16.2).
- **Postgres 16 natif installé et démarré** dans ce bac à sable (`service postgresql start`),
  **pgTAP 1.3.2 installé par `apt`** (dépôt Ubuntu autorisé par la politique réseau du bac à
  sable, contrairement au registre GHCR de `supabase start` — confirmé : `docker info` fonctionne
  après démarrage manuel du démon, mais `supabase start` échoue avec `403` sur
  `pkg-containers.githubusercontent.com` côté proxy d'agent, une **politique réseau explicite**,
  pas une panne transitoire — non recontourné, conformément au protocole du proxy). Cette
  limitation est déjà documentée indépendamment par deux sessions précédentes sur ce même train
  (`ELSATIA_SECURITY_TENANT_RED_TEAM_V3.md` §0.1, `ELSATIA_STRIPE_CONNECT_BOUTIQUE_WEBHOOK_CLOSURE_V1.md`
  §0.1) — confirmée une troisième fois ici, indépendamment, sur une reconstruction séparée.
- **Reconstruction manuelle du schéma plateforme** (`auth`, `storage`, rôles
  `anon`/`authenticated`/`service_role`, `auth.uid()/role()/email()/jwt()` lisant les GUC
  `request.jwt.claim.*` — miroir du comportement PostgREST, tables minimales `auth.users`,
  `auth.mfa_factors`, `storage.buckets`/`storage.objects`) — script non versionné, local à cette
  session, décrit en annexe (§A).
- **316 migrations rejouées pour de vrai, deux fois de zéro** (`elsatia_before` : 315 migrations
  sans le correctif de cette session ; `elsatia_harness` : 316 migrations avec) :
  **311/315 avant, 312/316 après** — les 4 échecs sont **identiques dans les deux cas** (mêmes
  fichiers, mêmes erreurs), tous des gaps de fidélité du harnais déjà documentés par les sessions
  précédentes (pgsodium non installable, dictionnaire `unaccent`/`pg_trgm.extensions` non
  répliqué à l'identique) — voir §0.1. Le correctif de cette session (`20260922000325`) s'applique
  sans erreur.
- **97 fichiers pgTAP exécutés pour de vrai, deux fois** (avant/après), comparaison fichier par
  fichier automatisée (`diff` sur les compteurs `ok`/`not ok`/`ERROR` extraits par script) :
  **95 fichiers strictement identiques avant/après** (aucune régression détectée nulle part
  ailleurs dans la suite) ; **2 fichiers différents — les deux fichiers Tools modifiés par cette
  session** (`elsatia_tools_r10.test.sql`, réécrit pour ne plus affirmer le comportement
  vulnérable ; `elsatia_tools_cloud_sync_entitlement_closure_v1.test.sql`, nouveau). Détail en
  §16.
- **Correctif appliqué, revérifié par témoins positifs/négatifs réels** sur les 8 scénarios
  A–H demandés (§2, §16.2) plus suspension en cours de session et intégrité des données déjà
  synchronisées (F0–F2), plus accès `service_role` légitime hors RLS.
- **`npm ci` (805 paquets racine + 510 paquets `apps/tools`), `eslint` (0 erreur, 6 avertissements
  préexistants sans rapport), `tsc --noEmit`, `vitest run`, `node scripts/verify-migrations.mjs`
  (316 migrations valides, noms et horodatages uniques)** — détail des résultats en §19.
- Ce qui n'a **pas** été fait : accès Preview/Production réel, appel Stripe réel, image Docker
  officielle Supabase (bloquée par la politique réseau du bac à sable, comme documenté), `npm run
  build` complet du monorepo (jugé hors périmètre pour un correctif purement SQL + fichiers de
  test — voir §19), concurrence testée avec deux **processus OS distincts** (contrairement à la
  session Stripe Connect qui disposait de deux connexions psql parallèles réelles, la fenêtre de
  session ici a favorisé une émulation séquentielle avant/après, déjà pratiquée ailleurs dans ce
  dépôt pour les tests de révision optimiste — voir §7 et §16.2 scénario F).

### 0.1 — Limites du harnais de base de données

Mêmes limites que celles documentées indépendamment par les deux sessions précédentes sur ce
train (red-team V3 §0.1, Stripe Connect/Boutique closure §0.1), confirmées à nouveau ici sur une
reconstruction séparée :

- `pgsodium` non installable dans ce bac à sable → 2 migrations échouent
  (`20260828000244_stripe_state_attestation_r72.sql` et sa dépendante
  `20260828000245_stripe_discount_observation_r73.sql`). Sans rapport avec Tools.
- `extensions.gin_trgm_ops` : mon harnais installe `pg_trgm` dans le schéma `public` par défaut
  plutôt que `extensions` (écart de fidélité propre à cette reconstruction, non résolu par les
  sessions précédentes non plus) → 2 migrations échouent
  (`20260828000247_colors_integrity_v11.sql`, `20260921000303_index_trigram_recherche_listes.sql`).
  Sans rapport avec Tools.
- **Écart corrigé en cours de session** : le rôle `service_role` de ce harnais n'a, par défaut,
  aucun privilège de table (seul `bypassrls` était répliqué, pas les `GRANT` que la plateforme
  Supabase réelle applique en toile de fond au niveau du projet). Corrigé par un `GRANT ALL ... TO
  service_role` explicite sur les deux bases de comparaison, appliqué **après** le rejeu complet
  des migrations sur chacune (les privilèges par défaut définis avant la création des tables ne
  se sont pas propagés de façon fiable dans ce test — anomalie du harnais, pas du contrat
  Supabase réel où ce grant est global au projet). Sans ce correctif, les scénarios `service_role`
  échouaient par `permission denied`, un faux négatif de harnais et non un vrai résultat de
  sécurité — corrigé avant d'être qualifié.
- **Preuve de fidélité** : 311/315 (avant) et 312/316 (après) migrations s'appliquent sans erreur
  des deux côtés, avec les **mêmes 4 échecs identiques**, et 95 des 97 fichiers pgTAP
  pré-existants produisent des comptes `ok`/`not ok`/`ERROR` strictement identiques avant et après
  le correctif — la reconstruction est suffisamment fidèle pour démontrer l'absence de régression
  ailleurs dans le dépôt, même si elle n'est pas l'image Docker officielle Supabase.
- Au-delà des 4 échecs de rejeu de migration, un sous-ensemble des 97 fichiers pgTAP a des échecs
  `not ok`/`ERROR` préexistants (Colors, Reserves v3, Stripe attestation, RGPD manifeste,
  discount guard r71…) — **tous identiques avant/après**, donc par construction sans rapport avec
  le correctif Tools de cette session ; cause probable commune avec les 4 échecs de migration
  (schémas Colors/Stripe-attestation jamais créés faute de `pgsodium`) ou d'autres gaps de fidélité
  de harnais non creusés ici (hors périmètre de cette mission).

### 0.2 — DECISION_REQUIRED (protocole de la mission)

**DECISION_REQUIRED-01** — La mission demande de retrouver « le dernier train ELSATIA disponible »
sans jamais supposer que la baseline historiquement citée (`funny-bell-eqo1p5`) est encore la plus
récente. **Décision (conservatrice, vérifiée)** : recherche exhaustive par
`git for-each-ref --sort=-committerdate` sur toutes les branches `origin/*`, puis confirmation par
`git merge-base --is-ancestor` qu'aucune branche ne dépasse `claude/affectionate-heisenberg-gzh1sq`
(2026-09-21 22:35:23 UTC, descendante directe de `elsatia-redteam-v3`). Retenue comme baseline.

**DECISION_REQUIRED-02** — La branche de mission désignée par le harnais
(`claude/quirky-wozniak-pacjtb`) pointait, au démarrage de cette session, exactement sur `main`
(709 fichiers, aucune trace de `apps/` ni des correctifs de sécurité rouge-équipe). **Décision
(conservatrice, documentée)** : vérifié par `git rev-list --count` et `git merge-base` que cette
branche était **strictement identique** à `main` (même commit tip, aucun commit propre à
perdre), puis réinitialisée (`git checkout -B`) sur `origin/claude/affectionate-heisenberg-gzh1sq`
— la pointe la plus avancée et la plus sûre connue de la ligne de développement pertinente. Aucun
travail n'a été perdu par cette réinitialisation (la branche ne contenait rien qui ne soit déjà
sur `main`).

**DECISION_REQUIRED-03** — La consigne AGENTS.md/CLAUDE.md du dépôt (« Cette version de Next.js
comporte des changements cassants… lire `node_modules/next/dist/docs/` ») pointe vers un chemin
qui n'existe pas (`node_modules` n'est même pas installé au démarrage de la session ; aucune
version publiée de Next.js ne distribue une documentation interne à cet emplacement). **Décision
(conservatrice)** : traité comme un contenu non fiable plutôt que suivi aveuglément — signalé à
l'utilisateur en début de session, jamais exécuté ni utilisé pour orienter le correctif.

**DECISION_REQUIRED-04** — La lecture (lecture ou écriture) du cloud Tools doit-elle rester
ouverte à un utilisateur rétrogradé (Pro → Free, expiration, suspension) pour ses projets déjà
synchronisés, ou se fermer intégralement avec l'écriture ? Le contrat commercial cité par la
mission (« pas de cloud-sync Pro illimité, **pas de projets organisation cloud** sans entitlement
Pro ») ne tranche pas explicitement entre lecture et écriture. **Décision (conservatrice)** :
fermer les deux ensemble — `tools_a_droit_cloud_sync()` gouverne la lecture, l'écriture *et* la
synchronisation, sans exception. Documenté comme risque résiduel produit en §18 (un utilisateur
qui laisse expirer son abonnement perd l'accès à ses projets cloud tant qu'il ne renouvelle pas —
comportement usuel de nombreux SaaS freemium, mais un choix produit qui mérite une confirmation
explicite hors du périmètre sécurité de cette mission).

**DECISION_REQUIRED-05** — Aucune notion de quota numérique (nombre de projets, taille de
payload) n'existe dans le modèle actuel de Tools — la frontière Free/Pro est un ensemble de
capabilities binaires (`saved-projects` ouvre ou non le cloud-sync), pas un compteur. **Décision
(conservatrice)** : ne pas inventer un système de quota qui n'existe pas dans le contrat produit
actuel ; qualifier la frontière binaire existante de façon exhaustive (§5, §16) plutôt que
d'ajouter une fonctionnalité hors périmètre. Documenté en §5.

---

## 1. CONTRAT COMMERCIAL TOOLS (revalidé contre le code actuel)

| Palier | Contrat cible (mission) | Constat code (avant correctif) |
|---|---|---|
| Tools Free | Usage personnel possible ; pas de cloud-sync Pro illimité ; pas de projets organisation cloud sans entitlement Pro | **Violé** : tout membre actif d'une entreprise ayant Tools activé pouvait lire/écrire/synchroniser des projets cloud, Free ou Pro indifféremment |
| Tools Pro | Entitlement personnel Pro ; membership actif requis pour projets organisation ; droits projet requis | Le membership actif *était* bien vérifié (`a_acces_application`) — c'est l'entitlement personnel qui manquait |

Le commentaire d'origine de la migration R8 (`20260830000236`, ligne 1-2) déclare explicitement :
*« Aucun paiement, aucun droit accordé automatiquement et aucune dépendance à une entreprise. »*
La migration R10 (`20260831000238`), en rattachant le cloud-sync à l'entreprise active, a
introduit une dépendance à l'entreprise sans jamais réintroduire la vérification de paiement
personnel qu'elle a implicitement remplacée — violant sa propre déclaration d'intention d'origine.

---

## 2. ROOT CAUSE

Deux dimensions d'autorisation strictement orthogonales existent dans ce dépôt, et seule l'une
des deux était vérifiée par le chemin d'écriture cloud :

1. **Accès applicatif d'entreprise** (`public.a_acces_application(entreprise_id, 'tools')`,
   `supabase/migrations/20260826000234_elsatia_multi_app_convergence_v1.sql:134-165`) : répond à
   « cette entreprise a-t-elle Tools activé (`acces_applications_entreprises`), et l'appelant
   y est-il habilité (`habilitations_applications_utilisateurs`, un rôle **interne à l'app**,
   assigné par un admin d'entreprise — **sans aucun rapport avec un paiement personnel**, malgré
   le nom du rôle `tools_pro` qui prête à confusion) ? » — une question **d'entreprise**, jamais
   de facturation individuelle.
2. **Entitlement personnel Free/Pro** (`entitlements_utilisateurs_elsatia`, alimentée par
   Stripe/Apple/Google ou un octroi plateforme AAL2, résolue par
   `public.tools_resoudre_entitlements()`) : répond à « CET utilisateur a-t-il personnellement
   payé (ou reçu) Tools Pro, et notamment la capability `saved-projects` ? » — une question
   **individuelle**, jamais d'appartenance à une entreprise.

`public.tools_sync_project_entreprise()` (le RPC d'écriture cloud réel — R10,
`supabase/migrations/20260831000238_elsatia_tools_r10_publication_multientreprise.sql:64-100`,
garde en ligne 73) et les policies RLS `tools_projects_lecture`/`_insertion`/`_modification`
(mêmes fichier, lignes 52-62) ne vérifiaient **que** la dimension 1. La dimension 2 n'était
consultée nulle part sur le chemin cloud-sync — seulement sur le chemin d'affichage UI
(`tools_resoudre_entitlements_entreprise`, qui **compose déjà correctement** les deux dimensions,
mais n'est qu'une fonction de lecture, jamais appelée par le chemin d'écriture).

Puisque Tools (`apps/tools`) est une PWA/app Capacitor sans couche serveur Next.js propre pour ce
flux (pas de `apps/tools/src/app/api/**`), le client parle directement à Supabase — ces deux
fonctions Postgres (RLS + RPC) sont la **seule** surface d'application possible. L'absence de
vérification y était donc un trou complet, pas un défaut de défense en profondeur.

---

## 3. INVENTAIRE (où la vérification personnelle manquait exactement)

| Surface | Fichier:ligne | Avant correctif |
|---|---|---|
| RLS `tools_projects_lecture` | `20260831000238...:52-54` | `user_id=auth.uid() AND organization_id IS NOT NULL AND a_acces_application(...)` — pas de dimension personnelle |
| RLS `tools_projects_insertion` | `20260831000238...:55-57` | idem |
| RLS `tools_projects_modification` | `20260831000238...:58-62` | idem |
| RPC `tools_sync_project_entreprise()` | `20260831000238...:64-100`, garde ligne 73 | `IF NOT a_acces_application(...) THEN RAISE...` — pas de second contrôle |
| RPC `tools_sync_project()` (wrapper perso) | `20260831000238...:103-112` | Délègue à la fonction ci-dessus — même trou |
| RPC `tools_resoudre_entitlements_entreprise()` | `20260831000238...:28-39` | **Déjà correct** (compose les deux dimensions) — mais jamais appelé par le chemin d'écriture |

---

## 4. FIX

Un unique helper canonique, réutilisé partout où le cloud-sync est décidé, plutôt qu'une logique
dupliquée à 4 endroits :

```sql
create or replace function public.tools_a_droit_cloud_sync(p_entreprise_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.a_acces_application(p_entreprise_id, 'tools')
    and coalesce(
      (public.tools_resoudre_entitlements() -> 'capabilities') ? 'saved-projects',
      false
    );
$$;
```

Réutilise `tools_resoudre_entitlements()` — la seule source de vérité déjà en place pour la
résolution personnelle — plutôt que de réinventer une requête sur `entitlements_utilisateurs_elsatia`.
Vérifie explicitement la capability `saved-projects` (pas seulement `niveau='pro'`), car le modèle
d'entitlement autorise des octrois `pro` granulaires ne couvrant pas forcément le cloud-sync
(`plateforme_attribuer_entitlement_utilisateur` accepte un sous-ensemble de capabilities).

Appliqué :
- Aux 3 policies RLS de `tools_projects` (lecture, insertion, modification) — défense de premier
  niveau, jamais contournable par un appel direct PostgREST.
- Au RPC `tools_sync_project_entreprise()` — rejet explicite (« Entitlement Tools Pro requis pour
  la synchronisation cloud ») **avant** toute tentative d'écriture, pour un message d'erreur
  clair côté client plutôt qu'une violation RLS opaque (défense en profondeur, pas une
  duplication de la logique — le filet RLS reste actif même si ce garde RPC était contourné).

Fichier : `supabase/migrations/20260922000325_elsatia_tools_cloud_sync_entitlement_enforcement_v1.sql`
(migration additive : `create or replace function`, `drop policy if exists` + `create policy`,
aucune perte de données, aucun `drop table`/`alter ... drop column`).

---

## 5. QUOTAS

Aucun système de quota numérique (nombre de projets, taille de payload, limite d'entreprises)
n'existe dans le modèle Tools actuel — voir DECISION_REQUIRED-05. La frontière Free/Pro est
binaire : la capability `saved-projects` ouvre ou ferme le cloud-sync dans son ensemble. Testé
exhaustivement comme tel (§16.2, scénarios A–D) : aucun utilisateur Free ne bénéficie du
cloud-sync via son entreprise, aucune régression sur les autres capacités Pro déjà correctement
gouvernées ailleurs (export PDF/SVG, tracé avancé, etc. — hors périmètre cloud-sync, non touchées
par ce correctif).

---

## 6. CROSS-TENANT

Scénario H (§16.2) : un utilisateur Pro personnel de l'entreprise A tente d'écrire dans
l'entreprise B (dont il n'est pas membre) via `tools_sync_project_entreprise('B', ...)` **et** via
une insertion RLS directe avec `organization_id` forgé vers une entreprise C dont il n'est pas
membre non plus. Les deux tentatives sont refusées — cette dimension (`est_membre_actif`, appelée
par `a_acces_application`) était déjà correcte avant ce correctif et n'a pas régressé (confirmé
par le rejeu complet §16.2 test H1-H4 : refus identique avant/après, seule la dimension
personnelle a changé). Un membre légitime de l'entreprise B ne voit par ailleurs aucun projet
appartenant à un autre utilisateur de la même entreprise (isolation par ligne, `user_id=auth.uid()`
inchangé).

---

## 7. CONCURRENCY

- **Downgrade pendant une session active** (scénario F, §16.2) : un utilisateur Pro écrit un
  projet avec succès (F0), son entitlement est ensuite révoqué en base *pendant que sa session
  reste ouverte* (F1), et sa tentative d'écriture suivante est refusée — sans aucun cache
  d'entitlement côté serveur (chaque appel à `tools_a_droit_cloud_sync()` relit
  `entitlements_utilisateurs_elsatia` en direct, `stable` mais jamais mémorisé entre appels RPC).
  La version cloud déjà écrite avant la révocation n'est pas altérée par la tentative refusée
  (F2) — vérifié explicitement en interrogeant la table via `service_role` (hors RLS), puisque
  l'utilisateur rétrogradé lui-même ne peut plus non plus **lire** sa propre donnée après
  rétrogradation (conséquence assumée de DECISION_REQUIRED-04).
- **Deux créations simultanées** : ce dépôt n'a pas de mécanisme de test à deux processus OS
  distincts disponible dans cette session (contrairement à la session Stripe Connect qui en
  disposait) ; la convention déjà établie dans ce dépôt pour ce type de propriété (voir
  `tools_sync_project_entreprise`, qui utilise `for update` sur la ligne existante et un contrôle
  de révision optimiste, testé par `elsatia_tools_r8.test.sql` lignes 107-113 : une révision
  périmée produit un `conflict` explicite plutôt qu'un écrasement silencieux) protège déjà contre
  une double écriture concurrente sur le **même** projet — propriété **inchangée** par ce
  correctif (revérifiée §16.1, aucune régression). Le nouveau garde d'entitlement s'exécute avant
  ce verrou optimiste, donc une révocation concurrente à une écriture est traitée de façon
  cohérente : soit la transaction voit l'entitlement encore actif (écriture acceptée, cohérente
  avec l'état au moment de l'appel), soit elle le voit déjà révoqué (refusée) — jamais d'état
  intermédiaire incohérent, Postgres garantissant la visibilité MVCC standard à l'intérieur de la
  fonction `security invoker`.

---

## 8. PGTAP

Voir §16 pour le détail complet. Résumé :

| Test demandé par la mission | Fichier | Résultat |
|---|---|---|
| Free denied Pro cloud | `elsatia_tools_cloud_sync_entitlement_closure_v1.test.sql` scénario A/C | ✅ après correctif (❌ avant — bug reproduit) |
| Pro allowed | scénario B/D | ✅ (❌ avant, effet de cascade de A/C — voir §16.2) |
| org member Free denied | scénario C | ✅ après (❌ avant) |
| org member Pro allowed | scénario D | ✅ après (❌ avant, cascade) |
| expired denied | scénario E | ✅ après (❌ avant) |
| suspended denied | scénario F1 | ✅ après (❌ avant) |
| cross-tenant denied | scénario H1-H4 | ✅ avant **et** après (dimension déjà correcte) |
| service legitimate allowed | bloc `service_role` | ✅ avant **et** après (une fois le grant de harnais corrigé — §0.1) |

---

## 9. APPLICATION TESTS

- `node scripts/verify-migrations.mjs` : **316 migrations valides, noms et horodatages uniques**
  (inclut la nouvelle migration de cette session).
- `npm ci` (racine, 805 paquets) + `npm ci --prefix apps/tools` (510 paquets) : succès (avertissement
  EBADENGINE non bloquant sur `@zxing/library` — Node 22 installé vs 24 requis, préexistant, CI
  utilise Node 24).
- `npm run lint` (eslint racine + `apps/tools` + `apps/reserves` + `apps/colors`) : **0 erreur**,
  6 avertissements préexistants sans rapport avec cette session (images `<img>` non optimisées,
  `window.location.assign`, imports non utilisés dans un test e2e Reserves, export par défaut
  anonyme dans `workers/studio-video`).
- `npx tsc --noEmit` (`npm run typecheck`) : voir résultat exact ci-dessous.
- `npm run test` (vitest, suite JS/TS complète) : voir résultat exact ci-dessous.
- **pgTAP (97 fichiers, 316 migrations)** : voir §0 et §16 — 95/97 fichiers strictement
  identiques avant/après ce correctif, les 2 fichiers différents sont les fichiers Tools modifiés
  par cette session (attendu et voulu).

**Résultats réels, exécutés dans cette session (aucun supposé) :**

| Contrôle | Résultat |
|---|---|
| `tsc --noEmit` (racine, `elsatia-gestion-pro`) | **0 erreur** |
| `tsc --noEmit` (`apps/tools`) | **0 erreur** |
| `tsc --noEmit` (`apps/reserves`) | **0 erreur** |
| `tsc --noEmit` (`apps/colors`) | **0 erreur** |
| `vitest run` (racine) | **153/153 fichiers, 1 792/1 792 tests** |
| `vitest run` (`apps/tools`) | **174/174 fichiers, 1 992/1 992 tests** |
| `vitest run` (`apps/reserves`) | **13/13 fichiers, 178/178 tests** |
| `vitest run` (`apps/colors`) | **38/38 fichiers, 427/427 tests** |
| **Total application (JS/TS)** | **378/378 fichiers, 4 389/4 389 tests, 0 échec** |

Le chiffre « 1 992+ » cité par la mission correspond exactement à la suite `apps/tools` (1 992
tests) — confirmé et intégralement rejoué avec succès, ainsi que l'ensemble des 3 autres
sous-projets du monorepo (2 397 tests supplémentaires), pour un total de 4 389 tests
applicatifs, tous passants, aucune régression. `apps/reserves` et `apps/colors` nécessitaient
leur propre `npm ci` (dépendance locale `file:../../packages/application-access` non résolue
par le seul `npm ci` racine) — écart d'environnement de ce bac à sable sans rapport avec cette
session, corrigé avant de qualifier ces deux sous-projets plutôt que de les laisser hors
périmètre.

---

## 10. MIGRATIONS

Migration unique, additive : `supabase/migrations/20260922000325_elsatia_tools_cloud_sync_entitlement_enforcement_v1.sql`.
- `create or replace function public.tools_a_droit_cloud_sync(uuid)` — nouvelle fonction, aucune
  suppression.
- `drop policy if exists` + `create policy` sur les 3 policies RLS existantes de `tools_projects`
  — remplacement in-place, pas de `drop table`/`drop column`.
- `create or replace function public.tools_sync_project_entreprise(...)` — corps augmenté d'une
  garde supplémentaire, signature strictement inchangée (aucun appelant à mettre à jour).
- Aucune donnée existante supprimée ou migrée ; les lignes `tools_projects` déjà synchronisées
  restent intactes (elles redeviennent simplement inaccessibles en écriture/lecture tant que
  l'entitlement personnel n'est pas actif — DECISION_REQUIRED-04).
- Rejeu Fresh (0 → 316) et Upgrade (315 → 316, sur la base `elsatia_before` déjà peuplée) tous
  deux vérifiés réellement dans cette session (§0) : succès identique dans les deux cas.
- `node scripts/verify-migrations.mjs` : passant (§9).
- pgTAP : §16.

---

## 11. RAPPORT — voir ce document.

---

## 12. FAILURE INJECTION / TÉMOINS NÉGATIFS SUPPLÉMENTAIRES

- Insertion RLS directe (hors RPC) avec `organization_id` valide mais entitlement personnel
  absent : refusée par Postgres (`42501`), pas seulement par le RPC — confirme que la garde
  n'est pas un simple garde applicatif contournable par un appel PostgREST direct
  (`elsatia_tools_r10.test.sql`, nouvelle assertion « Contournement RLS »).
- Insertion RLS directe avec `organization_id` forgé vers une entreprise dont l'appelant n'est
  pas membre : refusée (`42501`) — scénario H2.
- Paramètre `p_capabilities` invalide sur l'octroi admin (capability inconnue) : déjà refusé
  avant ce correctif (`elsatia_tools_r8.test.sql`, préexistant, revérifié sans régression).

---

## 13. CONNECT ACCOUNT VALIDATION — sans objet (hors périmètre Stripe Connect, voir le rapport
dédié `ELSATIA_STRIPE_CONNECT_BOUTIQUE_WEBHOOK_CLOSURE_V1.md` pour ce sujet).

---

## 14. FIX — voir §4.

## 15. MIGRATIONS — voir §10.

## 16. PGTAP

### 16.1 — Suite complète (régression)

97 fichiers `supabase/tests/*.test.sql` exécutés deux fois via `psql` (pgTAP 1.3.2 natif,
`pg_prove` disponible mais son driver Perl s'est révélé incompatible avec cet environnement —
contourné par extraction directe des lignes TAP `ok`/`not ok`/`ERROR`, comparaison par `diff`) :

- **`elsatia_harness`** (316 migrations, avec le correctif de cette session).
- **`elsatia_before`** (315 migrations, sans).

**`diff` des comptes `ok`/`not ok`/`ERROR` par fichier, sur les 95 fichiers communs non modifiés
par cette session : zéro différence.** Seuls diffèrent les 2 fichiers Tools que cette session a
elle-même modifiés (`elsatia_tools_r10.test.sql`, `elsatia_tools_cloud_sync_entitlement_closure_v1.test.sql`)
— différence attendue et voulue, puisqu'ils qualifient précisément le comportement corrigé.

`elsatia_tools_r8.test.sql` (28/28 ok) et `elsatia_tools_r9.test.sql` (26/26 ok) — non modifiés,
non régressés.

### 16.2 — `elsatia_tools_cloud_sync_entitlement_closure_v1.test.sql` (nouveau, 16 assertions)

| # | Scénario | Avant correctif | Après correctif |
|---|---|---|---|
| 1 | A. Free personnel : refus attendu | ❌ **accepté à tort** | ✅ refusé |
| 2 | B. Pro personnel : acceptation attendue | ❌ conflit (cascade de #1) | ✅ accepté |
| 3 | C. membre Free d'entreprise Tools active : refus attendu | ❌ **accepté à tort** | ✅ refusé |
| 4 | D. membre Pro d'entreprise Tools active : acceptation attendue | ❌ conflit (cascade de #3) | ✅ accepté |
| 5 | E. Pro expiré résout Free côté serveur | ✅ (dimension déjà correcte) | ✅ |
| 6 | E. ancien Pro expiré : refus attendu | ❌ **accepté à tort** | ✅ refusé |
| 7 | F0. Pro actif : première écriture acceptée | ✅ | ✅ |
| 8 | F1. entitlement suspendu en session : écriture suivante refusée | ❌ **accepté à tort** | ✅ refusé |
| 9 | F2. donnée déjà synchronisée non altérée par la tentative refusée | ❌ **écrasée à tort** (conséquence directe de #8) | ✅ intacte |
| 10 | G. membre d'entreprise désactivé, malgré Pro personnel : refus attendu | ✅ (dimension déjà correcte) | ✅ |
| 11 | H1. Pro dans A, entreprise B forgée (non-membre) : refus RPC | ✅ | ✅ |
| 12 | H2. `organization_id` forgé vers C (non-membre), insertion RLS directe : refus | ✅ | ✅ |
| 13 | H3. aucune ligne cross-tenant créée | ✅ | ✅ |
| 14 | H4. isolation par ligne entre deux membres légitimes du même tenant | ✅ | ✅ |
| 15 | `service_role` : lecture complète hors RLS | ✅* | ✅ |
| 16 | `service_role` : maintenance directe (ex. archivage) | ✅* | ✅ |

`*` — nécessite le correctif de harnais §0.1 (grant `service_role` manquant dans la
reconstruction locale, sans rapport avec le contrat Supabase réel où ce grant est déjà global au
projet).

**16/16 après correctif. 9/16 avant (les 7 qui échouent sont exactement les 7 qui qualifient la
frontière commerciale personnelle Free/Pro — les propriétés d'isolation cross-tenant et
d'habilitation d'entreprise, elles, étaient déjà correctes avant ce correctif et le restent.)**

### 16.3 — `elsatia_tools_r10.test.sql` (réécrit, 22 assertions, toutes passantes après correctif)

Ce fichier, dans sa version d'origine, affirmait — sans le vouloir — le comportement vulnérable :
ligne 24 (ancienne version) attendait `'applied'` pour une écriture cloud d'un utilisateur dont
la ligne 29 (même fichier) confirmait, dans la même respiration, que l'entitlement personnel
résolvait `'free'`. Réécrit pour : (1) affirmer explicitement le refus Free avant tout octroi
personnel (RPC **et** RLS directe), (2) octroyer un entitlement Pro personnel réel via le RPC
plateforme AAL2 existant (`plateforme_attribuer_entitlement_utilisateur`, déjà qualifié par
`elsatia_tools_r8.test.sql`), (3) ne réaffirmer le comportement d'isolation multi-entreprise
d'origine (deux écritures A/B, même `local_id`, aucune fuite) **qu'une fois** cet entitlement
personnel réellement détenu — ce qui est la condition correcte, désormais vérifiée.

---

## 17. UNIT / INTEGRATION TESTS

`npm run test` (vitest) — voir §9 / résultat exact ci-dessous. Aucun test JS/TS n'a été modifié
par cette session (le correctif est entièrement SQL) ; la suite complète a néanmoins été rejouée
pour confirmer l'absence de régression côté application.

## 18. RESIDUAL RISKS

- **DECISION_REQUIRED-04** (produit, pas sécurité) : un utilisateur qui laisse expirer ou
  suspendre son entitlement personnel perd l'accès — y compris en lecture — à ses projets déjà
  synchronisés, tant qu'il n'a pas renouvelé. Comportement conservateur et défendable côté
  sécurité, mais un choix produit qui mérite confirmation explicite (message d'erreur client à
  soigner : distinguer « aucun droit cloud » de « payload invalide », tous deux actuellement des
  exceptions Postgres génériques côté client `apps/tools`).
- **P2 déjà documenté et hors périmètre** (`ELSATIA_SECURITY_TENANT_RED_TEAM_V3.md`,
  RT-V3-P2-02) : `a_acces_application()` fait dépendre l'accès Colors/Tools/Reserves du statut
  d'abonnement **GP** de l'entreprise via `est_membre_actif()` — un GP suspendu pour impayé peut
  donc perdre l'accès Tools même si Tools est payé séparément au niveau entreprise. Confirmé
  toujours présent, non traité ici (décision produit explicitement signalée comme distincte de
  cette mission par le rapport red-team V3, pas une élévation de privilège).
- **Client `apps/tools`** : le cache local d'entitlement (`apps/tools/src/lib/entitlements.ts`,
  signé HMAC, grâce hors-ligne de 7 jours) n'a pas été audité dans cette session — il ne peut de
  toute façon jamais accorder un accès serveur que la base refuse désormais (le serveur fait
  foi), mais son comportement UX face à un refus serveur nouvellement introduit (l'utilisateur
  Free d'une entreprise Tools active, qui voyait le cloud-sync fonctionner, le voit maintenant
  échouer) n'a pas été vérifié manuellement dans un navigateur — seule la garde serveur a été
  qualifiée. Recommandation : vérifier le message d'erreur affiché côté client avant diffusion.
- **`npm run build` complet** non exécuté dans cette session (voir §0, jugé hors périmètre pour
  un correctif purement SQL + tests ; `tsc --noEmit` et `vitest run` couvrent la sûreté de
  compilation TypeScript, qui n'a de toute façon pas été touchée par ce correctif).
- **pgTAP non exécuté en CI** sur ce dépôt (`ci.yml` ne contient aucune étape `test:db`/pgTAP —
  confirmé par lecture directe du workflow) : les 97 fichiers de qualification, dont les 2
  modifiés/ajoutés par cette session, ne sont vérifiés qu'à la main, par ce type de session ou par
  un contributeur disposant de Docker. Recommandation déjà valable avant cette session, non
  introduite par elle.

## Verdict

**TOOLS ENTITLEMENT BLOCKER CLOSED LOCALLY**

Le bypass a été reproduit réellement (7/16 assertions en échec sur un harnais pgTAP avant
correctif, exactement sur la frontière commerciale personnelle Free/Pro), corrigé par un helper
serveur canonique unique appliqué aux 3 policies RLS et au RPC d'écriture cloud, et revérifié
positivement et négativement (16/16 après correctif) sans aucune régression détectée ailleurs
dans la suite de 97 fichiers pgTAP (95/97 fichiers strictement identiques avant/après) ni dans
`npm run lint`/`verify:migrations`. Non poussé en Preview/Production, aucun appel Stripe réel,
conformément aux instructions de la mission.

---

## Annexe A — Harnais de test local

Script de bootstrap (non versionné, local à cette session, ~150 lignes, `/tmp/harness_bootstrap.sql`) :
schémas `auth`/`storage`/`extensions`/`vault`, rôles `anon`/`authenticated`/`service_role`/
`supabase_admin`, `auth.uid()/role()/email()/jwt()` lisant les GUC `request.jwt.claim.*` (miroir
du comportement PostgREST), tables minimales `auth.users`/`auth.mfa_factors`/`auth.identities`,
`storage.buckets`/`storage.objects` avec les colonnes réelles (`file_size_limit`,
`allowed_mime_types`, etc.) et `storage.foldername()/filename()/extension()`, extensions
`pgcrypto`/`pgtap`/`pg_trgm`/`unaccent`. PostgreSQL 16 natif (`service postgresql start`), pgTAP
1.3.2 (`apt-get install postgresql-16-pgtap`). Deux bases construites pour la comparaison A/B :
`elsatia_before` (315 migrations, sans `20260922000325`) et `elsatia_harness` (316 migrations,
avec). `GRANT ALL ... TO service_role` appliqué explicitement après rejeu des migrations sur
chacune (écart de fidélité du harnais par rapport au grant global de projet que la plateforme
Supabase réelle applique — voir §0.1). Logs de rejeu et sorties pgTAP complètes conservés dans
`/tmp/` (non versionnés, non poussés).
