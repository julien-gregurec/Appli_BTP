# ABONNEMENTS-DETAIL-V1 — Page abonnement détaillée

**Constat de départ (22-08-2026) : la page `/abonnement` était déjà nettement plus détaillée que ne le laissait supposer le cahier des charges** — statut/offre/échéance, coût actuel réel (comptes + appareils + stockage), utilisation stockage avec barre de progression, consommation IA avec quota et politique configurable, portail Stripe, dernière facture, historique de facturation et de changements de tarif. Ce lot a audité l'existant, comblé deux lacunes réelles (aucune piste d'upgrade pour un abonné déjà souscrit, aucune FAQ), et documenté le reste comme roadmap plutôt que de le construire à la hâte.

## Source de vérité (§3 du cahier des charges)

- **Prix, comptes inclus, administrateurs, fonctionnalités par offre** : `src/lib/tarification.ts` (`OFFRES_TARIFAIRES`), seule source — `src/lib/plateforme.ts` ré-exporte le même tableau sous le nom `OFFRES` (`export const OFFRES = OFFRES_TARIFAIRES;`), aucune divergence trouvée. C'est ce que `/tarifs` et `/abonnement` utilisent déjà tous les deux.
- **Disponibilité produit réelle des modules (BETA/désactivé)** : `src/lib/feature-catalogue.ts` (`FEATURE_CATALOGUE`), système **distinct et orthogonal** de la tarification — il gate la maturité produit (CORE/BETA/DISABLED) indépendamment du plan tarifaire, alors que `tarification.ts` gate quelle offre inclut quelle permission. Les deux ne sont pas actuellement combinés dans une seule vue.
- **ARRÊT documenté plutôt que deviné** : construire un tableau comparatif combinant correctement ces deux systèmes (offre × permission × statut produit BETA/DISABLED) demande un travail de mapping soigné (les clés `FeatureKey` de `feature-catalogue.ts` et les clés de permission de `tarification.ts` ne sont pas nommées à l'identique) — non fait dans ce lot pour éviter d'afficher une information inexacte, conformément à la consigne « si une information est ambiguë : arrêt sur cette information, ne pas deviner ». Reporté en roadmap (voir plus bas).

## Offres conservées

Mini 79 €, Pro 249 €, Business 449 €, Entreprise 599 € HT/mois — aucun prix modifié. Entreprise conserve 50 comptes inclus (valeur déjà harmonisée lors de FINAL-FIX-P1-V1, non retouchée).

## Ce qui existait déjà (audité, non reconstruit)

- En-tête abonnement : statut, offre, périodicité, échéance/fin d'essai, résiliation programmée le cas échéant.
- Coût actuel réel : offre de base, comptes facturables au-delà du quota inclus, appareils supplémentaires, stockage supplémentaire — calculé, pas estimé au doigt mouillé.
- Utilisation stockage : barre de progression, alerte à 80 %, dépassement signalé.
- Consommation IA : compteur mensuel réel, politique de dépassement configurable, plafond de coût optionnel.
- Portail Stripe (« Gérer mon abonnement »), dernière facture (lien + PDF).
- Cartes d'offres avec prix réel et résumé, pour un compte non encore souscrit.
- Historique des factures d'abonnement et des changements de tarif.

## Ajouté dans ce lot

- **Section « Passer à l'offre supérieure »** (visible uniquement pour un abonné déjà souscrit, offre suivante réelle trouvée via `palier + 1` dans `OFFRES_TARIFAIRES`) : prix de l'offre suivante, liste des permissions réellement gagnées (diff `fonctionnalites` entre l'offre actuelle et la suivante, libellés repris de la navigation du tableau de bord `dashboard/page.tsx` — pas de fonctionnalité inventée). **Pas de bouton de changement de plan en libre-service** : le Customer Portal Stripe a `subscription_update.enabled: false` (confirmé P15) et aucune Server Action de changement d'offre n'existe côté app — conformément à la consigne « si ce comportement n'est pas réellement implémenté, ne pas ajouter de bouton fictif », le CTA renvoie vers un contact commercial, pas vers une action qui échouerait silencieusement.
- **FAQ** (6 questions) : réponses basées exclusivement sur le comportement réel déjà audité dans P15/AI-LAUNCH-V1 (annulation fin de période, essai 30 jours, absence de changement de plan en libre-service, suppression RGPD à 30 jours).

## Non fait dans ce lot (roadmap, par priorité)

1. **Comparatif détaillé par catégorie** (gestion commerciale, chantiers, planning/terrain, stock/matériel, pilotage, IA, support) avec les 4 états (Inclus/Limité/Non inclus/BETA) — nécessite d'abord de mapper proprement `feature-catalogue.ts` et `tarification.ts` (cf. ARRÊT ci-dessus).
2. **Upgrade/downgrade en libre-service réel** (aujourd'hui : ni portail Stripe ni app) — implique de construire et tester une Server Action appelant `changerOffreStripe` (déjà présent côté lib, jamais exposé), avec gestion de la proration et resynchronisation webhook : un chantier à part entière, pas une simple retouche de page.
3. **Refonte mobile en accordéons/cartes** pour un futur comparatif détaillé — sans objet tant que le comparatif lui-même n'existe pas.
4. **Moyen de paiement affiché** (« Carte se terminant par •••• ») — nécessite un appel Stripe dédié (`payment_methods`) non encore branché sur cette page.
5. **Vérification interactive réelle** (navigateur, 390/430px, clavier, lecteur d'écran) de l'existant ET des deux ajouts de ce lot — **non faite dans ce lot** : validée par revue de code et `typecheck`/`lint`/`build` uniquement, pas par un test d'interface réel (limite explicitement assumée, cf. `<when_to_verify>`).
6. Section « Utilisateurs supplémentaires » dédiée et « Estimation de facture » formelle : le contenu existe déjà mais fondu dans la section « Coût actuel de l'application » plutôt qu'en sections séparées comme demandé — non retouché dans ce lot (choix éditorial mineur, pas un manque fonctionnel).

## Server-side

Aucune donnée d'abonnement n'est exposée sans passer par `getContexteEntreprise()`/RLS — page 100 % server component, pas de confiance dans un état client pour l'affichage des données sensibles.

## Tests

Aucun test dédié ajouté pour cette page dans ce lot (limite) — la page reste un server component sans logique testée isolément aujourd'hui dans le dépôt (pas de régression introduite : `OFFRES`/`offreParCle` déjà couverts indirectement par les tests existants de `tarification.ts`/`plateforme.ts`).

## QA

Vitest 337/337, typecheck clean, lint clean (0 erreur après correction de guillemets typographiques — 3 warnings préexistants non liés), build OK, `verify:secrets` 851 fichiers/0 secret.
