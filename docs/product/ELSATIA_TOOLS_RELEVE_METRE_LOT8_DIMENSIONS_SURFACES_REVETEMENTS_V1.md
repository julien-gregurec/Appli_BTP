# ELSATIA Tools — Relevé & Métré — Lot 8 — Dimensions, surfaces, volumes & revêtements V1

**Date** : 2026-09-28
**Branche** : `claude/great-mendel-w9qt6c` (branche de session imposée, voir D1)
**Base** : Lot 7 qualifié `claude/nifty-edison-mevolm` @ `62ebcb1` (*RELEVE METRE LOT 7 LOCALLY QUALIFIED*).
**Nature** : rapport autonome. Tout ce qui est affirmé ici a été exécuté dans cette session.
**Hors périmètre, volontairement** : chiffrage / devis Gestion Pro (contrat de données préparé seulement), PDF généré côté serveur (impression navigateur → PDF), plafonds inclinés, appareils physiques, Preview, production, PR, merge.

---

## 0. Verdict

> **RELEVE METRE LOT 8 LOCALLY QUALIFIED**

Le plan devient un **outil de métré** : le **serveur** calcule, à partir de la géométrie enregistrée du plan (Lot 6), pour chaque pièce la surface brute / nette, le plafond, le périmètre brut / utile, les surfaces murales par face (brute, déductions d'ouvertures, nette), le volume (seulement si la hauteur est connue), les ouvertures (largeur, hauteur, surface) et les quantités de **revêtements** (sol, murs — tous / murs choisis / zone —, plafond, linéaires) avec perte configurable. Aucune surface envoyée par le client n'est crue. Les **cotes** automatiques (intérieures, extérieures, partielles, cumulées, d'ouverture, d'implantation, largeur / longueur / diagonale, distance entre murs) et **manuelles** (valeur calculée ou relevée, hauteur ponctuelle) sont dans l'éditeur. Les **ajustements** ne remplacent jamais une valeur calculée : valeur calculée, valeur retenue, raison, auteur, date, retrait tracé, journal. Le métré est **figé avec le plan** ; un plan dérivé est recalculé indépendamment ; le plan projeté distingue **existant / dépose / neuf**. Vue **Métré** chantier → bâtiment → étage → zone → pièce, consultable sur tablette ; exports **CSV**, **contrat Gestion Pro (JSON)**, **impression PDF**.

« Locally qualified » : PostgreSQL 16 avec les 350 vraies migrations et la vraie RLS, vrai GoTrue, vrai PostgREST, vrai Chromium. **Tablette : MOBILE EMULATED ONLY.** Performances mesurées en `next dev`, pile locale.

### Chiffres clés (exécutés sur HEAD)

| Contrôle | Résultat |
|---|---|
| Install fraîche | **350 / 350** migrations (`verify-migrations` : 350 valides) |
| pgTAP Relevé (11 fichiers) | **583 / 583** (Lots 2–7 : 516, **Lot 8 : 67**) |
| pgTAP suite complète | 144 fichiers, 3 778 tests ; **mêmes 9 fichiers en échec, mêmes compteurs** qu'aux Lots 4 → 7 (limites du banc, §17.3) |
| Vitest `packages/releve-domain` | **281 / 281** (Lot 7 : 257) |
| Vitest racine | **2 135 / 2 135** (176 fichiers ; Lot 7 : 2 111) |
| Vitest `apps/tools` | **2 147 / 2 147** (186 fichiers ; Lot 7 : 2 136) |
| `tsc --noEmit` racine et `apps/tools` | 0 erreur |
| ESLint `apps/tools` (`npm run lint`), domaine, recette Lot 8 | 0 erreur, 0 avertissement |
| Build Tools web / natif (Capacitor) / Gestion Pro | OK — `/releves/metre` statique (web et export natif) |
| Playwright Lot 8 `tools-releve-lot8.spec.ts` | **12 / 12** (desktop, tablette, sécurité, versions, exports, performance) |
| Playwright non-régression Lots 6 + 7 | **31 / 31** (un passage) |
| Playwright non-régression Lots 2 + 3 + 4 + 5 + Atelier | **52 / 52** (un passage) |
| Performance 500 pièces (1 057 murs, 1 000 ouvertures, 1 000 revêtements) | calcul serveur **0,27 s**, recalcul **0,27 s**, édition (ajustement → valeur affichée) **0,9 s**, export CSV **0,08 s** |

## 1. Base et branche

- `git fetch` de `claude/nifty-edison-mevolm` (Lot 7 qualifié, `62ebcb1`).
- **D1** : la session impose `claude/great-mendel-w9qt6c`, qui pointait sur `main` (`4d92ddb`, ancêtre du Lot 7, sans commit propre) : repositionnée sur `62ebcb1` (avance rapide). Aucune PR, aucun merge.

| Commit | Objet |
|---|---|
| `2469fdf` | migration 1201 (additive) + pgTAP Lot 8 (+ 1 test Lot 5 adapté, D9) |
| `d8381fd` | domaine : unités, métré (miroir exact du serveur), cotes, revêtements, ajustements, synthèse, CSV, contrat GP |
| `4c3edf6` | Tools : cotations dans l'éditeur, état projeté murs / ouvertures, vue Métré, fiche pièce, exports |
| `cdd1474` | recette Playwright Lot 8 ; calcul serveur ramené de O(n²) à O(n) (§15) |
| *(ce rapport)* | rapport Lot 8 |

## 2. Architecture — le serveur calcule, le client affiche

| Couche | Fichier | Rôle |
|---|---|---|
| Serveur | migration `20260928001201` | métré (`tools_releve_plan_metre_calcul`), lecture (`tools_releve_plan_metre`, `tools_releve_metre_synthese`), revêtements, cotes, ajustements, seuil, gel, copie dérivée, contrôles |
| Domaine | `packages/releve-domain/src/units.ts` | stockage mm / mm² / mm³, formats mm, cm, m, m², m³, ml, saisies, arithmétique entière |
| Domaine | `metre.ts` | types du métré (forme JSON du serveur), **miroir exact** du calcul (parité sur valeurs fixes), cotes, revêtements, contrôles (messages identiques au SQL), synthèse, CSV, contrat GP |
| Domaine | `plan.ts`, `plan-memory.ts`, `model.ts` | `PlanDocument.cotes`, état projeté des murs / ouvertures, différence / enregistrement, export |
| Moteur Tools | `apps/tools/src/lib/releve/plan/dimensions.ts` | cotes automatiques et manuelles (pur) ; opérations annulables |
| Éditeur | `PlanEditor.tsx`, `PlanLayers.tsx` | outil Cote, hauteur ponctuelle, lignes de cote, panneau de cote, état projeté |
| Vue Métré | `components/releve/metre/ReleveMetreWorkspace.tsx`, route `/releves/metre` | synthèse, revêtements, ajustements, seuil, travaux, exports |
| Fiche pièce | `PieceMetrePanel.tsx` | métré de la pièce (plan de référence) |
| Accès | `supabase-metre-repository.ts` | RPC uniquement |

**Modèle de données — aucun nouveau type d'élément** : les cotes sont des éléments `mesure` (existants depuis le Lot 2) et les revêtements des éléments `materiau` (existants), désormais rattachables à un plan (`plan_id`) : toutes les gardes de plan des Lots 5–7 s'appliquent. Une seule table ajoutée : `tools_releves_metre_ajustements` (audit). Une colonne : `tools_releves_plans.metre` (métré figé).

## 3. Dimensions et cotes (§2, §3)

| Cote | Automatique (calculée à la volée, suit la géométrie) | Manuelle |
|---|---|---|
| longueur de mur | faces raccordées (Lot 6) : extérieure (la plus longue) et intérieure, au mur sélectionné | cote libre |
| cotes partielles / cumulées | le long du mur sélectionné, tableaux des ouvertures (ex. 1,00 / 0,90 / 4,10 ; cumulées 1,00 / 1,90) | types « partielle », « cumulée » |
| cotes intérieures | une par arête du contour (nu des murs), posées dans la pièce (bouton « Cotes des pièces ») | type « intérieure » |
| largeur / longueur / diagonale de pièce | orientation de l'arête la plus longue (pièces biaises comprises) | — |
| distance entre murs | murs parallèles en regard, de face à face | type « libre » |
| ouverture | « largeur × hauteur » de l'ouverture sélectionnée | type « ouverture » |
| implantation objet / mur | distances de l'emprise de l'objet sélectionné aux deux faces de mur les plus proches, non parallèles | type « implantation » |
| hauteur | — | **hauteur ponctuelle** (point + valeur relevée), rattachée à la pièce |

**Mode manuel** : outil **Cote** (deux points, accrochage du Lot 5), valeur **calculée** (suit toujours la longueur a → b ; une valeur figée ne peut pas être posée en silence) ou **relevée** au mètre / au laser (jamais écrasée ; écart au plan affiché : « 200,5 cm (plan 199,8 cm) »). Décalage de la ligne, type, libellé, état projeté, suppression ; annuler / rétablir ; enregistrées avec le plan (`cotes` de `tools_releve_plan_enregistrer`), exportées (SVG / DXF, calque COTES), copiées dans un plan dérivé. Contrôle serveur `tools_releve_plan_cote_anomalie` (type, points distincts, valeur, décalage, libellé, état projeté ; une cote « calculée » dont la valeur n'est pas la longueur est refusée).

## 4. Unités (§4)

Stockage interne **unique** : mm (longueurs, au dixième), mm² et mm³ (entiers). Serveur : `numeric` (décimal exact). Affichage / échange : conversions par **arithmétique entière** (`fixedFromInteger`), arrondi « moitié vers le haut » comme `round()` de PostgreSQL : 0,1 + 0,2 m² s'affiche 0,30 m² ; 1,005 → 1,01. Formats : mm, cm, m (sélecteur de la vue Métré), m², m³, ml ; CSV : décimale virgule, sans séparateur de milliers ; GP : nombres en m / m² / m³ à 3 décimales exactes.

## 5. Surface de pièce (§5)

- **Brute** : aire du contour intérieur (Lot 6, nu des murs), **recalculée par le serveur** (formule du lacet, `tools_releve_plan_surface`) — une `surfaceMm2` envoyée par le client est ignorée (pgTAP M0).
- **Nette (sol)** : **= brute**. **DECISION_REQUIRED (D3)** : la « surface nette » d'un sol dépend de règles métier (poteaux, gaines, trémies, emprises fixes, seuil de déduction) qui n'existent pas encore au modèle. Choix conservateur : aucune déduction de sol n'est inventée ; toute déduction passe par un **ajustement tracé** (§16).

## 6. Périmètre (§6)

- **Brut** : longueur du contour.
- **Utile** : brut − longueur, sur l'arête, des ouvertures **franchissables au sol** : porte, porte-fenêtre, ouverture libre (passage) ; baie et trémie seulement si leur allège vaut 0 (D4).
- Utilisations préparées (revêtements linéaires) : plinthe, profilé, barrière, bande périphérique → périmètre **utile** ; corniche → périmètre **brut** (une porte n'interrompt pas une corniche).

## 7. Surfaces murales (§7)

- **Faces** : chaque arête du contour est rattachée **géométriquement par le serveur** au mur parallèle dont l'axe est à une demi-épaisseur (±2 mm) et qui est en regard — ni confiance au client, ni perte en cas de pièce biaise (pgTAP M6, Vitest sur les contours produits par l'éditeur : 100 % des arêtes retrouvées, 50 → 500 pièces).
- **Brute** = périmètre × hauteur ; par face = longueur × hauteur.
- **Déductions** : portes, fenêtres, baies, châssis, portes-fenêtres, ouvertures libres du mur de la face, pour la longueur qu'elles occupent sur l'arête × hauteur bornée au plafond. Une ouverture dans une cloison entre deux pièces est déduite **des deux côtés** (Vitest).
- **Option « petites ouvertures »** : par plan, seuil (m²) saisi par l'utilisateur ; sous le seuil, l'ouverture n'est pas déduite. **Aucun seuil par défaut** (absent = tout déduire). RPC `tools_releve_plan_metre_regler`, contrôle optimiste (révision), journal.

## 8–10. Revêtements (§8, §9, §10, §15)

| Support | Familles (contrôle serveur par support) | Quantité |
|---|---|---|
| Sol | carrelage, parquet, stratifié, PVC, moquette, résine, béton, autre | surface de sol retenue |
| Murs | peinture, papier peint, faïence, carrelage, panneau décoratif, enduit, autre | **tous les murs** (nette retenue), **murs choisis** (faces), **zone de mur** (tronçon × bande, ouvertures déduites) |
| Plafond | peinture, dalle, BA13, acoustique, panneau, autre | surface de plafond retenue |
| Linéaires | plinthe, corniche, profilé, barrière, bande périphérique, autre | périmètre utile (corniche : brut) |

Données : libellé, format, **sens de pose**, **perte % configurable** (0–100, deux décimales ; quantité avec perte = quantité × (1 + perte)), commentaire, état projeté. Unité imposée (m² / ml). Pièce de l'étage obligatoire, mur visé actif du plan. Écriture : RPC `tools_releve_plan_revetement_enregistrer` / `_supprimer` (plan non figé), **et** garde de ligne `tools_releve_element_lot8_garde` pour l'écriture directe. Synthèse **par famille** (m² sol, m² peinture murs, m² plafond, ml plinthe…) et nombre d'ouvertures dans la vue Métré. Pas de chiffrage.

## 11–12. Volume et hauteurs (§11, §12)

- **Hauteur de pièce** = hauteur saisie de la pièce, sinon hauteur sous plafond de l'étage (source affichée : « pièce » / « étage »). **Jamais** la hauteur des murs — l'éditeur la pré-remplit à 2,50 m par défaut (D5) — **jamais inventée**.
- Sans hauteur : **volume = non calculable**, surfaces murales = non calculables (les déductions restent données), revêtements muraux « non calculable (hauteur inconnue) », avertissement dans la synthèse. Un ajustement tracé peut fixer une valeur retenue.
- **Hauteur sous plafond** = hauteur de pièce (plafond horizontal). **Hauteur ponctuelle** : cote manuelle rattachée à la pièce, affichée au métré.
- **Plafond incliné / non horizontal : NON pris en charge.** Le volume et le plafond utilisent la hauteur de la pièce ; les hauteurs ponctuelles sont affichées avec la mention « plafond incliné non pris en charge ».

## 13. Ouvertures (§13)

Les 8 menuiseries du Lot 6 (porte simple, double, coulissante, fenêtre, châssis fixe, porte-fenêtre, baie, ouverture libre — types enregistrés porte / fenetre / porte_fenetre / baie / passage + modèle / vantaux) contribuent : largeur, hauteur, surface, pièces concernées, déduction (oui / non selon le seuil), franchissabilité, état projeté. Liste par pièce et liste du plan (contrat GP).

## 14. Synthèse Métré (§14, §22)

Route `/releves/metre?id=&etat=&piece=` (liens : fiche relevé, plan, fiche pièce). Onglets **Existant** (initial / corrigé), **Projeté**, **Tel que construit** : pour chaque étage, le plan le plus récent de cet état. Arbre **chantier → bâtiment → étage → zone → pièce** avec totaux cumulés (pièces, sol, murs, volume) ; tuiles de totaux ; revêtements par famille ; travaux du projeté. **Tablette** : une carte repliable par pièce (le détail n'est rendu qu'à l'ouverture), cibles ≥ 40 px, aucun défilement horizontal (Playwright 820×1180).

## 16. Éditions manuelles — ajustements (§16)

`tools_releve_metre_ajuster(plan, pièce | revêtement, grandeur, valeur retenue, raison)` : la **valeur calculée est lue par le serveur** au moment de l'ajustement, jamais fournie par le client ; raison obligatoire (≥ 3 caractères) ; auteur (`auth.uid()`) et date serveur. Un nouvel ajustement **retire** le précédent (jamais d'écrasement : historique complet), `tools_releve_metre_ajustement_retirer` revient à la valeur calculée (retrait tracé). Table en **lecture seule** pour les utilisateurs (RLS `view`), écriture par RPC seulement, ligne immuable sauf retrait, **journal** (action `ajustement`). Affichage : « Retenu 10,50 m² au lieu de 10,83 m² — « raison » · date » ; si le calcul change ensuite, l'ajustement est marqué **périmé**. La valeur retenue se propage aux revêtements (sol, plafond, murs, linéaires). Grandeurs : surface de sol, plafond, périmètre brut / utile, surface murale nette, volume, quantité d'un revêtement.

## 17. Versioning (§17)

- **Gel** : `tools_releve_plan_figer` écrit le métré figé (`plans.metre` : hauteurs, ajustements, seuil du moment) en même temps que l'empreinte ; la garde du Lot 5 rend la colonne **immuable** (même pour le propriétaire des tables, pgTAP V5). Une hauteur de pièce modifiée après le gel ne change pas le métré figé (pgTAP V2, Playwright). Plan figé : aucun ajustement, revêtement ni cote (42501).
- **Empreinte** : cotes et revêtements y entrent, clés ajoutées seulement si présentes (empreintes antérieures recalculables).
- **Plans figés avant le Lot 8** : sans métré figé, ils sont recalculés à la lecture et signalés `source = recalcul_plan_fige_avant_lot8` (D7).
- **Plan dérivé** : cotes et revêtements copiés (lignée, murs visés reportés sur les copies) ; **ajustements non copiés** : recalcul indépendant (D6). Le plan figé est intact (comparaison exacte).

## 18. Projeté (§18)

États EXISTING / TO_REMOVE / NEW / MOVED (`existant`, `a_deposer`, `nouveau`, `deplace`) désormais aussi sur **murs, ouvertures, cotes et revêtements** (sélecteur dans les panneaux sur un plan projeté ; garde serveur). Synthèse **Existant · dépose · projeté** : murs (nombre, ml, m² = longueur × hauteur **du mur**), ouvertures, objets ; revêtements par famille et état (dépose de moquette / pose de parquet…). Pas de devis.

## 19–20. Export et contrat Gestion Pro (§19, §20)

- **CSV** : Excel FR (`;`, virgule, BOM UTF-8), une ligne par grandeur et par revêtement : chantier ; bâtiment ; étage ; zone ; pièce ; désignation ; quantité retenue ; unité ; avec perte ; valeur calculée ; ajustée ; raison / « Non calculable » ; état projeté.
- **Contrat GP** (`buildMetreGpPayload`, `contract-only`, non transmis) : pièces (surfaces, longueurs, volume, hauteur), revêtements, ouvertures, longueurs, volumes, quantités agrégées par famille ; unités d'échange m / m² / m³ ; **aucun prix** ; clé d'idempotence (relevé, état, plans / numéros / gel).
- **PDF** : « Imprimer / PDF » déplie toutes les pièces et imprime (feuille de style d'impression) — structure exportable robuste, pas de génération PDF serveur (D8).

## 15/21. Performances (§21)

Pile locale, Tools en `next dev`, Chromium 1366×1024. Grille de pièces 3 × 3 m (murs de 20 cm découpés aux croisements), une porte et une fenêtre par pièce, deux revêtements par pièce.

| Pièces | Murs / ouvertures / revêtements | Calcul serveur (RPC) | Recalcul après édition | Édition UI (ajustement → affiché) | Export CSV | Vue Métré complète (tous étages) |
|---|---|---|---|---|---|---|
| 50 | 127 / 100 / 100 | 34 ms | 34 ms | 0,17 s | 34 ms | 2,0 s |
| 200 | 449 / 400 / 400 | 177 ms | 112 ms | 0,37 s | 58 ms | 3,6 s (cumul 250 pièces) |
| 500 | 1 057 / 1 000 / 1 000 | **272 ms** | **269 ms** | **0,90 s** | 84 ms | 7,6 s (cumul 752 pièces) |

Moteur seul (Vitest) : calcul, recalcul, arbre + CSV + contrat GP sous 1,5 s à 50 / 200 / 500 pièces.

**Correction issue de la mesure** : première version, calcul serveur **3,1 s** à 500 pièces (quadratique : concaténations jsonb dans les boucles, une requête par pièce pour les hauteurs et ajustements) → agrégats en une lecture chacun, tableaux PL/pgSQL : **0,27 s** (×11), édition 6,7 s → 0,9 s.

**Limite mesurée, antérieure au Lot 8** : sur la vue complète, la synthèse serveur prend 0,47 s pour 752 pièces ; le reste vient de la lecture de la **structure** du relevé (service du Lot 2/3, RLS évaluée ligne à ligne : 2,9 s pour 752 pièces). Proposition : une RPC de lecture de structure (même remède que `tools_releve_plan_elements` au Lot 6).

## 16bis. Sécurité

| Profil | Résultat (pgTAP + Playwright) |
|---|---|
| métreur | lit le métré, gère revêtements, cotes, ajustements, seuil (plan non figé) |
| consultation | lit métré et synthèse ; aucun ajustement (42501) |
| **autre tenant** | métré, synthèse, ajustement, revêtement : 42501 ; aucun ajustement visible |
| anonyme | aucune RPC |
| plan figé | métré figé, aucune écriture |
| écriture directe | garde de ligne (cotes, revêtements, états projetés) ; ajustements : aucun droit d'écriture |

Nouvelles fonctions : calcul interne `tools_releve_plan_metre_calcul` (**non exécutable** par `authenticated`), lectures `tools_releve_plan_metre` / `tools_releve_metre_synthese` (SECURITY DEFINER, `tools_releve_peut(…, 'view')`), écritures par RPC à contrôle `edit`. Redéfinies avec mêmes signatures et droits : `tools_releve_element_donnees_valides` (liste des revêtements allongée), `tools_releve_plan_enregistrer` (+ `cotes`), `tools_releve_plan_creer` (+ copies), `tools_releve_plan_contenu`, `tools_releve_plan_figer` (+ métré figé). Contrainte `plan_type` élargie (`mesure`, `materiau`) ; action de journal `ajustement` ajoutée. Aucune garde affaiblie, aucune ligne existante réécrite.

## 17. Tests (§23)

### 17.1 Ajoutés

| Suite | Fichier | Tests |
|---|---|---|
| pgTAP | `elsatia_tools_releve_metre_lot8_metres_revetements.test.sql` | **67** : S1–S6 schéma / droits, C1–C9 cotes, M0–M16 métré serveur, R1–R10 revêtements, A1–A8 ajustements, V1–V11 versioning / projeté, T1–T6 isolation |
| Vitest domaine | `metre.test.ts`, `units.test.ts` | 24 : parité SQL (types, familles, grandeurs, messages), **mêmes valeurs exactes que pgTAP**, hauteur inconnue, seuil, revêtements, ajustements, travaux, cotes, dépôt mémoire, synthèse, CSV, contrat GP ; unités exactes |
| Vitest Tools | `plan-lot8.test.ts` | 11 : cotes automatiques (intérieures, extérieures, partielles, cumulées, pièce, ouverture, distance, implantation), cotes manuelles annulables, export, métré sur contours produits par l'éditeur, performance 50 / 200 / 500 |
| Playwright | `tools-releve-lot8.spec.ts` | 12 (§17.2) |

### 17.2 Playwright Lot 8 (pile réelle, 12/12)

1. Synthèse : totaux (21,66 m² ; murs 29,68 m² ; 27,08 m³), arbre chantier → pièce, valeurs de pièce, hauteur inconnue « non calculable », unités m / cm / mm, valeurs identiques par RPC, hauteur d'étage → calculable.
2. Revêtements : carrelage (10 %), peinture tous murs (5 %), faïence en zone (1,80 m², 12,5 %), plinthe ; refus client et serveur ; synthèse par famille ; modification (corniche = périmètre brut) ; suppression.
3. Ajustements : raison obligatoire, valeur calculée conservée, auteur / date en base, journal, propagation au revêtement, ajustement de quantité, retrait tracé, aucune écriture directe.
4. Option petites ouvertures (seuil 2 m² → murs 33,25 m²), retour « tout déduire ».
5. Éditeur : cotes partielles / cumulées / extérieure, cotes des pièces, cote manuelle (calculée puis relevée), hauteur ponctuelle (rattachée à la Chambre), annuler / rétablir en base, affichée au métré.
6. Exports : CSV (valeurs exactes), contrat GP (m / m² / m³, sans prix), impression.
7. Versioning : gel → métré figé, hauteur modifiée sans effet, refus d'ajustement, badge ; projeté dérivé (29,24 m³ à 2,70 m, ajustements non copiés) ; cloison à déposer (éditeur) ; synthèse existant / dépose.
8. Sécurité : autre tenant (4 RPC, lecture), écriture directe invalide refusée, page Métré sans données.
9. Tablette (§22).
10–12. Performances 50 / 200 / 500 pièces.

### 17.3 Échecs pgTAP préexistants (identiques Lots 4 → 8)
`platform_stripe_state_attestation_r72` (stub `pgsodium`, 14/30), 7 fichiers `studio_*` (fixture), `elsatia_tools_cloud_sync_entitlement_closure_v1` (GRANT `service_role` du banc). Aucun ne touche Relevé.

### 17.4 Commandes rejouables

```text
scripts/local-postgres-bootstrap/rebuild_db.sh lot8_fresh                        → 350 migrations OK
cd supabase/tests && pg_prove -d lot8_fresh elsatia_tools_releve_metre_*.test.sql → 583/583
cd supabase/tests && pg_prove -d lot8_fresh *.test.sql                           → 144 fichiers, 9 KO connus
npx vitest run ; (apps/tools) npx vitest run ; npx tsc --noEmit ; (apps/tools) npx tsc --noEmit ; (apps/tools) npm run lint
node scripts/verify-migrations.mjs                                               → 350 valides
(apps/tools, NEXT_PUBLIC_TOOLS_ENV=local …) npm run build ; npm run build:native ; (racine) npm run build:gestion-pro
scripts/local-postgres-bootstrap/releve_e2e_stack.sh + (apps/tools) next dev --webpack -p 3020
  + npx playwright test tests/e2e/tools-releve-lot8.spec.ts --project=desktop-chromium                     → 12/12
  + npx playwright test tests/e2e/tools-releve-lot{6,7}.spec.ts --project=desktop-chromium                 → 31/31
  + npx playwright test tests/e2e/tools-releve-lot{2,3,4,5}.spec.ts tests/e2e/tools-atelier-lot5-nonregression.spec.ts --project=desktop-chromium → 52/52
```

## 18. Tablette (§22)

MOBILE EMULATED ONLY. 820×1180 tactile : onglet au toucher, totaux lisibles, carte de pièce ouverte au toucher, **aucun débordement horizontal** (avant et après ouverture et saisie), cibles ≥ 40 px, ajustement du volume au doigt, revêtement BA13 « Nouveau » ajouté, cote posée au doigt sur le plan projeté (rattachée à la Chambre).

## 19. Non-régression

| Rejoué | Résultat |
|---|---|
| pgTAP Lots 2–7 (10 fichiers) | 516 / 516 sur la base Lot 8 — **un test adapté** (D9) |
| Playwright Lots 2, 3, 4, 5, Atelier | 52 / 52 |
| Playwright Lots 6, 7 | 31 / 31 |
| Vitest Lots 2–7 | inchangés, verts (ajouts seulement) |
| Fiche pièce | section « Métré calculé » (Lot 3) conservée ; « Métré de la pièce (plan) » ajoutée |

## 20. DECISION_REQUIRED (choix conservateurs retenus)

| # | Sujet | Choix |
|---|---|---|
| D1 | Branche | branche de session repositionnée en avance rapide sur le Lot 7 |
| D2 | Modèle | cotes = éléments `mesure`, revêtements = éléments `materiau` (existants) rattachés au plan ; une table d'audit ; aucune colonne de pièce alimentée (`surface_calculee_mm2` reste protégée, proposition Lot 6 non levée) |
| D3 | Surface nette de sol | = brute ; toute déduction de sol passe par un ajustement tracé |
| D4 | Périmètre utile | déduit : porte, porte-fenêtre, passage ; baie / trémie seulement à allège 0 ; fenêtre jamais |
| D5 | Hauteur | pièce, sinon étage ; jamais la hauteur des murs (défaut éditeur 2,50 m) ; sinon non calculable |
| D6 | Plan dérivé | cotes et revêtements copiés, ajustements **non** copiés (ils portaient sur une autre géométrie) |
| D7 | Plans figés avant le Lot 8 | recalculés à la lecture, signalés comme tels (la garde interdit d'écrire leur métré) |
| D8 | PDF | impression navigateur (feuille de style), pas de génération serveur |
| D9 | Test pgTAP Lot 5 « M2 » | vérifiait qu'un `materiau` ne peut PAS appartenir à un plan — ce que le Lot 8 ouvre ; adapté avec un type toujours exclu (`quantite`), même code |
| D10 | Petites ouvertures | seuil par plan, saisi par l'utilisateur, aucun défaut ; seuil sur la surface totale de l'ouverture |
| D11 | Zone de mur | tronçon exprimé le long de l'axe du mur depuis A (même repère que les ouvertures), prérempli avec la face de la pièce |
| D12 | Surfaces de murs du projeté (dépose / neuf) | longueur × hauteur **du mur** (attribut explicite du mur) ; nombre de murs sans hauteur signalé |

## 21. Limites réelles

| Sujet | État |
|---|---|
| Appareils physiques, Safari / WebKit iOS | **non testés** (MOBILE EMULATED ONLY) |
| Plafonds inclinés / rampants | non pris en charge (documenté, hauteurs ponctuelles affichées) |
| Vue Métré sur très gros relevés | lecture de structure du Lot 2/3 : 2,9 s pour 752 pièces (RLS ligne à ligne) — RPC de structure proposée |
| Cotes manuelles | points non déplaçables à la poignée (supprimer / reposer) ; non liées aux murs (elles ne les suivent pas) |
| Chiffrage / devis GP | non construit ; contrat de données préparé, non transmis |
| Performances | `next dev`, pile locale — à remesurer en build de production / Preview |
