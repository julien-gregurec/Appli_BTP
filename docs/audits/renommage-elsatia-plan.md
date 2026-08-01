# Plan d'exécution — renommage ELSATIA

Date : 1er août 2026

## État de départ confirmé

| Contrôle | Résultat |
|---|---|
| Worktree | `/Users/juliengregurec/Projects/liria-codex` |
| Branche | `release/commercialisation-v1` |
| HEAD | `b512a971529dd42353815846f990f3d62d316e81` |
| Identité Git | `Julien GREGUREC <julien.gregurec@gmail.com>` |
| État Git | propre avant création des deux documents d'audit |
| Conflit worktrees | aucun ; `main` et Claude sont montés ailleurs |

## Principes d'exécution

- Marque, logo, groupe, éditeur et identité visuelle : `ELSATIA`.
- Nom officiel du logiciel dans l'interface, la PWA, les PDF, e-mails,
  abonnements, l'aide et l'assistant IA : `ELSATIA Gestion Pro`.
- Description seulement lorsque nécessaire :
  `ELSATIA Gestion Pro — La gestion BTP simplifiée`.
- Aucun remplacement global aveugle.
- Aucune ancienne migration, raison sociale, table, colonne, bucket, clé ou
  identifiant technique renommé sans nécessité.
- Aucune modification de service externe, aucun push, merge, rebase ou
  déploiement.
- Logo joint utilisé seulement après validation de son fichier source et des
  variantes, sans génération d'un nouveau logo.

## Lots proposés

| Lot | Fichiers | Action | Risque | Tests | Commit prévu |
|---|---|---|---|---|---|
| 0 — garde-fous | audit, script qualité | Formaliser exceptions autorisées et contrôle de l'ancien nom | faux positifs sur historiques/identifiants | test du script sur cas permis/interdit | `test(brand): verifier disparition ancien nom` |
| 1 — configuration et identifiants actifs | nouveau `src/lib/brand.ts`, `.env.example`, package, CSS, localStorage, schéma export | Centraliser nom, description, PWA, PDF, IA, URL, support et expéditeur ; migrer les identifiants actifs avec compatibilité ciblée | exposition d'une variable serveur, perte de préférences locales, rupture d'exports | Vitest de configuration/migration + typecheck | `refactor(brand): centraliser identite Elsatia` |
| 2 — métadonnées/PWA/logo | layout, manifest, SW, icônes, logos publics | Remplacer nom visible, versionner cache PWA, intégrer uniquement assets validés | PWA cassée, icône manquante, CSP/cache | manifest, métadonnées, install PWA, build | `feat(brand): renommer interface en Elsatia` |
| 3 — interface prioritaire | login, accueil, sidebar, footer, onboarding, tarifs, abonnement, aide, paiements, invitations | Afficher `ELSATIA Gestion Pro` et retirer toutes les anciennes variantes | snapshots/textes et responsive | Vitest + Playwright login/navigation/public | `feat(brand): renommer interface en Elsatia` |
| 4 — documents actifs | XLSX, impressions, documents, générateurs de guide | Remplacer auteur, métadonnées, en-têtes et wordmark fallback | documents clients, polices, pagination | tests export + rendu PDF/inspection | `feat(brand): renommer interface en Elsatia` ou commit document dédié |
| 5 — assistant IA | assistant, copilote, UI IA, tests | Présentation « assistant intégré d'ELSATIA Gestion Pro » uniquement | altération involontaire du prompt métier | test exact du prompt + suite IA existante | `fix(ai): renommer assistant en Elsatia` |
| 6 — données actives et boutique | nouvelle migration 194 + pgTAP | Recommander `ELSATIA (boutique)`, migrer/ fusionner la fiche et ses dépenses, corriger descriptions de permissions et notes, redéfinir les fonctions de création ; inventorier puis corriger toute donnée active `LIRIA CONCEPT` selon son rôle | collision de fournisseur existant, mauvaise qualification d'une donnée cliente, recréation de l'ancien nom | db reset, pgTAP avant/après, cas doublon, idempotence, second appel de fonction | `fix(db): renommer fournisseur boutique Elsatia` |
| 7 — docs et juridique | README/racine, docs produit, pages et fichiers juridiques/commerciaux actifs | Remplacer toutes les anciennes variantes ; utiliser `ELSATIA` pour l'éditeur et `ELSATIA Gestion Pro` pour le service | portée juridique non validée | contrôle ancien nom + revue manuelle | `docs(brand): mettre a jour documentation Elsatia` |
| 8 — médias et noms publics | 15 assets publics, guides, vidéos, VTT/SRT, références | Régénérer/remplacer atomiquement ; conserver output historique | liens cassés, audio ancien, poids/cache | liens HTTP, PWA, lecture vidéo, PDF | commit média dédié après livraison des assets |
| 9 — services externes | nouvelle checklist exploitation | Documenter GitHub/Vercel/Supabase/Stripe/Sentry/OpenAI/messagerie | oubli manuel au lancement | revue checklist uniquement | `docs(ops): preparer checklist services Elsatia` |
| 10 — clôture | rapport final | Recompter, justifier les conservations et exécuter toute la matrice | faux sentiment de fin | typecheck, lint, Vitest, DB, Storage, Playwright, build, audit, secrets, migrations | `docs(brand): finaliser rapport renommage Elsatia` si nécessaire |

## Séquencement et points d'arrêt

1. Valider la formulation du fournisseur boutique et les trois prérequis
   d'assets/domaines/médias de l'audit.
2. Créer d'abord le contrôle automatisé et la configuration de marque.
3. Exécuter les lots interface, documents et IA séparément, avec tests après
   chaque lot.
4. Inventorier les lignes DB locales avant de rédiger la migration 194, y
   compris les anciennes données `LIRIA CONCEPT` qui ne bénéficient plus
   d'aucune exception active.
5. Ne remplacer les assets publics que lorsque le logo et les médias officiels
   sont disponibles.
6. Mettre à jour les documents actifs, puis créer la checklist externe.
7. Exécuter la validation complète et produire le rapport final.

## Exceptions prévues dans le contrôle de l'ancien nom

Le futur script `scripts/quality/check-old-brand-name.mjs` devra ignorer de façon
ciblée, jamais globale :

- `supabase/migrations/**` ;
- audits/rapports historiques explicitement listés ;
- médias et artefacts historiques sous `output/` ;
- anciens identifiants techniques uniquement dans les adaptateurs temporaires de
  lecture/migration de compatibilité, avec justification par fichier et ligne.

Il devra échouer sur toutes les variantes visibles de l'ancien nom, y compris
`LIRIA CONCEPT` et `Liria Concept`, dans le code actif, les fixtures/tests
visibles, le manifest, les prompts, données de démonstration, documents générés,
documents juridiques/commerciaux et pages publiques, avec fichier et ligne.

## Matrice de validation finale

- `npm run typecheck` ;
- `npm run lint` ;
- `npm run test` ;
- `npm run test:db` et tests Storage ;
- Playwright ciblé puis critique ;
- `npm run build` ;
- `npm audit --omit=dev` ;
- `npm run verify:secrets` ;
- `npm run verify:migrations` ;
- `git diff --check` et état Git ;
- contrôle final de l'ancien nom ;
- reconstruction locale de la base depuis zéro.

## Décision requise

Ce plan est mis à jour avec la nouvelle identité. La recommandation de donnée
est **`ELSATIA (boutique)`**. **Aucun lot applicatif ni migration ne doit
commencer** avant validation explicite de cette formulation et du plan par le
propriétaire.
