# OpenDroneMap — risque de licence (AGPL-3.0)

> §16 du brief prototype. **Ce document ne conclut rien juridiquement.** Il rassemble
> les faits, formule les questions et fixe l'action à confier à un conseil en propriété
> intellectuelle. Il est rédigé par une équipe technique, qui n'a ni la compétence ni la
> qualité pour trancher une question de licence.
>
> Document lié : [options photogrammétriques](ELSATIA_DRONE_PHOTOGRAMMETRY_OPTIONS_V1.md) ·
> [rapport de prototype](PHOTOGRAMMETRY_PIPELINE_PROTOTYPE_V1.md)

---

## 0. Verdict d'exploitation, en une ligne

**ODM COMMERCIALLY CLEARED : NON.** Aucune commercialisation d'un service ELSATIA
s'appuyant sur OpenDroneMap tant qu'un conseil PI n'a pas répondu par écrit aux questions
du §3. Cette ligne prime sur toute considération technique du présent dépôt.

---

## 1. Faits relevés

Ces éléments proviennent du relevé du **2026-09-07** consigné dans le livrable 3. Ils
n'ont **pas été revérifiés à la date d'écriture du prototype** et doivent l'être avant la
saisine.

| Fait | Statut |
|---|---|
| ODM, NodeODM et WebODM sont distribués sous **AGPL-3.0** (depuis ODM 2.3.0 / NodeODM 2.1.0 / WebODM 1.6.0) | relevé le 2026-09-07, à reconfirmer |
| L'AGPL-3.0 comporte une **clause réseau** (§13 de la licence) absente de la GPL-3.0 | fait de licence, texte public |
| ODM s'exécute comme un service autonome, piloté par API HTTP | vérifié par le prototype |
| Certaines dépendances de l'écosystème SfM portent des restrictions propres (usage non commercial de composants GPU côté COLMAP) | relevé le 2026-09-07, à instruire séparément |
| Existence, portée et prix d'une éventuelle licence commerciale alternative proposée par les auteurs d'ODM | **non vérifié** |
| Titularité exacte des droits (personnes morales/physiques signataires, CLA éventuel) | **non vérifié** |

### Ce que dit la clause réseau, en français simple

L'AGPL ajoute à la GPL une obligation supplémentaire : si vous **modifiez** le logiciel et
que des utilisateurs **interagissent avec lui à distance à travers un réseau**, vous devez
leur offrir l'accès au code source correspondant de votre version. C'est la clause conçue
précisément pour le cas du SaaS.

Deux mots y font tout le litige : « modifiez » et « code source correspondant ». C'est
exactement là que se situe le risque ELSATIA, et c'est exactement ce qu'une équipe
technique ne peut pas trancher seule.

---

## 2. La position technique d'ELSATIA (factuelle, non juridique)

Le prototype a été construit pour que la réponse du conseil PI, quelle qu'elle soit, coûte
le moins cher possible :

1. **ODM n'est pas modifié.** L'adaptateur
   ([`moteur/odm.ts`](../../packages/drone-photogrammetry/src/moteur/odm.ts)) parle à
   NodeODM par son API HTTP publique. Aucun correctif, aucun fork, aucun recompilage.
2. **Aucun lien de code.** Rien d'ODM n'est importé, lié statiquement ou dynamiquement dans
   le code ELSATIA. La frontière est un processus séparé et un protocole réseau.
3. **L'utilisateur final n'interagit jamais avec ODM.** Il parle à l'application ELSATIA,
   qui parle à ODM. ODM n'est pas exposé.
4. **L'abstraction moteur est une police d'assurance** (§17 du brief) : la substitution par
   Metashape est prouvée par un test, elle ne modifie pas une ligne de code client.

Ces quatre points **réduisent** le risque. Ils ne le suppriment pas, et surtout **ils ne
constituent pas un avis**. La proximité fonctionnelle entre notre orchestrateur et le
moteur peut être analysée différemment par un juriste.

---

## 3. ACTION CONSEIL PI

**Action attendue :** obtenir un avis écrit d'un conseil en propriété intellectuelle
spécialisé en licences libres, avant toute commercialisation d'une offre Drone.

### Questions à poser, dans cet ordre

1. **Le déploiement décrit au §2 déclenche-t-il l'obligation de l'AGPL §13 ?** ELSATIA
   exécute une version **non modifiée** de NodeODM, sur sa propre infrastructure, appelée
   en HTTP par un service distinct ; les utilisateurs finaux n'accèdent jamais à ODM
   directement.
2. **Si oui, quel est le périmètre du « code source correspondant » ?** ODM seul ?
   L'orchestrateur ELSATIA ? L'application complète ? La réponse détermine si l'offre
   Drone est publiable ou non.
3. **Qu'est-ce qui constituerait une « modification » au sens de la licence ?** Un fichier
   de configuration, un jeu d'options de traitement, une image Docker reconstruite, un
   post-traitement des sorties : où passe la ligne ?
4. **L'usage de l'image Docker officielle constitue-t-il une distribution ?** Et le fait de
   la reconstruire pour notre infrastructure ?
5. **Existe-t-il une licence commerciale alternative** proposée par les titulaires des
   droits, et à quelles conditions ?
6. **Quelles obligations propres portent les dépendances tierces d'ODM** (bibliothèques SfM
   et dépendances GPU), indépendamment de la licence d'ODM lui-même ?
7. **Quel est le risque résiduel acceptable** si l'analyse conclut à une zone grise, et
   quelles mesures documentées le réduisent (isolation, non-modification, traçabilité des
   versions déployées) ?

### Éléments à fournir au conseil

- Le schéma d'architecture du [rapport de prototype](PHOTOGRAMMETRY_PIPELINE_PROTOTYPE_V1.md).
- Le code de l'adaptateur (une centaine de lignes, aucune ligne d'ODM).
- La liste exacte des versions ODM/NodeODM envisagées, et leur licence à cette version.
- Le modèle commercial visé : service de reconstruction facturé à la consommation.

### Ce qui reste interdit tant que l'avis n'est pas rendu

- Toute mise en vente, tout engagement contractuel, toute mention commerciale d'une
  capacité de reconstruction s'appuyant sur ODM.
- Tout déploiement d'ODM accessible depuis l'extérieur du réseau de développement.
- Toute modification du code d'ODM, même mineure : elle changerait la nature de la question
  posée au conseil.

**Ce qui reste autorisé :** l'expérimentation technique locale telle que menée ici —
prototype, tests, mesures — dans un environnement non commercial et non exposé.

---

## 4. Les deux issues, et leur coût

| Issue | Conséquence technique | Coût estimé |
|---|---|---|
| Le conseil valide le montage | Le prototype continue tel quel ; il reste à mesurer, industrialiser et héberger | Aucun surcoût de licence |
| Le conseil écarte l'AGPL en contexte SaaS | Bascule sur Metashape sous *Service Provider License* : seul l'adaptateur change (`moteur/metashape.ts`), le reste du pipeline est inchangé — c'est la raison d'être de l'abstraction | Coût de licence Metashape + implémentation de l'adaptateur, à chiffrer |

La troisième issue — « le conseil ne se prononce pas clairement » — est la plus probable et
la moins confortable. Elle se traite comme un refus : on bascule sur le plan B, dont la
compatibilité commerciale est explicitement prévue par son éditeur.

---

## 5. Suivi

| Étape | Responsable | Date |
|---|---|---|
| Reconfirmer les faits du §1 (licences aux versions ciblées) | à désigner | avant saisine |
| Saisine du conseil PI avec les éléments du §3 | Julien | à planifier |
| Avis écrit reçu et consigné dans `docs/drone/` | — | — |
| Décision moteur (ODM confirmé / bascule Metashape) | Julien | après avis |
