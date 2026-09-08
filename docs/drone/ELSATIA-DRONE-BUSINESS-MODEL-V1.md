# ELSATIA Drone / Scan — Modèle économique V1

> 2026-09-08. **Aucun tarif n'est fixé par ce document. Aucun objet Stripe n'est créé.**
> Trois modèles sont instruits ; l'arbitrage appartient à Julien.

---

## 1. Le cadre existe déjà — s'y brancher, ne pas l'inventer

Le moteur commercial (`src/lib/commercial/`, Train V3) porte une grammaire de prix qu'il
serait absurde de dupliquer :

| Élément | Valeur |
|---|---|
| Grille publique | `CANONICAL-V4-2026-09` |
| Catalogue commercial | `GP-COMMERCIAL-V2-2026-09` |
| Règle annuelle | **Tout élément récurrent annuel = 10 mensualités** (2 mois offerts) ; un achat ponctuel n'est jamais multiplié |
| Règle absolue | *« Le tarif public ne change JAMAIS pour avantager un client. Un avantage individuel est une remise, jamais une modification du catalogue. »* |

Et surtout, un **statut de prix** obligatoire par montant :

| Statut | Signification |
|---|---|
| `valide` | Décision commerciale actée, déjà câblée (doc, migration, Stripe) |
| `recommande` | Proposition argumentée d'une étude, en attente d'arbitrage |
| `provisoire` | Montant de travail, non figé |
| `divergent` | **Deux valeurs incompatibles coexistent.** Le moteur n'en choisit jamais une silencieusement |
| `a_definir` | **Pas de prix : interdit à la vente** |

### 1.1 Statut de tous les prix Drone / Scan aujourd'hui

**`a_definir`. Sans exception. Donc interdit à la vente.**

La recommandation historique de **129 € HT/mois** est au mieux `recommande` : elle n'a jamais
été arbitrée, elle est antérieure à la grille V4, et surtout elle repose sur un coût de
traitement **qui n'a jamais été mesuré**. `couts/estimation.ts` refuse par construction de
convertir un coût en crédits avant benchmarks réels — vendre un abonnement incluant du
traitement reviendrait à contourner ce refus par la voie commerciale.

---

## 2. Ce qui coûte

| Poste | Nature | Prévisible ? |
|---|---|---|
| Hébergement applicatif | Fixe | Oui |
| **Stockage médias** | **Croissant, jamais décroissant** | Oui, et c'est le poste qui tue |
| Bande passante sortante | Variable | Moyennement |
| **Traitement GPU** | **Très variable, par reconstruction** | **Non — jamais mesuré** |
| Licence moteur (Metashape) | Fixe | Oui, si acquise |
| IA à l'usage | Variable | Oui, à l'appel |
| Support | Croissant avec le parc | Moyennement |

**Deux postes seulement portent le risque : le stockage et le GPU.** Le premier est
prévisible et croît indéfiniment ; le second est imprévisible et non mesuré. Tout modèle
économique se juge sur sa façon de traiter ces deux-là.

---

## 3. Trois modèles

### Modèle A — Abonnement plat, tout inclus

*Un prix mensuel par entreprise, stockage et traitement inclus dans des limites généreuses.*

| | |
|---|---|
| **Pour** | Lisible, se vend en une phrase, cohérent avec Gestion Pro, revenu prévisible |
| **Contre** | **Le coût variable est absorbé par ELSATIA.** Un client qui reconstruit 40 chantiers par mois coûte 40× celui qui en fait un — pour le même prix. Le stockage ne redescend jamais |
| **Risque** | **Marge négative sur les meilleurs clients** — l'inverse de ce qu'on veut |
| **Condition** | Impossible tant que le coût GPU n'est pas mesuré. Sans mesure, la « limite généreuse » est un chiffre au hasard |
| **Verdict** | **Écarté en l'état.** Recevable seulement après la campagne de benchmark |

### Modèle B — Socle léger + usage facturé

*Abonnement bas donnant accès au produit sans traitement ; reconstruction et stockage
au-delà d'un seuil facturés à l'usage.*

| | |
|---|---|
| **Pour** | Coût variable couvert par le revenu variable · **le produit V1 se vend sans photogrammétrie**, ce qui est exactement son état réel · barrière d'entrée basse · l'usage suit la valeur perçue |
| **Contre** | Facture moins prévisible pour le client — objection réelle dans le BTP · nécessite un compteur d'usage fiable · le mot « crédit » inquiète |
| **Risque** | Un client surpris par sa facture ne revient pas |
| **Atténuation** | Plafond mensuel configurable, alerte à 80 %, **jamais de dépassement silencieux**, estimation **avant** lancement du traitement |
| **Verdict** | **Recommandé pour la V1** |

### Modèle C — Option de Gestion Pro

*Pas d'application vendue seule : un module de plus dans l'abonnement GP.*

| | |
|---|---|
| **Pour** | Aucun appareil commercial nouveau · s'appuie sur les 5 modules × 10 € déjà cadrés · vente incitative simple sur le parc existant |
| **Contre** | **Tue le marché autonome.** Un couvreur qui ne veut pas de Gestion Pro ne peut pas acheter · contredit le mode autonome que le noyau protège explicitement (`gestion_pro_id` nullable, ports facultatifs) · un module à 10 € ne finance pas un GPU |
| **Risque** | Enfermer un produit qui a un marché propre |
| **Verdict** | **Écarté comme modèle unique.** Recevable comme **remise de couplage** : le client GP paie l'abonnement Scan moins une remise — ce qui est un `remises.ts`, pas un catalogue |

---

## 4. Recommandation

**Modèle B, en trois lignes, avec la photogrammétrie hors du socle.**

| Ligne | Nature | Statut | Ce qu'elle couvre |
|---|---|---|---|
| **Socle Scan** | Abonnement récurrent par entreprise | `a_definir` | Projets, import, organisation, annotation, mesure niveau ≤ 4, rapports, stockage inclus borné |
| **Comptes supplémentaires** | Récurrent | **Aligner sur la grille V4 par rôle** — ne rien inventer | — |
| **Stockage supplémentaire** | Récurrent, par bloc | `a_definir` | Au-delà de l'inclus |
| **Traitement** | **Ponctuel** | **`a_definir` — bloqué par l'absence de benchmark** | Reconstruction |
| **IA** | Ponctuel | Aligner sur le pack IA ponctuel de la grille V4 | — |

Trois propriétés qui rendent ce montage défendable :

1. **Le socle se vend sans photogrammétrie.** C'est l'état réel du produit : la V1 fait de
   l'import, de l'annotation, de la mesure calibrée et du rapport. Elle a de la valeur ainsi.
2. **Le traitement est un achat ponctuel**, donc jamais multiplié par 10 en annuel — la règle
   du moteur est respectée sans exception à écrire.
3. **Le couplage GP est une remise**, pas un second catalogue.

**Aucune de ces lignes ne peut passer en `recommande`, encore moins en `valide`, avant :**
la campagne de benchmark · le chiffrage d'hébergement · l'avis PI sur l'AGPL · le figement
du prix contractuel par le Train V3.

---

## 5. Ce qui est explicitement exclu

| Exclusion | Raison |
|---|---|
| **Créer un Price Stripe** | Interdit par le brief. Et le figement du prix contractuel doit être livré par le **Train V3 avant** tout repointage Stripe Live |
| Tarifer en crédits de traitement | `couts/estimation.ts` refuse par construction, faute de benchmark |
| Annoncer un volume de stockage inclus | Aucun chiffrage d'hébergement n'existe |
| Vendre le métré comme fonction principale | Aucune précision mesurée |
| Facturer par mission | Pénalise le suivi de chantier, qui est le meilleur usage d'entrée |
| Encaisser pour un télépilote prestataire | Écarté pour les mêmes raisons que Market : ELSATIA n'encaisse pas pour le compte d'un tiers |
| Offre « à vie » ou « permanente » | **Vocabulaire proscrit** depuis l'arbitrage Boutique |
| Essai avec traitement illimité | Un essai qui coûte du GPU sans revenu est une porte ouverte à l'abus |

---

## 6. Essai et grands comptes

**Essai :** 30 jours, socle complet, **traitement exclu ou plafonné à un très petit nombre de
reconstructions**. Aligner la durée sur l'essai 30 jours déjà cadré côté Gestion Pro plutôt
que d'inventer un régime propre.

**Grands comptes :** volume, engagement, et le cas particulier du **prestataire télépilote qui
travaille pour plusieurs entreprises**. Ce cas suppose du partage inter-tenant, que le socle
n'a pas. Le traiter par le modèle « invité borné » (une mission, une échéance) et non par un
produit tarifaire, tant que le partage inter-tenant n'existe pas.

---

## 7. Séquence commerciale

| Étape | Condition |
|---|---|
| 0. **Aucune vente** | État actuel. Aucun prix ne dépasse `a_definir` |
| 1. Campagne métrologique + benchmark | Donne les seuils **et** les coûts |
| 2. Chiffrage d'hébergement | Donne le stockage inclus |
| 3. Avis PI sur l'AGPL | Ouvre ou ferme la ligne « traitement » |
| 4. Prix en `recommande` | Instruits, non vendables |
| 5. Arbitrage de Julien | Passage en `valide` |
| 6. Train tarifaire | Câblage catalogue + Stripe Test |
| 7. Stripe Live | **Après figement du prix contractuel par le Train V3** |

**Aucune étape ne peut être sautée sans reproduire exactement la situation que la
réconciliation commerciale a déjà eu à corriger : des prix affichés que le code ne connaît
pas.**

---

## 8. Contraintes de calendrier

- La marque ELSATIA est **déposée, non enregistrée définitivement** : pas de symbole ®, pas de
  mention « marque déposée » hors du cadre validé, jalon de commercialisation au
  **21 octobre 2026**.
- **ELSATIA-UI-V2** est un lot obligatoire **avant commercialisation**. Drone héritera de la
  cible UI-V2, pas de l'interface actuelle — c'est déjà écrit dans le noyau.
- **Aucun développement Drone avant le socle multiproduit du Train V3**, pour la raison déjà
  retenue pour Market : un sixième produit branché sur un moteur commercial non stabilisé
  multiplie la dette au lieu de la porter.
