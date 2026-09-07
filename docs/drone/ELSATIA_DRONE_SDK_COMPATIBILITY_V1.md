# ELSATIA Drone — Matrice de compatibilité SDK V1

> Livrable 2 (§126 du brief). Aucun code, aucune migration.
> **Vérifications web effectuées le 2026-09-07.** Les SDK constructeurs évoluent vite :
> toute décision d'engagement matériel doit rejouer ces vérifications à la date de la décision.

## 0. Niveaux de preuve utilisés

| Marque | Signification |
|---|---|
| **[V]** | Vérifié le 2026-09-07 sur une source primaire (dépôt officiel, doc constructeur). |
| **[S]** | Source secondaire (presse spécialisée, intégrateur tiers, forum). Crédible, non contractuel. |
| **[?]** | **Non vérifié.** Aucune source atteinte. Ne pas décider sur cette ligne. |

Toute case **[?]** de ce document est une tâche de vérification, pas une hypothèse de travail.
La règle §8 du brief (« NE RIEN SUPPOSER ») est appliquée littéralement : une capacité non
prouvée est notée `[?]`, jamais « probablement oui ».

---

## 1. Conclusion opérationnelle (à lire en premier)

Trois faits verrouillent l'architecture, et aucun n'est négociable côté ELSATIA :

1. **Le DJI Mobile SDK V5 est une technologie Android uniquement.** [V]
   Il n'existe pas de MSDK V5 pour iOS. Le MSDK V4 iOS existe encore mais ne couvre
   aucun drone de la génération Mini 3 / Mini 4.
   → **Conséquence produit : sur iPhone/iPad, ELSATIA Drone ne pourra jamais piloter ni
   recevoir la télémétrie d'un DJI. iOS est une plateforme d'import, de visualisation,
   de mesure et de rapport.** Ce n'est pas un manque de la V1, c'est une propriété du SDK.

2. **Sur la gamme Mini, seules les radiocommandes SANS écran permettent une application
   tierce.** [S, convergent]
   Mini 3 / Mini 3 Pro → **DJI RC-N1 obligatoire**. Mini 4 Pro → **RC-N2 obligatoire**.
   Les radiocommandes à écran intégré (DJI RC, DJI RC 2) n'acceptent ni l'installation
   d'une application MSDK, ni le branchement d'un appareil Android externe.
   → **Conséquence : un client qui possède un Mini 3 « Fly More » avec DJI RC est
   matériellement hors de portée du mode connecté.** Le fallback import (§10 du brief)
   n'est pas un confort, c'est le mode d'usage majoritaire.

3. **Le Mini 3 Pro ne supporte pas les missions waypoint via MSDK.** [S]
   La seule automatisation de vol disponible est le *virtual stick* (envoi continu de
   consignes de manche), c'est-à-dire écrire soi-même la boucle de pilotage.
   → **Conséquence : le « Mission Planner » (§54) et la « mission toiture automatique »
   (§14) ne sont pas réalisables de façon fiable et juridiquement défendable sur le
   matériel du propriétaire.** §53 du brief tranche déjà : ne retenir l'automatisation
   que si le SDK la rend fiable. Elle ne l'est pas. Elle sort du MVP.

**Recommandation qui en découle : le MVP n'embarque aucun contrôle de drone.**
Elle est identique à la préférence exprimée en §109 et à la priorité §112. Le lot
« DroneAdapter DJI » est développable en parallèle mais ne conditionne aucune valeur métier.

---

## 2. État du DJI Mobile SDK au 2026-09-07

| Élément | Valeur | Preuve |
|---|---|---|
| Version courante MSDK V5 | **5.18.0** | [V] README `dji-sdk/Mobile-SDK-Android-V5` |
| Plateforme | **Android uniquement** | [V] dépôt et portail développeur |
| Android minimum | 10.0 pour appareil externe ; 5.0+ pour DJI Smart Controller | [S] portail développeur |
| MSDK V4 | Marqué « previous version ». Android + iOS. Ne couvre pas la génération Mini 3. | [V] portail |
| Distribution des artefacts | Maven Central, `com.dji:dji-sdk-v5-aircraft` | [V] |
| Clé applicative | App Key par application, **révocable à tout moment par DJI** | [V] DJI Developer Policy |
| Cadre contractuel | DJI EULA + DJI Developer Policy (obligation de politique de confidentialité liée dans l'app) | [V] developer.dji.com/policies |

### Aéronefs listés comme supportés par MSDK V5 [V]

Mavic 3TA · Matrice 400 · Matrice 4D Enterprise Series · **DJI Mini 4 Pro** ·
Matrice 4 Enterprise Series · H30 Series · **DJI Mini 3 Pro** · **DJI Mini 3** ·
Mavic 3 Enterprise Series · M30 Series · M300 RTK · Matrice 350 RTK.

Le support de la gamme Mini a été ajouté progressivement : Mini 3 / Mini 3 Pro en 2023,
Mini 4 Pro en mars 2025 [S]. **Être « dans la liste » ne signifie pas disposer de
l'intégralité des API** : la liste est un support d'aéronef, pas une matrice de fonctions.

---

## 3. Matrice de compatibilité — format demandé §126

Légende capacités : ✅ disponible · ⛔ indisponible / bloqué · ⚠️ disponible avec restriction
majeure · `[?]` non vérifié.

### 3.1 DJI Mini 3 — le matériel du propriétaire

| Champ | Valeur |
|---|---|
| Constructeur | DJI |
| Drone | **Mini 3** (non Pro), < 249 g |
| Radiocommande compatible MSDK | **DJI RC-N1 uniquement** (sans écran, smartphone externe) [S] |
| Radiocommande **incompatible** | DJI RC / DJI RC 2 (écran intégré) — n'installe pas d'app MSDK et n'accepte pas d'Android externe [S] |
| OS de l'application | **Android uniquement** [V] |
| iOS | ⛔ **Aucun support.** MSDK V5 n'a pas de version iOS [V] |
| SDK | MSDK V5 (≥ 5.7 pour la gamme Mini) [S] |
| Live video | `[?]` — le Mini 3 est dans la liste supportée [V], mais l'accès effectif au flux et le codec exposé ne sont **pas** vérifiés pour ce modèle précis |
| Telemetry | `[?]` idem — à valider par test matériel |
| Camera control | `[?]` — restrictions connues sur la gamme consumer [S], périmètre exact non vérifié |
| Gimbal control | `[?]` |
| Mission (waypoint) | ⛔ **Non supporté** sur Mini 3 Pro [S] ; Mini 3 : `[?]`, à considérer comme non supporté par défaut |
| Virtual stick | ⚠️ Seule voie d'automatisation citée pour Mini 3 Pro [S]. Implique d'écrire la boucle de contrôle, avec la responsabilité de sécurité associée |
| Media download | `[?]` |
| RTK / précision | ⛔ Aucun RTK. GNSS grand public |
| **Limitation dominante** | **Android + RC-N1 + aucune mission automatique.** Le Mini 3 est un excellent capteur d'images, un mauvais support de pilotage programmé |

### 3.2 DJI Mini 3 Pro

Identique à 3.1, sauf :

| Champ | Valeur |
|---|---|
| Mission (waypoint) | ⛔ **Confirmé non supporté via MSDK** ; virtual stick seul [S] |
| Statut historique | Premier drone consumer supporté sous MSDK V5 [S] |

### 3.3 DJI Mini 4 Pro

| Champ | Valeur |
|---|---|
| Radiocommande compatible MSDK | **RC-N2 uniquement** ; DJI RC 2 non supporté [S] |
| OS | Android uniquement [V] |
| Ajout au MSDK | mars 2025 [S] |
| Missions | `[?]` — ne pas présumer mieux que Mini 3 Pro |

### 3.4 Gamme Enterprise DJI (M30 / M300 RTK / M350 RTK / Matrice 4 / Mavic 3 Enterprise)

| Champ | Valeur |
|---|---|
| OS | Android [V] |
| RTK | ✅ sur M300/M350 RTK et Matrice 4D |
| Missions, contrôle caméra, charge utile | Périmètre nettement plus large — c'est la cible réelle du MSDK V5 |
| Radiocommande | DJI RC Plus (Android intégré) — **peut exécuter une application MSDK** [S] |
| Coût matériel | Ordre de grandeur : plusieurs milliers à plusieurs dizaines de milliers d'euros |
| Pertinence ELSATIA | Cible d'un client « bureau d'études / grand couvreur », pas de l'artisan. Voir §6 |

### 3.5 Alternative non-DJI — Parrot (constructeur français)

| Champ | Valeur | Preuve |
|---|---|---|
| Drones | ANAFI, ANAFI Thermal, ANAFI USA, **ANAFI Ai**, ANAFI UKR, CHUCK | [V] doc Parrot |
| SDK | Ground SDK, **Air SDK** (code embarqué sur le drone), **Olympe** (contrôleur Python, Linux), OpenFlight, PDrAW, Sphinx (simulateur) | [V] |
| Standards ouverts | **MAVLink et GUTMA** supportés | [V] |
| Accès | Portail développeur **libre, sans enregistrement ni tracking** | [V] |
| Photogrammétrie | Plans de vol photogrammétriques **exécutés automatiquement à bord** de l'ANAFI Ai | [V] doc produit Parrot |
| Souveraineté | Constructeur français, sujet RGPD/UE bien plus simple que DJI | — |
| Limite | Coût matériel très supérieur au Mini 3 ; parc installé chez les artisans BTP quasi nul | — |

**Lecture ELSATIA :** Parrot est techniquement le meilleur partenaire (SDK ouvert,
simulateur officiel, missions photogrammétriques natives, souveraineté). DJI est le
meilleur partenaire *commercial* (c'est ce que les clients possèdent déjà). Cette tension
est exactement ce que le `DroneAdapter` (§6) doit absorber : elle ne se tranche pas en V1.

### 3.6 Récapitulatif décisionnel

| Matériel | Mode connecté possible ? | Sur quel OS | Missions auto | Verdict MVP |
|---|---|---|---|---|
| Mini 3 + RC-N1 | Oui, partiellement | Android seul | Non | **Import après vol** |
| Mini 3 + DJI RC (écran) | **Non** | — | Non | **Import après vol, sans alternative** |
| Mini 4 Pro + RC-N2 | Oui, partiellement | Android seul | `[?]` | Import après vol |
| DJI Enterprise + RC Plus | Oui, largement | Android seul | Oui | Hors cible artisan |
| Parrot ANAFI Ai | Oui, largement | Linux/Android/embarqué | Oui, natif | Piste phase 3 |
| Tout autre drone | Non | — | — | **Import après vol** |

La colonne « Verdict MVP » ne comporte qu'une seule valeur pour la cible commerciale réelle :
**import après vol**. C'est la démonstration factuelle que la chaîne de valeur ELSATIA doit
être construite en aval de l'acquisition, pas autour du pilotage.

---

## 4. Scénarios de radiocommande (§9 du brief)

| Configuration | ELSATIA tourne dessus ? | Flux ? | Médias ? | Pilotage ? |
|---|---|---|---|---|
| RC-N1 / RC-N2 + smartphone Android du pilote | ✅ l'app tourne sur le smartphone | `[?]` via MSDK | `[?]` via MSDK, sinon copie SD | ⚠️ virtual stick seul |
| RC-N1 / RC-N2 + iPhone | ⛔ MSDK absent sur iOS | ⛔ | Copie manuelle uniquement | ⛔ |
| DJI RC / RC 2 (écran intégré) | ⛔ pas d'app tierce, pas d'Android externe | ⛔ | Copie manuelle uniquement | ⛔ |
| DJI RC Plus (Enterprise, Android intégré) | ✅ app installable | ✅ | ✅ | ✅ |
| Aucune radiocommande (post-vol) | ✅ web ou mobile | — | ✅ carte SD / dossier / smartphone | — |

---

## 5. Ce qui doit être vérifié avant d'écrire la moindre ligne de `DroneAdapter`

Tâches de levée des `[?]`, par ordre de coût croissant :

1. **Lire les notes de version MSDK 5.18.0** et la page officielle « What devices does
   Mobile SDK V5 support ». *Note : cette page du forum SDK DJI était en accès restreint
   le 2026-09-07 (redirection Zendesk) — un compte développeur DJI est nécessaire.*
2. **Créer un compte développeur DJI** et lire l'EULA + Developer Policy dans leur version
   applicable à une distribution commerciale européenne. Point contractuel à instruire :
   révocabilité de l'App Key, obligations de confidentialité, restrictions de redistribution.
3. **Test matériel réel** sur le Mini 3 du propriétaire + RC-N1 + un Android récent, avec
   l'application échantillon officielle : cocher une à une les lignes `[?]` du §3.1.
   C'est la seule preuve acceptable. Tout le reste est de la documentation.
4. Si et seulement si (3) est concluant : évaluer le plugin Capacitor natif (voir livrable 1, §D).

**Tant que (3) n'a pas été fait, aucune promesse de mode connecté ne doit apparaître
dans un support commercial ELSATIA.**

---

## 6. Risque fournisseur

DJI est un fournisseur unique, non contractuel (App Key révocable unilatéralement [V]),
soumis à des tensions géopolitiques persistantes affectant sa distribution occidentale.
Un produit ELSATIA dont la valeur dépendrait du MSDK serait exposé à une décision
d'un tiers sur laquelle ELSATIA n'a aucun levier.

C'est un argument technique de plus — indépendant de tous ceux du §1 — en faveur de
l'architecture retenue : **la valeur métier ELSATIA est produite en aval des photos, et
le mode connecté n'est qu'un confort d'acquisition.** Si DJI ferme le MSDK demain, le
produit continue de fonctionner.

---

## Sources

- [dji-sdk/Mobile-SDK-Android-V5 (GitHub)](https://github.com/dji-sdk/Mobile-SDK-Android-V5)
- [DJI Mobile SDK](https://developer.dji.com/mobile-sdk/)
- [DJI Mobile SDK tutorial / release notes](https://developer.dji.com/doc/mobile-sdk-tutorial/en/)
- [DJI Developer Policy](https://developer.dji.com/policies/developer/)
- [DJI End User License Agreement](https://developer.dji.com/policies/eula/)
- [Which RC supports MSDK in DJI Mini 3 series? — DJI SDK Forum](https://sdk-forum.dji.net/hc/en-us/articles/17524981906585-Which-RC-supports-MSDK-in-DJI-Mini-3-series) *(accès restreint le 2026-09-07)*
- [DJI Mobile SDK adds support for Mini 3, Mini 3 Pro drones — DroneDJ](https://dronedj.com/2023/04/13/dji-sdk-mini-3-pro/)
- [DJI Mini 4 Pro gains third-party app support — DroneDJ](https://dronedj.com/2025/03/21/dji-mini-4-pro-msdk/)
- [Tips for setting up an Android application with DJI Mini 3 Pro & MSDK v5.7.0 — CropCopter](https://medium.com/@cropcopter42/tips-for-setting-up-an-android-application-with-dji-mini-3-pro-dji-msdk-v5-7-0-ec0007f71b3b)
- [Parrot — Open source development tools](https://www.parrot.com/en/open-source-development-tools-2)
- [Parrot Olympe (GitHub)](https://github.com/Parrot-Developers/olympe)
- [Parrot ANAFI Ai — photogrammétrie](https://www.parrot.com/en/drones/anafi-ai/technical-documentation/photogrammetry)
