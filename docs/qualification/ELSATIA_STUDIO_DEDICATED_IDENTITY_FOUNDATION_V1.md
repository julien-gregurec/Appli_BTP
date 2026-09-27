# ELSATIA Studio — Supabase dédié + fondation d'identité signée V1

Date : 2026-09-26 · Branche : `claude/sweet-lovelace-jsjh31` · Décision appliquée : **B + I1**
(`docs/architecture/ELSATIA_STUDIO_SUPABASE_OWNER_DECISION_V1.md`).

**Aucun déploiement, aucun projet Supabase distant créé, lié ou interrogé.** Tout est prouvé sur
une pile locale reproductible : deux clusters PostgreSQL 16 distincts (un par « projet »), deux
GoTrue **v2.192.0** compilés depuis les sources, deux PostgREST v12.2.3, et l'application Studio
réelle (`next build` + `next start`).

## Verdict

```
STUDIO DEDICATED FOUNDATION LOCALLY QUALIFIED
```

Le POC est transformé en fondation : un paquet partagé `@elsatia/identity`, deux migrations
(projet partagé / projet Studio), les routes GP (émission) et Studio (échange, session, révocation,
réconciliation), sans réécrire Studio. **64/64 tests d'identité passent, trois exécutions
consécutives**, dont 24 contre les vrais GoTrue/PostgREST/PostgreSQL et 3 contre l'application
Studio construite. Aucune régression : GP 1850/1850, Studio 275/275, deux builds de production OK.

Ce qui reste hors périmètre local (réglages hébergés, portage des migrations métier Studio, purge
RGPD des données Studio d'un compte supprimé, UI de liaison) est listé au §13 : ce sont des tâches
de mise en service, pas des blocages de la fondation.

---

## 1. Base

Lus (sans refaire l'analyse) : le dossier de décision, la page de décision propriétaire, le POC
`docs/architecture/poc/studio-dedicated-identity-exchange/` (32/32). La branche a été avancée sur
le tronc `integration/elsatia-canonical-train-v1` (descendant strict de `main`) parce que
`apps/studio` n'existe que là. Le POC est marqué « remplacé » et n'est plus étendu.

## 2. Architecture de production

```
Projet PARTAGÉ (GP, identité centrale)                    Projet DÉDIÉ Studio
────────────────────────────────────────                  ─────────────────────────────────────────
auth.users (source de vérité du compte ELSATIA)           auth.users Studio (dérivés, sans mot de passe)
 └ trigger ban / déban / suppression ──► outbox            schéma privé studio_identity :
GET /identity/studio/handoff  (clé PRIVÉE ES256)             consumed_handoffs · subject_state · links
GET /api/elsatia-identity/jwks (clés PUBLIQUES)              lifecycle_events · sessions
POST /api/cron/elsatia-identity (outbox → webhook) ──────► POST /api/elsatia/lifecycle
                                                           GET  /auth/elsatia/start   (cookie + nonce)
navigateur : POST auto-soumis du jeton ──────────────────► POST /auth/elsatia/exchange (session GoTrue)
                                                           GET  /auth/elsatia/signout
                                                           POST /api/elsatia/reconcile
```

| Composant | Où | Rôle |
|---|---|---|
| **Central identity** | `supabase/migrations/20260926000347_elsatia_identity_broker.sql`, `src/lib/elsatia-identity/config.ts` | `auth.users` reste l'unique compte. RPC atomique `elsatia_identity_prepare_handoff` (séquence lue AVANT l'état du compte), sujets par audience, outbox transactionnelle alimentée par trigger. |
| **Émission (handoff)** | `src/app/identity/studio/handoff/route.ts` | Session GP vérifiée en ligne (`getUser`), état relu en base (le ban n'est pas visible par `GET /user`), décision d'accès, jeton 60 s, POST auto-soumis vers une URL **configurée** (jamais tirée de la requête). CSP `form-action` élargie à l'origine Studio sur cette seule route. |
| **Studio identity broker** | `packages/elsatia-identity/src/studio-broker.ts` | Cœur sans dépendance, ports injectés (base, admin Auth, session). |
| **Signed one-time exchange** | `apps/studio/src/app/auth/elsatia/{start,exchange}` | Cookie httpOnly `state` (SameSite=None, 10 min, chemin `/auth/elsatia`) ; seule son empreinte SHA-256 part vers GP. Échange : vérification complète, jti consommé **avant** tout effet. |
| **Studio provisioning** | broker + RPC `studio_identity_*` | Création par la clé service Studio, `app_metadata.elsatia_subject` ; reprise idempotente ; jamais de liaison par e-mail. |
| **Studio session** | `supabaseStudioSessions` + `studio_identity_session_status` | Session émise par GoTrue Studio (`generate_link` + `verifyOtp`), enregistrée ; chaque requête vérifie compte actif + session issue du pont + âge. |
| **Revocation event** | `apps/studio/src/app/api/elsatia/lifecycle` | JWS `elsatia-lifecycle+jwt`, porte l'**état** (pas un delta) + séquence ; ban + suppression des sessions dans la même transaction. |
| **Recovery** | outbox (réessais), `elsatia_identity_resync`, `POST /api/elsatia/reconcile`, revalidation d'âge | Voir §6. |

Invariants : Studio ne détient que des clés **publiques** de la plateforme ; la plateforme ne
détient **aucune** clé Studio ; aucun JWT Supabase n'est forgé ; aucune donnée métier ne traverse.

## 3. Trust contract (v1)

Deux jetons, même format (JWS compact, en-tête fermé `{alg, typ, kid}`), même JWKS, `typ` distincts.

| Champ | Jeton de passage `elsatia-handoff+jwt` | Événement `elsatia-lifecycle+jwt` |
|---|---|---|
| `alg` | `ES256` seul (`none`, `HS256` → `ALG_REJECTED`) | idem |
| `kid` | clé courante du JWKS | idem |
| `ver` | `1` (sinon `BAD_VERSION`) | idem |
| `iss` (issuer) | URL propre à l'environnement (`BAD_ISSUER`) | idem |
| `aud` (audience) | `"studio"`, chaîne unique (tableau refusé) | idem |
| `sub` (subject) | `base64url(SHA-256(iss\|aud\|auth.users.id))` — opaque, par audience et par environnement | idem |
| `iat` / `nbf` / `exp` | TTL 60 s ; tolérance ±30 s ; TTL > 300 s refusé | TTL 300 s, re-signé à chaque tentative |
| `nonce` | SHA-256 du cookie `state` du navigateur d'origine | — |
| `jti` | UUID, **usage unique** | UUID **stable** de l'événement (dédoublonnage) |
| spécifiques | `email`, `email_verified: true` obligatoire, `ent` (décision d'accès), `seq` (dernier événement connu) | `seq` strictement croissant, `account` ∈ active/disabled/deleted, `reason`, `ent` ou null |

Signature forte : ECDSA P-256 / SHA-256 (`node:crypto`, format IEEE-P1363 64 octets), base64url
canonique exigée, jeton ≤ 4096 octets. Codes d'erreur stables (`contract.ts`).

## 4. Replay protection

- `studio_identity.consumed_handoffs(jti uuid primary key)` ; RPC `studio_identity_consume_handoff`
  = `insert … on conflict do nothing` ; appelée **avant** tout effet ; purge après expiration + 1 h.
- Prouvé : même jeton deux fois → OK puis `REPLAY` ; **3 soumissions simultanées réelles → 1 succès,
  2 `REPLAY`** ; 5 simultanées en mémoire → 1/4 ; rejeu par un voleur du cookie via l'app réelle →
  `error_code=REPLAY`.
- Événements : dédoublonnés par `jti` (`duplicate`, 200 idempotent) et ordonnés par `seq` (`stale`).

## 5. Révocation

`ban` **+** suppression des sessions Studio **+** événement signé, testés réellement :

| Mesure (GoTrue réels) | Résultat |
|---|---|
| Ban central seul, sans livraison | session Studio toujours `200` (constat POC R1 reproduit) ; l'événement existe déjà en outbox (transactionnel) ; nouveau passage `ACCOUNT_DISABLED` |
| Ban + livraison | `GET /user` Studio → **403 `session_not_found`** ; refresh → **400** ; `session_status` → `disabled` ; utilisateur Studio banni (`ban_desired=ban_confirmed=true`) ; jeton émis avant la désactivation → `ACCOUNT_DISABLED` ; lien magique direct → refusé |
| Via l'app Studio réelle | page protégée `200` → après webhook, **307 vers /login** |
| Propagation locale | < 5 s de bout en bout (assertion) |
| Appareil | révocation d'une session : A → 403, B → 200 |
| Résiduel | access token valide sans état jusqu'à `exp` pour un appel PostgREST direct : **`jwt_expiry = 600 s`** dans `apps/studio/supabase/config.toml` (3600 s avant). Les routes de l'app, elles, coupent à la requête suivante. |

La suppression des sessions et le changement d'état sont dans **une** transaction
(`studio_identity_apply_lifecycle`) ; le ban GoTrue suit. S'il échoue, l'état suffit déjà à tout
refuser et la réconciliation le rejoue (`ban_drift`, testé).

## 6. Failure recovery

| Panne | Comportement (P = réel, M = mémoire) |
|---|---|
| **Broker down** (identité centrale injoignable) | `PLATFORM_UNAVAILABLE` (P) ; sessions Studio ouvertes : lecture et refresh OK (P). JWKS : cache 5 min, servi périmé ≤ 24 h, relecture unique sur `kid` inconnu (M). |
| **Studio Auth down** | `STUDIO_AUTH_UNAVAILABLE`, aucun lien, jeton consommé, nouveau passage OK au retour (P, M). |
| Base Studio down | `STUDIO_DB_UNAVAILABLE`, rien créé (P) ; webhook → 503 → réessayé. |
| **Provisioning partiel** | crash entre création Auth et lien : 2ᵉ passage reprend l'orphelin (même id, pas de doublon) (P). |
| **Double création concurrente** | deux onglets → **un seul utilisateur Studio** (P). Constat : GoTrue répond 500/23505 que supabase-js rend opaque (« 500 {} ») → le broker relit par e-mail après **tout** échec et n'adopte que le même sujet. Nouveau constat : deux `generate_link` concurrents s'écrasent (un seul jeton par utilisateur) → régénération bornée (4 essais, délai aléatoire). |
| **Notification de révocation perdue** | Studio injoignable → réessais avec recul exponentiel (15 s → 1 h), marqué mort après 30 essais ; livraison au retour → convergence (P). Réconciliation plateforme `resync` : réémet l'état des sujets dont l'état livré diverge (ban temporaire expiré sans trigger : prouvé). Réactivation perdue : le passage suivant porte une `seq` plus récente et réactive + débannit (P). **Borne ultime** : revalidation silencieuse auprès de l'identité centrale après 12 h, session refusée après 24 h (configurables). |
| **Clock skew** | ±20 s OK ; émetteur +45 s → `NOT_YET_VALID` ; jeton expiré de ≤ 30 s accepté, au-delà `EXPIRED` (M). NTP requis. |

## 7. Key rotation

- `ELSATIA_IDENTITY_SIGNING_KEYS = {current, previous?, previous_retire_at?}` (variable **serveur
  GP**, jamais dans le dépôt ; `verify:secrets` : aucun secret reconnu). `current` signe ; `previous`
  est publiée jusqu'à `previous_retire_at` (**≤ 7 jours**, sinon config refusée) puis disparaît.
- Studio : JWKS épinglé (`ELSATIA_IDENTITY_JWKS`) ou publié (`ELSATIA_IDENTITY_JWKS_URL`) ; une
  composante privée dans un JWKS le fait refuser entièrement.
- Procédure : `node packages/elsatia-identity/scripts/keygen.mjs --rotate <config actuelle>` →
  nouvelle `current`, ancienne en `previous` 48 h → déployer GP → (JWKS épinglé : mettre à jour
  Studio dans la fenêtre) → retirer `previous` après la date.
- Prouvé : jeton de l'ancienne clé accepté dans la fenêtre, refusé après retrait (réel) ; relecture
  unique sur `kid` inconnu (mémoire). Tous les tests génèrent leurs clés à l'exécution.

## 8. Database isolation

Deux clusters PostgreSQL distincts, secrets JWT distincts (réel) :

| Essai | Résultat |
|---|---|
| service_role **Studio** → PostgREST **GP** (`gp_isolation_sentinel`) | **401**, aucune donnée |
| service_role **GP** → PostgREST **Studio** (`studio_isolation_sentinel`) | **401**, aucune donnée |
| chaque clé sur son propre projet (témoins) | 200, données lues |
| clés service croisées sur l'admin Auth | 401/403 dans les deux sens ; témoin 200 |
| session utilisateur Studio sur GP (REST et Auth) | refusée |
| base Studio | aucune table GP ni `dblink`/`postgres_fdw` ; base GP sans schéma `studio_identity` |
| RPC d'identité | anon/authenticated → `42501` (sauf `session_status`, lecture de SA session) ; tables outbox fermées même à service_role (RPC seulement) |

Garde statique ajoutée (`apps/studio/tests/boundaries.test.ts`) : `STUDIO_AUTH_SERVICE_KEY` confinée
à `src/lib/identity.ts` (server-only), aucune référence à une clé plateforme dans Studio.

## 9. Account lifecycle

| Compte central | Côté plateforme | Studio converge vers | Preuve |
|---|---|---|---|
| **created** | inscription GP | rien tant que l'utilisateur ne vient pas ; 1ᵉʳ passage : utilisateur + lien (droit requis, CGU Studio publiées) | réel + app réelle |
| **disabled** | ban → trigger → outbox → webhook | état `disabled`, sessions supprimées, ban GoTrue, tout passage refusé | réel + app réelle |
| **reactivated** | déban → événement `active` (ou `resync` si ban temporaire expiré) | ban levé, anciennes sessions **non** ressuscitées, nouveau passage OK | réel |
| **deleted** | suppression → trigger `AFTER DELETE` (sujet conservé) | état `deleted`, sessions coupées, bannie | réel |

Changement d'e-mail central : même utilisateur (lien par sujet), e-mail Studio resynchronisé (M).

## 10. App changes (couches seulement)

- **GP** : route handoff, JWKS, cron de livraison, `next` de connexion limité à `/identity/…`,
  chemins publics du proxy, CSP `form-action` ciblée. Aucun autre comportement changé.
- **Studio** : login (bouton « Continuer avec mon compte ELSATIA » ; plus de mot de passe),
  callback/exchange, session (contrôle dans `getCurrentStudioUser` et `mediaContext`, les deux
  points d'entrée d'identité existants), logout inchangé (`signOut local`), signout forcé,
  révocation, réconciliation, inscription fermée (page et action). Droit retiré : écritures média
  refusées (403), lecture conservée.
- Mode `STUDIO_IDENTITY_MODE` : `elsatia` par défaut (fail-closed) ; `local` (mot de passe) écrit
  uniquement par `scripts/local-test.mjs` pour la CI existante.
- Projet dédié : `apps/studio/supabase/config.toml` (inscription fermée au niveau GoTrue,
  `jwt_expiry` 600 s, 1 Gio) + migration d'identité.

## 11. Tests

| Suite | Contenu | Résultat |
|---|---|---|
| `packages/elsatia-identity/tests/contract.test.ts` | contrat, crypto, expiry, audience, issuer, mauvaise clé, alg/typ/en-tête, TTL, nonce, e-mail, rotation, JWKS distant | 16/16 |
| `…/broker.test.ts` | exchange, replay, concurrence, droits, provisioning partiel, pannes, lifecycle, ordre, réconciliation, outbox | 21/21 |
| `…/real.test.ts` (**GoTrue v2.192.0 ×2, PostgREST ×2, PG16 ×2**) | identity exchange, replay concurrent, expiry / wrong audience / wrong issuer / wrong project key sans effet en base, rotation, e-mail non confirmé, broker down, Studio Auth/DB down, partial provisioning, account link, révocation (ban seul, ban+sessions+événement), réactivation, suppression, notification perdue, resync, réactivation perdue, rejeu d'événement, appareil, isolation ×3 | 24/24 |
| `…/studio-app.e2e.test.ts` (**app Studio `next start`**) | parcours navigateur complet, rejeu, révocation par webhook, 400/401, session hors pont | 3/3 |
| **Total identité** | 3 exécutions consécutives | **64/64 ×3** |
| Studio `npm test` / `typecheck` / `lint` / `build` | dont 5 + 9 nouveaux tests, garde de frontière | 275/275 · OK · OK · OK |
| GP `vitest run` / `typecheck` / `next build` / `verify:migrations` / `verify:secrets` | dont 4 nouveaux tests | 1850 passed, 27 ignorés (réels sans pile) · OK · OK · 329 valides · aucun secret |

Reproduire :

```bash
STACK_BIN=<dossier gotrue+postgrest> packages/elsatia-identity/scripts/local-stack.sh start
source /var/tmp/elsatia-stack/env.sh
npx vitest run packages/elsatia-identity          # 61 (+3 e2e si STUDIO_APP_URL et E2E_* fournis)
packages/elsatia-identity/scripts/local-stack.sh stop
```

## 12. Constats nouveaux (GoTrue v2.192.0)

1. Création concurrente : `500` + 23505 côté GoTrue, **opaque** via supabase-js (`500 {}`) — la
   détection par code ne suffit pas ; relecture par e-mail obligatoire.
2. `generate_link` concurrents pour un même utilisateur : le second invalide le premier.
3. GoTrue exige `search_path=auth` (réglé par Supabase sur son rôle ; à connaître pour tout
   montage hors Supabase).
4. Une page Next qui redirige avant de lire la requête devient **statique** au build (constaté sur
   `/signup`, corrigé) : le mode d'identité doit être lu à l'exécution.

## 13. Reste à faire (mise en service, hors fondation)

1. **Hébergé** : créer les 2 projets Studio ; vérifier sur le plan souscrit que le rôle de migration
   peut créer les triggers sur `auth.users` (précédent : `handle_new_user`) et que les RPC
   `SECURITY DEFINER` peuvent supprimer dans `auth.sessions`.
2. Brancher un **webhook de base Supabase** sur `INSERT elsatia_identity_outbox` →
   `POST /api/cron/elsatia-identity` (latence) + une planification de secours (5-15 min ; limite
   de crons du plan Vercel) ; planifier `POST /api/elsatia/reconcile` côté Studio.
3. Porter les migrations **métier** Studio (9 + lot post-H) dans `apps/studio/supabase/migrations`
   et geler celles de la racine ; scinder `studio_workspace_foundation.test.sql` ; CI double
   (dossier §8.3). Seule la migration d'identité y est aujourd'hui.
4. **RGPD** : compte central supprimé → Studio est coupé et marqué `deleted`, mais ses données
   restent (FK `restrict` vers `auth.users`) ; brancher le flux de suppression post-H sur cet état.
5. Lecture seule (droit retiré) : appliquée aux écritures média ; à étendre aux Server Actions
   (espaces, membres) quand le catalogue Studio existera.
6. `ACCOUNT_LINK_REQUIRED` : pas d'UI de rattachement (aucun compte Studio préexistant dans un
   projet dédié neuf).
7. Amender `ELSATIA_COMMON_ACCOUNT_CONTRACT_V1.md` (exception Studio) ; interdire
   `STUDIO_IDENTITY_MODE=local` en Preview/Production (contrôle de configuration).
