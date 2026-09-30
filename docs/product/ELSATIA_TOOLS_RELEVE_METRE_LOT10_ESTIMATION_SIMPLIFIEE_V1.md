# ELSATIA Tools — Relevé & Métré — Lot 10 — Estimation simplifiée V1

**Date** : 2026-09-30
**Branche** : `claude/blissful-thompson-ipjcxl` (branche de session imposée, voir D1)
**Base** : Lot 9 qualifié `claude/compassionate-volta-cnbzjs` @ `a622540` (*RELEVE METRE LOT 9 LOCALLY QUALIFIED*).
**Nature** : rapport autonome. Tout ce qui est affirmé ici a été exécuté dans cette session.
**Règle produit appliquée** : TOOLS = estimation simplifiée ; GESTION PRO = chiffrage complet, devis, marge, vente.
**Hors périmètre, volontairement** : devis, facture, commande, signature, workflow accepté / refusé, TVA, marge, remise, prix de vente (tous refusés, §15), appareils physiques, Preview, production, PR, merge.

---

## 0. Verdict

> **RELEVE METRE LOT 10 LOCALLY QUALIFIED**

Le quantitatif du Lot 9 reçoit une **estimation simplifiée HT**. Chaque ouvrage peut porter un **prix estimatif structuré**, qui reste facultatif : composantes **MATÉRIAU** (€/unité), **MAIN D'ŒUVRE** (heures par unité × taux horaire), **FORFAIT** (montant fixe par ouvrage), **AUTRE** (€/unité), plus un **coefficient simple**. Une saisie rapide « prix unitaire global » crée une seule composante typée, ce qui garde les données structurées.

- **Calcul par le serveur** : moteur SQL pur, arithmétique entière, arrondi au centime « moitié loin de zéro » par composante. Le domaine TypeScript en est le **miroir exact**, avec une parité prouvée sur **3 000 cas aléatoires** et sur un jeu figé de 40 cas vérifié par Vitest ET pgTAP.
- **Quantité utilisée** : la quantité **retenue** du Lot 9, pertes et arrondis compris. **La perte n'est jamais réappliquée.**
- **Affichage et exports** :
  - ligne : quantité × PU = total ;
  - sous-total par lot (ou par chantier / bâtiment / étage / zone / pièce / ouvrage) et total chantier ;
  - coût **dépose / neuf / déplacement / travaux sur existant / total projet** ;
  - répartition par type et heures estimées ;
  - exports **CSV**, **JSON** (contrat **`elsatia.tools.estimation` 1.0.0**) et **impression / PDF navigateur**.
- **Corrections auditées** : montant automatique conservé, montant retenu, raison, auteur, date, retrait tracé, obsolescence signalée.
- **Versioning** : estimation **figée avec le plan**. Un plan dérivé reçoit ses prix copiés et est recalculé indépendamment ; les corrections ne sont pas copiées.
- **Bibliothèque** : prix facultatif par ouvrage de bibliothèque.
- **Multi-scénario (préparation)** : comparaison **solution A / solution B** = deux plans d'un même étage.

« Locally qualified » : PostgreSQL 16 avec les 352 vraies migrations et la vraie RLS, vrai GoTrue, vrai PostgREST, vrai Chromium. **Tablette : MOBILE EMULATED ONLY.** Performances mesurées en `next dev`, pile locale.

### Chiffres clés (exécutés sur HEAD)

| Contrôle | Résultat |
|---|---|
| Install fraîche | **352 / 352** migrations |
| pgTAP Relevé (13 fichiers) | **734 / 734** (Lots 2–9 : 667 inchangés, **Lot 10 : 67**) |
| pgTAP suite complète | 146 fichiers, 3 929 tests. **Mêmes 9 fichiers en échec, mêmes compteurs** que sur une base Lot 9 reconstruite dans la même session (3 862 tests), soit uniquement +67 Lot 10, tous verts. Ce sont les limites du banc : Studio ×7, `platform_stripe_state_attestation_r72` (pgsodium), `elsatia_tools_cloud_sync_entitlement_closure_v1` |
| Parité moteur SQL ↔ TS | **3 000 cas aléatoires** (40 578 lignes, 13 831 anomalies) identiques. Jeu figé de 40 cas (473 lignes) vert en Vitest et en pgTAP (P1) |
| Vitest `packages/releve-domain` | **371 / 371** avec le jeu étendu (Lot 9 : 333 ; +38) |
| Vitest racine | **2 224 / 2 224** (178 fichiers ; +1 test ignoré hors variable `ESTIMATION_PARITE_EXTRA` : la parité étendue opt-in) |
| Vitest `apps/tools` | **2 154 / 2 154** (188 fichiers ; +4) |
| `tsc --noEmit` racine et `apps/tools` | 0 erreur |
| ESLint `apps/tools` (`npm run lint`), domaine, recette, script de parité | 0 erreur, 0 avertissement |
| Build Tools web / natif (Capacitor) / Gestion Pro | OK. `/releves/estimation` est statique (web et export natif) |
| Playwright Lot 10 `tools-releve-lot10.spec.ts` | **10 / 10**, deux passages complets verts (desktop, tablette, sécurité, versions, bibliothèque, exports, performance 100 / 1 000 / 5 000 lignes) |
| Playwright non-régression Lots 8 + 9 | **24 / 24** |
| Playwright non-régression Lots 6 + 7 | **31 / 31** |
| Playwright non-régression Lots 2 + 3 + 4 + 5 + Atelier | **52 / 52** |
| Performance 5 000 lignes (pile réelle) | calcul serveur **0,98 s** · édition d'un prix (RPC) **0,02 s** · recalcul **0,89 s** · changement de sous-total **0,49 s** · export CSV **0,23 s** · JSON **1,08 s** |

## 1. Base et branche

- `git fetch` de `claude/compassionate-volta-cnbzjs` (Lot 9 qualifié, `a622540`).
- **D1** : la branche de session `claude/blissful-thompson-ipjcxl` pointait localement sur `main` (`4d92ddb`, ancêtre du Lot 9, sans commit propre, absente du dépôt distant). Elle a été repositionnée sur `a622540`, puis poussée (nouvelle branche distante). Aucune PR, aucun merge.

| Commit | Objet |
|---|---|
| `8e50ed5` | migration 1401 (additive) + pgTAP Lot 10 |
| `677ae3a` | domaine : moteur miroir, sous-totaux, comparaison, CSV, contrat GP, jeu de parité |
| `7ab8e72` | Tools : vue Estimation, dépôt Supabase, navigation, liens |
| `ddbbeab` | recette Playwright Lot 10 + rendu mémoïsé |
| *(ce rapport)* | rapport Lot 10 |

## 2. Architecture — une couche séparée, le serveur calcule

Le quantitatif du Lot 9 **reste sans prix** : son contrat d'ouvrage, sa bibliothèque et son contrat GP 1.0.0 sont inchangés, et le contrat d'ouvrage refuse toujours toute clé de prix (pgTAP S7–S8). L'estimation est une **couche séparée** posée sur les quantités retenues.

| Couche | Fichier | Rôle |
|---|---|---|
| Serveur | migration `20260930001401` | contrat de prix (`tools_releve_prix_anomalie`), moteur pur (`tools_releve_estimation_evaluer`), 3 tables, gardes, reprise des prix (copie, bibliothèque), RPC, gel |
| Domaine | `packages/releve-domain/src/estimation.ts` | énumérations, contrat, **miroir exact** du moteur (BigInt), détail, sous-totaux, dépose / neuf / déplacement, comparaison, formats, CSV, contrat GP et sa validation, port de persistance |
| Parité | `scripts/releve/estimation-parite.mjs`, `estimation-parite.fixture.json` | entrées aléatoires déterministes, résultat attendu calculé par le serveur |
| Accès | `apps/tools/src/lib/releve/plan/supabase-estimation-repository.ts` | RPC uniquement ; aucun montant envoyé |
| Pièces jointes | `apps/tools/src/lib/releve/plan/estimation-export.ts` | photos (chemins de stockage, légende, pièce), annotations |
| Vue | `components/releve/estimation/ReleveEstimationWorkspace.tsx`, route `/releves/estimation?id=&etat=&niveau=` | tuiles, sous-totaux, prix par plan, corrections, bibliothèque, comparaison, exports |

**Modèle** (3 tables, `entreprise_id`, RLS lecture seule pour `authenticated`, écriture par RPC seulement) :

- `tools_releves_estimation_prix` : prix d'un ouvrage de plan ;
- `tools_releves_bibliotheque_prix` : prix facultatif d'un ouvrage de bibliothèque ;
- `tools_releves_estimation_ajustements` : corrections de montant ;

plus une colonne `tools_releves_plans.estimation` (estimation figée).

## 3. Modèle (§1, §2, §6)

Contrat d'un prix, identique en SQL et en TS. Les clés inconnues sont refusées, TVA, marge, remise et prix de vente compris.

| Élément | Contrat | Précision / bornes |
|---|---|---|
| `composantes` | 1 à 12 | — |
| `materiau` / `autre` | `prixUnitaire` (€ HT par unité de l'ouvrage) | 4 décimales, 0 – 1 000 000 |
| `main_d_oeuvre` | `heuresParUnite` × `tauxHoraire` (interne ou estimatif) | 4 décimales (0 – 10 000 h) ; 2 décimales (0 – 10 000 €/h) |
| `forfait` | `montant` fixe par ouvrage | 2 décimales, 0 – 10⁸ |
| `coefficient` | simple (difficulté, accès…), 1 par défaut | 0,01 – 10, 4 décimales |
| `libelle`, `commentaire` | facultatifs | 120 / 500 caractères |

Par ligne (ouvrage × pièce × état), le moteur produit :

- la quantité (retenue, Lot 9) ;
- le PU composite ;
- les montants par type (au centime) ;
- les heures ;
- le coût estimatif (montant automatique) ;
- l'éventuelle correction ;
- le total retenu.

**Main d'œuvre** : heures estimées et taux seulement. Ni salaires, ni charges, ni marge, ni coût de revient GP.

## 4. Arrondis et pertes (§7, §8)

- Quantité = **quantité retenue** du quantitatif (Lot 9 : opérations → perte → arrondi → 3 décimales). **Aucune perte dans un prix** : la clé `pertePourcent` est refusée (pgTAP C8, Playwright).
- Exemple réel (Playwright, pgTAP E3/E5) : peinture Séjour 29,683 m² nets + 5 % = **31,167 m²** (Lot 9) × (3,50 + 0,25 h × 45 €) = 109,08 + 350,63 = **459,71 €**. Plinthes 12,915 ml (perte comprise) × 8,90 € = **114,94 €**.
- Même règle que le Lot 9 : arithmétique entière, arrondi « moitié loin de zéro ».
  - Échelles : quantité 10⁻³, prix 10⁻⁴ €, heures 10⁻⁴ h, taux et forfait 10⁻² €, coefficient 10⁻⁴.
  - **Chaque composante est arrondie au centime sur chaque ligne** ; le montant de ligne est leur somme ; les sous-totaux sont des sommes de lignes.
  - Il n'y a donc **aucun écart d'arrondi** entre les lignes, les lots et le total (Vitest : la somme des lots égale le total, pour 7 niveaux).

## 5. TVA (§5)

L'estimation est **HT, estimative, en euros**. Il n'existe ni champ TVA, ni TTC, ni régime de TVA : les clés `tva`, `marge`, `remise` et `prixVente` sont refusées par le contrat (C2) et par la validation du contrat GP.

L'écran l'annonce : « Ce n'est ni un devis ni une facture : prix de vente, marge, remise, TVA et devis sont décidés dans Gestion Pro. »

La mission autorise explicitement l'HT : **aucun DECISION_REQUIRED** sur ce point.

## 6. Bibliothèque (§3)

- Prix **facultatif** par ouvrage de bibliothèque (panneau « Bibliothèque : prix facultatifs »). Une entrée sans prix reste exploitable (B3).
- Reprise automatique à la création d'un ouvrage **depuis la bibliothèque**. Le prix est un instantané : une modification ultérieure de la bibliothèque est sans effet (V4).
- « Appliquer les prix de la bibliothèque » : complète **seulement les ouvrages sans prix**, par lien de bibliothèque puis par **code** (catalogue du Lot 9). Aucun prix existant n'est écrasé (B6, Playwright).
- Un ouvrage **sans prix** reste exploitable en quantitatif : ligne « sans prix », hors total, anomalie de gravité *information*.

## 7. Estimation, sous-totaux, existant / dépose / neuf (§4, §9)

- Tuiles : **Total projet HT**, **Dépose**, **Neuf**, **Déplacement**, **Travaux sur existant**, **heures de main d'œuvre**, compteurs (lignes, sans prix, corrigées). Répartition par type (matériau / main d'œuvre / forfait / autre) et écart des corrections.
- **Sous-totaux** par lot (par défaut) ou par chantier, bâtiment, étage, zone, pièce ou ouvrage. Chaque ouvrage affiche quantité × PU (+ forfait) = montant. Le **total chantier** est la somme exacte des lignes.
- Plan projeté réel (Playwright) :

| Poste | Calcul | Montant |
|---|---|---|
| Démolition de cloison | 10,00 m² × 0,5 h × 40 € | **200,00 €** (dépose) |
| Cloison neuve | 9,50 m² × (18 + 0,6 h × 45 €) | **427,50 €** (neuf) |
| Déplacement de radiateur | 2 h × 50 € | **100,00 €** (déplacement) |

- FORFAIT : une ligne par ouvrage, dans l'état de travaux de l'ouvrage, sans pièce. Exemple : portes existantes 2 × 250 € = 500 € (existant) + évacuation 80 € (neuf).

## 8. Corrections manuelles (§10)

`tools_releve_estimation_ajuster(plan, ouvrage, pièce, état, nature, montant, raison)` :

- **montant automatique lu par le serveur** ;
- montant retenu (≥ 0, 2 décimales) ;
- **raison obligatoire** ;
- auteur (`auth.uid()`), date serveur, journal.

Une nouvelle correction **retire** la précédente (tracé). Le retrait ramène au montant automatique. Une correction est immuable et aucune écriture directe n'est possible.

Affichage : « Retenu 100,00 € au lieu de 114,94 € — « raison » · date ». Si le montant automatique change (prix modifié, quantité changée), la correction devient **obsolète** : anomalie `estimation_obsolete`, jamais remplacée en silence. Une correction sans ligne est `ajustement_orphelin`. Un ouvrage supprimé voit ses corrections retirées (tracées).

Audit complet : `tools_releve_estimation_corrections(plan)` (actives et retirées). Chaque saisie de prix est journalisée **avant / après** avec son auteur (E12).

## 9. Versioning (§11)

- **Gel** : `tools_releve_plan_figer` est redéfini (même signature, mêmes droits). Il écrit `plans.estimation` sur le **quantitatif figé**, que la garde du Lot 5 rend immuable, même pour le propriétaire des tables (V5). Les prix et corrections d'un plan figé sont immuables (V2, V3, V6). L'estimation figée reste inchangée si la hauteur ou la bibliothèque changent ensuite (V4).
- **Plan dérivé** : prix **copiés** (origine `copie`), corrections **non** copiées, recalcul **indépendant** sur ses propres quantités. Exemple V8 : à 3,00 m, 36,35 m² + 5 % = 38,168 m² × 15,25 € = 582,06 €.
- Plans figés avant le Lot 10 : estimation recalculée à la lecture depuis leur quantitatif figé, signalée `recalcul_plan_fige_avant_lot10`.

## 10. Multi-scénario (§12) — préparé, sans moteur complexe

Une **solution** est un **plan** d'un étage. La contrainte existante « un seul plan modifiable par étage et par état » donne la séquence suivante : solution A figée, puis solution B dérivée.

- `tools_releve_estimation_plans(étage)` liste les plans.
- `comparerEstimations(A, B)` calcule l'écart B − A par lot, par état et au total, ainsi que les heures.
- Panneau « Comparer deux solutions » dans la vue.

Playwright : A figé « Solution A », B dérivé avec une peinture plus chère ; l'écart exact est affiché au total et sur le lot Peinture.

## 11. Exports (§13)

| Export | Contenu |
|---|---|
| **CSV** (Excel FR : `;`, virgule, BOM) | chantier → pièce, lot, catégorie, code, ouvrage, nature, état, unité, quantité, PU, matériau, MO, forfait, autre, heures, montant automatique, montant retenu, corrigé, raison, anomalies ; **dernière ligne : total chantier HT** |
| **JSON** | contrat Gestion Pro (§12) |
| **Impression / PDF navigateur** | « Imprimer / PDF » déplie les cartes et masque les commandes (`@media print`). Playwright : `window.print` appelé, cartes ouvertes, commandes masquées en média *print*, PDF Chromium produit (≈ 125 Ko) |

## 12. Contrat Gestion Pro (§14)

**Nouveau contrat versionné `elsatia.tools.estimation` 1.0.0** (`buildEstimationGpPayload`, voir D3) :

| Section | Contenu |
|---|---|
| `readiness` | `contract-only`, `devis: not-generated`, `documentsCommerciaux: none` |
| `montants` | EUR, **HT**, estimative |
| `perimetre.decideParGestionPro` | prix de vente, marge, remise, TVA, devis final |
| `quantitatif` | **contrat `elsatia.tools.quantitatif` 1.0.0 imbriqué, inchangé et toujours sans prix** : plans, ouvrages, quantités, états projetés, annotations de ligne |
| `pieces` | chemin, usage, hauteur, surface de sol, périmètre utile |
| `prix` | composantes structurées, coefficient, PU, forfait, origine |
| `lignes` | quantité, PU, montants par type, heures, automatique / retenu, correction avec raison, auteur et date, emplacement, référence de la ligne de quantité |
| `totaux` | total, par état, par type, par lot, heures, écart des corrections |
| `etatsProjetes` | dépose / neuf / déplacement / existant / total |
| `revetements` | métré du Lot 8 |
| `photos` | références de stockage, légende, pièce ; aucun octet copié |
| `annotations` | texte, forme, pièce, cible |
| `anomalies` | hors *information* |

Tous les montants sont en **chaîne décimale exacte**. La clé d'idempotence couvre le relevé, l'état, les plans (numéro, gel) et l'empreinte des quantités et montants retenus.

`validateEstimationGpPayload` (côté GP) vérifie : version majeure 1, montants HT décimaux, références résolues, contrat quantitatif imbriqué recevable, et **aucune donnée commerciale** (numéro de devis, facture, commande, signature, marge, remise, TVA, TTC, prix de vente). **Aucun devis n'est créé.**

## 13. Pas de devis dans Tools (§15)

- Aucune table, colonne ni fonction de devis, facture, commande, signature, TVA, marge ou remise dans `tools_releves%` (pgTAP S9).
- Contrat de prix et validation GP : ces clés sont refusées.
- Écran (Playwright) : aucun « devis n° », « facture n° », « bon de commande », « TTC », « signature », « accepté » ou « refusé ».

## 14. Performances (§16)

**Domaine seul (Vitest)**

| Lignes | Calcul | Édition prix + recalcul | Détail + sous-totaux | Export CSV + GP |
|---|---|---|---|---|
| 100 | 2 ms | 1 ms | 2 ms | 5 ms |
| 1 000 | 14 ms | 13 ms | 11 ms | 26 ms |
| 5 000 | 74 ms | 45 ms | 50 ms | 91 ms |

Correction appliquée : l'export GP était quadratique (252 ms à 5 000 lignes) ; il est désormais indexé (91 ms).

**Moteur SQL (psql, 5 000 lignes)** : quantitatif 0,51 s + estimation **0,33 s**.

**Pile réelle (Playwright, `next dev`, second passage)** :

| Lignes | Calcul (RPC) | Édition prix (RPC) | Recalcul | Vue complète | Édition prix à l'écran | Changement de sous-total | CSV | JSON |
|---|---|---|---|---|---|---|---|---|
| 100 | 48 ms | 12 ms | 42 ms | 1,8 s | 155 ms | 76 ms | 37 ms | 242 ms |
| 1 000 | 195 ms | 25 ms | 210 ms | 2,4 s | 420 ms | 98 ms | 69 ms | 399 ms |
| 5 000 | 984 ms | 22 ms | 891 ms | 3,6 s | 1,67 s | 486 ms | 226 ms | 1,08 s |

- Corrections faites pendant la recette :
  - les corps des sous-totaux ne sont rendus qu'à l'ouverture ;
  - plans et cartes d'ouvrage sont mémoïsés (signature de contenu) ;
  - effet mesuré : changement de sous-total 2,77 s → 0,49 s, édition à l'écran 2,86 s → 1,67 s, dont ≈ 1 s de recalcul serveur.
- « Vue complète » comprend la lecture de structure du relevé (limite connue depuis le Lot 8). Le JSON comprend le chargement du métré et des photos.

## 15. Tablette (§17)

Tablette 820 × 1180 tactile (Playwright, émulation) :

- cartes uniquement, **aucune `<table>`**, **aucun débordement horizontal** ;
- cibles ≥ 40 px ;
- un prix est saisi, puis une correction, au doigt ;
- le niveau de sous-total se change à l'écran.

## 16. Tests (§18)

| Suite | Fichier | Tests |
|---|---|---|
| pgTAP | `elsatia_tools_releve_metre_lot10_estimation_simplifiee.test.sql` | **67** : S1–S9 schéma / droits / Lot 9 sans prix / aucun devis, C1–C8 contrat, **P1 parité**, E1–E12 estimation réelle, B1–B7 bibliothèque, A1–A10 corrections, V1–V9 versioning, T1–T7 isolation |
| Vitest domaine | `estimation.test.ts` | 38 : énumérations / messages SQL, **P1** (40 cas + jeu étendu opt-in), contrat (17 cas), cas BTP (perte non réappliquée, arrondi par composante, forfait, sans prix, corrections, prix invalide), sous-totaux 7 niveaux, dépose / neuf / déplacement, A / B, CSV, contrat GP, performance 100 / 1 000 / 5 000 |
| Vitest Tools | `plan-lot10.test.ts` | 4 : navigation, dépôt (RPC seulement, aucun montant envoyé), refus serveur, pièces jointes |
| Playwright | `tools-releve-lot10.spec.ts` | 10 : prix → montants, sous-totaux + exports + impression, corrections, bibliothèque, dépose / neuf / déplacement + versions + A / B, sécurité, **tablette**, performance 100 / 1 000 / 5 000 |

Commandes rejouables :

```text
scripts/local-postgres-bootstrap/rebuild_db.sh lot10_fresh                          → 352 migrations OK
cd supabase/tests && pg_prove -d lot10_fresh elsatia_tools_releve_metre_*.test.sql → 734/734
cd supabase/tests && pg_prove -d lot10_fresh *.test.sql                             → 146 fichiers, 9 KO connus (identiques au Lot 9)
node scripts/releve/estimation-parite.mjs <base> 3000 777 /tmp/p.json               → jeu étendu (le jeu figé : 40 cas, graine 20260930)
ESTIMATION_PARITE_EXTRA=/tmp/p.json npx vitest run packages/releve-domain           → 371/371
npx vitest run ; (apps/tools) npx vitest run ; npx tsc --noEmit ; (apps/tools) npx tsc --noEmit ; (apps/tools) npm run lint
(apps/tools, NEXT_PUBLIC_TOOLS_ENV=local …) npm run build ; npm run build:native ; (racine) npm run build:gestion-pro
scripts/local-postgres-bootstrap/releve_e2e_stack.sh + (apps/tools) next dev --webpack -p 3020
  + npx playwright test tests/e2e/tools-releve-lot10.spec.ts --project=desktop-chromium                      → 10/10 (×2)
  + npx playwright test tests/e2e/tools-releve-lot{8,9}.spec.ts --project=desktop-chromium                  → 24/24
  + npx playwright test tests/e2e/tools-releve-lot{6,7}.spec.ts --project=desktop-chromium                  → 31/31
  + npx playwright test tests/e2e/tools-releve-lot{2,3,4,5}.spec.ts tests/e2e/tools-atelier-lot5-nonregression.spec.ts --project=desktop-chromium → 52/52
```

## 17. Sécurité

| Profil | Résultat (pgTAP + Playwright) |
|---|---|
| métreur | prix, import, corrections, bibliothèque de prix (plan non figé) |
| consultation | lit estimation, synthèse et plans ; aucune écriture (42501) |
| **autre tenant** | estimation, synthèse, plans, prix, corrections, bibliothèque : 42501 ; rien de visible |
| anonyme | aucune RPC |
| plan figé | estimation figée ; aucune écriture, même par le propriétaire des tables |
| écriture directe | tables en lecture seule ; contrat vérifié par CHECK même pour `service_role` |

- Fonctions internes non exécutables par `authenticated` : `tools_releve_plan_estimation_calcul`, `tools_releve_estimation_prix_json`, `tools_releve_plan_estimation_lire`, `tools_releve_estimation_prix_ecrire`, déclencheurs.
- Le moteur pur `tools_releve_estimation_evaluer` est exécutable : il ne lit aucune table.
- Seule redéfinition : `tools_releve_plan_figer`, à l'identique plus l'estimation figée.
- Additions au Lot 9 : deux déclencheurs sur `tools_releves_ouvrages` (reprise du prix à la création ; retrait tracé des corrections à la suppression) et une fonction exportée `niveauCle` dans le domaine.
- Aucune garde affaiblie, aucune ligne existante réécrite.

## 18. Non-régression

- pgTAP Relevé Lots 2–9 : 667 / 667 sur la base Lot 10, **aucun test adapté**. Le contrat d'ouvrage du Lot 9 refuse toujours les prix.
- Playwright Lots 2 → 9 et Atelier : **107 / 107**.
- Vitest : ajouts seulement.
- Liens ajoutés (fiche relevé « Estimation », Quantitatifs « Estimation (HT) ») sans modifier les parcours existants.

## 19. DECISION_REQUIRED (choix conservateurs retenus)

| # | Sujet | Choix |
|---|---|---|
| D1 | Branche | branche de session repositionnée sur le Lot 9 (elle pointait sur un ancêtre, sans commit propre) |
| D2 | Où vivent les prix | **couche séparée** (tables dédiées). Le contrat d'ouvrage et la bibliothèque du Lot 9 restent sans prix, ses tests sont inchangés |
| D3 | Contrat GP | **nouveau contrat `elsatia.tools.estimation` 1.0.0** qui imbrique le quantitatif 1.0.0 inchangé, plutôt qu'un quantitatif 1.1.0 : le validateur 1.x refuse les prix, et une mineure qui en ajoute casserait ses consommateurs |
| D4 | Base des composantes | toutes les composantes (MO comprise) s'appliquent à la **même quantité retenue, perte comprise** : une seule perte, jamais deux. Calculer la MO sur la quantité sans perte serait une règle métier à valider |
| D5 | FORFAIT | montant fixe **par ouvrage**, une ligne « forfait » dans l'état de travaux de l'ouvrage, sans pièce. Un ouvrage dont le prix n'a qu'un forfait a des lignes de quantité à 0 € (il n'est pas « sans prix ») |
| D6 | Coefficient | multiplie toutes les composantes et les heures ; borné 0,01 – 10 ; ce n'est pas une marge |
| D7 | Arrondi | centime par composante et par ligne, puis sommes. Le PU composite affiché (4 décimales) est indicatif : total de ligne = somme des composantes arrondies |
| D8 | Correction | porte sur le **montant d'une ligne** (pas sur le PU) ; possible sans prix (montant automatique nul) ; obsolète si l'automatique change |
| D9 | Multi-scénario | solution = plan d'un étage ; comparaison côté client (lot, état, total). Aucun moteur de scénarios ; la contrainte existante (un plan modifiable par étage et par état) est conservée |
| D10 | Bibliothèque | prix repris comme instantané ; application par lien puis par code, **seulement aux ouvrages sans prix** (remplacement possible par la RPC, non exposé à l'écran) |
| D11 | « Sans prix » | anomalie de gravité *information* : exclue de « À vérifier » et du contrat GP |
| D12 | Pièces jointes GP | photos, annotations et revêtements transmis par référence (chemin de stockage, identifiants), chargés au moment de l'export ; aucun octet copié |
| D13 | Plans figés avant le Lot 10 | recalculés à la lecture sur leur quantitatif figé (aucun prix possible), signalés `recalcul_plan_fige_avant_lot10` |

## 20. Limites réelles

| Sujet | État |
|---|---|
| Appareils physiques, Safari / WebKit iOS | **non testés** (MOBILE EMULATED ONLY) |
| Import côté Gestion Pro | non construit : contrat `elsatia.tools.estimation` 1.0.0 préparé, validé, non transmis |
| TVA | volontairement absente (HT seulement), décidée par Gestion Pro |
| Vue sur très gros relevés | la lecture de structure (Lots 2/3, RLS ligne à ligne) domine l'affichage ; à 5 000 lignes, l'édition d'un prix à l'écran prend 1,7 s, dont ≈ 1 s de recalcul serveur (quantitatif + estimation) |
| Attendus Preview du train (`verify:train-expectations`) | dérive antérieure à ce lot (déjà signalée au Lot 9), non modifiés ici ; `npm run sync:train-expectations` à lancer au prochain train |
| Performances | `next dev`, pile locale : à remesurer en build de production / Preview |
