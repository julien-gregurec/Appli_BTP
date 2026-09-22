# ELSATIA — Domaines, Storage, Stripe TEST pour une vraie Preview (V1)

Couvre les sections 7 (domaines), 8 (storage) et 9 (Stripe TEST readiness) de la mission de
clôture des blockers Preview. Document de lecture seule : aucune action distante (DNS, Vercel,
Supabase, Stripe) n'a été exécutée pour le produire.

## 7. Matrice de domaines cible

| Domaine | App | Statut dans ce dépôt |
|---|---|---|
| `elsatia.fr` | Vitrine/marketing (hors périmètre de ce dépôt — non trouvé) | Non versionné |
| `app.elsatia.fr` | Gestion Pro | Domaine **Production** cité dans le code (`docs`), non versionné comme constante — lu uniquement via `NEXT_PUBLIC_APP_URL` |
| `colors.elsatia.fr` | Colors | Non trouvé en dur dans le code — lu via `NEXT_PUBLIC_COLORS_URL` |
| `tools.elsatia.fr` | Tools | **Trouvé en dur** comme repli de secours (`apps/tools/src/lib/seo.ts`, `SITE.defaultUrl` dans `apps/tools/src/lib/site.ts`) — seule app dont un domaine de production figure explicitement dans le code |
| `studio.elsatia.fr` | Studio | Non trouvé en dur — lu via `NEXT_PUBLIC_STUDIO_URL`, validée (https ou localhost uniquement) |
| `reserves.elsatia.fr` | Reserves | Non trouvé en dur — lu via `NEXT_PUBLIC_RESERVES_URL` |

**Aucune de ces 6 apps ne lit un domaine Preview constant** : chacune dépend exclusivement de sa
variable `NEXT_PUBLIC_*_URL` positionnée au déploiement. C'est la conception correcte pour une
Preview (le domaine réel n'est connu qu'au provisioning Vercel) — mais cela signifie qu'un oubli
de variable n'est jamais rattrapé par un domaine « par défaut » sûr, sauf sur GP et Studio (voir
ci-dessous).

### Replis localhost/production détectés dans le code (vérifiés par lecture, pas supposés)

| Fichier | Repli | Sévérité | Portée réelle |
|---|---|---|---|
| `apps/reserves/src/lib/invitations.ts:31` | `NEXT_PUBLIC_RESERVES_URL ?? "http://localhost:3020"` | **Réelle — fonctionnelle** | Construit l'URL absolue insérée dans les e-mails d'invitation. Un oubli de variable en Preview envoie des invitations pointant vers `localhost:3020`, inaccessibles au destinataire, **sans faire échouer le build**. |
| `apps/reserves/src/app/layout.tsx:6` | `NEXT_PUBLIC_RESERVES_URL ?? "http://localhost:3020"` | Mineure | `metadataBase` (Next.js) — affecte seulement les URLs Open Graph/canoniques générées automatiquement, pas une fonctionnalité utilisateur. |
| `apps/colors/src/app/layout.tsx:8` | `NEXT_PUBLIC_COLORS_URL ?? "http://localhost:3010"` | Mineure | Même mécanisme `metadataBase`, même portée limitée. |
| `apps/tools/src/lib/site.ts:34` | `NEXT_PUBLIC_TOOLS_URL ?? SITE.defaultUrl` (`https://tools.elsatia.fr`, **Production**) | Mineure, mais à noter | Un oubli de variable sur une Preview Tools ferait pointer le SEO/canonical vers le domaine de Production, pas vers un localhost inaccessible — comportement différent des 2 lignes précédentes, à connaître avant de publier une Preview Tools indexée. |
| `apps/studio/playwright.config.ts:11` | `NEXT_PUBLIC_STUDIO_URL ?? "http://127.0.0.1:3030"` | Aucune | Configuration de test end-to-end uniquement, ne s'exécute jamais en Preview/Production. |

**Par contraste**, `apps/colors/src/lib/auth-redirects-colors.ts` (`urlCallbackReinitialisation`)
et `apps/studio/src/lib/config.ts` (`studioOrigin()`) **échouent explicitement** (retournent `null`
ou lèvent une exception) quand leur variable d'origine est absente — aucun repli silencieux. C'est
le comportement recommandé ; **seul `apps/reserves/src/lib/invitations.ts` s'en écarte** pour un
usage fonctionnel (pas seulement métadonnées).

**Décision prise pour cette mission** : ces replis ne sont pas corrigés dans le code ici — modifier
le comportement d'une fonction déjà couverte par des tests et utilisée en production (Reserves,
Tools) sans confirmation du propriétaire du produit dépasse le périmètre « documentation/config »
demandé. Signalé pour action future : `DECISION_REQUIRED:RESERVES-URL-FAIL-CLOSED` (faire échouer
`invitations.ts`/`layout.tsx` plutôt que de retomber sur `localhost:3020`, à l'image de Colors et
Studio).

## 8. Storage — buckets requis par app

18 buckets distincts créés par migration (comptage exact au HEAD de cette branche, par lecture de
`supabase/migrations/*.sql` — l'audit source en comptait « ~13 », décalage expliqué par les lots
Studio/Reserves/Colors les plus récents de ce train, postérieurs au comptage de l'audit).

| Bucket | App | Public | Limite | MIME autorisés |
|---|---|---|---|---|
| `entreprise-assets` | GP | ✅ **seul bucket public** | 5 Mo | image/png, jpeg, webp |
| `chantier-documents` | GP | ❌ | — | — |
| `pointage-preuves` | GP | ❌ | 10 Mo | image/png, jpeg, webp |
| `factures-fournisseurs` | GP | ❌ | 20 Mo | pdf, image/png, jpeg, webp |
| `documents-employes` | GP | ❌ | 10 Mo | pdf, image/png, jpeg, webp |
| `notes-frais` | GP | ❌ | 15 Mo | pdf, image/png, jpeg, webp, heic, heif |
| `notes-frais-exports` | GP | ❌ | 250 Mo | application/zip |
| `bulletins-paie` | GP | ❌ | 20 Mo | pdf |
| `fiches-techniques` | GP | ❌ | 20 Mo | pdf, image/png, jpeg, webp |
| `documents-paie` | GP | ❌ | 20 Mo | pdf, jpeg, png, webp, heic, heif |
| `messagerie-medias` | GP | ❌ | 20 Mo | (médias messagerie chantier) |
| `devis-medias` | GP | ❌ | 20 Mo | (médias devis) |
| `colors-seaux` | Colors | ❌ | 10 Mo | jpeg, png, webp, heic, heif |
| `reserves-photos` | Reserves | ❌ | 15 Mo | jpeg, png, webp |
| `reserves-plans` | Reserves | ❌ | 25 Mo | jpeg, png, webp, pdf |
| `communications-elsatia` | Socle partagé (support/accès) | ❌ | 2 Mo | image/png, jpeg, webp |
| `studio-originals` | Studio | ❌ | 1 Go | jpeg, png, webp, video/mp4, video/quicktime |
| `studio-renders` | Studio | ❌ | 1 Go | video/mp4 uniquement — **politique restrictive dédiée** (`studio_renders_server_only`) qui bloque `anon`/`authenticated` sur ce bucket précis, accès exclusivement par le worker via clé de service |

- **RLS/accès** : `anon` révoqué sur `storage.buckets` globalement
  (`supabase/migrations/20260714000078_fermeture_acces_anonyme_production.sql`) ; tous les buckets
  sauf `entreprise-assets` sont privés. Lecture confirmée par les migrations elles-mêmes, pas
  supposée.
- **URLs signées** : lecture confirmée dans 9+ routes API (ex.
  `src/app/api/documents/[id]/route.ts`, `apps/reserves/src/lib/donnees.ts`) — convention
  cohérente sur tout le dépôt pour tout accès à un bucket privé depuis le navigateur.
- **Purge** : la seule procédure de purge documentée dans ce train est celle du worker vidéo
  Studio (`workers/studio-video/src/reconcile.ts`, manuelle, voir
  `docs/runbooks/ELSATIA_STUDIO_VIDEO_WORKER_DEPLOYMENT_V1.md`). **Aucune purge automatisée
  documentée pour les 16 autres buckets** — hors périmètre de cette mission (pas un blocker de
  Preview identifié par l'audit source, à qualifier séparément si nécessaire).
- **Création en Preview** : ces buckets sont créés par les migrations SQL elles-mêmes
  (`insert into storage.buckets`), donc **automatiquement recréés par un simple rejeu des 313
  migrations sur un projet Supabase Preview neuf** (§6, étape 4 de l'audit source) — aucune étape
  manuelle de création de bucket n'est nécessaire séparément, contrairement à la configuration
  Auth (voir `ELSATIA_SUPABASE_AUTH_PREVIEW_URLS_V1.md`).

### Preflight non destructif — buckets

Aucun script de preflight Storage n'existait avant cette mission. `scripts/preflight-preview.mjs`
(§10, livré par cette mission) ajoute une vérification **statique et non destructive** : il
compare la liste des buckets attendus (extraite des migrations, tableau ci-dessus) à la liste des
buckets réellement présents sur le projet Supabase visé, via un appel en lecture seule
(`GET /storage/v1/bucket`, clé anonyme suffisante) — jamais de création, jamais d'écriture. Activé
seulement si les variables Supabase nécessaires sont positionnées (silencieux sinon, cohérent avec
le reste du preflight, voir §10).

## 9. Stripe — contrat TEST readiness pour Preview

**Ce qui existe déjà et n'a pas été dupliqué ici** (vérifié, pas supposé) :

- `scripts/verify-stripe-prices.mjs` / `scripts/lib/stripe-prices-attendus.mjs` : dérive la liste
  complète des Price ID attendus depuis le **seul contrat canonique**
  (`src/lib/tarification.canonical.json`), compare au catalogue Stripe réel. Couvre déjà
  mensuel/annuel, forfaits, comptes supplémentaires, modules. Nécessite `STRIPE_SECRET_KEY` réel
  (non exécutable dans ce sandbox, `NOT_PROVEN_REMOTE` — comportement attendu, déjà documenté par
  le dépôt).
- `scripts/lib/env-manifest-preflight.mjs` §4 (voir P0-1, déjà revalidé) : mode test/live, absence,
  valeur invalide, `PF-STRIPE-LIVE-KEY-IN-PREVIEW`, `PF-STRIPE-KEY-MODE-MISMATCH` — couvre déjà
  exactement les scénarios statiques demandés par la mission (absent/test/live/invalide/mismatch).
- Idempotence et mapping client : `src/lib/stripe-abonnement.ts`,
  `src/lib/stripe-abonnement-synchronisation.ts`, `src/lib/stripe-discount-consistency.ts` —
  logique déjà en place et testée (hors périmètre de cette mission de la réécrire).
- `docs/organisation/STRIPE_LIVE_CHECKLIST.md` : 100 % Test confirmé, plan de bascule Test→Live en
  14 étapes déjà écrit.
- `docs/exploitation/STRIPE_V2_C_CLOISONNEMENT_WEBHOOKS.md` : cloisonnement des 3 routes webhook
  déjà documenté.

**Contrat minimal pour exposer la facturation GP sur une Preview** (aucun élément nouveau,
consolidation de ce qui précède en une checklist unique) :

1. `STRIPE_SECRET_KEY` = clé **test** (`sk_test_…`), jamais `sk_live_…` (bloqué par
   `PF-STRIPE-LIVE-KEY-IN-PREVIEW`).
2. `STRIPE_WEBHOOK_EXPECTED_MODE=test` (déjà dans le gabarit, voir P0-1).
3. `STRIPE_WEBHOOK_ABONNEMENT_SECRET` / secret boutique — obtenus en enregistrant l'endpoint
   Preview réel dans le tableau de bord Stripe **en mode Test** (action manuelle, hors dépôt,
   étape 9 de l'ordre de qualification de l'audit source, §6).
4. Tous les Price ID `STRIPE_PRICE_*` du contrat runtime actif (`modules-flat-runtime`, voir
   `DECISION_REQUIRED:STRIPE-MODULE-PRICE-MODEL` — le contrat catalogue V3 n'est pas actif) créés
   **en mode Test** dans Stripe, avec les mêmes identifiants que ceux attendus par
   `verify-stripe-prices.mjs`.
5. `verify:stripe-prices` exécuté une fois contre le compte Stripe Test réel choisi, avant
   d'exposer la Preview à des utilisateurs — pas seulement en CI (où il est ignoré faute de clé).
6. Un cycle Stripe TEST complet (checkout → webhook → état abonnement) rejoué manuellement sur la
   Preview réelle (§6 étape 12 de l'audit source) — non exécutable depuis ce sandbox.

Aucun nouveau script n'a été créé pour ce point : les mécanismes statiques demandés par la mission
existaient déjà et couvrent le périmètre demandé ; les dupliquer aurait créé un second système
moins fiable que l'existant.

---

*Document produit par lecture de dépôt et exécution de scripts statiques locaux uniquement.
Aucun accès Vercel/Supabase/Stripe réel.*
