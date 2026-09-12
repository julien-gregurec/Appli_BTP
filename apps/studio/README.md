# ELSATIA Studio — Lot A

Application autonome dans `apps/studio`, port 3030. Contrats purs dans `packages/studio-domain`. Le Lot A couvre compte ELSATIA/Supabase, workspaces personnels/professionnels, membres, rôles, onboarding et RLS. Aucune dépendance métier Gestion Pro ; aucun upload ni moteur vidéo.

## Installation

Depuis la racine du dépôt :

```sh
npm ci
npm ci --prefix apps/studio
```

Studio verrouille Next **16.3.5**, React **19.2.4**, Supabase SSR **0.12.0**, Supabase JS **2.110.2** et sharp **0.35.4**. Les versions Next/sharp initialement proposées étaient concernées par des avis de sécurité ; seules les dépendances Studio ont été corrigées. Aucune migration globale de la stack.

## Environnement local jetable

Docker doit fonctionner. Le script suivant copie les migrations et les templates Auth dans un dossier temporaire, puis démarre une instance Supabase distincte. Il refuse d’écraser un `.env.local` existant et n’exécute jamais de commande distante. Ne chargez pas le `.env.local` de Gestion Pro.

```sh
node apps/studio/scripts/local-test.mjs setup
node apps/studio/scripts/local-test.mjs test-db
```

Ports par défaut 62320–62329 ; override possible via `STUDIO_TEST_PORT_BASE=63320` si déjà occupés. L’origine Studio est `http://127.0.0.1:3030`. Le script écrit seulement URL/clé **publique** locales dans `apps/studio/.env.local` et un pointeur temporaire `.local-test.json`, tous deux ignorés par Git. Logs de démarrage locaux en permissions 0600 ; ne pas publier leurs clés de fixture.

Pour un environnement local déjà préparé, recopier `.env.example` vers `.env.local` et renseigner ses trois valeurs publiques. Le projet Auth peut être celui de l’identité ELSATIA commune ; la migration Studio doit avoir été appliquée **localement** auparavant. Toute adaptation distante reste hors de ce lot.

```sh
npm run dev --prefix apps/studio
```

## Vérifications

```sh
npm run typecheck --prefix apps/studio
npm run lint --prefix apps/studio
npm test --prefix apps/studio
npm run build --prefix apps/studio
apps/studio/node_modules/.bin/playwright install chromium
npm run test:e2e --prefix apps/studio
```

Alternative sur ce Mac : `STUDIO_E2E_CHANNEL=chrome npm run test:e2e --prefix apps/studio` utilise Chrome installé. La recette démarre **le build de production local**, car Next réécrit les headers de cache en développement. Refaire le build si les variables publiques ou le code changent. Les tests refusent les origines hors `127.0.0.1`, créent uniquement des comptes synthétiques et utilisent la clé publique, jamais service_role.

Pour terminer l’instance créée par le script :

```sh
node apps/studio/scripts/local-test.mjs stop
```

Ce stop ne concerne que l’instance enregistrée dans `.local-test.json`. Il conserve les logs et `.env.local` pour examen ; ce dernier ne pointe alors plus vers un service actif. Déplacer ce fichier avant un prochain `setup`. Le rollback SQL `scripts/rollback-local.sql` est destructif et réservé aux bases locales jetables ; il n’appartient pas à la chaîne de migrations et ne doit jamais être exécuté en Production.

## Parcours et sécurité

- `/login`, `/signup` : compte Supabase commun ; aucun profil/mot de passe dupliqué.
- `/auth/callback` : échange PKCE ; `/auth/confirm` : confirmation token_hash de type email.
- `/onboarding` : bouton d’ouverture/création du workspace personnel, RPC idempotente et verrouillée.
- `/dashboard?workspace=UUID` : workspace actif explicite. Sans paramètre, premier workspace autorisé ; sans aucun workspace, onboarding. Un UUID fourni mais inaccessible donne une page 404, jamais un autre workspace par défaut.
- `/settings?workspace=UUID` : renommage, création professionnelle, archivage owner avec confirmation du nom.
- `/settings/members?workspace=UUID` : liste, ajout d’un compte déjà existant par UUID fourni par la personne, changement de rôle/retrait. Aucun email d’invitation envoyé.

Les membres sont identifiés par UID ; les emails des autres comptes ne sont pas exposés. Tous les accès aux données passent par le service `src/lib/workspaces.ts` ou des actions serveur, avec session vérifiée et politiques DB. Les cookies Studio ont leur propre nom, HttpOnly, SameSite=Lax, Secure en production. Aucun client Auth navigateur ; la déconnexion est locale à la session Studio.

Owner unique/non transférable dans ce lot. Owner/admin peuvent renommer ; seul owner archive. Owner peut gérer admin/editor/viewer ; admin gère uniquement editor/viewer, pas lui-même ni les autres admins. Editor/viewer ne modifient aucun membership. Les écritures directes SQL/PostgREST sont retirées à authenticated/anon ; RPC contrôlées seulement. Une FK composite différée impose un owner valide même lors d’une écriture SQL privilégiée.

## Limites explicites

- Onboarding guidé plutôt que mutation sur GET ; nom initial « Mon Studio », personnalisable.
- Aucun transfert owner ; suppression du compte propriétaire bloquée par FK tant que ses workspaces existent, même archivés. Le processus de purge/compte global sera un lot distinct.
- Archivage logique sans interface de restauration ni purge physique dans A.
- Plafond technique de 20 workspaces actifs possédés par compte ; pas d’abonnement ni d’entitlement commercial implémenté.
- Studio n’est pas encore enregistré dans le sélecteur multi-app : aucun accès Gestion Pro/Colors/Tools n’est accordé implicitement. Ce branchement transversal est différé.
- Le template email commun existant utilise `.SiteURL`. Selon la configuration distante, la confirmation peut ouvrir le portail commun, puis nécessiter une connexion Studio. Aucun SSO/cookie inter-domaines implicite. Configuration/recette email distante non réalisée.
- Les tests locaux Auth ont la confirmation automatique activée (configuration locale existante). Les callbacks invalides et les sessions sont testables localement ; la délivrabilité email distante n’est pas prouvée.
- Aucune fonction du Lot B n’est implémentée.

Voir le rapport racine `ELSATIA-STUDIO-V1-LOT-A-REPORT.md` et le workflow CI `studio-foundation.yml` (validation uniquement, aucun déploiement).
