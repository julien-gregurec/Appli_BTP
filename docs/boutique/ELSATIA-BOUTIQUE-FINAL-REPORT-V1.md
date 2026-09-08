# ELSATIA — Boutique : rapport final du lot

| | |
|---|---|
| Lot | `ELSATIA-BOUTIQUE-COMMERCE-ARCHITECTURE-READINESS-V1` |
| Nature | **Documentaire exclusivement.** |
| Révision | **R2 — décisions Q2, Q8, Q9 et P0 consignées.** Audit `6cb0b79` accepté. |
| Branche | `audit/elsatia-boutique-commerce-architecture-v1` |
| SHA de base | `1fc1331` — `integration/elsatia-ecosystem-train-v2-reserves-gp-v1` |
| SHA du contenu R1 | `406b8d3` (audit accepté : `6cb0b79`) |
| SHA du contenu R2 | `06f6aa4` |
| SHA final poussé | *(commit de consignation, ci-dessous)* |
| Worktree | `/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/boutique-commerce-architecture-v1` |
| Date | 2026-09-08 |

---

## 1. Verdict

**La Boutique ELSATIA existe déjà sous forme d'un prototype B2B fonctionnel, propre sur son
périmètre étroit, masqué par un interrupteur — et il lui manque la totalité de la couche
commerciale légale.**

Le chemin technique commande → paiement → confirmation → stock → trésorerie fonctionne
réellement. Ce qui manque n'est pas de la plomberie : c'est du droit, de la logistique et un
modèle client.

Deux constats dominent tous les autres :

1. **ELSATIA encaisse aujourd'hui sans émettre de facture.** Une commande payée crée une
   écriture dans la comptabilité *du client*, pas un document de vente d'ELSATIA. C'est le
   premier bloquant, avant même les CGV.
2. **Le B2C est structurellement impossible.** `boutique_commandes.entreprise_id` est `not null`
   vers `entreprises`, et toute la RLS en dépend. Vendre une carte NFC à quelqu'un qui n'est pas
   déjà client Gestion Pro ne demande pas une colonne : cela demande un modèle client.

**La Boutique n'est pas prête à ouvrir, et elle n'est pas bloquée par sa propre complexité :
elle est bloquée par l'état de l'écosystème autour d'elle.** Cinq de ses sept dépendances sont
sur des branches non fusionnées.

### Ce que la révision R2 change

Trois décisions ont été rendues et consignées (`ELSATIA-BOUTIQUE-DECISIONS-R2-V1.md`) :

| Décision | Effet |
|---|---|
| **D-Q2 — B2C accepté** | Deux modèles clients distincts. `entreprise_id` cesse d'être la clé d'entrée. **Aucun faux tenant professionnel** n'est acceptable comme contournement. Acheter ne demande plus de compte ; **activer**, si. |
| **D-Q8 — réattribution** | Retenue, avec l'indirection au niveau du support. Le jeton révoqué est celui **du profil**, pas l'identifiant gravé — sinon la carte serait à usage unique et le QR imprimé deviendrait faux. |
| **D-Q9 — socle permanent** | La carte est un **bien vendu**, pas un service loué. L'arrêt d'un abonnement avancé ne désactive pas le socle. C'est une contrainte de code, pas une consigne d'exploitation. |

**Le P0 passe de deux à quatre conditions**, et la quatrième change le séquencement du projet :
plus aucune commande ne peut être payable sans facture de vente ELSATIA. Il n'existe donc plus de
palier intermédiaire où la Boutique serait ouverte mais pas encore facturante — le lot
« Factures et avoirs » cesse d'être différable.

## 2. État réel de l'existant

Vérifié dans le code au SHA `1fc1331`, et non repris du constat historique.

| | |
|---|---|
| **Développé** | 6 migrations, 3 tables, 2 fonctions `security definer`, 6 pages, 4 actions serveur, Checkout Stripe ponctuel, webhook dédié avec secret propre, 2 permissions |
| **Partiel** | Panier (`localStorage` seul), stock (jamais réservé), TVA (un taux figé par produit), images (URL externe libre), adresses (5 champs texte) |
| **Désactivé** | `store: DISABLED` dans le catalogue de features — c'est ce qui masque réellement la Boutique |
| **Documenté seulement** | Contact/Card (`0e644d5`), Market (`e0d45c9`), boutique matériel & Labels (653 lignes, branche non fusionnée) |
| **Absent** | Facture, avoir, remise, coupon, retour, remboursement, litige, expédition, suivi, transporteur, e-mails Boutique, client particulier, variantes, personnalisation, journal append-only, bucket de médias |

### Correction du constat historique

| Affirmation | Verdict |
|---|---|
| Panier et Stripe existaient | **exact** |
| `FEATURE_BOUTIQUE_ENABLED=false` | **faux** — la variable n'existe ni dans `.env.example` ni dans `vercel.json`, et `boutiqueEstActive()` est **fail-open** : absente ⇒ boutique **active**. Seule des quatre fonctions du fichier à l'être, contre le commentaire du fichier lui-même. |
| Catalogue vide | **exact** — aucun seed, seulement des fixtures de test |
| CGV, livraison, retours, e-mails incomplets | **exact, et plus grave** — 0 occurrence de « boutique », « livraison », « retour », « remboursement », « garantie légale », « médiateur » dans les CGV ; 0 gabarit e-mail Boutique |

## 3. Périmètre V1 proposé

| Inclus | Motif |
|---|---|
| Catalogue multi-nature : produit / variante / **prix daté** | Sans lui, aucune des natures demandées n'est représentable |
| **Deux modèles clients** : particulier et professionnel (D-Q2) | Sans eux, on ne vend qu'aux abonnés existants. Aucun faux tenant professionnel |
| Achat sans compte, **activation avec compte**, rattachement ultérieur idempotent (D-Q2) | Un dirigeant commande pour son équipe ; un particulier offre une carte |
| Panier serveur avec **réservation de stock** | Corrige la survente silencieuse |
| Paiement ponctuel, Stripe **Test uniquement** | Le mode déjà en place, durci |
| Commandes à 4 axes d'états | Les 20 libellés demandés, sans combinaisons impossibles |
| **Facture de vente ELSATIA** + avoirs | Bloquant légal |
| Retours, remboursement plafonné, litiges | Absents aujourd'hui |
| Expéditions, transporteur, suivi, incidents | Absents aujourd'hui |
| Cartes NFC : support, activation, association, **réattribution à 9 exigences**, révocation (D-Q8) | Le produit V1 envisagé |
| **Socle permanent** non désactivable par la facturation (D-Q9) | La carte est un bien vendu |
| Administration plateforme (16 domaines) | 2 sur 16 existent |
| Journal append-only | Aucune trace aujourd'hui |

## 4. Fonctions différées, et pourquoi

| Différé | Motif |
|---|---|
| ~~Commande sans compte~~ | **Plus différée (D-Q2).** L'achat sans compte est retenu, avec rattachement ultérieur facultatif. Les difficultés relevées deviennent des exigences du lot 1 : lien de suivi borné en durée et en portée, vérification d'identité RGPD ne se réduisant pas à l'adresse e-mail, rattachement idempotent. |
| **Panier mixte bien + abonnement** | **Écarté définitivement (D-Q9)** : option C retenue — achat du bien seul, abonnement proposé à l'activation. |
| **Coupons Stripe** | Bloqués par l'usage de `price_data` inline. À rouvrir si l'option B ou C du §1.10 du catalogue est retenue. |
| **Vente hors de France** | Suppose la résolution complète de la TVA par pays. À décider (Q7), pas à subir. |
| **Précommande** | Modélisée comme disponibilité, non développée en V1. |
| **Acompte** | Décision comptable non rendue. |
| **Pont fort avec le stock Gestion Pro** | Refusé par conception : deux stocks, deux propriétaires. Seul un pont **faible, optionnel, proposé et non appliqué** est retenu. |

## 5. Produits envisagés

Aucun prix, aucun délai, aucune finition, aucune garantie n'est fixé.

| Produit | Nature | Statut |
|---|---|---|
| Carte NFC individuelle | `physique` / `physique_personnalise` | envisagé, produit V1 principal |
| Carte entreprise | `physique_personnalise` | envisagé |
| Lot équipe | `lot` | envisagé |
| Carte de remplacement | `remplacement` | envisagé |
| Accessoires (étui, support) | `accessoire` | envisagé |
| Matériel hérité (imprimantes, plastifieuses, étiquettes) | `physique` | **présent dans le schéma actuel**, jamais mis en vente |
| Licences, formations, prestations, produits numériques | diverses | modélisés, non planifiés |

## 6. Dépendances

| Dépendance | État | Impact |
|---|---|---|
| **Train V3** | non fusionné | Bloquant de fait — socle multiproduit, annuaire, accès support |
| **Moteur multiproduit / figement du prix contractuel** | non fusionné | La Boutique inventerait sa propre notion de prix figé |
| **Contact/Card** | documentaire, `0e644d5`, **zéro code** | Le lot cartes NFC n'a rien sur quoi s'appuyer |
| **Gestion Pro** | dans le train | Pont **faible et optionnel** uniquement |
| **Stripe** | Test seulement | Aucun repointage Live avant le figement du prix par le Train V3 |
| **Site** | dépôt distinct, non touché | Un bloc « À venir » suffit |
| **Support transversal** | non fusionné | Sans lui, l'administration inventerait son propre régime d'accès client |

## 7. Risques

| # | Risque | Gravité | Observation |
|---|---|---|---|
| R1 | **Encaisser sans facturer** | **critique** | Existe aujourd'hui dans le code |
| R2 | **Réouverture accidentelle de la Boutique** | **élevée** | `boutiqueEstActive()` fail-open + un override `entreprise_feature_flags` suffisent. Seul le catalogue vide protège. **Couvert par P0-1 et P0-4** |
| R11 | **Socle permanent sans règle de fin de service** | moyenne | Un socle annoncé permanent est un engagement de durée. Sans préavis, export et sort de l'URL publique écrits dans les CGV, c'est une promesse que rien ne borne (D-Q9) |
| R12 | **Coût du socle permanent non couvert** | moyenne | Le socle a un coût d'exploitation qu'aucun abonnement ne financera. Il doit entrer dans le coût réel unitaire de la carte, sinon la vente est perdante sur la durée |
| R3 | **Confusion Test / Live** | **élevée** | `livemode` journalisé, jamais vérifié. Un événement Test marquerait une commande payée en Live |
| R4 | **Survente silencieuse** | moyenne | `greatest(0, stock − qté)` absorbe la survente sans alerte |
| R5 | **Rétractation mal exclue sur un produit personnalisé** | **élevée** | Sans acceptation explicite archivée avant paiement, l'exclusion ne tient pas |
| R6 | **Carte détournée avant activation** | moyenne | Traité par conception : code d'activation hors puce, page « non activée » |
| R7 | **Impasse de réattribution** | moyenne | Sans le niveau « support », une carte réattribuée impose de jeter l'objet |
| R8 | **Fichiers clients non contrôlés** | moyenne | Aucune surface d'upload aujourd'hui ; elle est à créer avec ses contrôles |
| R9 | **Confusion Boutique / Market** | moyenne | Engage la responsabilité d'ELSATIA comme vendeur |
| R10 | **Dépendances non fusionnées** | **élevée** | 5 sur 7. Démarrer le lot 1 avant le Train V3 produirait des doublons à réconcilier |

## 8. Questions à trancher

| # | Question | Qui | Bloque |
|---|---|---|---|
| **Q1** | Module dans Gestion Pro, ou surface autonome ? | Julien | **fortement contrainte par D-Q2** — un particulier ne traversant aucune entreprise, ce ne peut plus être un simple module interne |
| ~~Q2~~ | ~~Vend-on à des particuliers ?~~ | — | **TRANCHÉE — oui** (D-Q2) |
| **Q3** | Qui **fabrique** les cartes ? | Julien | lot 7, conformité |
| **Q4** | Rendre `FEATURE_BOUTIQUE_ENABLED` fail-closed avant le Train V3 ? | Julien | rien — recommandé immédiatement |
| **Q5** | Conserve-t-on le rattachement automatique à la trésorerie client ? | Julien | pont faible |
| **Q6** | `automatic_tax` Stripe, ou calcul TVA côté ELSATIA ? | Julien | lot 4 |
| **Q7** | Vend-on hors de France en V1 ? | Julien | TVA, livraison |
| ~~Q8~~ | ~~Niveau « support » dans la résolution Contact/Card ?~~ | — | **TRANCHÉE** (D-Q8), lecture « jeton de profil » |
| ~~Q9~~ | ~~La carte fonctionne-t-elle sans abonnement ?~~ | — | **TRANCHÉE — oui**, socle permanent (D-Q9) |
| **Q10** | Qui **encode** les puces ? | Julien | flux de jetons vers un tiers |
| **Q11** | Code d'activation imprimé (pastille) ou en ligne seulement ? | Julien | parcours d'activation |
| **Q13** | Accepte-t-on la décomposition des états en 4 axes ? | Julien | lot 5 |
| ~~Q14~~ | ~~Bien + abonnement~~ | — | **RÉSOLUE de fait par D-Q9** : option C, proposition à l'activation |

*(Q12 était une reformulation restreinte de Q2 et a été fusionnée.)*

**Restent ouvertes : Q1, Q3, Q4, Q5, Q6, Q7, Q10, Q11, Q13.** Aucune ne bloque plus le démarrage
du lot 1 : elles portent sur la fabrication, la TVA, le périmètre géographique et la forme de la
surface, pas sur le modèle client.

## 9. Estimation de développement

| Ensemble | Estimation |
|---|---:|
| **P0-1 + P0-2** (fail-closed + contrôle `livemode`) | ~1 j |
| Lots 1 à 9 (socle → remboursements) | 94 – 142 j |
| Lot 10 (recette) | 12 – 18 j |
| Lot 11 (préparation Production) | 8 – 12 j |
| **Total hors P0-1/P0-2** | **114 – 172 jours de développement** |

L'écart avec l'estimation de l'audit `6cb0b79` (108–160 j) vient de deux décisions : le lot 1
porte désormais **deux modèles clients** au lieu d'un, et le lot 7 porte les **neuf exigences de
réattribution** ainsi que la garantie que la facturation ne peut pas désactiver le socle.
**P0-3 (facturation) n'ajoute pas de jours** — il déplace le lot 8 sur le chemin critique de
l'ouverture.

Hors rédaction juridique, hors sourcing fournisseur, hors refonte visuelle (lot ELSATIA-UI-V2).

**Le chemin critique n'est pas le développement.** C'est le sourcing fournisseur, la validation
juridique et la fusion du Train V3. Tant qu'ils ne sont pas levés, ces jours ne peuvent pas être
consommés utilement.

## 10. Fichiers créés

Tous sous `docs/boutique/`, aucun ailleurs.

| Fichier | Lignes | Révision |
|---|---:|---|
| `ELSATIA-BOUTIQUE-DECISIONS-R2-V1.md` | 231 | **créé en R2** |
| `ELSATIA-BOUTIQUE-ARCHITECTURE-AUDIT-REPORT.md` | 380 | mis à jour en R2 |
| `ELSATIA-BOUTIQUE-FUNCTIONAL-SPECIFICATION-V1.md` | 429 | mis à jour en R2 |
| `ELSATIA-BOUTIQUE-CATALOG-ORDERS-MODEL-V1.md` | 405 | inchangé |
| `ELSATIA-BOUTIQUE-NFC-CARD-COMMERCE-V1.md` | 305 | mis à jour en R2 |
| `ELSATIA-BOUTIQUE-LEGAL-COMPLIANCE-CHECKLIST-V1.md` | 231 | mis à jour en R2 |
| `ELSATIA-BOUTIQUE-SECURITY-PAYMENT-MODEL-V1.md` | 197 | mis à jour en R2 |
| `ELSATIA-BOUTIQUE-IMPLEMENTATION-ROADMAP-V1.md` | 167 | mis à jour en R2 |
| `wireframes/index.html` | 278 | mis à jour en R2 |
| `ELSATIA-BOUTIQUE-FINAL-REPORT-V1.md` | 235 | mis à jour en R2 |

**SHA du contenu R2 : `06f6aa4`** — les dix fichiers ci-dessus.

## 11. Confirmation de non-intervention

| Engagement | Respecté |
|---|---|
| Audit Git en lecture seule avant création de branche | **oui** |
| Travail dans un worktree dédié | **oui** — `/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/boutique-commerce-architecture-v1` |
| Aucun travail dans le worktree du **Train V3** | **oui** — `train-v3-commercial` non ouvert, non modifié |
| Gestion Pro, site, Tools, Colors, Réserves non modifiés | **oui** |
| Aucun code métier créé | **oui** — seuls des fichiers `.md` et un `.html` de wireframes |
| Aucune migration créée | **oui** |
| Aucun numéro de ledger réservé | **oui** |
| Aucun fichier `.sql.proposed` créé | **oui** |
| Aucun produit ni Price Stripe créé ou modifié | **oui** |
| **Aucun appel Stripe**, Test ou Live | **oui** — aucun n'a été émis |
| Aucun déploiement | **oui** |
| Aucune fusion | **oui** |
| Boutique non publiée | **oui** |
| Aucun tarif inventé | **oui** — tous notés `<à définir>` ou `<à obtenir>` |
| Aucun stock, délai, garantie, remise ou témoignage inventé | **oui** |
| Aucune reprise d'izi.Card ou d'une autre boutique | **oui** — wireframes originaux, aucun texte, design, argument ou prix repris |
| Dépôt du site non modifié | **oui** — `elsatia-site` n'a pas été ouvert |
