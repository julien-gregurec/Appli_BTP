# Phase 3 — Sécurité applicative — état initial

Date : 31 juillet 2026
Périmètre : headers HTTP, CSP, rate limiting, routes et entrées, sessions,
redirections, erreurs, dépendances et configuration sensible
Environnements autorisés : local et recette Supabase isolée uniquement

## Référence et état Git

- Branche : `release/commercialisation-v1`.
- Commit de départ Phase 3 : `074b539` (`docs(recette): finaliser recette e2e phase 2`).
- Aucun push ni déploiement effectué.
- Le worktree ne contient plus de modification applicative Phase 2 non
  commitée. Restent uniquement des médias et scripts vidéo historiques non
  suivis, exclus du périmètre et non stagés.
- Dernière migration :
  `20260731000192_restaurer_privileges_comptes_entreprises.sql`.

## Référence de tests validée

| Contrôle | État initial |
|---|---:|
| Playwright | 27/27 |
| Vitest | 106/106 |
| pgTAP surface | 10/10 |
| TypeScript | Réussi |
| Build Next.js | Réussi, 115 pages |
| ESLint | 0 erreur, 3 avertissements historiques |

## Dépendances et audit npm initial

Le projet compte 339 dépendances de production et 840 dépendances au total
selon `npm audit`.

### `npm audit --omit=dev`

- 1 vulnérabilité élevée, 0 critique.
- Paquet : `brace-expansion@5.0.7`.
- Avis : `GHSA-mh99-v99m-4gvg`, déni de service par expansion non bornée.
- Chaîne de production : `@sentry/nextjs` → outils de bundling Sentry →
  `glob@13.0.6` → `minimatch@10.2.5` → `brace-expansion@5.0.7`.
- La version corrigée de `brace-expansion` commence à `5.0.8`; la dernière
  version constatée est `5.0.9`. `minimatch@10.2.6` dépend de `^5.0.8`.
- Bien que la chaîne soit principalement utilisée au build, npm la classe dans
  l'arbre de production et le critère de commercialisation exige sa correction.

### `npm audit`

- 9 vulnérabilités élevées, 0 critique.
- Elles convergent vers `brace-expansion`/`minimatch` dans la chaîne Sentry et
  la chaîne de développement ESLint.
- La correction automatique proposée par npm implique des changements majeurs
  incohérents (`eslint@10` ou ancien `eslint-config-next@12`) et ne doit pas être
  appliquée sans analyse.

## Headers HTTP avant correction

Capture locale de `GET /login` :

| Header | État initial |
|---|---|
| `Content-Security-Policy` | Absent |
| `Strict-Transport-Security` | Absent |
| `X-Content-Type-Options` | Absent |
| `Referrer-Policy` | Absent |
| `Permissions-Policy` | Absent |
| `X-Frame-Options` | Absent |
| `Cross-Origin-Opener-Policy` | Absent |
| `Cross-Origin-Resource-Policy` | Absent |
| `Cross-Origin-Embedder-Policy` | Absent |
| `Cache-Control` | `private, no-cache, no-store, max-age=0, must-revalidate` sur la page dynamique testée |
| `X-Powered-By` | `Next.js`, donc exposition technique inutile |

`next.config.ts` ne déclare aucun header. Le proxy sert uniquement à rafraîchir
la session et à contrôler l'accès aux modules.

## CSP initiale

Aucune CSP n'est présente. Il n'existe donc aucune restriction navigateur sur
les scripts, styles, connexions, images, frames, workers, formulaires ou URL de
base. Les pages utilisent des styles React en ligne et des scripts Next.js ;
une CSP stricte devra utiliser un nonce pour les scripts et conserver
temporairement `style-src 'unsafe-inline'` pour les attributs de style existants.

## Routes publiques et endpoints sensibles

Le proxy considère publics : accueil, authentification, tarifs, pages légales,
paiement, webhooks Stripe, crons, webhook push, callback Powens et import paie.
Les fichiers sous `/guides` et `/videos` sont servis sans résolution de session.

| Route ou groupe | Authentification initiale | Autorisation / signature | Validation initiale | Rate limit initial | Risque initial | Action Phase 3 |
|---|---|---|---|---|---|---|
| `/login` | Public | Supabase Auth | email/password par Supabase | Aucun | brute force | Limite IP + compte haché |
| `/signup` | Public | Supabase Auth | validation légère | Aucun | création massive | Limite IP + email haché |
| `/mot-de-passe-oublie` | Public | Supabase Auth | email non vide | Aucun | spam/reset | Limite IP + email haché |
| `/nouveau-mot-de-passe` | Session recovery | Supabase Auth | longueur/confirmation | Aucun | abus de jeton | Limite session/IP |
| `/auth/callback`, `/auth/confirm` | Jeton/code | Supabase Auth | destination interne partielle | Aucun | redirection/essais | Validation URL centralisée + limite |
| `/api/assistant/chat` | Session | droit IA + quota métier | historique et pièce jointe partiels | Quota mensuel seulement | coût, payload, prompt | Limites utilisateur/entreprise + schéma strict |
| `/api/referentiels/vehicules` | Session via proxy | membre authentifié | marque min. 2 seulement | Aucun | amplification vers API tierce | longueur/caractères + cache + limite |
| Uploads devis/messagerie/notes/paie | Session ou secret import | RLS/droits/secret | tailles et MIME variables | Aucun | stockage/CPU | limite centralisée + tailles/MIME cohérents |
| Téléchargements signés | Session | RLS/droits | IDs souvent non validés avant requête | Aucun | génération massive de liens | UUID + limite utilisateur |
| Exports compta/paie/RGPD | Session | permissions/RPC | formats/périodes variables | Aucun | extraction coûteuse | limite entreprise/utilisateur + erreurs neutres |
| Pages `/imprimer/*` | Session | RLS/droits | IDs non centralisés | Aucun | génération répétée | limite utilisateur + UUID |
| Webhooks Stripe | Public | signature Stripe + déduplication | JSON après signature | Aucun | parsing/DoS | plafond IP généreux + taille |
| `/api/webhooks/notifications-push` | Public | secret partagé | payload minimal | Aucun | abus d'envoi | limite + taille + erreur neutre |
| `/api/cron/*` | Public | Bearer `CRON_SECRET` | méthode GET | Aucun | déclenchement répété | limite + comparaison constante |
| `/api/paie/import` | Public serveur-à-serveur | Bearer 32 caractères | PDF et champs partiels | Aucun | upload/CPU/stockage | limite clé/IP + bornes numériques/textes |
| Callback Powens | Public | `state` signé | paramètres fournisseur | Aucun | replay/erreurs | limite + messages neutres |
| Routes API métier restantes | Session via proxy | RLS et permissions | hétérogène | Aucun | abus applicatif | plafond API authentifié par défaut |

## Rate limiting initial

Il n'existe aucun composant centralisé ni stockage distribué de compteurs.
Seul le quota métier IA peut retourner 429 lorsque le forfait mensuel est
épuisé ; ce quota n'est pas une protection anti-abus à fenêtre courte.

Aucun Redis/Upstash n'est configuré. Une solution Postgres transactionnelle via
Supabase est compatible avec Vercel et fournit un état distribué sans mémoire
de processus. Les identifiants réseau devront être HMAC-hachés avant stockage.

## Cookies, sessions et CSRF

Capture locale après connexion :

- cookie Supabase persistant, chemin `/`, domaine hôte ;
- `SameSite=Lax` ;
- `HttpOnly=false`, exigé par les composants client Supabase actuellement
  présents (realtime, uploads et éditeurs) ;
- `Secure=false` en HTTP local ; aucune option explicite ne garantit encore
  `Secure=true` en production ;
- valeur et nom complet non consignés.

Le proxy utilise `supabase.auth.getUser()` et ne fait pas confiance à
`getSession()`. La rotation est assurée par `@supabase/ssr`. Next.js 16 compare
automatiquement `Origin` à `Host`/`X-Forwarded-Host` pour les Server Actions,
ce qui fournit la protection CSRF principale. `SameSite=Lax` complète cette
protection. Les Route Handlers mutatifs doivent rester authentifiés ou protégés
par signature/secret.

## Redirections initiales

Les callbacks Auth refusent déjà `//host` et n'acceptent qu'une valeur
commençant par `/`. Cette logique est dupliquée et ne rejette pas explicitement
les caractères de contrôle ou les formes ambiguës encodées. Les callbacks
Stripe/Powens construisent généralement une URL interne, mais plusieurs Server
Actions redirigent vers une URL Stripe externe retournée par un fournisseur.
Une validation centralisée des destinations internes et externes approuvées est
nécessaire.

## Validation et erreurs initiales

- Zod n'est pas installé ; les validations sont manuelles et hétérogènes.
- Plusieurs routes renvoient directement `error.message` de Supabase ou d'un
  fournisseur : exports comptables, export RGPD, crons, webhook abonnement,
  callback Stripe, export paie et divers Server Actions.
- Les UUID de paramètres sont souvent passés directement à PostgREST, ce qui
  évite l'injection SQL mais peut révéler une erreur de type ou produire une
  réponse 500/400 incohérente.
- La route véhicule n'impose ni longueur maximale ni alphabet.
- Le body global des Server Actions est fixé à 15 Mo, nettement au-dessus du
  défaut Next.js de 1 Mo, pour permettre des formulaires de fichiers. Les Route
  Handlers doivent donc appliquer leurs propres limites avant traitement.

## Variables présentes et nécessaires

Seuls les noms ont été inventoriés, jamais les valeurs :

- Supabase : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `DISABLE_EMAIL_LOGIN` ;
- application : `NEXT_PUBLIC_APP_URL`, métadonnées de build Vercel/Liria ;
- IA : `OPENAI_API_KEY`, `OPENAI_MODEL`, `IA_PLAFOND_QUOTIDIEN` ;
- Stripe : secrets API/webhooks/Connect et identifiants de prix ;
- banque/Powens/paie : `BANK_DATA_ENCRYPTION_KEY`, variables Powens,
  `PAYROLL_IMPORT_SECRET` ;
- tâches et notifications : `CRON_SECRET`, clés VAPID,
  `NOTIFICATIONS_WEBHOOK_SECRET` ;
- Sentry : DSN serveur/public, organisation, projet, token de build ;
- audit local : variables `LIRIA_AUDIT_*` dans un fichier ignoré.

Il manque une variable de HMAC pour anonymiser les identifiants de rate limit.
Le dépôt possède `.env.local.example` mais pas encore le `.env.example` demandé
pour la commercialisation.

## Priorités initiales

- **P0 :** aucun constaté.
- **P1 :** absence de CSP/headers ; aucune limitation distribuée ;
  vulnérabilité production élevée ; erreurs brutes sur plusieurs routes.
- **P2 :** validations hétérogènes ; cookies de production non explicitement
  sécurisés ; logique de redirection dupliquée.
- **P3 :** exposition `X-Powered-By` et documentation de variables incomplète.

Score sécurité applicative initial recalculé : **55/100**.
Préparation commerciale initiale : **60 %** pour le périmètre technique de
cette phase, avant correction et revalidation complète.
