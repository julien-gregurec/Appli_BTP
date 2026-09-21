# WORKFLOW-DEVIS-V1 — Création de chantier depuis un devis accepté

## Objectif

Permettre de créer un chantier directement depuis un devis accepté, avec un
flux explicite **Prévisualiser → Vérifier → Confirmer** (aucune création
silencieuse), un préremplissage intelligent des champs, une traçabilité
garantie et une protection contre les doublons.

## Règle métier : devis éligible

Un devis est éligible à la création de chantier si et seulement si
`devis.statut = 'accepte'`. Un devis brouillon, envoyé, refusé ou expiré
n'affiche aucun CTA de création de chantier.

## Parcours utilisateur

1. Sur la fiche devis (`/devis/[id]`), un encart apparaît uniquement si
   l'utilisateur a la permission `gerer_chantiers` **et** que le devis est
   accepté :
   - « Créer un chantier à partir de ce devis » si aucun chantier n'existe
     encore pour ce devis ;
   - « Ouvrir le chantier » si un chantier existe déjà (idempotence visible
     dès la fiche devis, pas seulement au moment de la soumission).
2. Le lien mène vers `/devis/[id]/creer-chantier`, une page de
   **prévisualisation éditable** (aucune écriture en base à ce stade) :
   client, nom suggéré, adresse, code postal, ville, description, devis
   source, budget prévisionnel (= montant HT du devis).
3. La confirmation (`CreerChantierConfirmButton`) affiche un résumé complet
   via `window.confirm()` avant soumission — même mécanisme déjà validé pour
   les remises plateforme (`RemiseConfirmButton`). Choix délibéré : une boîte
   de dialogue native est nativement accessible au clavier et aux lecteurs
   d'écran, sans risque de piège de focus propre à une modale custom.
4. La création passe par le RPC `creer_chantier_depuis_devis(...)`
   (`security definer`), qui revérifie tout côté serveur : appartenance à
   l'entreprise, permission, statut du devis, nom non vide.

## Préremplissage des champs

- **Nom suggéré** : `"<Prénom Nom ou Société du client> — <numéro du devis>"`.
- **Adresse** (ordre de priorité, car le devis lui-même ne porte pas
  d'adresse) :
  1. adresse du chantier déjà lié au devis via `devis.chantier_id`, s'il en
     existe un ;
  2. sinon `client.adresse_chantier_defaut` / `code_postal` / `ville` ;
  3. sinon champs vides (à saisir manuellement).
- **Description** : `devis.notes_client`.
- **Budget prévisionnel** : `devis.montant_ht` (non modifiable, informatif).

Tous les champs préremplis restent éditables avant confirmation.

## Traçabilité : à sens unique, et pourquoi

`chantiers.devis_source_id` (nouvelle colonne, FK composite
`(devis_source_id, entreprise_id) → devis(id, entreprise_id)`) enregistre de
façon permanente le devis d'origine. La fiche chantier affiche un lien
« Voir le devis d'origine ».

**Ce lien ne fonctionne que dans un sens : chantier → devis.** Il n'existe
pas de retour automatique `devis.chantier_id → chantier` pour un chantier
créé par ce workflow.

### Découverte et correction en cours de lot

En recette réelle, la création du premier chantier a révélé que le tableau
de bord financier existant (budget vs devis accepté, génération automatique
des tâches) dépend entièrement de `devis.chantier_id`, jamais renseigné par
`creer_chantier_depuis_devis()`. Un correctif a été écrit
(migration `20260824000228`) pour lier réciproquement `devis.chantier_id`
au nouveau chantier à la création.

Ce correctif s'est révélé **cassant** : en base, un trigger non documenté
(absent de tout fichier de migration versionné, découvert par
`pg_get_functiondef`), `verrouiller_devis_accepte()`, interdit
**inconditionnellement** toute modification de `devis.chantier_id` (ainsi que
`statut`, `montant_ht`, `client_id`, `numero`, et d'autres colonnes) dès que
`statut = 'accepte'` — précisément l'état requis pour l'éligibilité de ce
workflow. La tentative de mise à jour levait donc l'exception du trigger,
annulant toute la transaction, y compris l'insertion du chantier lui-même :
la création de chantier était intégralement cassée. Vérifié en recette live
sur Preview (pas seulement en SQL) avant et après le correctif.

**Décision** : revert immédiat (migration `20260824000229`) vers la version
sans liaison réciproque, sans affaiblir le trigger — verrou métier
volontaire, hors périmètre de ce lot (empêcher la modification rétroactive
d'un devis déjà accepté). Reconfirmé en recette live que la création
fonctionne à nouveau normalement après le revert.

**Conséquence documentée** : pour un chantier créé via ce workflow, le
tableau de bord financier du chantier (« Devis acceptés », génération
automatique des tâches depuis les lignes du devis) reste à zéro tant que le
devis n'est pas également associé manuellement au chantier via le mécanisme
existant (« Chantier associé au devis » sur la fiche devis, ou « Associer un
devis existant » sur la fiche chantier) — association qui, elle, n'est pas
bloquée par le trigger puisqu'elle passe par le même chemin déjà utilisé
partout ailleurs dans l'application. La traçabilité d'origine
(`devis_source_id`) reste garantie et affichée dans tous les cas.

## Idempotence

Trois niveaux, tous nécessaires :

1. Index unique partiel en base :
   `create unique index ... on chantiers (devis_source_id) where devis_source_id is not null`.
2. Vérification applicative explicite dans le RPC avant insertion, avec un
   message d'erreur structuré et analysable : `chantier_existant:<uuid>`.
3. Handler `unique_violation` en filet de sécurité contre une course
   concurrente (double clic, double onglet).

Dans les trois cas, l'utilisateur est redirigé vers le chantier existant
avec un message clair — jamais une erreur générique, jamais de doublon.

## Permissions et sécurité

- Le RPC est `security definer` et revérifie explicitement
  `est_membre_actif(entreprise_id)` et `a_permission(entreprise_id, 'gerer_chantiers')` —
  ne fait confiance ni à la session ni à l'appel côté client.
- FK composite `(devis_source_id, entreprise_id) → devis(id, entreprise_id)` :
  empêche par construction qu'un chantier référence un devis d'une autre
  entreprise, même via manipulation directe du RPC.
- **Test cross-tenant réel exécuté** (pas une simulation) : appel du RPC réel
  `creer_chantier_depuis_devis` avec le JWT d'un utilisateur de l'entreprise A
  ciblant le devis accepté de l'entreprise B (jeu de données
  `supabase/tests/fixtures/isolation_multitenant.inc`), dans une transaction
  `begin; ... rollback;` sur la base Preview liée. Résultat : rejet avec
  `"Devis introuvable"`, aucun chantier créé (0 lignes), aucune fuite
  d'information sur l'existence du devis de l'entreprise B.
- Un rôle Terrain (accès chantiers en lecture, pas de permission
  `gerer_chantiers`) ne voit pas le CTA et le RPC refuse explicitement
  (`"Accès refusé"`) en cas d'appel direct.

## Documents et pièces jointes

Aucune duplication physique : les pièces jointes restent attachées au devis
d'origine. La fiche chantier permet d'atteindre le devis (et donc ses
pièces jointes) via le lien « Voir le devis d'origine ».

## Alertes et audit

- Le centre d'alertes opérationnelles ne référence aucune donnée devis
  actuellement (vérifié par relecture de `CentreAlertesOperationnelles.tsx`) :
  aucune alerte à faire évoluer pour ce lot.
- Il n'existe pas de journal d'audit dédié aux événements métier générique
  dans l'application (seul `journal_ia` existe, propre à l'assistant IA) : la
  table `chantiers` elle-même ne porte pas de colonne `created_by`, y compris
  pour la création manuelle déjà existante. Ce n'est pas une régression
  introduite par ce lot ; la traçabilité repose sur `devis_source_id` et les
  horodatages `created_at` / `updated_at`.

## Limites V1 (volontaires)

- Pas de synchronisation bidirectionnelle devis ↔ chantier après la création
  (voir section traçabilité ci-dessus).
- Pas de génération automatique de planning.
- Pas de commande fournisseur automatique.
- Pas d'assistance IA dans ce workflow (exclue explicitement du périmètre).
- Pas de nouvelle signature électronique.
- Un devis modifié après la création du chantier n'est pas re-synchronisé
  automatiquement (le lien `devis_source_id` reste correct, mais les champs
  copiés au moment de la création — nom, adresse, description — ne
  suivent pas les modifications ultérieures du devis).

## Tests

- 15 tests Vitest (`src/app/actions/workflow-devis.test.ts`) : éligibilité
  (introuvable / brouillon / refusé / expiré / client introuvable / éligible),
  préremplissage (adresse à trois niveaux, nom société prioritaire,
  détection idempotence), action de création (nom manquant, succès,
  idempotence, permission refusée, devis non éligible).
- 10 tests pgTAP (`supabase/tests/workflow_devis_v1_chantier_depuis_devis.test.sql`),
  écrits mais non exécutés via le stack Docker local (containers
  `analytics`/`vector`/`storage`/`studio` instables sur cette machine durant
  ce lot). La logique qu'ils couvrent a été vérifiée manuellement et de façon
  rigoureuse directement contre la base Preview liée (transactions
  `begin; ... rollback;`), y compris le test cross-tenant ci-dessus.
- Recette live sur Preview avec un fixture réel
  (`RECETTE-WORKFLOW-DEVIS-V1`) : création réussie, idempotence confirmée
  (re-visite de la fiche devis → « Ouvrir le chantier », re-visite directe de
  `/devis/[id]/creer-chantier` → redirection avec message « Ce chantier
  existait déjà pour ce devis. », aucun doublon), traçabilité affichée des
  deux côtés.

## QA

`npm run typecheck`, `npm run lint`, `npx vitest run` (421/421), 
`npm run verify:migrations`, `npm run verify:secrets`, `npm run build`,
`npm audit --audit-level=high` : tous verts après l'ajout des migrations
228/229.

## Résidus de recette permanents

Deux devis de test acceptés ne peuvent pas être supprimés, par construction
(`verrouiller_devis_accepte()` interdit la suppression de tout devis
`statut='accepte'`) :

- `d3cb66b1-ed6f-4782-a9f0-f158905ff4f5` (`DEV-TEST-BROKEN-CHECK`) — créé
  pour diagnostiquer la régression de la migration 228.
- `7400bbda-7adf-45a7-9009-6fb14b9c753e` (`DEV-2026-001`) — fixture principal
  de recette `RECETTE-WORKFLOW-DEVIS-V1`.

Les deux ont été marqués explicitement via `notes_internes` (préfixe
`RESIDU-PERMANENT-WORKFLOW-DEVIS-V1`) plutôt que forcés en base en
contournant le trigger. Les chantiers de test associés, eux, ont été
supprimés normalement (aucun trigger équivalent sur `chantiers`).

## Intégration

Ce lot n'a touché que l'environnement Preview. Aucun déploiement Production
n'a été effectué (conformément à la consigne du lot). Le code est prêt à
être intégré dans `release/commercialisation-v1` par fast-forward.
