# ELSATIA Drone — Hors-ligne, médias et synchronisation V1

> 2026-09-08. Transpose à Drone les acquis **mesurés** de Réserves V5/V6 et de la PWA Tools.
> Aucune promesse de fonctionnement hors-ligne n'est faite ici : elle se mesure, elle ne se
> décrète pas.

---

## 1. La leçon la plus chère de l'écosystème

Réserves a annoncé un mode hors-ligne en V4. La recette V4 a mesuré :
**hors-ligne INEXISTANT**. Il a fallu la V5 pour livrer un hors-ligne réel, et la V6 pour
corriger deux défauts P0 que seule l'exécution révèle — dont **une photo perdue au renvoi**.

Règle qui en découle, et qui vaut pour Drone :

> **Le mode hors-ligne n'est pas livré tant qu'une recette E2E ne l'a pas mesuré réseau
> coupé.** Un service worker enregistré n'est pas un mode hors-ligne. Une file en mémoire
> n'est pas une file.

Drone est **plus exposé** que Réserves : les objets ne sont pas des commentaires de quelques
octets mais des photos de 10 à 50 Mo, par centaines, sur un toit sans réseau.

---

## 2. Idempotence — reprendre le patron, pas le réinventer

La migration canonique **273** (`reserves_v5_offline_idempotence_v1`) donne le patron exact,
déjà éprouvé :

| Élément | Règle |
|---|---|
| Clé | `origine_client_id uuid`, **émise par le client**, portée par la mutation |
| Unicité | **Par organisation** — `unique (entreprise_id, origine_client_id) where origine_client_id is not null` |
| Rejeu | Renvoie **l'objet existant**, ne crée pas de second |
| Portée | Chaque mutation différable en a une. Une mutation sans clé est un bug, pas une simplification |

Le commentaire de la migration dit l'essentiel :

> « Un rejeu n'est pas un cas rare, c'est le fonctionnement **normal** de la file — une
> réponse perdue, un onglet fermé pendant l'envoi, un retry explicite. »

**Mutations Drone à rendre idempotentes dès la première ligne de code :**

| Mutation | Clé | Piège |
|---|---|---|
| Créer un projet | `origine_client_id` | Deux projets pour un chantier |
| Créer / reporter une mission | `origine_client_id` | — |
| Cocher un point de checklist | `origine_client_id` | Double horodatage → journal faux |
| **Importer un média** | `origine_client_id` **+ sha256** | Voir §3 |
| Annoter | `origine_client_id` | Doublons de calques |
| Mesurer | `origine_client_id` | **Double quantité dans un devis** |
| Demander une reconstruction | clé d'idempotence du noyau (`idempotency.ts`) | Double facture GPU |
| Publier vers GP / Réserves / DOE | `origine_client_id` | **Deux réserves pour un désordre** |

La clé du noyau — (projet, jeu de médias trié, moteur, version, paramètres normalisés) —
règle le cas de la reconstruction et **ne doit pas** être remplacée par un `origine_client_id`:
elle est stable par *contenu*, ce qui est plus fort.

---

## 3. Le média — deux clés, pas une

Un média a **deux identités**, et les confondre produit les deux pannes classiques.

| Clé | Ce qu'elle répond | Panne évitée |
|---|---|---|
| `origine_client_id` | « Est-ce le même **envoi** ? » | Le renvoi crée un doublon |
| `sha256` | « Est-ce le même **contenu** ? » | La même photo importée deux fois par deux chemins |

Le prototype `drone-photogrammetry` calcule déjà sha256 et déduplique à l'ingestion. Ce qui
manque est la **combinaison** : un même contenu importé volontairement dans deux projets
distincts est légitime (le même mur vu depuis deux chantiers voisins) ; un même envoi rejoué
ne l'est pas.

Règle : **déduplication par `sha256` à l'intérieur d'un projet**, jamais entre projets, et
jamais entre entreprises — un rapprochement inter-tenant par empreinte serait une fuite.

**Le défaut P0 corrigé en Réserves V6 — photo perdue au renvoi — doit être un test Drone dès
le premier jour.** Il n'est pas hypothétique : il est déjà arrivé, ici, sur ce code.

---

## 4. Ce qui est disponible hors-ligne

| Donnée | Hors-ligne | Justification |
|---|---|---|
| Mission affectée à l'utilisateur | **Oui**, complète | Le terrain est sans réseau par définition |
| Checklist et sa complétude | **Oui** | Se remplit avant le vol, souvent hors couverture |
| Plans et repères du chantier | **Oui**, si pré-téléchargés | Volume borné |
| Fond cartographique | **Non** en V1 | Licence, volume, fraîcheur — trois problèmes distincts, aucun résolu |
| Zones de restriction de vol | **Non** | **Interdit** de servir une carte de restrictions périmée : ce serait pire que ne rien montrer |
| Médias capturés localement | **Oui** | — |
| Notes, annotations, mesures indicatives | **Oui** | — |
| Reconstruction | **Non** | GPU serveur |
| Rapport | **Non** | Cohérence et empreinte |

**La ligne « zones de restriction » est un refus délibéré.** Une donnée de sécurité mise en
cache est une donnée périmée à l'instant où elle sert. L'application doit dire « consultez la
carte officielle en ligne », jamais afficher un cache.

---

## 5. La file — quatre règles issues de mesures, pas d'opinions

1. **Reprise exponentielle bornée, jamais de boucle fixe.** Une boucle toutes les cinq
   secondes a déjà été identifiée comme défaut côté Réserves. Progression recommandée :
   2 s, 5 s, 15 s, 60 s, 5 min, plafond 15 min ; réveil immédiat au retour du réseau.
2. **Ne jamais confondre « serveur indisponible » et « session expirée ».** Un 401 vide la
   file s'il est traité comme un 503, et le travail d'une journée disparaît. Défaut déjà
   rencontré, déjà corrigé ailleurs, à ne pas re-commettre.
3. **Après N échecs, lettre morte — jamais suppression.** Le prototype le fait déjà pour les
   reconstructions (retry borné puis lettre morte, avec conservation du contexte d'échec :
   catégorie, message moteur, journaux, artefacts partiels). Une mutation en lettre morte
   reste **visible et rejouable à la main**.
4. **État honnête, toujours affiché.** « 47 éléments en attente, dernier essai il y a 3 min,
   3 en échec » — jamais une icône verte qui ment.

### 5.1 Ce que Drone ajoute et que Réserves n'avait pas

| Contrainte | Conséquence |
|---|---|
| **Volume** : 200 photos × 20 Mo = 4 Go | Envoi **par morceaux, reprenable** — déjà implémenté dans le prototype. Un envoi non reprenable est inutilisable en 4G de chantier |
| **Batterie** | Pas d'envoi de gros médias sous seuil de batterie sans accord explicite |
| **Réseau facturé** | Choix « Wi-Fi seulement / autoriser les données mobiles », par défaut Wi-Fi |
| **Stockage local plein** | Détection **avant** capture ou import, message explicite, refus propre. Jamais un échec silencieux |
| **Ordre** | Métadonnées et vignettes d'abord, originaux ensuite : l'utilisateur voit son travail arriver |

---

## 6. Conflits

| Situation | Résolution |
|---|---|
| Même mutation rejouée | **Idempotence** — objet existant renvoyé. Pas un conflit |
| Deux annotations sur la même photo | Les deux sont conservées, calques distincts, auteurs distincts. **Pas de fusion** |
| Deux mesures divergentes | Les deux sont conservées. Une seule peut être marquée « retenue », par un humain |
| Transition d'état déjà appliquée | Retour idempotent, **jamais une exception indiscernable d'un vrai conflit** — c'est le défaut nommément corrigé par la migration 273 |
| Projet archivé hors-ligne, mutation en attente | Mutation refusée à la reprise, conservée en lettre morte, **motif affiché** |
| Média supprimé côté serveur, annoté hors-ligne | L'annotation survit, orpheline et signalée. Rien n'est perdu en silence |

**Principe : Drone ne fusionne jamais automatiquement deux contenus humains.** Il conserve
les deux et demande. Une fusion automatique de mesures est une falsification.

---

## 7. Isolation par identité

Réserves V5 stocke en IndexedDB **par identité**. Le cas qui l'impose : un téléphone de
chantier partagé, deux utilisateurs, deux entreprises. Sans isolation par identité, les
données du premier deviennent visibles au second.

Pour Drone, où le stockage local est massif :

- une base locale **par (utilisateur, entreprise)** ;
- purge à la déconnexion **et** au changement d'entreprise ;
- aucune vignette en cache partagé entre identités ;
- CSP en place (livrée en Réserves V6) — la reprendre, ne pas la réécrire.

---

## 8. Conservation, corbeille, rétention

Doctrine **Colors** : pas de suppression physique, la corbeille est un `archive`.

| Action | Effet |
|---|---|
| Supprimer un média | Passage en corbeille, entrée de journal, **fichier conservé** |
| Vider la corbeille | Suppression logique, empreinte et entrée de journal **conservées** |
| Suppression réelle | Uniquement par purge de rétention ou demande RGPD, journalisée |
| Gel juridique (*legal hold*) | **Bloque toute purge**, y compris RGPD, et le dit explicitement |
| Média cité par un rapport diffusé | **Jamais purgé** tant que le rapport est en vigueur |
| Média cité par un DOE figé | **Jamais purgé** — le DOE a sa propre copie ou son snapshot (voir le document des ponts) |

---

## 9. Ce qui doit être mesuré avant toute annonce

| Scénario | Critère |
|---|---|
| 200 photos, réseau coupé pendant l'import | 200 photos présentes après reprise, **zéro doublon**, zéro perte |
| Coupure en plein envoi d'un média de 40 Mo | Reprise **au morceau**, pas au début |
| Session expirée pendant la file | File **intacte**, reconnexion demandée, aucune perte |
| Onglet fermé pendant l'envoi | Reprise à la réouverture |
| Stockage local saturé | Message explicite, aucune corruption |
| Deux identités sur le même appareil | **Aucune fuite** de vignette, de mission ou de mesure |
| Renvoi manuel après échec | **Aucun doublon** — le test du défaut P0 de Réserves V6 |

**Tant que ces sept lignes ne sont pas vertes en E2E, le site ne doit pas écrire
« fonctionne hors connexion ».** Réserves a payé cette phrase une fois.
