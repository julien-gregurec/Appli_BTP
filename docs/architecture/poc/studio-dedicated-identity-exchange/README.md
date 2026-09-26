# POC — Studio dédié + échange d'identité ELSATIA (jeton signé)

> **POC jetable, pas du code de production.** Rien ici n'est importé par une application,
> aucun `package.json`, aucune dépendance. Il sert uniquement de preuve au dossier
> `../../ELSATIA_STUDIO_SUPABASE_DECISION_DOSSIER_V1.md` (§8). Si l'option B est retenue,
> le code réel sera réécrit dans `apps/studio` (et dans l'app qui porte le broker), avec ses
> propres tests, revues et migrations.

## Ce que le POC démontre

Architecture « broker d'identité + échange de jeton signé » (dossier §4, architecture I1) :

```
Studio (projet Supabase DÉDIÉ)                 Hub compte ELSATIA (projet Supabase PARTAGÉ)
─────────────────────────────                  ────────────────────────────────────────────
1. « Continuer avec mon compte ELSATIA »
   nonce aléatoire → cookie httpOnly  ───────▶ 2. session GP existante (ou login)
                                                  décision d'accès Studio (entitlement)
                                                  JWS ES256, 60 s, aud="studio", nonce, jti
3. POST (form auto-submit) ◀──────────────────   sub = SHA-256(iss|aud|auth.users.id)
4. vérifie : alg épinglé ES256, kid ∈ JWKS,
   iss, aud, exp/nbf (±30 s), TTL ≤ 300 s,
   nonce = cookie, email_verified, jti non rejoué
5. lien sujet→utilisateur Studio (table de liens)
   - absent + droit → admin.createUser (projet Studio)
   - absent + e-mail déjà connu → ACCOUNT_LINK_REQUIRED
6. session Studio émise PAR GoTrue Studio :
   admin.generate_link(magiclink) → verifyOtp(token_hash)
   → cookies de session Studio (aucun JWT forgé)
```

Studio ne détient que la **clé publique** du broker ; le broker ne détient **aucune** clé du
projet Studio. Aucune donnée métier ne circule, seulement identité + décision d'accès.

## Exécution

```bash
# En mémoire (toujours) — 6 tests
node --test docs/architecture/poc/studio-dedicated-identity-exchange/poc.test.mjs

# + contre un vrai GoTrue (projet « Studio dédié » simulé) — 9 tests
GOTRUE_URL=http://127.0.0.1:59999 GOTRUE_JWT_SECRET=<secret local> \
  node --test docs/architecture/poc/studio-dedicated-identity-exchange/poc.test.mjs
```

GoTrue réel utilisé pour la preuve (2026-09-26) : image `supabase/gotrue:v2.192.0` (la version
épinglée par le harnais Studio), PostgreSQL 16 natif, `GOTRUE_DISABLE_SIGNUP=true`,
`GOTRUE_PASSWORD_MIN_LENGTH=12`, `GOTRUE_MAILER_AUTOCONFIRM=false`. Commande exacte et
résultats : dossier §8.

## Couverture

| # | Scénario | Mémoire | GoTrue réel |
|---|---|---|---|
| 1 | 1ʳᵉ connexion : utilisateur Studio créé, lié, session émise | PASS | PASS |
| 2 | 2ᵉ connexion avec e-mail modifié côté plateforme → même utilisateur Studio (clé = sujet) | PASS | PASS |
| 3 | Compte Studio préexistant, même e-mail → refus `ACCOUNT_LINK_REQUIRED` ; rattachement explicite (session Studio + jeton) puis connexion | PASS | PASS |
| 4 | Rejets : signature altérée (plan forgé), `aud`, `iss`, expiré, nonce, `email_verified=false`, droit absent, émetteur inconnu, `alg=none`, confusion `HS256`, rejeu `jti` ; aucun compte créé | PASS | — (logique pure) |
| 5 | Rotation de clé : nouveau `kid` accepté après relecture JWKS, `kid` retiré refusé | PASS | — |
| 6 | Droit retiré : compte conservé, accès `read_only`, jamais supprimé | PASS | — |

## Ce que le POC ne fait PAS (volontairement)

- Pas de route Next.js, pas de cookie réel, pas de formulaire auto-submit : la plomberie HTTP
  du navigateur est décrite, pas codée.
- Stores (anti-rejeu, liens, cache de droit) en mémoire. Équivalent SQL attendu côté Studio :
  `studio_identity_links(platform_subject text primary key, user_id uuid unique references auth.users on delete cascade, linked_at timestamptz)`,
  `studio_handoff_jti(jti text primary key, expires_at timestamptz)` (purge périodique),
  `studio_account_entitlements(user_id uuid primary key, granted bool, plan text, valid_until timestamptz, received_at timestamptz)` —
  sans aucun `GRANT` à `authenticated`, écrits uniquement par la route d'échange (service_role Studio).
- Pas de synchronisation push des droits (webhook de révocation) : le droit est rafraîchi à
  chaque échange ; le push est décrit au dossier §3.5.
- `findByEmail` liste les utilisateurs (acceptable pour un POC ; en production : lookup par la
  table de liens + gestion de l'erreur `email_exists` à la création).
