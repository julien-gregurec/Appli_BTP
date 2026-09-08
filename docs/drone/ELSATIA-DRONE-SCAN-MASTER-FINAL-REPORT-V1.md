# ELSATIA Drone / Scan — Rapport final du lot architecture

> Lot `ELSATIA-DRONE-SCAN-ARCHITECTURE-MASTER-V1`, exécuté le **2026-09-08**.
> Branche `audit/elsatia-drone-scan-architecture-master-v1`.
> Base : `698eb54a08bf91ccfa1cfc902cdaaa1994586b4d`.

---

## 1. Verdict

# `GO ARCHITECTURE SOUS CONDITIONS`

L'architecture est saine et le noyau existant est de bonne facture. Le produit n'est bloqué
par aucune difficulté technique majeure — il est bloqué par **six décisions et mesures qui
n'ont pas été prises**, dont aucune ne s'obtient en écrivant du code.

---

## 2. Le constat qui a redéfini la mission

Le brief supposait ELSATIA Drone à l'état d'idée. **C'était faux.** Un lot livré le
2026-09-07 porte déjà :

| Élément | SHA | Volume |
|---|---|---|
| Étude d'architecture (5 documents) | `ace45f6ab0ac8bab99ab1fd4abcf9f97ef9c12d1` | 1 663 lignes |
| `packages/drone-core` — 19 entités, 5 contrats d'export, 4 ports | `8dcf5b8c57116ba76ee908b8b339d58c861db18e` | 48 fichiers, 67 tests |
| `packages/drone-photogrammetry` — ODM / Metashape / démo, file, ingestion | `698eb54a08bf91ccfa1cfc902cdaaa1994586b4d` | 35 fichiers, 101 tests |

`698eb54` contient `8dcf5b8` : **une seule ligne Drone**, base `996be15`, **zéro migration**
(vérifié : `git diff --name-only 996be15 698eb54 -- supabase/` est vide).

La mission a donc été exécutée comme une **seconde génération** : auditer, re-vérifier,
combler — jamais réécrire. Réécrire aurait produit deux documents contradictoires sur chaque
sujet.

---

## 3. Sept constats d'audit

| # | Constat | Gravité |
|---|---|---|
| 1 | La doctrine de provenance du noyau cite `apps/tools/src/lib/tracing/measurement-origin.ts`, **absent de `996be15`, de `1fc1331` et de `main`** — présent uniquement sur ~50 branches Tools | **P1** — dette de convergence |
| 2 | **ODM reste commercialement interdit** : AGPL-3.0, clause réseau, conseil PI non saisi | **P0** juridique |
| 3 | **Aucune mesure de précision n'existe** — ni benchmark, ni campagne métrologique, ni test matériel | **P0** produit |
| 4 | **L'infrastructure de traitement asynchrone n'existe nulle part** : ni file distribuée, ni worker, ni GPU | **P0** |
| 5 | `drone` n'est pas enregistré dans `applications_elsatia` (`gestion_pro`, `colors`, `reserves` seuls) | P2 |
| 6 | `docs/drone/` **et** l'audit d'architecture DOE (63 ko, verdict `GO`) existent **non suivis par git** dans le worktree principal | P2 |
| 7 | La base Drone `996be15` est **en retard sur le train canonique V2** `1fc1331` et sur tout le Train V3 | P2, assumé |

---

## 4. Trois faits externes vérifiés le 2026-09-08

1. **DJI MSDK V5 confirmé à 5.18.0**, Android uniquement, liste d'aéronefs inchangée. Les
   faits `[V]` de la matrice du 2026-09-07 tiennent.
2. **Parrot a été sous-estimé** : Ground SDK **Android (Java) et iOS (Swift)**, Olympe
   (Python), Air SDK embarqué, **Drone Web API REST + websocket**, licence **BSD-3**, sans clé
   révocable. C'est la **seule voie connue vers un mode connecté sur iPhone**.
3. **La réglementation française a changé au 1ᵉʳ janvier 2026** : fin des scénarios nationaux
   S-1/S-2/S-3 (STS-01/STS-02 européens seuls), et **invalidation des brevets obtenus par
   déclaration sur l'honneur**. Toute fiche de préparation antérieure est périmée.

---

## 5. Recommandations structurantes

| Sujet | Recommandation |
|---|---|
| **Nom** | **`ELSATIA Scan`**, « drone » comme mot-clé de communication. La V1 ne pilote aucun drone et 14 des 22 types de missions n'en exigent aucun : nommer « Drone » un produit qui n'en a pas besoin crée une promesse fausse |
| **Périmètre V1** | Import, organisation, annotation, mesure **niveau ≤ 4**, rapports, hors-ligne. **Sans photogrammétrie, sans SDK, sans IA** |
| **Acquisition** | **L'import est le mode nominal**, pas un repli. Le SDK arrive en dernier : il coûte le plus et atteint le moins de clients |
| **Mesure** | **Six niveaux**, dont le niveau 6 « certifié » **hors ELSATIA**. Refus de produire une quantité sans mise à l'échelle ; refus du niveau 5 sous 3 points de calage répartis |
| **Photogrammétrie** | **Import de modèle externe en V1** (12 formats déjà détectés). Reconstruction propriétaire en V2, si l'avis PI le permet |
| **IA** | Fonctions **locales seulement** (doublons, sélection, floutage). Détection de défauts et suggestion de réserves **refusées** |
| **Ponts** | Rang 0 = aucun pont branché, et c'est **l'état par défaut**, pas une transition |
| **Modèle économique** | **Socle léger + usage facturé.** Tous les prix sont `a_definir`, donc **interdits à la vente** |
| **Séquence** | **Aucun développement Drone avant le socle multiproduit du Train V3** — même raison que pour Market |

---

## 6. Décisions demandées à Julien

| # | Décision | Bloque |
|---|---|---|
| 1 | **Nom : Drone ou Scan ?** | `code` applicatif, sous-domaine, site, paquets |
| 2 | **Saisir un conseil PI sur l'AGPL-3.0 d'ODM** — dossier déjà prêt | Toute photogrammétrie propriétaire |
| 3 | **Financer la campagne métrologique** (3 scènes, levé géomètre) | Tout seuil, toute annonce de précision, tout métré vendu |
| 4 | **Financer le test matériel** Mini 3 + RC-N1 + Android | Toute promesse de mode connecté |
| 5 | **Chiffrer l'hébergement** GPU + stockage | Tout tarif, tout stockage inclus |
| 6 | **Priorité de Drone** face au Train V3, à UI-V2 et au cutover | Le calendrier entier |
| 7 | **Prestataire télépilote** : invité borné (recommandé) ou entreprise tierce ? | Modèle d'habilitation |
| 8 | **Parrot** : engager un test matériel, ou rester DJI seul ? | La voie iOS connectée |

**Aucune de ces huit décisions ne se prend en écrivant du code.**

---

## 7. Estimation de réalisation

| Ensemble | Estimation | Confiance |
|---|---|---|
| **L1 → L5 — produit vendable, autonome** | **11 à 15 semaines** | Moyenne |
| L6 → L8 — ponts GP / Réserves / DOE | 4 à 6 semaines | Moyenne |
| L9 — infrastructure de traitement | 6 à 10 semaines | **Faible — rien n'existe** |
| L10 + L11 — reconstruction et niveau 5 | 4 à 8 semaines | Faible |
| L14 — mode connecté | 8 à 16 semaines | **Très faible** |

Pour une personne, préalables hors développement exclus. **Le chemin le plus court vers un
produit vendable est aussi celui dont l'estimation est la plus fiable**, parce qu'il ne dépend
d'aucune inconnue externe.

---

## 8. Suivi du temps

| Phase | Estimation initiale | Temps réel | Écart |
|---|---|---|---|
| A — Audit Git | 60–90 min | ~30 min | **Plus rapide** — une seule ligne Drone, historique propre |
| B — Worktree | 10 min | ~5 min | Conforme |
| C — Recherche externe | 90–120 min | ~25 min | **Plus rapide** — sources primaires atteintes directement |
| D→L — Rédaction des 12 livrables | 7 h – 8 h 30 | ~3 h 30 | **Plus rapide** — l'existant a servi de socle |
| M — Contrôle, commit, push | 30 min | ~20 min | Conforme |
| **Total** | **9 h – 12 h** | **≈ 4 h 30** | **−50 % à −60 %** |

**Cause principale de l'écart :** la découverte, en phase A, que le lot du 2026-09-07 existait
déjà. Réécrire 1 663 lignes aurait coûté les heures estimées ; les auditer et les compléter en
a coûté la moitié — et produit un résultat plus juste, puisqu'aucune contradiction n'a été
introduite.

**Cause secondaire :** la campagne métrologique, le test matériel et le chiffrage
d'hébergement — qui auraient absorbé l'essentiel du temps restant — **ne sont pas exécutables
depuis un clavier**. Ils sont spécifiés, pas faits.

---

## 9. Livraison

| Élément | Valeur |
|---|---|
| Branche | `audit/elsatia-drone-scan-architecture-master-v1` |
| SHA de base | `698eb54a08bf91ccfa1cfc902cdaaa1994586b4d` |
| Worktree | `/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/drone-scan-architecture-master-v1` |
| Fichiers créés | 13 documents dans `docs/drone/` |
| Fichier modifié | `docs/drone/README.md` (index) |
| Migrations | **0** |
| Code applicatif | **0** |
| Objets Stripe | **0** |
| Déploiement | **0** |
| PR | **Aucune** |
| Fusion | **Aucune** |

### Confirmations

- `supabase/migrations` : **inchangé**.
- `packages/`, `src/`, `apps/` : **inchangés**.
- Aucun fichier `.sql.proposed` créé.
- Aucun numéro de ledger réservé.
- Aucun objet Stripe Test ou Live touché.
- Le dépôt du site (`elsatia-site`) n'a pas été ouvert.
- Le worktree du Train V3
  (`/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/train-v3-commercial` @ `8af11b8`) et sa branche
  n'ont **jamais** été touchés.
- Aucun fichier, stash, worktree ou branche supprimé. Aucun `git reset --hard`.

---

## 10. Ce que ce lot ne prouve pas

Il ne prouve **aucune** compatibilité matérielle, **aucune** précision de mesure, **aucun**
coût de traitement, **aucune** conformité réglementaire d'une opération réelle, et **aucune**
autorisation d'exploiter OpenDroneMap.

Il documente ce qu'il faut faire pour le savoir. C'est différent, et il faut que ce soit dit
clairement : c'est précisément la confusion entre « documenté » et « prouvé » qui a coûté à
Réserves un mode hors-ligne annoncé en V4 et mesuré inexistant.
