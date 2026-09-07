# ELSATIA Drone — Options photogrammétriques V1

> Livrable 3 (§127 du brief). Aucun code, aucune migration.
> **Vérifications web effectuées le 2026-09-07.** Tarifs et licences relevés à cette date,
> à reconfirmer auprès des éditeurs avant tout engagement.

## 0. Cadre imposé par le brief

- §17 — **ne pas réécrire un moteur Structure-from-Motion.** ELSATIA crée de la valeur
  métier *au-dessus* du moteur.
- §47/§48 — hébergement, stockage et traitement **UE** privilégiés ; identifier explicitement
  tout envoi hors UE.
- §49 — aucune réutilisation des médias clients pour entraîner un système tiers sans
  consentement explicite.
- §46/§88/§89 — le coût par reconstruction conditionne le pricing.

Ces quatre contraintes éliminent des options avant même de parler de qualité.

---

## 1. Recommandation

**Moteur MVP : OpenDroneMap (NodeODM) auto-hébergé sur GPU européen, derrière une
abstraction `MoteurReconstruction`.**

**Plan B contractuellement prêt : Agisoft Metashape sous *Service Provider License*,
auto-hébergé, même infrastructure, même abstraction.**

Le choix se joue sur un seul point qui n'est pas technique : **la licence AGPL-3.0 d'ODM
doit être validée par un conseil juridique avant commercialisation** (§4 ci-dessous). Si
ce conseil refuse l'AGPL en contexte SaaS, on bascule sur Metashape sans rien réécrire
d'autre que l'adaptateur — d'où l'abstraction, qui n'est pas un ornement mais la police
d'assurance de cette décision.

**Ce qui est écarté, et pourquoi, en une ligne chacun :**

| Écarté | Raison éliminatoire |
|---|---|
| Écrire notre propre SfM | §17 du brief. Aucune discussion. |
| RealityScan (ex-RealityCapture) | Windows + CUDA NVIDIA, et gratuité conditionnée à un seuil de chiffre d'affaires qu'ELSATIA a vocation à franchir. |
| Gaussian Splatting / NeRF | Rendu spectaculaire, **métrologie non établie**. Incompatible avec §24/§25/§107. |
| DJI Terra | Logiciel de bureau, pas d'API de service. |
| API « toiture » clés en main (type EagleView / Hover) | Couverture géographique principalement nord-américaine, et ELSATIA deviendrait revendeur d'un tiers au lieu de propriétaire de sa donnée. À réévaluer, pas à intégrer. |

---

## 2. Comparatif des options réellement disponibles

### Option A — OpenDroneMap / NodeODM, auto-hébergé

| Critère | Constat | Preuve |
|---|---|---|
| Licence | **AGPL-3.0** depuis ODM 2.3.0 / NodeODM 2.1.0 / WebODM 1.6.0 | [V] opendronemap.org |
| Coût logiciel | 0 € | — |
| Coût réel | GPU/CPU + stockage + bande passante uniquement | — |
| Déploiement | Conteneur, API HTTP NodeODM ; écosystème ClusterODM pour la montée en charge | [V] |
| GPU | Pipeline dense via **OpenMVS**, avec implémentation *patch match* GPU | [V] |
| API | API HTTP NodeODM documentée, pensée pour l'orchestration | [V] |
| Confidentialité | **Totale** — rien ne sort de l'infrastructure ELSATIA | — |
| Sorties | Nuage de points, MNS/MNT, **orthophoto**, maillage texturé | [V] |
| Précision | Adaptée à la cartographie aérienne ; **non caractérisée pour le métré de toiture** — c'est l'objet de la campagne §107 | `[?]` |
| Maintenance | À notre charge : mises à jour, tuning, échecs de reconstruction | — |
| Compatibilité commerciale | **Point ouvert — voir §4** | — |

### Option B — Agisoft Metashape, *Service Provider License*

| Critère | Constat | Preuve |
|---|---|---|
| Licence | Licence dédiée exigée pour un **service de traitement automatisé** — c'est exactement notre cas | [V] agisoft.com/buy/saas |
| Modèle 1 — *pay-per-use* | **Minimum 155,90 $/mois** ; facturation horaire dégressive au-delà de 100 h/mois | [V] |
| Modèle 2 — location | Licence annuelle, une machine à la fois, remises à partir de 3 licences | [V] |
| Licence de bureau (référence) | Professional 3 499 $, Standard 179 $, perpétuelle, *node-locked* — **ne couvre pas l'usage SaaS** | [V] |
| Déploiement | Auto-hébergé, exécution *headless*, API Python, serveur de licences réseau | [V] |
| Confidentialité | Totale, infrastructure ELSATIA | — |
| Précision / robustesse | Référence industrielle du secteur | [S] |
| Compatibilité commerciale | **Explicitement prévue par l'éditeur.** C'est son principal avantage sur A | [V] |

### Option C — Pix4D (PIX4Dengine Cloud API ou PIX4Dengine auto-hébergé)

| Critère | Constat | Preuve |
|---|---|---|
| Facturation cloud | Au **gigapixel traité (PGP)** — fonction du nombre d'images et de leur résolution | [V] support.pix4d.com |
| Obtention | Licence PIX4Dengine Cloud **uniquement via le service commercial** — pas de self-service | [V] |
| Déploiement | SDK exécutable sur notre infrastructure *ou* dans le cloud Pix4D | [V] |
| Éditeur | Suisse (Lausanne) — hors UE mais espace juridique proche, adéquation RGPD à instruire | — |
| Région d'hébergement du cloud Pix4D | `[?]` **non vérifié.** Bloquant §48 tant que non écrit noir sur blanc | `[?]` |
| Intérêt | Modèle au gigapixel = **coût proportionnel au revenu**, très aligné avec le modèle à crédits (§89) | — |

### Option D — RealityScan 2.x (ex-RealityCapture, Epic Games)

| Critère | Constat | Preuve |
|---|---|---|
| Licence | **Gratuit sous 1 M$ de CA annuel brut** ; au-delà, 1 250 $/siège/an (1 850 $ avec Unreal + Twinmotion) | [V] realityscan.com/license |
| Automatisation | Traitement en ferme de serveurs ajouté depuis la 2.0 | [S] |
| Plateforme | **Windows + GPU NVIDIA** | [S] |
| Verdict | **Piège économique et technique.** Le seuil de 1 M$ est précisément l'objectif commercial d'ELSATIA : construire le produit sur une gratuité qu'on prévoit de perdre est une dette. S'ajoute une dépendance Windows/CUDA étrangère à une pile Vercel + Supabase + Linux | — |

### Option E — Moteurs académiques bruts (COLMAP, OpenMVG/OpenMVS, Meshroom)

| Critère | Constat | Preuve |
|---|---|---|
| COLMAP | BSD, mais **certaines dépendances GPU sont restreintes** à l'usage éducatif, recherche et non lucratif sans autorisation de l'Université de Caroline du Nord | [V] via NodeCM |
| Intérêt | Aucun par rapport à A : ODM intègre déjà OpenMVS et fournit l'orthophoto, le MNS et une API. Repartir de COLMAP, c'est refaire ODM | — |
| Note | `uav4geo/NodeCM` expose COLMAP derrière l'API NodeODM — donc **compatible avec notre abstraction** si un besoin apparaît | [V] |

---

## 3. Synthèse

| | A — ODM | B — Metashape SPL | C — Pix4Dengine | D — RealityScan |
|---|---|---|---|---|
| Coût d'entrée | 0 € | ~156 $/mois plancher | Négocié | 0 € puis 1 250 $/siège |
| Coût marginal | GPU seul | GPU + heure de licence | Gigapixel | GPU seul |
| Hébergement UE | ✅ maîtrisé | ✅ maîtrisé | ⚠️ `[?]` si cloud | ✅ mais Windows |
| Licence SaaS claire | ❌ **à trancher** | ✅ | ✅ | ⚠️ seuil de CA |
| Confidentialité §47 | ✅ | ✅ | ⚠️ si cloud | ✅ |
| Maintenance | Élevée | Moyenne | Faible | Moyenne |
| Sortie du produit | Ortho + MNS + mesh | Ortho + MNS + mesh | Ortho + MNS + mesh | Mesh haute qualité |

---

## 4. L'arbitrage AGPL — à trancher par un juriste, pas par nous

ODM, NodeODM et WebODM sont sous **AGPL-3.0**, licence explicitement choisie par le projet
pour couvrir les usages de service cloud [V].

Le point à instruire : la clause réseau de l'AGPL impose de proposer le code source du
programme aux utilisateurs qui interagissent avec lui **à distance via un réseau**. La
question n'est donc pas « avons-nous modifié ODM » mais « nos clients interagissent-ils
avec ODM ». Deux lectures existent et nous n'avons pas qualité pour choisir :

- **Lecture favorable :** ELSATIA exécute NodeODM en processus séparé, sans le modifier ;
  le client interagit avec ELSATIA, qui appelle une API interne. L'obligation est
  satisfaite en offrant le code source amont, inchangé.
- **Lecture défavorable :** l'ensemble constitue un service unique rendu au client, et
  l'obligation s'étend plus largement.

**Actions, dans cet ordre :**

1. Ne modifier ODM sous aucun prétexte (tout patch aggrave la position).
2. Faire qualifier le montage par un conseil en propriété intellectuelle **avant** la
   première facturation d'une reconstruction.
3. Si le conseil est réservé : basculer sur l'option B. L'abstraction `MoteurReconstruction`
   rend ce basculement local.

Ce point est reporté au livrable 1 comme **décision bloquante avant commercialisation**,
pas avant développement : le MVP peut être construit et testé sur ODM pendant l'instruction.

---

## 5. Coût par reconstruction — méthode, pas chiffre

Le brief interdit d'inventer une valeur (§25, §46, §89). Voici donc la **méthode** et les
**ancrages tarifaires réels**, pas un résultat.

### Ancrages vérifiés le 2026-09-07

| Fournisseur | GPU | Prix horaire relevé | Région |
|---|---|---|---|
| Scaleway | L4 | à partir de **0,90 $/h** | France [V] |
| OVHcloud | A100 | **1,52–1,85 €/h** | Paris / Strasbourg / Gravelines [V] |
| OVHcloud | A100 | ~3,07 $/h (autre relevé) | — [S] |

Les deux fournisseurs sont français, ce qui satisfait §48 sans discussion.

### Formule

```
coût_reconstruction =
    (durée_gpu_h × prix_gpu_h)
  + (durée_licence_h × prix_licence_h)        // 0 en option A
  + (Go_stockés × prix_Go_mois × mois_rétention)
  + (Go_sortants × prix_egress)
```

### Ce qui manque, et qui ne s'obtient que par mesure

`durée_gpu_h` dépend du nombre d'images, de leur résolution, du recouvrement et de la
qualité demandée. **Aucune de ces valeurs ne peut être estimée honnêtement sans benchmark.**

**Campagne de mesure à exécuter avant toute grille tarifaire (lot P1) :** trois jeux
d'images réels — petite toiture (~80 photos), maison complète (~200 photos), grand bâtiment
ou façade (~500 photos) — passés sur une même machine GPU, en relevant durée, pic mémoire,
taille des sorties et échecs. Ce tableau à neuf cases est le seul fondement acceptable
d'un prix en crédits (§89).

**Tant que cette campagne n'a pas eu lieu, aucun `X crédits` ne doit apparaître nulle part.**

---

## 6. Points de vigilance produit

- **§49 — entraînement de tiers.** Les options A et B ne transmettent aucune donnée à
  l'extérieur : c'est un argument commercial différenciant, à formuler dans les CGU.
  Toute option cloud (C) exige d'obtenir par écrit l'engagement de non-réutilisation.
- **§77 — frames extraites de vidéo.** Elles peuvent être injectées dans n'importe lequel
  de ces moteurs, mais doivent rester marquées comme source dégradée jusqu'au bout de la
  chaîne de mesure. Le moteur ne fera pas cette distinction : c'est à ELSATIA de la porter.
- **§24 — niveaux de qualité.** Aucun de ces moteurs ne produit un « niveau de précision »
  utilisable tel quel. Ils fournissent des métriques (erreur de reprojection, GSD, nombre
  de caméras calibrées) à partir desquelles ELSATIA doit **définir** ses niveaux — après
  la campagne de validation métrologique §107.

---

## Sources

- [OpenDroneMap](https://www.opendronemap.org/) · [OpenDroneMap/ODM (GitHub)](https://github.com/opendronemap/ODM) · [catégorie ODM / annonces de licence](https://www.opendronemap.org/category/odm/)
- [uav4geo/NodeCM — pipeline COLMAP compatible API NodeODM](https://github.com/uav4geo/NodeCM)
- [Agisoft Metashape — SaaS](https://www.agisoft.com/buy/saas/) · [Service Provider License](https://www.agisoft.com/buy/saas/service-provider-license/) · [Licensing options](https://www.agisoft.com/buy/licensing-options/)
- [PIX4Dengine Cloud API — FAQ](https://support.pix4d.com/hc/en-us/articles/4402933393041-PIX4Dengine-Cloud-API-FAQ) · [PIX4Dengine](https://www.pix4d.com/product/pix4dengine)
- [RealityScan — licensing and pricing](https://www.realityscan.com/license)
- [Scaleway GPU pricing](https://gpus.io/en/providers/scaleway) · [OVHcloud GPU pricing](https://computecomparison.com/provider/ovhcloud)
