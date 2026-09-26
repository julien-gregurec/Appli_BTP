# POC — Studio dédié + échange d'identité ELSATIA (jeton signé)

> **POC jetable, pas du code de production.** Rien ici n'est importé par une application,
> aucun `package.json`, aucune dépendance. Il sert uniquement de preuve au dossier
> `../../ELSATIA_STUDIO_SUPABASE_DECISION_DOSSIER_V1.md` (§3, §5, §6, §9). Si l'option B est
> retenue, le code réel sera réécrit dans `apps/studio` (et dans l'app qui porte le broker), avec
> ses propres tests, revues et migrations.

## Ce que le POC démontre

Architecture « identité centrale + échange de jeton signé » (dossier §3, architecture I1) :

```
Studio (projet Supabase DÉDIÉ)                 Identité ELSATIA (projet Supabase PARTAGÉ)
─────────────────────────────                  ──────────────────────────────────────────
1. « Continuer avec mon compte ELSATIA »
   nonce aléatoire → cookie httpOnly  ───────▶ 2. session GP vérifiée EN LIGNE (GET /user)
                                                  état du compte relu (admin : banned_until,
                                                  email_confirmed_at) — GET /user répond 200
                                                  pour un banni, d'où cette relecture
                                                  décision d'accès Studio (entitlement)
                                                  JWS ES256, 60 s, aud="studio", nonce, jti
3. POST (form auto-submit) ◀──────────────────   sub = SHA-256(iss|aud|auth.users.id)
4. vérifie : alg épinglé ES256, typ, kid ∈ JWKS,
   iss, aud, exp/nbf (±30 s), TTL ≤ 300 s,
   nonce = cookie, email_verified, jti consommé
   (PostgreSQL, contrainte unique) AVANT tout effet
5. lien sujet→utilisateur Studio
   - absent + droit → admin.createUser (projet Studio),
     app_metadata.elsatia_subject = sub (reprise idempotente)
   - absent + e-mail déjà connu d'un AUTRE sujet → ACCOUNT_LINK_REQUIRED
6. session Studio émise PAR GoTrue Studio :
   admin.generate_link(magiclink) → verifyOtp(token_hash)
   → cookies de session Studio (aucun JWT forgé)

Révocation (webhook signé plateforme → Studio, typ distinct « elsatia-revocation+jwt ») :
   account_disabled/deleted → ban GoTrue Studio + DELETE auth.sessions (toutes)
   account_enabled          → levée du ban (anciennes sessions non ressuscitées)
   entitlement_revoked      → accès lecture seule, session conservée
```

Studio ne détient que la **clé publique** du broker ; le broker ne détient **aucune** clé du
projet Studio. Aucune donnée métier ne circule, seulement identité + décision d'accès.

## Fichiers

| Fichier | Rôle |
|---|---|
| `jws.mjs` | JWS compact ES256 (`node:crypto`), `typ` vérifié (passage ≠ révocation) |
| `broker.mjs` | Émetteur : clés rotatives, JWKS, jeton de passage, événement de révocation |
| `platform.mjs` | Route « identité centrale » adossée au GoTrue du projet partagé |
| `studio.mjs` | Échange, liaison, provisioning idempotent, révocation, anti-rejeu mémoire/PostgreSQL |
| `auth-admin.mjs` | Admin Auth Studio (mémoire / GoTrue réel), client utilisateur, vérif. sans état |
| `harness.mjs` | Montage des tests réels (deux GoTrue) |
| `poc.test.mjs` | Parcours et rejets cryptographiques (lot initial, 9 tests) |
| `revocation.test.mjs` | R1–R8 : révocation mesurée |
| `failure-modes.test.mjs` | F1–F5 : pannes, horloge, doublons, provisioning partiel |
| `security.test.mjs` | S1–S6 : vol, confusion d'environnement/audience, TTL, rayon des clés service |

## Exécution

```bash
# En mémoire (toujours) — 29 tests déclarés, 14 exécutés, 15 ignorés (besoin de GoTrue)
node --test docs/architecture/poc/studio-dedicated-identity-exchange/*.test.mjs

# Réel — 32 tests : deux GoTrue v2.192.0 + PostgreSQL 16 + puits SMTP local
GOTRUE_URL=http://127.0.0.1:59999 GOTRUE_JWT_SECRET=<secret Studio> \
GOTRUE_DB_URL=postgres://supabase_auth_admin:<mdp>@localhost:5432/studio_dedie \
PLATFORM_GOTRUE_URL=http://127.0.0.1:59998 PLATFORM_GOTRUE_JWT_SECRET=<secret plateforme> \
  node --test docs/architecture/poc/studio-dedicated-identity-exchange/*.test.mjs
```

GoTrue réel utilisé (2026-09-26) : `github.com/supabase/auth` tag **v2.192.0** (version
épinglée par le harnais Studio) **compilé depuis les sources** (`go build`, le démon Docker
n'étant pas disponible dans cet environnement), migrations GoTrue réelles (`gotrue migrate`),
deux bases PostgreSQL 16 distinctes (`studio_dedie`, `elsatia_central`).

| Réglage | GoTrue « Studio dédié » (:59999) | GoTrue « plateforme » (:59998) |
|---|---|---|
| `GOTRUE_DISABLE_SIGNUP` | `true` | `false` |
| `GOTRUE_PASSWORD_MIN_LENGTH` | 12 | 6 |
| `GOTRUE_MAILER_AUTOCONFIRM` | `false` | `false` |
| `GOTRUE_JWT_EXP` | 60 s (pour mesurer la fenêtre) | 60 s |
| `GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED` / `…_REUSE_INTERVAL` | `true` / `0` | idem |
| Secret JWT | propre | propre (différent) |

Détail des résultats et constats : dossier §5 (révocation), §6 (pannes), §9 (POC).

## Ce que le POC ne fait PAS (volontairement)

- Pas de route Next.js, pas de cookie réel, pas de formulaire auto-submit : la plomberie HTTP
  du navigateur est décrite, pas codée.
- Liens et cache de droit en mémoire ; anti-rejeu en PostgreSQL réel. Équivalent SQL attendu
  côté Studio :
  `studio_identity_links(platform_subject text primary key, user_id uuid unique references auth.users on delete cascade, linked_at timestamptz)`,
  `studio_handoff_jti(jti uuid primary key, expires_at timestamptz)` (purge périodique),
  `studio_account_entitlements(user_id uuid primary key, granted bool, plan text, account text, valid_until timestamptz, received_at timestamptz)`,
  RPC `studio_revoke_sessions(user_id uuid, session_id uuid default null)` SECURITY DEFINER,
  `EXECUTE` à `service_role` seulement — GoTrue v2.192.0 n'a **aucune** route admin de
  révocation de session.
  Aucun `GRANT` à `authenticated` ; écrits uniquement par les routes d'échange et de webhook.
- Transport du webhook de révocation (file, réessais, ordre) : décrit au dossier §3.5, non codé.
  Le POC appelle `studio.revoke(event)` directement.
- `findByEmail` / `findBySubject` listent les utilisateurs (POC ; en production : index SQL sur
  `raw_app_meta_data->>'elsatia_subject'` et gestion de l'erreur de création concurrente).
