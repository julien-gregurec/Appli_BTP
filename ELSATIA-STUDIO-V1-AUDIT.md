# ELSATIA Studio V1 — Audit initial

Date : 12 septembre 2026. Périmètre : dépôt local, code, configurations versionnées et documentation technique officielle. Aucun accès aux services de Production, aucune valeur de secret lue, aucune migration exécutée.

## Verdict

**GO SOUS CONDITIONS pour démarrer le développement isolé. Aucune autorisation de commercialiser ou déployer.** La stack convient ; le domaine Studio, les workspaces personnels et le traitement vidéo asynchrone restent à construire. La réconciliation SQL est présente localement ; sa validation distante et la restauration restent des préalables aux changements d’infrastructure partagée.

## Méthode et état Git

Le premier texte reçu était tronqué après « pan ». Quelques fichiers de prototype ont été créés avant réception du cahier complet. À réception de l’instruction « livrable initial uniquement », tous ces fichiers et les deux ajouts de configuration associés ont été retirés. Aucun code Studio ne subsiste. L’audit complémentaire a ensuite été conduit en lecture seule ; seuls les six documents Studio sont livrés.

- Dépôt : `/Users/juliengregurec/Documents/btp-platform`.
- Branche de départ : `codex/elsatia-colors-canonical-integration-v1`.
- Branche locale créée : `feat/elsatia-studio-v1`, conformément au nom demandé.
- HEAD de départ : `6a814a2bd6949fced340660657c74c6a22bdcffb`.
- Aucun commit, staging, push, merge ou déploiement effectué dans ce passage.
- Dix fichiers suivis étaient déjà modifiés : `.gitignore`, `eslint.config.mjs`, `next.config.ts`, `scripts/e2e/prepare-local-recipe.sql`, `src/lib/tools-monetization.test.ts`, `tests/e2e/auth-session.spec.ts`, `tests/e2e/helpers.ts`, `tests/e2e/roles-and-direct-access.spec.ts`, `tests/e2e/security.spec.ts`, `tsconfig.json`. Leurs changements sont préservés.
- Six rapports non suivis dans `docs/audits/` et le répertoire `tools/` préexistaient. Ils ne sont ni ajoutés à un commit ni modifiés.

## Inventaire et conséquences

| Domaine | Observation dans le dépôt | Conséquence Studio |
|---|---|---|
| Application principale | `package.json` : `elsatia-gestion-pro` 3.0.0 ; Next `^16.2.12`, React 19.2.4, TypeScript 5, Tailwind 4 | Garder Next/React/TS ; isoler Studio dans `apps/studio`, port local proposé 3030 |
| Applications autonomes | `apps/colors` (3010), `apps/tools` (3020), manifests propres | Réutiliser l’organisation, pas leurs composants métier |
| Monorepo | Apps imbriquées, pas de champ npm `workspaces` racine ; dépendance locale `file:` pour application-access | Pas de migration globale vers Nx/Turborepo ; lockfile et vérification propres à Studio à prévoir |
| Next 16 | `AGENTS.md`, documentation embarquée ; `proxy.ts`, `cookies()` et `params` asynchrones | Suivre cette version ; ne pas copier un ancien middleware |
| Identité | `src/lib/supabase/{server,client}.ts`, `src/app/auth/callback/route.ts` | Même identité Supabase Auth, flux Studio distinct, redirections strictes |
| Contexte entreprise | `apps/colors/src/lib/contexte.ts` refuse un utilisateur ordinaire sans entreprise | Ne pas importer ce contexte pour Studio ; un particulier doit pouvoir entrer |
| Accès commun | `packages/application-access/src/index.ts` : catalogue et RPC ; codes actuels gestion_pro/colors/tools | Ajouter plus tard `studio` par lot transversal ; aucune création de rôle implicite |
| Droits individuels | `20260830000236_elsatia_tools_r8_comptes_entitlements_sync.sql` : entitlements utilisateurs sans entreprise ; niveaux free/pro | Modèle utile pour accès individuel ; insuffisant tel quel pour quatre plans Studio et des workspaces |
| Base | PostgreSQL 17 dans `supabase/config.toml` ; SQL/RPC/RLS, aucun ORM principal imposé | SQL versionné et types TS ; pas de Prisma ajouté sans besoin |
| Migrations | 252 fichiers ; identifiants de 14 chiffres uniques ; dernier fichier trié `20260901000254_migration_canonicalization_v2.sql` | Ne pas confondre suffixe 254 et nombre de fichiers ; réserver un nouveau timestamp au moment du lot A |
| Storage | Supabase Storage privé et URL signées ; limite locale globale 50 MiB | Incompatible avec 1 Go sans configuration/test spécifiques ; ne pas augmenter les buckets Gestion Pro |
| Upload actuel | Préparation, upload navigateur signé, finalisation pour devis/messagerie | Réutiliser le protocole ; remplacer les limites et déplacer la validation vidéo vers un worker |
| Limites devis | `src/lib/devis-medias.ts` : 6 médias, 20 MiB ; ftyp générique identifié audio/mp4 | Ce détecteur ne valide pas une vidéo ; ffprobe doit examiner les pistes réelles |
| Finalisation actuelle | `src/app/api/devis/[id]/pieces-jointes/finaliser/route.ts` télécharge le fichier entier | Ne pas reproduire ce chemin sur des vidéos de 1 Go |
| IA | `src/lib/ai/provider.ts` : interface ProviderIA et fournisseur OpenAI ; désactivation susceptible de lever une erreur | Extraire des contrats neutres ; ajouter un fallback heuristique indépendant des feature flags Gestion Pro |
| Vidéo existante | `scripts/video/monter.py` : FFmpeg, scénarios marketing fixes, fontes macOS, chemins locaux | Référence de filtres uniquement, pas un service multi-tenant réutilisable |
| Runtime vidéo | `ffmpeg` non trouvé dans le PATH local au contrôle ; aucun Remotion/BullMQ/Redis dans les manifests inspectés | Image worker reproductible indispensable ; aucune installation durant l’audit |
| Observabilité | Sentry côté client/serveur/edge, `sendDefaultPii: false` | Adapter avec filtrage explicite des noms, EXIF, tokens et URL signées |
| CI | `.github/workflows/ci.yml` : Node 24, npm ci, audit dépendances, npm run verify | La CI ne lance pas explicitement les apps imbriquées, pgTAP ni Playwright ; ajouter des jobs Studio dédiés |
| Tests | 84 fichiers `src/**/*.test.ts`, 45 fichiers SQL de test, 6 specs E2E racine inventoriés | Inventaire de fichiers, pas preuve de réussite de cette version |
| Déploiement | `vercel.json` : région fra1 et deux crons Gestion Pro ; Next configure Sentry et traçage PDF | Projet web Studio distinct ; crons Gestion Pro à ne pas recopier ; worker hors fonctions web |
| Variables | Exemples Supabase/Auth, HMAC, Sentry, IA, Stripe ; variante ANON_KEY dans Colors | Harmoniser le résolveur de clé publique ; nouveaux secrets worker/queue dans leur périmètre seulement |

## État des preuves et historique

Le rapport [Migration Canonicalization V2](docs/audits/migration-canonicalization-v2.md), associé à la lignée du HEAD actuel, documente le replay frais, les upgrades simulés Preview/Production, l’idempotence et **869 assertions SQL/RLS réussies**. Ces résultats sont historiques, non réexécutés ici. Il supersède les conclusions locales négatives du rapport V1 de réconciliation. Les durcissements UID/AAL2/ACL sont bien présents dans le code courant : l’ancien rapport de précommercialisation décrivant leur absence ne représente plus cet état local.

Le même rapport V2 laisse les validations distantes hors périmètre. Les rapports de sauvegarde/restauration et de préparation de rotation n’apportent pas une preuve actuelle de restauration réelle. L’état des instances, des secrets, des buckets, des alias et de l’identité déployée reste **non vérifié pendant ce passage**. Aucun ancien HTTP 500 n’est présenté comme une panne actuelle observée.

Contrôles exécutés ici :

- `node scripts/verify-migrations.mjs` : **252 migrations valides, noms et horodatages uniques**. Contrôle syntaxique de l’inventaire, pas replay SQL.
- `git diff --check` : réussi au contrôle initial après retrait du prototype.
- Inspection des manifests, routes, policies/configurations, scripts, CI et documentation cités.

Pas de build, installation, test applicatif, SQL/RLS ou E2E exécuté pendant l’audit en lecture seule. Aucun scénario Studio n’est validé à ce stade.

## Réutilisation précise

| Source | Réutilisation proposée | Adaptation / exclusion |
|---|---|---|
| `packages/application-access/src/index.ts` | Interface client RPC, validation code application, contrat du sélecteur | Adapter via Identity/AccessAdapter ; ne pas assimiler workspace et entreprise |
| `src/lib/supabase/keys.ts`, `server.ts`, `client.ts` | Résolution clé publique, session SSR, rafraîchissement | Extraire ou reproduire les helpers neutres avec tests ; pas d’alias vers `src` Gestion Pro |
| `src/lib/security/{cookies,redirects,headers,validation,rate-limit}.ts` | Politique cookies, redirections, CSP, validateurs, limitation | Ajouter scope workspace et routes Studio ; whitelist exacte Storage/TUS ; tester révocation |
| Routes `pieces-jointes/preparer` et composants `DevisEditor`, `ZoneReponseMessagerie` | Enchaînement réservation → signature → upload → finalisation | Nouveau composant accessible/mobile ; TUS et validation asynchrone ; pas de copie des six pièces/20 MiB |
| `src/lib/documents-partage.ts` | Jeton aléatoire, hash stocké, expiration/révocation | Nouvelles tables/permissions pour un rendu vidéo ; aucune lecture des tables devis |
| `src/lib/ai/{provider,validation,journal}.ts` | Contrats, validation et comptage des appels | Journaux Studio, règles fallback, pas de prompts métier ni dépendance aux flags Gestion Pro |
| `src/lib/brand.ts`, `apps/colors/src/components/Brand.tsx` | Identité visuelle et conventions ELSATIA | Nouveau Brand Kit utilisateur ; marque produit distincte |
| `apps/tools/package.json`, `apps/tools/src/lib/platform.ts` | Séparation plateformes et expérience future Capacitor | Aucun shell natif à construire en V1 |
| `supabase/tests/isolation_multitenant_*`, tests multi-app | Méthode de matrice RLS, appels directs, sessions A/B | Fixtures workspaces personnelles/professionnelles indépendantes |
| Configurations Vitest, Playwright, Sentry et CI | Outils, conventions, captures d’échec | Suite et jobs worker séparés, pas de timeout E2E 45 s pour un vrai rendu long |

Ne pas réutiliser : modèles chantier/devis, permissions entreprise comme autorisation Studio, facturation Stripe Gestion Pro, buckets existants, comptes de service surpuissants ou scripts vidéo macOS comme worker SaaS.

## Risques principaux

1. **Identité commune et onboarding personnel** : un compte commun n’implique pas une session partagée entre domaines. Vérifier le flux par application, sans cookies élargis implicitement ; tester le bootstrap sans entreprise.
2. **Infrastructure partagée** : les migrations Studio doivent rester additives et ne pas réintroduire de drift ; preuve de rollback applicatif et restauration avant usage distant.
3. **Vidéo non fiable** : codecs, HEIC/HEVC, VFR, orientation et HDR ; analyse en sandbox, plafonds de ressources et corpus mobile requis.
4. **Coûts et disponibilité** : 100 médias × 1 Go peut représenter 100 Go ; fixer aussi une limite agrégée et réserver atomiquement quotas/disque.
5. **Reprise distribuée** : un job peut être livré plusieurs fois ; empêcher les doubles sorties et doubles consommations, gérer perte Redis et worker mort.
6. **Licences et données personnelles** : vérifier codecs/build, fontes et musique ; métadonnées GPS minimales ; aucun entraînement sur médias clients.
7. **Preuve produit absente** : les scénarios Strasbourg et Croatie sont des critères futurs ; aucune interface locale ou démo ne peut les remplacer.

Architecture et arbitrages : [architecture proposée](ELSATIA-STUDIO-V1-ARCHITECTURE.md). Ordre de réalisation : [roadmap A–L](ELSATIA-STUDIO-V1-ROADMAP.md).
