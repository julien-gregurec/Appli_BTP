# TERRAIN-MOBILE-V1C — Lecture seule réelle, clôture des P1/P2 Terrain, préparation intégration Production

Référence : `docs/commercial/TERRAIN_MOBILE_V1B_CORRECTIONS_ELSATIA.md` (correctifs des 2 P0 + 1 P1, branche `claude/terrain-mobile-v1b-fixes`, commits `935d60c`/`fe205dd`/`ad3ab51`/`67e1773`) et `docs/commercial/TERRAIN_MOBILE_V1_CHECKLIST.md`. Branche `claude/terrain-mobile-v1c-readonly-p1p2`, depuis `claude/terrain-mobile-v1b-fixes` (`67e1773`).

Objectif : traiter le point non résolu découvert par V1B (masquage « lecture seule » inopérant sur les Server Actions) et clore les P1/P2 restants de PLANNING-POINTAGE-V1 et TERRAIN-MOBILE-V1 qui sont réellement à faible risque/faible coût, sans ajouter de fonctionnalité métier.

## 1. État Git initial

Worktree propre, branche `claude/terrain-mobile-v1b-fixes`, HEAD `67e1773`. Commits V1B confirmés présents dans l'historique : `935d60c`, `fe205dd`, `ad3ab51`, `67e1773`. Nouvelle branche créée : `claude/terrain-mobile-v1c-readonly-p1p2`.

## 2. Reproduction du problème « lecture seule »

Audit du mécanisme dans `src/app/(app)/layout.tsx` (seul point de définition, appliqué via une classe CSS `.lecture-seule` posée par `ModuleAccessBoundary`) :
```css
.lecture-seule main form[method="post"],
.lecture-seule main a[href$="/nouveau"],
.lecture-seule main a[href*="/modifier"],
.lecture-seule main button[type="button"]{display:none!important}
```
Recherche exhaustive de tous les `<form method=...>` du codebase : **chaque** formulaire de filtre (`method="get"`) le déclare explicitement en JSX ; **aucun** formulaire de mutation (`<form action={uneServerAction}>`) ne porte d'attribut `method` dans le DOM rendu par cette version de Next.js — confirmé par inspection directe (`getComputedStyle`/`getAttribute('method')` → `null`) sur un formulaire réel en session authentifiée. Le sélecteur `form[method="post"]` ne correspondait donc **jamais** à un formulaire de Server Action, sur **aucune** page de l'application, pas seulement sous `/chantiers`.

Cas concret démontré : sur `/chantiers/[id]/documents` en lecture seule (utilisateur sans `gerer_chantiers` ni `ajouter_documents_chantier`), le bouton « Supprimer » d'un document restait visible et cliquable — déjà repéré et corrigé ponctuellement dans V1B (§1 du document de correctifs), identifié à l'époque comme le symptôme d'un problème plus large, non traité alors faute d'être dans le périmètre du lot.

Cas structurel additionnel sur `/planning` : le lien « Modifier » d'une affectation est un `<details><summary>Modifier</summary><form action={...}>...</form></details>` — ni un `<a href>`, ni un `<form method="post">`, ni un `<button type="button">`. Il échappait à **toutes** les règles CSS existantes, y compris après correction du sélecteur `form`.

## 3. Cause exacte

Le mécanisme repose entièrement sur des heuristiques de sélecteur CSS supposant des attributs HTML que Next.js ne pose pas pour les formulaires basés sur des Server Actions (l'`action` est une référence de fonction sérialisée, pas une URL, et React ne matérialise pas de `method="post"` correspondant côté client). Le masquage n'a donc jamais fonctionné pour la quasi-totalité des mutations de l'application.

## 4. Server Actions auditées (chantiers, planning, pointage, documents, comptes-rendus, notes de frais)

| Action | Page | Permission attendue | Contrôle applicatif propre | Barrière réelle si contournement UI |
|---|---|---|---|---|
| `creerChantierAction`, `ajouterTacheAction`, `affecterEmployeChantierAction`, `retirerEmployeChantierAction`, `changerStatutChantierAction`, `modifierLocalisationChantierAction` | `/chantiers`, `/chantiers/[id]` | `gerer_chantiers` | **Oui** (`peutGererChantiers(ctx)` appelé au début de chaque action) | RLS (`role_gestion_*` RESTRICTIVE) — redondant avec le contrôle applicatif |
| `ajouterDocumentChantierAction` | `/chantiers/[id]/documents` | `gerer_chantiers` ou `ajouter_documents_chantier` | Non | RLS table + storage (corrigé V1B) — seule barrière |
| `enregistrerCompteRenduAction` | `/chantiers/[id]/comptes-rendus` | `gerer_chantiers` ou `ajouter_documents_chantier` | Non | RLS (resserrée V1B) — seule barrière |
| `creerAffectationAction`, `modifierAffectationAction`, `supprimerAffectationAction`, `supprimerGroupeAffectationsAction` | `/planning` | `gerer_planning` | **Non** | RLS (`role_gestion_*` RESTRICTIVE) — seule barrière, vérifiée empiriquement ce lot (§7) |
| `enregistrerArriveeAction`, `enregistrerDepartAction`, `declarerPointageOublieAction` | `/pointage` | `saisir_son_pointage` (ou `gerer_pointage`) | **Oui**, via les RPC `security definer` (`cloturer_session_pointage`/`_interne`) qui vérifient `peut_pointer_pour_employe` | RLS + RPC — double barrière |
| `validerPointageAction`, `supprimerPointageAction` | `/pointage/gestion` | `valider_pointages` (validation) / `gerer_pointage` (suppression) | **Oui**, via `valider_preuve_pointage` (RPC) pour la validation | RLS + RPC |
| Formulaire de notes de frais (`creerNoteFraisAction`) | `/notes-frais` | `saisir_ses_notes_frais` | Non constaté à l'audit initial, RLS déjà stricte (`est_employe_du_compte`, impersonation testée) | RLS — seule barrière, déjà vérifiée dans PLANNING-POINTAGE-V1 et V1B |

Constat central : **le masquage CSS n'a jamais été une barrière de sécurité réelle nulle part** — pour chaque action mutante testée directement (table ou RPC, en contournant totalement le formulaire), soit un contrôle applicatif explicite existe (`chantiers.ts`, RPC de pointage), soit RLS seule tient le rôle de barrière et le tient correctement (`planning.ts`, `documents.ts`, `comptesRendus.ts`). Aucune des deux situations ne constitue une faille ; la seconde est simplement moins défensive en profondeur que la première, sans gap observé.

## 5. Correctif lecture seule

- **Sélecteur CSS** (`src/app/(app)/layout.tsx`) : `form[method="post"]` → `form:not([method="get"])`. Un seul changement, universel, sans risque de sur-masquage (tous les formulaires de filtre existants déclarent déjà explicitement `method="get"`).
- **Planning** (`src/app/(app)/planning/page.tsx`) : le composant `FormulaireModifierAffectation` (le `<details>` « Modifier ») ne s'affiche plus du tout si l'utilisateur n'a pas `gerer_planning` — même principe que le correctif `peutSupprimer` de V1B sur la page documents (garde explicite au niveau du composant, indépendante du CSS).
- Le formulaire de création d'affectation (`PlanningAffectationForm`) et les boutons de suppression (`supprimerGroupeAffectationsAction`) sont de simples `<form action={...}>` : correctement masqués par le seul changement de sélecteur CSS, sans modification supplémentaire nécessaire.

## 6. Terrain / 7. Chef d'équipe

Revérifiés en session mobile réelle authentifiée (390×844), après nettoyage complet du service worker (voir §24) :
- **Terrain** : formulaire d'ajout documents/photos visible et fonctionnel (`ajouter_documents_chantier`) ; page Planning en mode consultation, aucun lien « Modifier » ni bouton de suppression visible (l'utilisateur test n'a pas `gerer_planning`) ; notes de frais et comptes-rendus fonctionnels comme en V1B.
- **Chef d'équipe** : mêmes constats côté documents/photos (§8-9 audit V1B) ; page `/pointage/gestion` accessible.

Aucun droit inventé : la matrice de permissions n'a pas été étendue au-delà de `ajouter_documents_chantier` (V1B) et des permissions déjà existantes.

## 8-13. Documents, photos, comptes-rendus, notes de frais, planning, pointage

Non-régression confirmée par la suite pgTAP dédiée à ce lot (`terrain_mobile_v1c_lecture_seule_et_actions_directes.test.sql`, 13 assertions) et par la suite V1B déjà existante (22 assertions, toujours verte). Le correctif `extensions.digest(...)` (P0 n°2 de V1B) n'a pas été touché.

## 14. Devis / factures / rentabilité

Non-régression revérifiée : le profil terrain (poste sans `acces_devis`/`acces_factures`) ne voit toujours aucune ligne de `devis` ni de `factures` de sa propre entreprise (assertions pgTAP dédiées, §22).

## 15-16. Middleware / RLS

`droitsGestionPour` (nouveau helper centralisé dans `src/lib/module-permissions.ts`, introduit en V1B) reste la seule source de vérité, utilisée à la fois par le proxy serveur et par `ModuleAccessBoundary` — non modifié dans ce lot au-delà de son usage déjà en place. Toutes les policies RLS resserrées ou ajoutées en V1B sont inchangées.

## 17-18. Cross-tenant / impersonation

Revérifiés pour le planning (nouveauté de ce lot, §4) : un utilisateur avec `gerer_planning` chez une entreprise ne peut pas créer d'affectation chez une autre (RLS). Documents, comptes-rendus, notes de frais : déjà couverts par la suite V1B, non re-testés ligne à ligne ici (aucune modification de leur RLS dans ce lot).

## 19. Actions directes (server actions sans passer par l'UI)

Cœur de ce lot (§4, §7) : `affectations` INSERT/UPDATE/DELETE appelés directement (simulant un contournement total du formulaire caché) — bloqués sans `gerer_planning`, autorisés avec, cross-tenant refusé. Aucune Server Action testée ne s'est révélée contournable.

## 20-21. P1 Planning/Pointage — décision

| P1 (PLANNING-POINTAGE-V1) | Décision |
|---|---|
| Aucune détection de chevauchement horaire (`affectations` sans horaire) | **Documenté, non corrigé** — changement de modèle de données, hors périmètre correctif |
| Aucune capacité contractuelle par salarié | **Documenté, non corrigé** — nouvelle fonctionnalité |
| Congé + affectation chantier sans alerte | **Documenté, non corrigé** — nouvelle règle métier |
| Aucun contrôle chantier terminé/annulé | **Documenté, non corrigé** — nouvelle règle métier |
| Correction de pointage validé non tracée | **Documenté, non corrigé** — nécessiterait une table d'historique (nouvelle fonctionnalité) |
| Suppression pointage validé sans verrou ni trace | **Documenté, non corrigé** — idem |
| Branches `auth.role()='anon'` vestigiales (pointage) | **Corrigé** (§ci-dessous) |
| Outils IA non filtrés par permission | **Documenté, non corrigé** — hors périmètre terrain strict de ce lot |
| Pas de vue « charge », validation en masse, alerte planning>budget | **Documenté, non corrigé** — nouvelles fonctionnalités |

**Anon vestigial (corrigé)** : `peut_pointer_pour_employe`, `peut_consulter_pointage_employe`, `cloturer_session_pointage_interne`, `valider_preuve_pointage` contenaient une branche `auth.role()='anon'` contournant entièrement le contrôle d'accès réel. Confirmé inerte avant retrait (`anon` sans EXECUTE sur les 4, revérifié). Retiré par `create or replace function`, portée strictement limitée à ces 4 fonctions de pointage (le même motif existe dans 27 autres fonctions stock/outillage/commandes, hors périmètre terrain de ce lot, non touchées).

## 22-23. P1/P2 Terrain Mobile — décision

| P2 (TERRAIN-MOBILE-V1) | Décision |
|---|---|
| Message d'erreur GPS non traduit | **Corrigé** — traduction par code d'erreur standard (`src/lib/gps.ts`), sur les deux formulaires concernés |
| Lien GPS vers `mlat=0&mlon=0` | **Corrigé** — masqué et remplacé par un texte explicite quand la position est absente |
| Planning mobile montre toute l'équipe | **Documenté, non corrigé** — choix de conception produit, pas un bug ; à trancher explicitement si un scoping « mes affectations seulement » est souhaité |
| Champ pause replié par défaut | **Corrigé** — ouvert par défaut sur la carte de départ |
| Mismatch d'hydratation (dictée vocale) | **Corrigé** — `useSyncExternalStore` |
| Message générique à l'échec de clôture (durée minimale) | **Corrigé** — message explicite quand la cause est la durée hors bornes |
| Lien « Modifier » visible en lecture seule | **Corrigé** — cf. §5 |
| Masquage CSS lecture seule inopérant | **Corrigé** — cf. §5, le sujet central de ce lot |

Chantier préselectionné arbitrairement (P3, TERRAIN-MOBILE-V1) : non traité, priorité la plus basse, coût de correction disproportionné par rapport au bénéfice pour ce lot.

## 24. Mobile 390 / 25. Mobile 430

Revérifiés en Local (390×844) après nettoyage du service worker (voir ci-dessous) : planning (aucun lien Modifier/suppression pour un profil sans `gerer_planning`), documents (formulaire d'ajout visible pour `ajouter_documents_chantier`), pointage (message GPS traduit). 430×932 non re-testé intégralement dans ce lot — déjà validé pour les mêmes composants en V1B, aucune modification de mise en page introduite ici (uniquement du texte et de la visibilité conditionnelle).

**Incident de méthodologie découvert et documenté (pas un bug applicatif)** : lors de la vérification, un service worker PWA installé lors d'un test antérieur (`elsatia-v4-static`) servait un bundle JavaScript client obsolète sous une URL de chunk Turbopack inchangée (les noms de chunks en mode développement ne sont pas systématiquement re-hashés à chaque modification, contrairement à un build de production). Symptôme observé : une erreur d'hydratation React sur `ModuleAccessBoundary` (le serveur rendait `permissions` à jour, le client hydratait avec une version JS antérieure du composant). Résolu en désinscrivant le service worker et en vidant les caches du navigateur de test ; confirmé sans rapport avec le code livré (le service worker lui-même ne met jamais en cache les réponses de navigation ni les payloads RSC — uniquement les assets statiques versionnés — et un build de production utilise des noms de fichiers content-hashés qui changent à chaque modification réelle). Aucune action corrective nécessaire côté application ; noté ici pour la prochaine session de test Local sur ce projet.

## 26. Tests dédiés / 27. pgTAP / 28. Vitest / 29. typecheck-lint-build / 30. verify:secrets

- pgTAP : `terrain_mobile_v1c_lecture_seule_et_actions_directes.test.sql`, 13 assertions nouvelles. Suite complète : **531/531** (518 préexistants incluant V1B + 13 nouvelles), rejouée après `supabase db reset` complet depuis zéro.
- Vitest : **360/360**, inchangé.
- `npm run typecheck` : 0 erreur.
- `npm run lint` : 0 erreur (un avertissement `react-hooks/set-state-in-effect` rencontré puis corrigé en cours de lot via `useSyncExternalStore`, cf. §23 ; 3 avertissements `<img>` préexistants sans rapport avec ce lot).
- `npm run build` : succès.
- `npm run verify:secrets` : aucun secret reconnu.

## 31. `db reset` / 32. Migrations

`supabase db reset` complet exécuté depuis zéro : toutes les migrations, y compris la nouvelle (`20260819000218_terrain_mobile_v1c_retirer_branches_anon_pointage.sql`), s'appliquent proprement. Aucune migration existante renumérotée ni modifiée.

## 33. Preview / 34. Recette réelle / 35. Nettoyage

Migration `20260819000218` appliquée isolément sur `elsatia-preview` (`supabase db query --linked -f`, sans toucher au gap historique `20260812000200`, même précaution que les lots précédents) — confirmée : les 4 fonctions de pointage ne référencent plus `auth.role()='anon'`. Code applicatif déployé (`vercel deploy`, ce lot modifie des composants/pages, contrairement à un lot migrations-seules). Recette rejouée sur l'entreprise fictive déjà utilisée en V1B (« Entreprise Terrain V1B Preview », résidu inévitable lié à l'immutabilité du journal d'audit des notes de frais, cf. V1B §5) avec un chantier/client/affectation créés pour ce lot : documents/photos, planning (lien Modifier absent), message GPS traduit. Données de test propres à ce lot supprimées après validation (chantier, client, équipe de chantier, affectation, droit `acces_planning` retiré du poste).

## 36. Documentation

Ce document, plus mise à jour de `docs/commercial/TERRAIN_MOBILE_V1_CHECKLIST.md`.

## 37-38. Commits / push

Branche `claude/terrain-mobile-v1c-readonly-p1p2`, depuis `claude/terrain-mobile-v1b-fixes` (`67e1773`). Commits : `00dd490` (lecture seule réelle), `e141a1a` (P2 pointage/comptes-rendus), `60d0790` (nettoyage anon + tests). Poussée sur `gh`.

## 39. Anomalies restantes

- Les P1 structurels de PLANNING-POINTAGE-V1 (chevauchement horaire, capacité contractuelle, alerte congé/affectation, contrôle chantier terminé, traçabilité des corrections/suppressions de pointage) restent ouverts — nécessitent un changement de modèle de données ou une nouvelle fonctionnalité métier, explicitement hors périmètre de ce lot correctif.
- Le scoping du planning mobile (équipe entière vs. « mes affectations ») reste une question de conception produit ouverte, pas un défaut technique.
- Les 27 autres fonctions (stock/outillage/commandes) portant le même motif `auth.role()='anon'` vestigial restent non nettoyées — hors périmètre terrain, à traiter dans un lot dédié si jugé utile.
- Aucune anomalie de sécurité active découverte pendant ce lot : le point central (masquage CSS inopérant) s'est révélé être un défaut de cohérence UX, jamais une brèche exploitable, dans tous les cas vérifiés.

## 40. Recommandation Production

**Intégration Production recommandée pour V1B + V1C.** Les deux P0 (documents/photos, notes de frais) et le P1 associé (comptes-rendus) sont corrigés et validés en Preview réel. Le point additionnel soulevé par le rapport V1B (masquage lecture seule) est refermé : vérifié comme un défaut de cohérence UX sans impact sécurité, et corrigé au niveau applicable (sélecteur CSS universel + garde explicite sur le seul cas structurel restant). Les P1 non corrigés sont tous des trous de contrôle documentés (comme déjà noté dans PLANNING-POINTAGE-V1), pas des bugs actifs, et n'empêchent pas un premier usage terrain réel de taille modeste.
