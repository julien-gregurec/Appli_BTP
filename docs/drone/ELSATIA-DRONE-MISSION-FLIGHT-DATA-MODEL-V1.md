# ELSATIA Drone — Mission, vol et données V1

> Complète `ELSATIA_DRONE_DATA_MODEL_V1.md` (2026-09-07) et l'implémentation
> `packages/drone-core`. **Aucune migration, aucun numéro de ledger, aucun `.sql.proposed`.**

---

## 1. Ce qui est déjà décidé, et qu'on ne rouvre pas

Le noyau `@elsatia/drone-core` fixe déjà, en code testé :

- **`DroneProject`** — unité de travail et de facturation, 10 statuts, transitions validées ;
- **`DroneMission`** — **facultative**, 5 statuts dont `observed`, 5 figures de vol
  (`grid`, `double_grid`, `orbit`, `facade_sweep`, `free_flight`), points de passage,
  recouvrements, GSD cible, inclinaison de nacelle ;
- **`MediaAsset`** — 4 natures, sources d'acquisition, orientation, indicateurs de qualité,
  floutage appliqué ;
- **`TelemetrySample`** ;
- **`SurveyType`** — `roof`, `facade`, `photovoltaic`, `inspection`, `thermal`, `model_3d`,
  `other`.

**La transition `draft → media_imported` est le cœur du modèle** : elle garantit qu'un
utilisateur n'est jamais forcé de traverser un état de mission. Toute évolution qui la
supprimerait détruirait le mode nominal.

---

## 2. Les 14 états du brief, confrontés aux 10 du noyau

Le brief demande quatorze états. Le noyau en implémente dix. **Nous recommandons de ne pas
en ajouter dix mais deux**, et de porter le reste ailleurs.

| État demandé | Traitement recommandé |
|---|---|
| brouillon | `draft` ✔ |
| à préparer | `draft` — un projet sans mission *est* à préparer. État redondant |
| autorisations en attente | **Pas un état de projet** : un indicateur de complétude du dossier (§4). Un projet peut avancer pendant qu'une autorisation est en cours |
| prête | `mission_prepared` ✔ |
| reportée | **Nouvel état de mission** : `postponed` ⟵ à ajouter |
| annulée | `aborted` ✔ (mission) |
| en cours | `acquisition_in_progress` ✔ |
| capture interrompue | `aborted` + motif. Pas un état distinct |
| médias à importer | `acquisition_in_progress` ✔ — un vol fini dont rien n'est importé |
| analyse en cours | `reconstruction` ✔ |
| à vérifier | `quality_check` et `to_validate` ✔ (deux moments distincts) |
| rapport à valider | **Pas un état de projet** : un état du **rapport**, versionné (§7) |
| terminée | `validated` puis `report_generated` ✔ |
| archivée | `archived` ✔ |

**Deux ajouts seulement :**

1. `MissionStatus.postponed` — un report n'est ni un abandon ni une attente ; il porte une
   cause (météo, accès, autorisation) qui a une valeur d'exploitation réelle.
2. Un champ `abort_reason` sur la mission, obligatoire si `aborted`.

**Justification du refus des huit autres :** une machine à états dont les états encodent la
complétude d'un dossier ou l'avancement d'un document devient incohérente dès qu'un projet est
dans deux situations à la fois — ce qui est le cas normal (autorisation en attente **et**
médias déjà importés). La complétude se calcule, elle ne se stocke pas comme état.

---

## 3. Champs de mission — ce qui manque au noyau

`DroneMission` décrit les **paramètres d'acquisition**. Le brief demande le **dossier
d'intervention**, qui est autre chose. Recommandation : ne pas gonfler `DroneMission`, mais
introduire une entité distincte.

### `MissionDossier` — proposition (aucune table créée par ce lot)

| Groupe | Champs |
|---|---|
| Rattachement | `project_id`, `mission_id` (nullable), `entreprise_id` |
| Client / chantier | `client_ref` (`ExternalReference`, **nullable**), `chantier_ref` (**nullable**), adresse libre, position WGS84 |
| Personnes | `responsable_id`, `telepilote_id` (nullable), `observateur_id` (nullable), prestataire externe (texte + contact) |
| Créneau | `date_prevue`, `creneau_debut`, `creneau_fin`, `date_reelle` |
| Matériel | `device_id` (nullable), numéro de série déclaré, batteries déclarées, version de firmware déclarée |
| Cadre | `categorie_operation` (`ouverte_a1`, `ouverte_a2`, `ouverte_a3`, `specifique_sts01`, `specifique_sts02`, `specifique_autorisation`, `sans_vol`), numéro d'exploitant, référence d'assurance, référence d'autorisation |
| Conditions | météo déclarée, vent déclaré, visibilité, note de terrain |
| Checklist | `checklist_id`, `checklist_complete` (booléen **calculé**), horodatage de complétude |
| Journal | append-only (§6) |

**Trois règles sur ces champs :**

1. **Tout ce qui vient du télépilote est `declare_`, pas `verifie_`.** L'application ne
   consulte aucun registre. Une assurance saisie est une assurance **déclarée**.
2. **`client_ref` et `chantier_ref` sont nullables et le resteront.** C'est la condition du
   mode autonome.
3. **`categorie_operation` inclut `sans_vol`** — quatorze des vingt-deux types de missions
   n'exigent aucun drone, et les forcer dans une catégorie de vol serait faux.

---

## 4. Préparation de vol — checklist

### 4.1 Position de principe

**L'application ne décide jamais d'un décollage.** Elle peut :

- afficher les points à vérifier ;
- calculer un pourcentage de complétude ;
- **bloquer une mission au statut `mission_prepared`** tant que les points bloquants ne sont
  pas cochés ;
- consigner qui a coché quoi et quand.

Elle ne peut pas : autoriser, interdire un vol, attester d'une conformité, ni se substituer
au responsable. Le blocage porte sur **un état applicatif**, pas sur un décollage.

### 4.2 Points

Trois niveaux : **B** bloquant (empêche `mission_prepared`), **A** avertissement, **I** information.

| Groupe | Point | Niveau |
|---|---|---|
| Télépilote | Identité désignée | **B** |
| | Attestation de formation déclarée, adaptée à la sous-catégorie | **B** |
| | Attestation **valide à la date du vol** (voir §4.3) | **B** |
| | Âge minimum atteint | A |
| Exploitant | Numéro d'exploitant UAS déclaré | **B** |
| | Assurance déclarée, en cours de validité | **B** |
| Aéronef | Modèle et numéro de série | **B** |
| | Numéro d'enregistrement apposé sur l'appareil | **B** |
| | Signalement électronique actif si requis par la masse | **B** |
| | Signalement lumineux si vol de nuit | **B** |
| | Firmware, hélices, batteries, stockage libre | A |
| Zone | Zone consultée sur la carte officielle en vigueur | **B** |
| | Restriction temporaire vérifiée | **B** |
| | Proximité d'aérodrome | **B** |
| | Agglomération / espace public | **B** |
| | Infrastructure sensible | **B** |
| | Ligne électrique, grue, circulation, obstacles | A |
| Autorisations | Accord du propriétaire ou du gestionnaire | **B** |
| | Autorisation d'accès au chantier | **B** |
| | Autorisation préfectorale si applicable | A |
| Tiers | Personnes non impliquées : distance prévue | **B** |
| | Rassemblement de personnes | **B** |
| | Information des occupants | A |
| Vie privée | Zones privées voisines identifiées | **B** |
| | Floutage prévu si captation de tiers | A |
| Opérations | Zone de décollage / d'atterrissage | A |
| | Plan de repli, procédure d'urgence | A |
| | Météo, vent, visibilité | A |
| Après | Médias importés | I |
| | Journal clos | I |

### 4.3 Le point qui change tout depuis 2026

**Les brevets obtenus par déclaration sur l'honneur (BAPD) ne sont plus valides depuis le
1ᵉʳ janvier 2026**, et **les scénarios nationaux S-1 / S-2 / S-3 n'existent plus** depuis la
même date. Toute checklist ou fiche de préparation rédigée avant 2026 est **périmée** sur ces
deux points. Détail et sources : `ELSATIA-DRONE-SECURITY-PRIVACY-COMPLIANCE-V1.md`.

Conséquence de modèle : le champ de qualification **ne doit pas** être un booléen
« télépilote formé ». Il doit porter **la nature de l'attestation, sa date et son échéance**,
parce que le cadre change et qu'un booléen ne se re-vérifie pas.

---

## 5. Capture et télémétrie — la provenance avant la donnée

Le brief liste les données capturables. Le point qui compte est ailleurs : **d'où vient
chaque valeur.** Quatre origines, à porter dans le modèle, jamais mélangées.

| Origine | Définition | Exemple | Confiance |
|---|---|---|---|
| `original_file` | Lue dans le fichier original, non modifiée | GPS EXIF, focale, date de prise de vue | La plus haute disponible sans calage |
| `sdk` | Fournie par le SDK constructeur pendant le vol | vitesse, batterie, précision GNSS | Haute, non rejouable |
| `computed` | Calculée par ELSATIA | GSD, surface, distance | Dépend entièrement de ses entrées |
| `declared` | Saisie par un humain | météo, distance mesurée au décamètre, numéro de série | Faillible, mais traçable |

**Interdit absolu : présenter une donnée `computed` comme une métadonnée native.** Une
altitude recalculée n'est pas l'altitude EXIF ; une surface calculée n'est pas une mesure.

Cinquième cas, à traiter explicitement : **`absent`**. Une photo prise au téléphone en mode
avion n'a pas de GPS. L'interface doit afficher « position inconnue », jamais une position
par défaut, jamais celle du chantier « pour dépanner » — c'est ainsi qu'on fabrique une
preuve fausse.

### 5.1 Altitude

`units.ts` l'impose déjà : **une altitude ne peut pas s'écrire sans son référentiel.** Trois
référentiels coexistent sur un chantier — hauteur au-dessus du point de décollage, altitude
ellipsoïdale WGS84, altitude au-dessus du sol — et les confondre produit des erreurs de
plusieurs dizaines de mètres. Le noyau a raison ; le rappeler ici évite qu'un écran ne
l'oublie.

---

## 6. Journal de mission — append-only

Doctrine reprise de **Colors** (`colors_seaux` + journal append-only, aucune suppression
physique) et de **Réserves** (`reserves_historique`, `reserves_transitions`).

| Propriété | Règle |
|---|---|
| Écriture | Ajout seul. Aucun `update`, aucun `delete` |
| Entrée | horodatage, auteur, type, charge utile JSON, référence d'objet |
| Types | création, changement d'état, coche de checklist, import de média, suppression logique, annotation, mesure, reconstruction, génération de rapport, partage, accès support, révocation |
| Suppression d'un média | **Entrée de journal, pas disparition.** Le média passe en corbeille |
| Rétention | Le journal survit à la corbeille du média qu'il décrit |
| Lecture | Responsable de mission et au-dessus ; le support ELSATIA n'y accède que sous accès strict journalisé |

**Le journal est ce qui rend un rapport opposable.** Sans lui, un rapport ELSATIA est un PDF
joli ; avec lui, c'est une pièce dont on peut reconstituer la fabrication.

---

## 7. Rapport — objet versionné, pas fichier

| Champ | Règle |
|---|---|
| `version` | Entier croissant. Une modification crée une version, n'en écrase aucune |
| `statut` | `brouillon` → `a_valider` → `valide` → `diffuse` → `remplace` |
| `empreinte` | SHA-256 du fichier produit, calculée à la génération |
| `pieces` | Liste **figée** des médias et mesures inclus, par identifiant **et empreinte** |
| `destinataires` | **Figés à la diffusion**, jamais recalculés — patron déjà établi côté contrats client Gestion Pro |
| `journal_consultation` | Qui a ouvert, quand, depuis quel lien |
| `expiration` | Sur les liens de partage, obligatoire |

**Interdits :** présenter un rapport `brouillon` comme certifié ; laisser un rapport `diffuse`
changer de contenu ; recalculer une liste de destinataires après diffusion ; supprimer une
version.

Le lien avec le §2 est direct : « rapport à valider » n'est pas un état de projet, c'est
`statut = a_valider` **sur une version de rapport**. Un projet peut porter un rapport validé
et un brouillon en même temps ; un état de projet ne saurait pas l'exprimer.

---

## 8. Ce que ce document n'ouvre pas

- Aucune table, aucune colonne, aucune migration, aucun numéro de ledger.
- Aucun `.sql.proposed` — le brief l'interdit explicitement pour cette mission.
- Aucune modification de `packages/drone-core`. Les deux ajouts du §2 (`postponed`,
  `abort_reason`) sont des **recommandations**, à réaliser dans un lot de code.
- Aucun bucket de stockage.

Le jour où ce modèle produira du SQL, il devra être rebasé sur le train courant : la ligne
Drone descend de `996be15`, en retard sur le train V2 `1fc1331` et sur tout le Train V3.
