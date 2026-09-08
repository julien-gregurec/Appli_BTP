# ELSATIA Drone — Mesure, métré et photogrammétrie V1

> 2026-09-08. Complète `ELSATIA_DRONE_PHOTOGRAMMETRY_OPTIONS_V1.md` et
> `PHOTOGRAMMETRY_PIPELINE_PROTOTYPE_V1.md` (2026-09-07). Ne les remplace pas.
> **Ce document ne contient aucun chiffre de précision.** C'est volontaire, et c'est son
> apport principal.

---

## 1. La règle qui commande tout

> **Aucune précision ne peut être annoncée tant qu'aucune n'a été mesurée.**

Le noyau applique déjà cette règle en code : `quality.ts` définit quatre niveaux de qualité
et **aucun seuil**, avec ce commentaire — « les seuils sont la sortie d'une campagne
métrologique qui n'a pas eu lieu, et les coder serait inventer une précision ». De même,
`couts/estimation.ts` refuse par construction de convertir un coût en crédits avant
benchmarks réels.

Ce refus est le meilleur actif du lot Drone. Ce document l'étend au métré, où l'enjeu n'est
plus la crédibilité mais **l'argent** : une surface erronée de 8 % sur une toiture, c'est un
devis faux, une marge perdue, et selon les cas un litige.

---

## 2. Six niveaux de mesure

Le brief en demande six. Ils se définissent par **ce qui les rend vrais**, pas par un chiffre.

| Niveau | Définition | Ce qui l'établit | Utilisable pour |
|---|---|---|---|
| **1. Indicative** | Lue sur une image sans échelle connue | Rien | Comprendre, décrire. **Jamais chiffrer** |
| **2. Calculée** | Dérivée d'autres grandeurs par un calcul explicite | La chaîne de calcul est tracée | Ce que permet sa **plus faible** entrée |
| **3. Reconstruite** | Issue d'un modèle photogrammétrique non calé | Un modèle cohérent, à l'échelle inconnue | Proportions, formes. **Pas des quantités** |
| **4. Calibrée** | Modèle mis à l'échelle par une référence connue | **Une** distance mesurée sur site, ou EXIF+GSD | Pré-métré à valider |
| **5. Contrôlée** | Modèle calé sur des coordonnées connues | RTK ou **points de calage** (≥ 3, répartis) | Métré, devis, DOE |
| **6. Certifiée** | Attestée par un tiers qualifié | **Un géomètre, pas un logiciel** | Acte, bornage, litige |

### 2.1 Correspondance avec le code existant

| Niveau | `MeasurementOrigin` | `MeasurementQualityLevel` |
|---|---|---|
| 1 | `approximated` | `indicative` |
| 2 | `computed`, combiné au plus faible | hérité |
| 3 | `imported` | `indicative` |
| 4 | `calibrated` | `standard` |
| 5 | `field_controlled` | `rtk_gcp_controlled` |
| 6 | **hors ELSATIA** | **hors ELSATIA** |

**Le niveau 6 n'est pas un niveau du produit.** ELSATIA ne certifie rien. Toute mention de
« mesure certifiée » dans une interface ou un rapport serait une usurpation. Le mot est
réservé au tiers qualifié qui engage sa responsabilité.

### 2.2 Combinaison par le maillon le plus faible

`provenance.ts` implémente déjà `combineOrigins` : le plus faible l'emporte. Corollaire à
écrire dans l'interface : **une surface calculée à partir d'un pan reconstruit non calé reste
de niveau 3**, quelle que soit la propreté du clic de l'opérateur. Le soin humain ne rachète
jamais une échelle inconnue.

---

## 3. Méthodes de mise à l'échelle

| Méthode | Ce qu'elle exige | Portée | Défaillance typique |
|---|---|---|---|
| Distance mesurée sur site | Un décamètre, deux points **visibles sur les images** | Niveau 4 | Points mal identifiés, mesure arrondie |
| Objet de dimension connue | Une porte, une tuile, un panneau **de série vérifiée** | Niveau 4 dégradé | La tuile n'est pas au format supposé |
| Marqueur de calibration | Cible imprimée, dimension contrôlée | Niveau 4 fiable | Impression mise à l'échelle par l'imprimante — **piège classique** |
| GSD depuis EXIF + hauteur | Focale, taille de capteur, hauteur **au-dessus de la surface** | Niveau 4 faible | La hauteur EXIF est au-dessus du **décollage**, pas de la toiture |
| GNSS des images | Positions EXIF | Niveau 3–4 | GNSS grand public : erreur métrique |
| RTK | Drone RTK + base ou réseau | **Niveau 5** | Perte de correction non détectée |
| Points de calage (GCP) | ≥ 3 points levés, répartis, visibles | **Niveau 5** | Points alignés ou groupés → modèle vrillé |
| Plan connu | Plan coté fiable | Niveau 4 | Le plan ne correspond pas à l'exécuté |
| Contrôle manuel | Une distance **non utilisée pour le calage**, remesurée | Vérification | Utiliser la même distance pour caler et vérifier — **circulaire, donc faux** |

### 3.1 Trois refus que le produit doit opposer

1. **Sans mise à l'échelle, refuser de produire une quantité.** Pas d'avertissement discret :
   un **refus**, avec le geste manquant expliqué. C'est la seule protection contre le
   niveau 3 déguisé en métré.
2. **Sans au moins trois points de calage répartis, refuser le niveau 5.** Trois points
   alignés ne contraignent pas une rotation ; l'accepter donnerait un modèle vrillé au visuel
   parfait.
3. **Refuser une vérification circulaire.** Une distance qui a servi au calage ne peut pas
   servir de contrôle. Le produit doit le savoir et le dire.

---

## 4. Protocole d'étalonnage — ce qu'il faut faire avant toute annonce

Le harnais de benchmark existe (`benchmark/mesure.ts`, trois jeux définis). **Aucune mesure
n'a été exécutée.** Voici ce qu'il faut, dans l'ordre :

| Étape | Contenu | Sortie |
|---|---|---|
| 1 | **Trois scènes réelles** : toiture simple, toiture complexe, façade | Jeux d'images de référence |
| 2 | **Vérité terrain** : levé géomètre ou distances contrôlées, indépendantes du calage | Valeurs de référence |
| 3 | Reconstruction aux niveaux 3, 4 et 5 sur chaque scène | 9 modèles |
| 4 | Écart mesuré par grandeur : longueur, surface, angle de pente | Distribution d'erreur |
| 5 | Répétabilité : 3 vols de la même scène | Dispersion |
| 6 | **Cas de rupture** : ombre portée, tuile mouillée, verrière, surface uniforme, vent | Conditions d'échec documentées |
| 7 | Seuils dérivés des mesures, pas de la littérature | **Enfin** des seuils codables |
| 8 | Formulation commerciale validée sur les seuils mesurés | Ce que le site a le droit d'écrire |

**Coût estimé : quelques journées de terrain et un levé géomètre.** C'est peu au regard de ce
qu'un métré faux coûte une seule fois. Tant que cette campagne n'a pas eu lieu :

- aucun seuil dans `quality.ts` ;
- aucune phrase de précision sur le site ;
- aucun engagement contractuel de métré ;
- aucune vente d'un module « métré » comme fonction principale.

---

## 5. Photogrammétrie — état réel

Repris de `PHOTOGRAMMETRY_PIPELINE_PROTOTYPE_V1.md`, sans adoucissement :

| Verdict | Valeur |
|---|---|
| ODM techniquement viable | **Oui, sous réserve de mesure** — aucune reconstruction réelle exécutée |
| ODM commercialement autorisé | **Non** — conseil PI non saisi. AGPL-3.0, clause réseau |
| Metashape en repli | Viable **sur le plan de l'architecture** (substitution prouvée par test), non vérifié en exploitation, aucune licence acquise |
| Coût par reconstruction | **Non calculable** — le code refuse de le convertir en crédits |
| Infrastructure de traitement | **Inexistante** dans le dépôt : ni file distribuée, ni worker, ni GPU |

### 5.1 Local, serveur ou fournisseur

| Option | Coût | Confidentialité | Réversibilité | Verdict |
|---|---|---|---|---|
| **Local (navigateur / poste)** | Nul pour ELSATIA | Maximale | Totale | Irréaliste sur une scène de bâtiment |
| **Serveur ELSATIA + moteur libre** | GPU + exploitation | Bonne | Bonne | **Cible** — bloquée par l'AGPL |
| **Serveur ELSATIA + Metashape** | Licence + GPU | Bonne | Bonne | **Repli propre**, licence à acquérir |
| **Fournisseur spécialisé** | À l'usage | **Images hors ELSATIA** | Faible | Ouvre un sous-traitant RGPD |
| **Import de modèle produit ailleurs** | Nul | Bonne | Totale | **À faire en V1** — coûte presque rien |

### 5.2 Le mode V1 raisonnable

**Ne pas promettre de photogrammétrie propriétaire en V1.**

V1 : mesure sur image calibrée (niveau 4), **import de modèles produits ailleurs** (nuage,
orthophoto, maillage — douze formats déjà détectés par signature dans le prototype),
mesure sur modèle importé avec provenance `imported`.

V2, si et seulement si l'avis PI est favorable ou Metashape acquis : reconstruction ELSATIA.

**Justification :** l'import de modèle est déjà à 80 % écrit, ne dépend d'aucune licence, ne
consomme aucun GPU, et couvre le client qui possède déjà Pix4D ou fait appel à un prestataire.
La reconstruction propriétaire dépend d'un avis juridique non rendu et d'une infrastructure
non chiffrée. Les deux ne se livrent pas au même moment.

---

## 6. Métré et quantités

### 6.1 Cinq notions à ne jamais confondre

| Notion | Définition | Qui l'établit |
|---|---|---|
| **Mesure** | Une grandeur avec son origine et sa qualité | Le produit |
| **Quantité constatée** | Une mesure agrégée pour un ouvrage | Le produit |
| **Quantité estimée** | Constatée + pertes, recouvrements, façonnage | Le produit, **règles visibles** |
| **Quantité retenue** | Celle qu'un humain choisit d'utiliser | **Le métreur** |
| **Quantité validée** | Celle qui entre dans un devis | **Gestion Pro** |

Les trois premières se calculent. **Les deux dernières exigent un geste humain explicite**, et
le produit ne doit jamais franchir la frontière tout seul.

### 6.2 Interdits

- Aucune donnée n'entre automatiquement dans un devis définitif ;
- aucune quantité estimée n'est présentée sans ses règles (« +7 % de recouvrement ») ;
- aucune quantité de niveau ≤ 3 ne peut être marquée « retenue » ;
- aucun arrondi silencieux : l'arrondi est une décision, il s'affiche.

### 6.3 Marges de pose

`units.ts` impose le **millimètre** pour les spécifications matériel et les marges de pose,
le **mètre** pour le relevé. Cette séparation n'est pas cosmétique : elle empêche qu'une marge
de 30 mm devienne 0,03 m dans une somme de surfaces et disparaisse dans l'arrondi.

---

## 7. Intelligence artificielle

### 7.1 Fonctions envisageables

| Fonction | Données transmises | Risque | Verdict V1 |
|---|---|---|---|
| Classification de photos (toiture / façade / détail) | Image | Faible | Possible |
| Détection de doublons visuels | Empreinte perceptuelle, **locale** | Nul | **Oui, local** |
| Sélection des meilleures images | Netteté, exposition — **local** | Nul | **Oui, local** |
| Regroupement par zone | Métadonnées | Faible | Possible |
| Légendes automatiques | Image | Moyen | Possible, **révisable** |
| Résumé de mission | Texte + métadonnées | Faible | Possible |
| Détection de défauts | Image | **Élevé** | **Non** — voir §7.3 |
| Suggestion de réserves | Image | **Élevé** | **Non en V1** |
| Suggestion de quantités | Mesures | **Très élevé** | **Non** |
| Floutage de visages / plaques | Image | Moyen | **Oui, souhaitable** — traiter localement si possible |

### 7.2 Règles

1. **Le produit fonctionne intégralement sans IA.** L'IA est une commodité, jamais un chemin
   critique.
2. **Désactivable par entreprise**, et l'état est visible.
3. **Toute sortie d'IA est un brouillon** : elle porte une marque, elle n'entre nulle part
   sans geste humain.
4. **Rien n'est transmis à un fournisseur sans le dire**, ni sans l'accord de l'entreprise.
   Un fournisseur d'IA est un sous-traitant au sens RGPD, avec les obligations qui vont avec.
5. **Fournisseur indisponible ⇒ dégradation propre**, jamais une erreur bloquante.
6. Aligner sur la décision déjà prise côté GP : **stockage des réponses désactivé** chez le
   fournisseur.

### 7.3 Ce que l'IA ne fera jamais

Décider qu'un ouvrage est conforme · valider une mesure définitive · lever une réserve ·
émettre un devis · conclure juridiquement · remplacer une validation humaine.

**Pourquoi la détection de défauts est refusée en V1, et non reportée par prudence** : un
faux négatif sur une fissure structurelle engage la responsabilité de l'entreprise qui a fait
confiance à l'outil. Tant qu'aucun taux de rappel n'est mesuré sur des désordres réels de
bâtiment français, proposer la fonction reviendrait à transférer un risque à l'artisan sans
le lui dire. Même raisonnement que pour les seuils de précision : **on mesure, puis on
annonce.**

---

## 8. Ce que ce document n'autorise pas

- Aucune reconstruction ODM en production, tant que l'avis PI n'est pas rendu.
- Aucun seuil de qualité codé, tant que la campagne du §4 n'a pas eu lieu.
- Aucune annonce de précision, sur le site comme dans l'application.
- Aucun tarif de crédit de traitement, tant qu'aucun benchmark n'est exécuté.
- Aucune fonction d'IA sur le chemin critique.
