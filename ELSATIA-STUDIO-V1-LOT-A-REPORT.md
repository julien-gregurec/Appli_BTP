# ELSATIA Studio — Lot A Foundation

Date : 12 septembre 2026. Périmètre : développement et validation locale uniquement. Production et projet Supabase distant intouchés. Aucun Lot B commencé.

## Scope

Application Next.js autonome, identité Supabase commune, workspaces personnels/professionnels, appartenance, rôles owner/admin/editor/viewer, onboarding guidé idempotent, sélection du workspace, paramètres/membres et dashboard minimal. Les fonctions projet/vidéo restent explicitement indisponibles.

Aucun upload, stockage média, FFmpeg, Remotion, BullMQ, Redis, IA, timeline, template vidéo, musique, rendu, éditeur, Brand Kit complet ni paiement Stripe.

### Contrôle initial

- Branche : `feat/elsatia-studio-v1`.
- HEAD initial : `6a814a2bd6949fced340660657c74c6a22bdcffb`.
- Les six références MASTER-PLAN, AUDIT, ARCHITECTURE, ROADMAP, TEST-PLAN et DEPLOYMENT étaient présentes à la racine et ont été lues avant modification.
- Architecture existante : application Gestion Pro racine, applications Next séparées `apps/colors` et `apps/tools`, domaine partagé dans `packages`, migrations Supabase communes. Aucun module Réserves autonome identifié sur ce checkout.
- Migrations initiales : **252**, dernier identifiant `20260901000254`, convention horodatage à 14 chiffres. Le nouvel identifiant `20260912120000` a été contrôlé absent avant création ; inventaire final **253 identifiants uniques**. Aucune migration historique modifiée ou renumérotée.
- Remote normal : `gh` (`git@github.com:julien-gregurec/Appli_BTP.git`). Livraison réservée à la branche demandée, sans fusion ni déploiement.

État Git initial (changements conservés hors des commits du lot, sauf les six documents Studio qui appartiennent au cadrage) :

```text
 M .gitignore
 M eslint.config.mjs
 M next.config.ts
 M scripts/e2e/prepare-local-recipe.sql
 M src/lib/tools-monetization.test.ts
 M tests/e2e/auth-session.spec.ts
 M tests/e2e/helpers.ts
 M tests/e2e/roles-and-direct-access.spec.ts
 M tests/e2e/security.spec.ts
 M tsconfig.json
?? ELSATIA-STUDIO-V1-ARCHITECTURE.md
?? ELSATIA-STUDIO-V1-AUDIT.md
?? ELSATIA-STUDIO-V1-DEPLOYMENT.md
?? ELSATIA-STUDIO-V1-MASTER-PLAN.md
?? ELSATIA-STUDIO-V1-ROADMAP.md
?? ELSATIA-STUDIO-V1-TEST-PLAN.md
?? docs/audits/database-credential-rotation-readiness-v1.md
?? docs/audits/dedicated-backup-role-security-gate-v1.md
?? docs/audits/migration-history-reconciliation-v1.md
?? docs/audits/pre-commercialisation-finale-v1.md
?? docs/audits/production-backup-restore-readiness-v1.md
?? docs/audits/remote-state-audit-v1.md
?? tools/
```

Une empreinte SHA-256 des dix fichiers modifiés préexistants a été conservée hors dépôt. Leur contenu est préservé, abstraction faite des deux exclusions Studio ajoutées à TypeScript/ESLint. Seules ces exclusions sont indexées dans les fichiers racine concernés.

## Architecture

Emplacement exact : `/Users/juliengregurec/Documents/btp-platform/apps/studio`. Contrats indépendants : `/Users/juliengregurec/Documents/btp-platform/packages/studio-domain`.

Décision conforme aux applications autonomes du dépôt : manifeste, lockfile, build, lint, tests et environnement propres ; port local 3030. Next **16.3.5**, React **19.2.4**, TypeScript strict, Supabase SSR **0.12.0** / JS **2.110.2**. Les guides Next installés ont été consultés pour App Router, cookies asynchrones, proxy, actions serveur et CSP.

Réutilisation : identité `auth.users`, SDK/SSR Supabase, conventions Next et infrastructure de migrations/tests pgTAP. Pas d’import des services, menus, permissions ou modèles métier Gestion Pro. Le trigger commun d’inscription existant crée un profil `utilisateurs`, sans entreprise obligatoire ; il est conservé. Aucun second registre d’utilisateurs ni mot de passe Studio.

Les choix effectivement retenus sont consignés dans la section 9 du document ARCHITECTURE : rôles à quatre niveaux, tables préfixées, onboarding POST guidé, archivage, cookies dédiés et catalogue commercial différé. Les contrats futurs se limitent à `workspaceId`/`userId` et à un adaptateur d’identité ; aucun schéma média/projet anticipé.

## Files changed

- `apps/studio/src/app/` : routes Auth, onboarding, dashboard, paramètres et membres ; actions serveur et styles.
- `apps/studio/src/lib/` : configuration publique, client SSR serveur, schéma DB typé et services workspace.
- `apps/studio/src/components/`, `src/proxy.ts` : navigation autonome, formulaires accessibles, session/CSP/cache.
- `apps/studio/package*.json`, configurations Next/TS/ESLint/Vitest/Playwright, `.env.example`, `.gitignore`, consignes Next générées.
- `packages/studio-domain/` : contrats et validations purs.
- `supabase/migrations/20260912120000_studio_workspace_foundation.sql`.
- `supabase/tests/studio_workspace_foundation.test.sql`, `apps/studio/tests/`.
- `apps/studio/scripts/` : environnement jetable et rollback exclusivement local.
- `.github/workflows/studio-foundation.yml` : validation PR/manuelle, aucun déploiement.
- `tsconfig.json`, `eslint.config.mjs` racine : uniquement exclusion de l’application Studio.
- Six documents de cadrage Studio, présent rapport et `apps/studio/README.md`.

## Database changes

Deux nouvelles tables uniquement : `public.studio_workspaces` et `public.studio_workspace_members`. Références d’identité vers `auth.users`, aucune FK vers entreprise, employé, chantier ou abonnement Gestion Pro.

Workspace : UUID, nom, type personal/professional, propriétaire, horodatages, archivage `deleted_at`. Membership : UUID, workspace/user, rôle et horodatages. Index par utilisateur/workspace, unicité membership, unicité workspace personnel actif par propriétaire, unicité owner.

La FK composite différée `studio_owner_membership_fk` impose une ligne owner correspondant à `owner_user_id` à la fin de chaque transaction. L’insertion workspace + owner est atomique. Même un SQL privilégié ne peut supprimer le dernier owner sans violer la contrainte.

Migration appliquée seulement sur deux instances Docker locales jetables propres à Studio. Ces deux instances ont été arrêtées après validation ; les autres environnements locaux ont été conservés. Le script `local-test.mjs stop` a également été validé. Upgrade 252 → 253 validé ; rollback local puis réapplication validés ; reset local complet et seconde installation vide des 253 migrations validés. Le rollback destructif n’est pas ajouté à l’historique forward-only et ne convient pas à une base peuplée réelle.

## RLS policies

RLS activée sur les deux tables. SELECT autorisé à `authenticated` uniquement si `studio_my_role(workspace_id)` retourne le rôle de `auth.uid()` dans un workspace actif. Les membres d’un workspace voient ses membres. Un workspace archivé et ses memberships deviennent invisibles.

**Écritures directes interdites** : aucun droit INSERT/UPDATE/DELETE et aucune politique permissive correspondante. Les mutations passent uniquement par les RPC suivantes, avec `SECURITY DEFINER`, `search_path = ''`, références qualifiées, droits EXECUTE explicites et identité dérivée de `auth.uid()` :

| Opération | Autorisation imposée par la base |
|---|---|
| Créer un workspace | Compte authentifié existant ; owner fixé au compte appelant |
| Renommer | Owner/admin |
| Archiver | Owner uniquement |
| Ajouter/modifier/retirer editor ou viewer | Owner/admin |
| Ajouter/modifier/retirer admin | Owner uniquement |
| Créer un autre owner, promouvoir en owner, retirer/modifier owner | Interdit dans Lot A |
| Mutation editor/viewer ou utilisateur extérieur | Interdite |

Les RPC de mutation verrouillent le workspace avant contrôle du rôle pour sérialiser révocation et mutation. L’onboarding verrouille l’identité ; huit appels concurrents produisent un seul workspace personnel. Aucun droit de ces objets n’est accordé à anon/service_role ; le backend applicatif utilise exclusivement l’identité utilisateur.

## Auth flow

Routes autonomes `/login`, `/signup`, `/auth/callback` (PKCE), `/auth/confirm` (token email), logout via action serveur. Vérification serveur `auth.getUser()` ; redirection login sans session ; redirection dashboard après connexion puis onboarding si aucun workspace.

Cookies séparés `elsatia-studio-auth`, HttpOnly, SameSite=Lax, Secure en production ; déconnexion locale à la session Studio. Aucun client Auth navigateur ni clé service_role. Proxy de rafraîchissement, contrôles de session dans les services, CSP à nonce et cache privé `no-store`. Le workspace actif est vérifié indépendamment des cookies.

L’identité commune ne signifie pas SSO automatique entre domaines. La confirmation email distante n’a pas été testée : le template commun utilise `.SiteURL`, donc peut ouvrir le portail ELSATIA avant une connexion Studio. Aucun template ou paramètre distant modifié.

## Workspace flow

`/dashboard?workspace=UUID`, `/settings?workspace=UUID`, `/settings/members?workspace=UUID`. Sélecteur visible limité aux memberships accessibles. Sans paramètre : premier workspace autorisé selon ordre déterministe ; aucun workspace : onboarding. UUID explicite malformé/étranger : 404, sans repli silencieux sur un autre workspace.

Toute action revalide session, UUID, appartenance et rôle ; la base refait l’autorisation. Les membres sont affichés par UID, sans divulguer les emails des autres comptes. Ajout limité à un compte existant dont l’UID est connu ; invitations email différées.

## Onboarding flow

Nouvel utilisateur sans entreprise → inscription/connexion Supabase → onboarding → bouton « Ouvrir mon Studio personnel » → RPC → workspace « Mon Studio » + owner → dashboard. Le nom est ensuite personnalisable.

Le bouton peut être rejoué ; le workspace personnel actif existant est retourné. L’unicité et le verrou protègent aussi des appels REST concurrents. Un utilisateur déjà membre accède directement au dashboard et peut créer un workspace professionnel ou sélectionner un autre workspace autorisé.

## Tests

| Vérification exécutée | Résultat |
|---|---|
| Inventaire `node scripts/verify-migrations.mjs` | 253 migrations, identifiants uniques |
| Upgrade local depuis les 252 migrations existantes | Réussi |
| Rollback Studio local puis réapplication | Réussi |
| Installation fraîche complète / reset local | 253 migrations appliquées sans erreur |
| Script reproductible `local-test.mjs setup` sur seconde instance vide | Réussi |
| `local-test.mjs test-db` / suite pgTAP complète | **46 fichiers, 927 assertions : PASS** |
| pgTAP Studio | **58 assertions : PASS** |
| Studio Vitest | **2 fichiers, 16 tests : PASS** |
| Studio E2E Chrome, build production local | **3 scénarios : PASS** |
| Studio typecheck / lint / build webpack | Verts ; build production local réussi |
| Gestion Pro/racine Vitest | **85 fichiers, 646 tests : PASS** |
| Gestion Pro/racine typecheck / lint | Verts ; 3 avertissements image préexistants, aucune erreur |
| Colors typecheck / lint / Vitest | Verts ; **6 fichiers, 27 tests : PASS** |
| Tools typecheck / lint / Vitest | Verts ; **20 fichiers, 107 tests : PASS** |
| Audit npm Studio après correction des versions | **0 vulnérabilité** |
| `git diff --check` | Vert |

Tests Studio : utilisateur neuf sans entreprise, owner automatique, onboarding répété et concurrent, comptes existants, multi-workspaces et sélection, isolation A/B en lecture et écriture, membres, rôles owner/admin/editor/viewer, interdiction des promotions, FK du dernier owner, révocation, archivage, appels REST directs avec jeton invalide, signup UI, logout, reconnexion UI, contexte navigateur vierge, cookies sécurisés et sessions fragmentées, cache/CSP, viewport mobile sans débordement. Capture mobile examinée localement.

Les tests ont d’abord révélé des problèmes de recette résolus : Chromium attendu absent sur ce Mac (utilisation de Chrome installé), headers de développement différents de production (test sur `next start`), ambiguïtés de labels et attente de navigation, latence locale d’Auth (attente bornée 15 secondes, aucun retry automatique ; un rejeu a rencontré un timeout DB confirmé par les logs Auth, puis la première instance jetable devenue inutile a été arrêtée). La revue finale a aussi corrigé un écrasement du nom des cookies fragmentés : les attributs de sécurité sont désormais séparés du nom de stockage. Un test navigateur avec des métadonnées de compte volumineuses vérifie les fragments distincts, la session après rechargement et leur suppression au logout. Le test de reconnexion vérifie `/dashboard` et le nom du workspace effectivement sélectionné, sans supposer une query ajoutée automatiquement.

Pour Tools, trois duplicatas générés préexistants `apps/tools/.next/types/* 2.ts` empêchaient le typecheck. Ils ont été déplacés hors du dépôt vers `/tmp/elsatia-studio-lot-a/tools-generated-duplicates` ; aucun fichier source Tools modifié. Les contrôles ont ensuite réussi.

**Non exécuté intégralement :** build complet racine et suites navigateur historiques Gestion Pro/Colors/Tools. Un lancement navigateur racine a été interrompu après erreurs d’infrastructure (navigateur/fixtures locales non préparés) ; il n’est pas compté comme validation. Les tests unitaires, SQL et typechecks pertinents ci-dessus couvrent la non-régression retenue. La CI ajoutée n’a pas encore été exécutée sur GitHub. Aucun test ni migration distants.

## Security checks

- Isolation DB réelle avec utilisateurs synthétiques A/B, quatre rôles, anon, accès REST direct et interdiction DML.
- Owner unique garanti par contrainte relationnelle, pas seulement par l’interface.
- Identifiants et noms validés ; redirections bornées aux routes Studio ; pas de confiance dans un workspace transmis par formulaire.
- Scanner de secrets du dépôt exécuté sur les fichiers indexés : aucun secret reconnu.
- Pas de cache partagé des données de session ; contrôles de membership répétés et politiques RLS.
- Aucun service_role ni secret privé dans l’app ; `.env.local`, état jetable, builds et traces ignorés par Git. Les logs de démarrage générés par Supabase restent locaux en permissions 0600.
- Dépendances Studio corrigées suite à l’audit npm (Next/sharp), sans migration des apps existantes.
- Production, main/master, migrations historiques et configuration Supabase distante intouchés.

## Known limitations

Owner non transférable ; aucune purge/restauration via UI ; suppression du compte propriétaire bloquée par FK tant que ses workspaces existent, même archivés. Plafond technique de 20 workspaces actifs possédés, sans abonnement. Ajout de membre par UUID seulement, pas d’invitation email. Pas de SSO inter-domaines automatique, de catalogue commercial Studio ni d’entitlements transversaux dans cette foundation. Navigation projets/templates/Brand Kit désactivée.

## Risks remaining

La confirmation email et la configuration des origines devront être recettées avant toute mise en ligne autorisée. Une application future sur base distante exige le contrôle du ledger cible et des sauvegardes prévu au DEPLOYMENT ; aucune preuve locale ne remplace cette recette. La suppression globale des comptes propriétaires et les transferts nécessitent un lot dédié. Les objets futurs devront conserver la même isolation et ajouter leurs propres politiques/tests. Les suites navigateur historiques et l’exécution CI distante restent à réaliser avant une release générale.

## Lot B readiness

**GO pour Lot A local ; prêt pour Lot B sur nouvelle instruction.** Les fondations d’identité, workspace, appartenance, rôles, services et tests sont utilisables. L’installation fraîche, les migrations, la RLS et le scénario sans entreprise sont validés. Le périmètre validé n’est pas une autorisation de déploiement.

Prochain lot recommandé : **B — Media upload**, uniquement après nouvelle instruction ; aucun travail média lancé ici.

## Livraison Git

Commit applicatif et tests : `101822a1` — `feat(studio): add authenticated workspace foundation and isolation tests`. Le commit documentaire contient le cadrage, les décisions réelles, la procédure locale et ce rapport. Push réservé au remote `gh`, branche `feat/elsatia-studio-v1`, après tous les contrôles ; son résultat et le HEAD final sont fournis dans le compte rendu terminal. Aucun squash, merge, force push ni déploiement.
