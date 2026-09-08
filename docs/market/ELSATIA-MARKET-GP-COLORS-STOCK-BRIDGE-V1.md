# ELSATIA-MARKET-GP-COLORS-STOCK-BRIDGE-V1

Lot : `ELSATIA-MARKET-BUSINESS-LEGAL-TECHNICAL-ARCHITECTURE-V1` — Phase 4
Révision : **R2 — décisions produit fermées** (`ELSATIA-MARKET-R2-FINAL-PRODUCT-DECISIONS`)
Nature : étude de liaison. **Aucun développement.** Aucune modification de Gestion Pro, Colors,
Réserves, Tools ni du site.
Branche : `feat/market-architecture-legal-business-v1` — base `1fc1331`

---

## 1. Le principe directeur : un couplage faible, optionnel, et sortant

Le lot pose une contrainte structurante :

> Toute liaison inter-application doit être faible et optionnelle. Un professionnel sans Gestion Pro
> ou Colors doit pouvoir utiliser Market. Ne pas rendre obligatoire un identifiant produit central.

**Décision R2 (§8), fermée** : Market doit fonctionner **sans abonnement Gestion Pro**. Les ponts
avec Gestion Pro, Stock et Colors restent **facultatifs**. Un vendeur peut créer une annonce
**manuellement**. Un article lié à Gestion Pro ou Colors conserve un **lien faible et nullable**.

Cette contrainte n'est pas un confort : elle détermine la viabilité commerciale de Market. Une place
de marché qui exigerait Gestion Pro se priverait de la quasi-totalité de son marché adressable, et
n'aurait aucune chance d'atteindre la masse critique dont dépend l'intérêt même d'une marketplace.

**Vérification d'autonomie** — un vendeur sans aucun autre produit ELSATIA doit pouvoir accomplir la
totalité du parcours :

| Étape | Dépendance à Gestion Pro ou Colors |
|---|---|
| Créer un compte, activer Market | **aucune** |
| Se faire vérifier (N1–N3) | **aucune** |
| Souscrire l'abonnement Market | **aucune** |
| Créer une annonce de bout en bout | **aucune** — saisie manuelle intégrale |
| Publier, négocier, échanger, réserver, confirmer une remise | **aucune** |
| Facturer | ses propres outils |

Les ponts n'apportent que du **confort de saisie**. Aucun champ obligatoire d'une annonce n'en
provient.

Quatre règles en découlent :

| Règle | Énoncé |
|---|---|
| **B1 — Market est autonome** | Le modèle d'annonce est complet et se suffit à lui-même. Aucun champ obligatoire d'une annonce ne provient d'une autre application. |
| **B2 — Le pont est sortant et unidirectionnel** | On publie **depuis** Stock, Colors ou Gestion Pro **vers** Market. Market n'écrit jamais dans le stock, ne modifie jamais un seau, ne crée jamais un article. |
| **B3 — La liaison est une référence faible et NULLABLE, jamais une clé étrangère** | Une annonce mémorise l'origine de sa création dans des champs **facultatifs**. Aucune contrainte référentielle vers Gestion Pro ou Colors : la disparition, l'archivage ou l'absence de l'objet source **ne peut ni bloquer, ni altérer, ni invalider l'annonce**. Une annonce saisie manuellement porte simplement `origine = 'saisie_manuelle'` et des références nulles. |
| **B4 — Le pont est une commodité de saisie, pas un mécanisme de synchronisation** | L'import pré-remplit un formulaire. Il n'installe aucun lien vivant qui propagerait les modifications ultérieures. |

**Conséquence de B4, à assumer explicitement** : si le vendeur modifie l'article de stock après avoir
publié, l'annonce ne change pas. C'est voulu. Une annonce est un engagement commercial daté et
opposable ; la voir muter parce qu'un magasinier a corrigé une désignation serait un défaut, pas une
fonctionnalité.

---

## 2. Ce que l'audit a établi sur les objets sources

### 2.1 `articles_stock` (Gestion Pro — module Stock, LIVRÉ)

```
articles_stock(id, entreprise_id, reference, designation, unite, quantite_stock,
               seuil_alerte, prix_achat_ht, emplacement, actif)
               unique (entreprise_id, reference)
mouvements_stock, inventaires, lignes_inventaire, fiches_techniques_articles
appliquer_mouvement_stock(), enregistrer_mouvement_stock_borne_v4(), …
```

Ce que l'article **porte** : référence interne, désignation, unité, quantité, **prix d'achat**,
emplacement.

Ce qu'il **ne porte pas**, et qui est indispensable à une annonce : prix de **vente**, état d'usure,
description commerciale, photos (les `fiches_techniques_articles` portent des documents techniques,
pas des photos de vente), marque, modèle, année, dimensions, poids, conditions, garantie,
localisation de retrait.

**Le prix d'achat ne doit jamais devenir un prix de vente par défaut.** Ce serait à la fois une
divulgation de marge et un contresens commercial.

### 2.2 `colors_seaux` (Colors, LIVRÉ)

```
colors_seaux(id, entreprise_id, emplacement_id, marque, produit, reference_produit,
             teinte_nom, teinte_reference, couleur_hex, ral_approxime, ral_distance,
             ral_confirme, mode_quantite ∈ {pourcentage, volume, poids},
             quantite_nominale, quantite_restante, pourcentage_restant (généré),
             unite, densite_kg_l, etat ∈ {ferme, ouvert, vide, archive},
             date_ouverture, photo_principale_path, notes, created_by, archived_at)
```

C'est le meilleur candidat de tout l'écosystème pour alimenter une annonce : il porte déjà **marque,
produit, référence, teinte, RAL, couleur hexadécimale, quantité restante, état et une photo**.

Deux caractéristiques du produit Colors s'imposent au pont :

- **Traçabilité append-only** : Colors n'a pas de suppression physique — la corbeille est l'état
  `archive` — et tout est journalisé. Une publication vers Market est un **événement de la vie du
  seau** et doit être historisée comme tel côté Colors… ce que ce lot **ne peut pas implémenter**,
  puisqu'il interdit de modifier Colors. Voir §7.
- **Contraintes de cohérence fortes** : le triplet mode/unité/quantité est verrouillé par `check`.
  Le pont doit convertir vers le vocabulaire Market sans jamais réinterpréter (§3.2).

### 2.3 Gestion Pro au sens large

`outils` et `mouvements_outillage` (outillage), `vehicules` et `affectations_vehicules` (flotte),
`chantiers` (fin de chantier) sont des sources plausibles. Elles relèvent des modules **Stock**,
**Matériel et véhicules** — donc d'un abonnement Gestion Pro dont Market ne peut pas dépendre.

Priorité de mise en œuvre : **Stock** et **Colors** d'abord (les cas d'usage les plus fréquents :
surplus de matériaux, restes de peinture), **Outillage** et **Véhicules** ensuite, **Chantier**
(publication groupée de fin de chantier) en dernier — c'est le plus riche fonctionnellement et le
plus risqué juridiquement (un lot de fin de chantier mélange des catégories réglementées).

---

## 3. Correspondance des champs

### 3.1 `articles_stock` → annonce Market

| Source | Cible | Traitement |
|---|---|---|
| `designation` | `titre` | pré-rempli, tronqué à 120, **modifiable** |
| `designation` | `description` | amorce, **complétion obligatoire** par le vendeur |
| `reference` | `origine_reference` (**privé**) | référence **interne** : ne devient jamais la référence publique |
| `unite` | `unite` | table de correspondance ; refus explicite si l'unité n'a pas d'équivalent |
| `quantite_stock` | `quantite` | **plafond** proposé, jamais imposé |
| `prix_achat_ht` | — | **jamais transféré** |
| `emplacement` | — | **jamais transféré** (donnée interne de dépôt) |
| `actif` | garde | un article inactif n'est pas publiable |
| — | `categorie_code` | **saisie obligatoire** : le stock n'a pas de nomenclature |
| — | `etat_bien`, `prix_ht`, `photos`, `garantie` | **saisie obligatoire** |

**Aucune photo n'est disponible.** C'est le principal frein du pont Stock : une annonce exige au
moins une photo, et le module Stock n'en stocke pas. Le vendeur devra en ajouter — l'import fait
gagner du temps, pas la totalité du travail.

### 3.2 `colors_seaux` → annonce Market

| Source | Cible | Traitement |
|---|---|---|
| `marque` | `marque` | direct |
| `produit` | `titre` (amorce) et `modele` | `« {marque} {produit} — {teinte_nom} »` |
| `reference_produit` | `reference_fabricant` | direct |
| `teinte_nom`, `teinte_reference` | `couleur`, `attributs.teinte` | direct |
| `couleur_hex` | `couleur_hex` | direct |
| `ral_approxime` + `ral_confirme` | `attributs.ral` | **le statut « approximatif / confirmé » est transféré avec la valeur.** Publier « RAL 7016 » sans dire qu'il est approximatif est une affirmation commerciale que la donnée ne soutient pas. |
| `mode_quantite` + `quantite_restante` + `unite` | `quantite` + `unite` | `volume` → `l`/`ml` ; `poids` → `kg`/`g` ; **`pourcentage` → refus d'import automatique** : « 40 % d'un seau » n'est pas une quantité vendable, le vendeur doit saisir un volume ou un poids réel |
| `pourcentage_restant` | `attributs.taux_restant` | information d'appoint |
| `etat` | garde | seuls `ferme` et `ouvert` sont publiables ; `vide` et `archive` sont refusés |
| `etat = 'ouvert'` + `date_ouverture` | `etat_bien` = `usage` + mention | un pot ouvert **doit** être annoncé comme tel |
| `photo_principale_path` | `photos[0]` | **copie** vers le bucket public Market — jamais un lien vers le bucket privé Colors (§4) |
| `densite_kg_l` | `attributs.densite` | — |
| `notes` | — | **jamais transféré** : notes internes |
| `emplacement_id` | — | **jamais transféré** |
| — | `mentions_reglementaires` | **obligatoire** : la peinture relève de la catégorie `peintures_produits`, sous conditions |

**Point d'attention réglementaire** : un reste de peinture est un produit chimique. La publication
depuis Colors doit imposer les mentions de la catégorie (nature du produit, dangers, conditionnement
d'origine, conservation) — voir le cadre juridique. Le confort de l'import ne doit pas court-circuiter
ce contrôle : l'écran d'import est précisément l'endroit où la mention doit être exigée.

---

## 4. Photos : le point technique le plus délicat du pont

Les photos Colors vivent dans le bucket **privé** `colors-seaux`, dont l'accès est gardé par
`colors_photo_stockage_valide()` et cloisonné par `entreprise_id`. Une annonce Market doit être
visible par un **visiteur anonyme**.

**Trois options, une seule acceptable :**

| Option | Description | Verdict |
|---|---|---|
| Lien direct vers `colors-seaux` | l'annonce référence le chemin privé | **inacceptable** : imposerait d'ouvrir un bucket privé à l'anonyme, ou de servir la photo par une URL signée — l'un ruine le cloisonnement, l'autre est incompatible avec une page publique cacheable |
| URL signée à durée longue | contournement du précédent | **inacceptable** : une URL signée qui traîne dans un cache ou un partage devient un accès permanent non révocable à un bucket privé |
| **Copie vers un bucket public Market** | la photo est **copiée**, redimensionnée, dépouillée de ses métadonnées | **retenue** |

Règles de la copie :

1. **Copie, jamais référence.** Supprimer le seau dans Colors ne doit pas trouer l'annonce ; retirer
   l'annonce ne doit pas toucher Colors.
2. **Suppression des métadonnées EXIF** — en particulier les **coordonnées GPS**, qui trahiraient
   l'adresse exacte du dépôt que le modèle d'annonce s'emploie à protéger (§3.5 de la spécification).
3. **Redimensionnement** et génération des vignettes à l'envoi.
4. **Nom de fichier opaque** : ni `entreprise_id`, ni `seau_id`, ni référence interne dans l'URL
   publique.
5. **Passage par le contrôle d'image** de la modération, comme toute photo Market.

---

## 5. Réservation de quantité sans fausser le stock réel

C'est l'exigence la plus subtile de la Phase 4. Trois voies :

| Voie | Mécanisme | Verdict |
|---|---|---|
| **V-A. Décrément immédiat** | publier décrémente le stock | **rejetée** : une annonce n'est pas une sortie. Le stock ne serait plus le reflet du réel, et la première annonce non vendue introduit un écart d'inventaire permanent. |
| **V-B. Réservation dans Gestion Pro** | Market écrit une réservation dans le stock GP | **rejetée** : viole B2 (Market n'écrit jamais dans le stock) et rend Market dépendant de Gestion Pro |
| **V-C. Engagement porté par Market seul** | Market tient sa propre quantité engagée ; Gestion Pro l'**affiche** sans la subir | **retenue** |

### 5.1 Le modèle retenu (V-C)

Market tient, dans son propre périmètre :

```
quantite_annoncee   = quantité mise en vente sur l'annonce
quantite_engagee    = Σ des réservations acceptées et non conclues
quantite_conclue    = Σ des remises confirmées
quantite_disponible = quantite_annoncee − quantite_engagee − quantite_conclue
```

Le stock Gestion Pro n'est **pas** modifié par Market. Il peut, s'il le souhaite, **lire** une
information d'engagement pour l'afficher :

> « Article A-1042 — 120 u en stock, dont **15 u engagées sur ELSATIA Market** »

Cette lecture est purement informative, ne change aucun calcul d'inventaire, et **ne crée aucune
dépendance de Market vers Gestion Pro** — la dépendance va dans l'autre sens, ce qui est acceptable :
un utilisateur sans Market voit simplement l'information absente.

### 5.2 Le décrément réel

Le stock n'est décrémenté que par un **mouvement de stock ordinaire, saisi par le vendeur dans
Gestion Pro**, comme pour toute sortie. Market ne fait que le lui **rappeler** :

> « Vous avez confirmé la remise de 15 u de l'article A-1042. Pensez à enregistrer la sortie de
> stock correspondante dans Gestion Pro. »

C'est délibérément manuel en V1. Un décrément automatique déclenché depuis une autre application
supposerait que Market ait un droit d'écriture sur le stock d'une entreprise — exactement ce que B2
interdit — et créerait une classe entière de bugs d'inventaire dont Gestion Pro porterait la
responsabilité sans en maîtriser la cause.

Une automatisation ultérieure, **opt-in par entreprise et réversible**, est envisageable une fois le
mécanisme éprouvé. Elle n'est pas en V1.

### 5.3 Annulation d'une réservation

Une réservation annulée ou expirée libère `quantite_engagee` **immédiatement**. Comme rien n'a été
décrémenté, il n'y a **rien à recréditer** : c'est le principal avantage du modèle V-C, qui supprime
par construction toute la classe des bugs de compensation.

---

## 6. Empêcher la double vente

Le risque : le même bien physique vendu deux fois — sur deux annonces Market, ou sur Market et hors
Market.

| Garde | Portée | Efficacité |
|---|---|---|
| **G1** — `quantite_disponible ≥ 0`, contrainte de cohérence | dans Market | **totale** sur une annonce |
| **G2** — une réservation acceptée **bloque** la quantité correspondante | dans Market | **totale** |
| **G3** — unicité `(entreprise_id, origine, origine_reference)` sur les annonces **actives** | entre annonces Market | **totale** : le même article de stock ne peut pas fonder deux annonces vivantes |
| **G4** — alerte au vendeur si la quantité annoncée dépasse le stock disponible | à l'import | **indicative** — le stock peut être faux, ou le bien non stocké |
| **G5** — la remise confirmée est terminale et irréversible | dans Market | **totale** |
| **G6** — vente hors plateforme | — | **aucune garde possible** |

G6 est irréductible : rien n'empêche un vendeur de céder le bien de la main à la main. La seule
réponse est opérationnelle — un rappel de retrait d'annonce, une expiration courte par défaut
(60 jours), une relance à J-7, et la prise en compte des annonces obsolètes dans le score de
confiance du vendeur.

---

## 7. Traçabilité de l'origine — et sa limite

Une annonce enregistre son origine dans sa partie **privée** :

```
origine            ∈ { saisie_manuelle, import_stock, import_colors, import_outillage, import_gp }
origine_reference    identifiant de l'objet source, dans le tenant du vendeur
origine_horodatage   moment de l'import
origine_empreinte    valeurs importées au moment de l'import (preuve de ce qui a été repris)
```

`origine_empreinte` mérite un mot : il fige ce que la source disait **au moment de l'import**. Si le
seau est modifié ensuite, on sait ce que le vendeur a effectivement repris. C'est utile en cas de
contestation, et cohérent avec la doctrine append-only de la maison.

**Limite à énoncer clairement** : la réciproque — inscrire dans l'historique de Colors qu'un seau a
été publié sur Market — **suppose de modifier Colors**, ce que ce lot interdit. La traçabilité est
donc, en l'état, **unilatérale** : Market sait d'où il vient, Colors ne sait pas où va son seau.

Ce n'est pas neutre pour un produit dont la traçabilité est l'argument central. Deux voies :

- **voie A** : Market publie un événement que Colors consommera plus tard, quand un lot Colors le
  permettra — la trace est alors différée mais complète ;
- **voie B** : accepter durablement l'asymétrie.

**Recommandation : voie A**, l'événement étant émis dès la V1 de Market même si aucun consommateur
n'existe encore. Émettre l'événement coûte peu ; le rétro-installer sur un historique déjà constitué
coûte beaucoup. Décision D-6.

---

## 8. Ce que le pont ne fera pas

| Non-objectif | Motif |
|---|---|
| Synchroniser les prix | l'annonce est un engagement daté ; le prix d'achat n'est pas un prix de vente |
| Synchroniser les quantités en continu | §5 — le stock est le réel, l'annonce est une offre |
| Créer un article de stock depuis une annonce | Market n'écrit pas dans Gestion Pro (B2) |
| Publier automatiquement les surplus | une publication est un acte commercial délibéré, avec des conséquences juridiques |
| Imposer un identifiant produit central | interdit par le lot, et inutile : `(entreprise_id, origine, origine_reference)` suffit |
| Exiger Gestion Pro ou Colors | interdit par le lot, et suicidaire commercialement |
| Décrémenter le stock automatiquement | §5.2 |

---

## 9. Charge estimée du pont, par source

| Pont | Charge | Dépendances |
|---|---|---|
| Saisie manuelle (référence) | incluse dans le socle Market | — |
| Import Stock | faible | module Stock actif ; aucune photo disponible |
| Import Colors | **moyenne** | copie de photo + EXIF + conversions d'unités + mentions réglementaires |
| Import Outillage | faible | module Matériel |
| Import Véhicules | moyenne | catégorie fortement réglementée (immatriculation, contrôle technique) |
| Publication groupée de fin de chantier | **forte** | multi-catégories, dont réglementées — à instruire séparément |
| Lecture « engagé sur Market » dans Gestion Pro | faible | **modifie Gestion Pro — hors de ce lot** |
| Événement de publication consommé par Colors | faible côté Market | **modifie Colors — hors de ce lot** |

---

## 10. Confirmation

Étude de liaison. Aucune modification de Gestion Pro, Colors, Réserves, Tools ou du site public.
Aucun code, aucune migration, aucun SQL proposé, aucun objet Stripe.
