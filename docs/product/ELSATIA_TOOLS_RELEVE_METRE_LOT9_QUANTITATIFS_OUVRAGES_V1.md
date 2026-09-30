# ELSATIA Tools — Relevé & Métré — Lot 9 — Quantitatifs, ouvrages & takeoff automatique V1

**Date** : 2026-09-28
**Branche** : `claude/compassionate-volta-cnbzjs` (branche de session imposée, voir D1)
**Base** : Lot 8 qualifié `claude/great-mendel-w9qt6c` @ `0ec193e` (*RELEVE METRE LOT 8 LOCALLY QUALIFIED*).
**Nature** : rapport autonome. Tout ce qui est affirmé ici a été exécuté dans cette session.
**Hors périmètre, volontairement** : devis Gestion Pro (contrat préparé seulement, aucun devis créé), prix (interdits dans Tools), appareils physiques, Preview, production, PR, merge.

---

## 0. Verdict

> **RELEVE METRE LOT 9 LOCALLY QUALIFIED**

Le métré du Lot 8 devient un **quantitatif métier** : des **ouvrages techniques** (nom, catégorie, lot, unité, règle de quantité, perte, arrondi, pièces visées, état projeté, commentaire, origine auto / manuelle, audit) dont les quantités sont **calculées par le serveur** avec un **moteur déterministe** (fonction SQL pure, langage d'opérations fermé, analyse dimensionnelle, arithmétique entière) dont le domaine TypeScript est le **miroir exact** (parité prouvée sur 3 000 cas aléatoires, jeu de 40 cas figé vérifié par Vitest ET pgTAP). Quantités séparées **existant / à déposer / neuf / déplacé**, **ajustements** audités (jamais d'écrasement silencieux), **anomalies** typées (préparation du module Erreurs), **quantitatif figé** avec le plan, **bibliothèque** d'ouvrages sans prix, **catalogue standard** de 31 ouvrages, vue **Quantitatifs** tablette (agrégation chantier / bâtiment / étage / zone / pièce / lot / ouvrage), exports **CSV** et **contrat Gestion Pro 1.0.0** (JSON).

« Locally qualified » : PostgreSQL 16 avec les 351 vraies migrations et la vraie RLS, vrai GoTrue, vrai PostgREST, vrai Chromium. **Tablette : MOBILE EMULATED ONLY.** Performances mesurées en `next dev`, pile locale.

### Chiffres clés (exécutés sur HEAD)

| Contrôle | Résultat |
|---|---|
| Install fraîche | **351 / 351** migrations (`verify-migrations` : 351 valides) |
| pgTAP Relevé (12 fichiers) | **667 / 667** (Lots 2–8 : 583, **Lot 9 : 84**) |
| pgTAP suite complète | 145 fichiers, 3 862 tests ; **mêmes 9 fichiers en échec, mêmes compteurs** qu'aux Lots 4 → 8 (limites du banc, §17.3 du Lot 8) |
| Parité moteur SQL ↔ TS | **3 000 cas aléatoires** (25 173 lignes, 20 803 anomalies) identiques ; jeu figé de 40 cas (P1) vert en Vitest et en pgTAP |
| Vitest `packages/releve-domain` | **333 / 333** (Lot 8 : 281 ; +52) |
| Vitest racine | **2 187 / 2 187** (177 fichiers) |
| Vitest `apps/tools` | **2 150 / 2 150** (187 fichiers ; +3) |
| `tsc --noEmit` racine et `apps/tools` | 0 erreur |
| ESLint `apps/tools` (`npm run lint`), domaine, recette Lot 9, script de parité | 0 erreur, 0 avertissement |
| Build Tools web / natif (Capacitor) / Gestion Pro | OK — `/releves/quantitatifs` statique (web et export natif) |
| Playwright Lot 9 `tools-releve-lot9.spec.ts` | **12 / 12** (desktop, tablette, sécurité, versions, bibliothèque, anomalies, exports, performance) — deux passages verts |
| Playwright non-régression Lot 8 | **12 / 12** |
| Playwright non-régression Lots 6 + 7 | **31 / 31** |
| Playwright non-régression Lots 2 + 3 + 4 + 5 + Atelier | **52 / 52** |
| Performance 1 000 ouvrages → 5 000 lignes | calcul serveur (RPC) **0,55 s**, recalcul **0,56 s**, agrégation (UI) **0,34 s**, export CSV **0,19 s**, JSON **0,33 s** |

## 1. Base et branche

- `git fetch` de `claude/great-mendel-w9qt6c` (Lot 8 qualifié, `0ec193e`).
- **D1** : la session impose `claude/compassionate-volta-cnbzjs`, qui pointait sur `main` (`4d92ddb`, ancêtre du Lot 8, sans commit propre) : repositionnée sur `0ec193e` (avance rapide). Aucune PR, aucun merge. V6/V7 non utilisés.

| Commit | Objet |
|---|---|
| `3f41757` | migration 1301 (additive) + pgTAP Lot 9 |
| `aa6bf00` | domaine : moteur miroir, catalogue, agrégations, CSV, contrat GP ; script et jeu de parité |
| `0862d59` | Tools : vue Quantitatifs, dépôt Supabase, navigation, liens |
| `c8964e9` | recette Playwright Lot 9 (+ finitions d'affichage) |
| *(ce rapport)* | rapport Lot 9 |

## 2. Architecture — le serveur calcule, le client affiche

| Couche | Fichier | Rôle |
|---|---|---|
| Serveur | migration `20260929001301` | contrat d'ouvrage (`tools_releve_ouvrage_anomalie`), moteur pur (`tools_releve_quantitatif_evaluer`, `tools_releve_qt_appliquer`, `tools_releve_qt_rdiv`), tables, gardes, RPC, gel, copie dérivée |
| Domaine | `packages/releve-domain/src/quantitatif.ts` | énumérations, contrat, **miroir exact** du moteur (BigInt), formule lisible, catalogue standard, détails / agrégation, CSV, contrat GP, validation du contrat, port de persistance |
| Parité | `scripts/releve/quantitatif-parite.mjs`, `quantitatif-parite.fixture.json` | génère des entrées aléatoires déterministes, fait calculer le serveur, fige le résultat attendu |
| Accès | `apps/tools/src/lib/releve/plan/supabase-quantitatif-repository.ts` | RPC uniquement |
| Vue | `components/releve/quantitatifs/ReleveQuantitatifsWorkspace.tsx`, route `/releves/quantitatifs?id=&etat=&niveau=` | synthèse, ouvrages, formulaire, catalogue, bibliothèque, ajustements, anomalies, exports |

**Modèle** : 3 tables ajoutées — `tools_releves_ouvrages` (ouvrages d'un plan : `donnees` jsonb validé par CHECK, `categorie` et `origine` générées, lignée `origine_ouvrage_id`, audit), `tools_releves_ouvrages_bibliotheque` (par entreprise), `tools_releves_quantitatif_ajustements` ; une colonne `tools_releves_plans.quantitatif` (quantitatif figé). Toutes : `entreprise_id`, RLS lecture seule pour `authenticated`, écriture par RPC.

## 3. Ouvrages et catégories (§2, §3)

Contrat d'un ouvrage (identique SQL / TS, clés inconnues refusées) : `nom`, `code?`, `categorie`, `lot?`, `unite`, `regle {source, filtre?, valeur?, operations?}`, `pertePourcent`, `arrondi {mode, pas?}`, `pieceIds?`, `etatTravaux`, `etats`, `commentaire?`. Serveur : `id`, `origine` (auto / manuelle, **dérivée** de la source), `bibliotheque_id`, `origine_ouvrage_id`, `revision`, `created_*`, `updated_*`, `deleted_*`, journal (`champs = ouvrages`).

**19 catégories** : cloisons, doublages, plafonds, sols, peinture, faïence, carrelage, plinthes, profilés, portes, fenêtres, sanitaires, mobilier, électricité, CVC, plomberie, démolition, dépose, autre. Un **lot** de travaux est proposé par catégorie (modifiable).

## 4. Sources automatiques (§4)

| Source | Unité de départ | Unité d'évaluation | État |
|---|---|---|---|
| surface de sol, surface des murs (nette), surface de plafond, périmètre brut / utile, volume | m², m², m², ml, m³ | **chaque pièce** (valeurs **retenues** du métré, ajustements Lot 8 compris) | état de travaux de l'ouvrage |
| longueur de murs, surface de murs (longueur × hauteur du mur) | ml, m² | **chaque mur** du plan | état du mur |
| nombre d'ouvertures, surface d'ouvertures (filtre par type) | u, m² | chaque ouverture | état de l'ouverture |
| nombre d'objets / équipements (filtre catégories et / ou objets par type) | u | chaque objet | état de l'objet |
| quantité de revêtement (support obligatoire, familles) | m² ou ml | chaque revêtement (quantité **sans** sa perte Lot 8) | état du revêtement |
| forfait / saisie manuelle | forfait / unité déclarée | une ligne (ou une par pièce visée) | état de travaux |

Rattachement : un mur (faces) ou une ouverture présent(e) dans **une** pièce lui est rattaché(e) ; dans **plusieurs** → ligne d'**étage** annotée `partage` ; hors contour → étage, `hors_piece`. Jamais compté deux fois (D4).

## 5–6. Unités et formules (§5, §6)

- Unités : **u, ml, m², m³, kg, forfait**. **Analyse dimensionnelle** : la source fixe l'unité de départ, chaque opération la transforme explicitement ; le résultat doit être l'unité déclarée, sinon `unite_incoherente` (refus serveur et client). **Aucune conversion implicite** (m² ↛ ml…). **kg** seulement par `ratio_kg` (valeur fournie) ou saisie.
- Opérations (fermées, ≤ 8, valeurs positives ≤ 10⁶ à 6 décimales ; `ajouter` peut être négatif) :

| Opération | Formule | Unités |
|---|---|---|
| `coefficient` | q × k | inchangée |
| `entraxe` / `longueur_unitaire` | q ÷ e | ml → u |
| `surface_unitaire` | q ÷ s | m² → u |
| `hauteur` | q × h | ml → m² |
| `epaisseur` | q × e | m² → m³ |
| `ajouter` | q + k (par unité source) | inchangée |
| `ratio_kg` | q × r | u / ml / m² / m³ → kg |

- Ordre fixe : **opérations → perte % → arrondi (supérieur / inférieur / au plus proche, pas) → 3 décimales**.
- **Aucune exécution de code** : aucune chaîne n'est évaluée ; une opération inconnue (`eval`…) est `formule_invalide` (pgTAP F3, Playwright).
- **Déterminisme** : micro-unités entières (1e-6), divisions exactes `div`/`mod` arrondies moitié loin de zéro, résultat en milli-unités ; TS en BigInt. Le moteur SQL est une fonction `IMMUTABLE` pure (aucune table lue).

## 7. Exemples BTP validés (§7) — valeurs exactes (pgTAP Q2–Q16, Vitest, Playwright)

Pièce 3,80 × 2,80 (h 2,50), murs 20 cm, porte 90 × 210, fenêtres.

| Cas | Règle | Résultat |
|---|---|---|
| m² de peinture | murs nets 29,75 + 5 % | **31,238 m²** |
| ml de plinthes | périmètre utile 12,30 + 5 % | **12,915 ml** |
| barres de plinthe | 12,30 ÷ 2,40 × 1,10 → sup. | **6 u** |
| m² de stratifié | 10,64 + 7 % → 0,01 sup. | **11,39 m²** |
| nombre de portes | ouvertures `porte` | **1 u** (+ porte de cloison partagée : 1 u à l'étage) |
| m² de cloisons | Σ longueur × hauteur du mur | **35,00 m²** |
| montants selon entraxe | L ÷ 0,60 + 1, arrondi **par mur** | 8 + 6 + 8 + 6 = **28 u** |
| plaques selon surface | 2 faces ÷ 3 m², +10 %, par mur | **28 u** |
| carrelage + perte | 10,64 + 10 % | **11,704 m²** |
| faïence | zone Lot 8 2,88 + 10 % | **3,168 m²** |
| panneaux décoratifs | 7,61 ÷ 0,72 × 1,05 → sup. | **12 u** |
| barrière phonique | 14,00 ml × h 0,50 + 5 % | **7,35 m²** |
| ragréage (kg) | 10,64 × 4,5 kg → sacs de 25 | **50 kg** |
| volume | — | **26,60 m³** |

## 8. Existant / dépose / neuf / déplacé (§8)

Lignes par (ouvrage, pièce, **état**) ; synthèse **conservé / à déposer / à créer / déplacé** par ouvrage et par groupe. Plan projeté réel (Playwright) : cloisons **conservé 50,00 m² · à déposer 10,00 m² · à créer 5,00 m²** ; pgTAP D3 : 27,50 / 7,50 / 7,00.

## 9. Ajustements (§9)

`tools_releve_quantitatif_ajuster(plan, ouvrage, pièce, état, retenue, raison)` : **quantité calculée lue par le serveur**, retenue (≥ 0, 3 décimales), **raison obligatoire** (≥ 3 caractères), auteur (`auth.uid()`), date serveur, journal. Un nouvel ajustement **retire** le précédent (tracé) ; retrait → retour au calcul ; ligne immuable ; aucune écriture directe. Affichage « Retenu 12,00 m² au lieu de 11,59 m² — « raison » · date ». Si le calcul change : **périmé** + anomalie `metre_obsolete` ; si la ligne disparaît : `objet_supprime` (ajustement orphelin, jamais perdu). Suppression d'un ouvrage : ses ajustements sont retirés (tracés).

## 10. Versioning (§10)

- **Gel** : `tools_releve_plan_figer` (redéfini, même signature et droits) écrit `plans.quantitatif` sur le **métré figé** ; la garde du Lot 5 le rend immuable (même pour le propriétaire, pgTAP V6) ; ouvrages et ajustements d'un plan figé immuables (garde, V3–V7). Hauteur modifiée après gel : aucun effet (pgTAP V2, Playwright).
- **Plan dérivé** : ouvrages **copiés** (déclencheur `AFTER INSERT`, lignée), ajustements **non** copiés, recalcul indépendant (V8 : 31,92 m³ à 3,00 m).
- Plans figés avant le Lot 9 : recalculés à la lecture depuis leur métré figé, signalés `recalcul_plan_fige_avant_lot9` (D7).

## 11. Bibliothèque (§11)

Par entreprise, sans pièces visées ; **aucun prix** : colonne interdite (pgTAP S6) et toute clé `prix / price / tarif / montant / cout` refusée partout dans le contrat (F6, B3, Playwright). Code unique par entreprise. Lecture et écriture par relevé (RPC `tools_releve_bibliotheque*`), consultation en lecture seule. Réutilisation : « Depuis la bibliothèque » (lien `bibliotheque_id` conservé). **Catalogue standard** (31 ouvrages, dans le domaine) : peinture, plinthes (ml, barres), stratifié, sous-couche, carrelage, faïence, panneaux, cloisons (m², montants, rails, BA13, barrière phonique), doublage, faux plafond, portes, fenêtres, seuils, sanitaires, prises, radiateurs, volume CVC, mobilier, plomberie, ragréage, démolition, déposes, nettoyage.

## 12. Vue Quantitatifs (§12, §17)

Route `/releves/quantitatifs?id=&etat=&niveau=` (liens : fiche relevé, vue Métré, plan). Onglets Existant / Projeté / Tel que construit ; tuiles (ouvrages, lignes, ajustées, anomalies) ; anomalies ; **synthèse par chantier, bâtiment, étage, zone, pièce, lot, ouvrage** (totaux exacts en milli-unités, jamais deux unités sommées : clé = code ou nom + unité) ; par plan : ouvrages en cartes repliables (formule en clair, lignes par pièce et état, ajuster, retirer, modifier, bibliothèque, supprimer), formulaire à **règle guidée** (unité produite affichée en direct, erreurs identiques au serveur), catalogue, bibliothèque. **Tablette** : cartes, aucune `<table>`, aucun débordement horizontal, cibles ≥ 40 px (Playwright 820 × 1180 tactile).

## 13–14. Exports et contrat Gestion Pro (§13, §14)

- **CSV** (Excel FR : `;`, virgule, BOM) : chantier ; bâtiment ; étage ; zone ; pièce ; lot ; catégorie ; code ; ouvrage ; unité ; quantité retenue ; quantité calculée ; ajustée ; raison ; source ; formule ; état projeté ; origine ; annotations ; anomalies.
- **Contrat `elsatia.tools.quantitatif` version `1.0.0`** (`buildQuantitatifGpPayload`, `readiness = contract-only / not-generated`) : source (relevé, état, moteur, plans avec gel), ouvrages (formule en clair, règle, perte, arrondi, origine, commentaire), lignes (**quantités en décimal exact, chaîne à 3 décimales**, calculée / retenue, raison, source, emplacement chantier → pièce, état, annotations), totaux par état, anomalies. **GP n'a aucune géométrie à recalculer.** Clé d'idempotence : relevé, état, plans (numéro, gel) + empreinte des quantités retenues. `validateQuantitatifGpPayload` (côté GP) : version majeure 1, unités connues, décimaux exacts, références résolues, aucun prix, aucun devis. **Aucune création de devis.**

## 15. Anomalies — préparation du module Erreurs (§15)

Forme stable `{code, gravite, ouvrageId, pieceId, etatProjet, detail, message}`, ordre total, messages identiques SQL / TS :

| Code | Gravité | Détection |
|---|---|---|
| `quantite_negative` | erreur | quantité calculée < 0 |
| `surface_impossible` | erreur | surface source ≤ 0 ou > 10⁶ m² |
| `unite_incoherente` | erreur | chaîne dimensionnelle ≠ unité déclarée |
| `source_absente` | avertissement | aucune donnée, pièce sans contour, élément non calculable (hauteur inconnue) |
| `formule_invalide` | erreur | opération / valeur / filtre / arrondi invalides |
| `objet_supprime` | erreur | pièce visée supprimée, ajustement orphelin |
| `metre_obsolete` | avertissement | ajustement de quantité périmé, source de métré au réglage périmé |

## 16. Performances (§16)

**Moteur seul (Vitest, TS)** — 5 000 lignes : 100 ouvrages × 50 pièces : calcul 43 ms, recalcul 27 ms, agrégation 33 ms, export 41 ms ; 1 000 ouvrages × 5 pièces : 21 / 21 / 16 / 42 ms.
**Moteur SQL (psql)** — 5 000 lignes : 0,42 s (100 ouvrages) ; 1 000 ouvrages **0,98 s → 0,48 s** après correction (jointure ligne ↔ unité en boucle imbriquée et anti-jointure non hachée, relevées par `EXPLAIN ANALYZE`, remplacées ; parité revérifiée sur 1 000 cas).
**Pile réelle (Playwright, `next dev`)** :

| Cas | Import | Calcul (RPC) | Recalcul (après édition) | Vue complète | Agrégation (changement de niveau) | Export CSV | Export JSON |
|---|---|---|---|---|---|---|---|
| 100 ouvrages × 50 pièces (5 000 lignes) | 59 ms | 449 ms | 449 ms | 2,1 s | 291 ms | 82 ms | 185 ms |
| 1 000 ouvrages × 5 pièces (5 000 lignes) | 465 ms | 546 ms | 562 ms | 3,2 s | 336 ms | 187 ms | 326 ms |

« Vue complète » comprend la lecture de structure du relevé (limite connue depuis le Lot 8, RLS ligne à ligne) et la synthèse de tous les étages.

## 17. Tests (§18)

| Suite | Fichier | Tests |
|---|---|---|
| pgTAP | `elsatia_tools_releve_metre_lot9_quantitatifs_ouvrages.test.sql` | **84** : S1–S8 schéma / droits, F1–F12 contrat, E1–E3 + **P1 parité**, Q1–Q18 takeoff, D1–D6 existant / dépose / neuf, A1–A9 ajustements, X1–X4 anomalies, V1–V8 versioning, B1–B7 bibliothèque, T1–T7 isolation |
| Vitest domaine | `quantitatif.test.ts` | 52 : parité énumérations / messages SQL, **P1** (40 cas), arithmétique exacte, contrat (17 cas), 17 cas BTP, états, ajustements, anomalies, agrégation 7 niveaux, CSV, contrat GP, performance |
| Vitest Tools | `plan-lot9.test.ts` | 3 : navigation, dépôt (RPC seulement, aucune quantité envoyée), refus serveur |
| Playwright | `tools-releve-lot9.spec.ts` | 12 : catalogue → takeoff, formule fermée / montants, ajustements, existant / dépose / neuf, synthèse + exports, bibliothèque, anomalies, versioning, sécurité, **tablette**, performance 100 / 1 000 ouvrages |

Commandes rejouables :

```text
scripts/local-postgres-bootstrap/rebuild_db.sh lot9_fresh                          → 351 migrations OK
cd supabase/tests && pg_prove -d lot9_fresh elsatia_tools_releve_metre_*.test.sql → 667/667
cd supabase/tests && pg_prove -d lot9_fresh *.test.sql                             → 145 fichiers, 9 KO connus
node scripts/releve/quantitatif-parite.mjs <base> 1000 <graine> /tmp/p.json        → jeu de parité (le jeu figé : 40 cas, graine 20260929)
npx vitest run ; (apps/tools) npx vitest run ; npx tsc --noEmit ; (apps/tools) npx tsc --noEmit ; (apps/tools) npm run lint
(apps/tools, NEXT_PUBLIC_TOOLS_ENV=local …) npm run build ; npm run build:native ; (racine) npm run build:gestion-pro
scripts/local-postgres-bootstrap/releve_e2e_stack.sh + (apps/tools) next dev --webpack -p 3020
  + npx playwright test tests/e2e/tools-releve-lot9.spec.ts --project=desktop-chromium                     → 12/12
  + npx playwright test tests/e2e/tools-releve-lot8.spec.ts --project=desktop-chromium                     → 12/12
  + npx playwright test tests/e2e/tools-releve-lot{6,7}.spec.ts --project=desktop-chromium                 → 31/31
  + npx playwright test tests/e2e/tools-releve-lot{2,3,4,5}.spec.ts tests/e2e/tools-atelier-lot5-nonregression.spec.ts --project=desktop-chromium → 52/52
```

## 18. Sécurité

| Profil | Résultat (pgTAP + Playwright) |
|---|---|
| métreur | ouvrages, import, ajustements, bibliothèque (plan non figé) |
| consultation | lit quantitatifs et synthèse ; aucune écriture (42501) |
| **autre tenant** | quantitatif, synthèse, écriture, bibliothèque : 42501 ; rien de visible |
| anonyme | aucune RPC |
| plan figé | quantitatif figé, aucune écriture (même le propriétaire des tables sur les ouvrages) |
| écriture directe | tables en lecture seule ; contrat vérifié par CHECK même pour `service_role` |

Nouvelles fonctions internes non exécutables par `authenticated` : `tools_releve_plan_quantitatif_calcul`, `tools_releve_quantitatif_entree`, `tools_releve_quantitatif_ouvrages_json`, `tools_releve_ouvrage_ecrire`, `tools_releve_plan_modifiable`. Le moteur pur `tools_releve_quantitatif_evaluer` est exécutable (il ne lit aucune table). Redéfinie à l'identique + une ligne : `tools_releve_plan_figer`. Aucune garde affaiblie, aucune ligne existante réécrite.

## 19. Non-régression

pgTAP Relevé Lots 2–8 : 583 / 583 sur la base Lot 9 (aucun test adapté). Playwright Lots 2 → 8 et Atelier : 95 / 95. Vitest : ajouts seulement. Liens ajoutés (fiche relevé, vue Métré, plan) sans modification des parcours existants.

## 20. DECISION_REQUIRED (choix conservateurs retenus)

| # | Sujet | Choix |
|---|---|---|
| D1 | Branche | branche de session repositionnée en avance rapide sur le Lot 8 |
| D2 | Formules | pas d'expression libre : liste fermée d'opérations typées (JSON), évaluée par un moteur sans `eval` ; plus sûr et testable, couvre les cas demandés |
| D3 | Granularité de l'arrondi | règle appliquée **par unité source** (pièce, mur, ouverture, objet, revêtement) puis sommée : montants et plaques arrondis par mur (jamais sur un total, pas de sous-estimation) |
| D4 | Élément partagé | mur / ouverture bordant plusieurs pièces → ligne d'étage annotée `partage` (compté une fois, jamais attribué arbitrairement) |
| D5 | État des sources de pièce | sol, murs, plafond, périmètres, volume n'ont pas d'état : ils prennent l'**état de travaux** de l'ouvrage (ex. stratifié « nouveau » sur un existant) |
| D6 | Catalogue sur plan existant | les ouvrages (hors dépose) ajoutés depuis le catalogue sur un plan initial / corrigé retiennent aussi l'état « existant » (sinon aucune quantité) |
| D7 | Plans figés avant le Lot 9 | recalculés à la lecture sur leur métré figé, signalés comme tels |
| D8 | Revêtement comme source | quantité retenue **sans** la perte du Lot 8 (la perte de l'ouvrage s'applique une seule fois) |
| D9 | Précision | valeurs d'opération à 6 décimales, perte à 2, quantités à 3 décimales ; échange GP en chaîne décimale exacte |
| D10 | Identité d'un ouvrage entre plans | agrégation par code (sinon nom) + unité ; deux unités ne sont jamais sommées |
| D11 | Détection de prix | refus de toute **clé** évoquant un prix (un nom « Montants » reste permis) ; un commentaire contenant littéralement `"prix":` est refusé (faux positif assumé) |
| D12 | Bibliothèque | par entreprise, écriture pour les profils pouvant modifier le relevé ; retrait doux ; les ouvrages déjà copiés sur un plan ne changent pas |

## 21. Limites réelles

| Sujet | État |
|---|---|
| Appareils physiques, Safari / WebKit iOS | **non testés** (MOBILE EMULATED ONLY) |
| Plafonds inclinés | hérité du Lot 8 : non pris en charge |
| Vue sur très gros relevés | lecture de structure Lot 2/3 (RLS ligne à ligne) domine le temps d'affichage — RPC de structure toujours proposée |
| Devis GP | non construit ; contrat 1.0.0 préparé et validé, non transmis |
| Attendus Preview du train (`verify:train-expectations`) | en dérive **avant** ce lot (350 → Lot 8 non synchronisé) ; non modifiés ici (hors périmètre, `npm run sync:train-expectations` à lancer au prochain train) |
| Performances | `next dev`, pile locale — à remesurer en build de production / Preview |
