# Prompt à coller dans Codex

Tu travailles sur le repo `btp-platform` (Liria Gestion Pro, Next.js 16 + Supabase), branche `main`, remote `gh`. Tu partages ce repo avec une autre IA : reste strictement dans le domaine **facturation** décrit ci-dessous.

## Ta mission : rendre la facturation 100 % automatique

Deux volets.

### Volet 1 — Facturation de l'abonnement (Stripe Billing)
Un document de spec complet existe déjà à la racine : **`RELAIS_CODEX_ABONNEMENT.md`**. Lis-le en entier et exécute-le. Il couvre : souscription à l'inscription, essai 30 j, prélèvement récurrent, facture générée + envoyée par Stripe, relances (dunning) auto, résiliation/changement de carte en self-service (portail Stripe), et synchro du statut d'abonnement via webhook. Respecte l'ordre de réalisation (§6) et les garde-fous (§5) de ce document.

### Volet 2 — Facturer le coût de stockage (photos) au-delà d'un quota
Le stockage des photos (Supabase Storage) est notre principale charge variable. Il faut le refacturer proprement. C'est la **Phase 2 « part variable »** du relais (même mécanique que le dépassement d'appareils : `invoice item` ajouté au cycle Stripe).

À réaliser :
1. **Mesurer l'usage par entreprise** : fonction SQL `SECURITY DEFINER` qui somme la taille des objets de tous les buckets pour une entreprise (à partir de `storage.objects`, `metadata->>'size'`, en filtrant sur le préfixe/`entreprise_id` du chemin). Buckets concernés : `chantier-documents`, `entreprise-assets`, `documents-employes`, `notes-frais`, `factures-fournisseurs`, `fiches-techniques`, `bulletins-paie`, `pointage-preuves`, `notes-frais-exports`.
2. **Quota inclus par offre** (colonnes de config, valeurs à faire valider par Julien — placeholders) :
   - Essentiel : 5 Go inclus · Pro : 25 Go · Premium : 100 Go
   - Dépassement : **0,50 €/Go/mois** (marge confortable sur le coût Supabase ≈ 0,02 €/Go).
3. **Refacturation** : à chaque cycle Stripe (sur `invoice.created`, avant finalisation), ajouter un `invoice item` « Stockage supplémentaire : X Go » si l'usage dépasse le quota de l'offre. Réutiliser exactement le pattern du dépassement d'appareils (`facturation_depassement_appareils`, migration `...090`).
4. **Transparence côté entreprise** : une jauge « X Go / Y Go utilisés » sur la page « Mon abonnement » (celle créée au Volet 1), avec alerte quand on approche/dépasse le quota.
5. **Affichage public** : ajouter le quota de stockage inclus dans la grille tarifaire (`src/lib/plateforme.ts` OFFRES + page `/tarifs`) — ex. « 25 Go de photos inclus, puis 0,50 €/Go ».

## NE PAS faire (domaine de l'autre IA)
- **La compression / le redimensionnement des photos à l'upload** est géré par l'autre IA (domaine média). N'y touche pas. Tu t'appuies simplement sur la taille réelle des fichiers stockés.

## Garde-fous (impératifs)
- **Avant tout push** : `git fetch gh` puis vérifier `HEAD == gh/main`. L'autre IA pousse en parallèle (média/compression) — ne l'écrase pas.
- **Migrations** : appliquées **à la main** par Julien via le SQL Editor Supabase. Prochain numéro libre : vérifier `ls supabase/migrations` (le dernier est `...099`, donc `20260718000100_...` et suivants). Fournis le SQL prêt à coller.
- **Accents / SQL** : quand tu donnes du SQL à coller, utilise `LC_ALL=en_US.UTF-8 pbcopy` (sinon mojibake `√©`), et vérifie avec `LC_ALL=en_US.UTF-8 pbpaste`.
- **Ne touche pas** au flux Stripe Connect (facturation client → chantier) ni à son webhook existant.
- **Aucune société n'existe encore** pour encaisser : l'entité légale reste à créer par Julien (prérequis externe, pas un blocage code).
- **Ne commit pas** `.env.audit` et n'en lis pas le contenu.
- Ignore les fichiers dupliqués `page 2.tsx`, `factures/page 2.tsx`, `StockMovementForm 2.tsx`.
- **Sécurité webhook** : vérifier la signature avant tout traitement, dédup obligatoire, jamais faire confiance au corps sans signature valide.

## Décisions à faire confirmer par Julien avant de figer
1. **Quelle structure créer** pour encaisser l'abonnement (SASU/EURL… + SIRET/TVA pour émettre les factures) — aucune société n'existe encore.
2. **Carte obligatoire à l'inscription** (essai 30 j puis prélèvement auto) — recommandé pour l'automatisation totale.
3. **Quotas de stockage et tarif du Go** supplémentaire (placeholders ci-dessus).

Commence par le Volet 1 (socle) dans l'ordre du relais, puis enchaîne le Volet 2. Signale à Julien les étapes manuelles côté dashboard Stripe (section 4 du relais).
