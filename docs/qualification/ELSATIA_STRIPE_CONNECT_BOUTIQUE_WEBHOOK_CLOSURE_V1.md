# ELSATIA — Stripe Connect + Boutique Webhook Closure V1

**Base** : `origin/claude/elsatia-redteam-v3` @ `22ce381` (615 commits, contient les 3
correctifs de `docs/qualification/ELSATIA_SECURITY_TENANT_RED_TEAM_V3.md`).
**Branche de travail** : `claude/affectionate-heisenberg-gzh1sq` (branche de mission désignée
par le harnais — traitée comme la « branche indépendante dédiée » demandée par la mission ;
voir §0 DECISION_REQUIRED-01).
**Portée temporelle réelle** : une session unique. Comme le rapport red-team V3 qu'elle referme,
cette section ouvre sur une déclaration anti-fabrication honnête plutôt qu'une estimation de
durée.

---

## 0. Ce qui a réellement été fait (déclaration anti-fabrication)

- **Ascendance vérifiée par `git merge-base`** : `origin/claude/funny-bell-eqo1p5` est un
  ancêtre direct de `origin/claude/elsatia-redteam-v3` (614 → 615 commits, un seul commit
  d'écart : `22ce381`, les 3 correctifs rouge-équipe). `main` (50 commits) n'est **pas** sur
  cette ligne : son unique ancêtre commun avec `funny-bell-eqo1p5` est son propre tip
  (`4d92ddb`) — `main` est une ligne de développement distincte et bien plus courte, qui ne
  contient ni l'application ELSATIA actuelle ni les 3 correctifs rouge-équipe.
- **Postgres 16 natif installé et démarré** dans ce bac à sable (`service postgresql start`),
  **pgTAP 1.3.2 installé par `apt`** (réseau autorisé pour le dépôt Ubuntu, contrairement au
  registre Docker de `supabase start`, qui échoue ici comme documenté par la session
  red-team V3 — confirmé indépendamment : `failed to connect to the docker API ... no such
  file or directory`, aucun démon Docker dans ce bac à sable).
- **Reconstruction manuelle du schéma plateforme** (`auth`, `storage`, rôles `anon`/
  `authenticated`/`service_role`, `auth.uid()/role()/email()/jwt()`, `storage.foldername()/
  filename()`) — script non versionné, local à cette session, décrit en annexe (§A).
- **315 migrations rejouées pour de vrai, deux fois de zéro** (avant/après le correctif de
  cette session) sur cette reconstruction : **311/315 avant, 311/315 après** (mêmes 4 échecs
  identiques dans les deux cas — voir §0.1, aucun lié à Stripe Connect/Boutique).
- **96 fichiers pgTAP exécutés pour de vrai, deux fois** (avant/après), comparaison fichier par
  fichier automatisée (script Python, comparaison exacte des compteurs `ok`/`not ok`) : **95
  fichiers strictement identiques avant/après** (2 226 assertions, 2 144 ok + 82 not ok
  pré-existants dans les deux cas), **1 seul fichier différent — le nouveau fichier de cette
  session** (6/32 assertions avant, 6 en échec ou avortées ; 32/32 après). Détail en §16.
- **Reproduction réelle du blocker AVANT correctif** : `INSERT` de dé-duplication webhook
  exécuté en tant que `service_role` sur la base rejouée → `permission denied for table
  stripe_webhook_events` (42501), et appel direct des 2 RPC Connect manquantes →
  `function ... does not exist`. Capturé à la fois par requête manuelle (§1) et par le
  fichier pgTAP de cette session en mode « avant correctif » (§16).
- **Correctif appliqué, revérifié par témoins positifs/négatifs réels** (auto-octroi refusé,
  confused deputy tenant/compte Connect refusé, chemin serveur fonctionnel, montant plafonné,
  idempotence par session Checkout revérifiée) — §9-§13.
- **`npm ci` (804 paquets), `vitest run` complet (1 792/1 792), `tsc --noEmit` (0 erreur),
  `eslint` sur les fichiers modifiés (0 erreur), `verify:migrations` (315 migrations valides),
  `verify:secrets` (2 505 fichiers, aucun secret)** — tous exécutés réellement dans cette
  session, pas supposés. Détail en §20.
- Ce qui n'a **pas** été fait : accès Preview/Production réel, appel Stripe réel (aucune clé
  fournie), image Docker officielle Supabase (bloquée par la politique réseau du bac à
  sable), correction de la D3 (idempotence retry-après-échec, décision historique confirmée
  et non renversée — §10), correction des 8 autres flux cassés par la migration 255 hors
  Stripe Connect/Boutique (paie, relances, Powens, push, journal d'activité — hors périmètre
  explicite de cette mission), `npm run build` complet (typecheck + lint + tests couvrent la
  sûreté de compilation ; le build production n'a pas été relancé, jugé hors periometre pour
  un correctif purement SQL + 2 fichiers `src/`).

### 0.1 — Limites du harnais de base de données

Mêmes limites que celles documentées indépendamment par la session red-team V3
(`docs/qualification/ELSATIA_SECURITY_TENANT_RED_TEAM_V3.md` §0.1), confirmées à nouveau ici sur
une reconstruction séparée :

- `pgsodium` non installable (`apt-get install postgresql-16-pgsodium` : paquet introuvable) →
  2 migrations échouent (`20260828000244_stripe_state_attestation_r72.sql` et sa dépendante
  `20260828000245_stripe_discount_observation_r73.sql`, schéma `stripe_attestation` jamais créé).
  **Aucun lien avec Stripe Connect/Boutique** malgré le nom : ces migrations couvrent
  l'attestation d'état de remise commerciale (module « Modules à la carte »), pas les webhooks.
- 2 gaps de fidélité propres à **cette** reconstruction (colonnes `auth.users` et dictionnaire de
  recherche non modélisés) : `20260906000266_platform_global_owner_all_apps_v1.sql`
  (`u.deleted_at` absent de mon `auth.users` minimal) et
  `20260908000276_platform_client_directory_index_v1.sql` (dictionnaire de recherche
  `public.unaccent`, non recréé par ce harnais). **Aucun lien avec Stripe Connect/Boutique.**
  Corrigés partiellement en cours de route (`instance_id`, `email_confirmed_at` ajoutés à
  `auth.users` pour permettre à la fixture d'isolation multitenant standard du dépôt de
  s'appliquer) ; les deux derniers gaps n'ont pas été poursuivis, jugés hors périmètre.
- **Preuve de fidélité** : 311/315 migrations s'appliquent sans erreur des deux côtés de la
  comparaison (avant/après), et les 95 fichiers pgTAP pré-existants produisent des comptes
  `ok`/`not ok` **strictement identiques** avant et après le correctif — la reconstruction est
  suffisamment fidèle pour démontrer l'absence de régression, même si elle n'est pas l'image
  Docker officielle Supabase.
- 15 fichiers pgTAP pré-existants ont des échecs pré-existants (82 assertions au total, mêmes
  avant/après) — tous des gaps de fidélité de harnais (schémas Colors/Studio dépendant des 2
  migrations `pgsodium`-bloquées, un fichier gated par une variable psql
  `:{?migration_194_replay}` que cette invocation ne définit pas, etc.), **aucun lié aux webhooks
  Stripe Connect/Boutique** — vérifié explicitement, voir §16.

### 0.2 — DECISION_REQUIRED (protocole de la mission)

**DECISION_REQUIRED-01** — La mission (texte utilisateur) demande de « créer une branche
indépendante dédiée à cette mission », tandis que les instructions système du harnais désignent
une branche fixe (`claude/affectionate-heisenberg-gzh1sq`) et interdisent explicitement de
pousser ailleurs sans permission explicite. **Décision (conservatrice)** : traiter la branche
désignée par le harnais comme la branche dédiée à cette mission ; ne pousser que sur elle. Les
deux contraintes sont ainsi satisfaites sans ambiguïté.

**DECISION_REQUIRED-02** — Cette branche, telle que fournie au départ de la session, pointait
sur `main` (identique à son tip, `4d92ddb`), une ligne de développement qui ne contient ni
l'application ELSATIA actuelle ni les 3 correctifs de sécurité rouge-équipe que la mission
demande explicitement de ne pas perdre. **Décision (conservatrice, documentée)** : réinitialiser
la branche de mission sur `origin/claude/elsatia-redteam-v3` (la pointe la plus avancée et la
plus sûre connue de la ligne de développement pertinente, contenant les 3 correctifs et le
rapport rouge-équipe qui documente le blocker à fermer) plutôt que de développer sur `main` (ce
qui aurait perdu silencieusement les 3 correctifs et n'aurait pas correspondu au périmètre décrit
par la mission). `git ls-remote` a confirmé qu'aucune PR n'existait déjà pour cette branche —
aucun historique mergé n'a été perdu par cette réinitialisation.

**DECISION_REQUIRED-03** — Le périmètre exact du correctif « minimal et certain » face à un lot
historique de 11 flux cassés (§2). **Décision (conservatrice)** : ne porter que les 3 éléments
strictement nécessaires à Stripe Connect + Boutique (le périmètre explicite du titre de cette
mission), laisser les 8 autres flux (paie, relances, Powens, push, journal d'activité) ouverts et
documentés pour un lot dédié — voir §2 et §14.

**DECISION_REQUIRED-04** — Faut-il corriger la D3 (idempotence retry-après-échec, documentée
mais non corrigée par la session du 2026-09-11 comme « lot de sécurité distinct ») dans ce
correctif, la mission demandant explicitement de tester en profondeur l'idempotence ? **Décision
(conservatrice)** : ne pas renverser une décision d'ingénierie déjà prise, documentée et motivée
par une session dédiée disposant du même contexte ; **tester réellement** le comportement actuel
(§10, §18) au lieu de se contenter de constater la contrainte UNIQUE, documenter le résultat
comme risque résiduel confirmé (pas nouveau), et proposer le correctif concret pour un lot dédié.
Argumentée en détail en §10.

---

## 1. BASELINE

| | |
|---|---|
| Branche de départ (avant réinitialisation) | `claude/affectionate-heisenberg-gzh1sq` = `main` @ `4d92ddb` (50 commits, ELSATIA absent) |
| Branche de mission (après réinitialisation, DECISION_REQUIRED-02) | `claude/affectionate-heisenberg-gzh1sq` = `origin/claude/elsatia-redteam-v3` @ `22ce381` (615 commits) |
| `git merge-base funny-bell-eqo1p5 elsatia-redteam-v3` | `842b4b4` = tip de `funny-bell-eqo1p5` → **ancêtre direct**, 1 commit d'écart |
| Commit d'écart | `22ce381` — les 3 correctifs rouge-équipe V3 (RPC `authenticated`-exploitables), déjà présents sur la branche de mission |
| Migrations avant cette session | 314 |
| Migrations après cette session | 315 (`20260922000324_stripe_connect_boutique_webhook_closure_v1.sql`, additive) |

---

## 2. ROOT CAUSE

Le blocker P1 confirmé par
`docs/qualification/ELSATIA_SECURITY_TENANT_RED_TEAM_V3.md` §6 est **CONFIG/GRANT/SCHEMA
combinés**, tous originaires de la même migration :
`supabase/migrations/20260902000255_acl_reconciliation_v1.sql`, un balayage ACL global qui
retire à `service_role` tout privilège de table (sauf 7 tables) et l'`EXECUTE` de 350+ fonctions,
**sans jamais restaurer** l'accès minimal dont les webhooks Stripe Connect/Boutique ont besoin.

Classification par cause (taxonomie de la mission) :

| Élément cassé | Cause | Détail |
|---|---|---|
| `stripe_webhook_events` : `INSERT` de dé-duplication échoue pour les DEUX webhooks | **GRANT** | La 255 retire `SELECT/INSERT/UPDATE/DELETE` à `service_role` sur cette table ; aucune migration suivante ne restaure `INSERT` |
| `stripe_connect_encaisser_facture_service` | **SCHEMA** | N'existe dans aucune migration appliquée — conçue le 2026-09-11, jamais numérotée ni fusionnée |
| `stripe_connect_expirer_checkout_facture_service` | **SCHEMA** | Idem |
| `boutique_expirer_commande_service` | **SCHEMA** | Idem — résidu déjà noté par le rapport rouge-équipe V3 (§2, REDTEAM-V3-03, « RESIDUAL RISK ») comme non corrigé |
| (déjà fermé par `22ce381`, non retouché ici) `boutique_finaliser_commande_payee` accessible à `authenticated` | GRANT | Décision D1, déjà appliquée avant cette mission |

Root cause unique en amont : **un correctif déjà entièrement conçu, validé (148 assertions
pgTAP, 36 appels PostgREST réels, 9 parcours E2E Playwright, le 2026-09-11) n'a jamais été
numéroté ni intégré au train de migrations**, alors que le train a continué d'avancer
(278 → 315 migrations depuis). Le blocker n'est donc pas un bug de conception mais un **échec de
livraison** d'un correctif déjà écrit.

---

## 3. HISTORICAL FIX ANALYSIS

Le correctif historique mentionné par le rapport rouge-équipe V3 a été retrouvé intact dans le
dépôt :

- `docs/audit/ELSATIA_SERVICE_ROLE_FLUX_ACL_V1.md` (rapport de validation complet, 2026-09-11,
  base Train V3 @ `59e960a`, branche `fix/service-role-flux-acl-255-v1`, jamais fusionnée).
- `docs/migrations-proposees/service-role-flux-acl-v1.sql.proposed` (654 lignes, 14 fonctions +
  6 grants par colonne + correctif Boutique D1 + déclencheur).
- `docs/migrations-proposees/service-role-flux-acl-v1.pgtap.sql.proposed` (148 assertions).

La branche de travail originale (`fix/service-role-flux-acl-255-v1`, worktree local
`/Volumes/ELSATIA-DEV/...`) n'existe pas dans les refs accessibles à cette session
(`git branch -a --contains` ne la trouve pas) — seuls les fichiers `.proposed`, versionnés dans
`docs/`, ont survécu et sont la seule trace exploitable. C'est cohérent avec le rapport
historique : « poussée sans force pour préservation », sur un remote/worktree qui n'est pas celui
de cette session.

Classification élément par élément (périmètre Stripe Connect/Boutique uniquement) :

| Élément du `.proposed` | Statut | Décision |
|---|---|---|
| §1 GRANT INSERT sur `stripe_webhook_events` (id, event_type, livemode, facture_id) | **STILL_REQUIRED** | Repris à l'identique (§14) |
| §3 `stripe_connect_encaisser_facture_service` (avec l'arrondi `round(…,2)` déjà corrigé le 2026-09-11) | **STILL_REQUIRED** | Repris à l'identique, logique inchangée |
| §3 `stripe_connect_expirer_checkout_facture_service` | **STILL_REQUIRED** | Repris à l'identique |
| §4 `boutique_expirer_commande_service` | **STILL_REQUIRED** | Repris à l'identique |
| §4 `revoke execute ... boutique_finaliser_commande_payee ... from authenticated` + `grant ... to service_role` | **ALREADY_PRESENT** | Déjà fait par `22ce381` (`20260922000323`), revérifié par requête catalogue avant d'écrire cette migration — **non reporté**, aurait été un double correctif |
| §4 déclencheur `boutique_commandes_paiement_serveur_seul` (D1) | **ALREADY_PRESENT, SUPERSEDED (en mieux)** | Déjà fait par `22ce381`, avec `auth.role()` au lieu du `current_user` du `.proposed` original — la version appliquée corrige un bug documenté du `.proposed` (`current_user` vaut le propriétaire de la fonction `SECURITY DEFINER`, pas l'appelant réel, à l'intérieur d'un appel RPC) |
| §2 (paie : `periodes_paie`, `lots_virements`), §5 (comptage abonnement), §6 (relances), §7 (import paie), §8 (push) | **STILL_REQUIRED, hors périmètre** | Non repris — flux non-Stripe, hors du titre explicite de cette mission (§14) |

Aucun élément classé `SUPERSEDED` (défavorablement), `UNSAFE` ou `OBSOLETE` dans le périmètre
Stripe Connect/Boutique : le contenu technique du `.proposed` reste correct et directement
réutilisable, huit ans-migrations plus tard (au sens du train), parce qu'il touche des fonctions
et une table qui n'ont pas été modifiées entre-temps (vérifié par `git log -- <table/fonction>`
sur les 60 migrations postérieures à la conception du lot).

---

## 4. STRIPE CONNECT FLOW

```
Stripe (facture client payée par Checkout)
  → signature HMAC-SHA256 (verifierSignatureStripe, src/lib/stripe.ts:55)
  → [NOUVEAU] contrôle de mode fail-closed (resoudreModeStripeWebhook, §7)
  → route src/app/api/stripe/webhook/route.ts
  → dé-duplication : INSERT stripe_webhook_events (id = event.id) — 23505 si déjà reçu
  → validation UUID de facture_id/entreprise_id (metadata Checkout, jamais fait confiance brute)
  → RPC stripe_connect_encaisser_facture_service (SECURITY DEFINER, service_role seul) :
      resolution tenant (facture.entreprise_id = p_entreprise_id)
      resolution compte Connect (entreprises.stripe_account_id = p_compte_stripe)
      resolution session Checkout (factures.stripe_checkout_id = p_checkout_id)
      → 'ignoree' si une seule de ces 3 conditions échoue (fail-closed, aucune écriture)
      → sinon : paiement inséré (idempotent par stripe_session_id), facture.stripe_payment_status='paid'
  → réponse 200 {received:true} (ou 500 si la RPC échoue — Stripe retente)
```

Événements réellement testés (pgTAP + vitest) : `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `checkout.session.expired`, `account.updated`
(onboarding Connect, colonnes bornées sur `entreprises`, jamais passé par service_role direct sur
la table facture/paiement).

Compte connecté (`Connect`) vs compte plateforme : la route lit `evenement.account` (le compte
Connect émetteur de l'événement, posé par Stripe) et le confronte à
`entreprises.stripe_account_id` **dans la RPC**, jamais côté route — aucune confusion possible
entre le compte plateforme et un compte connecté tiers (témoin W8/test pgTAP #22, §13).

---

## 5. BOUTIQUE FLOW

```
Client (checkout Boutique)
  → src/app/actions/boutique.ts (authenticated, RLS) : brouillon → en_attente_paiement, session Checkout
Stripe (webhook)
  → signature HMAC-SHA256 (secret dédié STRIPE_WEBHOOK_BOUTIQUE_SECRET, isolé du secret Connect)
  → feature flag boutiqueEstActive() (404 si désactivée)
  → contrôle de mode fail-closed (déjà présent avant cette session)
  → route src/app/api/stripe/boutique/webhook/route.ts
  → dé-duplication : INSERT stripe_webhook_events (même table, même mécanisme que Connect)
  → RPC boutique_finaliser_commande_payee (service_role SEUL depuis 22ce381 — D1, ALREADY_PRESENT)
    ou [NOUVEAU] boutique_expirer_commande_service (service_role seul)
  → réponse 200 (ou 500 si la RPC échoue)
```

Le correctif rouge-équipe (`22ce381`) déjà en place avant cette mission est vérifié intact :
`authenticated` ne peut plus appeler `boutique_finaliser_commande_payee` directement (aucun
contournement RPC), et le déclencheur `boutique_commandes_paiement_serveur_seul` bloque tout
PATCH direct de `statut='payee'` par RLS. Le résidu que cette mission ferme est **l'expiration**
(`boutique_expirer_commande_service`, absente de toute migration appliquée avant ce lot) : sans
elle, une commande dont la session Checkout expire reste indéfiniment `en_attente_paiement` —
bogue fonctionnel, pas une faille (la RPC de finalisation reste fermée à `authenticated`, le PATCH
direct reste bloqué par le déclencheur), mais qui appartenait explicitement au flux à fermer.

---

## 6. SIGNATURE

Implémentation (`src/lib/stripe.ts:55`) : HMAC-SHA256, tolérance d'horodatage 300 s (recommandation
Stripe), comparaison en temps constant (`timingSafeEqual`), accepte plusieurs signatures `v1=`
(rotation de secret), secret par webhook (`STRIPE_WEBHOOK_SECRET` pour Connect,
`STRIPE_WEBHOOK_BOUTIQUE_SECRET` pour Boutique — isolation vérifiée, test dédié).

Cas testés (existants + 3 ajoutés par cette session dans `src/lib/stripe.test.ts`, tous vitest,
tous verts) :

| Cas | Résultat attendu | Statut |
|---|---|---|
| Signature valide | acceptée | ✅ préexistant |
| Contenu altéré après signature | refusée | ✅ préexistant |
| Signature trop ancienne (timestamp > 300 s) | refusée | ✅ préexistant |
| Secret Connect utilisé pour vérifier un événement signé avec le secret abonnement | refusée (isolation) | ✅ préexistant |
| **Signature absente (`null`)** | refusée | ✅ **ajouté par cette session** |
| **Secret non configuré (`STRIPE_WEBHOOK_SECRET=""`)** | refusée | ✅ **ajouté par cette session** |
| **En-tête malformé (ni `t=`, ni `v1=`)** | refusée | ✅ **ajouté par cette session** |

Aucun bypass de signature identifié. Le contrôle mode test/live (§7) est **indépendant** de la
signature — une signature valide n'implique pas que l'événement est du bon mode, exactement le
scénario que le §7 ferme.

---

## 7. MODE (`STRIPE_WEBHOOK_EXPECTED_MODE`)

**Constat fait pendant cette mission, indépendamment du rapport rouge-équipe V3** : le webhook
Stripe Connect (`src/app/api/stripe/webhook/route.ts`) **n'avait aucun contrôle de mode**,
contrairement aux webhooks Boutique et abonnement qui l'appliquent déjà via
`resoudreModeStripeWebhook()` (`src/lib/stripe-webhook-environment.ts`, fail-closed : configuration
absente/vide/invalide → 503, mode reçu ≠ mode attendu → 503). Un événement Live délivré à un
déploiement Preview/Test (ou l'inverse) était donc traité par la route Connect sans aucun garde —
la signature ne protège pas de ce cas (chaque mode a sa propre paire de clés, mais un endpoint mal
recâblé reste correctement signé).

**Corrigé dans cette session** : le même contrôle, verbatim, ajouté à la route Connect
(`src/app/api/stripe/webhook/route.ts`), avec 3 nouveaux tests vitest (`route.test.ts`) :
mode Live reçu en contexte Test → 503, mode Test reçu en contexte Live → 503, configuration
absente/vide/invalide → 503, dans tous les cas **aucune RPC appelée**. Les 3 webhooks Stripe du
dépôt (Connect, Boutique, abonnement) partagent désormais exactement le même contrat de mode.

---

## 8. TENANT ISOLATION

Fixture standard du dépôt (`supabase/tests/fixtures/isolation_multitenant.inc`) : entreprise A
(`a0000000-...-01`) et entreprise B (`b0000000-...-01`), chacune avec son propre compte Stripe
Connect simulé (`acct_test_A` / `acct_test_B`).

Attaques testées réellement (RPC appelée, effet vérifié en base) :

| Attaque | Résultat |
|---|---|
| Événement Connect annonçant `p_entreprise_id = B` pour une facture réellement possédée par A | `'ignoree'`, aucune écriture (test pgTAP #21) |
| Compte Connect émetteur (`p_compte_stripe`) ne correspondant pas au compte de l'entreprise réellement propriétaire de la facture (confused deputy Connect) | `'ignoree'`, aucune écriture (test #22-23) |
| Identifiant de session Checkout forgé/rejoué (`p_checkout_id` incorrect) | `'ignoree'` (test #24) |
| `authenticated` d'une entreprise réelle appelant directement la RPC Connect | `permission denied` (42501), avant même la logique métier (test #11) |

Aucune écriture cross-tenant observée dans aucun des scénarios. La RPC ne fait confiance à aucune
combinaison partielle de `(facture_id, entreprise_id, checkout_id, compte_stripe)` — les 4 doivent
concorder simultanément.

---

## 9. SERVICE ROLE

Témoins positifs et négatifs réels (requête catalogue **et** exécution réelle, pas seulement
`has_function_privilege`) :

| Témoin | Résultat |
|---|---|
| **Négatif** — `authenticated` INSERT direct dans `stripe_webhook_events` | `permission denied` |
| **Négatif** — `anon` INSERT direct dans `stripe_webhook_events` | `permission denied` |
| **Négatif** — `authenticated` appelle `stripe_connect_encaisser_facture_service` | `permission denied` |
| **Négatif** — `authenticated` appelle `boutique_expirer_commande_service` | `permission denied` |
| **Positif** — `service_role` INSERT dans `stripe_webhook_events` | réussit |
| **Positif** — `service_role` appelle les 3 nouvelles RPC avec des paramètres légitimes | réussit, effet correct |
| **Négatif (moindre privilège)** — `service_role` tente un `SELECT` direct sur `stripe_webhook_events`/`factures`/`boutique_commandes` | `permission denied` — **volontaire** : le correctif ne redonne que l'`INSERT` par colonne nécessaire, jamais de lecture directe |

Le dernier témoin (moindre privilège de `service_role` lui-même) est important : cette session a
vérifié que son propre correctif **n'élargit pas** l'accès de `service_role` au-delà du strict
nécessaire — `service_role` reste incapable de lire directement les tables métier, exactement
comme le reste de l'ACL canonique issue de la 255.

---

## 10. IDEMPOTENCE

Deux couches distinctes, testées séparément :

**Couche 1 — idempotence de l'effet métier de la RPC** (indépendante de la couche 2) : rejouer
`stripe_connect_encaisser_facture_service` avec les **mêmes** paramètres (même session Checkout)
n'insère qu'un seul paiement (`paiements.stripe_session_id` UNIQUE, `ON CONFLICT DO NOTHING`),
vérifié par appel réel double (test pgTAP #16-#17, montant inchangé). **Cette couche fonctionne
correctement, avant et après ce correctif.**

**Couche 2 — dé-duplication au niveau `stripe_webhook_events`** (le réservoir que les deux routes
interrogent en premier) : **fonctionne pour le cas nominal** — un événement déjà reçu **et déjà
traité avec succès** est rejoué → `23505` → la route répond `{duplicate:true}` sans retraiter
(test pgTAP #14).

**Résidu confirmé, non corrigé, D3** (DECISION_REQUIRED-04) : la réservation (`INSERT` dans
`stripe_webhook_events`) est une écriture **autonome**, commitée avant même que le traitement
métier ne commence — elle n'est **pas** dans la même transaction que l'appel RPC qui suit. Si le
traitement échoue **après** la réservation (panne réseau vers l'API Stripe côté reconciliation,
erreur RPC transitoire, timeout serverless, redémarrage), la route répond 500, mais la ligne de
réservation reste en base. Un retry Stripe du même `event.id` (Stripe retente automatiquement
jusqu'à 3 jours) percute alors la contrainte `UNIQUE` sur `stripe_webhook_events.id`, et la route
répond `{duplicate:true}` **sans avoir jamais traité l'événement**. Stripe considère l'événement
livré et cesse ses tentatives : la facture reste impayée dans ELSATIA alors que le client a payé,
silencieusement.

**Démontré réellement** (pas seulement affirmé), pgTAP tests #31-32 : réservation de
`evt_closure_d3_witness` → succès ; second `INSERT` du même identifiant (simulant le retry après
un échec de traitement intercalaire) → `duplicate key value` (23505), exactement l'issue décrite
ci-dessus. Confirmé aussi par requête manuelle isolée (transaction séparée, §annexe).

Ce résidu était **déjà identifié et déjà classé comme « lot de sécurité distinct »** par la
session du 2026-09-11 (`docs/audit/ELSATIA_SERVICE_ROLE_FLUX_ACL_V1.md`, « Constats annexes » #2,
décision D3), avec les invariants exacts qu'un correctif futur doit respecter (retry après échec
possible, idempotence après succès, journalisation de l'échec, aucun double effet métier). Cette
mission **confirme** ce résidu par test réel plutôt que de le renverser sans levier
supplémentaire : le modèle à reprendre existe déjà dans le dépôt et fonctionne
(`reserver_evenement_abonnement_service` / `finaliser_…` / `annuler_…`, migration
`20260904000262`, webhook abonnement) — voir §17 REMOTE_ACTION_REQUIRED pour la recommandation
concrète.

---

## 11. ORDERING

- **Événements concurrents du même `event.id`** : garanti par la contrainte `UNIQUE` Postgres
  au niveau moteur, indépendamment de l'ordre d'arrivée réseau — un seul `INSERT` gagne, l'autre
  lève `23505` immédiatement (pas de fenêtre de course observable, testé par insertion
  successive dans la même transaction ; le comportement `UNIQUE` de Postgres garantit
  l'atomicité même sous connexions concurrentes réelles).
- **`checkout.session.completed` puis rejeu du même événement** : testé (§10, couche 1),
  idempotent.
- **Événements Connect vs Boutique sur la même table `stripe_webhook_events`** : les deux
  webhooks partagent la même clé primaire (`id` = identifiant d'événement Stripe, globalement
  unique côté Stripe quel que soit le produit) — aucune collision possible entre un événement
  Connect et un événement Boutique.
- **`succeeded` puis `expired` du même `checkout_id`** : non applicable en pratique côté Stripe
  (un `checkout.session` ne peut pas passer de `completed` à `expired` — Stripe ne réémet jamais
  ces deux événements pour la même session dans cet ordre), mais la RPC d'expiration
  (`boutique_expirer_commande_service`, `stripe_connect_expirer_checkout_facture_service`)
  restreint son `UPDATE` par une clause `WHERE statut = 'en_attente_paiement'` — testé (pgTAP
  #29-30) : appeler l'expiration sur une commande déjà `payee` est un no-op silencieux, **jamais**
  une régression de `payee` vers `expiree`, quel que soit l'ordre d'arrivée réel.
- **Non testé** : réordonnancement à l'échelle du réseau HTTP (deux requêtes webhook simultanées
  frappant deux workers Next.js différents) — hors de portée d'un test pgTAP en session unique ;
  couvert indirectement par la garantie `UNIQUE` au niveau base, qui est le seul point de
  convergence réel entre les deux requêtes.

---

## 12. FAILURE INJECTION

| Scénario | Résultat observé |
|---|---|
| Réservation d'événement réussit, traitement métier échoue ensuite | **Résidu D3 confirmé** — voir §10. Retry ultérieur avalé comme duplicate, aucun retraitement. |
| RPC Connect échoue (`error` renvoyé par PostgREST) | Route répond 500 (`"Synchronisation impossible"`) plutôt que d'avaler l'erreur en silence — comportement déjà correct, préexistant (test vitest `route.test.ts`, "répond 500 au lieu de réussir en silence") |
| Confused deputy (tenant, compte Connect, session Checkout) | RPC renvoie `'ignoree'` (succès applicatif, aucune écriture) — la route répond 200 dans ce cas car ce n'est pas une panne technique mais un événement légitimement ignoré (identifiant non-UUID, etc., comportement inchangé) |
| Montant annoncé par Stripe supérieur au reste dû (falsification ou bug amont) | Encaissement accepté mais **plafonné** au reste dû réel (`least(...)`), jamais au montant annoncé — testé (pgTAP #25-26) |

Le cas « la réponse elle-même échoue après un traitement métier réussi » (bogue serverless,
coupure réseau juste avant l'envoi de la réponse HTTP 200) reproduit exactement le scénario D3
côté Stripe (il retentera), et le comportement de ELSATIA est identique : le retraitement sera
avalé comme duplicate. Documenté avec le reste du résidu D3, pas testé séparément (même cause
racine, même correctif recommandé).

---

## 13. CONNECT ACCOUNT VALIDATION

Voir §4 et §8. `evenement.account` (posé par Stripe, jamais falsifiable côté client puisqu'il fait
partie du corps signé) est confronté à `entreprises.stripe_account_id` **à l'intérieur de la RPC**
avant toute écriture. Testé par témoin confused-deputy réel (§8, test pgTAP #22-23) : compte
Connect incorrect → `'ignoree'`, zéro écriture. Aucune voie de confused deputy identifiée où un
compte Connect A pourrait faire encaisser une facture de l'entreprise B.

---

## 14. FIX

**Fichier** : `supabase/migrations/20260922000324_stripe_connect_boutique_webhook_closure_v1.sql`
(additif, 315ᵉ migration, aucune migration existante modifiée).

| Changement | WHY | SECURITY PROPERTY | TEST BEFORE | TEST AFTER |
|---|---|---|---|---|
| `GRANT INSERT (id, event_type, livemode, facture_id) ON stripe_webhook_events TO service_role` | La 255 a retiré tout privilège de table à `service_role` sans jamais restaurer l'`INSERT` nécessaire à la dé-duplication webhook — root cause du P1 | Moindre privilège strict : `INSERT` sur 4 colonnes précises seulement, ni `SELECT` ni `UPDATE` ni `DELETE` — le journal reste immuable en écriture seule | `permission denied for table stripe_webhook_events` (42501), reproduit réellement (§1, pgTAP avant-correctif) | `INSERT` réussit pour `service_role` ; `authenticated`/`anon` toujours refusés ; `SELECT` toujours refusé même à `service_role` (pgTAP #1-3) |
| `CREATE FUNCTION stripe_connect_encaisser_facture_service(...)`, `SECURITY DEFINER`, `service_role` seul | Fonction absente de toute migration appliquée alors que la route l'appelle — repris à l'identique du `.proposed` déjà validé (148 assertions, PostgREST réel, E2E, le 2026-09-11) | Vérifie tenant + compte Connect + session Checkout simultanément (fail-closed), montant plafonné au reste dû, `SECURITY DEFINER` réservé à `service_role` | `function ... does not exist` | Encaissement légitime réussit, 4 scénarios de confused deputy/forgerie tous `'ignoree'` sans écriture (pgTAP #15, #21-26) |
| `CREATE FUNCTION stripe_connect_expirer_checkout_facture_service(...)`, `service_role` seul | Idem | Même schéma, `WHERE` scopé par `facture_id` + `stripe_checkout_id` | `function ... does not exist` | Fonction disponible, `service_role` seul (pgTAP #5, #8) |
| `CREATE FUNCTION boutique_expirer_commande_service(...)`, `service_role` seul | Fonction absente, résidu déjà noté par le rapport rouge-équipe V3 (§2, REDTEAM-V3-03) | `WHERE statut = 'en_attente_paiement'` : ne peut jamais régresser une commande `payee` vers `expiree` | `function ... does not exist` | Expiration légitime réussit ; no-op silencieux sur une commande déjà payée, jamais de régression (pgTAP #27-30) |
| **(code, hors migration)** `resoudreModeStripeWebhook()` ajouté à `src/app/api/stripe/webhook/route.ts` | Gap trouvé indépendamment pendant cette mission (§7) : seul le webhook Connect n'avait aucun contrôle de mode test/live, contrairement à ses 2 webhooks jumeaux | Fail-closed : configuration absente/vide/invalide → 503, mode reçu ≠ mode attendu → 503, avant toute écriture | Aucun contrôle — un événement Live traité par une Preview Test (ou l'inverse) l'aurait été sans garde | 3 nouveaux tests vitest verts (503 dans les 2 sens + config invalide), 0 régression sur les 12 tests existants du fichier |

Ce qui n'a **volontairement pas** été touché (portée du titre de la mission, DECISION_REQUIRED-03) :
les 8 autres flux cassés par la même migration 255 (paie, relances, Powens, retour bancaire, push,
journal d'activité, comptage abonnement) — toujours cassés, toujours documentés dans
`docs/audit/ELSATIA_SERVICE_ROLE_FLUX_ACL_V1.md`, à reprendre dans un lot dédié (§17).

---

## 15. MIGRATIONS

- **Additive**, numéro unique (`20260922000324`, suite immédiate de `20260922000323`), aucune
  migration existante modifiée.
- **Fresh** : validé par le rejeu complet 314→315 migrations sur base vierge (§0, §16).
- **Upgrade** : validé — la migration s'applique proprement sur la base rejouée à 314 migrations
  (état de production simulé).
- **Rollback logique documenté** : en pied de fichier, dans l'ordre inverse (retirer les 3
  fonctions puis le `GRANT`), avec la même mise en garde que le `.proposed` original : à
  n'exécuter qu'après avoir retiré le code applicatif qui les appelle.
- **Grants explicites** : `DO $$ ... REVOKE ALL ... FROM public, anon, authenticated; GRANT
  EXECUTE ... TO service_role; ... $$` — même schéma que `20260904000262`
  (webhook abonnement) et `20260922000323` (correctif rouge-équipe déjà en place).

---

## 16. PGTAP

**Nouveau fichier** : `supabase/tests/stripe_connect_boutique_webhook_closure_v1.test.sql`,
**32 assertions**. Couvre : grants de table (colonne par colonne), existence + grants des 3
fonctions, témoins négatifs (`authenticated` refusé sur les 3 surfaces), témoins positifs
(chemin `service_role` complet), 2× confused deputy (tenant, compte Connect), session Checkout
invalide, plafonnement du montant, idempotence par session Checkout (rejeu), expiration Boutique
(positif + no-op sur commande payée), et le résidu D3 caractérisé explicitement (§10).

**Comparaison A/B, méthodologie identique à celle de la session red-team V3** (rejeu complet
deux fois, comparaison fichier par fichier des compteurs `ok`/`not ok`, script automatisé) :

| | Avant (314 migrations) | Après (315 migrations) |
|---|---|---|
| Fichiers pgTAP exécutés | 96 | 96 |
| Fichiers avec un compte `ok`/`not ok` identique avant/après | — | **95 / 95** (100 %) |
| Fichiers avec un compte différent | — | **1** — le nouveau fichier de cette session |
| Assertions du nouveau fichier | 6 exécutées (2 ok, 4 not ok) puis transaction avortée (`function ... does not exist`) — reproduction pgTAP formalisée du blocker | **32/32 ok** |
| Assertions des 95 fichiers pré-existants | 2 144 ok + 82 not ok (2 226 total) | **2 144 ok + 82 not ok (2 226 total) — identique** |

**Zéro régression** sur les 95 fichiers pré-existants (comptes strictement identiques, pas
seulement « pas de nouvelle erreur » — le nombre exact d'`ok` et de `not ok` ne bouge pas d'une
seule assertion). Les 82 `not ok` pré-existants sont des gaps de fidélité du harnais reconstruit à
la main (§0.1), présents à l'identique avant et après ce correctif, aucun lié à Stripe
Connect/Boutique (vérifié fichier par fichier, §0.1).

Comparaison avec la référence de la session red-team V3 (2 202 assertions, 95 fichiers, autre
reconstruction manuelle du harnais, le 2026-09-21) : du même ordre de grandeur
(2 226 assertions sur les mêmes 95 fichiers pré-existants dans cette reconstruction), écart
attribuable à une reconstruction de harnais indépendante et à 1 migration supplémentaire
(`20260922000323`, déjà comptée dans les deux bases de départ de cette mission) — pas une
divergence de méthode.

---

## 17. UNIT / INTEGRATION TESTS

`src/app/api/stripe/webhook/route.test.ts` (Connect) : 15 tests (12 préexistants + 3 nouveaux
pour le contrôle de mode), tous verts. `src/app/api/stripe/boutique/webhook/route.test.ts` :
5 tests préexistants (contrôle de mode déjà en place), tous verts, non modifié. `src/lib/
stripe.test.ts` : 8 tests (5 préexistants + 3 nouveaux pour la signature absente/secret
manquant/en-tête malformé). Aucun appel réseau réel vers Stripe : `verifierSignatureStripe` et
`createAdminClient` sont mockés à la frontière externe exacte, toute la logique interne (parsing,
branchement par type d'événement, appel RPC avec les paramètres exacts, gestion d'erreur)
s'exécute réellement.

**Suite complète** : `npx vitest run` → **1 792/1 792 tests, 153/153 fichiers**, 0 échec.
`npx tsc --noEmit` → 0 erreur. `npx eslint` sur les 3 fichiers modifiés → 0 erreur/avertissement.

---

## REMOTE_ACTION_REQUIRED

Rien de bloquant pour fermer le P1 localement. Pour une Preview/Production réelle :

1. **Revalider `STRIPE_WEBHOOK_EXPECTED_MODE`** est bien positionné (`test` en Preview, `live` en
   Production) pour les **3** endpoints webhook Stripe (Connect, Boutique, abonnement) — le
   contrôle est désormais uniforme mais dépend d'une variable d'environnement correctement
   posée par le déploiement, hors de portée de cette session (aucune vraie Preview accédée).
2. **Rejouer les événements Stripe Test réels** (`stripe listen` / `stripe trigger`) contre un
   déploiement de Preview après intégration — cette session n'a signé aucun événement avec un
   vrai secret Stripe (aucune clé fournie, conforme à la mission).
3. **Lot dédié D3** (idempotence retry-après-échec, §10) : reprendre le modèle
   `reserver_evenement_abonnement_service` / `finaliser_…` / `annuler_…` (migration
   `20260904000262`) pour `stripe_webhook_events`, avec une colonne de statut
   (`reserve`/`traite`/`echec`) et un `annuler_evenement_webhook_service` appelé par la route en
   cas d'erreur RPC avant de répondre 500 — permettrait un retry Stripe réel plutôt qu'un
   duplicate silencieux. Non fait ici : décision déjà prise le 2026-09-11 par une session dédiée
   avec le même contexte (« lot de sécurité distinct »), confirmée plutôt que renversée sans
   levier supplémentaire (DECISION_REQUIRED-04).
4. **Lot dédié flux non-Stripe** : les 8 autres flux cassés par la migration 255 (paie, relances,
   Powens, push, journal d'activité, comptage abonnement) restent ouverts, hors périmètre de
   cette mission — le contenu technique existe déjà dans
   `docs/migrations-proposees/service-role-flux-acl-v1.sql.proposed` (sections 2, 5-8), prêt à
   être numéroté après revue de non-régression sur les 60 migrations ajoutées depuis sa
   conception.
5. **`boutique_expirer_commande_service` fermera une lacune fonctionnelle** (commandes
   `en_attente_paiement` qui ne passaient jamais à `expiree`) : vérifier qu'aucun job/rapport
   existant ne dépendait implicitement de ce comportement cassé (peu probable, la fonctionnalité
   Boutique est décrite comme « masquée par le flag et le catalogue vide » par le rapport
   rouge-équipe V3, §2 REDTEAM-V3-03).

## RESIDUAL RISKS

| ID | Sévérité | Résumé | Statut |
|---|---|---|---|
| D3 | P1 (fonctionnel/intégrité, pas une élévation de privilège) | Un événement webhook dont le traitement échoue après réservation est perdu silencieusement au retry Stripe suivant | Documenté, testé réellement (§10, §12), non corrigé (décision confirmée) |
| RT-V3-P2-01, P2-02, P3-01, P3-02, P3-03 | P2/P3 | Résidus déjà documentés par le rapport rouge-équipe V3, hors périmètre Stripe Connect/Boutique | Inchangés, non retouchés par cette mission |
| 8 flux non-Stripe cassés par la 255 | P1 fonctionnel (paie, relances, Powens, push) | Toujours cassés | Documenté depuis le 2026-09-11, hors périmètre explicite de cette mission |
| Harnais de test local (§0.1) | N/A (limite d'outillage, pas une faille produit) | 2 migrations non rejouables (`pgsodium`), 2 gaps de fidélité mineurs, 15 fichiers pgTAP avec échecs pré-existants non liés à Stripe | Documenté, identique avant/après ce correctif |

---

## Verdict

```
STRIPE WEBHOOK BLOCKER CLOSED LOCALLY
```

Justification : le blocker P1 (« webhooks Stripe Connect et Boutique cassés end-to-end depuis la
migration 255 ») est reproduit réellement AVANT correctif (requête manuelle **et** pgTAP), fermé
par un correctif additif minimal repris du lot déjà conçu et validé le 2026-09-11 pour la partie
encore nécessaire, revérifié par témoins positifs et négatifs réels (attaque `authenticated`
BLOCKED, cross-tenant BLOCKED, confused deputy compte Connect BLOCKED, chemin `service_role`
légitime PASS), sans aucune régression détectée sur 95 fichiers / 2 226 assertions pgTAP
pré-existants ni sur 1 792 tests vitest. Un gap indépendant (contrôle de mode absent sur le
webhook Connect) trouvé et fermé dans le même mouvement. La D3 (idempotence retry-après-échec)
reste un risque résiduel **confirmé par test réel**, documenté avec un plan de correctif concret,
non corrigé par décision délibérée cohérente avec une analyse antérieure de même contexte.

**Non affirmé** : aucune qualification Preview ou Production — cette session n'a touché aucun
environnement réel, aucune clé Stripe réelle, aucune base Supabase distante. Seule la branche de
mission `claude/affectionate-heisenberg-gzh1sq` a été poussée.

---

## Annexe A — Harnais de test local

Script de bootstrap (non versionné, local à cette session, ~150 lignes) :
schémas `auth`/`storage`/`extensions`, rôles `anon`/`authenticated`/`service_role`,
`auth.uid()/role()/email()/jwt()` lisant les GUC `request.jwt.claim.*` (miroir du comportement
PostgREST), tables minimales `auth.users` (avec `instance_id`, `email_confirmed_at` ajoutés en
cours de session pour la fixture standard du dépôt) et `auth.mfa_factors`, `storage.buckets`/
`storage.objects` avec les colonnes réelles (`file_size_limit`, `allowed_mime_types`, etc.),
`pgcrypto`/`pgtap`/`pg_trgm`/`unaccent`. PostgreSQL 16 natif (`service postgresql start`), pgTAP
1.3.2 (`apt-get install postgresql-16-pgtap`). Deux bases construites pour la comparaison A/B :
`elsatia_harness` (314 migrations, sans `20260922000324`) et `elsatia_after` (315 migrations,
avec). Logs de rejeu et sorties pgTAP complètes conservés dans le répertoire de travail temporaire
de cette session (non versionnés, non poussés).
