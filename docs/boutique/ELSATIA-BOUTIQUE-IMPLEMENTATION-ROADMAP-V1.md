# ELSATIA — Boutique : découpage de réalisation (V1)

| | |
|---|---|
| Nature | Documentaire. Aucun lot n'est démarré, aucune branche de réalisation n'est créée. |
| Base | `1fc1331` |

---

## 1. Trois préalables qui ne sont pas des lots

Aucun des lots ci-dessous ne peut être planifié tant que ces trois points ne sont pas rendus.

| Préalable | Nature | Qui tranche |
|---|---|---|
| **Q2 — vend-on à des particuliers ?** | commerciale | Julien |
| **Q9 — la carte fonctionne-t-elle sans abonnement ?** | commerciale **et** juridique | Julien + juriste |
| **9.8 — facturation de vente** | juridique, bloquant | juriste |

Q2 détermine à elle seule si le lot 1 doit construire un modèle client à deux audiences ou une
seule. Se tromper ici, c'est refaire le socle.

---

## 2. Lot P0 — corrections indépendantes

Ne dépend d'aucun arbitrage. Peut partir immédiatement, et **devrait** partir avant le Train V3.

| # | Correction | Fichier | Effort |
|---|---|---|---|
| P0-A | `boutiqueEstActive()` en fail-closed + documenter `FEATURE_BOUTIQUE_ENABLED` dans `.env.example` | `src/lib/preview-features.ts` | ~0,5 j |
| P0-B | Vérifier `livemode` avant traitement de l'événement | `…/stripe/boutique/webhook/route.ts` | ~0,5 j |

**Total P0 : ~1 jour**, tests compris.

---

## 3. Les onze lots

Les estimations sont des **ordres de grandeur en jours de développement**, hors recette
fonctionnelle et hors rédaction juridique. Elles supposent les préalables rendus.

| # | Lot | Contenu | Dépend de | Estimation |
|---:|---|---|---|---:|
| 1 | **Socle catalogue** | Produit / variante / prix daté, natures, catégories, statut commercial, archivage, médias, journal append-only, **client Boutique** | Q2, Train V3 | 12–18 j |
| 2 | **Administration** | 16 domaines, surface plateforme, réutilisation annuaire + accès support strict | 1, Train V3 | 10–15 j |
| 3 | **Panier** | Panier serveur, revalidation des prix, **réservation de stock**, expiration | 1 | 5–8 j |
| 4 | **Paiement Test** | Checkout, webhook durci (`livemode`), TVA résolue au devis, idempotence | 3, P0, Stripe | 8–12 j |
| 5 | **Commandes** | 4 axes d'états, transitions, permissions, preuves, notifications, gabarits e-mail | 4 | 10–15 j |
| 6 | **Logistique** | Expéditions, transporteur, suivi, incidents, réexpédition, pont faible GP | 5 | 8–12 j |
| 7 | **Cartes NFC** | Support physique, indirection de résolution, encodage, activation, association, réattribution, révocation | 5, **Contact/Card** | 15–22 j |
| 8 | **Factures et avoirs** | Numérotation, PDF, archivage, avoirs, mentions | 5, juriste | 10–14 j |
| 9 | **Retours et remboursements** | Demande, autorisation, bordereau, réception, constat, remboursement plafonné, litiges | 8 | 10–14 j |
| 10 | **Recette** | pgTAP, tests d'intégration, parcours de bout en bout, jeux d'essai | 1–9 | 12–18 j |
| 11 | **Préparation Production** | CGV publiées, mentions, médiation, RGPD, runbook, bascule Stripe, plan de retour arrière | 10, juriste | 8–12 j |

**Total indicatif : 108 à 160 jours de développement**, hors P0, hors rédaction juridique, hors
sourcing fournisseur.

### Ce que ces chiffres ne disent pas

Ils supposent : le fournisseur choisi, les finitions connues, les délais transporteur connus, les
CGV rédigées, et Q2/Q9 tranchées. **Aucune de ces conditions n'est remplie aujourd'hui.** Le
chemin critique réel n'est pas le développement : c'est le sourcing et le juridique.

---

## 4. Séquencement

```
  P0 ───────────────────────────────────────────────────────► (indépendant)

  Q2, Q9, 9.8 ──► Lot 1 ──┬──► Lot 2
                          │
                          └──► Lot 3 ──► Lot 4 ──► Lot 5 ──┬──► Lot 6
                                                           │
                                                           ├──► Lot 7  (+ Contact/Card)
                                                           │
                                                           └──► Lot 8 ──► Lot 9

                                            Lots 1–9 ──► Lot 10 ──► Lot 11
```

Deux chemins peuvent avancer en parallèle une fois le lot 5 livré : la logistique (6) et la
facturation (8). Le lot 7 est le plus long et **ne doit pas être démarré avant** que Q8
(indirection de résolution Contact/Card) soit validée.

---

## 5. Dépendances externes

| Dépendance | Nature | État | Impact si non levée |
|---|---|---|---|
| **Train V3** | socle multiproduit, annuaire plateforme, accès support strict | non fusionné | Le lot 1 devrait dupliquer un modèle client et un annuaire déjà écrits ailleurs. **Bloquant de fait.** |
| **Moteur multiproduit** | figement du prix contractuel | non fusionné | Sans lui, la Boutique inventerait sa propre notion de prix figé, en concurrence avec celle du moteur. |
| **Contact/Card** | architecture logicielle de la carte | close en documentaire, `0e644d5`, **zéro code** | Le lot 7 n'a rien sur quoi s'appuyer : il faudrait développer Contact/Card d'abord. |
| **Gestion Pro** | trésorerie, outillage, entreprises | dans le train | Pont **faible et optionnel** uniquement. Aucune dépendance forte à créer. |
| **Stripe** | paiements, remboursements | Test seulement | Aucun repointage Live avant figement du prix contractuel par le Train V3. |
| **Site** | dépôt distinct `elsatia-site` | non touché | Seul un bloc « À venir » est nécessaire. Cf. §7. |
| **Support transversal** | assistance stricte, verrouillée en Production | non fusionné | Sans lui, l'administration Boutique devrait inventer son propre régime d'accès aux données client. |

**Cinq dépendances sur sept sont sur des branches non fusionnées.** C'est le fait le plus
important de ce découpage : la Boutique n'est pas bloquée par sa propre complexité, elle est
bloquée par l'état de l'écosystème autour d'elle.

---

## 6. Ordre recommandé, en une phrase

> Faire P0 maintenant · trancher Q2 et Q9 · faire fusionner le Train V3 · développer Contact/Card ·
> puis, et seulement puis, ouvrir le lot 1.

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
