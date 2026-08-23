# ABONNEMENTS-DETAIL-V1B — Comparatif détaillé des offres et page abonnement commerciale

**Constat de départ** : ABONNEMENTS-DETAIL-V1 avait délibérément reporté la construction du mapping tarification ↔ feature-catalogue (« arrêt documenté plutôt que deviné »). Ce lot construit ce mapping, l'utilise pour un comparatif complet par catégories, et intègre proprement les comptes supplémentaires et remises commerciales validés depuis (COMPTES-SUPPLEMENTAIRES-V1C, REMISES-CLIENTS-V1).

## 1-2. Git

Base choisie : `feat/ai-launch-v1c` (HEAD `bf275ac`) — confirmée comme la lignée la plus complète (contient P15, AI-LAUNCH-V1, ABONNEMENTS-DETAIL-V1, COMPTES-SUPPLEMENTAIRES-V1C, REMISES-CLIENTS-V1, AI-LAUNCH-V1B/V1C, tous vérifiés ancêtres via `git merge-base --is-ancestor`). `feat/abonnements-detail-v1b` créée directement dessus, aucune fusion supplémentaire nécessaire. PROMO-V1 non touché.

## 3-4. Source de vérité et mapping

`src/lib/comparatif-offres.ts` combine :
- `tarification.ts` (`permissionIncluseDansOffre`) : ce qu'un plan autorise.
- `feature-catalogue.ts` (`FEATURE_CATALOGUE`) : le statut produit réel (CORE/BETA/DISABLED), indépendant du plan.

**Découvertes réelles** (jamais affichées avant ce lot) : plusieurs permissions incluses dès Mini ou Pro correspondent à des modules **BETA** — facturation avancée (Mini+), CRM (Pro+), interventions (Pro+), ouvrages (Business+), sous-traitants (Entreprise+), paie (Entreprise+) — ou **DISABLED** (« Bientôt disponible ») — appels d'offres, paiements bancaires, connecteurs, quelle que soit l'offre. Un module BETA/DISABLED ne s'affiche jamais comme « Inclus », y compris pour Entreprise.

## 5. États commerciaux

4 états : Inclus, Non inclus, BETA, Bientôt disponible (« Limité » réservé aux grandeurs chiffrées — comptes/stockage/quota IA — pas aux modules, qui sont binaires dans ce produit).

## 6-8. Prix officiels, comptes inclus, comptes supplémentaires

Non modifiés (`tarification.ts` intouché). Mini 79€/948€, Pro 249€/2988€, Business 449€/5388€, Entreprise 599€/6468€ ; comptes inclus 3/15/30/50 ; comptes sup 15€/12€/9€/9€. Vérifié en direct : entreprise à 5 comptes sur Mini → « 2 supplémentaire(s) × 15,00 € HT/mois », total 109,00 € HT/mois (79 + 30) — exact.

## 9-11. Résumé, remise, utilisation actuelle

Section « Coût actuel de l'application » existante étendue : bloc remise (déjà en place depuis REMISES-CLIENTS-V1) inchangé visuellement, mais son calcul de réduction a été extrait dans `calculerReductionRemise()` — testé (5 tests), et désormais plafonné au sous-total (la réduction affichée ne peut plus dépasser visuellement ce qu'elle réduit, cohérent avec le total jamais négatif). Aucun champ « début d'abonnement » ajouté : aucune colonne ne le trace réellement (Stripe `current_period_start` non recopié en base) — non inventé.

## 12. Essai gratuit

Inchangé (déjà correct dans V1) : dates début/fin, offre, conséquence à l'échéance clairement énoncée.

## 13-18. Comparatif par catégories

5 catégories repliables (accordéons natifs `<details>`) : Commercial, Chantiers, Terrain, Stock & matériel, Pilotage — 25 lignes au total, chacune adossée à une permission réelle de `tarification.ts`. Volontairement omis (non séparément permissionnés dans le produit actuel) : PDF/email/relances (intégrés devis/factures), alertes opérationnelles et leur délégation (accessibles dès le dashboard, non plan-gated), documents/photos de chantier, comptes-rendus, grands déplacements — périmètre d'un futur audit transverse (PIECES-JOINTES-V1), pas de ce lot.

## 19-20. IA et quotas

Quand `FEATURE_AI_ENABLED=false` (Production actuelle) : nouveau bandeau « IA — activation au lancement » avec le quota indicatif de l'offre (`operationsIAIncluses`, déjà dans `tarification.ts`), sans promettre de disponibilité immédiate. Quand actif (Preview) : sections existantes inchangées, quota confirmé en direct (100 pour Mini après souscription réelle).

## 21. Support

Aucune différenciation par offre trouvée dans le code (pas de SLA, téléphone ou délai contractuel documenté nulle part) — non inventé, non ajouté au comparatif.

## 22-23. Gains d'upgrade et CTA

`calculerGainsOffreSuivante()` remplace l'ancienne liste manuelle `LIBELLES_GAIN_OFFRE` : calcule les modules qui passent de Non inclus à Inclus/BETA entre deux offres, jamais un module DISABLED. Vérifié en direct après souscription réelle Mini : passage à Pro affiche « CRM (BETA), Interventions (BETA), Pointage des heures, Demandes de congés, Notes de frais, Achats & fournisseurs » — exact. CTA honnête inchangé (« Demander le changement d'offre », pas de faux self-service).

## 24. Downgrade

Toujours non implémenté, aucun bouton ajouté. FAQ complétée avec une question dédiée renvoyant au contact commercial.

## 25-27. Comptes sup dynamique, coût total, annuel

Vérifié en direct (voir §6-8). Annuel : logique existante inchangée, non re-testée en direct dans ce lot (comportement déjà couvert par `plateforme.test.ts`).

## 28-31. Customer Portal, factures, payment_failed, FAQ

- Customer Portal : bouton inchangé.
- Factures : libellé clarifié (« Factures de votre abonnement ELSATIA … jamais vos factures clients »).
- **Payment_failed** : nouvelle alerte visible (statut `suspendu` + abonnement souscrit) avec CTA direct vers le Customer Portal — absente avant ce lot.
- FAQ : 3 questions ajoutées (downgrade, impact remise sur facture Stripe, disponibilité IA).

## 32. Cohérence admin plateforme

Non re-vérifiée par comparaison croisée en direct dans ce lot (friction rencontrée pour établir une session admin plateforme fonctionnelle avec un compte jetable fraîchement créé — investiguée mais non résolue dans le temps imparti, voir Limites). Analyse de code : `/plateforme` et `/abonnement` lisent les mêmes colonnes (`remise_*`, `abonnement_offre`, etc.) sur la même ligne `entreprises` ; aucune modification de ce lot ne touche à la manière dont `/plateforme` les affiche.

## 33-36. Responsive

**Bug réel trouvé et corrigé** : le comparatif utilisait deux grilles CSS incohérentes (en-tête `grid-cols-4` avec 5 enfants ≠ lignes `grid-cols-[1fr_repeat(4,4.5rem)]`), et la classe Tailwind arbitraire avec virgule ne compilait pas du tout (`grid-template-columns` calculé : une seule colonne pleine largeur, vérifié via `getBoundingClientRect`/`getComputedStyle` en direct). Corrigé avec une mise en page flex + classes Tailwind standard (`w-12`/`w-20`), **revérifié en direct, sans overflow, à 375px, 430px, 768px et 1280px** (mesures précises, pas seulement visuelles).

## 37. Accessibilité

Accordéons natifs `<details>/<summary>` — nativement focusables et opérables au clavier (Enter/Space), vérifié (`tabIndex !== -1` sur les 5 résumés). Navigation clavier complète (Tab à travers tout le comparatif, focus visible) non re-testée manuellement dans le temps imparti — repose sur le HTML sémantique natif plutôt que sur une implémentation JS custom, donc risque faible.

## 38. Design

Comparatif en accordéons + badges colorés (pas de tableau dense) conforme à la consigne. Aucune ligne dépassant 25 items par catégorie.

## 39. Performance

Aucun appel Stripe ajouté par ce lot — le comparatif est calculé localement (permission + statut catalogue), zéro requête réseau supplémentaire.

## 40. Tests unitaires

13 tests `comparatif-offres.test.ts` (états inclus/BETA/désactivé/non-inclus, gains d'upgrade réels, aucun gain DISABLED, aucune ligne inventée) + 5 tests `calculerReductionRemise` (pourcentage, montant, aucune remise, plafond au sous-total) — 18 tests nouveaux au total, sur les 20 items listés au §40 du cahier des charges (trial/annuel/payment_failed déjà couverts par des tests existants non modifiés).

## 41-42. Preview et Stripe

Déployé en Preview, fixture réelle (`RECETTE-ABOS-DETAIL-V1B`) : souscription Mini réelle via Stripe Test Checkout (carte 4242…), 5 employés ajoutés (2 comptes supplémentaires facturables), remise vérifiée par calcul testé unitairement. Stripe Test uniquement, aucun objet Live créé.

## 43-47. QA, cleanup, git

404/404 tests, typecheck propre, lint 0 erreur, build propre, `verify:secrets` (863 fichiers, 0 secret), `npm audit` 0 vulnérabilité, `verify:migrations` (202 migrations, aucune ajoutée). Fixture entièrement nettoyée (entreprise, 5 employés, propriétaire, compte admin jetable et son entreprise-coquille, ligne `plateforme_admins`) — zéro résidu, aucun trigger contourné. 3 commits logiques (mapping + comparatif, correctif responsive, documentation).

## 48. Limites restantes

- Cohérence admin plateforme (§32) non re-testée par comparaison croisée en direct — friction de configuration d'un compte admin jetable fonctionnel, non résolue dans le temps imparti. Risque jugé faible (mêmes données, mêmes colonnes, page `/plateforme` non modifiée).
- Navigation clavier complète non re-testée manuellement (accordéons natifs, risque faible).
- Annuel non re-testé en direct dans ce lot (déjà couvert par tests existants).
- Catégorie « Support » volontairement vide de toute comparaison (aucune donnée réelle à comparer).
