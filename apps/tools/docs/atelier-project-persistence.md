# Atelier — socle projet & autosave (ELSATIA-TOOLS-ATELIER-PROJECT-PERSISTENCE-V1)

Ce lot pose la **persistance locale** de l'Atelier de traçage : repository `TracingProject`,
migration de schéma, autosave, récupération de brouillon, accueil `/atelier` et flux
« nouveau tracé ». Il **ne touche pas** au moteur géométrique (`src/lib/geometry/**`).

## Fichiers

| Rôle | Fichier |
| --- | --- |
| Modèle métier (inchangé sauf `modelId` / `startFromPhoto`, schéma v2) | `src/lib/tracing/project.ts` |
| Frontière de lecture tolérante / migration v1→v2 | `src/lib/tracing/migration.ts` |
| Repository local (IndexedDB + mémoire), interface remplaçable | `src/lib/tracing/repository.ts` |
| Pointeur de brouillon + `evaluateDraftRecovery` | `src/lib/tracing/draft.ts` |
| Contrôleur d'autosave (debounce + flush cycle de vie) | `src/lib/tracing/autosave.ts` |
| Catalogue minimal de modèles (§8) | `src/lib/tracing/atelier-models.ts` |
| Aides accueil / assistant (pures) | `src/lib/tracing/atelier.ts` |
| Pont React (repository + autosave + pointeur) | `src/lib/tracing/use-atelier-autosave.ts` |
| Accueil Atelier | `src/app/atelier/page.tsx` · `src/components/AtelierWorkspace.tsx` |
| Nouveau tracé (type → infos → modèle → photo) | `src/app/atelier/nouveau/page.tsx` · `src/components/NouveauTraceWorkspace.tsx` |

## Schéma & migration

- `TRACING_PROJECT_SCHEMA_VERSION = 2`.
- v1 → v2 : ajout de `modelId?` (slug de modèle stable) et `startFromPhoto?` (intention photo),
  tous deux optionnels. La migration se contente de borner la version.
- `validateTracingProject` reste **strict** (version courante uniquement).
- `migrateTracingProject` : accepte la version courante, migre les versions connues, **refuse**
  une version future / retirée, **refuse** un champ inconnu de premier niveau (jamais d'écrasement
  silencieux), délègue la cohérence (identifiant, type, dates) à `validateTracingProject`.

## Persistance locale

- IndexedDB, base `elsatia-atelier`, store `tracing-projects` (index `updatedAt`).
- Cloisonnement par entreprise : `elsatia-atelier-company:<id>` (cf. `tracingStorageScope`).
- `localStorage` sert **uniquement** au pointeur de brouillon (petit, synchrone) — jamais un
  projet complet.
- `TracingProjectRepository` est une interface (`IndexedDb…` / `Memory…`) : la synchronisation
  cloud future fournira une implémentation supplémentaire sans toucher aux appelants.

## Autosave (§4)

`AutosaveController` : debounce 1,5 s, `flush()` immédiat sur `visibilitychange` (onglet masqué)
et `pagehide`, aucune boucle permanente (`setTimeout` de debounce uniquement), `save` injecté
(aucune requête cloud). Le pont React écrit d'abord le **pointeur** (synchrone) puis déclenche
le flush, pour maximiser la survie d'un état partiel à une fermeture brutale.

## Récupération de brouillon (§5)

`evaluateDraftRecovery(pointer, project, now)` :

- pas de pointeur / pointeur `closedCleanly` → rien ;
- pointeur trop ancien (> 7 j) ou projet disparu → `stale` (le pointeur est nettoyé) ;
- **projet stocké plus récent que le brouillon → `superseded`** : on ne revient jamais en arrière ;
- sinon → `recoverable` : bandeau « Un tracé non terminé a été retrouvé. » `[ Reprendre ] [ Ignorer ]`.

`Ignorer` marque le pointeur `closedCleanly` (aucune suppression de projet).

## Cloud — reprise du pattern `ToolProject` (différé, hors de ce lot)

Aucune table Supabase n'est créée ici. Une synchronisation cloud ultérieure peut **reprendre
tel quel** le pattern éprouvé de `src/lib/projects/sync.ts` :

1. `SyncStateRepository` (file d'attente IndexedDB `elsatia-atelier-sync`, une entrée par tracé :
   `revision`, `dirty`, `status`, `deletedAt?`).
2. `CloudProjectStore` (interface `push` / `pull`) — implémentation Supabase via RPC
   `tools_sync_project_entreprise` + table `tools_projects` (payload JSON + `revision` +
   `cloud_updated_at`), **ou une table dédiée `tools_tracing_projects`** au même format.
3. `SyncService` : `enqueue` après chaque `save` du repository (brancher un `MutationSink` sur
   `TracingProjectRepository.save`, comme `AccountProvider` le fait pour `ToolProject`),
   résolution de conflit par **préservation** (copie locale « conflit <appareil> <date> »),
   `push` des `dirty` puis `pull` incrémental sur `cloud_updated_at`.
4. Déclenchement identique : `syncNow()` dans `AccountProvider`, gardé par `access.tier === "pro"`,
   `navigator.onLine`, et vérification d'accès entreprise.

Le contrat local ne change pas : `migrateTracingProject` reste la frontière de lecture, y compris
pour les payloads venus du cloud.
