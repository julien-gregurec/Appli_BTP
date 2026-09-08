# ELSATIA — Boutique : modèle de catalogue et de commandes (V1)

| | |
|---|---|
| Nature | Conception documentaire. Aucune migration, aucun `.sql.proposed`, aucun numéro de ledger réservé. |
| Base | `1fc1331` |
| Amont | `ELSATIA-BOUTIQUE-ARCHITECTURE-AUDIT-REPORT.md` |

> **Aucun montant réel n'est créé dans ce document.** Tous les prix sont notés `<à définir>`.
> Aucun Price Stripe n'est créé, modifié ou nommé.

---

# Partie 1 — Catalogue

## 1.1 Pourquoi le modèle actuel ne peut pas être étendu

`boutique_produits` porte aujourd'hui, dans une seule ligne : l'identité du produit, sa
catégorie contrainte à 4 valeurs matériel, **son prix**, son taux de TVA, **son stock**, son
image et son activation.

Quatre de ces choix bloquent l'ensemble des natures demandées :

| Choix actuel | Ce qu'il interdit |
|---|---|
| `categorie` contraint à 4 valeurs matériel | Toute nature non matérielle. Ajouter une carte NFC impose déjà de modifier la contrainte. |
| `prix_ht` dans la ligne produit | Tout historique de prix, tout prix professionnel, tout prix par quantité, tout tarif historique. Modifier le prix **écrase** l'ancien. |
| `stock_disponible` dans la ligne produit | Toute variante (une finition en rupture, l'autre disponible), tout lot, tout numéro de série. |
| Pas de niveau « unité vendable » | Toute variante, toute personnalisation, tout conditionnement. |

La conclusion de conception est donc : **séparer trois niveaux** qui sont aujourd'hui confondus.

## 1.2 Les trois niveaux

```
PRODUIT  ──┬── ce qu'ELSATIA vend et raconte : identité, nature, description, catégorie,
           │   images, documents, statut commercial, publication
           │
           ├── VARIANTE  ── l'unité réellement vendable et stockable : combinaison d'options,
           │                référence propre, poids, dimensions, stock, disponibilité,
           │                délai indicatif
           │
           └── PRIX ──────── une valeur datée, jamais écrasée : audience, quantité, devise,
                             période de validité, auteur, motif
```

Un produit sans variante n'est pas vendable. Une variante sans prix actif n'est pas vendable.
Un prix n'est jamais modifié : il est **clos** et remplacé.

## 1.3 Les natures de produit

La nature n'est pas une catégorie de rayon : c'est **ce que la nature impose au parcours**.
C'est le critère qui doit la définir, sinon elle ne sert à rien.

| Nature | Livrable | Stock | Expédition | Rétractation particulier | Activation |
|---|---|---|---|---|---|
| `physique` | objet | oui | oui | 14 j | non |
| `physique_personnalise` | objet fabriqué à la demande | non (à la commande) | oui | **exclue** (bien personnalisé) | selon produit |
| `numerique` | fichier / accès | non | non | exclue après téléchargement, avec accord exprès | non |
| `licence` | clé / droit d'usage | non (ou pool de clés) | non | exclue après activation, avec accord exprès | oui |
| `abonnement` | droit récurrent | non | non | 14 j, résiliation ensuite | oui |
| `prestation` | intervention datée | non | non | 14 j, exclue si exécutée avec accord | non |
| `formation` | session datée | places | non | régime propre à la formation | non |
| `lot` | composition d'autres variantes | dérivé des composants | selon composants | selon composants | selon composants |
| `accessoire` | objet | oui | oui | 14 j | non |
| `remplacement` | objet, lié à une unité existante | oui | oui | selon motif (garantie ≠ achat) | reprend l'unité remplacée |

Deux dimensions **orthogonales** à la nature, et non des natures :

- **personnalisation** : un produit `physique` peut être personnalisable. C'est un attribut,
  car c'est lui qui fait basculer le régime de rétractation, pas la nature ;
- **précommande** : c'est un état de **disponibilité**, pas une nature. Un même produit peut
  être en précommande puis en stock.

## 1.4 Attributs — niveau PRODUIT

| Attribut | Type | Règle |
|---|---|---|
| `id` | identifiant technique | Immuable. Ne sert jamais de référence commerciale. |
| `reference` | texte court | **Identifiant stable**, lisible, unique, jamais réaffecté même après archivage. |
| `nom` | texte | Commercial. |
| `description_courte` | texte | Une phrase. Sert aux listes et aux métadonnées. |
| `description_longue` | texte riche | Fiche produit. Aucun engagement chiffré non tenu (délai, garantie). |
| `nature` | énumération | Cf. §1.3. |
| `categorie` | référence | Table de catégories, **pas** un `check` figé. |
| `personnalisable` | booléen | Déclenche le régime « bien personnalisé ». |
| `statut_commercial` | énumération | Cf. §1.7. |
| `publie_le` / `depublie_le` | dates | Publication ≠ activation. |
| `archive_le` | date | Archivage ≠ suppression. Aucune suppression physique. |
| `mentions_obligatoires` | texte | Conformité, garantie légale, informations imposées par la nature. |
| `cree_par` / `modifie_par` | auteur | Toute écriture est attribuée. |

**Il n'y a ni prix ni stock à ce niveau.** C'est le point central de la refonte.

## 1.5 Attributs — niveau VARIANTE

| Attribut | Type | Règle |
|---|---|---|
| `id` | identifiant technique | |
| `reference_variante` | texte | **SKU réel**. Unique, stable, jamais réaffecté. |
| `produit_id` | référence | |
| `options` | ensemble clé→valeur | Ex. finition, coloris, conditionnement. Les axes sont déclarés au produit. |
| `poids_g` | entier | Requis si expédiable. Sert au calcul de port et au bordereau. |
| `longueur_mm`, `largeur_mm`, `epaisseur_mm` | entiers | Requis si expédiable. |
| `disponibilite` | énumération | `en_stock`, `sur_commande`, `precommande`, `rupture`, `epuise_definitif`. |
| `delai_indicatif_min_j` / `delai_indicatif_max_j` | entiers | **Indicatif et affiché comme tel.** Une fourchette annoncée devient un engagement : elle ne doit jamais être inventée, elle vient du fournisseur ou du constat. |
| `gestion_stock` | énumération | `aucune`, `quantite`, `numero_serie`, `lot`. |
| `actif` | booléen | Une variante peut être retirée sans retirer le produit. |

## 1.6 Attributs — niveau PRIX

Le prix est un **fait daté**, pas une propriété. Aucun prix n'est modifié : il est clos, et un
nouveau prix prend la suite.

| Attribut | Règle |
|---|---|
| `variante_id` | |
| `audience` | `public` (particulier) · `professionnel` · `negocie` (client nommé). |
| `quantite_min` | Palier. `1` par défaut. Permet le prix par quantité sans table séparée. |
| `devise` | `EUR` en V1. Le champ existe dès l'origine — l'ajouter après coup impose de réécrire tout l'historique. |
| `montant_ht` | `<à définir>` — **aucune valeur créée ici**. |
| `regime_tva` | Cf. §1.8. |
| `valide_du` / `valide_au` | Fenêtre de validité. `valide_au` nul = prix courant. |
| `price_stripe_id` | Rempli **plus tard**, par le lot de réalisation. Vide dans ce document. |
| `auteur`, `motif` | Obligatoires. Un prix sans motif est refusé. |

Le **prix TTC n'est jamais stocké**. Il est calculé au moment du devis de panier, à partir du
montant HT et du régime de TVA applicable au client, puis **figé dans la commande**. Stocker un
TTC, c'est stocker une vérité qui dépend de l'acheteur.

**Prix contractuel figé.** Une commande ne référence jamais un prix vivant : elle en copie la
valeur (mécanisme déjà appliqué par le prototype via `prix_unitaire_ht_snapshot`, à conserver).

## 1.7 Statut commercial et cycle de vie

```
   brouillon ──► en_validation ──► publie ──┬──► suspendu ──► publie
       │                │                   │        │
       │                │                   └────────┴──► retire ──► archive
       └────────────────┴──────────────────────────────────────────► archive
```

| Statut | Visible au client | Commandable | Sens |
|---|---|---|---|
| `brouillon` | non | non | En cours de saisie. |
| `en_validation` | non | non | Attente d'un contrôle interne (prix, mentions, visuels). |
| `publie` | oui | oui | En vente. |
| `suspendu` | oui, marqué indisponible | non | Retrait temporaire ; les commandes en cours vivent leur vie. |
| `retire` | non | non | Fin de commercialisation ; SAV et remplacement restent possibles. |
| `archive` | non | non | Historique seul. **Jamais de suppression physique.** |

Règle reprise du produit Colors : la corbeille est un état, pas un `DELETE`. Un produit
commandé une fois doit rester lisible aussi longtemps que la commande, la facture et la
garantie qui s'y rattachent.

## 1.8 TVA — ce que le modèle actuel ne sait pas faire

Le prototype porte un `taux_tva` par produit, défaut `0.20`, sans pays. C'est faux dès la
première vente hors de France.

Le régime applicable dépend de **trois** variables, dont deux ne sont pas dans le modèle :

1. la nature du bien ou service (taux réduit, exonération) ;
2. le **pays de destination** ;
3. la **qualité de l'acheteur** (particulier, assujetti avec numéro de TVA valide).

Conception retenue : la variante porte une **catégorie fiscale** (`standard`, `reduit`,
`exonere`, `hors_champ`), et le taux effectif est **résolu au moment du devis de panier** en
croisant catégorie fiscale × pays × qualité de l'acheteur, puis **figé dans la commande**.

Deux points restent à trancher et sont remontés en questions ouvertes :

- **Q6** : activer `automatic_tax` de Stripe pour la Boutique, ou calculer la TVA côté ELSATIA ?
  Le code n'active `automatic_tax` que sur l'abonnement (`stripe-abonnement.ts:269`) ; la
  Boutique ne le fait pas du tout.
- **Q7** : vend-on hors de France en V1 ? Si non, le modèle reste en place mais la V1 se limite
  à un seul pays, ce qui doit être **écrit** et non subi.

## 1.9 Images et documents

Aujourd'hui : `image_url` en texte libre, rendu directement en `<img src>`. Aucun contrôle.

Conception retenue : un média est une **entité**, stockée dans un bucket dédié, jamais une URL
externe.

| Attribut | Règle |
|---|---|
| `type` | `image_produit`, `document_technique`, `notice`, `certificat_conformite`. |
| `bucket` | Bucket Boutique dédié. Aucun des 15 buckets existants ne convient. |
| `formats acceptés` | Liste blanche explicite. Refus par défaut. |
| `taille_max` | Plafond appliqué **côté serveur**, jamais seulement côté navigateur. |
| `ordre` | Une image principale, les autres ordonnées. |
| `texte_alternatif` | Obligatoire. Accessibilité. |

Les visuels **personnalisés fournis par un client** (logo à imprimer sur une carte) ne vont
**pas** dans ce bucket : ils sont des données client, avec une durée de conservation et un
effacement propres. Traités en phase 11.

## 1.10 Génération tarifaire et Price Stripe

Deux mondes à ne pas confondre :

- le **prix ELSATIA** est la source de vérité, dans le modèle ci-dessus ;
- le **Price Stripe** n'est qu'une projection, créée par un lot de réalisation, jamais saisie à
  la main.

Le prototype actuel n'utilise **aucun** Price Stripe : il envoie du `price_data` inline à chaque
Checkout. C'est acceptable pour un paiement ponctuel, mais cela interdit les coupons Stripe et
laisse le montant se construire à chaque session.

Trois options, à trancher lors du lot de réalisation :

| Option | Avantage | Coût |
|---|---|---|
| A — `price_data` inline (existant) | Aucun objet Stripe à gérer ; prix ELSATIA seul maître. | Pas de coupon Stripe, pas de réutilisation. |
| B — Price Stripe par variante | Coupons, rapports Stripe cohérents. | Synchronisation à maintenir ; risque de dérive. |
| C — Mixte : inline pour le physique, Price pour l'abonnement | Colle à l'existant (l'abonnement utilise déjà des Price). | Deux chemins à tester. |

**Recommandation : C.** L'abonnement utilise déjà des Price ID ; le physique n'en a pas besoin.
Aligner les deux mondes créerait du travail sans bénéfice pour la V1.

> Rappel de contrainte : **aucun Price n'est créé ni nommé ici**, et le figement du prix
> contractuel doit passer par le Train V3 avant tout repointage Stripe.

## 1.11 Historique

Toute écriture sur un produit, une variante ou un prix produit une entrée **append-only** :
horodatage, auteur, action, valeurs avant/après, motif. Aucune mise à jour, aucune suppression
de cette table.

Le prototype n'a rien de tel : `modifierProduitBoutiqueAction` écrase prix, stock, seuil et
activation sans laisser de trace. Reconstituer « à quel prix ce produit était-il affiché le
12 mars » est aujourd'hui impossible — y compris pour répondre à une réclamation client.

---

# Partie 2 — Commandes

## 2.1 Pourquoi les 20 états demandés ne peuvent pas être une seule colonne

La commande énumère 20 états : `brouillon`, `panier`, `en attente de paiement`, `payée`,
`à vérifier`, `en préparation`, `personnalisée`, `envoyée en fabrication`, `fabriquée`,
`expédiée`, `livrée`, `activation en attente`, `activée`, `annulée`, `retour demandé`,
`retournée`, `remboursée partiellement`, `remboursée`, `litige`, `archivée`.

Mis dans une seule colonne, ils produisent des questions sans réponse, et ce ne sont pas des cas
d'école :

- une commande **expédiée** puis **remboursée partiellement** est-elle `expediee` ou
  `remboursee_partiellement` ? Les deux sont vrais en même temps ;
- une commande **livrée** qui entre en **litige** cesse-t-elle d'être livrée ? Non ;
- une commande de 3 articles dont un seul part en **retour** : l'ensemble bascule-t-il ? Non.

Un état unique force à choisir entre deux vérités simultanées, et **la comptabilité paie
toujours l'erreur** : une commande remboursée qui a « perdu » son état d'expédition ne peut plus
être rapprochée.

### Conception retenue : quatre axes indépendants

| Axe | Valeurs | Ce qu'il décrit |
|---|---|---|
| **Cycle** | `brouillon`, `panier`, `en_attente_paiement`, `payee`, `a_verifier`, `en_preparation`, `envoyee_en_fabrication`, `fabriquee`, `personnalisee`, `expediee`, `livree`, `activation_en_attente`, `activee`, `annulee`, `archivee` | Où en est la commande. |
| **Paiement** | `impaye`, `paye`, `rembourse_partiellement`, `rembourse` | Où en est l'argent. |
| **Retour** | `aucun`, `retour_demande`, `retour_autorise`, `retournee`, `retour_refuse` | Où en est la marchandise qui revient. |
| **Litige** | `aucun`, `litige_ouvert`, `litige_clos` | Y a-t-il un désaccord en cours. |

Les 20 libellés demandés sont **tous** exprimables, et sans perte : `remboursée partiellement` =
`paiement.rembourse_partiellement`, `litige` = `litige.litige_ouvert`, `retournée` =
`retour.retournee`, etc. Ce qui change, c'est qu'ils **cessent de s'exclure mutuellement**.

L'état affiché au client reste **un seul libellé**, calculé à partir des quatre axes selon une
règle de priorité : litige > retour > paiement > cycle. Le client voit « Remboursée », pas quatre
colonnes.

> **Q13 — à valider.** Cette décomposition est une décision d'architecture, pas une préférence de
> présentation. Si elle est refusée, il faudra accepter que certaines combinaisons réelles soient
> inexprimables.

## 2.2 Cycle — transitions autorisées

```
 brouillon ──► panier ──► en_attente_paiement ──┬──► payee ──► a_verifier ──┐
                                │               │                            │
                                │               └──► annulee                 │
                                └──► annulee (expiration du lien)            │
                                                                             ▼
                          ┌──────────────────────────────────────── en_preparation
                          │                                                  │
       (variante personnalisable)                                (variante en stock)
                          │                                                  │
                          ▼                                                  │
              envoyee_en_fabrication ──► fabriquee ──► personnalisee ────────┤
                                                                             ▼
                                                                        expediee
                                                                             │
                                                                             ▼
                                                                          livree
                                                                             │
                                                    (produit activable) ─────┤───► archivee
                                                                             ▼
                                                              activation_en_attente
                                                                             │
                                                                             ▼
                                                                          activee ──► archivee
```

### Règles de transition non négociables

| Règle | Motif |
|---|---|
| `payee` ne s'atteint **que** par confirmation Stripe vérifiée | Une commande ne devient jamais payée sur une action d'interface. |
| `en_attente_paiement → annulee` est possible ; `payee → annulee` **ne l'est pas** | Après paiement, on rembourse — on n'annule pas. Annuler effacerait une opération financière réelle. |
| `a_verifier` est **obligatoire** pour toute commande personnalisée ou marquée à risque | C'est le seul point où un humain regarde avant de lancer une fabrication irréversible. |
| `envoyee_en_fabrication` n'est atteignable **que** depuis `a_verifier` validé | On ne fabrique jamais un visuel non validé. |
| `livree` n'implique pas `activee` | Un support livré non activé ne résout rien. Cf. `…-NFC-CARD-COMMERCE-V1.md` §4. |
| `archivee` est **terminal** et n'efface rien | Aucune suppression physique, jamais. |
| `annulee` avant paiement **libère la réservation de stock** | Sinon le stock se vide sans vente. |

### Transitions explicitement interdites

- `payee → brouillon` / `payee → panier` — réécrirait une vente ;
- `expediee → en_preparation` — un échec de livraison ne « dé-expédie » pas ; il ouvre une
  réexpédition, qui est une **nouvelle expédition** de la même commande ;
- `activee → activation_en_attente` — la réattribution est une opération sur le **support**, pas
  un retour en arrière de la commande ;
- toute transition depuis `archivee` ;
- toute transition qui modifierait un montant déjà facturé.

## 2.3 Permissions par transition

Rôles : **Client** · **Agent Boutique** (ELSATIA) · **Préparateur** · **Responsable Boutique** ·
**Comptable** · **Admin plateforme**.

| Transition | Client | Agent | Prépa. | Resp. | Compta. | Admin |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| `panier → en_attente_paiement` | ✔ | ✔ | | | | ✔ |
| `en_attente_paiement → payee` | — **système seul (webhook vérifié)** — | | | | | |
| `en_attente_paiement → annulee` | ✔ | ✔ | | ✔ | | ✔ |
| `payee → a_verifier` | | ✔ | | ✔ | | ✔ |
| `a_verifier → en_preparation` | | | | ✔ | | ✔ |
| `→ envoyee_en_fabrication` | | | | ✔ | | ✔ |
| `fabriquee`, `personnalisee` | | | ✔ | ✔ | | ✔ |
| `→ expediee` | | | ✔ | ✔ | | ✔ |
| `→ livree` | ✔ (confirmation) | ✔ | | ✔ | | ✔ |
| `→ activee` | ✔ (titulaire) | | | | | |
| Ouvrir un **retour** | ✔ | ✔ | | ✔ | | ✔ |
| Autoriser un retour | | | | ✔ | | ✔ |
| **Rembourser** | | | | ✔ | ✔ | ✔ |
| Émettre un **avoir** | | | | | ✔ | ✔ |
| Ouvrir / clore un **litige** | ✔ (ouvrir) | ✔ | | ✔ | | ✔ |
| `→ archivee` | | | | ✔ | | ✔ |

Trois principes portés par les **politiques RLS**, pas par l'interface :

1. **Le client ne peut jamais faire avancer sa propre commande** au-delà de la commande et de la
   confirmation de réception. Il ne peut ni la marquer payée, ni expédiée, ni remboursée.
2. **Rembourser est réservé** au responsable et à la comptabilité. Un agent de support ne
   rembourse pas.
3. **Aucun rôle ne peut modifier un montant déjà facturé.** Une correction passe par un avoir.

## 2.4 Preuves attachées à chaque changement d'état

Un état sans preuve n'est pas défendable. Chaque transition écrit une entrée **append-only** :
horodatage, auteur (ou « système »), état avant, état après, motif.

| État atteint | Preuve exigée |
|---|---|
| `payee` | Identifiant d'événement Stripe **vérifié par signature**, identifiant de session, montant, devise, `livemode`. |
| `a_verifier` validé | Auteur du contrôle + **aperçu validé archivé** (personnalisation). |
| `envoyee_en_fabrication` | Référence de l'ordre de fabrication. |
| `fabriquee` | Numéros de série produits, rattachés aux supports. |
| `expediee` | Transporteur + numéro de suivi + date de remise. |
| `livree` | Preuve transporteur, ou confirmation datée du client. |
| `activee` | Horodatage, auteur, identifiant du support, identifiant de la carte associée. |
| `retour_autorise` | Motif + auteur + bordereau émis. |
| `retournee` | Date de réception + **constat d'état** (photo si dommage). |
| `rembourse*` | Référence du remboursement Stripe + avoir émis + auteur + motif. |
| `litige_ouvert` | Origine (client, transporteur, banque), date, pièces. |

## 2.5 Notifications

Deux destinataires, jamais confondus : **le client** et **ELSATIA**.

| Événement | Client | ELSATIA |
|---|---|---|
| Commande créée, paiement attendu | e-mail avec lien de paiement | — |
| Paiement confirmé | **confirmation + récapitulatif + mentions de rétractation** | notification interne |
| Paiement expiré / échoué | e-mail neutre, sans reproche | — |
| Passage en fabrication | e-mail (le délai indicatif court) | — |
| Expédition | e-mail avec transporteur et numéro de suivi | — |
| Livraison | e-mail + **rappel d'activation** si produit activable | — |
| Support non activé après N jours | rappel unique | alerte interne |
| Retour demandé | accusé de réception | **alerte** |
| Retour reçu | e-mail | — |
| Remboursement émis | e-mail + avoir en pièce jointe | notification comptable |
| Litige ouvert | accusé de réception | **alerte prioritaire** |
| Stock sous le seuil | — | **alerte** (aujourd'hui : seuil stocké, jamais exploité) |
| Survente détectée | — | **alerte** (aujourd'hui : absorbée en silence) |

Règles : **aucune notification n'est envoyée deux fois** pour le même événement (clé
d'idempotence par commande + type) ; **aucune notification ne contient de donnée de paiement** ;
un e-mail de confirmation est une **preuve** — il est horodaté et son envoi est journalisé.

Rappel de l'audit : `packages/email` ne contient aujourd'hui **aucun** gabarit Boutique. La
totalité de ce tableau est à construire.
