# ELSATIA Drone — Compatibilité SDK et matériel V1 (R2)

> Révision 2 de `ELSATIA_DRONE_SDK_COMPATIBILITY_V1.md` (2026-09-07).
> **Vérifications rejouées le 2026-09-08** sur sources primaires.
> Ce document **ne remplace pas** la V1 : il la re-valide, la corrige sur un point majeur
> (Parrot) et ajoute la voie DJI Cloud API. Lire les deux.

## 0. Niveaux de preuve

| Marque | Signification |
|---|---|
| **[V]** | Vérifié le 2026-09-08 sur une source primaire (dépôt ou documentation constructeur). |
| **[V-]** | Vérifié le 2026-09-07, non rejoué le 2026-09-08 (source devenue non atteignable). |
| **[S]** | Source secondaire crédible, non contractuelle. |
| **[?]** | **Non vérifié.** Ne pas décider sur cette ligne. |

Une case `[?]` est une tâche de vérification, jamais une hypothèse de travail. Un drone n'est
jamais déclaré compatible parce qu'il possède une caméra ou du Wi-Fi.

---

## 1. Ce qui a changé, ou pas, en 24 heures

| Affirmation de la V1 | État au 2026-09-08 |
|---|---|
| MSDK V5 en version 5.18.0 | **Confirmé** [V] — README `dji-sdk/Mobile-SDK-Android-V5`, branche `dev-sdk-main` |
| MSDK V5 Android uniquement | **Confirmé** [V] |
| Liste d'aéronefs MSDK V5 inchangée | **Confirmé** [V] — Mavic 3TA, Matrice 400, Matrice 4D Enterprise, **Mini 4 Pro**, Matrice 4 Enterprise, H30, **Mini 3 Pro**, **Mini 3**, Mavic 3 Enterprise, M30, M300 RTK, Matrice 350 RTK |
| Artefacts Maven `com.dji:dji-sdk-v5-aircraft` | **Confirmé** [V] — plus `-aircraft-provided` et `-networkImp` |
| « Parrot = alternative française » (§3.5) | **Insuffisant.** Corrigé au §3 ci-dessous |
| Voie DJI Cloud API | **Absente de la V1.** Ajoutée au §4 |

**La liste MSDK V5 est un support d'aéronef, pas une matrice de fonctions.** Y figurer ne
garantit ni le flux vidéo, ni la télémétrie, ni le téléchargement des médias pour ce modèle.

---

## 2. DJI — état au 2026-09-08

### 2.1 Faits

| Élément | Valeur | Preuve |
|---|---|---|
| MSDK V5 | **5.18.0** | [V] |
| Plateforme | **Android uniquement — pas d'iOS** | [V] |
| MSDK V4 | Android + iOS, ne couvre pas la génération Mini 3 | [V-] |
| Clé applicative | App Key par application, **révocable par DJI** | [V-] |
| Cadre contractuel | DJI EULA + Developer Policy | [V-] |
| Cloud API | Existe, cible **DJI Dock** et **DJI Pilot 2** ; téléversement média automatique ou manuel vers un serveur tiers ; déploiement Docker documenté | [V] |

### 2.2 Les trois verrous, inchangés

1. **Pas d'iOS.** Sur iPhone et iPad, ELSATIA Drone ne pilotera jamais un DJI et n'en recevra
   jamais la télémétrie. iOS est une plateforme d'import, de visualisation, de mesure et de
   rapport. Ce n'est pas un manque de V1 : c'est une propriété du SDK.

2. **Sur la gamme Mini, seules les radiocommandes sans écran acceptent une application
   tierce.** Mini 3 / Mini 3 Pro → **RC-N1**. Mini 4 Pro → **RC-N2**. Les radiocommandes à
   écran intégré (DJI RC, DJI RC 2) n'installent pas d'application MSDK et n'acceptent pas
   d'Android externe [S]. Un client équipé d'un Mini 3 « Fly More » avec DJI RC est
   **matériellement hors de portée du mode connecté**.

3. **Pas de mission waypoint sur Mini 3 Pro via MSDK** [S]. Seul le *virtual stick* est cité,
   c'est-à-dire écrire soi-même la boucle de pilotage, avec la responsabilité de sécurité
   correspondante. Le « planificateur de mission » et la « mission toiture automatique » ne
   sont donc **pas réalisables de façon défendable** sur ce matériel.

### 2.3 Ce que le Mini 3 permet réellement

| Champ | Valeur |
|---|---|
| Masse | < 249 g |
| Radiocommande MSDK | **RC-N1 uniquement** [S] |
| OS | Android uniquement [V] |
| iOS | ⛔ aucun support [V] |
| Live video | `[?]` — modèle listé [V], accès effectif et codec **non vérifiés** |
| Télémétrie | `[?]` — à valider par test matériel |
| Contrôle caméra / nacelle | `[?]` — restrictions connues sur la gamme grand public [S] |
| Mission waypoint | ⛔ à considérer comme non supporté |
| Téléchargement média | `[?]` |
| RTK | ⛔ aucun. GNSS grand public |

**Conclusion Mini 3 : excellent capteur d'images, mauvais support de pilotage programmé.**

---

## 3. Parrot — correction majeure de la V1

La V1 traitait Parrot en une ligne, comme « alternative non-DJI, constructeur français ».
C'est une sous-estimation qui a une conséquence produit directe.

### 3.1 Ce que Parrot publie réellement [V]

| SDK | Cible | Langage |
|---|---|---|
| **Ground SDK Android** | application station sol | Java |
| **Ground SDK iOS** | application station sol | **Swift** |
| **Olympe** | station sol bureau Linux | Python |
| **Air SDK** | application **embarquée dans le drone** | — |
| **Ground SDK Tools (PDrAW)** | lecture vidéo + métadonnées, bureau | — |
| **Sphinx** | simulateur de vol | — |
| **Drone Web API** | **REST + websocket** | — |

Ground SDK Android : **Android 10 (API 29) et plus**, distribué en AAR compilable, **licence
BSD-3**, avec guide d'installation, documentation d'API et application de démonstration [V].
Documentation en version 8.4.2 [V].

### 3.2 Pourquoi cela compte pour ELSATIA

Quatre écarts structurels avec DJI, tous favorables :

1. **iOS existe.** Ground SDK iOS en Swift est la **seule voie connue vers un mode connecté
   sur iPhone**. DJI ferme cette porte par construction.
2. **BSD-3, pas de clé révocable.** Les ressources sont libres, sans enregistrement ni
   traçage. Le risque « DJI révoque l'App Key » disparaît.
3. **Une Web API REST + websocket.** Une intégration serveur ne passant par aucun SDK mobile
   devient envisageable — voie qu'aucun produit DJI grand public n'offre.
4. **Air SDK embarqué.** Du traitement à bord est possible, ce qui n'existe pas côté DJI hors
   gamme Enterprise à charge utile.

### 3.3 ANAFI Ai — caractéristiques [V]

| Champ | Valeur |
|---|---|
| Masse au décollage | **898 g** |
| Capteur | 1/2" 48 Mpx CMOS |
| Photo | 48 Mpx (8000×6000) / 12 Mpx (4000×3000) |
| Vidéo | 4K UHD 3840×2160 |
| Modes photogrammétriques natifs | **grille simple, double grille, orbite** |
| Autonomie | 32 min max |
| Connectivité | bascule Wi-Fi ↔ **4G**, compatibilité LTE mondiale, authentification forte 4G |
| Évitement d'obstacles | caméras stéréoscopiques sur nacelle rotative 330° (−120° à +210°) |
| RTK | **non mentionné** dans la fiche technique `[?]` |
| Étiquette de classe européenne (C0–C4) | **non indiquée** dans la fiche `[?]` |

Les trois modes natifs — grille, double grille, orbite — sont **exactement** les
`FlightPattern` du noyau (`grid`, `double_grid`, `orbit`). La convergence n'est pas fortuite :
ce sont les trois figures de la photogrammétrie de bâtiment.

Deux points restent `[?]` et **doivent être levés avant tout engagement** : la classe C
européenne (elle commande la sous-catégorie de vol autorisée, donc la distance aux tiers) et
le RTK (il commande le niveau de qualité `rtk_gcp_controlled`).

### 3.4 Ce que ce document ne dit pas

Il ne dit **pas** qu'il faut basculer sur Parrot. Il dit que la V1 a comparé un SDK verrouillé
à un SDK qu'elle n'avait pas regardé, et que l'écart mérite un test matériel avant qu'un
arbitrage soit possible. Le parc installé chez les artisans est massivement DJI : c'est un
argument commercial fort en face, et il ne se règle pas sur documentation.

---

## 4. Autel

| Élément | Valeur | Preuve |
|---|---|---|
| Mobile SDK V1 | EVO I & EVO II | [S] |
| Mobile SDK V1.5 | EVO II V3 | [S] |
| Mobile SDK V2.0 | **EVO MAX 4T / 4N**, publié le 2023-07-31 | [S] |
| Plateformes | dépôts d'exemple **Android et iOS** (`AndroidSample`, `iOS_SdkSample`) | [S] |
| Portail | `developer.autelrobotics.com` | [S] |

Autel a donc, comme Parrot et contrairement à DJI, une voie iOS. Le parc installé BTP français
est en revanche marginal. **Ligne à ne pas engager sans demande client réelle.**

---

## 5. Matrice de compatibilité — quatre familles, pas deux

| Famille | Compatibilité |
|---|---|
| **Compatibilité prouvée** | *Aucune ligne.* Aucun test matériel n'a été exécuté. Cette case est vide et doit le rester tant qu'elle l'est |
| **Compatibilité probable à tester** | DJI Mini 3 / Mini 3 Pro / Mini 4 Pro **avec RC-N1/RC-N2 + Android 10+** ; DJI Enterprise (M30, M300 RTK, M350 RTK, Mavic 3E, Matrice 4/400) ; Parrot ANAFI Ai via Ground SDK Android **ou iOS** ; Autel EVO MAX via MSDK V2 |
| **Import seulement** | Tout DJI avec radiocommande à écran (DJI RC, RC 2) ; **tout matériel sur iPhone/iPad** ; tout drone d'un constructeur sans SDK ; appareils photo ; smartphones ; caméras |
| **Non compatible (mode connecté)** | Drones sans SDK public. Un Wi-Fi et une caméra ne constituent pas une compatibilité |

---

## 6. Les sept voies d'acquisition, classées

Le brief demandait une architecture prioritaire par SDK. **L'audit ne la confirme pas comme
voie principale**, et le lot du 2026-09-07 avait déjà tranché dans le même sens.

| # | Voie | Couverture du parc | Effort | Verdict |
|---|---|---|---|---|
| 1 | **Import manuel guidé** (carte mémoire, téléphone, USB, partage système) | **100 %** | Faible | **Mode nominal V1** |
| 2 | **Dossier surveillé / import par lot** bureau | Élevée | Faible | V1 |
| 3 | **DJI Cloud API** (Pilot 2 / Dock → serveur ELSATIA) | Enterprise seulement | Moyen | V2, si demande Enterprise |
| 4 | **Parrot Drone Web API** (REST + websocket) | Parc Parrot | Moyen | V2, à tester |
| 5 | **Ground SDK Parrot** (Android **et iOS**) | Parc Parrot | Élevé | V2/V3 |
| 6 | **MSDK V5 DJI** (Android + RC sans écran) | Fraction du parc DJI | **Élevé** | V3, non bloquant |
| 7 | **Wi-Fi brut vers le drone** | — | — | **Écartée.** Non documentée, non supportée, non défendable |

L'ordre est commandé par une seule question : *quelle fraction du parc réel chaque voie
atteint-elle par euro investi ?* Le SDK arrive dernier parce qu'il coûte le plus cher et
atteint le moins de clients.

**Même sans aucun SDK, le produit fonctionne** : vol avec l'application officielle du
constructeur, puis import guidé, rattachement à la mission, lecture des métadonnées EXIF
disponibles. C'est le parcours que le prototype `drone-photogrammetry` implémente déjà
(téléversement repris, sha256, déduplication, lecteur EXIF autonome).

---

## 7. À vérifier avant d'écrire la première ligne de `DroneAdapter`

1. **Test matériel Mini 3 + RC-N1 + Android 10+** : le flux vidéo est-il réellement accessible,
   dans quel codec, la télémétrie est-elle exposée, les médias sont-ils téléchargeables ?
2. **Classe C européenne de l'ANAFI Ai** — commande la sous-catégorie de vol.
3. **RTK sur ANAFI Ai** — commande le niveau `rtk_gcp_controlled`.
4. **Conditions de la DJI Developer Policy** sur un usage commercial en marque blanche.
5. **Conditions de la licence BSD-3 de Parrot** appliquée à une distribution en magasin
   d'applications.
6. **Périmètre exact de la DJI Cloud API sans DJI Dock** : Pilot 2 seul suffit-il ?

Aucune de ces six vérifications n'est un développement. Aucune ne peut être remplacée par de
la documentation.

---

## 8. Risque fournisseur

| Risque | Portée | Atténuation |
|---|---|---|
| DJI révoque l'App Key | Mode connecté DJI mort du jour au lendemain | Import nominal ⇒ perte de confort, pas de produit |
| DJI change de politique développeur | idem | idem |
| Restrictions commerciales visant DJI (marchés publics, sécurité) | Peut rendre DJI inéligible chez certains clients | **Parrot, constructeur européen, devient un argument, pas un repli** |
| Parrot cesse la gamme professionnelle | Voie iOS connectée perdue | Import nominal |
| Autel indisponible en Europe | Marginal | Aucune |

**Le seul choix qui neutralise les cinq lignes est de faire de l'import le mode nominal et du
SDK une option.** C'est la position du lot du 2026-09-07 ; l'audit du 2026-09-08 la confirme.

---

## Sources (consultées le 2026-09-08)

- [dji-sdk/Mobile-SDK-Android-V5 — README](https://github.com/dji-sdk/Mobile-SDK-Android-V5/blob/dev-sdk-main/README.md)
- [DJI Cloud API — documentation](https://developer.dji.com/doc/cloud-api-tutorial/en/)
- [DJI Cloud API — gestion des médias](https://developer.dji.com/doc/cloud-api-tutorial/en/feature-set/dock-feature-set/dock-media-management.html)
- [Parrot — index de la documentation SDK](https://developer.parrot.com/docs/index.html)
- [Parrot Ground SDK Android — vue d'ensemble](https://developer.parrot.com/docs/groundsdk-android/overview.html)
- [Parrot ANAFI Ai — spécifications techniques](https://www.parrot.com/en/drones/anafi-ai/technical-documentation/technical-specifications)
- [Autel Developer Technologies — Mobile SDK V2.0](https://developer.autelrobotics.com/version/v2)
