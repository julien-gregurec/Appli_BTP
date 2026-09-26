# Phase 3 — Sécurité applicative — rapport final

Date : 31 juillet 2026
Branche : `release/commercialisation-v1`
Point de départ : `074b539`
Environnement : local et recette Supabase isolée uniquement

## Statut

**PHASE 3 NON TERMINÉE**

Les corrections sont implémentées, typées, testées unitairement et compilées,
mais la clôture formelle exige encore deux exécutions que l'environnement Codex
a empêchées : pgTAP/Storage sur Docker et Playwright hors sandbox. L'approbation
hors sandbox a été refusée pour quota. Aucun test fonctionnel n'a échoué : les
six essais Playwright ont été interrompus par `EPERM` avant d'atteindre
l'application ou de démarrer Chromium.

## 1. État initial

L'état initial détaillé se trouve dans
`docs/audits/phase-3-securite-applicative-etat-initial.md`. Il comportait :

- aucune CSP ni header de sécurité explicite ;
- `X-Powered-By: Next.js` ;
- aucun rate limiting distribué ;
- des erreurs Supabase/Stripe brutes ;
- des redirections Auth partiellement contrôlées ;
- des cookies Supabase sans options applicatives explicites ;
- une vulnérabilité élevée de production dans `brace-expansion@5.0.7` ;
- 106 tests Vitest, 27 tests Playwright et migration 192 au départ.

## 2. Routes auditées

| Route / groupe | Authentification | Autorisation | Validation après | Rate limit après | Risque | Action |
|---|---|---|---|---|---|---|
| `/login` | Public | Supabase Auth | Supabase + formulaire | 10/10 min/IP | brute force | protégé |
| `/signup` | Public | Supabase Auth | formulaire + Supabase | 5/h/IP | comptes massifs | protégé |
| mot de passe oublié/nouveau | Public/recovery | jeton Supabase | formulaire | 5/h/IP | spam/rejeu | protégé |
| `/auth/*` | Code/jeton | Supabase Auth | destination sûre | 30/10 min/IP | open redirect | corrigé |
| `/api/assistant/chat` | Session | permission IA + quota | JSON 64 Kio, historique, MIME/taille | 20/min/utilisateur + 100/h/entreprise | coût/DoS/fuite | corrigé |
| `/api/referentiels/vehicules` | Session | permission flotte | 2–80 caractères, alphabet autorisé | 10/min/utilisateur | amplification | corrigé |
| uploads authentifiés | Session | permissions/RLS | contrôles existants + plafond central | 20/5 min/utilisateur | stockage/CPU | protégé |
| import paie | Secret serveur | secret partagé | contrôles PDF/champs existants | 30/5 min/IP | upload public | protégé |
| téléchargements signés | Session | permissions/RLS | UUID sur document chantier, hôte Supabase exact | 60/min/utilisateur | liens massifs/open redirect | corrigé |
| exports | Session | permissions métier | périodes/formats existants, erreurs neutres | 10/min/utilisateur | CPU/exfiltration | protégé |
| impression | Session | permissions/RLS | contrôles métier | 30/min/utilisateur | rendu répété | protégé |
| API métier restante | Session | proxy + RLS/permissions | contrôles métier | 120/min/utilisateur | abus transversal | protégé par défaut |
| webhooks Stripe | Public | signature Stripe | signature existante | 300/min/IP | DoS | protégé sans modifier Stripe |
| webhook push | Public | secret partagé | payload existant | 300/min/IP | envois abusifs | protégé |
| crons | Public | Bearer secret | méthode/secret existants | 60/min/IP | déclenchement répété | protégé |
| callback Powens | Public | état fournisseur | contrôles existants | 60/min/IP | replay/DoS | protégé |
| pages légales, tarifs, guides, vidéos | Public | sans objet | sans entrée sensible | aucun plafond dédié | faible | conservées publiques |

## 3. Headers avant

Sur `/login`, CSP, HSTS, `nosniff`, Referrer-Policy, Permissions-Policy,
X-Frame-Options, COOP et CORP étaient absents. `X-Powered-By` révélait Next.js.
Le cache de la page dynamique était déjà privé et non stockable.

## 4. Headers après

| Header | Valeur / règle |
|---|---|
| `Content-Security-Policy` | nonce unique par requête et directives restrictives |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload`, production uniquement |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | caméra/géolocalisation/paiement limités à self ; micro/USB interdits |
| `X-Frame-Options` | `DENY` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `X-Powered-By` | désactivé |

Les réponses d'authentification Supabase restent `private, no-store`. Le Proxy
et les Route Handlers sensibles ne rendent aucun contenu de session publiquement
cacheable.

## 5. CSP

La CSP utilise `script-src 'self' 'nonce-…' 'strict-dynamic'`. Elle interdit les
scripts inline sans nonce, `object-src`, l'encapsulation (`frame-ancestors
'none'`) et les bases externes. `connect-src` est construit avec les origines
exactes Supabase HTTPS/WSS et Sentry. Les workers acceptent seulement `self` et
`blob:`. Les frames Stripe existantes sont explicitement autorisées. OpenAI est
appelé côté serveur et n'a besoin d'aucune source navigateur. En production,
`upgrade-insecure-requests` est actif ; `unsafe-eval` est réservé au mode dev.

Le layout racine est dynamique : Next peut ainsi appliquer le nonce aux scripts
générés sur toutes les pages HTML.

## 6. Exceptions CSP

- `style-src 'unsafe-inline'` est temporairement nécessaire aux nombreux
  attributs `style` React existants. Il ne s'applique pas aux scripts.
- `img-src https:` et `media-src https:` couvrent les URL signées Storage et les
  médias externes existants. Les scripts et connexions n'utilisent aucun joker.
- COEP n'est pas activé : `require-corp` casserait des ressources signées
  Supabase, documents et médias cross-origin ne fournissant pas tous COEP/CORP.
- Réduction future : éliminer les styles inline puis passer à des styles à nonce
  ou hachés et resserrer les origines médias observées en production.

## 7. Endpoints protégés et 8. limites

Le contrôle est centralisé dans le Proxy. Les règles sont déclaratives et le
compteur est atomique dans PostgreSQL/Supabase, donc partagé entre instances
Vercel. Les portées utilisées sont IP, utilisateur et entreprise. Une portée de
session distincte n'est pas nécessaire avec la session Supabase actuelle : la
rotation conserve l'identité utilisateur vérifiée.

Les identifiants/IP sont transformés par HMAC-SHA-256 côté serveur avant la RPC.
La base ne reçoit jamais l'IP complète. Le dépassement retourne 429 et
`Retry-After`. Le premier dépassement de chaque fenêtre est inscrit dans
`journal_abus_securite`; anon et authenticated n'ont aucun droit direct sur les
tables ou la fonction. L'indisponibilité du secret ou du stockage échoue fermé
avec 503 en production.

La migration nouvelle est
`20260731000193_rate_limiting_applicatif.sql`; aucune migration historique n'a
été modifiée. `RATE_LIMIT_HMAC_KEY` est obligatoire hors développement.

## 9. Validations ajoutées

- UUID contrôlé avant PostgREST sur le téléchargement chantier ;
- marque véhicule bornée à 2–80 caractères et alphabet métier ;
- assistant limité à 64 Kio, y compris les corps sans `Content-Length`, avec
  lecture stream bornée ;
- pièce jointe IA, historique et MIME conservent leurs contrôles dédiés ;
- URL internes décodées et rejet des doubles slash, backslashes, credentials,
  caractères de contrôle et protocoles ;
- URL externe de téléchargement limitée à l'hôte HTTPS Supabase exact ;
- limite Server Actions abaissée de 15 Mio à 2 Mio, les uploads restant gérés
  par leurs Route Handlers spécialisés.

## 10. Cookies et 11. CSRF

Les clients Supabase serveur, navigateur et Proxy partagent désormais : chemin
`/`, `SameSite=Lax`, `Secure=true` en production et `false` uniquement en HTTP
local. `HttpOnly=false` est maintenu explicitement : les clients Supabase
navigateur existants doivent lire et renouveler la session. La CSP stricte
réduit le risque XSS associé. Le domaine, la durée et la rotation restent gérés
par Supabase ; aucun domaine parent large n'est configuré.

Next.js 16 vérifie Origin contre Host/X-Forwarded-Host pour les Server Actions.
`SameSite=Lax`, l'authentification du Proxy et les signatures/secrets des routes
publiques complètent la protection. Ajouter un second jeton CSRF aux Server
Actions n'apporterait pas de protection utile et risquerait de casser Supabase.

## 12. Redirections

Les callbacks Auth utilisent une validation unique. Les URL externes exigent
HTTPS, un hôte exact dans une liste blanche et aucun credential. Les variantes
`//`, encodées, avec backslash, contrôle, `javascript:` ou sous-domaine trompeur
sont couvertes par Vitest.

## 13. Erreurs

Les routes assistant, RGPD, exports comptables/paie/notes de frais, uploads
paie/notes de frais, crons et webhooks Stripe ne renvoient plus les messages
bruts des fournisseurs. Les détails restent seulement dans les journaux
serveur ou journaux métier internes. Les réponses publiques utilisent des
messages stables sans SQL, table, stack, chemin local, clé ou prompt.

## 14. Dépendances et 15. vulnérabilités

Avant : `minimatch@10.2.5` chargeait `brace-expansion@5.0.7` dans la chaîne de
production Sentry (`GHSA-mh99-v99m-4gvg`, élevée, DoS OOM).

Après : override ciblé de `minimatch@^10` vers `10.2.6`, qui installe
`brace-expansion@5.0.9`. Il s'agit d'un correctif patch dans la gamme déclarée
par `glob@13`, sans major de Next/Sentry/ESLint.

- `npm audit --omit=dev` : 0 vulnérabilité.
- `npm audit` : 9 élevées, 0 critique, uniquement dans ESLint et ses plugins de
  développement via `minimatch@3`/ancien `brace-expansion`.
- Ces 9 alertes ne sont ni bundlées ni installées avec `--omit=dev`. npm propose
  `eslint@10` ou, de façon incohérente, `eslint-config-next@12`; elles sont donc
  documentées comme non applicables au runtime, en attente d'un correctif amont
  compatible. Aucun `audit fix --force` n'a été lancé.

## 16. Secrets et 17–18. variables

`.env.example` recense les variables obligatoires/facultatives, leur
environnement, usage et format descriptif, sans valeur réelle. Il couvre
Supabase, HMAC de rate limit, application, IA, Stripe, cron, banque, paie,
Powens, push et Sentry. Les variables de recette restent réservées aux fichiers
ignorés.

Le contrôle de secrets détecte maintenant aussi les noms dangereux déclarés en
`NEXT_PUBLIC_*` (`SECRET`, `PRIVATE`, `SERVICE_ROLE`, clé OpenAI/Stripe). La
service-role, les secrets webhook, clés privées et tokens restent serveur-only.

## 19. Tests ajoutés

- 22 assertions Vitest : headers/CSP, cookies, redirections, UUID/query/body,
  erreurs neutres et politiques de rate limit ;
- 6 scénarios Playwright : headers réels, auth obligatoire, UUID/erreur,
  payload IA 413, véhicule 429/Retry-After, attributs du cookie ;
- 8 assertions pgTAP : tables, fonction, privilèges et compteur 1/2/3 ;
- preuve avant correction : 5 suites rouges car les modules n'existaient pas ;
- après correction : toutes les suites unitaires passent.

## 20–27. Résultats de vérification

| Contrôle | Résultat final disponible |
|---|---|
| TypeScript | Réussi |
| ESLint | 0 erreur, 3 avertissements historiques |
| Vitest | 34 fichiers, 128 tests réussis après ajout de la dernière politique |
| pgTAP | Non exécuté : accès Docker refusé après conflit de port avec la recette isolée |
| Playwright sécurité | Non exécuté fonctionnellement : 6/6 interrompus par sandbox `EPERM` |
| Playwright critique complet | Référence Phase 2 : 27/27 ; revalidation Phase 3 bloquée |
| Storage | Référence Phase 2 verte ; revalidation Phase 3 bloquée avec pgTAP |
| Build Next.js | Réussi, Next 16.2.12, 115 routes/pages, CSP dynamique compilée |
| `npm audit --omit=dev` | 0 vulnérabilité |
| `npm audit` | 9 élevées dev-only, 0 critique, justification ci-dessus |
| Secrets | Réussi sur 728 fichiers suivis, documentation comprise |
| `git diff --check` | Réussi |

## 28. Commits Phase 3

- `82ad0cd` — `test(security): couvrir headers et routes publiques`
- `25ae08e` — `fix(security): ajouter headers de protection`
- `4e80156` — `fix(security): centraliser rate limiting`
- `2d91b19` — `fix(validation): durcir entrees API`
- `6b71808` — `fix(deps): corriger vulnerabilite production`
- `9df5f40` — `fix(security): completer rate limiting public`
- commit courant — `docs(security): documenter configuration phase 3`

Aucun commit n'a été poussé. Aucun déploiement ni accès production n'a eu lieu.

## 29. P0 / P1 / P2 / P3

- P0 : aucun.
- P1 fonctionnel nouveau : aucun constaté.
- P1 de validation : exécuter migration 193 + pgTAP/Storage et Playwright hors
  sandbox avant commercialisation ; c'est le seul blocage de clôture.
- P2 : supprimer progressivement `style-src 'unsafe-inline'`; ajouter une
  politique de rétention/nettoyage du journal d'abus ; surveiller les 503 du
  stockage de rate limit.
- P3 : suivre la correction amont de la chaîne ESLint dev et resserrer les
  sources images/médias après observation CSP.

## 30–32. Scores et avancement

| Indicateur | Avant | Après implémentation | Après validation requise |
|---|---:|---:|---:|
| Sécurité applicative | 55/100 | 88/100 provisoire | 92/100 estimé |
| Phase 3 | 0 % | 90 % | 100 % |
| Préparation commerciale technique | 60 % | 80 % provisoire | 86 % estimé |

Le score reste provisoire tant que les tests distribués et navigateur ne sont
pas réellement exécutés.

## 33. Risques résiduels

- migration de rate limit non appliquée/testée dans cette session ; sans elle,
  les routes protégées échouent fermé avec 503 au lieu d'accepter sans limite ;
- compatibilité CSP navigateur, Storage, PWA, Sentry, Realtime, paiement, PDF et
  impression à confirmer par la recette Playwright manuelle/automatique ;
- styles inline encore autorisés ;
- alertes npm élevées dev-only en attente d'un chemin amont non majeur ;
- dépendance à PostgreSQL pour le rate limit : disponibilité et latence doivent
  être supervisées, sans lancer de test de charge dans cette phase.

## 34. Recommandation de phase suivante

Ne pas commencer une autre phase. Autoriser d'abord, dans cette même Phase 3 :

1. l'application locale de la migration 193 et `npm run test:db`/tests Storage ;
2. la suite `tests/e2e/security.spec.ts`, puis la suite Playwright critique ;
3. une capture réelle des headers et une navigation CSP sur les surfaces
   listées ;
4. si tout est vert, remplacer le statut par **PHASE 3 TERMINÉE** sans modifier
   le périmètre fonctionnel.
