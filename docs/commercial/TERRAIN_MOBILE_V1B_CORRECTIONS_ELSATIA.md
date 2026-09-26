# TERRAIN-MOBILE-V1B — Correctifs des 2 P0 terrain + P1 comptes-rendus

Référence : `docs/commercial/TERRAIN_MOBILE_V1_AUDIT_ELSATIA.md` (audit initial, commit `fef8e0e`) et `docs/commercial/TERRAIN_MOBILE_V1_CHECKLIST.md`. Branche `claude/terrain-mobile-v1b-fixes`, depuis `claude/terrain-mobile-v1-audit` (commit `fef8e0e`). Corrige exclusivement les 2 P0 identifiés (documents/photos, notes de frais) et le P1 associé (comptes-rendus, même cause que le premier P0). Aucun autre P1/P2/P3 traité, aucune refonte de l'interface terrain, aucun mode offline, aucune notification push.

## 1. P0 n°1 — documents/photos/comptes-rendus inaccessibles au terrain

### Reproduction (avant correctif)

Profil Terrain et profil Chef d'équipe, tous deux **sans** `gerer_chantiers` (configuration par défaut réelle, aucun des deux postes ne l'a) :

| Action | URL | Résultat |
|---|---|---|
| Ouvrir `/chantiers/[id]/documents` | GET | 200, page affichée |
| Ajouter une photo | POST (Server Action `ajouterDocumentChantierAction`) | Formulaire absent de l'écran (aucun `<form>` d'ajout visible), rien à soumettre |
| Ouvrir `/chantiers/[id]/comptes-rendus` | GET | 200, page affichée |
| Enregistrer un compte-rendu | POST (Server Action `enregistrerCompteRenduAction`) | Redirection silencieuse vers `?lecture=seule`, puis erreur cliente générique (« An unexpected response was received from the server ») |

### Cause racine confirmée

Deux couches distinctes bloquaient toute écriture sous `/chantiers/[id]/...`, sans distinguer les sous-ressources terrain (documents, photos, comptes-rendus) du reste de la gestion d'un chantier (modification, suppression, budget, client, planning) :

1. **Middleware + `ModuleAccessBoundary`** (`src/lib/module-permissions.ts`) : la règle générique `["/chantiers","gerer_chantiers"]` de `GESTION_PERMISSION_PAR_CHEMIN` s'applique par préfixe à **tout** chemin sous `/chantiers/*`, y compris `/chantiers/[id]/documents` et `/chantiers/[id]/comptes-rendus`. Le middleware serveur (`src/lib/supabase/proxy.ts`) redirige toute mutation vers `?lecture=seule` faute de `gerer_chantiers`, et le composant client `ModuleAccessBoundary` masque en parallèle les formulaires POST via une classe CSS `.lecture-seule`.
2. **RLS** : `documents_chantier` (policy `role_gestion_insert`, **RESTRICTIVE**) exige `gerer_chantiers` sans alternative — une simple policy PERMISSIVE additionnelle n'aurait pas suffi, une policy RESTRICTIVE doit systématiquement être satisfaite en plus des permissives. Le bucket de stockage `chantier-documents` porte la même règle RESTRICTIVE générique (`role_gestion_fichiers_insert`, partagée avec 4 autres buckets). `comptes_rendus_chantier`, à l'inverse, n'avait **aucune** vérification de permission (`for all ... using (est_membre_actif(entreprise_id))`) — une policy trop permissive côté RLS, mais neutralisée en pratique par le blocage n°1 côté middleware.

### Correction

**Nouveau droit granulaire** `ajouter_documents_chantier` (module « Chantiers », migration `20260819000216_terrain_mobile_v1b_permission_documents_chantier.sql`), distinct de `gerer_chantiers` :

- **Cartographie avant/après** (uniquement les lignes concernées) :

| Fonction | Permission UI/middleware (avant) | Permission UI/middleware (après) | RLS (avant) | RLS (après) |
|---|---|---|---|---|
| Ajouter photo/document | `gerer_chantiers` | `gerer_chantiers` **ou** `ajouter_documents_chantier` | `gerer_chantiers` (RESTRICTIVE) | `gerer_chantiers` **ou** `ajouter_documents_chantier` |
| Supprimer photo/document | `gerer_chantiers` | `gerer_chantiers` (inchangé) | `gerer_chantiers` | `gerer_chantiers` (inchangé) |
| Créer compte-rendu | `gerer_chantiers` | `gerer_chantiers` **ou** `ajouter_documents_chantier` | aucune (tout membre actif) | `gerer_chantiers` **ou** `ajouter_documents_chantier` (resserré) |
| Modifier/supprimer compte-rendu | `gerer_chantiers` | `gerer_chantiers` (inchangé) | aucune (tout membre actif) | `gerer_chantiers` (resserré) |
| Lire documents/comptes-rendus | permissions existantes | inchangé | inchangé | inchangé |
| Modifier/supprimer le chantier lui-même, client, budget, planning global | `gerer_chantiers` | `gerer_chantiers` (inchangé) | `gerer_chantiers` | `gerer_chantiers` (inchangé) |

- **Middleware/`ModuleAccessBoundary`** : un helper centralisé `droitsGestionPour(pathname)` (`src/lib/module-permissions.ts`) reconnaît d'abord, via une expression régulière, les sous-chemins `/chantiers/[id]/documents` et `/chantiers/[id]/comptes-rendus` (un identifiant de chantier dynamique empêche de les exprimer comme un simple préfixe littéral) et retourne `["gerer_chantiers","ajouter_documents_chantier"]` — sinon il retombe sur la logique générique existante, strictement inchangée pour tout le reste de `/chantiers/*`. Utilisé à la fois par `proxy.ts` (barrière serveur) et `ModuleAccessBoundary.tsx` (masquage CSS côté client), pour ne garder qu'une seule source de vérité.
- **RLS `documents_chantier`** : nouvelle policy PERMISSIVE `documents_chantier_ajout_terrain` (INSERT) + élargissement de la policy RESTRICTIVE `role_gestion_insert` à `gerer_chantiers or ajouter_documents_chantier`. UPDATE/DELETE inchangés (toujours `gerer_chantiers` seul).
- **RLS `storage.objects` (bucket `chantier-documents`)** : la branche `chantier-documents` de la policy RESTRICTIVE partagée `role_gestion_fichiers_insert` accepte désormais aussi `ajouter_documents_chantier` ; les 4 autres buckets (`factures-fournisseurs`, `documents-employes`, `entreprise-assets`, `pointage-preuves`) sont inchangés — vérifié explicitement par un test dédié (aucune fuite de portée).
- **RLS `comptes_rendus_chantier`** : la policy unique `ALL` (aucune permission requise) est remplacée par 4 policies dédiées — lecture inchangée (tout membre actif), écriture (INSERT) élargie à `gerer_chantiers or ajouter_documents_chantier`, modification/suppression resserrées à `gerer_chantiers` seul (elles ne l'étaient pas explicitement avant ; l'absence de toute UI d'édition/suppression rend ce resserrement sans effet observable, uniquement défensif — cf. §31 de l'audit : « le middleware n'est pas une frontière de sécurité suffisante, RLS doit rester la dernière barrière »).
- **Attribution par défaut** : le nouveau droit est accordé aux postes nommés « Ouvrier », « Salarié » et « Chef d'équipe »/« Chef de chantier » dans **toutes** les entreprises existantes, par le même mécanisme et la même liste de noms que la migration de référence `20260713000046_roles_terrain_par_defaut.sql` — sans quoi le correctif resterait inerte pour les entreprises déjà créées.

**Régression corrigée en cours de route** : élargir `droitsGestionPour` à l'échelle de la page entière désactive aussi le bandeau/masquage « lecture seule » pour le bouton **Supprimer** un document (qui doit rester réservé à `gerer_chantiers`). Constaté empiriquement : `ModuleAccessBoundary` s'appuie sur un sélecteur CSS `form[method="post"]` qui ne correspond en réalité **jamais** aux formulaires de Server Actions Next.js (le DOM rendu ne porte pas d'attribut `method`, quel que soit le chemin — un défaut préexistant et plus large que ce lot, non corrigé ici faute d'être dans son périmètre, documenté en §4). Le bouton Supprimer était donc déjà visible pour un profil sans `gerer_chantiers` avant ce lot, la RLS le bloquant silencieusement (0 ligne affectée). Corrigé ici spécifiquement pour cette page en conditionnant son rendu à `gerer_chantiers` directement dans `src/app/(app)/chantiers/[id]/documents/page.tsx` (`peutSupprimer`), plutôt qu'en dépendant du mécanisme CSS déjà cassé.

### Tests

Vérifié empiriquement en Local, en session mobile réellement authentifiée (390×844 et 430×932) : ajout de photo et de document par le profil Terrain et par le profil Chef d'équipe, document visible après ajout (sous réserve d'appartenance à `equipes_chantiers`, mécanisme préexistant et indépendant de ce lot — cf. §3), bouton Supprimer absent pour ces profils, compte-rendu créé avec succès par les deux profils. Confirmé en pgTAP (`supabase/tests/terrain_mobile_v1b_permission_documents.test.sql`, 22 assertions, rejouées après `supabase db reset` complet) : ajout autorisé avec le nouveau droit, chantier non modifiable avec ce même droit, suppression neutre, cross-tenant refusé (table, storage, compte-rendu), bucket hors périmètre (`factures-fournisseurs`) toujours refusé, lecture des comptes-rendus toujours ouverte à tout membre actif, `anon` toujours sans aucun privilège.

## 2. P0 n°2 — notes de frais cassées (`digest()` / `search_path`)

### Reproduction (avant correctif)

Toute tentative de création de note de frais (« Créer le brouillon et ajouter le justificatif ») échouait avec une erreur serveur 500, **avant** même la création du brouillon.

**Cause racine confirmée**, par les logs serveur puis par introspection SQL directe :
```
function digest(text, unknown) does not exist
Hint: No function matches the given name and argument types.
```
`ajouter_audit_note_frais` (`20260713000060_archivage_notes_frais_integrite_stockage.sql`) est `security definer` avec `search_path` verrouillé sur `public` seul — une protection standard et voulue contre l'injection de `search_path`. Mais `pgcrypto`, qui fournit `digest()`, est installé dans le schéma `extensions` (confirmé : `select extnamespace::regnamespace from pg_extension where extname='pgcrypto'` → `extensions`), jamais atteint par ce `search_path`. L'appel non qualifié `digest(...)` ne pouvait donc jamais se résoudre — un bug présent dans la migration elle-même depuis sa création, indépendant de tout jeu de données, très probablement reproductible à l'identique en Preview/Production (schéma d'installation de `pgcrypto` identique).

### Correction

Migration `20260819000217_terrain_mobile_v1b_fix_digest_search_path.sql` : `create or replace function public.ajouter_audit_note_frais(...)`, corps identique à la version d'origine, seul l'appel devient `extensions.digest(...)` — qualification explicite du schéma plutôt qu'élargissement implicite du `search_path` (préférence retenue : un appel qualifié reste correct même si le `search_path` de la fonction change à l'avenir pour une autre raison). Recherche exhaustive des autres occurrences de `digest(` dans `supabase/migrations/` : une seule, celle-ci — aucune autre fonction n'est affectée par le même défaut.

### Tests

Vérifié empiriquement en Local, en session mobile authentifiée (390×844 et 430×932) : brouillon de note de frais créé avec succès par le profil Terrain (`EXP-2026-000001/000002`), montant TTC affiché correctement. Confirmé en pgTAP : `ajouter_audit_note_frais` s'exécute sans erreur et enregistre un hash (`empreinte_evenement`) non nul, création complète d'une note de frais par son propriétaire, impersonation refusée (un salarié ne peut pas créer de note au nom d'un autre — déjà vrai avant ce lot, revérifié), cross-tenant refusé, `anon` sans aucun privilège sur `ajouter_audit_note_frais`.

Non testés dans ce lot faute d'utilité (aucune régression suspectée, hors périmètre du correctif) : chaîne complète justificatif → soumission → validation comptable, notes de frais avec grand déplacement.

## 3. Dépendance préexistante non modifiée : `equipes_chantiers`

En testant le P0 n°1 de bout en bout, la visibilité d'un document fraîchement ajouté (`peut_voir_document_chantier`, policy SELECT sur `documents_chantier`) s'est révélée dépendre de l'appartenance à la table `equipes_chantiers` (l'équipe affectée à un chantier, gérée par un gestionnaire), **distincte** de `affectations` (le planning jour par jour, audité dans PLANNING-POINTAGE-V1). Un salarié qui n'est membre de l'équipe d'aucun chantier ne verrait donc pas les documents qu'il vient lui-même d'ajouter, même après ce correctif — un salarié réel est normalement inscrit dans `equipes_chantiers` par son gestionnaire au moment où il est staffé sur un chantier (mécanisme existant, non modifié, hors périmètre de ce lot). Documenté ici pour éviter toute confusion lors d'un test manuel avec un compte fraîchement créé sans cette affectation.

## 4. Découverte non corrigée : masquage CSS « mode consultation » inopérant sur les formulaires de Server Actions

`ModuleAccessBoundary` masque les formulaires de mutation en lecture seule via `.lecture-seule main form[method="post"]{display:none!important}`. Or les formulaires de Server Actions Next.js rendus par cette version du framework ne portent **aucun** attribut `method` dans le DOM — le sélecteur ne matche donc jamais, et **tout** formulaire de mutation reste visible sur **toute** page en mode consultation, dans l'ensemble de l'application (pas seulement sous `/chantiers`). La barrière réelle reste RLS/middleware (confirmé non compromise), mais l'affordance visuelle est trompeuse : un utilisateur en lecture seule voit des boutons d'action qui produiront une erreur générique s'il clique dessus, au lieu d'être proprement masqués. Ce défaut est **préexistant** à ce lot (le bouton Supprimer documents en est un symptôme, corrigé ponctuellement en §1) et touche potentiellement de nombreuses pages hors du périmètre terrain (clients, devis, planning, etc.). **Non corrigé ici** — hors périmètre d'un lot strictement correctif sur 2 P0 + 1 P1 ; recommandé comme lot minimal séparé (`LECTURE-SEULE-UX-V1`), par exemple en faisant porter explicitement `method="post"` dans le JSX de chaque formulaire concerné, ou en remplaçant le sélecteur CSS par un attribut `data-*` positionné explicitement.

## 5. Validation Preview (`elsatia-preview`)

- **Confirmation préalable du bug pgcrypto** : `pgcrypto` est également installé dans le schéma `extensions` sur Preview (`select extnamespace::regnamespace from pg_extension where extname='pgcrypto'` → `extensions`) — le P0 n°2 aurait donc bien bloqué toute création de note de frais sur Preview avant correction, comme anticipé.
- **Migrations appliquées isolément** (`supabase db query --linked -f <migration>`, pas de `db push` global) pour ne pas toucher au gap historique `20260812000200` (P9 documents commerciaux, hors périmètre, absent de Preview) — même précaution que DEVIS-LOCK-V1/FACTURATION-BTP-V1B. Vérifié après coup : `ajouter_documents_chantier` présent dans `permissions_disponibles`, `ajouter_audit_note_frais` qualifie bien `extensions.digest`.
- **Déploiement Vercel** : ce lot modifie du code applicatif (middleware, composant, page) — déploiement explicite (`vercel deploy`) nécessaire, contrairement aux lots migrations-seules précédents. URL de la révision testée : `elsatia-preview-2rp4611kb-julien-gregurec1.vercel.app`.
- **Contrôle visuel réel sur Preview**, entreprise fictive dédiée (« Entreprise Terrain V1B Preview »), profil Terrain, mobile 390×844 : ajout de photo/document accessible (formulaire visible, page « 0 élément » sans erreur), création d'une note de frais réussie de bout en bout (`EXP-2026-000001`, 7,30 €, brouillon créé sans erreur) — les deux P0 confirmés résolus en conditions réelles, pas seulement en Local.
- **Nettoyage** : chantiers, documents, équipe de chantier et client de test supprimés après validation. L'entreprise fictive, son unique poste/salarié/utilisateur et la note de frais de test **n'ont pas pu être supprimés** — `journal_audit_notes_frais` est volontairement immuable (`trg_refuser_mutation_archive`, suppression et modification interdites par trigger), ce qui bloque en cascade la suppression de la note de frais, de l'employé et de l'entreprise qui la référencent. Comportement attendu d'une chaîne d'audit inaltérable, pas une omission de nettoyage : le résidu (une entreprise nommée explicitement « ... V1B Preview », un compte `@invalid.local`, aucun chantier ni document) est négligeable et sans donnée réelle.

## 6. Hors périmètre respecté

Aucune refonte de l'interface terrain, aucune modification de la navigation mobile, aucun mode offline, aucune notification push, aucun changement fonctionnel sur planning/pointage, aucune modification de PLATFORM-V2, aucun contact Stripe, aucune Production.

## 7. QA

- `npm run typecheck` : 0 erreur.
- `npm run lint` : 0 erreur, 3 avertissements `<img>` préexistants et sans rapport avec ce lot.
- `npm run build` : succès.
- `npm run test` (Vitest) : 360/360.
- `npm run test:db` (pgTAP), après `supabase db reset` complet depuis zéro (les deux nouvelles migrations s'appliquent proprement) : 518/518 — 496 préexistants + 22 nouveaux (`terrain_mobile_v1b_permission_documents.test.sql`).
- `npm run verify:secrets` : 890 fichiers suivis contrôlés, aucun secret reconnu.

## 8. Documents

Ce document et `docs/commercial/TERRAIN_MOBILE_V1_CHECKLIST.md` (mis à jour).

## 9. Git

Branche `claude/terrain-mobile-v1b-fixes`, depuis `claude/terrain-mobile-v1-audit` (`fef8e0e`). Commits : `935d60c` (permissions terrain), `fe205dd` (fix pgcrypto), `ad3ab51` (tests + docs). Poussée sur `gh`. Migrations et déploiement Preview vérifiés (`elsatia-preview-2rp4611kb-julien-gregurec1.vercel.app`), données de test nettoyées (résidu minimal inévitable, cf. §5). Aucun merge Production.
