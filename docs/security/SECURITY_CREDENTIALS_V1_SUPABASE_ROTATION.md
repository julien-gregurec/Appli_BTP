# SECURITY-CREDENTIALS-V1 / V1B — Rotation des clés API Supabase Production

Aucune valeur de clé n'apparaît dans ce document, à aucun endroit.

## Incident initial

**Date** : 2026-08-20, pendant la vérification des logs post-déploiement de
TERRAIN-MOBILE-V1D2.

**Nature** : une commande de diagnostic (`supabase projects api-keys
--project-ref exhvuzegsefmoguxoiak`) a été exécutée par erreur. Elle a
affiché en clair, dans la sortie d'un outil de cette session, l'ensemble des
clés API du projet Production dans un même bloc JSON.

**Clés apparues dans la sortie** :
- clé `anon` legacy (JWT) — valeur complète affichée.
- clé `service_role` legacy (JWT) — valeur complète affichée.
- clé `publishable` (nouveau système) — valeur complète affichée.
- clé `secret` (nouveau système) — seuls le préfixe et un hash affichés ; la
  valeur elle-même est masquée par l'outil Supabase avant de sortir du CLI,
  donc jamais réellement exposée.

**Portée de l'exposition** : limitée à la transcription de cette session.
Recherche exhaustive dans l'historique Git complet (toutes branches, motif
JWT et motif `SUPABASE_SERVICE_ROLE_KEY=<valeur>`) : aucune occurrence, ce
secret n'a jamais été commité.

## Classification

| Clé | Nature | Décision |
|---|---|---|
| `anon` legacy | Publique par conception | Pas de rotation d'urgence — mais migrée par prudence via V1B (voir plus bas) |
| `service_role` legacy | Privilégiée, contourne RLS | **Compromise, remplacée** |
| `publishable` (nouveau système) | Publique par conception | Non compromise (jamais utilisée par l'app avant V1B) |
| `secret` (nouveau système) | Privilégiée | Valeur jamais exposée (masquée à la source) — non compromise |
| JWT signing secret | Signature de tous les JWT/sessions | Jamais interrogé, jamais touché |

## Consommateurs identifiés (avant rotation)

- `SUPABASE_SERVICE_ROLE_KEY` : `src/lib/supabase/admin.ts` (`createAdminClient`), consommé par 17 fichiers (webhooks Stripe, crons, import/export paie, pages de partage documentaire par jeton, `proxy.ts` pour le rate limiting).
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` : `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/proxy.ts` — les 3 seuls points de création de client Supabase orienté navigateur/SSR du projet.
- Aucune Edge Function dans ce projet. Aucun usage Realtime. Aucun secret Supabase référencé dans les GitHub Actions. Un script local (`scripts/seed-elsatia-preview-year.mjs`) lit le même nom de variable mais cible Preview manuellement, hors périmètre Production.

## Rotation — Secret key serveur (V1)

- Nouvelle clé `secret` (nouveau système Supabase) créée par l'utilisateur via le Dashboard, nommée explicitement pour l'audit.
- `SUPABASE_SERVICE_ROLE_KEY` mis à jour dans Vercel `elsatia-production`, scope Production uniquement — valeur saisie directement par l'utilisateur, jamais transmise dans le chat.
- Redéploiement, smoke test complet (Auth, opérations serveur privilégiées, Storage, Terrain) : vert.
- Ancienne clé `service_role` legacy laissée active en parallèle jusqu'à la migration complète (V1B), conformément à l'ordre « créer avant de révoquer ».

## Migration du client public — V1B

Constat : la révocation isolée de `service_role` legacy s'est révélée
impossible depuis l'interface Supabase — la seule action disponible,
« Disable JWT-based API keys », désactive `anon` et `service_role` ensemble.
Or l'application dépendait encore de `anon` legacy côté navigateur. Décision
retenue (option B) : migrer d'abord le client public vers la nouvelle
`publishable key`, valider, puis désactiver les deux clés legacy ensemble.

- Nouvelle variable `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` introduite (plutôt
  que réutiliser le nom `ANON_KEY` avec une nouvelle valeur, pour éviter
  toute confusion durable dans le code).
- Helper centralisé `src/lib/supabase/keys.ts` (`clePubliqueSupabase()`) :
  retourne la nouvelle clé si présente, sinon retombe sur l'ancienne — ce
  qui garantit qu'aucun environnement non touché (Preview) ne casse suite à
  ce changement de code partagé.
- Les 3 points de création de client (`client.ts`, `server.ts`, `proxy.ts`)
  utilisent désormais ce helper.
- Valeur de la `publishable key` saisie par l'utilisateur directement dans
  Vercel `elsatia-production`, scope Production uniquement.
- Redéploiement, smoke test complet avec les deux systèmes de clés actifs en
  parallèle (Auth, Data, Storage, Terrain, routes serveur) : vert, aucun
  401/403/500 nouveau.

## Désactivation des clés legacy

Une fois la migration validée : l'utilisateur a cliqué manuellement sur
« Disable JWT-based API keys » dans le Dashboard Supabase (section Legacy
anon, service_role API keys). `anon` et `service_role` legacy sont
désormais désactivées ensemble, comme prévu.

**JWT signing secret : jamais régénéré, jamais touché.**

Smoke test immédiat post-désactivation : homepage, `/login` (page réelle
vérifiée, pas une erreur déguisée en 200), `/dashboard`, Data (clients,
chantiers, devis, factures, notes-frais, planning), Terrain (pointage),
routes serveur privilégiées (document/partage par jeton) — tous des
réponses propres (200/307/404 selon le cas), zéro 401/403/500. Région
Europe (`fra1`) confirmée inchangée. Logs Vercel : uniquement niveau
`info`, y compris pour du trafic visiteur réel observé en parallèle du
test.

## Impact utilisateur

Aucun. Aucune session invalidée (le JWT signing secret n'a pas changé, donc
les sessions utilisateur existantes restent valides). Aucune coupure de
service observée à aucune étape.

## Prévention

- Ne jamais exécuter une commande CLI susceptible d'afficher des secrets
  sans avoir vérifié au préalable son comportement (`supabase projects
  api-keys` notamment, qui affiche legacy `anon`/`service_role` en clair
  dans le même bloc que les métadonnées publiques).
- Pour un audit de clés futur : se limiter aux noms/scopes visibles côté
  Vercel (`vercel env ls`, valeurs marquées `Hidden` pour tout ce qui est
  `Sensitive`) ; utiliser le Dashboard pour toute saisie de valeur secrète ;
  ne jamais faire transiter une valeur de secret par le chat, y compris à la
  demande explicite de l'utilisateur.
- Préférer par défaut le nouveau système de clés Supabase (publishable/
  secret) à la création d'un nouveau projet, qui permet une rotation
  granulaire sans toucher au JWT signing secret ni aux sessions actives —
  contrairement au système legacy où seule une désactivation groupée était
  possible.

## Git

- `fix/security-publishable-key-migration` (créée depuis `release/
  commercialisation-v1` à `8efad78`) : commit `2647d4e` — migration du
  client public, helper de repli, test ciblé.
- Fast-forward dans `release/commercialisation-v1`, poussé.
- Aucun secret dans aucun des commits (vérifié `verify:secrets` + recherche
  d'historique par motif).
