# ELSATIA Studio — Lots A, B et C

Application autonome dans `apps/studio`, port 3030. Contrats purs dans `packages/studio-domain`. Le Lot A couvre compte ELSATIA/Supabase, workspaces personnels/professionnels, membres, rôles, onboarding et RLS. Le Lot B ajoute import direct TUS signé, bibliothèque privée et réconciliation ; le Lot C complète la gestion des projets et de leurs références média. Aucun moteur vidéo ni dépendance métier Gestion Pro.

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

Ports par défaut 62320–62329 ; override possible via `STUDIO_TEST_PORT_BASE=63320` si déjà occupés. L’origine Studio est `http://127.0.0.1:3030`. Le script écrit URL/clé publique et credential Storage **serveur uniquement**, tous locaux, dans `apps/studio/.env.local` et un pointeur temporaire `.local-test.json`, tous deux ignorés par Git. Logs de démarrage locaux en permissions 0600 ; ne pas publier leurs clés de fixture.

Pour un environnement local déjà préparé, recopier `.env.example` vers `.env.local` et renseigner les trois valeurs publiques et le credential serveur privé. Le projet Auth peut être celui de l’identité ELSATIA commune ; les migrations Studio doivent avoir été appliquées **localement** auparavant. Le credential `STUDIO_STORAGE_SERVICE_KEY` reste strictement côté serveur. Toute adaptation distante reste hors de ce lot.

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

Alternative sur ce Mac : `STUDIO_E2E_CHANNEL=chrome npm run test:e2e --prefix apps/studio` utilise Chrome installé. La recette démarre **le build de production local**, car Next réécrit les headers de cache en développement. Refaire le build si les variables publiques ou le code changent. Les tests refusent les origines hors `127.0.0.1`, créent uniquement des comptes synthétiques et utilisent des sessions utilisateur pour les parcours et attaques. Le test de réconciliation utilise le credential serveur pour ses fixtures locales ; ce secret ne passe jamais dans le navigateur.

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
- Aucune fonction de montage, timeline, rendu ou Lot D n’est implémentée.

Voir le rapport racine `ELSATIA-STUDIO-V1-LOT-A-REPORT.md` et le workflow CI `studio-foundation.yml` (validation uniquement, aucun déploiement).

## Lot B — import et bibliothèque

Créer un projet via `/projects`, puis sélectionner ou déposer plusieurs fichiers dans `/projects/[projectId]`. JPG/PNG/WEBP statiques, MP4/MOV H.264 non fragmentés ; HEIC/HEVC/WEBM non qualifiés. Valeurs par défaut : images 50 Mio, vidéos 1 Gio, projet 5 Gio, workspace 20 Gio, 100 assets/projet, trois transferts simultanés. La table `studio_media_limits` est la configuration autoritaire.

Le navigateur envoie directement à Storage par TUS signé. Pause/réessai reprennent dans le même onglet ; après fermeture, supprimer l’entrée pending puis resélectionner le fichier. Les métadonnées sont inspectées côté serveur par Range borné, sans FFmpeg. Aperçus à la demande par URL privée de 60 secondes. Les suppressions disparaissent immédiatement des listes ; purge physique manuelle après expiration sûre des capacités (30 h après création), avec quotas réservés jusqu’à purge.

```sh
node --env-file=apps/studio/.env.local apps/studio/scripts/storage-reconcile.mjs
node --env-file=apps/studio/.env.local apps/studio/scripts/storage-reconcile.mjs --apply
```

Dry-run par défaut ; commandes exclusivement locales, sans cron. Le test volumétrique génère un vrai transfert de 1 Gio hors Git, injecte une coupure et mesure progression/mémoire. `mp4-muxer` est réservé aux fixtures de test WebCodecs ; il n’est pas importé dans l’application.

Pour tester l’upgrade : `setup --lot-a` installe les 253 migrations Foundation dans une instance neuve ; copier ensuite la migration Lot B dans **ce dossier jetable** puis `supabase db push --local --workdir CHEMIN_JETABLE`. Le mode `setup --lot-b` applique les 254 migrations ; le setup normal inclut les lots C/D (256 migrations). Avant le rollback local `scripts/rollback-media-local.sql`, vider puis supprimer le bucket `studio-originals` avec les API Storage ; le SQL refuse d’effacer directement les tables du fournisseur. Réappliquer ensuite uniquement la migration Lot B dans la même instance jetable. Ne jamais transposer ce rollback à des données réelles.

Détails : [contrat Storage](../../ELSATIA-STUDIO-STORAGE-CONTRACT.md), [rapport Lot B](../../ELSATIA-STUDIO-V1-LOT-B-REPORT.md). La CI couvre les lots A/B/C/D sans déploiement. Confirmation email distante, fournisseur distant, Safari/iOS physique et débit Internet mobile restent à recetter avant mise en ligne.

## Lot C — gestion des projets

La liste propose recherche, filtres, tri et pagination. Le formulaire couvre les sept types, lieu/dates, format et durée (automatique ou 1–600 secondes). Les informations chantier restent libres et facultatives. Enregistrement explicite ; modifier le projet, sélectionner une image de couverture et organiser ses médias ne crée aucune vidéo.

Owner/admin/editor créent, modifient et dupliquent. Owner/admin archivent, restaurent et suppriment après confirmation. Les archives restent lisibles ; restaurez-les avant modification. Viewer reste en lecture seule. Les projets dupliqués partagent les originaux privés, avec un ordre propre. Un média n’est purgé qu’après retrait de sa dernière référence, suivant la rétention Lot B.

`setup --lot-b` prépare 254 migrations pour un upgrade C ; `setup --lot-c` en installe 255 et le setup normal 256. `scripts/rollback-projects-local.sql` est limité à un schéma projet vide dans l’instance jetable et restaure le comportement B ; il refuse les projets peuplés et ne constitue pas une procédure de rollback Production.

Tests supplémentaires : `tests/projects.test.ts`, `projects-service.test.ts`, `projects.spec.ts` et `supabase/tests/studio_project_management.test.sql`. Le workflow Studio les inclut sans déploiement. Voir [rapport Lot C](../../ELSATIA-STUDIO-V1-LOT-C-REPORT.md).

### Montage automatique — Lot D

La section Montage d’un projet génère une composition de données versionnée, sans MP4. Les originaux, uploads et permissions des lots précédents sont conservés. Contrat : `../../ELSATIA-STUDIO-TIMELINE-CONTRACT.md` ; recette : `../../ELSATIA-STUDIO-V1-LOT-D-REPORT.md`.

`node scripts/timeline-migration-check.mjs` qualifie le rollback/réapplication uniquement sur une instance Studio jetable enregistrée, avec tables de montage vides. Le gate exécute maintenant 14 E2E (10 A/B/C + 4 D), sans retries Playwright. Les tests du moteur et des services sont inclus dans `npm test` ; les tests RLS et batch 500 clips dans `local-test.mjs test-db`.

Qualification finale : [rapport D-bis](../../ELSATIA-STUDIO-V1-LOT-D-FINAL-QUALIFICATION.md). `node scripts/e2e-gate.mjs --individual --foundation-first` exécute d’abord le scénario onboarding, puis les 14 scénarios individuellement. Sans options, le gate exécute deux suites complètes sur deux runtimes neufs. Il refuse les résultats skipped/flaky et les échecs de transport ou HTTP 5xx tracés. La readiness vérifie aussi la table timeline et sa RPC de lecture. Réserver une capacité Docker suffisante avant la recette ; le harnais ne modifie jamais les autres services.

### Rendu MP4 — Lot E

La section Vidéo exportée du projet lance maintenant un vrai rendu via le worker séparé `../../workers/studio-video`. Après installation de ses dépendances, le gate complet exécute **18 scénarios A–E, deux fois sur deux bases fraîches**, avec son Redis local dédié. Le mode individuel exécute aussi les 18 scénarios. `render-migration-check.mjs` valide fresh 257, rollback 256, données D, upgrade/réapplication 257.

Le Web reste en profil standard 1080p. `STUDIO_RENDER_INTERNAL_PREVIEW=1`, uniquement côté serveur, sélectionne la demi-résolution pour les recettes. La queue/FFmpeg ne tournent jamais dans Next. Voir le [README worker](../../workers/studio-video/README.md), le [contrat](../../ELSATIA-STUDIO-RENDER-CONTRACT.md) et le [rapport E](../../ELSATIA-STUDIO-V1-LOT-E-REPORT.md). La CI rapide conserve les 14 scénarios A–D et ajoute les vrais rendus unitaires courts ; la qualification complète E est un workflow manuel distinct.
