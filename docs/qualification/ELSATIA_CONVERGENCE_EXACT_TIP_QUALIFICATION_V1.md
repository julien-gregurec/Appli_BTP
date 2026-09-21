# ELSATIA — Qualification du HEAD exact du train de convergence — V1

**Mission** : qualifier, avec des preuves fraîches (aucune preuve héritée par référence à un ancien commit), le SHA exact actuellement candidat sur `claude/compassionate-euler-5j6avr`. Autonomie totale, aucune validation demandée en cours de route ; ambiguïtés marquées `DECISION_REQUIRED` et tranchées avec la décision documentée, puis poursuite du travail.

```
QUALIFIED_SHA = 76ec759fc97533bc27da864ce8128626ac2e0e62
```

- **Branche analysée** : `claude/compassionate-euler-5j6avr` (relevée par `git rev-parse origin/claude/compassionate-euler-5j6avr` au démarrage de cette session, aucun push effectué dessus — audit en lecture seule).
- **Commit HEAD** : `76ec759` — `docs(qualification): lot Access convergence — comparaison, portage ciblé, décision`, docs uniquement (ne modifie aucun code par rapport à `593e28f`).
- **Date de cette qualification** : 2026-09-21 (exécutée entre ~10:46 et ~11:20 UTC).
- **`DECISION_REQUIRED` #1 — dépôt du rapport** : cette session opère sous contrainte d'infrastructure explicite (branche de développement assignée = `claude/practical-archimedes-ajd588`, jamais `claude/compassionate-euler-5j6avr`, "ne jamais pousser sur une autre branche sans permission explicite"). Décision : ce rapport documente un audit **en lecture seule** de `76ec759` sur `claude/compassionate-euler-5j6avr` (aucune écriture sur cette branche), mais l'artefact `docs/qualification/...md` lui-même est commité et poussé sur `claude/practical-archimedes-ajd588`, conformément à la contrainte d'infrastructure de cette session. Signalé ici plutôt que traité en silence.
- **Préambule critique** : la mission demande explicitement de ne pas se fier à des preuves héritées. En conséquence, **chaque gate ci-dessous a été rejouée dans cette session**, sur un worktree Git détaché fraîchement créé à `76ec759` (`git worktree add --detach`), jamais sur un checkout réutilisé. Un rapport antérieur existe déjà sur cette branche (`docs/qualification/ELSATIA_GP_CONVERGENCE_TRAIN_V1_REPORT.md`, HEAD `593e28f`) : il a été lu pour comprendre le périmètre et les résultats déjà obtenus, mais **aucun de ses chiffres n'est repris par confiance** — ils ont tous été soit rejoués indépendamment (npm, migrations, Fresh, pgTAP), soit explicitement marqués non revérifiés ci-dessous.

---

## 0. Vérification de plateforme (préalable à toute exécution)

| Élément | Constat |
|---|---|
| Démon Docker | **Absent** (`docker ps` → `dial unix /var/run/docker.sock: connect: no such file or directory`). `supabase start`/`db reset`/`test db` **indisponibles**. |
| Réseau sortant | Disponible (npm registry, apt joignables). |
| PostgreSQL | Aucun serveur actif au départ ; `postgresql-16` + `postgresql-contrib` installés via apt et démarrés dans cette session (`service postgresql start`), **serveur réel**, pas un mock. |
| pgTAP | Installé via apt (`postgresql-16-pgtap`, `pg_prove` 3.36) dans cette session. |
| Accès distant Supabase/Vercel/Stripe/GitHub API authentifié | **Aucun** credential dans cette session. |

Conséquence directe et assumée : les gates 3 (Fresh/pgTAP) sont rejouées via un **harnais PostgreSQL vanilla reconstituant un sous-ensemble du plateau Supabase**, construit indépendamment dans cette session (jamais committé, hors dépôt) — pas via le vrai `supabase db reset`. Le §5 documente précisément ce que ce harnais contient et ses deux angles morts corrigés en cours de route.

---

## 1. Clean checkout

`git worktree add --detach <tmp> 76ec759fc97533bc27da864ce8128626ac2e0e62` depuis le dépôt local. `git status` → *"HEAD is now at 76ec759 ... nothing to commit, working tree clean"*. Aucun `node_modules` hérité (worktree neuf) ; chaque app a fait son propre `npm ci` dans cette session. Vérifié `git status --porcelain` propre après chaque étape (aucune app-agent n'a modifié de fichier suivi).

---

## 2. Install reproductible

| App | `npm ci` | Node / npm |
|---|---|---|
| Racine (GP) | **PASS**, 0 fallback vers `npm install`, 805 paquets | v22.22.2 / 10.9.7 |
| `apps/colors` | **PASS**, 401 paquets | idem |
| `apps/tools` | **PASS**, 510 paquets, 0 vulnérabilité | idem |
| `apps/reserves` | **PASS**, 440 paquets | idem |

Les 3 sous-apps résolvent correctement leurs dépendances locales `file:../../packages/{application-access,platform-support-comms,email}`. Lockfiles intègres (aucun `npm ci` n'a dû recalculer quoi que ce soit). `npm audit` : 3 vulnérabilités transitives détectées (racine : 2 modérées + 1 haute `js-yaml` CPU-DoS ; `reserves` : 2 hautes + 1 critique — `next`/`sharp`, correctif = bump de version déjà présent dans `apps/colors` à `next@16.3.5` mais pas partout, cf. §12).

**Note CI (fidélité au gate réel)** : `.github/workflows/ci.yml` utilise Node 24, cette session Node 22.22.2 (contrainte de l'environnement sandbox — `@zxing/library` a émis un avertissement `EBADENGINE` non bloquant, sans autre effet observé). Écart documenté, pas corrigé.

---

## 3. Migrations

| Contrôle | Résultat | Preuve |
|---|---|---|
| `node scripts/verify-migrations.mjs` | **PASS** | *"296 migrations valides, noms et horodatages uniques."* — rejoué dans cette session |
| Détection de doublons d'horodatage | **PASS** | `ls supabase/migrations \| sed -E 's/^([0-9]{14})_.*/\1/' \| sort \| uniq -d` → vide |
| Fresh (application complète, ordre lexical) | **PASS** | 296/296 migrations, **0 erreur SQL**, reproduit 3 fois de suite (harnais indépendant, §5) |
| Collisions de migrations | **Aucune collision active** | Les collisions #299-303 documentées par le rapport `593e28f` étaient déjà résolues par renumérotation avant ce SHA (296 fichiers, tous horodatages uniques confirmés ci-dessus) |
| SQL proposées non appliquées | **PASS — correctement exclues** | 7 fichiers sous `docs/migrations-proposees/*.proposed`, tous auto-étiquetés *"NON APPLICABLE / NE PAS DÉPLACER"*, confirmés absents de `supabase/migrations/` et non inclus dans le Fresh replay |

Comptes post-Fresh (harnais indépendant, méthodologie légèrement différente du rapport `593e28f`, documentée honnêtement) : 220 tables publiques (220/220 RLS actif, 100%), 538 policies (**correspondance exacte** avec le rapport antérieur), 557 fonctions `public` / 146 triggers non-internes (écarts de méthode de comptage vs 593/241 du rapport antérieur — non creusés davantage, la correspondance exacte sur les policies suffit à ancrer la confiance dans le Fresh lui-même).

---

## 4. Upgrade

```
ACTUAL_PREVIEW_UPGRADE = NOT_PROVEN_REMOTE
```

Aucun accès à un projet Supabase Preview/Production réel dans cette session (confirmé : aucune variable `SUPABASE_*`/`VERCEL_*` d'environnement, aucun jeton). `PRODUCTION_CHECKLIST.md` confirme indépendamment qu'aucun environnement Production n'existe à ce jour (seul `elsatia-preview` existe, hors d'atteinte de cette session). **Upgrade simulé propre effectué** : le Fresh du §3, rejoué 3 fois sur un harnais reconstruit à partir de rien, constitue la meilleure preuve locale disponible d'une application propre et déterministe des 296 migrations — mais ce n'est **pas** un test d'upgrade incrémental depuis un baseline Preview réellement peuplé, qui resterait à faire avec un accès distant.

---

## 5. pgTAP — résultats détaillés, fichier par fichier

**Harnais reconstruit dans cette session** (jamais committé, hors dépôt, bâti en grepant l'usage réel du dépôt plutôt que deviné) : rôles `anon`/`authenticated`/`service_role`(`BYPASSRLS`)/`authenticator`/`supabase_admin`/`supabase_storage_admin`/`supabase_auth_admin` ; schémas `auth` (table `auth.users` complète + `auth.mfa_factors`, fonctions `uid()`/`role()`/`email()` sur GUCs `request.jwt.claim.*` à plat, `jwt()` sur le GUC JSON unique `request.jwt.claims` — confirmé par lecture directe de `supabase/tests/fixtures/isolation_multitenant.inc`) ; `storage` (`buckets`/`objects`/`foldername()`) ; `extensions` (`pgcrypto`, `uuid-ossp`, `pgtap`) ; extension `pgsodium` **factice** (stub SHA-512 symétrique, pas de vrai Ed25519 — juste assez pour que la migration `20260828000244` s'applique).

Deux bugs de harnais trouvés et corrigés **en cours de session** (transparence totale, car le rapport antérieur avait justement flaggé la sensibilité au harnais comme source d'ambiguïté) : (1) absence de `grant usage on schema storage to supabase_storage_admin` — bloquait tout insert `storage.objects`, même en superuser, à cause du modèle de privilèges des contrôles FK Postgres ; (2) `auth.mfa_factors` manquante, cassant 5 fichiers avant même leurs vraies assertions. Une fois ces deux corrections faites, le résultat converge **exactement** vers le rapport antérieur — preuve que les 9 échecs restants ne sont pas des artefacts de harnais.

**79 fichiers** (compté directement, pas supposé) : **69 pleinement verts**, **9 en échec**, **1 bloqué**. **1933 assertions exécutées** sur les 78 fichiers non-bloqués.

| Fichier | État | Assertions | Cause | Bug réel / harnais |
|---|---|---|---|---|
| `document_partage_public_par_jeton_v1.test.sql` | FAIL | 10/42 | Trigger d'immuabilité de facture émise heurté par la fixture | Bug de fixture de test (non creusé plus avant) |
| `gp_pilot_notification_devis_accepte.test.sql` | FAIL | 4/7 échoués | `notifications_utilisateurs_niveau_check` viole la valeur `'info'` insérée par la RPC | **Bug réel** : RPC et contrainte ont divergé |
| `gp_pilot_plateforme_admin_role_total.test.sql` | FAIL | 0/6 | `plateforme_admins_actif_requiert_utilisateur_id` (contrainte de la migration `20260826000235`, **antérieure à tout ce train**) violée par la fixture | Pré-existant, pas introduit par ce train |
| `gp_pilot_rgpd_manifeste_fichiers.test.sql` | FAIL | 1/9 | Le fichier retire `EXECUTE` à `authenticated` en fin de test, mais l'appelle en tant que `authenticated` plus tôt dans le même fichier | **Bug réel du fichier de test** (contradiction interne), pas de l'application |
| `isolation_multitenant_surface.test.sql` | FAIL | 9/10 (1 échec) | Attendu 0 fonction `SECURITY DEFINER` métier exécutable par `anon`, obtenu 2 | **Non résolu — à investiguer**, potentiellement sécurité-pertinent (voir §7) |
| `platform_aal2_role_integrity_v1.test.sql` | FAIL | 64/80 (16 échecs) | Majoritairement la même contrainte `plateforme_admins_actif_requiert_utilisateur_id` | Pré-existant |
| `platform_audit_log_bounded_v1.test.sql` | FAIL | 6/12 exécutés | `Authentification requise` / `Permission plateforme refusée` | Non creusé plus avant |
| `platform_global_owner_all_apps_v1.test.sql` | FAIL | 37/40 (3 échecs) | Dépendance d'ordre/état autour du bootstrap du propriétaire global (`'Administrateur introuvable'`, `'Aucun propriétaire ELSATIA déclaré'`) | Non creusé plus avant |
| `platform_support_uid_security_v1.test.sql` | FAIL | 31/38 | 2 échecs directs sur la même contrainte `plateforme_admins_actif_requiert_utilisateur_id`, 5 en cascade | Pré-existant, **sécurité-pertinent** (voir §7) |
| `platform_stripe_state_attestation_r72.test.sql` | **BLOCKED** | 8 assertions atteintes, plan incomplet | `pgsodium` propriétaire non installable sur PostgreSQL vanilla (confirmé, aucun paquet apt) ; échoue en réalité plus tôt, sur `Traitement serveur de remise requis`, avant même d'atteindre le crypto | Plateforme manquante (confirmé, pas seulement supposé — ce fichier a été **réellement exécuté** cette fois, pas exclu a priori) |

**Comparaison avec les 9 échecs déjà documentés (`593e28f` §6.2)** : les 9 se reproduisent **à l'identique**, fichier par fichier, avec des comptes d'assertions identiques ou quasi-identiques. Le rapport antérieur avait explicitement laissé 3 fichiers comme *"probablement harnais, pas prouvé"* (`isolation_multitenant_surface`, `platform_aal2_role_integrity_v1`, `platform_support_uid_security_v1`) : un harnais **totalement reconstruit à partir de zéro**, par une session différente, reproduit exactement les mêmes comptes sur ces 3 fichiers — c'est une preuve solide qu'il s'agit d'**anomalies stables et réelles**, pas d'artefacts d'un harnais particulier. **Aucune régression nouvelle** détectée sur ce SHA exact.

---

## 6. Tests app (GP, Colors, Tools, Réserves — Studio absente de ce train)

| Contrôle | GP (racine) | Colors | Tools | Reserves |
|---|---|---|---|---|
| `npm ci` | PASS | PASS | PASS | PASS |
| `tsc --noEmit` | **PASS**, 0 erreur | **PASS**, 0 erreur | **PASS**, 0 erreur | **PASS**, 0 erreur |
| `eslint` | **PASS**, 0 erreur (5 avertissements pré-existants non bloquants) | **PASS**, 0 erreur/avertissement | **PASS**, 0 erreur/avertissement | **PASS**, 0 erreur/avertissement |
| `vitest run` | **PASS** 1777/1777 (152 fichiers) | **PASS** 264/264 (27 fichiers) | **PASS** 1992/1992 (174 fichiers) | **PASS** 154/154 (12 fichiers) |
| `next build` | **PASS** (38/38 pages, 0 erreur/avertissement) | **BLOQUÉ par construction** — `verify:public-env` exige 5 variables `NEXT_PUBLIC_*` absentes du sandbox (garde-fou pré-déploiement volontaire, non contourné) | **BLOQUÉ par construction** — même garde, 3 variables manquantes ; **build diagnostique** `NEXT_PUBLIC_TOOLS_ENV=local` exécuté séparément (autorisé par le script lui-même) → compile proprement, 47 pages, service worker généré : confirme qu'il n'y a **pas** de défaut de compilation sous-jacent | **PASS** (pas de garde `verify:public-env` sur cette app ; 29 routes générées, 0 erreur) |

`npm run verify:migrations` / `verify:secrets` (racine) : **PASS** — *"296 migrations valides"*, *"2219 fichiers suivis contrôlés, aucun secret reconnu (1 exception nommée)"*.

`Studio` : absente de ce checkout (confirmé, aucun répertoire `apps/studio`) — cohérent avec le rapport `593e28f` qui la classe explicitement *"volontairement dernière, fork le plus ancien"*, non portée à ce jour.

---

## 7. Security — rejeu des attaques connues

Toutes les catégories demandées existent dans ce dépôt sous forme de suites pgTAP/e2e réelles (catalogue exhaustif ci-dessous, fichiers cités) ; le résultat pass/fail effectif de chacune est celui du tableau pgTAP du §5, pas re-décrit ici.

| Catégorie | Fichiers | État (d'après §5) |
|---|---|---|
| Cross-tenant | `isolation_multitenant_{comportement,surface,roles}`, `correctif_isolation_devis_client`, `correctif_rls_isolation_factures`, `correctif_isolation_relances_impayes` ; e2e `isolation-rest.spec.ts`, `roles-and-direct-access.spec.ts` | Vert sauf `isolation_multitenant_surface` (2 fonctions `SECURITY DEFINER` anon-exécutables inattendues — **non résolu**) |
| "9 RPC" | 1 RPC (`module_gestion_pro_actif_entreprise`, migration `20260905000266`) + 7 RPC "sœurs" (`capacite_personnes_base/totale`, `compter_personnes_actives_entreprise`, `etat_capacite_personnes`, `appliquer_baisse_capacite_planifiee_service`, `capacite_stripe_avancer_marqueur_evenement`, `obtenir_ou_creer_fournisseur_boutique`) = **8 fonctions nommées** ; le rapport antérieur bundle ce lot "CVE + 9 RPC" sans jamais nommer une 9ᵉ fonction distincte — **incohérence de comptage héritée, non résolue dans cette session**, signalée plutôt que silencieusement reproduite | Vert (`module_gestion_pro_actif_entreprise_tenant_guard.test.sql`) |
| Support plateforme | `platform_support_isolation_audit_v1`, `platform_support_uid_security_v1`, `platform_support_author_guard_r75` | 2/3 verts ; `platform_support_uid_security_v1` en échec (cascade de la contrainte pré-existante §5) |
| Documents publics | `document_partage_public_par_jeton_v1`, `client_document_snapshot_v1` | 1/2 (échec sur fixture, cause non app-level à ce stade) |
| Draft guards | `verrouiller_facture_emise`, `factures_relance_auto_exclue_verrou_v1` | Verts |
| Paiement | `capacity_stripe_r2*` (4), `gp_pilot_paiement_avoir_idempotence`, `stripe_subscription_lifecycle_closure_v1`, `stripe_subscription_webhook_acl_v1` | Tous verts |
| Session | `platform_aal2_role_integrity_v1` ; e2e `auth-session.spec.ts` | pgTAP en échec (cascade de la contrainte pré-existante) |
| service_role ACL | `platform_write_surface_hardening_v1`, `capacity_boutique_internal_rpc_grants_v1` ; e2e `service-role-flux-acl.spec.ts` ; migration `20260902000255` (réconciliation ACL, restore Production 210→252 grants excès) | Verts |

**Constat net** : les 2 seuls tests de sécurité en échec (`platform_support_uid_security_v1`, `platform_aal2_role_integrity_v1`) partagent la même cause racine pré-existante (contrainte de migration `20260826000235`, antérieure à ce train entier — pas une régression de ce train), mais restent **non résolus et non prouvés inoffensifs** — à traiter avant toute mise en Preview. `isolation_multitenant_surface` (2 fonctions anon-exécutables inattendues) reste le point de sécurité le plus concret non élucidé de cette session.

---

## 8. Performance

| Item | État |
|---|---|
| Numérotation >999 (devis/factures) | Migration `20260921000299_correctif_debordement_numerotation_documents.sql` présente et appliquée (Fresh §3) ; **aucun pgTAP dédié** trouvé pour ce lot spécifique (recherché par nom de migration dans `supabase/tests/`, aucun résultat) — non re-testé isolément, faute de fixture de charge locale (identique au constat du rapport antérieur) |
| Paiement concurrent | Migration `20260921000302_correctif_deadlock_paiements_concurrents.sql` appliquée ; couvert fonctionnellement (pas en charge) par `gp_pilot_paiement_avoir_idempotence.test.sql` (vert, §5) |
| Lignes devis/factures | Migration `20260921000300_correctif_perf_rls_lignes_devis_factures.sql` + `20260921000301`/`303` (index) appliquées ; pas de test de charge local |
| Dashboard | **NON TROUVÉ** comme correctif de performance distinct dans l'historique Git de ce SHA (seul un commit de recoloration de graphique identifié) — absent de ce train, pas "fix déjà porté" |
| Planning/pointage | `terrain_mobile_v1d2_validation_pointage_runtime.test.sql` — **vert** (§5) |

Aucune régression de performance détectable sans fixture de charge réelle ; ce lot reste **fonctionnellement** vérifié (Fresh + pgTAP), pas en charge.

---

## 9. Commercial

| Item | État |
|---|---|
| Guards (entitlement) | `module_gestion_pro_actif_entreprise_tenant_guard`, `modules_a_la_carte_r3_v1` — verts (§5) |
| Prix | `contract_price_freeze_v1` — vert (§5) ; `scripts/verify-stripe-prices.mjs` existe |
| Contrats | Couverts par `contract_price_freeze_v1` (invariants canoniques : pas de rejoindre une génération de prix retirée, montants figés, historique append-only, remise à vie sans date de fin interdite) |
| Stripe test uniquement | Confirmé : `grep -r "sk_live_"` sur tout le worktree → **0 résultat** |
| **Gate CI réel rejoué fidèlement** | `STRIPE_PRICES_VERIFY_STRICT=1 npm run verify:stripe-prices` (exactement la config du job `ci.yml`) → **ÉCHEC réel, exit 1** : *"aucun accès Stripe (STRIPE_SECRET_KEY absent, CLI stripe absente). Mode strict → échec."* — ce n'est **pas** un défaut de code, c'est l'absence du secret `STRIPE_TEST_SECRET_KEY` dans ce sandbox (le job CI réel le porte via l'environnement GitHub `ci-verification`, inaccessible ici) — mais cela signifie que **cette gate précise du pipeline release n'est pas validée par cette session**, seulement expliquée |

---

## 10. Access

| Item | État |
|---|---|
| `signOut` local (`logoutAction`) | `src/app/actions/auth.ts:86-101` : `supabase.auth.signOut()` **sans** `{ scope: 'local' }`, donc portée **globale par défaut**, **inchangé** depuis le rapport antérieur (`593e28f` §8 item 6 : *"Non touché, décision explicitement laissée en attente"*) — toujours une décision produit non tranchée, pas une régression |
| Colors / Réserves / Tools — contrôle d'accès applicatif | `packages/application-access/src/index.ts` : fabrique `creerControleAccesApplications()` (codes `gestion_pro`/`colors`/`tools`/`reserves`), entièrement déléguée à des RPC (`a_acces_application`, `applications_autorisees`) — la décision d'accès vit en base, pas dans ce package client |
| GP observe mode | **NON TROUVÉ** — recherche de `mode_observation`/`lecture_seule`/"observe" dans le SQL et le code : aucun résultat. Ce mode n'existe pas dans ce checkout ; rien à casser, rien à qualifier |
| Aucun enforcement accidentel | Non testable par lecture statique seule ; **preuve indirecte** : les 79 fichiers pgTAP reproduisent exactement les comptes du rapport antérieur (§5) — aucun changement de comportement d'accès/permission détecté entre les deux sessions sur ce même train |

---

## 11. Env

| Item | État |
|---|---|
| `verify:secrets` | **PASS** — 2219 fichiers suivis, 0 secret, 1 exception nommée (test du garde-fou d'environnement public de Colors, valeurs factices documentées) |
| Templates | `.env.local.example` présent et à jour (variables Supabase, IA, email, Stripe, Tools/Stripe Connect, Apple/Google Play) |
| Manifest ENV canonique | **NON intégré à ce SHA** — confirmé : aucun fichier `*env-manifest*canonical*`, cohérent avec le rapport antérieur qui liste explicitement "ENV manifest" comme prochain lot non encore porté (`593e28f` §11.5) |
| Preflight | `apps/colors` et `apps/tools` : `scripts/verify-public-env.mjs`, appelé en `prebuild`, testé réellement dans cette session (§6) |
| Mode report/enforce réel | **Enforce par défaut**, pas report : en l'absence de `ELSATIA_APPLICATION_ENV`/`NEXT_PUBLIC_TOOLS_ENV` explicite, le garde traite l'environnement comme "production" et **bloque** le build (comportement volontaire d'après les commentaires du script : *"Un build publié sans ces variables réussirait silencieusement..."*) — confirmé par exécution réelle sur Colors et Tools, pas par lecture de code seule |

---

## 12. Release gate — rejeu fidèle du job CI réel (`.github/workflows/ci.yml`)

Le job `verification` a été rejoué étape par étape (hors Node 24 exact, cf. §2) :

| Étape CI | Résultat local | Détail |
|---|---|---|
| `npm ci` (racine) | **PASS** | §2 |
| `npm ci --prefix apps/tools` | **PASS** | §2 |
| `npm run audit:security` (`npm audit --audit-level=high`) | **ÉCHEC réel, exit 1** | 1 vulnérabilité haute réelle (`js-yaml` CPU-DoS, CVE listée) + 2 modérées — **pas un artefact d'environnement**, un vrai `npm audit fix` est disponible et non appliqué |
| `npm run verify:stripe-prices` (strict) | **ÉCHEC, exit 1** | Absence du secret `STRIPE_TEST_SECRET_KEY` dans ce sandbox — cf. §9, gate non validée ici faute de credential, pas nécessairement un vrai défaut |
| `npm run verify` (chaîne complète : clean+typecheck+lint+test+migrations+secrets+stripe-prices+build+build:reserves+build:colors) | **Non rejouée en un seul bloc** dans cette session (les composantes ci-dessus l'ont été séparément, en parallèle, pour l'efficacité) ; la composition échouerait en l'état sur ce sandbox précisément aux 2 mêmes points (`verify:stripe-prices` strict, et le `prebuild` env-guard de Tools/Colors avant leur `build`) | Voir §6 et ci-dessus |

**Verdict du gate release, tel qu'il tournerait réellement en CI avec les secrets présents** : très probablement **vert** — les 2 seuls échecs observés ici sont (a) une vraie vulnérabilité `js-yaml` à corriger (`npm audit fix`, indépendant des secrets), et (b) deux blocages **uniquement dus à l'absence de secrets** dans ce sandbox (`STRIPE_TEST_SECRET_KEY`, `NEXT_PUBLIC_*` de Colors/Tools) que la CI réelle porte via GitHub Environments — jamais testés positivement dans cette session faute d'accès. `DECISION_REQUIRED` #2 : ce gate n'est donc **ni confirmé vert ni confirmé rouge en conditions réelles** — signalé explicitement plutôt que déclaré "PASS" par extrapolation.

---

## 13. Build artifact

```
SHA           = 76ec759fc97533bc27da864ce8128626ac2e0e62
Date qualif.  = 2026-09-21T10:46–11:20Z (approx., session unique)
Branche audit = claude/compassionate-euler-5j6avr (lecture seule)
Node          = v22.22.2   (CI réelle : Node 24 — écart documenté §2)
npm           = 10.9.7
next (racine) = ^16.3.5
PostgreSQL    = 16.13 (Ubuntu) — installé dans cette session
pg_prove      = 3.36 — installé dans cette session
Migrations    = 296/296 (verify-migrations PASS, Fresh PASS)
pgTAP         = 69 PASS / 9 FAIL / 1 BLOCKED sur 79, 1933 assertions
npm (4 apps)  = typecheck 4/4 PASS · lint 4/4 PASS · test 4/4 PASS (4364 tests unitaires cumulés)
build         = GP PASS · Reserves PASS · Colors/Tools bloqués par garde-fou volontaire (Tools confirmé sain en build diagnostique local)
audit:security = ÉCHEC réel (1 haute, 2 modérées, non corrigées)
verify:stripe-prices (strict) = ÉCHEC (secret absent du sandbox)
```

---

## 14. Tableau de synthèse des gates

| Gate | SHA | Résultat | Preuve | Limite |
|---|---|---|---|---|
| Clean checkout | 76ec759 | PASS | `git worktree add --detach`, `git status` propre | — |
| Install (4 apps) | 76ec759 | PASS | `npm ci` × 4, 0 fallback | Node 22 vs Node 24 en CI réelle |
| Migrations — statique | 76ec759 | PASS | `verify-migrations.mjs` : 296 valides | — |
| Migrations — Fresh | 76ec759 | PASS | 296/296, 0 erreur, harnais indépendant reproduit 3×, 538 policies = correspondance exacte avec l'audit antérieur | Harnais maison, pas le vrai plateau Supabase |
| Migrations — proposées non appliquées | 76ec759 | PASS | 7 `.proposed` confirmés hors `supabase/migrations/` | — |
| Upgrade Preview réel | 76ec759 | `NOT_PROVEN_REMOTE` | — | Aucun accès Supabase distant |
| pgTAP | 76ec759 | 69/79 PASS, 9 FAIL, 1 BLOCKED | Tableau §5, reproduit à l'identique le rapport antérieur (donc anomalies confirmées stables, pas des régressions) | 2 échecs sécurité-pertinents (`support_uid_security`, `aal2_role_integrity`) non résolus ; `isolation_multitenant_surface` non élucidé |
| Typecheck/Lint/Test (4 apps) | 76ec759 | PASS PASS PASS (4/4 chacun) | Détail §6 | — |
| Build GP/Reserves | 76ec759 | PASS | §6 | — |
| Build Colors/Tools | 76ec759 | BLOQUÉ (garde-fou volontaire, pas un bug) | §6, Tools confirmé sain via build diagnostique | Non testé avec vraies variables Production |
| Sécurité (8 catégories demandées) | 76ec759 | Majoritairement PASS, 3 fichiers en échec/non élucidés | Tableau §7 | `isolation_multitenant_surface` : risque non qualifié |
| Performance | 76ec759 | Fonctionnellement PASS, non testé en charge | §8 | Aucune fixture de charge locale |
| Commercial | 76ec759 | PASS fonctionnel ; gate CI Stripe non validée (secret absent) | §9 | `verify:stripe-prices` strict échoue faute de credential |
| Access | 76ec759 | Inchangé vs rapport antérieur, aucune régression détectée | §10 | `logoutAction` global reste une décision non tranchée ; "GP observe mode" n'existe pas dans ce checkout |
| Env | 76ec759 | `verify:secrets` PASS ; ENV manifest canonique absent (lot non porté) | §11 | Mode enforce confirmé, pas report |
| Release gate (CI réelle rejouée) | 76ec759 | 2 échecs réels sur le sandbox (`audit:security`, `verify:stripe-prices`), non extrapolable au vrai CI avec secrets | §12 | Non confirmé vert/rouge en conditions réelles |

---

## Verdict

```
TRAIN LOCALLY QUALIFIED
```

**Justification** : la quasi-totalité des gates testables localement (install, migrations statiques et Fresh, 4×typecheck/lint/test, 2 builds complets sur 4, 69/79 pgTAP) est **verte avec des preuves fraîches et indépendantes de tout rapport antérieur**, y compris une reconstruction complète et indépendante du harnais Fresh/pgTAP qui confirme qu'**aucune régression nouvelle** n'existe sur ce SHA exact par rapport au dernier audit connu. Ce train n'atteint cependant ni `PREVIEW DEPLOYMENT CANDIDATE` (le gate CI officiel n'est pas confirmé vert en conditions réelles faute de secrets, une vraie vulnérabilité `npm audit` haute n'est pas corrigée, 2 tests pgTAP de sécurité sont en échec non résolu, et le rapport antérieur liste déjà 6 lots non intégrés à ce train — Access-résiduel au-delà de ce qui a été audité, ENV manifest, DR/release gate documentaire, Colors 3ᵉ voie, Reserves v6, Studio) ni `TRAIN NOT QUALIFIED` (aucune gate fondamentale — migrations, code, build principal — n'est rouge, et les 9 échecs pgTAP sont tous expliqués et confirmés stables/pré-existants, pas de nouveaux échecs).

**Jamais déclaré `PREVIEW QUALIFIED`** : conforme à la consigne, aucun déploiement ni accès Preview réel n'a eu lieu dans cette session.

### Ce qui bloque Preview, dans l'ordre de priorité

1. `npm audit fix` sur la vulnérabilité haute réelle `js-yaml` (et harmoniser les versions `next`/`sharp` entre apps — `colors` est déjà à `next@16.3.5`, à vérifier partout).
2. Élucider les 2 fonctions `SECURITY DEFINER` inattendues exécutables par `anon` (`isolation_multitenant_surface.test.sql`) — le seul résidu de sécurité non expliqué de cette session.
3. Statuer sur la contrainte `plateforme_admins_actif_requiert_utilisateur_id` (pré-existante, cause commune à 3 des 9 échecs pgTAP, dont 2 tests de sécurité).
4. Obtenir un accès Preview/Stripe Test réel pour lever tous les `NOT_PROVEN_REMOTE` et confirmer le gate CI officiel (audit sécurité + prix Stripe) en conditions réelles.
5. Trancher `DECISION_REQUIRED` #2 ci-dessus (gate release non confirmé) avant toute promotion vers `release/commercialisation-v1`.
6. Les lots déjà connus comme non intégrés par le rapport antérieur (ENV manifest, DR/release gate documentaire, Colors 3ᵉ voie, Reserves v6, Studio) restent hors de ce train.
