# ELSATIA Drone — Roadmap MVP V1

> Livrable 5 (§129 du brief). Aucun code, aucune migration.
> Découpage en lots parallélisables, avec critères d'acceptation.

## 0. Ce que cette roadmap ne contient pas

**Aucune date, aucune estimation en jours.** Trois raisons factuelles :

1. Le lot Drone est en **exploration**, non planifié, et non arbitré face à ELSATIA-UI-V2
   (refonte visuelle obligatoire avant commercialisation) ni au cutover Production.
2. Le poste le plus lourd — worker GPU et reconstruction — n'a **aucun précédent dans le
   dépôt** : il n'y a aujourd'hui ni file de jobs, ni worker, ni GPU. Estimer sans repère
   produirait un chiffre faux.
3. Plusieurs prérequis sont des vérifications externes (test matériel DJI, conseil PI sur
   l'AGPL, confirmation DGAC) dont la durée ne dépend pas de nous.

Le dimensionnement relatif est donné en **S / M / L / XL**, ce qui suffit à séquencer sans
inventer un calendrier.

---

## 1. Prérequis hors développement

À lever en parallèle du P0 — aucun ne le bloque, tous bloquent la commercialisation.

| # | Prérequis | Bloque | Livrable de référence |
|---|---|---|---|
| PR-1 | **Conseil PI sur l'AGPL-3.0 d'ODM** | La première facturation d'une reconstruction | [Photogrammétrie §4](ELSATIA_DRONE_PHOTOGRAMMETRY_OPTIONS_V1.md) |
| PR-2 | **Test matériel Mini 3 + RC-N1 + Android** | Toute la phase 2, et toute promesse de mode connecté | [SDK §5](ELSATIA_DRONE_SDK_COMPATIBILITY_V1.md) |
| PR-3 | **Compte développeur DJI + lecture EULA/Developer Policy** | Idem PR-2 | [SDK §2](ELSATIA_DRONE_SDK_COMPATIBILITY_V1.md) |
| PR-4 | **Confirmation DGAC** de l'évolution C0/C1 en agglomération au 01-01-2026 | Tout argument commercial « vol en ville » | [Architecture §O.5](ELSATIA_DRONE_ARCHITECTURE_MVP_V1.md) |
| PR-5 | **Confirmation de la région du projet Supabase** | L'engagement d'hébergement UE (§48) | [Architecture §O.3](ELSATIA_DRONE_ARCHITECTURE_MVP_V1.md) |
| PR-6 | **Arbitrage de priorité** Drone vs UI-V2 vs cutover | **Le démarrage de tout code** | — |
| PR-7 | **Budget de la campagne de validation métrologique** | Tout claim de précision (§107, §108) | — |

**PR-6 est le seul prérequis qui bloque le P0.** Les six autres se lèvent en parallèle.

---

## 2. P0 — MVP livrable

Objectif : **un professionnel importe ses photos et repart avec un rapport de toiture
chiffré.** Aucun drone connecté. C'est la formulation opérationnelle du §112.

| Lot | Contenu | Taille | Conversation | Dépend de |
|---|---|---|---|---|
| **P0-1** | Squelette `apps/drone` : Next.js + Capacitor, accès via `a_acces_application(entreprise_id,'drone')`, navigation, PWA offline | M | C1 | PR-6 |
| **P0-2** | Import de médias : sources SD / dossier / téléphone, validation MIME et taille | M | C2 | P0-1 |
| **P0-3** | EXIF : extraction complète, **conservation intégrale**, dénormalisation date/GPS/focale/orientation | S | C2 | P0-2 |
| **P0-4** | Contrôle qualité médias : flou, exposition, doublons, GPS manquant, résolution — **avant upload** | M | C2 | P0-3 |
| **P0-5** | Upload TUS reprenable + checksum + déduplication + reprise après coupure | L | C2 | P0-2 |
| **P0-6** | File de jobs, worker, retries, dead-letter, idempotence, observabilité et coût par job | **XL** | C3 | conventions P0-5 |
| **P0-7** | `AdaptateurODM` + `MoteurReconstruction` : nuage, maillage, texture, **orthophoto**, MNS, GLB allégé | L | C3 | P0-6 |
| **P0-8** | Viewer 3D (rotation, zoom, pan, sélection) + **vue plan/ortho liée** avec sélection synchronisée | L | C4 | fixtures |
| **P0-9** | Snap 3D (sommet, arête, plan, intersection) + mesures manuelles (distance, polyligne, surface, angle, pente, hauteur, dénivelé) | L | C4 | P0-8 |
| **P0-10** | **Provenance et qualité** portées par chaque valeur, du calcul au PDF ; incertitude affichée comme inconnue tant que PR-7 n'a pas eu lieu | M | C4 | P0-9 |
| **P0-11** | Pans : **saisie manuelle assistée sur orthophoto**, correction, surfaces, pentes, azimuts | L | C4 | P0-9 |
| **P0-12** | Rapport PDF client | M | C4 | P0-11 |
| **P0-13** | Solar Designer simple : un pan, un panneau, portrait/paysage, marges paramétrées, obstacles, comptage et puissance | L | C4 | P0-11 |
| **P0-14** | Exports MVP : **PDF + CSV + GLB**, plus DXF si le coût le permet | M | C4 | P0-12 |
| **P0-15** | **`AdaptateurDemo`** — données synthétiques marquées DEMO en permanence, pour la revue Apple/Google | S | C1 | P0-1 |
| **P0-16** | Suppression projet + médias + résultats + exports, **avec propagation stockage et jobs** | M | C2 | P0-5 |
| **P0-17** | Quotas, rétention, purge | M | C2 | P0-16 |

**P0-6 est le lot critique.** Il ne ressemble à rien de ce que le dépôt contient déjà.
Poser très tôt un jalon minimal — *un job vide traverse la file de bout en bout et remonte
son statut* — avant d'y brancher quoi que ce soit de photogrammétrique.

**P0-11 avant toute détection automatique.** Un outil manuel correct est utilisable dès le
premier jour ; une détection automatique médiocre détruit la confiance dans l'ensemble du
produit (§22, §J de l'architecture).

### Critères d'acceptation du P0

Le MVP est livrable quand **tous** ces énoncés sont vrais :

- [ ] Un utilisateur sans aucune autre application ELSATIA fait le parcours complet, de
      l'import au PDF. **Test standalone §43.**
- [ ] Une base Drone dont toutes les colonnes `source_app` / `reference_externe` sont
      nulles fonctionne à 100 %.
- [ ] Aucune surface, pente ou longueur n'est affichée sans sa nature (`MESURÉ` / `CALCULÉ`
      / `ESTIMÉ`) et son niveau de qualité.
- [ ] Aucune incertitude chiffrée n'est affichée nulle part tant que PR-7 n'a pas produit
      de données. **§25.**
- [ ] Toute frame extraite d'une vidéo reste marquée comme source dégradée jusque dans le PDF.
- [ ] Un upload interrompu à 60 % reprend sans réenvoyer les 60 % déjà transmis.
- [ ] Un job relancé avec des entrées identiques ne produit pas un second résultat.
- [ ] Un job en échec finit en dead-letter, jamais en boucle.
- [ ] Le coût estimé de chaque reconstruction est enregistré et consultable.
- [ ] Un examinateur de store parcourt l'application sans posséder de drone.
- [ ] Aucune donnée client ne sort de l'UE.
- [ ] La suppression d'un projet ne laisse aucun objet orphelin dans les buckets.
- [ ] **Aucun support commercial ne comporte de claim de précision.** §108.

---

## 3. P1 — Consolidation et mise en marché

| Lot | Contenu | Taille | Dépend de |
|---|---|---|---|
| P1-1 | **Campagne de benchmark GPU** : petite toiture / maison / grand bâtiment, durée, mémoire, tailles, échecs | M | P0-7 |
| P1-2 | **Modèle tarifaire** abonnement + crédits, adossé à P1-1 | M | P1-1 |
| P1-3 | Enregistrement de l'application dans le socle : ligne `applications_elsatia`, quatre rôles, policies RLS, tests pgTAP — **migration post-cutover** | M | cutover exécuté |
| P1-4 | **Campagne de validation métrologique** : drone vs laser/station, écart moyen, écart max, cas limites | L | P0-11, PR-7 |
| P1-5 | **Définition des quatre niveaux de qualité** (indicatif / standard / haute précision / RTK-GCP) à partir des résultats de P1-4 | M | P1-4 |
| P1-6 | Points de contrôle et échelle connue (§26) | M | P0-9 |
| P1-7 | Contrats `packages/drone-contracts` + export vers Gestion Pro, Tools, Réserves | M | P0-14 |
| P1-8 | Partage client en lecture seule, sans fichiers bruts ni coordonnées sensibles | M | P0-12 |
| P1-9 | Floutage manuel | S | P0-4 |
| P1-10 | Plan toiture (§65) et coupe / profil (§66) | L | P0-11 |
| P1-11 | Inspection : anomalies, catégories, priorités, rapport dédié | L | P0-8 |
| P1-12 | Historique complet des événements projet (§59) | M | P0-10 |

**P1-4 puis P1-5 conditionnent tout le discours commercial.** Avant eux, ELSATIA Drone est
un outil de relevé ; après eux seulement, il peut être présenté comme un outil de métré
professionnel. C'est l'application stricte de §107 et §108.

---

## 4. P2 — Mode connecté et extension

| Lot | Contenu | Taille | Dépend de |
|---|---|---|---|
| P2-1 | `DroneBridge` : plugin Capacitor natif **Android**, vidéo sur surface native, pont JS réservé aux événements légers | XL | PR-2, PR-3 |
| P2-2 | `AdaptateurDJI` : connexion, télémétrie, batterie, état caméra/gimbal | L | P2-1 |
| P2-3 | Transfert de médias depuis le drone ou la radiocommande, avec progression | M | P2-2 |
| P2-4 | **Contrôle de couverture** — pourcentage issu d'un calcul réel, jamais d'une estimation d'affichage (§15) | L | P0-7 |
| P2-5 | Mission assistée — **uniquement si PR-2 démontre une fiabilité suffisante**. Sinon abandonné, sans regret | L | PR-2 |
| P2-6 | Mission Planner (§54) | L | P2-5 |
| P2-7 | `MissionCompliance` : affichage des zones officielles `cartes.gouv.fr`, **avec leurs limites documentées affichées** | M | PR-4 |
| P2-8 | Écran de responsabilité télépilote avant mission assistée (§51) | S | P2-5 |
| P2-9 | Détection automatique des pans — **après** que P0-11 ait prouvé la valeur du manuel | XL | P0-11 |
| P2-10 | Extraction de frames vidéo, marquées source dégradée | M | P0-4 |
| P2-11 | Relevé façade et orthophoto de façade | L | P0-7 |

**P2-5 est explicitement abandonnable.** Si le test PR-2 confirme l'absence de missions
waypoint sur la gamme Mini, ce lot ne se contourne pas par du *virtual stick* maison :
on écrirait la boucle de pilotage d'un aéronef, avec la responsabilité de sécurité qui va
avec, pour une fonction que §112 classe comme non prioritaire.

---

## 5. Hors MVP — architecture préparée, développement non engagé

| Sujet | Brief | Condition de réouverture |
|---|---|---|
| Thermographie | §35 | Matériel compatible chez des clients réels |
| RTK / PPK | §69, §70 | Passage à une gamme professionnelle |
| Ombrage solaire | §31 | Validation scientifique du moteur — jamais approximatif |
| IA visuelle « Vision Assistant » | §83 | Volume de données annotées suffisant. Sorties toujours `PROPOSITION` / `À VALIDER` |
| Floutage automatique visages et plaques | §47 | Et jamais présenté comme parfait |
| Viewer de nuage de points | §71 | Évaluation des performances mobiles |
| Volumétrie, terrassements, stockpiles, carrières | §79, §80 | Demande client avérée |
| Comparaison temporelle J0 / J30 | §81 | P1-12 livré |
| Suivi de chantier périodique | §82 | Intégration Gestion Pro mûre |
| Autres constructeurs (Parrot, Autel) | §7 | Décision matérielle §U-5 |
| Simulateur de mission interne | §105 | Utile seulement si P2-5 est engagé |
| Exports DXF avancés, LAS/LAZ, GeoTIFF | §40 | Demande client. **Ne pas tout implémenter en V1** |
| Bascule de nom vers « ELSATIA Scan » | §2 | Ajout d'un autre moyen d'acquisition. Pas avant |

---

## 6. Stratégie de tests (§106)

| Niveau | Périmètre | Livré avec |
|---|---|---|
| **Unitaires** | Géométrie 3D, mesures, combinaison des provenances, calcul de qualité, implantation PV | P0-9 à P0-13 |
| **Intégration** | Upload et reprise, cycle de vie des jobs, idempotence, policies de stockage, RLS par entreprise | P0-5, P0-6 |
| **pgTAP** | Isolation locataire, rôles Drone, refus d'accès — **convention du dépôt, 54 fichiers existants** | P1-3 |
| **Matériel** | SDK sur Mini 3 + RC-N1 réels | PR-2, P2-1 |
| **Terrain** | Relevés drone comparés au laser / à la station | P1-4 |

Le test le plus important n'est aucun de ceux-ci. C'est le **test standalone** : installer
Drone sur un compte sans Gestion Pro, sans Tools, sans Réserves, et vérifier que le parcours
complet fonctionne. Il doit tourner en continu, dès P0-1, sinon l'adhérence s'installe sans
qu'on la voie.

---

## 7. Vue de séquencement

```
PR-6 (arbitrage priorité)
   │
   ▼
C1 ─ P0-1 ──────────────┬──── P0-15 (démo)
                        │
C2 ─ P0-2 ─ P0-3 ─ P0-4 ─ P0-5 ─ P0-16 ─ P0-17
                        │
C3 ─────── P0-6 ─ P0-7 ─┤          (lot critique, jalon « job vide » très tôt)
                        │
C4 ─ P0-8 ─ P0-9 ─ P0-10 ─ P0-11 ─ P0-12 ─ P0-13 ─ P0-14
                        │              (démarre sur fixtures, n'attend pas C3)
                        ▼
                    ═══ MVP ═══
                        │
              P1-1 ─ P1-2   (benchmark → prix)
              P1-4 ─ P1-5   (terrain → qualité)   ← condition du discours commercial
              P1-3          (migration, après cutover)
                        │
                        ▼
              P2 (mode connecté, sous réserve PR-2)
```

C4 travaille sur des **fixtures figées** de sorties de reconstruction. C'est ce qui permet
aux quatre conversations d'avancer réellement en parallèle au lieu de s'attendre sur le lot
le plus risqué.

---

## 8. Rappels permanents

- `supabase/migrations/**` est **gelé**. Ledger 263 jusqu'au cutover.
- `packages/application-access` est consommé, jamais modifié.
- `apps/tools` et `apps/colors` ne sont touchés par aucun lot Drone.
- Le moteur géométrique 2D de Tools n'est **pas** étendu en 3D.
- Aucune valeur affichée sans provenance. Aucune incertitude inventée. Aucun claim de
  précision avant la campagne terrain.
