# ELSATIA Studio — Lot C Projects

Recette locale du 12 septembre 2026. **Verdict : NO-GO de recette.** L’implémentation est présente et les contrôles SQL, unitaires, lint, typecheck et build sont verts. Les exécutions E2E groupées restent perturbées par des indisponibilités Auth/REST/Storage locales ; elles ne satisfont pas le gate « tout vert ». Commits locaux pour revue uniquement, aucun push, déploiement, changement distant ou Lot D.

## Scope

Gestion des projets : sept types, informations générales et chantier facultatives, formats/durée cible, liste paginée, recherche/filtres/tri, dashboard réel, édition explicite, archivage/restauration, duplication, suppression logique, couverture image, ordre manuel accessible et tri chronologique confirmé. Aucun moteur vidéo, timeline, rendu, FFmpeg, Remotion, IA, musique ou template complet.

## Contrôle initial

- Branche `feat/elsatia-studio-v1`, HEAD local et distant `a6442bcecf12f8985061d07b8c3fc9558503740d`, remote `gh` (`git@github.com:julien-gregurec/Appli_BTP.git`).
- Neuf documents demandés lus avant modification, ainsi que les consignes AGENTS et les guides du Next installé concernant Route Handlers et pages à paramètres asynchrones.
- 254 migrations initiales ; dernier fichier `20260912140000_studio_media_upload.sql`. Identifiant `20260912160000` contrôlé libre avant création ; convention horodatage à 14 chiffres, aucun changement historique.
- Dix fichiers suivis déjà modifiés : `.gitignore`, `eslint.config.mjs`, `next.config.ts`, `scripts/e2e/prepare-local-recipe.sql`, `src/lib/tools-monetization.test.ts`, `tests/e2e/{auth-session.spec.ts,helpers.ts,roles-and-direct-access.spec.ts,security.spec.ts}`, `tsconfig.json`. Six rapports non suivis dans `docs/audits/` et `tools/` préexistaient. Préservés et exclus des commits.
- État Git complet, liste des migrations et empreintes SHA-256 initiales conservés dans `/tmp/elsatia-studio-lot-c/`. Environnement local préexistant sauvegardé avant préparation de la base jetable.
- `apps/studio` contient son application Next autonome, API, services, composants, configurations, dépendances, tests Vitest/Playwright et scripts locaux. `packages/studio-domain/src/{index,media}.ts` porte les contrats purs ; nouveau domaine `projects.ts` sans dépendance métier Gestion Pro.
- Schéma initial `studio_projects` : UUID, workspace obligatoire, nom, type construction/travel/event/free, auteur, dates de création/modification/suppression. `studio_media_assets.project_id` désigne un unique projet ; ce lien ne permettait pas une duplication sûre des médias.

## Architecture et modèle projet

Emplacement et identité Foundation conservés. Colonnes projet ajoutées : description, status draft/ready/archived, cover_asset_id, location_label, started_at/ended_at, target_duration_seconds nullable, target_aspect_ratio, metadata_json borné, archived_at et revision.

Types : construction, travel, wedding, birthday, event, memory, free. Labels français séparés des valeurs stockées. Formats 9:16,16:9,1:1,4:5 ; automatique ou durée entière 1–600 secondes, presets 15/30/60/90/120. Dates calendaires, fin ≥ début. Nom 1–100 caractères, description ≤2 000, lieu ≤200. Le statut ready est un statut de préparation du projet, jamais la preuve d’un rendu.

Formulaire unique avec Enregistrer explicite. Les informations client/entreprise/prestations sont trois chaînes facultatives et bornées, réservées au type construction dans metadata_json. Titre chantier/voyage/événement utilise le nom commun ; ville/destination/lieu utilise location_label. Aucune FK vers Gestion Pro. Changer le type ne change pas les médias ; les champs chantier sont retirés du formulaire sauvegardé lors d’un changement vers un autre type.

## Relation projet/médias, duplication et suppression

**Option A : table `studio_project_assets`** avec workspace_id, project_id, asset_id, sort_order et created_at. FKs composites imposent le même tenant des deux côtés. Unicité référence et position par projet ; positions différées pour un réordonnement atomique. Backfill des assets Lot B non supprimés, ordre created_at/id.

`studio_media_assets.project_id` et storage_key restent la provenance immuable d’upload. Une copie crée un projet et des références, jamais un asset physique ou un objet Storage. Métadonnées, paramètres, couverture et ordre copiés ; statut de la copie draft. Les uploads non validés doivent être terminés ou retirés avant duplication, sans omission silencieuse.

Lecture d’asset par RLS via ses références accessibles : une copie continue à lire/signer ses assets après suppression du projet source. Retirer un média agit seulement sur le projet courant. L’ancien endpoint Lot B de suppression retire uniquement la référence du projet d’origine.

Suppression projet après confirmation : soft delete, couverture retirée, références retirées ; tombstone d’un asset seulement s’il n’a plus aucune référence. Un trigger refuse un tombstone encore référencé. Les projets archivés conservent toutes leurs références. Purge physique manuelle conforme à la fenêtre de 30 h Lot B ; vérification supplémentaire d’absence de références avant suppression Storage. La réconciliation expire les références pending/failed par RPC serveur transactionnelle avant tombstone. Les quotas workspace comptent les objets physiques une seule fois ; le quota projet compte ses références et les réservations supprimées mais non purgées de son origine.

## Couverture et ordre

Couverture manuelle : image ready du même projet ; FK de référence et contrôle DB du type/état. Pas de frame vidéo générée. Retirer un média sélectionné retire la couverture correspondante. Aperçu privé à la demande, signature Lot B de 60 s, aucun cache public ni téléchargement de toutes les couvertures au chargement.

Ordre indépendant de toute timeline : panneau de noms de médias, drag/drop et boutons Monter/Descendre, Enregistrer l’ordre explicite. Chargement borné aux références du projet, sans blobs ; grille média paginée par 24 conservée. Le serveur exige l’ensemble exact des références, sans doublons ni étrangers, et une révision courante. Tri chronologique après confirmation, captured_at puis created_at, égalités stabilisées par ordre existant/id. Les métadonnées de capture ne sont pas inventées ; le fallback Lot B reste fréquent.

## Permissions et sécurité

Owner/admin/editor créent, lisent, modifient, dupliquent, choisissent la couverture, réordonnent et importent dans un projet actif. Owner/admin seulement archivent, restaurent et suppriment le projet. Viewer lecture seule réelle. Projet archivé lisible, duplicable par editor+, mais modifications/imports interdits jusqu’à restauration ; restauration en draft.

Session serveur existante ; appels Auth dédupliqués par React cache dans le rendu courant seulement, sans cache partagé entre utilisateurs. UUID contrôlés, Origin sur mutations, SQL/RPC à search_path vide, droits explicites. Verrou workspace partagé avec Foundation pour sérialiser révocation, mutation et suppression. Édition et ordre contrôlent revision et refusent une sauvegarde périmée. Aucun DML direct authenticated sur projets, assets ou références. Dernier owner, cookies et permissions Lot A inchangés ; reprise Auth ciblée décrite ci-dessous.

API projets JSON bornée à 64 Kio pour permettre l’ordre complet de 1 000 références maximum ; API upload Lot B reste bornée à 4 Kio, chunks TUS directs inchangés. Aucun gros média ne transite dans les commandes Next. Clé privée dans l’adaptateur server-only existant ; pas de nouvelle dépendance ou nouveau secret. Clé privilégiée absente des 34 bundles JavaScript navigateur contrôlés. Les erreurs de validation métier sont typées ; les erreurs internes inattendues ne sont pas renvoyées brutes par l’API projets.

## Liste, dashboard et performance

Liste par 24 cartes, recherche littérale nom/description, type/statut/date de modification, tris date création asc/desc, nom, dernière modification. Archives exclues par défaut. Recherche SQL simple, sans moteur externe ; colonnes/index tenant, updated_at/id et références asset/projet.

Une RPC rend la page, son total et ses compteurs médias agrégés ; aucune requête SQL par carte ou média. Les liens des cartes ne préchargent pas les pages projet : pas de rafale cachée de vérifications Auth ou de requêtes par carte avant ouverture. Dashboard : RPC compteurs physiques et RPC projets récents, sans statistiques fictives de rendu. Les aperçus sont des requêtes explicites séparées lorsqu’un utilisateur les ouvre. Compteurs projet calculés par agrégation, aucune colonne de comptage dénormalisée.

Mesure SQL locale (`EXPLAIN ANALYZE BUFFERS`) dans une transaction annulée : 100 projets, 500 médias synthétiques sans fichiers physiques. Liste filtrée paginée : 89,434 ms d’exécution (planification 0,024 ms) ; dashboard : 76,414 ms (planification 0,029 ms). Ce sont les durées DB locales sous RLS, pas une mesure réseau ou un engagement de latence production. Le test de service vérifie une RPC pour la liste et ses compteurs, sans boucle par carte.

## Migration, installation et rollback

Migration additive `20260912160000_studio_project_management.sql`. Tables modifiées : studio_projects, studio_media_assets (unicité tenant + garde), studio_project_assets créée ; fonctions/politique assets adaptées dans cette nouvelle migration uniquement. Aucun objet SQL Lot A modifié, aucun bucket ou objet distant touché.

Upgrade initial depuis 254 migrations : PASS. Rollback et réapplication : PASS sur schéma Studio vide. Upgrade supplémentaire avec projet Lot B et deux réservations préexistantes : PASS, deux références créées dans le bon tenant et dans l’ordre, sans duplication des assets. `rollback-projects-local.sql` refuse un schéma projet peuplé : retour arrière destructif uniquement pour recette jetable, jamais un mécanisme de restauration de données réelles.

Replay frais des 255 migrations et suite SQL finale : PASS, 48 fichiers et 1 072 assertions. Le helper local propose `setup --lot-b` et conserve `--lot-a` en excluant les migrations des lots suivants dans la copie jetable. Aucun fichier historique renuméroté.

## Tests

| Contrôle | Résultat actuel |
|---|---|
| Studio unitaires | 119 tests /7 fichiers PASS |
| SQL A/B/C | 1 072 assertions /48 fichiers PASS sur installation fraîche |
| Studio typecheck/lint/build | PASS |
| Upgrade peuplé/backfill | PASS |
| Rollback/réapplication | PASS |
| Fresh install | 255 migrations PASS |
| TUS réel 1 Gio | PASS en 5,0 min ; coupure injectée, pause/reprise et 172 PATCH |
| E2E complet A/B/C | Dernière exécution : 7/10 PASS ; 3 échecs Auth (session volumineuse, inscription B, connexion mobile C) |
| Reprise ciblée | 3/4 PASS ; session volumineuse, B mobile/MOV/A-B, C mobile verts ; C Chantier échoue sur une réponse de rôle indisponible |
| E2E Chantier C | PASS sur exécution complète ; reprise finale non verte, avant le contrôle renforcé de la grille après restauration |
| E2E Voyage C | PASS, dont tri, duplication, conservation après suppression source et purge après dernière référence |
| E2E mobile C | PASS en reprise ciblée, dont média présent après édition/reload, API étrangère et viewer refusés |
| Non-régression A/B | Tous les scénarios ont passé séparément, mais aucune exécution groupée finale intégralement verte |
| Gestion Pro/Colors/Tools | Typecheck/lint PASS ; 646/27/107 tests PASS (3 warnings image préexistants racine) |
| Audit dépendances | Studio : 0 vulnérabilité |

## Correctifs de recette

Test volumétrique final : 1 073 741 824 octets transférés directement, une coupure injectée, reprise à offsets non nuls (maximum 1 069 547 520). Payload maximal vers Next : 108 octets. Heap JS navigateur : 8 211 820 → pic 12 894 712 octets (environ +4,5 Mio). RSS Next : 159 629 312 octets avant et au pic mesuré. Les deux plafonds de croissance de 200 Mio sont respectés. Fixture synthétique hors Git ; aucune prétention sur le débit Internet ou le décodage d’une vidéo longue réelle.

La première recette a identifié un droit SELECT manquant du credential de réconciliation sur la nouvelle table de références. Ce droit de lecture seul a été ajouté dans la migration C, accompagné d’une assertion SQL ; aucune mutation directe supplémentaire autorisée. Un test navigateur utilisait un sélecteur exact de label incluant le texte des options : remplacement par le nom accessible de la combobox. Les logs Auth locaux ont aussi confirmé des timeouts PostgreSQL lors d’une réponse 401 inattendue ; aucune assertion de sécurité assouplie. Les appels Auth redondants des Server Components ont été dédupliqués dans la requête courante ; les cookies, tokens et rôles Foundation demeurent inchangés. La lecture vérifiée de l’identité dans `workspaces.ts` et `media-service.ts` passe par `verified-user.ts` : une seule reprise sur erreur Auth réseau/5xx, aucune reprise sur 401/session absente, puis erreur temporaire explicite plutôt qu’une fausse déconnexion. Cinq tests unitaires couvrent ce changement ciblé, justifié par les timeouts effectivement observés.

## Limites et risques restants

La première recette complète de la migration finale a donné 7 E2E verts et 2 échecs (Foundation et Chantier). Les logs Auth ont identifié des timeouts DNS de `127.0.0.11:53` vers le PostgreSQL jetable, dans un Docker hébergeant plus de 60 conteneurs préexistants. Une entrée locale de résolution a été ajoutée dans Auth. Une reprise a encore rencontré des indisponibilités Auth/Storage. Le redémarrage des seuls services applicatifs jetables a ensuite permis l’exécution complète, dont le transfert 1 Gio, mais avait effacé cette entrée (vérification de `/etc/hosts`).

Correction de recette finale : résolution du seul hostname PostgreSQL jetable vers son IP interne dans `/etc/hosts` des conteneurs Auth, Storage et REST de cette instance, après le redémarrage. Aucun conteneur extérieur à cette instance modifié ou arrêté, aucune politique SQL, session ou assertion assouplie. Cette adaptation locale disparaît au redémarrage/suppression des conteneurs ; elle ne fait pas partie du déploiement applicatif. Les échecs et leurs traces sont conservés avec les reprises, sans activation de retry automatique Playwright.

Le cockpit distingue aussi une indisponibilité Auth d’un projet introuvable ; les accès étrangers restent introuvables et une session absente redirige vers la connexion. Le message « Informations enregistrées » disparaît dès une nouvelle édition.

La dernière reprise a aussi montré qu’une erreur REST lors de `studio_my_role` était assimilée à un rôle absent. Correction finale dans les lectures projet/média/rôle : une erreur de service donne 503, un résultat réellement absent reste 404, les rôles insuffisants restent refusés. Quatre tests ciblés valident ces distinctions sans accorder d’accès sur erreur. Les 119 unitaires, lint, typecheck et build ont été rejoués après ce correctif. Les E2E complets n’ont pas été requalifiés sur cette dernière version : gate ouvert explicitement, aucun résultat rouge masqué.

- Pas de moteur vidéo ni Lot D. Pas de transfert entre workspaces, import de références arbitraires, duplication de médias incomplets ou restauration d’un projet supprimé.
- Duplication explicite d’un projet archivé crée un brouillon actif ; restauration ne tente pas de reconstruire son ancien statut ready.
- Couverture choisie manuellement ; placeholder sans couverture et aperçu privé demandé par bouton.
- Réconciliation locale manuelle, rétention et risques des capacités d’upload hérités du Lot B. Aucune planification ni purge distante activée.
- Reprise TUS dans le même onglet seulement ; formats et inspection légère Lot B inchangés.
- CI GitHub distante, Safari/iOS physique, réseau Internet/mobile et déploiement fournisseur non validés par la recette locale. Une future mise en ligne exige sa propre autorisation et les gates du document DEPLOYMENT.

## Lot D readiness

**Non.** Les contrats préparent ordre, format, durée, type, informations et couverture ; aucune timeline ni tâche de rendu n’est créée. Prochaine action : stabiliser le runtime Supabase local (notamment résolution/connexions inter-conteneurs), puis rejouer les dix E2E sur le build final et vérifier le push seulement lorsque tous les gates sont verts. Ne pas commencer Lot D.

## Files changed

- `packages/studio-domain/src/projects.ts` et exports : contrats, enums, validation et ordre.
- `apps/studio/src/lib/{projects,database,media-service,verified-user,workspaces}.ts` : services, types et contrôle d’identité vérifiée.
- `apps/studio/src/app/{projects,dashboard,api/projects,api/media}` et composants Project*/MediaLibrary : cockpit, liste, compteurs et mutations.
- Migration C et `supabase/tests/studio_project_management.test.sql` : références, fonctions, permissions et régression A/B.
- Tests projets unitaires/API/E2E, scripts de rollback/benchmark/réconciliation et workflow Studio.
- Architecture, contrat Storage, README Studio et présent rapport. Aucun package-lock ni migration historique modifié.

## Traçabilité et clôture locale

Code conservé dans `34640395` ; tests et scripts dans `27a7e3f6` ; documentation dans le commit suivant. Le remote `gh/feat/elsatia-studio-v1` a été vérifié inchangé à `a6442bcecf12f8985061d07b8c3fc9558503740d`. Aucun push tant que la recette finale n’est pas entièrement verte.

Logs SQL/fresh/upgrade/rollback/benchmark, exécutions E2E, traces, captures et mesures 1 Gio conservés dans `/tmp/elsatia-studio-lot-c/` et le dossier jetable consigné par les logs. Captures tablette 820 px et mobile 390 px inspectées ; aucun débordement horizontal. La capture tablette précédait le chargement asynchrone de sa grille ; le test a été renforcé pour attendre les sept médias après restauration, mais cette assertion n’a pas été atteinte dans la dernière reprise interrompue. La grille mobile après reload a été vérifiée avec son média.

Instance `elsatia-studio-a-ib9acv` supprimée exclusivement par le helper local, fixture volumétrique `large.mp4` générée pour ce lot retirée, `.env.local` préexistant restauré à l’identique. Les dix fichiers suivis modifiés avant ce lot ont leurs empreintes initiales inchangées ; les rapports non suivis et `tools/` préexistants sont conservés hors commits.
