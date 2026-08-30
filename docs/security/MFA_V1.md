# MFA-V1 — Enrôlement TOTP & challenge AAL2

Lot : `feat(auth): add TOTP MFA enrollment and AAL2 challenge`
Périmètre : ELSATIA Gestion Pro + ELSATIA Colors. **Aucune modification Supabase /
Auth distante, aucune migration, aucun enrôlement réel, aucun déploiement.**

## 1. Pourquoi ce lot

La couche PostgreSQL exige déjà `aal = aal2` pour toutes les opérations plateforme
sensibles (`public.plateforme_exiger_session_aal2()`, migration
`20260826000237_platform_aal2_role_integrity_v1.sql`), et `plateforme_activer_admin`
exige en plus que le **compte cible** possède une ligne `auth.mfa_factors` avec
`status = 'verified'`. Or aucun écran applicatif ne permettait jusqu'ici :

- d'enrôler un facteur TOTP ;
- d'élever une session `aal1 → aal2` après le mot de passe.

Ce lot ajoute la partie front manquante.

## 2. Architecture retenue

| Élément | Choix | Raison |
| --- | --- | --- |
| Enrôlement (`/mon-espace/securite`) | **navigateur** (`@/lib/supabase/client`) | Le secret, le QR code et la clé manuelle ne transitent jamais par le serveur ni par ses logs. |
| Challenge post-login (`/login/mfa`, GP + Colors) | **action serveur** | Permet la limite anti-bruteforce Postgres et les tests unitaires ; le code à 6 chiffres est validé côté serveur et jamais journalisé. |
| Redirection post-MFA | GP : `destinationInterneSure` (`src/lib/security/redirects.ts`). Colors : helper centralisé dédié `apps/colors/src/lib/securite/redirections.ts` (`destinationInterneSure`, repli `/dashboard`), utilisé par `actions.ts`, `actions-mfa.ts`, `login/mfa/page.tsx` et `auth/callback/route.ts`. | Empêche toute redirection ouverte. Le helper Colors rejette URL absolue, `//host`, antislash brut/encodé, séparateur encodé (y c. double encodage), caractères de contrôle bruts/encodés, identifiants d'URL et décodage invalide ; il conserve query et hash internes. L'ancienne garde en ligne `startsWith('/') && !startsWith('//')` était insuffisante (ex. `/\evil.com`) et a été supprimée des flux concernés. |
| Limite anti-bruteforce GP | `politiquesRateLimitPour("/login/mfa")` (clé `auth:mfa`, proxy) **+** `appliquerRateLimit` clé `auth:mfa:tentative` (5 / 300 s / utilisateur, + IP) dans l'action | Double budget, compteurs distincts. |
| Limite anti-bruteforce Colors | `apps/colors/src/lib/rate-limit-mfa.ts` → empreinte **HMAC-SHA256** (secret serveur `RATE_LIMIT_HMAC_KEY`, comme GP) puis RPC partagée `consommer_rate_limit` (clé `colors:mfa`, 5 / 300 s / **portée utilisateur**), fail-closed (secret absent en prod, erreur RPC, exception → refus). | Colors n'avait pas de module de limitation. |

### Portée des identifiants de rate limiting

- La **portée `utilisateur`** s'appuie sur l'`id` Supabase issu de la session vérifiée
  (`getUser()`), non falsifiable : c'est l'autorité pour les quotas MFA. Le limiteur
  Colors n'utilise **que** cette portée.
- La **portée `ip`** de Gestion Pro dérive de l'en-tête `x-forwarded-for` (premier
  segment). Elle n'est fiable que derrière un proxy de confiance qui réécrit cet
  en-tête ; un client direct peut le falsifier. Elle vient donc **en complément** du
  quota utilisateur, jamais à sa place. Aucun autre en-tête d'IP n'est introduit sans
  preuve de confiance fournie par la plateforme d'hébergement.

## 3. Preuves de non-journalisation

- `src/app/(app)/mon-espace/securite/SecuriteMfaClient.tsx` : composant `"use client"`,
  aucun `console.*`, aucun appel analytics ; `secret` et `qr_code` vivent uniquement
  dans l'état React et sont effacés après `verify`.
- `src/app/actions/mfa.ts` et `apps/colors/src/app/actions-mfa.ts` : aucun `console.*`,
  aucun `Sentry`, le `code` n'est jamais interpolé dans une URL de redirection ni passé
  à une fonction de traduction d'erreur ; seuls des littéraux neutres alimentent
  `?error=`.
- `getAuthenticatorAssuranceLevel()` et `listFactors()` ne renvoient que des métadonnées
  de statut, jamais de secret.
- `apps/colors/src/lib/rate-limit-mfa.ts` : l'`id` utilisateur n'est ni stocké ni
  transmis en clair — seul son condensat HMAC part vers la RPC. Le secret HMAC et la
  clé `service_role` sont lus via `process.env` côté serveur uniquement
  (`import "server-only"`), jamais préfixés `NEXT_PUBLIC_`, jamais rendus au client.
- `npm run verify:secrets` ne détecte aucun secret (client ou `service_role`) ajouté ;
  `.env.example` ne contient que des noms de variables et des valeurs de remplacement.

## 4. Vérification manuelle de la configuration hébergée (Supabase Dashboard — Preview)

À réaliser **manuellement**, sans rien activer si c'est désactivé :

1. Ouvrir le projet **Preview** dans le Supabase Dashboard.
2. `Authentication` → `Sign In / Providers` → section **Multi-Factor Authentication**
   (ou `Authentication` → `MFA`).
3. Vérifier **App Authenticator (TOTP)** :
   - `Enroll` **activé** ;
   - `Verify` **activé**.
4. Si l'un des deux est **désactivé** : le **signaler** dans le rapport de livraison et
   **ne pas l'activer**. Sans `Enroll`, l'écran `/mon-espace/securite` renverra un
   message neutre d'échec ; sans `Verify`, le challenge `/login/mfa` échouera toujours.

Aucune autre option MFA (SMS/phone) n'est utilisée par ce lot.

## 5. Procédure manuelle d'enrôlement (à réaliser plus tard, sur Preview)

Ordre imposé :

1. **`julien.gregurec@gmail.com`** (Gmail) **en premier**.
2. **`julien@elsatia.fr`** **ensuite**.

Pour chaque compte :

1. Se connecter à ELSATIA Gestion Pro (Preview) avec le mot de passe.
2. `Mon espace` → **Authentification renforcée** (`/mon-espace/securite`).
3. « Démarrer l'enrôlement » → scanner le QR code dans une application TOTP
   (ou saisir la clé manuelle affichée à l'écran).
4. Saisir le code à 6 chiffres → « Valider le code ».
5. Vérifier à l'écran : facteur `vérifié` + session `aal2`.
6. Se déconnecter / reconnecter : le challenge `/login/mfa` doit s'afficher et, après
   un code valide, la session repasse `aal2` et redirige vers la destination initiale.

> Tant que les **deux** comptes n'ont pas un facteur `verified`, ne pas retirer les
> accès de secours existants : `plateforme_activer_admin` refuse un compte cible sans
> facteur MFA vérifié.

## 6. Récupération / limites (MFA-V1)

- Pas de suppression du dernier facteur vérifié ; la suppression d'un facteur `verified`
  n'est pas proposée dans l'UI.
- Un facteur `unverified` n'est nettoyé que sur confirmation explicite de l'utilisateur
  (bouton « Recommencer l'enrôlement » confirmé) avant un nouvel enrôlement.
- Un seul enrôlement TOTP à la fois (bouton désactivé pendant la requête + garde sur le
  facteur en attente).
- Aucun code de secours maison, aucun mécanisme de contournement.
