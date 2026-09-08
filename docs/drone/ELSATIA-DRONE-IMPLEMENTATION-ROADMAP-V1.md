# ELSATIA Drone / Scan — Feuille de route V1

> 2026-09-08. Complète `ELSATIA_DRONE_MVP_ROADMAP_V1.md` (2026-09-07) en tenant compte du
> Train V3, du cutover Production, d'ELSATIA-UI-V2 et de la décision Market.

---

## 0. Ce qui bloque, et qui n'est pas du développement

| Blocage | Nature | Qui le lève | Bloque |
|---|---|---|---|
| **Avis PI sur l'AGPL-3.0 d'OpenDroneMap** | Juridique | Conseil en propriété intellectuelle | Toute reconstruction ODM commerciale |
| **Campagne métrologique** | Terrain | ELSATIA + géomètre | Tout seuil, toute annonce de précision, tout métré vendu |
| **Benchmark de reconstruction** | Mesure | ELSATIA | Tout prix de traitement |
| **Test matériel Mini 3 + RC-N1** | Terrain | ELSATIA | Toute promesse de mode connecté |
| **Chiffrage d'hébergement GPU + stockage** | Achat | ELSATIA | Tout stockage inclus, tout tarif |
| **Socle multiproduit du Train V3** | Interne | Train V3 | **Tout développement Drone** |
| **ELSATIA-UI-V2** | Interne | Lot UI-V2 | Tout écran définitif |
| **Arbitrage du nom** | Décision | Julien | `code` applicatif, sous-domaine, site |

**Six des huit lignes ne se lèvent pas en écrivant du code.** C'est le fait dominant de cette
feuille de route : Drone n'est pas bloqué par sa difficulté technique, il est bloqué par des
décisions et des mesures qui n'ont pas été prises.

---

## 1. Ordonnancement face au reste de l'écosystème

```
Train V3 (socle multiproduit, prix contractuel)   ──┐
Cutover Production                                 ──┼──> PRÉALABLES
ELSATIA-UI-V2                                      ──┘
                                                      │
                        ┌─────────────────────────────┘
                        ▼
     Lots Drone L1 → L5   (autonome, sans photogrammétrie)
                        │
                        ├──> L6 → L8   (ponts écosystème)
                        └──> L9 → L11  (traitement, si avis PI favorable)
```

**Ce qui peut commencer maintenant, sans toucher au Train V3 :** rien qui produise du SQL.
Les lots L0 ci-dessous sont hors code et parallélisables **cette nuit même**.

---

## 2. Lots

### L0 — Préalables hors développement *(parallélisable immédiatement)*

| Sous-lot | Contenu | Critère d'acceptation |
|---|---|---|
| L0.1 | Saisine du conseil PI (dossier déjà prêt dans `ODM_LICENSE_RISK.md`) | Avis écrit |
| L0.2 | Campagne métrologique — 3 scènes, vérité terrain, 9 reconstructions | Seuils **mesurés** |
| L0.3 | Test matériel Mini 3 + RC-N1 + Android 10+ | Matrice SDK passée de `[?]` à `[V]` ou `⛔` |
| L0.4 | Chiffrage hébergement GPU + stockage (Scaleway, OVH) | Coût par reconstruction, coût au To |
| L0.5 | Arbitrage du nom Drone / Scan | `code` applicatif décidé |
| L0.6 | Classe C et RTK de l'ANAFI Ai | Deux `[?]` levés |

**Aucun de ces six sous-lots ne touche au dépôt.** Ils peuvent tous avancer pendant le
Train V3.

### L1 — Socle applicatif *(après Train V3 et UI-V2)*

Enregistrement de l'application dans `applications_elsatia` + rôles · migration des entités
du noyau · RLS multi-tenant · écrans projet/liste/détail sur la cible UI-V2.
**Critères :** isolation prouvée par pgTAP · un projet créé sans client ni chantier · aucun
écran hérité de l'UI actuelle.

### L2 — Import et médias

Import guidé (fichiers, dossier, partage système) · téléversement par morceaux reprenable ·
sha256 · déduplication intra-projet · EXIF · contrôle qualité · vignettes · corbeille.
**Critères :** 200 photos importées sans doublon · reprise après coupure au morceau ·
original immuable · aucun nom de fichier client dans un chemin.
*Le prototype couvre déjà l'essentiel de la logique — il reste à la brancher.*

### L3 — Organisation, inspection, annotation

Zones, lots, dates · calques d'annotation · comparaison avant/après · gravité et type de
désordre.
**Critères :** l'original n'est jamais réécrit · deux annotations concurrentes coexistent.

### L4 — Mesure niveau ≤ 4

Mesure sur image calibrée · mise à l'échelle par distance connue ou marqueur · provenance et
qualité portées jusqu'à l'affichage · **refus** de produire une quantité sans mise à l'échelle.
**Critères :** une mesure de niveau ≤ 3 ne peut pas être marquée « retenue » · aucun seuil
codé tant que L0.2 n'a pas rendu ses mesures.

### L5 — Rapports et hors-ligne

Rapport versionné, empreinte, pièces figées, destinataires figés, lien expirant, journal de
consultation · file hors-ligne idempotente sur le patron de la migration 273.
**Critères :** les **sept scénarios** de `ELSATIA-DRONE-OFFLINE-MEDIA-SYNC-V1.md` §9 verts en
E2E, réseau réellement coupé.

> **Fin de L5 = produit vendable.** Autonome, sans photogrammétrie, sans SDK, sans IA.

### L6 — Pont Gestion Pro · L7 — Pont Réserves · L8 — Pont DOE

Voir `ELSATIA-DRONE-GP-RESERVES-DOE-BRIDGES-V1.md` §8 pour l'ordre et les conditions.
L6 exige L0.2 pour les quantités. L8 exige que le DOE et la bibliothèque technique soient
fermés.

### L9 — Infrastructure de traitement *(si et seulement si L0.1 est favorable)*

File distribuée · worker · GPU · reprise · lettre morte · quotas.
**Le poste le plus lourd et le plus incertain du produit.** Il n'existe rien dans le dépôt.

### L10 — Reconstruction · L11 — Mesure niveau 5

L10 branche le moteur retenu. L11 ouvre le calage RTK/GCP et le niveau `rtk_gcp_controlled`.
**L11 exige au moins trois points de calage répartis, et doit refuser en dessous.**

### L12 — Import de modèle externe *(déplaçable très tôt)*

Import nuage / orthophoto / maillage produits ailleurs, avec provenance `imported`.
**Douze formats sont déjà détectés par signature dans le prototype.** Ne dépend d'aucune
licence, d'aucun GPU, d'aucun avis juridique. **Candidat au rattachement à L4.**

### L13 — IA optionnelle

Uniquement les fonctions locales du §7.1 du document mesure (doublons, sélection, floutage).
**Détection de défauts et suggestion de réserves hors périmètre.**

### L14 — Mode connecté *(si L0.3 est concluant)*

Parrot d'abord — Ground SDK Android **et iOS**, Web API REST. DJI ensuite, Android seulement.
**Ne conditionne aucune valeur métier.**

---

## 3. Ce qui n'est pas au programme

Pilotage automatique · missions waypoint · certification de mesure · portail client dédié ·
partage inter-tenant · encaissement pour un prestataire · détection automatique de désordres ·
calepinage photovoltaïque automatique · cartographie des zones de restriction embarquée.

Chacun est refusé pour une raison écrite ailleurs dans ce lot, pas par prudence générale.

---

## 4. Parallélisation

| Peut avancer en parallèle | Doit attendre |
|---|---|
| **L0.1 à L0.6** — dès maintenant | L1 attend Train V3 **et** UI-V2 |
| L2 et L3 après L1 | L4 attend L2 |
| L12 dès L2 | L5 attend L3 et L4 |
| L6/L7/L8 après L5, entre eux indépendants | L9 attend L0.1 **favorable** |
| L13 après L2 | L10 attend L9 ; L11 attend L10 **et** L0.2 |

---

## 5. Risques

| Risque | Probabilité | Impact | Traitement |
|---|---|---|---|
| Avis PI défavorable sur l'AGPL | Moyenne | Élevé | Metashape en repli, **substitution déjà prouvée par test** |
| Coût GPU rendant le modèle non rentable | **Moyenne** | Élevé | Vendre le socle sans traitement (modèle B) |
| Précision mesurée insuffisante pour le métré | **Moyenne** | Élevé | Le produit reste vendable en inspection et rapport |
| Test matériel Mini 3 négatif | **Élevée** | **Faible** | L'import est déjà le mode nominal |
| DJI révoque ou restreint | Moyenne | Faible | Idem, et Parrot devient un argument européen |
| Retard du Train V3 | — | Élevé | Décale tout — les L0 avancent quand même |
| Stockage non maîtrisé | **Élevée** | Élevé | Quotas, stockage froid, vidéo découragée, purge |
| Duplication du référentiel produit | Moyenne | Moyen | **Interdiction écrite** : texte libre marqué « observé », jamais de table concurrente |
| Dette de provenance Tools ↔ Drone | Certaine | Moyen | `packages/mesure-provenance` le jour où les deux alimentent le même métré |

---

## 6. Estimation

Estimation **indicative**, pour une personne, préalables hors développement exclus.

| Lot | Estimation | Confiance |
|---|---|---|
| L1 | 2–3 semaines | Bonne |
| L2 | 2–3 semaines | **Bonne** — le prototype existe |
| L3 | 2 semaines | Bonne |
| L4 | 2–3 semaines | Moyenne |
| L5 | **3–4 semaines** | Moyenne — le hors-ligne coûte toujours plus que prévu (Réserves : V4 → V6) |
| **Sous-total produit vendable (L1→L5)** | **11–15 semaines** | Moyenne |
| L6+L7+L8 | 4–6 semaines | Moyenne |
| L9 | **6–10 semaines** | **Faible — rien n'existe** |
| L10+L11 | 4–8 semaines | Faible |
| L12 | 1 semaine | Bonne |
| L13 | 2 semaines | Moyenne |
| L14 | **8–16 semaines** | **Très faible — dépend d'un test matériel non fait** |

**Le chemin le plus court vers un produit vendable est L1 → L5, sans photogrammétrie, sans
SDK, sans IA.** C'est aussi celui dont l'estimation est la plus fiable, parce qu'il ne
dépend d'aucune inconnue externe.
