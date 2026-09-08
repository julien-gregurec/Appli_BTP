# ELSATIA Drone / Scan — Stratégie de tests V1

> 2026-09-08. **Ces tests sont spécifiés, non exécutés** : le produit n'existe pas.
> Le noyau et le prototype portent déjà 168 tests (67 + 101) ; ce document décrit ce qu'il
> faudra ajouter, et surtout **ce que chaque test protège**.

---

## 1. Principe

Un test ne vaut que par l'interdit qu'il défend. La colonne « ce qui casse sans lui » est la
plus importante du document : elle explique pourquoi un test coûteux mérite d'être écrit.

Quatre familles :

| Famille | Rôle | Coût |
|---|---|---|
| **Invariants de données** (pgTAP) | Ce que la base refuse | Faible |
| **Unitaires** (Vitest) | Fonctions pures, provenance, idempotence | Faible |
| **Intégration** | Ports, file, ingestion | Moyen |
| **E2E** (Playwright) | Ce qu'un humain vit, **réseau coupé compris** | **Élevé** |

**Règle de la base isolée :** jouer les tests pgTAP dans une base clonée jetable, jamais par
`db reset` sur la base locale — elle porte le jeu multi-app de test, et un reset le détruirait.

---

## 2. Les quarante tests

### Isolation et sécurité — les six qui ne se négocient pas

| # | Test | Famille | Ce qui casse sans lui |
|---|---|---|---|
| 1 | Une entreprise ne lit aucun projet d'une autre | pgTAP | Fuite inter-tenant |
| 2 | Une entreprise ne lit aucun média d'une autre, **même par empreinte identique** | pgTAP | Fuite par rapprochement sha256 |
| 3 | Le cache local est isolé par (utilisateur, entreprise) | E2E | Téléphone de chantier partagé → fuite |
| 4 | Aucun nom de fichier client n'apparaît dans un chemin de stockage | Unitaire | Fuite par l'URL |
| 5 | Une URL signée expirée est refusée | Intégration | Partage éternel |
| 6 | L'accès support est limité à Drone, justifié, borné, notifié, audité | pgTAP + E2E | Accès support silencieux |

### Autonomie — le produit doit vivre seul

| # | Test | Famille | Ce qui casse sans lui |
|---|---|---|---|
| 7 | Un projet se crée **sans client et sans chantier** | pgTAP | Mode autonome perdu |
| 8 | Un projet complet se mène **sans aucune mission** | E2E | L'import après vol devient impossible |
| 9 | Aucun port écosystème branché : le produit est entier | E2E | Dépendance cachée à GP |
| 10 | Aucune clé étrangère SQL entre applications | pgTAP | Couplage dur |

### Médias et preuve

| # | Test | Famille | Ce qui casse sans lui |
|---|---|---|---|
| 11 | L'original est **bit à bit identique** après annotation | Intégration | Preuve détruite |
| 12 | L'empreinte est calculée **avant** toute transformation | Unitaire | Empreinte du dérivé prise pour celle de l'original |
| 13 | Deux imports du même contenu dans un projet → **un média** | Intégration | Doublons |
| 14 | Le même contenu dans deux projets → **deux médias** | Intégration | Faux rapprochement |
| 15 | **Renvoi manuel après échec → aucun doublon** | E2E | **Défaut P0 réel de Réserves V6** |
| 16 | Un média supprimé va en corbeille, le fichier subsiste | pgTAP | Destruction de preuve |
| 17 | Le statut antivirus `non_analyse` s'affiche comme tel | E2E | Bouclier vert mensonger |
| 18 | Type MIME décidé par les **octets**, pas par l'extension | Unitaire | Fichier déguisé |
| 19 | Un média trop lourd est refusé proprement | Intégration | Échec silencieux |

### Hors-ligne — les sept scénarios mesurés

| # | Test | Famille | Ce qui casse sans lui |
|---|---|---|---|
| 20 | 200 photos importées réseau coupé → 200 après reprise, zéro doublon | E2E | « Hors-ligne » inexistant, **déjà arrivé en Réserves V4** |
| 21 | Coupure sur un média de 40 Mo → reprise **au morceau** | E2E | Import inutilisable en 4G |
| 22 | Session expirée pendant la file → **file intacte** | E2E | Journée de travail perdue |
| 23 | Onglet fermé pendant l'envoi → reprise à la réouverture | E2E | Perte silencieuse |
| 24 | Stockage local saturé → message explicite, aucune corruption | E2E | Corruption |
| 25 | Reprise **exponentielle bornée**, jamais de boucle fixe | Unitaire | Martèlement du serveur |
| 26 | Après N échecs → **lettre morte**, jamais suppression | Intégration | Mutation perdue |

### Idempotence

| # | Test | Famille | Ce qui casse sans lui |
|---|---|---|---|
| 27 | Toute mutation différable porte une clé d'idempotence | pgTAP | Doublons partout |
| 28 | Unicité de la clé **par entreprise**, pas globale | pgTAP | Collision entre tenants |
| 29 | Transition déjà appliquée → retour idempotent, **pas d'exception** | pgTAP | Conflit indiscernable d'un vrai conflit |
| 30 | Clé de reconstruction stable par **contenu** | Unitaire | Double facture GPU |

### Mesure — les garde-fous de l'argent

| # | Test | Famille | Ce qui casse sans lui |
|---|---|---|---|
| 31 | Toute mesure porte origine **et** qualité | Unitaire | Mesure anonyme |
| 32 | Combinaison **par le maillon le plus faible** | Unitaire | Fiabilité fabriquée |
| 33 | Sans mise à l'échelle → **refus** de produire une quantité | Intégration | Niveau 3 vendu comme métré |
| 34 | Moins de 3 points de calage répartis → **refus** du niveau 5 | Intégration | Modèle vrillé, visuel parfait |
| 35 | Une mesure de niveau ≤ 3 ne peut pas être « retenue » | Intégration | Devis faux |
| 36 | Aucun seuil de qualité codé tant qu'aucun n'est mesuré | Unitaire | **Précision inventée** |

### Ponts — les interdits

| # | Test | Famille | Ce qui casse sans lui |
|---|---|---|---|
| 37 | Publication vers Réserves → **brouillon**, jamais réserve validée | Intégration | Réserve créée à tort |
| 38 | Drone ne peut **jamais** lever une réserve ni émettre un devis | pgTAP | Franchissement de frontière |
| 39 | Un média supprimé ne vide **jamais** un DOE figé | pgTAP | Preuve rétroactivement détruite |
| 40 | Double publication → **une seule** ligne côté cible | Intégration | Deux réserves, double quantité |

### Rapports, IA, rétention — compléments

| # | Test | Famille | Ce qui casse sans lui |
|---|---|---|---|
| 41 | Un rapport `brouillon` ne peut pas être présenté comme validé | E2E | Faux document |
| 42 | Destinataires **figés à la diffusion**, jamais recalculés | pgTAP | Réécriture de l'histoire |
| 43 | Une version de rapport ne peut pas être écrasée | pgTAP | Perte de traçabilité |
| 44 | IA désactivée → produit **intégralement** fonctionnel | E2E | IA sur le chemin critique |
| 45 | Fournisseur d'IA indisponible → dégradation propre | Intégration | Blocage |
| 46 | Toute sortie d'IA est marquée brouillon | Unitaire | Sortie IA prise pour un fait |
| 47 | *Legal hold* bloque toute purge, **RGPD compris** | pgTAP | Destruction de pièce de contentieux |
| 48 | Média cité par un rapport diffusé → non purgeable | pgTAP | Rapport troué |
| 49 | Révocation d'appareil → purge du cache au prochain contact | E2E | Données sur un appareil perdu |
| 50 | Export RGPD complet par personne | Intégration | Non-conformité |

---

## 3. Non-régressions issues de défauts réels

Ces cinq lignes ne sont pas théoriques : chacune correspond à un défaut **déjà survenu** dans
l'écosystème.

| Origine | Test |
|---|---|
| Réserves V6 — photo perdue au renvoi | #15 |
| Réserves V6 — export tronqué par `max_rows` | Toute liste exportée doit être **complète ou explicitement tronquée** |
| Réserves — boucle de synchronisation toutes les 5 s | #25 |
| Réserves — 401 confondu avec 503 | #22 |
| DOE — figement nominal (identifiants seuls) | #39 |
| Contrats client — snapshot destinataire non inclus dans l'empreinte | #42 |

---

## 4. Ce qui ne se teste pas automatiquement

| Élément | Comment on l'établit |
|---|---|
| Précision réelle d'une mesure | **Campagne métrologique terrain** |
| Compatibilité SDK | **Test matériel réel** |
| Conformité réglementaire | Vérification humaine à la date de l'opération |
| Qualité d'une reconstruction | Jugement humain sur scènes de référence |
| Coût par reconstruction | Benchmark exécuté |

**Aucune suite de tests ne remplace ces cinq lignes.** Les confondre serait la façon la plus
efficace de fabriquer une fausse assurance — exactement ce que ce lot cherche à éviter.
