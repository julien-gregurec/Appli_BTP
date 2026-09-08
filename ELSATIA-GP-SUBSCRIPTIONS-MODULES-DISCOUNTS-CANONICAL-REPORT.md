# ELSATIA — Gestion Pro : abonnements, modules et remises (canonique V1)

**Lot** `ELSATIA-GP-SUBSCRIPTIONS-MODULES-DISCOUNTS-CANONICAL-V1`
**Date** 8 septembre 2026

Aucune migration créée dans `supabase/migrations`, aucun numéro de migration réservé, aucun accès
Production, aucune modification Stripe Live, aucun déploiement, aucune fusion, aucun worktree /
stash / fichier non suivi supprimé, aucun worktree partagé modifié.

---

## 1. Verdict

**La grille publique demandée est déjà en place et exacte dans le code. Ce n'est pas elle qui
bloque la commercialisation : c'est tout ce qui devait s'accrocher autour.**

| Objectif du lot | État avant | État après ce lot |
|---|---|---|
| Conserver Mini / Pro / Business / Entreprise | ✅ déjà canonique (79 / 249 / 449 / 599) | inchangé, figé par tests |
| Ajouter des employés à n'importe quel forfait | ✅ capacité « personnes actives » livrée (R1) | chiffré par le moteur, exposé au configurateur |
| Activer des modules séparément | ⚠️ catalogue + entitlement livrés (R3), **aucun prix** | catalogue commercial avec prix, statut et règles |
| Choisir ou non les fonctions IA | ⚠️ options déclaratives, non branchées au calcul | option IA dans le moteur et le configurateur |
| Gestion Pro à la carte | ❌ inexistante | configurateur complet `/abonnement/configurateur` |
| Remise individuelle | ⚠️ une seule remise, un seul type, un seul périmètre | modèle complet (types, périmètres, durées, états) |
| Durée de la remise | ⚠️ `once` / `repeating` / `forever` seulement | 5 modes explicites, dates, retour au tarif normal |
| Cohérence avec le site public | ⚠️ **cassée côté Stripe Test** (voir §15) | divergence mesurée et documentée, non corrigée seule |

**Trois constats bloquants sortent de l'audit** — détaillés en §21 :

- **P0-1** — Stripe Test facture encore l'ancienne grille sur les Price **mensuels** :
  Mini 69 €, Pro 199 €, Business 399 € au lieu de 79 / 249 / 449. Le prix affiché n'est pas le
  prix facturé. Vérifié par exécution de `verify:stripe-prices` contre Stripe **Test**.
- **P0-2** — Le dépôt porte **deux modèles de facturation des comptes incompatibles**
  (par personne active vs par type de compte), et l'un des deux n'est facturé nulle part.
- **P0-3** — Aucun prix de module n'existe en base : R3 a livré le catalogue et l'entitlement,
  R4 (le billing) n'a jamais été fait. Vendre un module aujourd'hui est impossible.

Ce lot livre le **socle canonique** (source unique, moteur, contrats, interface, tests, SQL
proposé). Il ne referme aucun des trois P0 tout seul : deux d'entre eux demandent une décision
commerciale de Julien, le troisième une intervention Stripe explicite.

---

## 2. Audit Git

| Élément | Valeur |
|---|---|
| Dépôt | `git@github.com:julien-gregurec/Appli_BTP.git` |
| Base retenue | `origin/integration/elsatia-ecosystem-train-v2-reserves-gp-v1` @ `1fc1331842cdf5980b374169994587813bdee7b6` |
| Branche livrée | `feat/gp-subscriptions-modules-discounts-canonical-v1` |
| Worktree | `/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/gp-subscriptions-modules-discounts-v1` (créé pour ce lot) |
| Ledger de la base | 272 fichiers de migration, numéro fonctionnel maximal 274 |
| Stashes | 3, aucun touché |
| Worktrees existants | 59, aucun modifié |

**Pourquoi pas `main`.** `main` est resté à `4d92ddb` (29 juillet 2026) et ignore la totalité du
socle commercial. La base pertinente est le **train V2**, seule branche qui contient à la fois :
la capacité « personnes actives » (migration 256), le catalogue de modules R3 (257), le cycle de
vie Stripe (258→263), la politique d'essai 30 jours (265) et la grille canonique 79/249/449/599.

**Branches commerciales inspectées et non reprises** (rien n'a été fusionné) :

| Branche | Contenu | Décision |
|---|---|---|
| `fix/gp-public-pricing-canonical-alignment-v1` @ `6d3fcfd` | supprime le libellé « 40 salariés + 10 administrateurs », énonce la capacité en « personnes actives », ajoute `tarification-publique.test.ts` | **hors train**, à reprendre — cf. P1-1 |
| `docs/elsatia-modules-commercial-pricing-v1` @ `da9c8be` | étude pricing modules (515 lignes) | source des prix `provisoire` de ce lot |
| `codex/stripe-remise-idempotence-v2` @ `59162be` | idempotence métier des remises | déjà couvert par la saga présente dans le train |
| `feat/tarification-canonical-alignment-v1` @ `beb0ac5` | alignement de la grille | **déjà contenu** dans le train, par une autre route |

---

## 3. Architecture actuelle (constat)

### 3.1 Ce qui existe et fonctionne

| Brique | Fichier / migration | État |
|---|---|---|
| Grille publique | `src/lib/tarification.ts`, `src/lib/tarification.canonical.json` | source unique, version `CANONICAL-V3-2026-09` |
| Garde-fou prix affiché = prix facturé | `scripts/verify-stripe-prices.mjs` | fonctionne — et **détecte la divergence P0-1** |
| Capacité personnes actives | migration `…000256`, `src/lib/capacite-personnes.ts` | trigger SQL infranchissable, prix par forfait |
| Catalogue de modules | migration `…000257`, `src/lib/modules-gestion-pro.ts` | 19 modules, `plans_inclus`, entitlement entreprise, **sans prix** |
| Cycle de vie Stripe | migrations `…000258` à `…000263`, `src/lib/stripe-abonnement.ts` | checkout, webhook, capacité, annulation |
| Saga de remise | migrations `…000240`, `…000241`, `…000243` à `…000245` | opération à deux phases, verrou, attestation, idempotence |
| Essai 30 jours | migration `…000265` | borné au catalogue `statut_catalogue = 'actif'` |
| Comparatif d'offres | `src/lib/comparatif-offres.ts` | croise permissions et statut produit |

### 3.2 Ce qui manque ou diverge

1. **Aucun prix de module.** `modules_gestion_pro` n'a aucune colonne tarifaire ; le commentaire
   d'en-tête de `src/lib/modules-gestion-pro.ts` le dit explicitement (« Ce module TS ne porte
   AUCUN prix (pricing canonique/externe, R4) »).
2. **Trois définitions concurrentes du prix d'un compte** :
   `OFFRES_TARIFAIRES[].parCompteSup` (15 / 12 / 9 / 9 €, **réellement facturé**),
   `OPTIONS_TARIFAIRES` (5 / 9 / 15 / 0 €, **jamais facturé**),
   et des constantes en dur `500 / 900 / 1_500` dans `calculerTarifAbonnement`.
3. **Deux multiplicateurs annuels contradictoires.** Le forfait est à ×10 (« deux mois offerts »,
   figé par test), mais les options sont à ×12 dans `calculerTarifAbonnement`
   **et** dans `plateforme.prixAbonnementMensuel`.
4. **Le modèle de remise ne sait porter qu'un cas.** Colonnes `entreprises.remise_type`
   (`pourcentage` | `montant`), `remise_valeur`, `remise_duree_mois` : une seule remise à la fois,
   sur tout l'abonnement, sans dates, sans état, sans prix négocié, sans cumul, sans périmètre.
5. **La remise Stripe est globale par construction.** Le compte fonctionne en `billing_mode`
   *flexible* : un coupon posé sur l'abonnement se répartit **au prorata sur toutes les lignes**
   (vérifié empiriquement, `REMISES-CLIENTS-V1`). Une remise « sur le module Stock seulement »
   n'est donc pas représentable en l'état.
6. **Aucun configurateur.** `/tarifs` est une grille statique, `/abonnement` affiche l'existant.
   Rien ne permet de construire « Mini + 2 comptes + Stock » et d'en voir le prix.
7. **Aucune promotion publique, aucun coupon self-service, aucun crédit commercial** ne sont
   modélisés. Seul le geste individuel existe.

---

## 4. Architecture proposée (livrée)

```
src/lib/commercial/
  catalogue.ts        source canonique commerciale (ne redéfinit AUCUN prix de forfait)
  types.ts            contrats : configuration, remise, calcul, échéance
  moteur.ts           calcul pur et déterministe — SEUL endroit où un prix est calculé
  remises.ts          modèle de remise : périmètre, durée, état, cumul, validation
  autorisations.ts    politique §13 : rôle, AAL2, motif, confirmations, journal
  recommandation.ts   comparaison forfaits, recommandation jamais forcée
  stripe-mapping.ts   représentation Stripe (Price à créer, coupon vs Price dédié)
src/lib/modules-gestion-pro-codes.ts   liste des codes R3, sans dépendance serveur
src/components/commercial/
  ConfigurateurAbonnement.tsx   §7
  ConsoleRemises.tsx            §15
src/app/(app)/abonnement/configurateur/page.tsx
src/app/(app)/plateforme/remises/page.tsx
docs/migrations-proposees/gp-subscriptions-modules-discounts-v1.sql.proposed
```

Principe : `catalogue.ts` **importe** `tarification.ts` et le réexporte. Il n'y a toujours qu'une
seule définition du prix d'un forfait dans le dépôt. Le catalogue commercial n'ajoute que ce qui
manquait — prix des modules, modèle de comptes, blocs de stockage, options IA, TVA — et attache à
**chaque montant** un `statutPrix` :

| Statut | Sens |
|---|---|
| `valide` | décision actée, déjà câblée ailleurs (doc canonique, migration, Stripe) |
| `recommande` | proposition argumentée cohérente, en attente d'arbitrage |
| `provisoire` | montant de travail, non figé |
| `divergent` | **deux valeurs incompatibles coexistent** — le moteur n'en choisit jamais une silencieusement |
| `a_definir` | pas de prix ; vente interdite |

---

## 5. Forfaits

Inchangés, repris tels quels de la source canonique :

| Offre | Mensuel HT | Annuel HT | Personnes incluses | Personne sup. / mois | Stockage | IA / mois |
|---|---:|---:|---:|---:|---:|---:|
| Mini | 79 € | 790 € | 3 | 15 € | 10 Go | 100 op. |
| Pro | 249 € | 2 490 € | 15 | 12 € | 50 Go | 500 op. |
| Business | 449 € | 4 490 € | 30 | 9 € | 150 Go | 1 500 op. |
| Entreprise | 599 € | 5 990 € | 50 | 9 € | 300 Go | 3 000 op. |
| Sur mesure | sur devis | sur devis | selon contrat | — | 500 Go | 3 000 op. |

Règle annuelle : **annuel = 10 × mensuel**, « deux mois offerts ». Figée par test
(`moteur.test.ts` → « respecte la règle annuelle canonique ») **et** par `verify:stripe-prices`.

Les capacités affichées ont été auditées : elles sont cohérentes entre `tarification.ts`,
`tarification.canonical.json` et `TARIFICATION_CANONIQUE.md`. **Une seule réserve** : le libellé
« 40 salariés + 10 administrateurs » de l'offre Entreprise contredit la capacité officielle de
50 personnes actives. Le correctif existe (branche `fix/gp-public-pricing-canonical-alignment-v1`)
mais n'est pas dans le train — P1-1.

**La grille Gestion Pro reste étanche** : Tools, Colors, Réserves, Drone, Market et la Boutique
ELSATIA sont des applications distinctes (`APPLICATIONS_HORS_CATALOGUE_GP`), jamais des modules GP,
jamais dans `modules_gestion_pro`.

---

## 6. Modules

### 6.1 Granularité retenue — **modèle hybride**

- **Fonctions simples** : jamais vendues à l'unité. Le SOCLE (chantiers, clients, devis, factures,
  avoirs, paiements, relances, planning de base, messagerie, tableau de bord, fiches employés,
  droit IA) est intangible et présent dans **tous** les forfaits, Mini compris. C'est ce qui rend
  possible « je veux surtout des devis et de la facturation » sans monter de forfait.
- **Modules** : unité de vente. 19 codes techniques R3 regroupés en **18 produits commerciaux**
  (`materiel` + `vehicules` = un seul produit « Matériel & véhicules », les codes restent séparés
  en base).
- **Forfaits** : packs préconfigurés, toujours moins chers que l'achat séparé équivalent.

Le catalogue reste lisible : 7 modules réellement vendables ou inclus aujourd'hui, le reste étant
explicitement `bientôt` / `interne` / `non vendable` et **sans prix affichable**.

### 6.2 Catalogue commercial

`incl` = inclus dans le forfait · `—` = non proposé à ce niveau · montants HT/mois.

| Produit commercial | Codes R3 | Statut | Mini | Pro | Business | Entreprise | Statut prix |
|---|---|---|---:|---:|---:|---:|---|
| Suivi de chantier | `chantier` | actif | incl | incl | incl | incl | validé |
| Assistant IA (droit) | `ia` | actif | incl | incl | incl | incl | validé |
| Pointage | `pointage` | actif | 25 € | incl | incl | incl | provisoire |
| Notes de frais | `notes_frais` | actif | 12 € | incl | incl | incl | provisoire |
| Matériel & véhicules | `materiel`,`vehicules` | actif | 19 € | 15 € | incl | incl | provisoire |
| Stock & dépôt | `stock` | actif | 29 € | 24 € | incl | incl | provisoire |
| Rentabilité avancée | `rentabilite_avancee` | actif | — | 29 € | incl | incl | provisoire |
| Sécurité & prévention | `safety` | bientôt | — | — | — | — | provisoire |
| Formulaires terrain | `forms` | bientôt | — | — | — | — | provisoire |
| Connecteurs & API | `connect` | bientôt | — | — | — | — | provisoire |
| Automatisations | `automations` | bientôt | — | — | — | — | provisoire |
| Planning avancé | `planning_avance` | bientôt | — | — | — | — | à définir |
| Scan & OCR | `scan_ocr` | bientôt | — | — | — | — | à définir |
| Signature électronique | `signature` | bientôt | — | — | — | — | à définir |
| Maintenance | `maintenance` | bientôt | — | — | — | — | à définir |
| Facturation électronique | `facturation_electronique` | bientôt | — | — | — | — | à définir |
| Stockage supplémentaire | `stockage_supplementaire` | interne | \+50 Go / 19 € | idem | idem | idem | provisoire |
| Sauvegarde renforcée | `sauvegarde_renforcee` | non vendable | — | — | — | — | à définir |

Deux règles sont **testées** :

- un module dont `statut_catalogue <> 'actif'` n'est **jamais** vendable à la carte ;
- l'ensemble des `codesTechniques` du catalogue commercial est **exactement** l'ensemble des
  codes R3, sans doublon — impossible d'oublier ou de vendre deux fois un module.

### 6.3 Familles demandées au §5 du lot — couverture réelle

| Famille demandée | Couverture |
|---|---|
| Socle commercial (clients, devis, factures, avoirs, paiements, relances) | **inclus partout**, y compris Mini — jamais un module payant. **Exception : les prospects** relèvent du CRM (`acces_crm`, bloc GESTION), donc Pro et au-dessus, et le CRM est encore marqué BETA au catalogue produit |
| Chantiers | module `chantier`, inclus partout |
| Planning | planning de base inclus partout ; `planning_avance` à définir (delta non spécifié) |
| Pointage | module `pointage` |
| Congés et absences | **inclus à partir de Pro** (bloc TERRAIN de `tarification.ts`), **absent de Mini**, et **aucun module R3 ne permet de l'acheter** — trou réel, voir P1-6 |
| Notes de frais | module `notes_frais` |
| Achats et fournisseurs | **inclus** dès Pro par la permission `acces_achats` — pas de module R3 dédié |
| Stock | module `stock` |
| Matériel et outillage | module `materiel` |
| Véhicules et flotte | module `vehicules` (facturé avec `materiel`) |
| Documents / GED | **pas de module dédié ni de permission dédiée** — les documents vivent dans chantier / clients |
| Pilotage et rentabilité | base incluse partout, `rentabilite_avancee` en module |
| IA | droit inclus partout + quota par forfait + packs de crédits + IA intensive |
| Modules futurs (DOE, bibliothèque technique, QSE, automatisations, API) | `safety` couvre QSE, `automations` et `connect` existent ; **DOE et bibliothèque technique n'existent pas** au catalogue R3 |

Trois familles demandées n'ont **aucun code module R3** : congés/absences, achats/fournisseurs et
GED. Elles sont vendues implicitement par les permissions du forfait. Les transformer en modules
reviendrait à retirer des fonctions déjà promises — **décision D6**.

Le cas des **congés** est différent des deux autres et mérite une décision à part : la permission
`demander_ses_conges` appartient au bloc TERRAIN, donc à Pro et au-dessus. Un client Mini n'a donc
ni les congés dans son forfait, ni aucun module pour les acheter. C'est le seul besoin du §5 du lot
qu'une entreprise ne peut atteindre par **aucun** chemin depuis Mini — **P1-6**.

---

## 7. Comptes et salariés

La distinction est explicite et testée :

- **Salarié** = fiche `employes`. N'est pas facturé en tant que tel.
- **Personne active** = fiche non sortie **ET** compte applicatif non fermé
  (contrat SQL `compter_personnes_actives_entreprise`). C'est l'unité facturée.
- Une entreprise de **5 salariés avec 3 comptes** paie **79 € : le tarif Mini nu**. Testé.
- Une entreprise de **5 salariés avec 5 comptes** paie **79 + 2 × 15 = 109 €**. Testé.
- Elle n'est **jamais** obligée de passer sur Pro : testé (`10 900 < 24 900`).

### Audit des prix par type de compte demandés au §4

| Option | Prix demandé | Classement | Justification |
|---|---:|---|---|
| Compte terrain supplémentaire | 5 € | **divergent** | déclaré dans `OPTIONS_TARIFAIRES`, **jamais facturé** : aucun Price Stripe, aucune distinction en base |
| Compte chef d'équipe supplémentaire | 9 € | **divergent** | idem |
| Compte administratif supplémentaire | 15 € | **divergent** | idem ; égale par coïncidence le `parCompteSup` de Mini |
| Accès expert-comptable | gratuit | **recommandé** | cohérent (intervenant externe, hors capacité facturée) ; aucun mécanisme technique ne le distingue encore |
| Personne active supplémentaire (15 / 12 / 9 / 9 €) | — | **validé** | doc canonique + `parCompteSup` + Price Stripe `COMPTE_SUP_*` + trigger de capacité |

Aucun de ces montants n'a été modifié. Le moteur **sait calculer les deux modèles**
(`modeleComptes: "capacite_personnes" | "par_type_de_compte"`), le défaut restant celui qui est
réellement facturé, et le modèle par type émettant un avertissement explicite.

---

## 8. Configurateur

`/abonnement/configurateur` — accessible depuis « Mon abonnement ». Couvre les 14 points du §7 :

1. forfait de départ · 2. nombre de personnes actives · 3. modules (inclus / option / disponible /
indisponible, avec badge de statut de prix) · 4. blocs de stockage · 5. option IA ·
6. mensuel / annuel · 7. économie annuelle chiffrée · 8. remises affichées ligne à ligne avec leur
ordre · 9. total HT · 10. TVA · 11. total TTC (+ équivalent mensuel en annuel) · 12. comparaison
avec les quatre forfaits standards, y compris la couverture des modules · 13. recommandation du
moins cher · 14. **confirmation explicite en deux temps** — rien ne part sans récapitulatif validé.

La recommandation ne force jamais : `Recommandation.forcee` est typé `false`, le message dit
« vous pouvez conserver votre forfait actuel », et un test vérifie que la configuration n'est pas
modifiée par la recommandation.

Comme les souscriptions en ligne restent fermées (`ABONNEMENTS_PUBLICS_OUVERTS`) et qu'aucun
pipeline d'achat de module n'existe, la confirmation aboutit à l'envoi de la configuration au
commercial, pas à un paiement. C'est dit sans détour dans l'écran.

---

## 9. Moteur de calcul

`calculerAbonnement(configuration, { remises, date })` — **pur, déterministe, sans horloge ni I/O**.

- Tout est en **entiers de centimes HT**. Aucun flottant ne circule.
- Un seul arrondi de pourcentage : `Math.round`, demi-supérieur. `79 € × 50 % = 39,50 €` exactement.
- Répartition d'une remise entre plusieurs lignes : **méthode des plus forts restes**, somme
  distribuée exactement égale à la réduction, aucune ligne sous zéro.
- Total plancher à 0 : une remise supérieure au montant ne produit jamais de prix négatif.
- `calculerDepuisLignes()` permet de rejouer un chiffrage sur une **autre** grille publique —
  c'est ce qui permet de tester réellement le comportement d'une remise lors d'un changement de tarif.
- La projection `projeterEcheances()` chiffre les N prochaines échéances et signale la dernière
  échéance remisée.

Un prix n'est calculé nulle part ailleurs : le configurateur et la console de remise ne font
qu'afficher le résultat.

### Multiplicateur annuel — divergence assumée et exposée

| Famille | Valeur appliquée | Statut | Recommandé |
|---|---:|---|---:|
| Forfait | ×10 | validé | 10 |
| Comptes supplémentaires | ×12 | **divergent** | 10 |
| Modules | ×10 | recommandé | 10 |
| Stockage | ×12 | **divergent** | 10 |
| IA | ×12 | **divergent** | 10 |

Pour les lignes qui existent déjà (comptes, stockage, IA), le moteur reproduit le ×12 en vigueur :
changer ce multiplicateur modifierait silencieusement une facturation en cours. Les modules, eux,
n'ont aucun historique à préserver et sont posés directement à ×10. La valeur recommandée est
exposée à côté de la valeur appliquée, pour chaque famille. **Décision D3.**

---

## 10. Remises

### Types

| Type | Comportement | Quand le tarif public change |
|---|---|---|
| `pourcentage` | réduction proportionnelle | **suit** le nouveau prix |
| `montant` | somme fixe déduite | la déduction ne bouge pas |
| `prix_negocie` | prix **final** figé du périmètre | **ne bouge pas** |

Les deux premiers existaient. `prix_negocie` est nouveau. Le moteur ne les confond jamais :
un test vérifie qu'à tarif public 79 €, une remise de 50 % et un prix négocié de 39,50 € donnent
le même montant — puis qu'à 89 € le pourcentage donne 44,50 € tandis que le prix négocié reste
à 39,50 €.

Un prix négocié **supérieur** au tarif public n'est jamais appliqué : il est écarté avec un
avertissement (une remise ne peut pas augmenter une facture).

### Périmètres

`abonnement` · `forfait` · `comptes` · `modules` (tous, ou une liste précise) · `stockage` · `ia` ·
`mise_en_service` · `prestation`.

### Durées

| Mode | Fin |
|---|---|
| `une_echeance` | après une échéance de facturation |
| `nb_echeances` | après N échéances |
| `dates` | date de fin explicite |
| `jusqu_a_revocation` | aucune fin programmée, geste révocable |
| `permanente` | aucune fin programmée, engagement contractuel |

`jusqu_a_revocation` et `permanente` produisent le même calcul mais restent **deux choix
distincts** : ce sont deux engagements différents, et l'interface exige une confirmation
renforcée pour le second. Ils ne sont jamais confondus par le moteur.

### États

`programmee` · `active` · `expiree` · `revoquee` · `remplacee` · `annulee`. Un état terminal
(révoquée, remplacée, annulée) prime toujours et ne se « réactive » jamais.

### L'exemple obligatoire du §10 — testé intégralement

Client Mini, tarif public 79 € HT/mois, remise 50 % → **39,50 € HT/mois**.

| Durée demandée | Résultat vérifié |
|---|---|
| deux échéances | 39,50 · 39,50 · **79,00** · 79,00 — retour au tarif normal le 1ᵉʳ décembre |
| trois échéances | 39,50 · 39,50 · 39,50 · **79,00** |
| une échéance | 39,50 · **79,00** · 79,00 |
| dates personnalisées | programmée avant le début, active dans la fenêtre, expirée à la date de fin |
| sans date de fin | active indéfiniment, `dateRetourTarifNormal` renvoie explicitement « aucun retour programmé » |
| jusqu'à révocation | idem, et après révocation retour immédiat à 79 € avec la remise conservée à l'historique |

Aucune prolongation silencieuse : à l'expiration, la remise est **écartée avec sa raison**
(`état expiree au …`) et l'échéancier affiche le montant plein.

### Abonnement annuel (§11)

Aucune interprétation implicite. Sur un abonnement annuel, une durée exprimée en **échéances vaut
des ANNÉES** — `validerRemise` refuse la configuration tant que l'administrateur n'a pas confirmé
cette lecture, et l'interface affiche une case de confirmation dédiée. Les formes non ambiguës
(dates explicites, pourcentage sur la période, montant fixe) passent sans confirmation.

« Deux mois offerts » sur un abonnement annuel s'exprime donc explicitement, par exemple comme un
montant fixe de 2 × 79 € sur une échéance — testé.

### Cumul (§12)

1. **Aucune superposition silencieuse.** Deux remises actives dont les périmètres se recouvrent
   sont en conflit par défaut ; la plus étroite est retenue, l'autre écartée avec sa raison.
2. Le cumul n'est possible que si **les deux** remises le déclarent (`cumulAutorise`), et
   l'interface demande alors une confirmation.
3. **Un prix négocié est toujours exclusif** sur son périmètre, même avec le cumul coché.
4. En cumul autorisé, l'application est **en cascade du périmètre le plus étroit au plus large** :
   50 % sur le forfait puis 10 % sur l'abonnement donne 79 → 39,50 → 35,55 €, et la seconde
   remise s'affiche avec `base = 39,50` — jamais sur le prix d'origine.
5. Chaque avantage est exposé avec son `ordre`, sa base, sa réduction et son explication littérale.
6. Total plancher à 0, jamais de prix négatif.

Coupons publics, promotions et crédits commerciaux **ne sont pas modélisés** : rien dans le dépôt
ne les implémente aujourd'hui. Les inventer aurait été une décision commerciale non demandée —
**décision D8**.

---

## 11. Permissions et sécurité (§13)

`evaluerRemise(remise, contexte)` — politique pure, testée :

| Exigence | Toujours | Renforcé si |
|---|---|---|
| Rôle plateforme | ✅ | — |
| MFA / AAL2 | ✅ | — |
| Motif obligatoire (≥ 5 caractères, jamais montré au client) | ✅ | — |
| Aperçu avant / après | ✅ | — |
| Journalisation immuable | ✅ | — |
| Seconde confirmation explicite | — | remise ≥ 30 %, sans fin, prix négocié, ou cumul autorisé |
| Avertissement renforcé | — | idem |
| Validation d'un second administrateur | — | **uniquement si ≥ 2 administrateurs existent**, et remise sans fin ou prix négocié |

**Julien n'est jamais bloqué en exploitation solo** : avec un seul administrateur, la validation
par un second n'est jamais exigée — c'est la double confirmation, le motif, la MFA et l'historique
complet qui tiennent lieu de quatre-yeux. Testé explicitement.

Le contrôle réel reste côté base (`est_plateforme_admin()`, `plateforme_autoriser_effet_externe`,
AAL2) ; cette politique décide de ce que l'interface exige **avant** d'appeler l'action, et donne
le même verdict dans les tests.

---

## 12. Historique (§14)

`construireEntreeJournal()` produit une entrée portant : entreprise, abonnement, forfait, modules,
tarif public, ancien prix, nouveau prix, type, valeur, périmètre (avec la liste de modules quand
il y en a une), mode de durée, date de début, date de fin, auteur, motif, impact estimé,
**identifiant Stripe masqué** (`sub_…4D5E`, jamais l'identifiant complet), factures concernées,
date de création.

Côté SQL proposé, `historique_remises_commerciales` porte un trigger qui **interdit tout UPDATE et
tout DELETE**, y compris à un administrateur plateforme.

**Une remise ne modifie jamais une facture déjà émise** : le moteur ne chiffre que des échéances,
et une remise dont la date de début est postérieure à une échéance ne s'y applique pas — testé
(`7 900 · 7 900 · 3 950` pour une remise démarrant à la troisième échéance).

---

## 13. Interface administrateur plateforme (§15)

`/plateforme/remises`, réservée aux administrateurs plateforme (`estPlateformeAdmin`, `notFound()`
sinon), accessible depuis l'espace plateforme.

Elle permet : rechercher l'entreprise · voir son forfait, ses modules achetés, ses personnes
actives, son prix public et son prix souscrit · choisir type, périmètre, durée, valeur · saisir le
motif · **prévisualiser les six prochaines échéances** · voir l'avant / après et la date de retour
au tarif normal · voir le mécanisme Stripe qui serait employé · cocher les confirmations exigées ·
appliquer · consulter l'historique · révoquer.

**Aucune modification directe du prix en base n'est possible depuis cet écran.** Le bouton
d'application est désactivé tant qu'un contrôle n'est pas levé, et l'écran refuse explicitement
d'envoyer une combinaison que le schéma actuel ne sait pas représenter fidèlement :

- prix négocié (exige un Price Stripe dédié et la table proposée) ;
- périmètre restreint (le coupon Stripe se répartit au prorata sur toute la facture) ;
- fenêtre de dates (non portée par `remise_duree_mois`) ;
- durée en échéances sur un abonnement annuel (Stripe compterait des mois).

C'est un refus assumé : mieux vaut un bouton grisé avec sa raison qu'une remise appliquée
approximativement.

---

## 14. Source unique des prix (§17)

```
tarification.canonical.json ─┐
                             ├─→ tarification.ts ─→ commercial/catalogue.ts ─→ commercial/moteur.ts
verify:stripe-prices ────────┘                                                        │
                                                    ┌─────────────────────────────────┤
                              /tarifs · /abonnement · configurateur · console remises · tests
```

- La grille des forfaits n'est définie **qu'une fois**, dans `tarification.ts`, et vérifiée contre
  Stripe par `verify:stripe-prices`.
- `catalogue.ts` importe et réexporte — il ne recopie aucun montant de forfait.
- Le site public reste alimenté par un artefact versionné (`tarification.canonical.json`,
  version `CANONICAL-V3-2026-09`).
- **Les remises individuelles ne sont jamais exportées comme prix publics** : elles vivent dans
  une table par entreprise, la vue client `mes_remises_visibles` n'expose ni motif ni auteur, et
  aucun chemin ne relie une remise au fichier canonique.

---

## 15. Stripe Test — audit

Exécuté en **lecture seule** contre Stripe **Test** (`sk_test`), sans jamais imprimer d'identifiant
complet, via `node --env-file=.env.local scripts/verify-stripe-prices.mjs` :

```
verify:stripe-prices — catalogue CANONICAL-V3-2026-09 — accès Stripe: api

✗ mini mensuel      : montant 6900 ≠ 7900
✓ mini annuel       : 790,00 € /year
✗ mini              : règle annuelle cassée — annuel 79000 ≠ 10 × mensuel 6900
✗ pro mensuel       : montant 19900 ≠ 24900
✓ pro annuel        : 2490,00 € /year
✗ pro               : règle annuelle cassée
✗ business mensuel  : montant 39900 ≠ 44900
✓ business annuel   : 4490,00 € /year
✗ business          : règle annuelle cassée
✓ entreprise mensuel: 599,00 € /month
✓ entreprise annuel : 5990,00 € /year

✗ 6 divergence(s). Le prix affiché ne correspond pas au prix facturé.
```

**Les Price mensuels Mini / Pro / Business pointent encore la grille TARIFS-V2 (69 / 199 / 399 €).**
Les Price annuels et l'offre Entreprise sont corrects.

**Aucun objet Stripe n'a été créé, modifié ou supprimé par ce lot** — ni en Test, ni en Live.
Corriger demande de créer trois nouveaux Price Test et de repointer les variables
`STRIPE_PRICE_{MINI,PRO,BUSINESS}_MENSUEL` : c'est un geste sortant, il appartient à une décision
explicite et non à un lot d'architecture. **P0-1.**

### Représentation Stripe proposée (`stripe-mapping.ts`)

| Élément | Mécanisme | État |
|---|---|---|
| Forfait | `STRIPE_PRICE_<FORFAIT>_<PERIODICITE>` | existe |
| Personne active supplémentaire | `STRIPE_PRICE_COMPTE_SUP_<FORFAIT>_<PERIODICITE>` | existe |
| Module | `STRIPE_PRICE_MODULE_<MODULE>_<FORFAIT>_<PERIODICITE>` | **à créer** (14 variables) |
| Bloc de stockage | `STRIPE_PRICE_BLOC_STOCKAGE_<PERIODICITE>` | **à créer** (2 variables) |
| Remise en pourcentage | coupon `percent_off` | existe, **jamais un Price par remise** |
| Montant fixe déduit | coupon `amount_off` | existe |
| Prix négocié | **Price dédié** avec `metadata.elsatia_remise_id` | à créer par remise négociée |
| Durée « une échéance » | coupon `once` | existe |
| Durée « N échéances » (mensuel) | coupon `repeating` + `duration_in_months` | existe |
| Durée « N échéances » (annuel) | **refusé** — Stripe compte des mois | crédit commercial ou dates |
| Fenêtre de dates | **refusé** — non exprimable sur un coupon | expiration portée par ELSATIA |
| Permanente / jusqu'à révocation | coupon `forever` | existe |

Le §16 du lot demande de ne pas créer un Price par remise en pourcentage : c'est respecté et
**testé**. Le Price dédié n'est justifié que pour un prix négocié, précisément parce qu'un coupon
`amount_off` devrait être recalculé à chaque changement de grille, ce qui casserait la promesse
« le montant ne bouge pas ».

Six points d'attention du cycle de vie (prorata, renouvellement, annulation, lignes de facture,
taxes, facture émise) sont documentés dans `POINTS_ATTENTION_STRIPE`.

---

## 16. Stripe Live

**Non touché.** Aucune clé Live n'a été lue, aucun appel n'a été fait vers un environnement Live.
L'audit Live s'est limité à l'inspection statique du code : `src/lib/stripe-webhook-environment.ts`
et `stripe-state-attestation.ts` séparent déjà les environnements, et `verify:stripe-prices` refuse
un Price avec `livemode = true`.

---

## 17. Tests

`npx vitest run src/lib/commercial/` → **81 tests, tous verts**, répartis en :

| Fichier | Couverture |
|---|---|
| `moteur.test.ts` (61) | catalogue, comptes, modules, options, périodicité, TVA/arrondis, exemple canonique 79 € − 50 %, prix négocié vs pourcentage permanent, cumul, non-rétroactivité, comparaison et recommandation, durées ambiguës annuelles, lignes |
| `autorisations.test.ts` (9) | rôle, MFA, motif, seconde confirmation, exploitation solo, second administrateur, journalisation, masquage Stripe |
| `stripe-mapping.test.ts` (11) | variables de Price, coupon vs Price dédié, refus des formes non exprimables, métadonnées |

Correspondance avec la liste du §18 du lot :

| Cas demandé | Test |
|---|---|
| Mini avec trois comptes | ✅ |
| Mini avec cinq employés et cinq comptes | ✅ |
| Mini avec cinq salariés mais trois comptes | ✅ |
| Ajout de deux comptes | ✅ |
| Ajout / retrait de module | ✅ |
| IA désactivée / activée | ✅ |
| Stockage | ✅ |
| Comparaison avec Pro | ✅ |
| Recommandation non forcée | ✅ |
| Mensuel / annuel | ✅ |
| Remise 50 % pendant deux mois / trois mois | ✅ |
| Remise permanente | ✅ |
| Prix négocié fixe | ✅ |
| Expiration / révocation | ✅ |
| Cumul interdit | ✅ |
| Montant non négatif | ✅ |
| Droits / MFA / journalisation | ✅ |
| Facture historique inchangée | ✅ (non-rétroactivité) |
| Abonnement existant inchangé | ✅ (`calculerDepuisLignes`) |
| Changement de tarif public | ✅ |
| Calcul HT / TVA / TTC, arrondis | ✅ |
| Webhooks, idempotence | **existants** — `stripe-abonnement.test.ts`, `stripe-discount-consistency.test.ts`, `api/stripe/abonnement/webhook/route.test.ts`, inchangés et toujours verts |

Le build a d'ailleurs attrapé un vrai défaut : `commercial/catalogue.ts` importait
`modules-gestion-pro.ts`, lequel tire `@/lib/supabase/server` (donc `next/headers`) et ne peut pas
entrer dans un composant client. La liste des codes a été sortie dans
`src/lib/modules-gestion-pro-codes.ts`, sans dépendance serveur ; `modules-gestion-pro.ts` la
réexporte, son API publique est inchangée.

### Vérifications exécutées

| Commande | Résultat |
|---|---|
| `npx tsc --noEmit --incremental false` | ✅ 0 erreur |
| `npx eslint` (racine) | ✅ 0 erreur, 4 avertissements préexistants |
| `npx vitest run --testTimeout=120000` (racine) | ✅ **1 323 tests verts / 1 323**, 120 fichiers. Avec le délai par défaut de 5 s, `xlsx.test.ts` et `stripe-discount-legacy-surface.test.ts` dépassent le temps imparti à cause de la lenteur d'E/S du volume externe où vit le worktree — les deux passent dès que le délai est relevé. Aucune régression. |
| `node scripts/verify-migrations.mjs` | ✅ 272 migrations valides, noms et horodatages uniques |
| `node scripts/verify-secrets.mjs` | ✅ 1 515 fichiers, aucun secret |
| `node scripts/verify-stripe-prices.mjs` (Test) | ✗ **6 divergences** — voir §15 |
| `git diff --check` | ✅ propre |
| `npx next build` | ✅ compilé, les deux nouvelles routes présentes (`/abonnement/configurateur`, `/plateforme/remises`) |

---

## 18. Branche et SHA

| | |
|---|---|
| Branche | `feat/gp-subscriptions-modules-discounts-canonical-v1` |
| Base | `1fc1331842cdf5980b374169994587813bdee7b6` |
| SHA du contenu | `7d9a1ea427688cfcce4b2ee9ce828e1f0c5a5946` — `feat(commercial)`, tout le code, les tests et le SQL proposé |
| SHA final | le commit qui ajoute ce rapport ; `git rev-parse origin/feat/gp-subscriptions-modules-discounts-canonical-v1` |

Poussée sur `origin`. **Aucune fusion, aucun déploiement.**

---

## 19. SQL proposé, non intégré

`docs/migrations-proposees/gp-subscriptions-modules-discounts-v1.sql.proposed` — **hors
`supabase/migrations`, sans numéro réservé.**

Contenu : `modules_gestion_pro_tarifs` (prix des modules, versionné, avec statut de prix et
multiplicateur annuel explicite) · `remises_commerciales` (types dont `prix_negocie`, périmètre,
5 modes de durée, 6 états, cumul, priorité, motif, auteur, révocation, remplacement, photo du prix
public et du prix résultant) · `historique_remises_commerciales` (append-only, trigger
d'immuabilité) · `remise_perimetre_recouvre()` (même sémantique que le TypeScript) ·
`plateforme_creer_remise()` / `plateforme_revoquer_remise()` (AAL2 via
`plateforme_autoriser_effet_externe`, refus de cumul, refus d'ambiguïté annuelle) ·
`reconcilier_etats_remises()` (idempotente) · vue client `mes_remises_visibles` (ni motif, ni
auteur, ni identifiant Stripe) · seed des prix modules en `statut_prix = 'provisoire'`.

Additif : aucune migration historique modifiée, aucune ACL élargie, les colonnes
`entreprises.remise_*` et la saga Stripe existante restent en place.

---

## 20. Dépendances avec le Train V3

1. **Numérotation** : le fichier proposé devra être numéroté à la suite du ledger réel au moment
   de la reprise (le train V2 s'arrête au numéro fonctionnel 274) puis déplacé dans
   `supabase/migrations`. Ce lot n'a réservé aucun numéro.
2. **Reprise des remises existantes** : les colonnes `entreprises.remise_*` non nulles devront
   être converties en lignes `remises_commerciales` (périmètre `abonnement`, durée déduite de
   `remise_duree_mois`), avec une action d'historique `migration` à ajouter à la contrainte CHECK.
3. **Prérequis** : `plateforme_autoriser_effet_externe('remise_abonnement')` doit exister dans la
   base cible (migration `…000237` et suivantes).
4. **Tests pgTAP** à écrire dans `supabase/tests/`, sur le modèle de
   `modules_a_la_carte_r3_v1.test.sql` : RLS, immuabilité de l'historique, refus de cumul, refus
   d'ambiguïté annuelle, exclusivité du prix négocié.
5. **Branche `fix/gp-public-pricing-canonical-alignment-v1`** (P1-1) devrait entrer dans le train
   avant ou avec ce lot : les deux touchent `src/lib/tarification.ts` et
   `docs/organisation/TARIFICATION_CANONIQUE.md`. Le conflit sera trivial mais réel.
6. **Aucun couplage inverse** : le code livré ici ne dépend d'aucune migration nouvelle. Le
   configurateur fonctionne intégralement sur la base actuelle ; seule la console de remise voit
   ses capacités avancées grisées tant que le SQL proposé n'est pas repris.

---

## 21. P0 / P1 / P2

### P0 — bloquants pour vendre

| # | Sujet | Détail | Action |
|---|---|---|---|
| **P0-1** | Stripe Test facture l'ancienne grille | Mini 69, Pro 199, Business 399 sur les Price **mensuels** ; le prix affiché n'est pas le prix facturé | créer trois Price Test aux bons montants et repointer `STRIPE_PRICE_{MINI,PRO,BUSINESS}_MENSUEL`, puis relancer `verify:stripe-prices --strict` |
| **P0-2** | Deux modèles de comptes incompatibles | 5/9/15 € par rôle (jamais facturé) vs 15/12/9/9 € par personne active (facturé) | trancher : décision D1 |
| **P0-3** | Aucun prix de module en base | R3 a livré catalogue et entitlement, jamais le billing | valider les prix (décision D2) puis reprendre le SQL proposé par le Train V3 |
| **P0-4** | Aucun Price Stripe de module | 16 Price à créer : 14 `STRIPE_PRICE_MODULE_*` et 2 `STRIPE_PRICE_BLOC_STOCKAGE_*` | après D2, lot Stripe dédié |

### P1 — à traiter avant l'ouverture commerciale

| # | Sujet | Action |
|---|---|---|
| **P1-1** | Libellé « 40 salariés + 10 administrateurs » contredit la capacité officielle de 50 personnes actives | reprendre `fix/gp-public-pricing-canonical-alignment-v1` @ `6d3fcfd` dans le train |
| **P1-2** | Multiplicateur annuel des options à ×12 alors que le forfait est à ×10 | décision D3, puis alignement de `calculerTarifAbonnement` **et** `prixAbonnementMensuel` |
| **P1-3** | Remise Stripe globale par construction (prorata sur toutes les lignes) | une remise à périmètre restreint exige un coupon au niveau de la ligne ou un Price dédié |
| **P1-4** | Trois définitions concurrentes du prix d'un compte dans le code | après D1, supprimer les constantes en dur de `calculerTarifAbonnement` |
| **P1-5** | Pas de crédit commercial ni de promotion publique | décision D8 |
| **P1-6** | Les congés/absences sont inaccessibles depuis Mini, par forfait comme par module | décision D11 : ouvrir un module `conges` ou descendre `demander_ses_conges` dans le SOCLE |

### P2 — dette et confort

| # | Sujet |
|---|---|
| **P2-1** | Achats/fournisseurs et GED n'ont aucun code module R3 : vendus implicitement par les permissions du forfait — décision D6. (Le cas des congés est plus grave et remonte en P1-6.) |
| **P2-2** | DOE et bibliothèque technique absents du catalogue R3 alors qu'ils sont cités comme modules futurs |
| **P2-3** | L'offre « Sur mesure » occupe une cinquième colonne publique ; l'étude recommande de la sortir de `/tarifs` |
| **P2-4** | `feature-catalogue.ts` et `modules_gestion_pro` décrivent deux fois le périmètre produit, avec des clés différentes |
| **P2-5** | Deux tests de la suite racine dépassent le délai de 5 s sur volume externe — envisager un `testTimeout` global plus généreux |

---

## 22. Décisions restant à prendre

| # | Décision | Recommandation |
|---|---|---|
| **D1** | Modèle de facturation des comptes : par personne active (actuel, facturé) ou par type de compte (5/9/15 €) | **garder le modèle par personne active** : il est facturé de bout en bout. Le prix par rôle demanderait une distinction de rôle en base, dans Stripe et dans la capacité — un lot entier, pour un gain commercial non démontré |
| **D2** | Valider ou non les prix de modules `provisoire` (pointage 25, stock 29/24, matériel & véhicules 19/15, notes de frais 12, rentabilité avancée 29) | valider les six pour ouvrir la vente ; ils sont cohérents avec le gradient de capacité |
| **D3** | Multiplicateur annuel des options : ×10 ou ×12 | **×10 partout** : la promesse publique est « deux mois offerts », pas « deux mois offerts sauf sur les options » |
| **D4** | Notes de frais incluses dans Mini ? | oui — l'étude le recommande, et 12 €/mois ne justifie pas la complexité |
| **D5** | « Matériel & véhicules » = un seul produit commercial ? | oui, déjà appliqué dans le catalogue livré ; les codes techniques restent séparés |
| **D6** | Congés/absences, achats/fournisseurs, GED : rester inclus au forfait ou devenir des modules ? | **rester inclus** : les transformer en modules retirerait des fonctions déjà promises |
| **D7** | Périmètre exact de la remise par défaut dans la console (abonnement complet, seul cas représentable aujourd'hui) | conserver ; ouvrir les autres périmètres avec la reprise du SQL proposé |
| **D8** | Créer un mécanisme de promotion publique / coupon self-service / crédit commercial ? | pas maintenant — aucun besoin exprimé, et chaque mécanisme supplémentaire multiplie les règles de cumul |
| **D9** | Seuil de « remise importante » (30 % retenu) et seuil de validation par un second administrateur | à confirmer ; le seuil est une constante unique, changeable sans refonte |
| **D10** | Corriger P0-1 en créant trois Price Stripe **Test**, ou attendre un lot Stripe dédié | corriger vite : tant que la divergence dure, toute recette de bout en bout facture le mauvais montant |
| **D11** | Congés/absences sur Mini : créer un module `conges` ou déplacer `demander_ses_conges` dans le SOCLE | **descendre la permission dans le SOCLE** : demander ses congés est une fonction de base attendue de toute TPE, et la vendre séparément à 3 personnes serait mal reçu |

---

*Fin du rapport. Aucune fusion, aucun déploiement, aucune migration canonique créée.*
