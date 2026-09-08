# ELSATIA — Boutique : découpage de réalisation (V1)

| | |
|---|---|
| Nature | Documentaire. Aucun lot n'est démarré, aucune branche de réalisation n'est créée. |
| Base | `1fc1331` |

---

## 1. Préalables — état après les décisions R2

| Préalable | Statut |
|---|---|
| **Q2 — vend-on à des particuliers ?** | **TRANCHÉ — oui.** Le lot 1 construit **deux modèles clients distincts**, sans faux tenant professionnel. |
| **Q9 — la carte fonctionne-t-elle sans abonnement ?** | **TRANCHÉ — oui** : *service de base inclus sans abonnement récurrent*. Le lot 7 ne conditionne aucune fonction du service de base à un paiement. |
| **Q1 — module Gestion Pro ou surface autonome ?** | **TRANCHÉ (R3) — application commerciale autonome de l'écosystème.** Compte ELSATIA partagé, lien facultatif à Gestion Pro. |
| **Q8 — réattribution** | **TRANCHÉ.** Le lot 7 peut démarrer une fois ses dépendances levées. |
| **Facturation de vente** | **devient P0-3** : condition d'ouverture, plus un simple lot aval. Dépend encore d'une validation juridique. |

Il reste des questions ouvertes (Q1, Q3 à Q7, Q10, Q11, Q13), mais **aucune ne bloque plus le
démarrage du lot 1** : elles portent sur la fabrication, la TVA, le périmètre géographique et la
forme de la surface, pas sur le modèle client.

---

## 2. P0 — quatre conditions bloquantes avant toute ouverture

| # | Condition | Dépend de | Effort |
|---|---|---|---:|
| **P0-1** | `boutiqueEstActive()` en fail-closed + `FEATURE_BOUTIQUE_ENABLED` documentée | rien | ~0,5 j |
| **P0-2** | Le webhook **refuse** un `livemode` ne correspondant pas à l'environnement | rien | ~0,5 j |
| **P0-3** | **Aucune commande payable sans facture de vente ELSATIA** | lots 1, 4, 5 puis 8 + juriste | cf. lot 8 |
| **P0-4** | Boutique masquée, catalogue vide, tant que P0-1 à P0-3 ne sont pas fermées | — | tenu |

**P0-1 et P0-2 (~1 jour) ne dépendent d'aucun arbitrage** et devraient partir avant le Train V3.

**P0-3 supprime le palier intermédiaire.** Il n'existe plus d'étape où la Boutique serait ouverte
mais pas encore facturante : le lot 8 cesse d'être différable et devient une dépendance de
l'ouverture, au même titre que le paiement.

---

## 3. Les onze lots

Les estimations sont des **ordres de grandeur en jours de développement**, hors recette
fonctionnelle et hors rédaction juridique. Elles supposent les préalables rendus.

| # | Lot | Contenu | Dépend de | Estimation |
|---:|---|---|---|---:|
| 1 | **Socle catalogue** | Produit / variante / prix daté, natures, catégories, statut commercial, archivage, médias, journal append-only, **deux modèles clients (particulier / professionnel)**, rattachement ultérieur idempotent, suivi par jeton borné | Train V3 | 15–22 j |
| 2 | **Administration** | 16 domaines, surface plateforme, réutilisation annuaire + accès support strict | 1, Train V3 | 10–15 j |
| 3 | **Panier** | Panier serveur, revalidation des prix, **réservation de stock**, expiration | 1 | 5–8 j |
| 4 | **Paiement Test** | Checkout, webhook durci (`livemode`), TVA résolue au devis, idempotence | 3, P0, Stripe | 8–12 j |
| 5 | **Commandes** | 4 axes d'états, transitions, permissions, preuves, notifications, gabarits e-mail | 4 | 10–15 j |
| 6 | **Logistique** | Expéditions, transporteur, suivi, incidents, réexpédition, pont faible GP | 5 | 8–12 j |
| 7 | **Cartes NFC** | Support physique à **identifiant opaque immuable**, chaîne `identifiant → attribution → profil`, encodage, activation, **réattribution à 9 exigences**, états `bloque` / `revoque`, quatre régimes d'autorité, **service de base non désactivable par la facturation** | 5, **Contact/Card** | 18–26 j |
| 8 | **Factures et avoirs** — **bloque l'ouverture (P0-3)** | Numérotation, PDF, archivage, avoirs, mentions | 5, juriste | 10–14 j |
| 9 | **Retours et remboursements** | Demande, autorisation, bordereau, réception, constat, remboursement plafonné, litiges | 8 | 10–14 j |
| 10 | **Recette** | pgTAP, tests d'intégration, parcours de bout en bout, jeux d'essai | 1–9 | 12–18 j |
| 11 | **Préparation Production** | CGV publiées, mentions, médiation, RGPD, runbook, bascule Stripe, plan de retour arrière | 10, juriste | 8–12 j |

**Total indicatif : 114 à 172 jours de développement**, hors P0, hors rédaction juridique, hors
sourcing fournisseur.

L'écart avec l'estimation de l'audit `6cb0b79` (108–160 j) vient de deux décisions : le lot 1
porte désormais **deux modèles clients** au lieu d'un, et le lot 7 porte les **neuf exigences de
réattribution** ainsi que la garantie que la facturation ne peut pas désactiver le socle.

### Ce que ces chiffres ne disent pas

Ils supposent : le fournisseur choisi, les finitions connues, les délais transporteur connus et
les CGV rédigées. **Aucune de ces conditions n'est remplie.** Q2, Q8 et Q9 sont désormais
tranchées, ce qui débloque la conception — mais **le chemin critique reste le sourcing
fournisseur, le juridique et la fusion du Train V3**, pas le développement.

---

## 4. Séquencement

```
  P0-1, P0-2 ──────────────────────────────────────────────► (indépendants, immédiats)

  Train V3 ──► Lot 1 ──┬──► Lot 2
                       │
                       └──► Lot 3 ──► Lot 4 ──► Lot 5 ──┬──► Lot 6
                                                        │
                                                        ├──► Lot 7   (+ Contact/Card)
                                                        │
                                                        └──► Lot 8 ──► Lot 9
                                                             ▲
                                                        P0-3 ┘  ← barrière d'ouverture

                                         Lots 1–9 ──► Lot 10 ──► Lot 11 ──► OUVERTURE
```

Deux chemins avancent en parallèle une fois le lot 5 livré : la logistique (6) et la facturation
(8). **Le lot 8 est désormais sur le chemin critique de l'ouverture** (P0-3). Le lot 7 est le
plus long ; Q8 étant tranchée, il n'attend plus qu'un socle Contact/Card qui n'existe pas.

---

## 5. Dépendances externes

| Dépendance | Nature | État | Impact si non levée |
|---|---|---|---|
| **Train V3** | socle multiproduit, annuaire plateforme, accès support strict | non fusionné | Le lot 1 devrait dupliquer un modèle client et un annuaire déjà écrits ailleurs. **Bloquant de fait.** |
| **Moteur multiproduit** | figement du prix contractuel | non fusionné | Sans lui, la Boutique inventerait sa propre notion de prix figé, en concurrence avec celle du moteur. |
| **Contact/Card** | architecture logicielle de la carte | close en documentaire, `0e644d5`, **zéro code** | Le lot 7 n'a rien sur quoi s'appuyer : il faudrait développer Contact/Card d'abord. |
| **Gestion Pro** | trésorerie, outillage, entreprises | dans le train | Pont **faible et optionnel** uniquement. **D-Q1 le confirme** : la Boutique est autonome, le lien à Gestion Pro est facultatif et ne conditionne jamais un achat. |
| **Stripe** | paiements, remboursements | Test seulement | Aucun repointage Live avant figement du prix contractuel par le Train V3. |
| **Site** | dépôt distinct `elsatia-site` | non touché | Seul un bloc « À venir » est nécessaire. Cf. §7. |
| **Support transversal** | assistance stricte, verrouillée en Production | non fusionné | Sans lui, l'administration Boutique devrait inventer son propre régime d'accès aux données client. |

**Cinq dépendances sur sept sont sur des branches non fusionnées.** C'est le fait le plus
important de ce découpage : la Boutique n'est pas bloquée par sa propre complexité, elle est
bloquée par l'état de l'écosystème autour d'elle.

---

## 6. Ordre recommandé, en une phrase

> Faire P0-1 et P0-2 maintenant · faire fusionner le Train V3 · ouvrir le lot 1 (deux modèles
> clients) · développer Contact/Card en parallèle · et ne rien ouvrir avant que P0-3 soit fermé.

---

## 7. Contenu destiné à l'onglet « À venir » du site

> **Ce texte n'est pas publié par cette conversation.** Le dépôt `elsatia-site` n'a été ni ouvert,
> ni modifié. Ce bloc est fourni pour être repris tel quel, ou amendé, dans un lot dédié au site.

**Contraintes respectées :** aucun bouton d'achat, aucun prix, aucune promotion, aucune
disponibilité annoncée, aucune capture inventée, aucune date.

---

### Bloc proposé

**Titre :** Boutique ELSATIA

**Statut affiché :** En préparation

**Texte (deux phrases) :**

> La Boutique ELSATIA est l'espace où ELSATIA vendra ses propres produits et services : cartes
> de visite connectées, accessoires et prestations associées.
> Elle est en préparation et n'est pas encore ouverte.

**Encart de distinction, à afficher à proximité :**

> **Boutique et Market sont deux espaces différents.** Dans la Boutique, ELSATIA est le vendeur :
> elle fixe les produits et les tarifs, gère les commandes et répond de la facturation, de la
> livraison et du service après-vente. Dans Market, ce sont des professionnels abonnés qui
> publient leurs propres biens et matériels ; ELSATIA n'y est pas vendeur.

---

### Ce que le bloc ne doit pas comporter

| Interdit | Pourquoi |
|---|---|
| Bouton « Acheter », « Commander », « Précommander » | Rien n'est commandable. |
| Prix, fourchette, « à partir de » | Aucun prix n'existe. |
| « Bientôt disponible » avec une date | Aucune date n'est tenable aujourd'hui. |
| Liste de produits détaillée | Le catalogue n'est pas arrêté. |
| Capture d'écran de la Boutique | Elle n'existe pas ; une capture serait fabriquée. |
| Mention d'une remise ou d'une offre de lancement | Aucune n'est décidée. |
| Formulaire d'inscription à une liste d'attente | Créerait une collecte de données sans base ni finalité définie. |
