# ELSATIA Drone / Scan — Rapport d'audit d'architecture

> Lot `ELSATIA-DRONE-SCAN-ARCHITECTURE-MASTER-V1`.
> Audit mené le **2026-09-08**. Branche `audit/elsatia-drone-scan-architecture-master-v1`,
> base `698eb54a08bf91ccfa1cfc902cdaaa1994586b4d`.
> **Documentation seule.** Aucun code, aucune migration, aucun numéro de ledger réservé,
> aucun objet Stripe, aucun déploiement.

---

## 0. Le constat qui commande tout le reste

**Le brief de ce lot suppose qu'ELSATIA Drone est à l'état d'idée. C'est faux.**

Un lot Drone a été livré le **2026-09-07**, poussé sur `origin`, comportant deux paquets de
code et neuf documents. Il n'est ni fusionné, ni déployé, mais il existe, il est testé, et sa
documentation répond déjà à une partie substantielle des sections §9 à §19 du présent brief.

Ce rapport ne réécrit donc pas ce qui existe. Il fait trois choses :

1. il **établit factuellement** ce qui existe, où, et sous quel SHA ;
2. il **re-vérifie** les affirmations externes datées du 2026-09-07 (SDK, réglementation),
   parce qu'une matrice de compatibilité non rejouée est une matrice périmée ;
3. il **délimite le manque réel**, que les douze autres livrables de ce lot comblent.

Toute section de ce lot qui recouvrirait l'existant renvoie à l'existant au lieu de le
dupliquer. Deux documents qui disent la même chose avec des mots différents créent une
contradiction future : c'est exactement le piège qu'a déjà produit la double modélisation du
snapshot destinataire côté Gestion Pro.

---

## 1. Périmètre audité

| Domaine | Référence inspectée | Nature |
|---|---|---|
| Ligne Drone | `feat/drone-core-contracts-v1`, `feat/drone-photogrammetry-pipeline-v1` | Code + docs |
| Train canonique V2 | `1fc1331842cdf5980b374169994587813bdee7b6` | Migrations, socle multi-app |
| Train V3 (commercial) | `8af11b868b7abb68b7c93f543808c9e9ebcd0f19` | **Lecture seule, non touché** |
| Réserves | migrations `…268`, `…269`, `…270`, `…273` du train V2 ; `feat/reserves-v6-security-offline-pilot-gate-v1` | Modèle chantier / photo / hors-ligne |
| Tools | ligne `apps/tools/**`, ~50 branches | Provenance de mesure, PWA hors-ligne |
| Gestion Pro | train V2 | Clients, chantiers, devis, pièces jointes |
| Socle multi-app | `20260826000234_elsatia_multi_app_convergence_v1.sql` | Applications, rôles, habilitations |
| Moteur commercial | `src/lib/commercial/**` (train V3) | Catalogue, remises, mapping Stripe |
| DOE / bibliothèque technique | `docs/audits/ELSATIA-DOE-TECHNICAL-LIBRARY-ARCHITECTURE-AUDIT-REPORT.md` | **Non suivi par git** |
| Site vitrine | dépôt `elsatia-site` | **Hors de ce dépôt, non touché** |

---

## 2. Matrice de l'existant Drone (format §5 du brief)

| Élément | Branche | SHA | État | Contenu | Reprise recommandée |
|---|---|---|---|---|---|
| Étude d'architecture (5 livrables, 1 663 lignes) | `feat/drone-core-contracts-v1` | `ace45f6ab0ac8bab99ab1fd4abcf9f97ef9c12d1` | Documenté | Architecture A→U, matrice SDK, options photogrammétriques, modèle de données, roadmap MVP | **Oui — socle documentaire. À compléter, pas à refaire** |
| Noyau typé `packages/drone-core` (48 fichiers) | `feat/drone-core-contracts-v1` | `8dcf5b8c57116ba76ee908b8b339d58c861db18e` | Développé + testé | 19 entités, unités canon, provenance, qualité, idempotence, 5 contrats d'export versionnés, 4 ports, validation runtime, 3 jeux d'essai | **Oui — noyau. Ne pas réécrire** |
| Prototype `packages/drone-photogrammetry` (35 fichiers, 101 tests) | `feat/drone-photogrammetry-pipeline-v1` | `698eb54a08bf91ccfa1cfc902cdaaa1994586b4d` | Prototype exécutable | Adaptateurs NodeODM / Metashape / démo, file locale, ingestion (téléversement repris, EXIF, qualité, sécurité), rapatriement, formule de coût, harnais de benchmark | **Oui, sous réserve** — voir §4.2 (AGPL) et §4.3 (aucune mesure) |
| `docs/drone/ODM_LICENSE_RISK.md` | idem | `698eb54…` | Documenté | AGPL-3.0, clause réseau, questions au conseil PI | **Oui — bloquant commercial ouvert** |
| Application Drone (écrans, routes) | — | — | **Absent** | — | À concevoir |
| Worker / file distribuée / GPU | — | — | **Absent** | — | À concevoir — poste le plus lourd |
| Migration SQL Drone | — | — | **Absent (volontaire)** | — | À produire dans un train, pas ici |
| Enregistrement `drone` dans `applications_elsatia` | — | — | **Absent** | — | Une ligne de seed, à faire dans un train |
| Adaptateur DJI / Parrot réel | — | — | **Absent** | Ports définis, aucune implémentation | Hors MVP |

**Relation entre les deux branches Drone :** `git merge-base 8dcf5b8 698eb54` = `8dcf5b8`.
`feat/drone-photogrammetry-pipeline-v1` **contient** `feat/drone-core-contracts-v1`. Il y a une
seule ligne Drone, dont la pointe est `698eb54`. Il n'existe aucune troisième branche Drone.

**Base commune :** `996be15` (`docs(ops): refresh cutover target to 1d15289`).
**Vérification migrations :** `git diff --name-only 996be15 698eb54 -- supabase/` retourne
**vide**. Les trois commits Drone n'ont touché aucune migration, aucun test SQL, aucun seed.

---

## 3. Ce que le noyau existant décide déjà — et qui ne doit pas être rouvert

Ces décisions sont dans le code, testées. Les rouvrir coûterait plus qu'elles ne rapportent.

| Décision | Où | Pourquoi elle tient |
|---|---|---|
| **Une mission est facultative** | `mission.ts` : « Un projet peut n'avoir aucune mission » | L'import après vol est le mode nominal (§9 ci-dessous). Rendre la mission obligatoire casserait le cas d'usage majoritaire |
| **Statut `observed`** | `mission.ts` | Une mission reconstituée depuis les EXIF décrit ce qui a été volé, pas ce qui avait été planifié. Distinction honnête, rare, précieuse |
| **Échelle de provenance à 6 niveaux** | `provenance.ts` | Reprend Tools et l'étend de `field_controlled` (RTK / points de calage). Combinaison par le maillon le plus faible |
| **Aucun seuil de qualité codé** | `quality.ts` | Les 4 niveaux existent, leurs seuils sont la sortie d'une campagne métrologique qui n'a pas eu lieu. Les coder serait inventer une précision |
| **`uncertainty_value` nullable, `null` correct** | `quality.ts` | L'interface doit savoir afficher une mesure sans incertitude |
| **Unités : m / m² pour le relevé, mm pour le matériel, degrés dans tout contrat, WGS84** | `units.ts` | Une altitude ne s'écrit pas sans son référentiel |
| **Clé d'idempotence de reconstruction** | `idempotency.ts` | (projet, jeu de médias trié, moteur, version, paramètres normalisés) sérialisés de façon déterministe |
| **Validation runtime écrite à la main** | `validation/` | Le dépôt n'embarque ni zod ni ajv ; `application-access` valide déjà par prédicats |
| **Refus de tarifer en crédits** | `couts/estimation.ts` | Le code refuse de convertir un coût en crédits tant qu'aucun benchmark réel n'existe |

---

## 4. Constats d'audit — ce qui cloche ou reste ouvert

### 4.1 La doctrine de provenance cite un fichier absent du train — **P1**

`packages/drone-core/src/provenance.ts` déclare reprendre
`apps/tools/src/lib/tracing/measurement-origin.ts`.

Vérification exhaustive sur toutes les références locales et distantes :

- **`996be15` (base Drone) : absent** ;
- **`1fc1331` (train canonique V2) : absent** ;
- **`main` : absent** ;
- présent sur ~50 branches de la ligne Tools, dont `integration/tools-prepilot-canonical-v1`
  et `feat/stripe-test-canonical-prices-p0-v1`.

Conséquence : la doctrine commune de provenance de mesure **traverse deux lignes de
développement dont aucune n'est fusionnée dans l'autre**. Le contenu est cohérent — l'échelle
Tools (`exact > manual > calibrated > imported > approximated`) est un sous-ensemble strict de
l'échelle Drone, qui ajoute `field_controlled` au-dessus de `exact` — mais l'unité doctrinale
n'est garantie par aucun test, aucun type partagé, aucune fusion.

Divergence relevée, mineure mais réelle : Tools travaille en `"mm" | "mm²" | "m²" | "°"`,
Drone en mètres et mètres carrés. Une conversion existera nécessairement au point de jonction.

**Ce n'est pas un bug de code**, les deux fichiers fonctionnent. C'est une dette de
convergence, déjà nommée « `packages/mesure-provenance` » dans le commentaire du noyau, et
qui devient exigible le jour où Drone et Tools alimentent le même métré.

### 4.2 ODM reste commercialement interdit — **P0 non technique**

`docs/drone/ODM_LICENSE_RISK.md` conclut, correctement, qu'il ne conclut rien :
OpenDroneMap est en AGPL-3.0, la clause réseau est en jeu dès qu'un service en ligne
l'expose, et **aucun conseil en propriété intellectuelle n'a été saisi**. Le prototype le
respecte : il implémente l'adaptateur mais ne l'autorise pas.

Tant que cet avis n'est pas rendu, **aucune photogrammétrie ODM ne peut être commercialisée**.
C'est un blocage juridique, pas technique, et il n'est levable par aucun développement.

### 4.3 Aucune mesure de précision n'existe — **P0 produit**

Ni benchmark de reconstruction, ni campagne métrologique, ni test matériel réel. Le harnais
de benchmark existe, trois jeux sont définis, **aucune mesure n'a été exécutée**.

Tant que ce vide dure :

- aucune précision ne peut être annoncée, même « de l'ordre de » ;
- aucun seuil de qualité ne peut être codé ;
- aucun coût par reconstruction ne peut être converti en prix ;
- aucun engagement contractuel de métré ne peut être pris.

### 4.4 L'infrastructure de traitement asynchrone n'existe nulle part dans le dépôt — **P0**

Aucune file distribuée, aucun worker, aucun GPU, aucun hébergement retenu. La file du
prototype est **locale**, prévue pour les tests. C'est le poste le plus lourd et le plus
incertain de tout le produit, et il n'a jamais été chiffré.

### 4.5 `drone` n'est pas enregistré dans le socle — **P2, trivial mais bloquant**

`applications_elsatia` contient `gestion_pro`, `colors`, `reserves`. Ni `tools`, ni `drone`.
L'enregistrement est **une ligne de seed et quelques rôles**, mais il appartient à un train
avec numéro de ledger, donc hors de ce lot.

### 4.6 La documentation Drone existe en double, dont une copie non suivie — **P2**

Le worktree principal contient `docs/drone/` **non suivi par git**, avec cinq fichiers datés
du 2026-09-07 00:09–00:17, antérieurs au commit `ace45f6` (05:50). Ce sont les originaux de
travail. Ils ne sont sur aucune branche. Le risque n'est pas la perte — `ace45f6` les
contient — mais la **divergence silencieuse** si quelqu'un édite la copie non suivie.

Même remarque, plus sérieuse, pour `docs/audits/ELSATIA-DOE-TECHNICAL-LIBRARY-ARCHITECTURE-AUDIT-REPORT.md`
(63 ko, verdict `GO ARCHITECTURE`) : **non suivi par git, sur aucune branche**. Un audit
d'architecture DOE qui n'existe que dans un répertoire de travail est un audit qu'un
`git clean` détruit. Ce lot n'y touche pas — il n'est pas dans son périmètre — mais le
signale.

### 4.7 La base Drone est en retard sur le train canonique — **P2, assumé**

`698eb54` descend de `996be15`, qui précède le train V2 `1fc1331`. La ligne Drone ignore donc
Réserves V5 (hors-ligne idempotent), la réconciliation de ledger, et tout le train V3.

C'est sans conséquence pour ce lot — qui n'ajoute que des documents — mais **le jour où Drone
produira du SQL, il devra être rebasé sur le train courant**, exactement comme Colors l'a été
via `integration/colors-code-on-ecosystem-ledger-v1`.

---

## 5. Réutilisable sans redéveloppement

| Brique | Où | Ce que Drone en tire |
|---|---|---|
| Socle multi-app | `applications_elsatia`, `roles_applications_elsatia`, `acces_applications_entreprises`, `habilitations_applications_utilisateurs`, `historique_acces_applications` | Auth, tenant, rôles, droit d'usage, journal — **sans seconde architecture**. Le code applicatif est libre |
| Patron probatoire pièces jointes | `pieces_jointes_devis`, `documents_chantier`, `documents_notes_frais`, archivage notes de frais | Empreinte SHA-256, rôle du fichier, statut antivirus honnête, horodatage, conservation, gel |
| Modèle Réserves | `reserves`, `reserves_photos`, `reserves_plans`, `reserves_chantiers`, `reserves_historique`, `reserves_transitions` | Cible du pont « photo → proposition de réserve » |
| File hors-ligne idempotente | `reserves_mutations_appliquees` (migration 273) + Réserves V6 | Patron de synchronisation terrain **déjà éprouvé**, à reprendre tel quel |
| Provenance de mesure | `apps/tools/src/lib/tracing/measurement-origin.ts` (ligne Tools) | Doctrine, sous réserve du §4.1 |
| Moteur commercial | `src/lib/commercial/**` (train V3) | Catalogue, remises, autorisations, mapping Stripe — Drone s'y branche, ne le duplique pas |
| Accès support strict | lot `feat/platform-cross-app-support-access-communications-v1` | Justification, périmètre par application, durée, notification, bandeau, audit |
| Noyau Drone | `packages/drone-core` | 19 entités, contrats d'export, ports |

---

## 6. Obsolète ou contradictoire

| Élément | Problème | Traitement |
|---|---|---|
| Scénarios nationaux S-1 / S-2 / S-3 | **Supprimés au 1ᵉʳ janvier 2026** | Toute fiche de préparation antérieure est périmée. Voir `ELSATIA-DRONE-SECURITY-PRIVACY-COMPLIANCE-V1.md` |
| Brevets télépilote par déclaration sur l'honneur (BAPD) | **Invalides depuis le 1ᵉʳ janvier 2026** | Idem |
| §3.5 « Alternative non-DJI — Parrot » de la matrice du 2026-09-07 | Sous-estime nettement Parrot | Corrigé dans `ELSATIA-DRONE-SDK-HARDWARE-COMPATIBILITY-V1.md` |
| Recommandation tarifaire « 129 € HT/mois » | Recommandation, **jamais arbitrée** | Traitée comme hypothèse dans `ELSATIA-DRONE-BUSINESS-MODEL-V1.md` |
| `docs/drone/` non suivi du worktree principal | Copie fantôme | Signalé au §4.6, non modifié |

---

## 7. Ce que ce lot ajoute, et pourquoi

| Livrable | Manque comblé |
|---|---|
| `FUNCTIONAL-SPECIFICATION-V1` | Positionnement **Drone vs Scan**, 18 rôles, 22 types de missions — aucun n'existait |
| `SDK-HARDWARE-COMPATIBILITY-V1` | Re-vérification au 2026-09-08 + **Parrot complet (iOS, Web API, BSD-3)**, absent de la V1 |
| `MISSION-FLIGHT-DATA-MODEL-V1` | Préparation de vol, checklist, états étendus, journal — le modèle du 2026-09-07 s'arrête aux entités |
| `OFFLINE-MEDIA-SYNC-V1` | Transposition explicite des acquis Réserves V5/V6, jamais faite pour Drone |
| `MEASUREMENT-PHOTOGRAMMETRY-V1` | Échelle de six niveaux de mesure et **protocole d'étalonnage**, absents |
| `GP-RESERVES-DOE-BRIDGES-V1` | Les trois ponts, au niveau contrat. §N de l'architecture V1 restait allusif |
| `SECURITY-PRIVACY-COMPLIANCE-V1` | Cadre réglementaire **daté et sourcé**, post-2026 |
| `BUSINESS-MODEL-V1` | Trois modèles chiffrés en méthode, branchés sur le moteur commercial |
| `IMPLEMENTATION-ROADMAP-V1` | Phasage tenant compte du Train V3 et du socle multiproduit |
| `TEST-STRATEGY-V1` | 40 tests spécifiés, dont ceux qui protègent les interdits |
| `WIREFRAMES-V1` | Aucun écran n'a jamais été dessiné |

---

## 8. Verdict d'audit

**`GO ARCHITECTURE SOUS CONDITIONS`.**

L'architecture est saine, le noyau est de bonne facture, et l'honnêteté méthodologique du lot
du 2026-09-07 (refus d'inventer un seuil, refus de tarifer sans mesure, refus d'autoriser ODM)
est un actif qu'il faut protéger.

Trois conditions, aucune n'est un développement :

1. **Avis d'un conseil en propriété intellectuelle sur l'AGPL-3.0 d'OpenDroneMap.**
2. **Test matériel réel** (Mini 3 + RC-N1 + Android) avant toute promesse de mode connecté.
3. **Arbitrage de priorité** face au Train V3, à ELSATIA-UI-V2 et au cutover Production.

Et un préalable de séquence : **aucun développement Drone ne doit précéder le socle
multiproduit du Train V3**, pour la même raison qui a déjà été retenue pour Market — un
sixième produit branché sur un moteur commercial non stabilisé multiplie la dette au lieu de
la porter.
